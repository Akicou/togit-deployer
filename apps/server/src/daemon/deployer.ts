import Docker from 'dockerode';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { query } from '../db/client.js';
import { logBuild, logDocker, logSystem, logError } from '../logger/index.js';
import { startTunnel, stopTunnel } from './localtonet.js';
import { rollbackRepo } from './rollback.js';
import { decryptAccessToken } from '../github/oauth.js';
import type { Repository, Deployment, User } from '../types.js';

const docker = new Docker();

const TEMP_DIR = '/tmp/togit';
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Clean up interrupted builds and stale containers on startup
export async function cleanupInterruptedBuilds(): Promise<void> {
  logSystem('Cleaning up interrupted deployments...');

  try {
    // Find all deployments stuck in 'building' or 'running' state
    const staleDeployments = await query<Deployment>(
      `SELECT * FROM deployments 
       WHERE status IN ('building', 'running') 
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
      if (deployment.tunnel_url) {
        try {
          await stopTunnel(deployment.localtonet_tunnel_id || deployment.id.toString());
          logSystem(`Stopped tunnel for stale deployment ${deployment.id}`);
          console.log(`Stopped tunnel for stale deployment ${deployment.id}`);
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

    logSystem(`Cleanup completed. Processed ${staleDeployments.rows.length} stale deployment(s).`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError(`Cleanup failed: ${errorMsg}`);
  }
}

function sanitizeRef(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 128);
}

export async function checkDockerRunning(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

export async function deploy(
  repo: Repository,
  ref: string,
  refType: 'release' | 'commit',
  triggeredBy?: User | null,
  deployEnvVars: Record<string, string> = {}
): Promise<Deployment> {
  logSystem(`Starting deployment: ${repo.full_name} @ ${ref}`, { repo_id: repo.id });

  // Merge repo-level env vars with deployment-level env vars
  // Deployment-level vars take precedence over repo-level vars
  const mergedEnvVars: Record<string, string> = {
    ...(repo.deployment_env_vars || {}),
    ...deployEnvVars,
  };

  // Insert deployment record with env vars
  const insertResult = await query<Deployment>(
    `INSERT INTO deployments (repo_id, triggered_by, ref, ref_type, status, env_vars)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING *`,
    [repo.id, triggeredBy?.id || null, ref, refType, JSON.stringify(mergedEnvVars)]
  );

  const deployment = insertResult.rows[0];
  const sanitizedRef = sanitizeRef(ref);
  const imageName = `togit-${repo.id}-${sanitizedRef}`;
  const containerName = `togit-${repo.id}`;

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

    // Stop existing container for this repo
    await stopExistingContainer(containerName);

    // Run container with merged env vars
    await logDocker(`Starting container: ${containerName}`, { deployment_id: deployment.id, repo_id: repo.id });
    const container = await runContainer(imageName, containerName, mergedEnvVars);

    // Get container info to find exposed port
    const containerInfo = await docker.getContainer(container.id).inspect() as any;
    const hostPort = getExposedPort(containerInfo);

    if (!hostPort) {
      throw new Error('Could not determine container exposed port');
    }

    await logDocker(`Container started on host port ${hostPort}`, { deployment_id: deployment.id, repo_id: repo.id });

    // Start Localtonet tunnel
    const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
    if (!authToken) {
      throw new Error('LOCALTONET_AUTH_TOKEN is not configured');
    }

    const { tunnelId, tunnelUrl } = await startTunnel(deployment.id, hostPort, authToken);

    await query(
      `UPDATE deployments
       SET status = 'running', container_id = $1, tunnel_url = $2, tunnel_port = $3, localtonet_tunnel_id = $4, finished_at = NOW()
       WHERE id = $5`,
      [container.id, tunnelUrl, hostPort, tunnelId, deployment.id]
    );

    logSystem(`Deployment ${deployment.id} completed successfully: ${tunnelUrl}`, {
      deployment_id: deployment.id,
      repo_id: repo.id,
    });

    fs.rmSync(cloneDir, { recursive: true, force: true });

    return { ...deployment, status: 'running', container_id: container.id, tunnel_url: tunnelUrl, tunnel_port: hostPort };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await query(
      `UPDATE deployments SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`,
      [errorMessage, deployment.id]
    );

    await logError(`Deployment failed: ${errorMessage}`, { deployment_id: deployment.id, repo_id: repo.id });

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
  return new Promise((resolve, reject) => {
    // Optimized build options for faster builds
    docker.buildImage(
      context,
      { 
        t: imageName,
        rm: true,              // Remove intermediate containers
        dockerfile: 'Dockerfile',
        buildargs: {},
        pull: false,           // Don't pull base image unless missing
        nocache: false,        // Use cache
        cachefrom: [imageName], // Use existing image as cache source
        platform: 'linux/amd64',
        shmsize: 536870912,    // 512MB shared memory for faster builds
      },
      (err, stream) => {
        if (err) { 
          logError(`Docker build stream error: ${err.message}`, { deployment_id: deploymentId, repo_id: repoId });
          reject(err); 
          return; 
        }
        if (!stream) { 
          logError('No stream from Docker build', { deployment_id: deploymentId, repo_id: repoId });
          reject(new Error('No stream from Docker build')); 
          return; 
        }

        let buildSuccess = false;
        let buildError: Error | null = null;
        let startTime = Date.now();

        logBuild(`Starting optimized Docker build for ${imageName}...`, { deployment_id: deploymentId, repo_id: repoId });

        docker.modem.followProgress(
          stream,
          (err) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            if (err) {
              const errorMsg = `Docker build failed after ${duration}s: ${err.message}`;
              logError(errorMsg, { deployment_id: deploymentId, repo_id: repoId });
              reject(err);
            } else if (buildSuccess) {
              logBuild(`✅ Docker build completed in ${duration}s: ${imageName}`, { deployment_id: deploymentId, repo_id: repoId });
              resolve();
            } else if (buildError) {
              reject(buildError);
            } else {
              logBuild(`Docker build completed in ${duration}s`, { deployment_id: deploymentId, repo_id: repoId });
              resolve();
            }
          },
          (event) => {
            // Log all build events verbosely
            if (event.stream) {
              const lines = event.stream.trim().split('\n');
              for (const line of lines) {
                if (line && !line.includes('Using cache')) logBuild(line, { deployment_id: deploymentId, repo_id: repoId });
                else if (line.includes('Using cache')) logBuild('⚡ ' + line, { deployment_id: deploymentId, repo_id: repoId });
              }
            }
            if (event.error) {
              buildError = new Error(event.error);
              logError(`Docker build error: ${event.error}`, { deployment_id: deploymentId, repo_id: repoId });
            }
            if (event.status === 'Build complete' || (event.aux && event.aux.ID)) {
              buildSuccess = true;
            }
          }
        );
      }
    );
  });
}

async function stopExistingContainer(containerName: string): Promise<void> {
  try {
    const existingContainer = docker.getContainer(containerName);
    await existingContainer.stop();
    await existingContainer.remove();
    logDocker(`Stopped and removed existing container: ${containerName}`);
  } catch (err: unknown) {
    if (err instanceof Error && !err.message.includes('No such container')) throw err;
  }
}

async function runContainer(
  imageName: string,
  containerName: string,
  envVars: Record<string, string>
): Promise<{ id: string }> {
  const envArray = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);

  const container = await docker.createContainer({
    Image: imageName,
    name: containerName,
    Env: envArray,
    ExposedPorts: { '3000/tcp': {}, '80/tcp': {}, '8080/tcp': {} },
    HostConfig: {
      PortBindings: {
        '3000/tcp': [{ HostPort: '' }],
        '80/tcp': [{ HostPort: '' }],
        '8080/tcp': [{ HostPort: '' }],
      },
      RestartPolicy: { Name: 'unless-stopped' },
      PublishAllPorts: true,
    },
  });

  await container.start();
  return { id: container.id };
}

function getExposedPort(containerInfo: any): number | null {
  const ports = containerInfo?.NetworkSettings?.Ports || {};
  const commonPorts = ['3000', '80', '8080', '5000', '8000'];

  for (const port of commonPorts) {
    const portKey = `${port}/tcp`;
    if (ports[portKey]?.length > 0) {
      return parseInt(ports[portKey][0].HostPort, 10);
    }
  }

  for (const [, binding] of Object.entries(ports)) {
    if (binding && Array.isArray(binding) && binding.length > 0) {
      return parseInt((binding as any)[0].HostPort, 10);
    }
  }

  return null;
}

export async function stopContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop();
    await container.remove();
    logDocker(`Stopped container: ${containerId}`);
  } catch (err: unknown) {
    if (err instanceof Error && !err.message.includes('No such container')) throw err;
  }
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
