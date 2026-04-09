import { query } from '../db/client.js';

export async function getGlobalLogs(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const level = url.searchParams.get('level');
  const category = url.searchParams.get('category');
  const repoId = url.searchParams.get('repo_id');
  const deploymentId = url.searchParams.get('deployment_id');

  let queryText = 'SELECT * FROM logs WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (level) {
    queryText += ` AND level = $${paramIndex++}`;
    params.push(level);
  }

  if (category) {
    queryText += ` AND category = $${paramIndex++}`;
    params.push(category);
  }

  if (repoId) {
    queryText += ` AND repo_id = $${paramIndex++}`;
    params.push(parseInt(repoId, 10));
  }

  if (deploymentId) {
    queryText += ` AND deployment_id = $${paramIndex++}`;
    params.push(parseInt(deploymentId, 10));
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  const result = await query(queryText, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) FROM logs WHERE 1=1';
  const countParams: unknown[] = [];
  let countParamIndex = 1;

  if (level) {
    countQuery += ` AND level = $${countParamIndex++}`;
    countParams.push(level);
  }

  if (category) {
    countQuery += ` AND category = $${countParamIndex++}`;
    countParams.push(category);
  }

  if (repoId) {
    countQuery += ` AND repo_id = $${countParamIndex++}`;
    countParams.push(parseInt(repoId, 10));
  }

  if (deploymentId) {
    countQuery += ` AND deployment_id = $${countParamIndex++}`;
    countParams.push(parseInt(deploymentId, 10));
  }

  const countResult = await query<{ count: string }>(countQuery, countParams);

  return Response.json({
    logs: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
    limit,
    offset,
  });
}

export async function getStats(req: Request): Promise<Response> {
  const [
    totalReposResult,
    activeDeploymentsResult,
    failedTodayResult,
    tunnelsOnlineResult,
  ] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*) FROM repositories WHERE enabled = true'),
    query<{ count: string }>("SELECT COUNT(*) FROM deployments WHERE status = 'running'"),
    query<{ count: string }>("SELECT COUNT(*) FROM deployments WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours'"),
    query<{ count: string }>("SELECT COUNT(*) FROM deployments WHERE status = 'running' AND tunnel_url IS NOT NULL"),
  ]);

  return Response.json({
    stats: {
      total_repos: parseInt(totalReposResult.rows[0].count, 10),
      active_deployments: parseInt(activeDeploymentsResult.rows[0].count, 10),
      failed_today: parseInt(failedTodayResult.rows[0].count, 10),
      tunnels_online: parseInt(tunnelsOnlineResult.rows[0].count, 10),
    },
  });
}

export async function getSystemStatus(req: Request): Promise<Response> {
  const { checkConnection } = await import('../db/client.js');
  const { checkLocaltonetInstalled } = await import('../daemon/localtonet.js');
  const { checkDockerRunning } = await import('../daemon/deployer.js');

  const [dbStatus, localtonetStatus, dockerStatus] = await Promise.all([
    checkConnection(),
    checkLocaltonetInstalled(),
    checkDockerRunning(),
  ]);

  return Response.json({
    status: {
      database: dbStatus ? 'connected' : 'disconnected',
      localtonet: localtonetStatus ? 'installed' : 'not_installed',
      docker: dockerStatus ? 'running' : 'not_running',
    },
  });
}
