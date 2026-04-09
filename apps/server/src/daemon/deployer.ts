import Docker from 'dockerode';
import { spawn } from 'child_process';
import * as net from 'net';
import path from 'path';
import fs from 'fs';
import { query, pool } from '../db/client.js';
import { logBuild, logDocker, logSystem, logError } from '../logger/index.js';
import { createTunnel, startTunnel, updateTunnelPort, stopTunnel } from './localtonet.js';
import type { TunnelType } from './localtonet.js';
import { rollbackRepo } from './rollback.js';
import { decryptAccessToken } from '../github/oauth.js';
import type { Repository, Deployment, User } from '../types.js';
import { parseDockerfileExpose } from './dockerfile-parser.js';

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

  // Restore running deployments
  await restoreRunningDeployments();
}

/**
 * Restore deployments that were running before server restart.
 * Checks if containers are still running and restarts tunnels.
 */
async function restoreRunningDeployments(): Promise<void> {
  try {
    logSystem('Restoring running deployments...');

    const runningDeployments = await query<Deployment>(
      `SELECT * FROM deployments WHERE status = 'running' ORDER BY id DESC`
    );

    if (runningDeployments.rows.length === 0) {
      logSystem('No running deployments to restore');
      return;
    }

    let restored = 0;
    let failed = 0;

    for (const deployment of runningDeployments.rows) {
      try {
        if (!deployment.container_id) {
          // No container ID - mark as failed
          await query(
            `UPDATE deployments SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`,
            ['Missing container ID after server restart', deployment.id]
          );
          failed++;
          continue;
        }

        // Check if container exists and is running
        const container = docker.getContainer(deployment.container_id);
        let containerInfo: any;

        try {
          containerInfo = await container.inspect();
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (errorMsg.includes('No such container')) {
            // Container doesn't exist - mark as failed
            await query(
              `UPDATE deployments SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`,
              ['Container missing after server restart', deployment.id]
            );
            logSystem(`Container ${deployment.container_id} not found for deployment ${deployment.id} - marked as failed`);
            failed++;
            continue;
          }
          throw err;
        }

        if (!containerInfo.State.Running) {
          // Container exists but not running - try to start it
          logSystem(`Restarting stopped container ${deployment.container_id} for deployment ${deployment.id}`);
          await container.start();

          // Wait a bit for it to start
          await new Promise(r => setTimeout(r, 2000));

          // Verify it's running
          const newInfo = await container.inspect() as any;
          if (!newInfo.State.Running) {
            await query(
              `UPDATE deployments SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`,
              ['Container failed to restart after server restart', deployment.id]
            );
            logSystem(`Failed to restart container ${deployment.container_id} for deployment ${deployment.id}`);
            failed++;
            continue;
          }
        }

        // Container is running - restart tunnel if exists
        if (deployment.localtonet_tunnel_id) {
          const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
          if (authToken) {
            try {
              await startTunnel(deployment.localtonet_tunnel_id, authToken);
              logSystem(`Restored tunnel ${deployment.localtonet_tunnel_id} for deployment ${deployment.id}`);
            } catch (err: unknown) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              logSystem(`Warning: Could not restart tunnel for deployment ${deployment.id}: ${errorMsg}`);
              // Don't mark as failed - container is still running
            }
          }
        }

        logSystem(`Restored deployment ${deployment.id} (container: ${deployment.container_id})`);
        restored++;

      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logError(`Failed to restore deployment ${deployment.id}: ${errorMsg}`);
        failed++;
      }
    }

    logSystem(`Restore completed: ${restored} restored, ${failed} failed out of ${runningDeployments.rows.length} total`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError(`Failed to restore running deployments: ${errorMsg}`);
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
 * Check if a port is available on localhost by attempting to bind to it.
 * Returns true if port is free, false if already in use.
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port in use
      } else {
        resolve(false); // Other error, assume not available
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true); // Port is available
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Assign a fixed host port to the repo for Docker port mapping.
 * Ports are allocated from 10000 upward. Returns the existing port if already set.
 */
async function assignTunnelPort(repoId: number, existing: number | null): Promise<number> {
  if (existing !== null) return existing;

  // Use transaction with pessimistic locking to prevent race conditions
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the repositories table to prevent concurrent reads of MAX
    // This ensures atomic read-increment-write
    const maxResult = await client.query<{ max: number }>(
      `SELECT COALESCE(MAX(tunnel_port), 9999) AS max
       FROM repositories
       FOR UPDATE`
    );

    const nextPort = maxResult.rows[0].max + 1;

    // Validate port is in acceptable range (10000-65535)
    if (nextPort > 65535) {
      throw new Error('Port range exhausted (max: 65535)');
    }

    // Update this specific repo with the new port
    await client.query(
      `UPDATE repositories
       SET tunnel_port = $1
       WHERE id = $2 AND tunnel_port IS NULL`,
      [nextPort, repoId]
    );

    await client.query('COMMIT');

    // Verify assignment succeeded
    const verify = await query<{ tunnel_port: number }>(
      `SELECT tunnel_port FROM repositories WHERE id = $1`,
      [repoId]
    );

    return verify.rows[0].tunnel_port;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

    // Parse Dockerfile for port information
    const portInfo = parseDockerfileExpose(dockerfilePath);

    // Fetch current container port configuration
    let containerPort = freshRepo.container_port || 3000;
    const isDefaultPort = containerPort === 3000;

    // Smart port resolution: auto-configure or warn on mismatch
    if (portInfo.recommendedPort !== null) {
      if (isDefaultPort && portInfo.recommendedPort !== 3000) {
        // Auto-configure: user hasn't customized port, Dockerfile specifies different
        await query('UPDATE repositories SET container_port = $1 WHERE id = $2',
                    [portInfo.recommendedPort, freshRepo.id]);
        await logDocker(
          `Auto-detected port ${portInfo.recommendedPort} from Dockerfile EXPOSE directive`,
          { deployment_id: deployment.id, repo_id: repo.id }
        );
        containerPort = portInfo.recommendedPort;
      } else if (containerPort !== portInfo.recommendedPort) {
        // Manual override: warn but respect user's choice
        await logDocker(
          `⚠️  Dockerfile exposes port ${portInfo.recommendedPort} but container_port is ${containerPort}. ` +
          `Using configured port ${containerPort}. If deployment fails, update container_port via PATCH /api/repos/${repo.id}`,
          { deployment_id: deployment.id, repo_id: repo.id }
        );
      }
    }

    if (portInfo.hasEnvVars) {
      await logDocker(
        `⚠️  Dockerfile uses environment variables in EXPOSE. Ensure PORT env var matches container_port=${containerPort}`,
        { deployment_id: deployment.id, repo_id: repo.id }
      );
    }

    // Build Docker image
    await logBuild(`Building Docker image: ${imageName}`, { deployment_id: deployment.id, repo_id: repo.id });
    await buildImage(targetDir, imageName, deployment.id, repo.id);

    // Assign fixed host port for this repo (auto-assigns from 10000 if not set)
    const tunnelPort = await assignTunnelPort(freshRepo.id, freshRepo.tunnel_port ?? null);

    // Verify port is actually available on the system
    const portAvailable = await isPortAvailable(tunnelPort);
    if (!portAvailable) {
      throw new Error(
        `Host port ${tunnelPort} is already in use by another process. ` +
        `This port is assigned to ${repo.full_name}. ` +
        `To resolve: stop the process using this port, or manually update tunnel_port in database.`
      );
    }

    // Inject PORT env var so apps using process.env.PORT auto-configure
    const envWithPort: Record<string, string> = { PORT: String(containerPort), ...mergedEnvVars };

    // Stop existing container for this repo
    await stopExistingContainer(containerName);

    // Run container with fixed port mapping
    await logDocker(`Starting container: ${containerName} (-p 127.0.0.1:${tunnelPort}:${containerPort})`, { deployment_id: deployment.id, repo_id: repo.id });
    const container = await runContainer(imageName, containerName, envWithPort, tunnelPort, containerPort);

    // Wait for the container to become healthy on the fixed host port
    await logDocker(`Waiting for container to become healthy on port ${tunnelPort}...`, { deployment_id: deployment.id });
    const isHealthy = await waitForHealthy(tunnelPort);
    if (!isHealthy) {
      throw new Error(
        `Container failed to become healthy on port ${tunnelPort}. ` +
        `This may indicate the app is listening on a different port inside the container. ` +
        `Current container_port: ${containerPort}. Check your Dockerfile's EXPOSE directive and app configuration.`
      );
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
      // First deploy: create the tunnel using the configured type
      const t = await createTunnel(deployment.id, tunnelPort, authToken, {
        type: (freshRepo as any).tunnel_type as TunnelType || 'random',
        subDomain: freshRepo.tunnel_subdomain || undefined,
        domain: (freshRepo as any).tunnel_domain || undefined,
      });
      tunnelId = t.tunnelId;
      tunnelUrl = t.tunnelUrl;
      await query(
        `UPDATE repositories SET localtonet_tunnel_id = $1, tunnel_url = $2, tunnel_port = $3 WHERE id = $4`,
        [tunnelId, tunnelUrl, tunnelPort, freshRepo.id]
      );
    } else {
      // Reuse existing tunnel — ensure it points to the current host port
      await updateTunnelPort(tunnelId, tunnelPort, authToken).catch((err) =>
        logDocker(`Could not update tunnel port (non-fatal): ${err.message}`)
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
    '-p', `127.0.0.1:${tunnelPort}:${containerPort}`,
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
