import { query } from '../db/client.js';
import { getLatestRelease, getLatestCommit, getLastDeployedRef } from '../github/api.js';
import { decryptAccessToken } from '../github/oauth.js';
import { deploy, acquireDeployLock, releaseDeployLock } from './deployer.js';
import { logSystem, logError } from '../logger/index.js';
import type { Repository, User } from '../types.js';

let schedulerInterval: Timer | null = null;
let isRunning = false;

async function getPollInterval(): Promise<number> {
  const result = await query<{ value: { poll_interval_seconds: number } }>(
    `SELECT value FROM settings WHERE key = 'poll_interval_seconds'`
  );

  if (result.rows.length > 0) {
    return (result.rows[0].value as { poll_interval_seconds?: number }).poll_interval_seconds || 60;
  }

  return 60;
}

export async function getAllEnabledRepos(): Promise<Repository[]> {
  const result = await query<Repository>(
    `SELECT * FROM repositories WHERE enabled = true ORDER BY created_at ASC`
  );
  return result.rows;
}

export async function getRepoAccessToken(repoId: number): Promise<string> {
  const result = await query<{ github_access_token: string }>(
    `SELECT u.github_access_token 
     FROM users u
     JOIN repositories r ON r.added_by = u.id
     WHERE r.id = $1`,
    [repoId]
  );

  if (result.rows.length === 0 || !result.rows[0].github_access_token) {
    return '';
  }

  return decryptAccessToken(result.rows[0].github_access_token);
}

export async function checkForUpdates(repo: Repository): Promise<{ hasUpdate: boolean; ref: string; refType: 'release' | 'commit' }> {
  // Skip if a deployment is actively being created (pending/building).
  // 'running' means the app is live and should NOT block future deployments.
  const inProgress = await query<{ id: number }>(
    `SELECT id FROM deployments WHERE repo_id = $1 AND status IN ('pending', 'building') LIMIT 1`,
    [repo.id]
  );
  if (inProgress.rows.length > 0) {
    logSystem(`Skipping ${repo.full_name} - deployment ${inProgress.rows[0].id} already in progress`);
    return { hasUpdate: false, ref: '', refType: 'release' };
  }

  const accessToken = await getRepoAccessToken(repo.id);

  if (repo.deploy_mode === 'release') {
    // Check for new releases
    const latestRelease = await getLatestRelease(repo.owner, repo.name, accessToken, repo.watch_branch);
    
    if (!latestRelease) {
      return { hasUpdate: false, ref: '', refType: 'release' };
    }

    const lastDeployed = await getLastDeployedRef(repo.id);
    
    if (!lastDeployed) {
      // First deploy
      return { hasUpdate: true, ref: latestRelease.tag_name, refType: 'release' };
    }

    if (lastDeployed.ref_type !== 'release') {
      return { hasUpdate: true, ref: latestRelease.tag_name, refType: 'release' };
    }

    // Compare tags (simple string comparison, could be improved with semver)
    const hasUpdate = latestRelease.tag_name !== lastDeployed.ref;
    return { hasUpdate, ref: latestRelease.tag_name, refType: 'release' };

  } else {
    // Check for new commits
    const latestCommit = await getLatestCommit(repo.owner, repo.name, accessToken, repo.watch_branch);
    
    if (!latestCommit) {
      return { hasUpdate: false, ref: '', refType: 'commit' };
    }

    const lastDeployed = await getLastDeployedRef(repo.id);
    
    if (!lastDeployed) {
      // First deploy
      return { hasUpdate: true, ref: latestCommit.sha, refType: 'commit' };
    }

    if (lastDeployed.ref_type !== 'commit') {
      return { hasUpdate: true, ref: latestCommit.sha, refType: 'commit' };
    }

    const hasUpdate = latestCommit.sha !== lastDeployed.ref;
    return { hasUpdate, ref: latestCommit.sha, refType: 'commit' };
  }
}

export async function runSchedulerTick(): Promise<void> {
  if (isRunning) {
    logSystem('Scheduler tick skipped - previous tick still running');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const repos = await getAllEnabledRepos();
    logSystem(`Scheduler checking ${repos.length} repositories`);

    for (const repo of repos) {
      try {
        const { hasUpdate, ref, refType } = await checkForUpdates(repo);

        if (hasUpdate) {
          logSystem(`New ${refType} detected for ${repo.full_name}: ${ref}`);
          
          // Acquire per-repo deploy lock to prevent concurrent deploys
          const hasLock = await acquireDeployLock(repo.id);
          if (!hasLock) {
            logSystem(`Skipping ${repo.full_name} — deploy already in progress`);
            continue;
          }
          
          try {
            const repoEnvVars = typeof repo.deployment_env_vars === 'string'
              ? JSON.parse(repo.deployment_env_vars)
              : (repo.deployment_env_vars || {});
            await deploy(repo, ref, refType, null, repoEnvVars);
          } finally {
            releaseDeployLock(repo.id);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(`Error checking repo ${repo.full_name}: ${errorMessage}`, { repo_id: repo.id });
      }
    }

    const duration = Date.now() - startTime;
    logSystem(`Scheduler tick completed in ${duration}ms`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`Scheduler tick failed: ${errorMessage}`);
  } finally {
    isRunning = false;
  }
}

export async function startScheduler(): Promise<void> {
  const interval = await getPollInterval();
  
  logSystem(`Starting scheduler with ${interval}s interval`);

  // Run immediately
  runSchedulerTick();

  // Then run on interval
  schedulerInterval = setInterval(runSchedulerTick, interval * 1000);
}

export async function stopScheduler(): Promise<void> {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logSystem('Scheduler stopped');
  }
}

export async function restartScheduler(): Promise<void> {
  await stopScheduler();
  await startScheduler();
}

export function isSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}
