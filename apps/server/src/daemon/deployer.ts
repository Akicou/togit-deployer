import Docker from 'dockerode';
import { spawn } from 'child_process';
import * as net from 'net';
import path from 'path';
import fs from 'fs';
import { query } from '../db/client.js';
import { logBuild, logDocker, logSystem, logError } from '../logger/index.js';
import { createTunnel, startTunnel } from './localtonet.js';
import { rollbackRepo } from './rollback.js';
import { decryptAccessToken } from '../github/oauth.js';
import type { Repository, Deployment, User } from '../types.js';

const docker = new Docker();

const TEMP_DIR = '/tmp/togit';
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Deployment queue: prevents simultaneous deploys for the same repo
const activeDeploys = new Map<number, boolean>();

// Track if we're already in a rollback to prevent infinite rollback loops
export const rollbackingRepos = new Set<number>();

/**
 * Acquire a deploy lock for a repo. Returns false if already deploying.
 */
export async function acquireDeployLock(repoId: number): Promise<boolean> {
  if (activeDeploys.has(repoId)) return false;
  activeDeploys.set(repoId, true);
  return true;
}

export function releaseDeployLock(repoId: number): void {
  activeDeploys.delete(repoId);
}

// Clean up interrupted builds and stale containers on startup
export async function cleanupInterruptedBuilds(): Promise<void> {
  logSystem('Cleaning up interrupted deployments...');

  try {
    // Find all deployments stuck in 'building' or 'running' state
    const staleDeployments = await query<Deployment>(
      `SELECT * FROM deployments 
       WHERE status IN ('building', 'pending') 
       ORDER BY id DESC`
    );

    for (const deployment of staleDeployments.rows) {
      logSystem(`Cleaning up stale deployment ${deployment.id} (status: ${deployment.status})`);

      // Stop and remove container if it exists
      if (deployment.container_id) {
        try {
          const container = docker.getContainer(deployment.container_id);
          const containerInfo = await container.inspect() as any;
          
          if (containerInfo.State.Running) {
            await container.stop();
            logSystem(`Stopped container ${deployment.container_id} from stale deployment ${deployment.id}`);
          }
          
          await container.remove();
          logSystem(`Removed container ${deployment.container_id} from stale deployment ${deployment.id}`);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (!errorMsg.includes('No such container')) {
            logSystem(`Could not remove container ${deployment.container_id}: ${errorMsg}`);
          }
        }
      }

      // Stop Localtonet tunnel if it exists
      if (deployment.localtonet_tunnel_id) {
        try {
          const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
          await stopTunnel(deployment.localtonet_tunnel_id, authToken);
          logSystem(`Stopped tunnel ${deployment.localtonet_tunnel_id} for stale deployment ${deployment.id}`);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logSystem(`Could not stop tunnel for deployment ${deployment.id}: ${errorMsg}`);
        }
      }

      // Update deployment status to failed
      await query(
        `UPDATE deployments 
         SET status = 'failed', 
             error_message = $1, 
             finished_at = NOW()
         WHERE id = $2`,
        ['Deployment interrupted by server restart', deployment.id]
      );
    }

    // Clean up temporary clone directories from interrupted builds
    if (fs.existsSync(TEMP_DIR)) {
      const entries = fs.readdirSync(TEMP_DIR);
      for (const entry of entries) {
        const fullPath = path.join(TEMP_DIR, entry);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          logSystem(`Cleaned up temp directory ${fullPath}`);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logSystem(`Could not clean up temp directory ${fullPath}: ${errorMsg}`);
        }
      }
    }

    // Clean up orphaned containers (containers without a matching deployment)
    await cleanupOrphanedContainers();

    // Clean up old Docker images to prevent disk buildup
    await cleanupOldImages();

    logSystem(`Cleanup completed. Processed ${staleDeployments.rows.length} stale deployment(s).`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError(`Cleanup failed: ${errorMsg}`);
  }
}

/**
 * Find and remove containers prefixed with "togit-" that have no matching
 * running deployment in the DB.
 */
async function cleanupOrphanedContainers(): Promise<void> {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: ['togit-'] },
    });

    for (const containerInfo of containers) {
      const name = containerInfo.Names?.[0] || '';
      // name is like "/togit-123" or "/togit-123-backend"
      const match = name.match(/^\/togit-(\d+)(?:-[^/]+)?$/);
      if (!match) continue;

      const repoId = parseInt(match[1], 10);
      // Check if there's a running deployment for this repo
      const result = await query<{ id: number }>(
        `SELECT id FROM deployments WHERE repo_id = $1 AND status = 'running' LIMIT 1`,
        [repoId]
      );

      if (result.rows.length === 0) {
        // Orphaned container — remove it
        try {
          const container = docker.getContainer(containerInfo.Id);
          if (containerInfo.State === 'running') {
            await container.stop();
          }
          await container.remove();
          logSystem(`Removed orphaned container: ${name}`);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (!errorMsg.includes('No such container')) {
            logSystem(`Could not clean orphaned container ${name}: ${errorMsg}`);
          }
        }
      }
    }
  } catch (err) {
    logError(`Failed to clean orphaned containers: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Remove Docker images that are older than 7 days and not associated
 * with any running deployment. Prevents disk space buildup over time.
 */
async function cleanupOldImages(): Promise<void> {
  try {
    const images = await docker.listImages({
      filters: {
        reference: ['togit-*'],
      },
    });

    // Get all refs from running deployments
    const runningRefs = await query<{ ref: string }>(
      `SELECT ref FROM deployments WHERE status = 'running'`
    );
    const activeTags = new Set(runningRefs.rows.map(r => r.ref));

    for (const image of images) {
      const tags = image.RepoTags || [];
      // If any tag belongs to an active deployment, skip
      if (tags.some(t => {
        const parts = t.split('-');
        const ref = parts.slice(2).join('-');
        return activeTags.has(ref);
      })) {
        continue;
      }

      // Check age — if Created timestamp is older than 7 days, remove
      const created = image.Created; // Unix timestamp
      const sevenDaysAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
      if (created && created < sevenDaysAgo) {
        try {
          await docker.getImage(image.Id).remove({ force: true });
          logSystem(`Removed old image: ${tags[0] || image.Id}`);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logSystem(`Could not remove old image ${image.Id}: ${errorMsg}`);
        }
      }
    }
  } catch (err) {
    logError(`Failed to clean old images: ${err instanceof Error ? err.message : err}`);
  }
}

function sanitizeRef(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_.-]/g, '-').substring(0, 128);
}

function spawnCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; onOutput?: (line: string) => void } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: opts.cwd });
    let stdout = '';
    const emit = (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (opts.onOutput) {
        for (const line of text.split('\n')) {
          if (line.trim()) opts.onOutput(line.trim());
        }
      }
    };
    proc.stdout?.on('data', emit);
    proc.stderr?.on('data', emit);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${cmd} ${args[0]} exited with code ${code}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

/**
 * Assign a fixed host port to the repo for Docker port mapping.
 * Ports are allocated from 10000 upward. Returns the existing port if already set.
 */
async function assignTunnelPort(repoId: number, existing: number | null): Promise<number> {
  if (existing !== null) return existing;
  const { rows } = await query<{ max: number }>(`SELECT COALESCE(MAX(tunnel_port), 9999) AS max FROM repositories`);
  const port = rows[0].max + 1;
  await query(`UPDATE repositories SET tunnel_port = $1 WHERE id = $2 AND tunnel_port IS NULL`, [port, repoId]);
  const { rows: fresh } = await query<{ tunnel_port: number }>(`SELECT tunnel_port FROM repositories WHERE id = $1`, [repoId]);
  return fresh[0].tunnel_port;
}

export async function checkDockerRunning(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for a container to become healthy by checking if its
 * exposed port accepts a TCP connection.
 */
async function waitForHealthy(
  hostPort: number,
  maxAttempts = 30,
  intervalMs = 1000
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const s = new net.Socket();
        s.setTimeout(2000);
        s.on('connect', () => { s.destroy(); resolve(); });
        s.on('error', reject);
        s.on('timeout', () => { s.destroy(); reject(new Error('timeout')); });
        s.connect(hostPort, '127.0.0.1');
      });
      await logDocker(`Container healthy on port ${hostPort} after ${attempt + 1} attempts`);
      return true;
    } catch {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  await logDocker(`Container did not become healthy after ${maxAttempts} attempts`);
  return false;
}

export async function deploy(
  repo: Repository,
  ref: string,
  refType: 'release' | 'commit',
  triggeredBy?: User | null,
  deployEnvVars: Record<string, string> = {}
): Promise<Deployment> {
  // Guard against infinite rollback loops
  if (rollbackingRepos.has(repo.id)) {
    throw new Error(`Rollback already in progress for repo ${repo.id}. Aborting to prevent loop.`);
  }

  logSystem(`Starting deployment: ${repo.full_name} @ ${ref}`, { repo_id: repo.id });

  // Merge repo-level env vars with deployment-level env vars
  // Deployment-level vars take precedence over repo-level vars
  const repoEnvVars = typeof repo.deployment_env_vars === 'string'
    ? JSON.parse(repo.deployment_env_vars)
    : (repo.deployment_env_vars || {});

  const mergedEnvVars: Record<string, string> = {
    ...repoEnvVars,
    ...deployEnvVars,
  };

  // Insert deployment record with env vars
  const insertResult = await query<Deployment>(
    `INSERT INTO deployments (repo_id, triggered_by, ref, ref_type, status, env_vars)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING *`,
    [repo.id, triggeredBy?.id || null, ref, refType, mergedEnvVars]
  );

  const deployment = insertResult.rows[0];
  const sanitizedRef = sanitizeRef(ref);
  const serviceName = (repo.service_name || 'app').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const imageName = `togit-${repo.id}-${serviceName}-${sanitizedRef}`;
  const containerName = `togit-${repo.id}-${serviceName}`;

  // Re-fetch repo to get latest tunnel config (container_port, tunnel_port, localtonet_tunnel_id)
  const freshRepoResult = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repo.id]);
  const freshRepo = freshRepoResult.rows[0] || repo;

  try {
    await query('UPDATE deployments SET status = $1 WHERE id = $2', ['building', deployment.id]);
    deployment.status = 'building';

    // Get access token for private repos
    let accessToken = '';
    if (repo.private) {
      const tokenResult = await query<{ github_access_token: string }>(
        'SELECT github_access_token FROM users WHERE id = $1',
        [repo.added_by || 0]
      );
      if (tokenResult.rows[0]?.github_access_token) {
        accessToken = decryptAccessToken(tokenResult.rows[0].github_access_token);
      }
    }

    // Clone repository
    const cloneDir = path.join(TEMP_DIR, deployment.id.toString());
    await logBuild(`Cloning ${repo.full_name} (${refType}: ${ref})...`, { deployment_id: deployment.id, repo_id: repo.id });
    await cloneRepo(repo, ref, accessToken, cloneDir);

    // Check for Dockerfile
    const targetDir = repo.root_path === '/' ? cloneDir : path.join(cloneDir, repo.root_path);
    const dockerfilePath = path.join(targetDir, 'Dockerfile');

    if (!fs.existsSync(dockerfilePath)) {
      throw new Error(`No Dockerfile found in ${repo.root_path === '/' ? 'repository root' : repo.root_path}`);
    }

    // Build Docker image
    await logBuild(`Building Docker image: ${imageName}`, { deployment_id: deployment.id, repo_id: repo.id });
    await buildImage(targetDir, imageName, deployment.id, repo.id);

    // Assign fixed host port for this repo (auto-assigns from 10000 if not set)
    const tunnelPort = await assignTunnelPort(freshRepo.id, freshRepo.tunnel_port ?? null);
    const containerPort = freshRepo.container_port || 3000;

    // Inject PORT env var so apps using process.env.PORT auto-configure
    const envWithPort: Record<string, string> = { PORT: String(containerPort), ...mergedEnvVars };

    // Stop existing container for this repo
    await stopExistingContainer(containerName);

    // Run container with fixed port mapping
    await logDocker(`Starting container: ${containerName} (-p ${tunnelPort}:${containerPort})`, { deployment_id: deployment.id, repo_id: repo.id });
    const container = await runContainer(imageName, containerName, envWithPort, tunnelPort, containerPort);

    // Wait for the container to become healthy on the fixed host port
    await logDocker(`Waiting for container to become healthy on port ${tunnelPort}...`, { deployment_id: deployment.id });
    const isHealthy = await waitForHealthy(tunnelPort);
    if (!isHealthy) {
      throw new Error('Container failed to become healthy within timeout');
    }
    await logDocker(`Container started and healthy on host port ${tunnelPort}`, { deployment_id: deployment.id, repo_id: repo.id });

    // Tunnel: reuse existing or create new
    const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
    if (!authToken) {
      throw new Error('LOCALTONET_AUTH_TOKEN is not configured');
    }

    let tunnelId = freshRepo.localtonet_tunnel_id;
    let tunnelUrl = freshRepo.tunnel_url;

    if (!tunnelId) {
      // First deploy: create the tunnel
      const t = await createTunnel(deployment.id, tunnelPort, authToken, {
        subDomain: freshRepo.tunnel_subdomain || undefined,
      });
      tunnelId = t.tunnelId;
      tunnelUrl = t.tunnelUrl;
      await query(
        `UPDATE repositories SET localtonet_tunnel_id = $1, tunnel_url = $2, tunnel_port = $3 WHERE id = $4`,
        [tunnelId, tunnelUrl, tunnelPort, freshRepo.id]
      );
    }

    // Always start the tunnel (ensures it's routing, even if it was stopped)
    await startTunnel(tunnelId, authToken);
    logSystem(`Tunnel started: ${tunnelUrl}`, { deployment_id: deployment.id, repo_id: repo.id });

    await query(
      `UPDATE deployments
       SET status = 'running', container_id = $1, tunnel_url = $2, tunnel_port = $3, localtonet_tunnel_id = $4, finished_at = NOW()
       WHERE id = $5`,
      [container.id, tunnelUrl, tunnelPort, tunnelId, deployment.id]
    );

    logSystem(`Deployment ${deployment.id} completed successfully: ${tunnelUrl}`, {
      deployment_id: deployment.id,
      repo_id: repo.id,
    });

    // Clean up clone directory
    fs.rmSync(cloneDir, { recursive: true, force: true });

    // Clean up old images while we're at it
    cleanupOldImages().catch(() => {}); // fire-and-forget

    return { ...deployment, status: 'running', container_id: container.id, tunnel_url: tunnelUrl, tunnel_port: tunnelPort };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await query(
      `UPDATE deployments SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`,
      [errorMessage, deployment.id]
    );

    await logError(`Deployment failed: ${errorMessage}`, { deployment_id: deployment.id, repo_id: repo.id });

    // Attempt rollback — but guard against loops
    await rollbackRepo(repo);

    throw error;
  }
}

async function cloneRepo(
  repo: Repository,
  ref: string,
  accessToken: string,
  targetDir: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['clone', '--depth=1', '--branch', ref];

    if (accessToken) {
      args.push(`https://x-access-token:${accessToken}@github.com/${repo.full_name}.git`);
    } else {
      args.push(`https://github.com/${repo.full_name}.git`);
    }

    args.push(targetDir);

    const proc = spawn('git', args, { timeout: 300000 });

    proc.stdout?.on('data', (data) => {
      logBuild(data.toString().trim(), { repo_id: repo.id });
    });

    proc.stderr?.on('data', (data) => {
      logBuild(data.toString().trim(), { repo_id: repo.id });
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git clone failed with code ${code}`));
    });

    proc.on('error', (err) => {
      reject(new Error(`git clone error: ${err.message}`));
    });
  });
}

async function buildImage(
  context: string,
  imageName: string,
  deploymentId: number,
  repoId: number
): Promise<void> {
  const startTime = Date.now();
  await logBuild(`Starting Docker build for ${imageName}...`, { deployment_id: deploymentId, repo_id: repoId });

  await spawnCommand('docker', ['build', '-t', imageName, '.'], {
    cwd: context,
    onOutput: (line) => logBuild(line, { deployment_id: deploymentId, repo_id: repoId }),
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  await logBuild(`✅ Docker build completed in ${duration}s: ${imageName}`, { deployment_id: deploymentId, repo_id: repoId });
}

async function stopExistingContainer(containerName: string): Promise<void> {
  const noop = () => {};
  await spawnCommand('docker', ['stop', containerName]).catch(noop);
  await spawnCommand('docker', ['rm', containerName]).catch(noop);
  logDocker(`Stopped and removed existing container: ${containerName}`);
}

async function runContainer(
  imageName: string,
  containerName: string,
  envVars: Record<string, string>,
  tunnelPort: number,
  containerPort: number
): Promise<{ id: string }> {
  const envArgs = Object.entries(envVars).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const args = [
    'run', '-d',
    '--name', containerName,
    ...envArgs,
    '-p', `${tunnelPort}:${containerPort}`,
    '--restart', 'unless-stopped',
    imageName,
  ];

  const id = await spawnCommand('docker', args);
  return { id };
}


export async function stopContainer(containerId: string): Promise<void> {
  const noop = () => {};
  await spawnCommand('docker', ['stop', containerId]).catch(noop);
  await spawnCommand('docker', ['rm', containerId]).catch(noop);
  logDocker(`Stopped container: ${containerId}`);
}

export async function stopAllTogitContainers(): Promise<void> {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: ['togit-'] },
    });

    for (const containerInfo of containers) {
      const container = docker.getContainer(containerInfo.Id);
      await container.stop();
      await container.remove();
      logDocker(`Stopped container: ${containerInfo.Names?.[0] || containerInfo.Id}`);
    }
  } catch (err) {
    console.error('Error stopping containers:', err);
  }
}

export async function revokeUserSessions(userId: number): Promise<void> {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

/**
 * Clean up images that are no longer referenced by any running deployment.
 * Exposed as a public API endpoint via POST /api/images/prune
 */
export async function pruneUnusedImages(): Promise<{ pruned: number }> {
  const beforeImages = await docker.listImages({
    filters: { reference: ['togit-*'] },
  });

  const runningRefs = await query<{ ref: string }>(
    `SELECT ref FROM deployments WHERE status = 'running'`
  );
  const activeTags = new Set(runningRefs.rows.map(r => r.ref));

  let pruned = 0;
  for (const image of beforeImages) {
    const tags = image.RepoTags || [];
    if (!tags.some(t => {
      const parts = t.split('-');
      const ref = parts.slice(2).join('-');
      return activeTags.has(ref);
    })) {
      try {
        await docker.getImage(image.Id).remove({ force: true });
        pruned++;
      } catch { /* ignore */ }
    }
  }

  logDocker(`Pruned ${pruned} unused images`);
  return { pruned };
}
