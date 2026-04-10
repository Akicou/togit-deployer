import { query } from '../db/client.js';
import { getLatestRelease, getLatestCommit, getLastDeployedRef, GitHubAuthError, clearRepoCache } from '../github/api.js';
import { decryptAccessToken } from '../github/oauth.js';
import { deploy, acquireDeployLock, releaseDeployLock } from './deployer.js';
import { logSystem, logError, logWarn } from '../logger/index.js';
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

async function getFallbackPAT(): Promise<string> {
  const result = await query<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'github_pat'`
  );
  if (result.rows.length === 0 || !result.rows[0].value) return '';
  // value is stored as a JSON-encoded encrypted string (e.g. "\"salt:iv:tag:cipher\"")
  const encrypted = typeof result.rows[0].value === 'string'
    ? result.rows[0].value
    : JSON.stringify(result.rows[0].value);
  return decryptAccessToken(encrypted);
}

export async function getRepoAccessToken(repoId: number): Promise<string> {
  const result = await query<{ github_access_token: string }>(
    `SELECT u.github_access_token
     FROM users u
     JOIN repositories r ON r.added_by = u.id
     WHERE r.id = $1`,
    [repoId]
  );

  const userToken = result.rows.length > 0 && result.rows[0].github_access_token
    ? decryptAccessToken(result.rows[0].github_access_token)
    : '';

  if (userToken) return userToken;

  // Fall back to global PAT if user token is unavailable
  return getFallbackPAT();
}

export async function checkForUpdates(repo: Repository, accessTokenOverride?: string): Promise<{ hasUpdate: boolean; ref: string; refType: 'release' | 'commit' }> {
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

  // Check if there's ANY deployment history for this repo
  // If no history exists, skip auto-deployment (first deploy must be manual)
  const hasHistory = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM deployments WHERE repo_id = $1`,
    [repo.id]
  );
  const hasAnyDeployment = hasHistory.rows[0]?.count > 0;

  const accessToken = accessTokenOverride ?? await getRepoAccessToken(repo.id);

  if (repo.deploy_mode === 'release') {
    // Check for new releases
    const latestRelease = await getLatestRelease(repo.owner, repo.name, accessToken, repo.watch_branch);

    if (!latestRelease) {
      return { hasUpdate: false, ref: '', refType: 'release' };
    }

    const lastDeployed = await getLastDeployedRef(repo.id);

    if (!lastDeployed) {
      // No running deployment - only auto-deploy if there's history (not first deploy)
      if (!hasAnyDeployment) {
        logSystem(`Skipping ${repo.full_name} - no deployment history (first deploy must be manual)`);
        return { hasUpdate: false, ref: '', refType: 'release' };
      }
      // Has history but no running deployment - trigger deploy
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
      // No running deployment - only auto-deploy if there's history (not first deploy)
      if (!hasAnyDeployment) {
        logSystem(`Skipping ${repo.full_name} - no deployment history (first deploy must be manual)`);
        return { hasUpdate: false, ref: '', refType: 'commit' };
      }
      // Has history but no running deployment - trigger deploy
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
            clearRepoCache(repo.owner, repo.name);
            await deploy(repo, ref, refType, null, repoEnvVars);
          } finally {
            releaseDeployLock(repo.id);
          }
        }
      } catch (error) {
        if (error instanceof GitHubAuthError) {
          // OAuth token invalid — retry once with the global fallback PAT
          const fallback = await getFallbackPAT();
          if (fallback) {
            logWarn(
              `OAuth token invalid for ${repo.full_name}, retrying with fallback PAT`,
              { repo_id: repo.id }
            );
            try {
              const { hasUpdate, ref, refType } = await checkForUpdates(repo, fallback);
              if (hasUpdate) {
                const hasLock = await acquireDeployLock(repo.id);
                if (hasLock) {
                  try {
                    const repoEnvVars = typeof repo.deployment_env_vars === 'string'
                      ? JSON.parse(repo.deployment_env_vars)
                      : (repo.deployment_env_vars || {});
                    clearRepoCache(repo.owner, repo.name);
                    await deploy(repo, ref, refType, null, repoEnvVars);
                  } finally {
                    releaseDeployLock(repo.id);
                  }
                }
              }
            } catch (retryError) {
              const msg = retryError instanceof Error ? retryError.message : String(retryError);
              logError(`Fallback PAT also failed for ${repo.full_name}: ${msg}`, { repo_id: repo.id });
            }
          } else {
            logWarn(`Auth failed for ${repo.full_name}: ${error.message}`, { repo_id: repo.id });
          }
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logError(`Error checking repo ${repo.full_name}: ${errorMessage}`, { repo_id: repo.id });
        }
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
