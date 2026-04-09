import { query } from '../db/client.js';
import type { Deployment, Repository, User } from '../types.js';

export async function getDeployment(req: Request, deploymentId: number): Promise<Response> {
  const result = await query<Deployment & { repo_name: string; repo_full_name: string; triggered_by_login: string | null }>(
    `SELECT d.*, 
            r.name as repo_name, 
            r.full_name as repo_full_name,
            u.github_login as triggered_by_login
     FROM deployments d
     JOIN repositories r ON d.repo_id = r.id
     LEFT JOIN users u ON d.triggered_by = u.id
     WHERE d.id = $1`,
    [deploymentId]
  );

  if (result.rows.length === 0) {
    return Response.json({ error: 'Deployment not found' }, { status: 404 });
  }

  return Response.json({ deployment: result.rows[0] });
}

export async function getDeploymentLogs(req: Request, deploymentId: number): Promise<Response> {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const level = url.searchParams.get('level');
  const category = url.searchParams.get('category');

  let queryText = `
    SELECT * FROM logs 
    WHERE deployment_id = $1
  `;
  const params: unknown[] = [deploymentId];
  let paramIndex = 2;

  if (level) {
    queryText += ` AND level = $${paramIndex++}`;
    params.push(level);
  }

  if (category) {
    queryText += ` AND category = $${paramIndex++}`;
    params.push(category);
  }

  queryText += ` ORDER BY created_at ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  const result = await query(queryText, params);

  // Get total count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) FROM logs WHERE deployment_id = $1`,
    [deploymentId]
  );

  return Response.json({
    logs: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
    limit,
    offset,
  });
}

export async function deleteDeployment(req: Request, deploymentId: number, user: User): Promise<Response> {
  if (user.role === 'viewer') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await query<Deployment>(
    'SELECT * FROM deployments WHERE id = $1',
    [deploymentId]
  );

  if (result.rows.length === 0) {
    return Response.json({ error: 'Deployment not found' }, { status: 404 });
  }

  const deployment = result.rows[0];
  const { stopContainer } = await import('../daemon/deployer.js');

  if (deployment.status === 'running') {
    // Stop the container
    if (deployment.container_id) {
      await stopContainer(deployment.container_id).catch((e) => console.error('Error stopping container:', e));
    }
    // Mark as rolled_back so rollbackRepo finds the correct previous deployment
    await query(`UPDATE deployments SET status = 'rolled_back', finished_at = NOW() WHERE id = $1`, [deploymentId]);
    // Trigger async rollback — redeploys previous ref (tunnel stays alive, it belongs to the repo)
    const repoResult = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [deployment.repo_id]);
    if (repoResult.rows.length > 0) {
      const { rollbackRepo } = await import('../daemon/rollback.js');
      rollbackRepo(repoResult.rows[0]).catch((e) => console.error('Rollback error:', e));
    }
    return Response.json({ success: true, message: 'Rolling back to previous deployment' });
  }

  // Non-running deployment: stop container if any, delete record
  if (deployment.container_id) {
    await stopContainer(deployment.container_id).catch(() => {});
  }
  // Tunnel is NOT touched — it belongs to the repo, not the deployment
  await query('DELETE FROM deployments WHERE id = $1', [deploymentId]);

  return Response.json({ success: true });
}

export async function listRecentDeployments(req: Request): Promise<Response> {
  const result = await query<Deployment & { repo_name: string; repo_full_name: string }>(
    `SELECT d.*, r.name as repo_name, r.full_name as repo_full_name
     FROM deployments d
     JOIN repositories r ON d.repo_id = r.id
     ORDER BY d.started_at DESC
     LIMIT 20`
  );

  return Response.json({ deployments: result.rows });
}

export async function listActiveTunnels(req: Request, user: User): Promise<Response> {
  if (user.role !== 'admin') {
    return Response.json({ error: 'Only admins can list tunnels' }, { status: 403 });
  }

  const { getActiveTunnels } = await import('../daemon/localtonet.js');
  const tunnels = await getActiveTunnels();

  return Response.json({ tunnels });
}

export async function stopTunnel(req: Request, user: User, deploymentId: number): Promise<Response> {
  if (user.role !== 'admin') {
    return Response.json({ error: 'Only admins can stop tunnels' }, { status: 403 });
  }

  const deployment = await query<Deployment & { localtonet_tunnel_id: string | null }>(
    'SELECT * FROM deployments WHERE id = $1',
    [deploymentId]
  );

  if (deployment.rows.length === 0) {
    return Response.json({ error: 'Deployment not found' }, { status: 404 });
  }

  const d = deployment.rows[0];

  if (!d.localtonet_tunnel_id) {
    return Response.json({ error: 'No tunnel found for this deployment' }, { status: 404 });
  }

  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  if (!authToken) {
    return Response.json({ error: 'LOCALTONET_AUTH_TOKEN not configured' }, { status: 500 });
  }

  try {
    const { stopTunnel } = await import('../daemon/localtonet.js');
    await stopTunnel(d.localtonet_tunnel_id, authToken);

    // Update deployment status
    await query(
      `UPDATE deployments 
       SET status = 'rolled_back', 
           finished_at = NOW()
       WHERE id = $1`,
      [deploymentId]
    );

    return Response.json({ success: true, message: 'Tunnel stopped successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Failed to stop tunnel: ${errorMessage}` }, { status: 500 });
  }
}

export async function testLocaltonetConnection(req: Request, user: User): Promise<Response> {
  if (user.role !== 'admin') {
    return Response.json({ error: 'Only admins can test connection' }, { status: 403 });
  }

  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  const { testLocaltonetConnection } = await import('../daemon/localtonet.js');
  const result = await testLocaltonetConnection(authToken);

  return Response.json(result);
}

export async function getTunnelStatus(req: Request, user: User, tunnelId: string): Promise<Response> {
  if (user.role !== 'admin') {
    return Response.json({ error: 'Only admins can check tunnel status' }, { status: 403 });
  }

  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  const { getTunnelStatus } = await import('../daemon/localtonet.js');
  const result = await getTunnelStatus(tunnelId, authToken);

  return Response.json(result);
}
