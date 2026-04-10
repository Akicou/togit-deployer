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
  // Delete logs first to avoid FK constraint violation
  await query('DELETE FROM logs WHERE deployment_id = $1', [deploymentId]);
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

  const { listActiveServiceTunnels } = await import('../daemon/tunnel-manager.js');
  const tunnels = await listActiveServiceTunnels();

  return Response.json({ tunnels });
}

export async function stopTunnel(req: Request, user: User, repoId: number): Promise<Response> {
  try {
    const { stopServiceTunnelByRepo } = await import('../daemon/tunnel-manager.js');
    await stopServiceTunnelByRepo(repoId, user);
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

export async function createRepoTunnel(req: Request, user: User, repoId: number): Promise<Response> {
  const repoResult = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repoId]);
  if (repoResult.rows.length === 0) {
    return Response.json({ error: 'Repository not found' }, { status: 404 });
  }
  const repo = repoResult.rows[0];

  if (repo.project_id) {
    const { checkProjectAccess } = await import('./projects.js');
    const allowed = await checkProjectAccess(user, repo.project_id, 'deploy');
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { createServiceTunnel } = await import('../daemon/tunnel-manager.js');
    const tunnel = await createServiceTunnel(repo, user);
    return Response.json({ tunnel }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function getRepoTunnel(req: Request, user: User, repoId: number): Promise<Response> {
  const repoResult = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repoId]);
  if (repoResult.rows.length === 0) {
    return Response.json({ error: 'Repository not found' }, { status: 404 });
  }
  const repo = repoResult.rows[0];

  if (repo.project_id) {
    const { checkProjectAccess } = await import('./projects.js');
    const allowed = await checkProjectAccess(user, repo.project_id, 'view');
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { getActiveTunnelStatusByRepo } = await import('../daemon/tunnel-manager.js');
  const tunnel = await getActiveTunnelStatusByRepo(repoId);
  return Response.json(tunnel);
}

export async function deleteRepoTunnel(req: Request, user: User, repoId: number): Promise<Response> {
  const repoResult = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repoId]);
  if (repoResult.rows.length === 0) {
    return Response.json({ error: 'Repository not found' }, { status: 404 });
  }
  const repo = repoResult.rows[0];

  if (repo.project_id) {
    const { checkProjectAccess } = await import('./projects.js');
    const allowed = await checkProjectAccess(user, repo.project_id, 'deploy');
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { deleteServiceTunnelByRepo } = await import('../daemon/tunnel-manager.js');
    await deleteServiceTunnelByRepo(repoId);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function getTunnelStatus(req: Request, user: User, repoId: string): Promise<Response> {
  const { getActiveTunnelStatusByRepo } = await import('../daemon/tunnel-manager.js');
  const result = await getActiveTunnelStatusByRepo(parseInt(repoId, 10));
  return Response.json(result);
}

export async function getContainerLogs(req: Request, repoId: number, user: User): Promise<Response> {
  try {
    const result = await query<Repository>(
      'SELECT * FROM repositories WHERE id = $1',
      [repoId]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'Repository not found' }, { status: 404 });
    }

    const repo = result.rows[0];

    if (repo.project_id) {
      const { checkProjectAccess } = await import('./projects.js');
      const allowed = await checkProjectAccess(user, repo.project_id, 'view');
      if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { getContainerForRepo } = await import('../daemon/deployer.js');
    const container = await getContainerForRepo(repoId);

    if (!container) {
      return Response.json({ error: 'No running container found for this repository' }, { status: 404 });
    }

    const url = new URL(req.url);
    const tail = parseInt(url.searchParams.get('tail') || '100', 10);
    const follow = url.searchParams.get('follow') === 'true';

    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      follow,
    });

    if (follow) {
      const textEncoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          logs.on('data', (chunk: Buffer) => {
            controller.enqueue(textEncoder.encode(chunk.toString()));
          });
          logs.on('end', () => {
            controller.close();
          });
          logs.on('error', (err: Error) => {
            controller.error(err);
          });
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of logs) {
      chunks.push(chunk);
    }

    return new Response(Buffer.concat(chunks), {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Failed to get container logs: ${errorMessage}` }, { status: 500 });
  }
}

export async function createContainerExec(req: Request, repoId: number, user: User): Promise<Response> {
  try {
    const result = await query<Repository>(
      'SELECT * FROM repositories WHERE id = $1',
      [repoId]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'Repository not found' }, { status: 404 });
    }

    const repo = result.rows[0];

    if (repo.project_id) {
      const { checkProjectAccess } = await import('./projects.js');
      const allowed = await checkProjectAccess(user, repo.project_id, 'deploy');
      if (!allowed) return Response.json({ error: 'Requires deploy permission to exec into container' }, { status: 403 });
    }

    const { getContainerForRepo } = await import('../daemon/deployer.js');
    const container = await getContainerForRepo(repoId);

    if (!container) {
      return Response.json({ error: 'No running container found for this repository' }, { status: 404 });
    }

    return Response.json({ success: true, containerId: container.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Failed to prepare container exec: ${errorMessage}` }, { status: 500 });
  }
}
