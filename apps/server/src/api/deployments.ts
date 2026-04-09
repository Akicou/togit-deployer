import { query } from '../db/client.js';
import type { Deployment, User } from '../types.js';

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

  const result = await query<Deployment & { localtonet_tunnel_id: string | null }>(
    'SELECT * FROM deployments WHERE id = $1',
    [deploymentId]
  );

  if (result.rows.length === 0) {
    return Response.json({ error: 'Deployment not found' }, { status: 404 });
  }

  const deployment = result.rows[0];

  // Stop Docker container
  if (deployment.container_id) {
    try {
      const { stopContainer } = await import('../daemon/deployer.js');
      await stopContainer(deployment.container_id);
    } catch (error) {
      console.error('Error stopping container:', error);
    }
  }

  // Delete Localtonet tunnel
  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  if (deployment.localtonet_tunnel_id && authToken) {
    try {
      const { stopTunnel } = await import('../daemon/localtonet.js');
      await stopTunnel(deployment.localtonet_tunnel_id, authToken);
    } catch (error) {
      console.error('Error stopping tunnel:', error);
    }
  }

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
