import { query } from '../db/client.js';
import { createTunnel, startTunnel, stopTunnel, deleteTunnel, updateTunnelPort, getTunnelStatus } from './localtonet.js';
import type { Repository, ServiceTunnel, User } from '../types.js';

export async function createServiceTunnel(repo: Repository, user: User): Promise<ServiceTunnel> {
  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  if (!authToken) throw new Error('LOCALTONET_AUTH_TOKEN is not configured');
  if (!repo.tunnel_port) throw new Error('Service has no assigned host port yet. Deploy it first.');

  const existing = await query<ServiceTunnel>(
    `SELECT * FROM service_tunnels WHERE repo_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [repo.id]
  );
  if (existing.rows.length > 0) {
    await updateTunnelPort(existing.rows[0].localtonet_tunnel_id, repo.tunnel_port, authToken).catch(() => {});
    await startTunnel(existing.rows[0].localtonet_tunnel_id, authToken).catch(() => {});
    return existing.rows[0];
  }

  const created = await createTunnel(null, repo.tunnel_port, authToken, { type: 'random' });
  await startTunnel(created.tunnelId, authToken);

  const result = await query<ServiceTunnel>(
    `INSERT INTO service_tunnels (repo_id, created_by, localtonet_tunnel_id, tunnel_url, tunnel_port, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING *`,
    [repo.id, user.id, created.tunnelId, created.tunnelUrl, repo.tunnel_port]
  );

  await query('UPDATE repositories SET tunnel_enabled = true WHERE id = $1', [repo.id]);
  return result.rows[0];
}

export async function stopServiceTunnelByRepo(repoId: number, user: User): Promise<void> {
  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  const active = await query<ServiceTunnel>(
    `SELECT * FROM service_tunnels WHERE repo_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [repoId]
  );
  if (active.rows.length === 0) throw new Error('No active tunnel found');

  if (authToken) {
    await stopTunnel(active.rows[0].localtonet_tunnel_id, authToken);
  }

  await query(
    `UPDATE service_tunnels SET status = 'inactive', stopped_at = NOW(), stop_reason = 'user_requested' WHERE id = $1`,
    [active.rows[0].id]
  );
  await query('UPDATE repositories SET tunnel_enabled = false WHERE id = $1', [repoId]);
}

export async function deleteServiceTunnelByRepo(repoId: number): Promise<void> {
  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  const tunnels = await query<ServiceTunnel>(`SELECT * FROM service_tunnels WHERE repo_id = $1`, [repoId]);
  for (const tunnel of tunnels.rows) {
    if (authToken) {
      await stopTunnel(tunnel.localtonet_tunnel_id, authToken).catch(() => {});
      await deleteTunnel(tunnel.localtonet_tunnel_id, authToken).catch(() => {});
    }
  }
  await query('DELETE FROM service_tunnels WHERE repo_id = $1', [repoId]);
  await query('UPDATE repositories SET tunnel_enabled = false WHERE id = $1', [repoId]);
}

export async function getServiceTunnels(repoId: number): Promise<ServiceTunnel[]> {
  const result = await query<ServiceTunnel>(
    `SELECT st.*, u.github_login AS created_by_login
     FROM service_tunnels st
     LEFT JOIN users u ON u.id = st.created_by
     WHERE st.repo_id = $1
     ORDER BY st.created_at DESC`,
    [repoId]
  );
  return result.rows;
}

export async function listActiveServiceTunnels(): Promise<ServiceTunnel[]> {
  const result = await query<ServiceTunnel & { repo_name: string }>(
    `SELECT st.*, r.full_name AS repo_name
     FROM service_tunnels st
     JOIN repositories r ON r.id = st.repo_id
     WHERE st.status = 'active'
     ORDER BY st.created_at DESC`
  );
  return result.rows;
}

export async function syncTunnelAfterDeploy(repoId: number, hostPort: number): Promise<void> {
  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  if (!authToken) return;

  const active = await query<ServiceTunnel>(
    `SELECT * FROM service_tunnels WHERE repo_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [repoId]
  );
  if (active.rows.length === 0) return;

  await updateTunnelPort(active.rows[0].localtonet_tunnel_id, hostPort, authToken).catch(() => {});
  await startTunnel(active.rows[0].localtonet_tunnel_id, authToken).catch(() => {});
  await query('UPDATE service_tunnels SET tunnel_port = $1, last_used_at = NOW() WHERE id = $2', [hostPort, active.rows[0].id]);
}

export async function getActiveTunnelStatusByRepo(repoId: number): Promise<{ tunnel: ServiceTunnel | null; status: unknown | null }> {
  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  const active = await query<ServiceTunnel>(
    `SELECT * FROM service_tunnels WHERE repo_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [repoId]
  );
  if (active.rows.length === 0) return { tunnel: null, status: null };
  const status = authToken ? await getTunnelStatus(active.rows[0].localtonet_tunnel_id, authToken) : null;
  return { tunnel: active.rows[0], status };
}
