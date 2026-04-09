import Docker from 'dockerode';
import { spawn } from 'child_process';
import path from 'path';

import fs from 'fs';
import { query } from '../db/client.js';
import { logBuild, logDocker, logNetwork, logSystem, logError } from '../logger/index.js';
import { startTunnel, stopTunnel } from './localtonet.js';
import { rollbackRepo } from './rollback.js';
import { getLastDeployedRef } from '../github/api.js';
import { decryptAccessToken } from '../github/oauth.js';
import type { Repository, Deployment, User } from '../types.js';

const docker = new Docker();

// Ensure temp directory exists
const TEMP_DIR = '/tmp/togit';
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function sanitizeRef(ref: string): string {
  // Docker tags can only contain alphanumeric, underscore, hyphen, and colon
  // Replace problematic characters
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
  triggeredBy?: User | null
): Promise<Deployment> {
  logSystem(`Starting deployment: ${repo.full_name} @ ${ref}`, { repo_id: repo.id });

  // Insert deployment record
  const insertResult = await query<Deployment>(
    `INSERT INTO deployments (repo_id, triggered_by, ref, ref_type, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [repo.id, triggeredBy?.id || null, ref, refType]
  );

  const deployment = insertResult.rows[0];
  const sanitizedRef = sanitizeRef(ref);
  const imageName = `togit-${repo.id}-${sanitizedRef}`;
  const containerName = `togit-${repo.id}`;

  try {
    // Update status to building
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

    // Run container
    await logDocker(`Starting container: ${containerName}`, { deployment_id: deployment.id, repo_id: repo.id });

    const container = await runContainer(imageName, containerName);

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

    // Update deployment status
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

    // Cleanup temp directory
    fs.rmSync(cloneDir, { recursive: true, force: true });

    return { ...deployment, status: 'running', container_id: container.id, tunnel_url: tunnelUrl, tunnel_port: hostPort };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await query(
      `UPDATE deployments SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`,
      [errorMessage, deployment.id]
    );

    await logError(`Deployment failed: ${errorMessage}`, { deployment_id: deployment.id, repo_id: repo.id });

    // Trigger rollback
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

    const proc = spawn('git', args, { timeout: 300000 }); // 5 minute timeout

    proc.stdout?.on('data', (data) => {
      logBuild(data.toString().trim(), { repo_id: repo.id });
    });

    proc.stderr?.on('data', (data) => {
      logBuild(data.toString().trim(), { repo_id: repo.id });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git clone failed with code ${code}`));
      }
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
    docker.buildImage(context, {
      t: imageName,
      rm: true,
    }, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      if (!stream) {
        reject(new Error('No stream from Docker build'));
        return;
      }

      docker.modem.followProgress(
        stream,
        (err, output) => {
          if (err) {
            reject(err);
          } else {
            logBuild(`Docker build completed: ${imageName}`, { deployment_id: deploymentId, repo_id: repoId });
            resolve();
          }
        },
        (event) => {
          if (event.stream) {
            logBuild(event.stream.trim(), { deployment_id: deploymentId, repo_id: repoId });
          } else if (event.error) {
            logBuild(`Docker build error: ${event.error}`, { deployment_id: deploymentId, repo_id: repoId });
          }
        }
      );
    });
  });
}

async function stopExistingContainer(containerName: string): Promise<void> {
  try {
    const existingContainer = docker.getContainer(containerName);
    await existingContainer.stop();
    await existingContainer.remove();
    logDocker(`Stopped and removed existing container: ${containerName}`);
  } catch (err: unknown) {
    // Container doesn't exist, which is fine
    if (err instanceof Error && !err.message.includes('No such container')) {
      throw err;
    }
  }
}

async function runContainer(imageName: string, containerName: string): Promise<{ id: string }> {
  const container = await docker.createContainer({
    Image: imageName,
    name: containerName,
    ExposedPorts: {
      '3000/tcp': {},
      '80/tcp': {},
      '8080/tcp': {},
    },
    HostConfig: {
      PortBindings: {
        '3000/tcp': [{ HostPort: '' }],  // Let Docker assign random port
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
  
  // Check common ports
  const commonPorts = ['3000', '80', '8080', '5000', '8000'];
  
  for (const port of commonPorts) {
    const portKey = `${port}/tcp`;
    if (ports[portKey] && ports[portKey]?.length > 0) {
      return parseInt(ports[portKey]![0].HostPort, 10);
    }
  }

  // If no common port found, return first available
  for (const [key, binding] of Object.entries(ports)) {
    if (binding && Array.isArray(binding) && binding.length > 0) {
      return parseInt(binding[0].HostPort, 10);
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
    if (err instanceof Error && !err.message.includes('No such container')) {
      throw err;
    }
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
