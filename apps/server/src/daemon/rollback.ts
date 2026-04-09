import { query } from '../db/client.js';
import { logSystem, logError } from '../logger/index.js';
import { deploy, acquireDeployLock, releaseDeployLock, rollbackingRepos } from './deployer.js';
import { stopContainer } from './deployer.js';
import { stopTunnel } from './localtonet.js';
import type { Repository, Deployment } from '../types.js';

export async function rollbackRepo(repo: Repository): Promise<Deployment | null> {
  // Prevent infinite rollback loops
  if (rollbackingRepos.has(repo.id)) {
    logError(`Rollback already in progress for ${repo.full_name}. Skipping to prevent infinite loop.`);
    return null;
  }

  rollbackingRepos.add(repo.id);

  logSystem(`Starting rollback for repository: ${repo.full_name}`, { repo_id: repo.id });

  // Find the last successful deployment
  const lastDeploymentResult = await query<Deployment>(
    `SELECT * FROM deployments 
     WHERE repo_id = $1 AND status = 'running'
     ORDER BY started_at DESC
     LIMIT 1`,
    [repo.id]
  );

  if (lastDeploymentResult.rows.length === 0) {
    logSystem(`No running deployment found for rollback: ${repo.full_name}`, { repo_id: repo.id });
    rollbackingRepos.delete(repo.id);
    return null;
  }

  const lastDeployment = lastDeploymentResult.rows[0];

  // If current failed deployment has a container, stop it
  const failedDeploymentResult = await query<Deployment>(
    `SELECT * FROM deployments 
     WHERE repo_id = $1 AND status = 'failed'
     ORDER BY started_at DESC
     LIMIT 1`,
    [repo.id]
  );

  if (failedDeploymentResult.rows.length > 0) {
    const failedDeployment = failedDeploymentResult.rows[0];
    
    // Stop the tunnel for failed deployment — pass correct args now
    const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
    if (failedDeployment.localtonet_tunnel_id) {
      try {
        await stopTunnel(failedDeployment.localtonet_tunnel_id, authToken);
      } catch (err) {
        console.error(`Failed to stop tunnel ${failedDeployment.localtonet_tunnel_id}:`, err);
      }
    }

    // Stop container if exists
    if (failedDeployment.container_id) {
      try {
        await stopContainer(failedDeployment.container_id);
      } catch (err) {
        console.error(`Failed to stop container ${failedDeployment.container_id}:`, err);
      }
    }

    // Mark as rolled back
    await query(
      `UPDATE deployments SET status = 'rolled_back' WHERE id = $1`,
      [failedDeployment.id]
    );
  }

  // Re-deploy the last working version
  try {
    logSystem(
      `Rolling back ${repo.full_name} to ${lastDeployment.ref}`,
      { repo_id: repo.id }
    );

    const rolledBackDeployment = await deploy(
      repo,
      lastDeployment.ref,
      lastDeployment.ref_type as 'release' | 'commit',
      null,
      typeof lastDeployment.env_vars === 'string'
        ? JSON.parse(lastDeployment.env_vars)
        : (lastDeployment.env_vars || {})
    );

    logSystem(
      `Rollback successful: ${repo.full_name} is now running ${lastDeployment.ref}`,
      { repo_id: repo.id }
    );

    return rolledBackDeployment;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`Rollback failed: ${errorMessage}`, { repo_id: repo.id });
    throw error;
  } finally {
    rollbackingRepos.delete(repo.id);
  }
}

export async function getLastRunningDeployment(repoId: number): Promise<Deployment | null> {
  const result = await query<Deployment>(
    `SELECT * FROM deployments 
     WHERE repo_id = $1 AND status = 'running'
     ORDER BY started_at DESC
     LIMIT 1`,
    [repoId]
  );

  return result.rows[0] || null;
}
