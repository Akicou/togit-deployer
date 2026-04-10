import { logNetwork, logSystem, logError } from '../logger/index.js';
import { query } from '../db/client.js';

const API = 'https://localtonet.com/api/v2';

interface LocaltonetTunnel {
  id: number;
  url: string;
  status: number;
  clientPort?: number;
}

export type TunnelType = 'random' | 'subdomain' | 'custom-domain';

export function checkLocaltonetInstalled(): boolean {
  return !!process.env.LOCALTONET_AUTH_TOKEN;
}

export async function installLocaltonet(): Promise<void> {
  console.log('ℹ️  Localtonet uses the HTTP API. No CLI installation needed.');
  console.log('   Set LOCALTONET_AUTH_TOKEN (v2 API key) in your .env file.');
}

/**
 * Find the first auth token whose Localtonet client is currently online.
 */
async function getOnlineClientToken(apiKey: string): Promise<string> {
  const res = await fetch(`${API}/auth-tokens`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Localtonet auth-tokens error ${res.status}: ${body}`);
  }
  const tokens = (await res.json()) as Array<{ token: string; clientIsOnline: boolean; name: string }>;
  const online = tokens.find((t) => t.clientIsOnline);
  if (!online) {
    throw new Error('No Localtonet client is online. Make sure the Localtonet client is running on this machine.');
  }
  return online.token;
}

/**
 * Create a tunnel (does NOT start routing — call startTunnel() after).
 *
 * Modes:
 *   random       — random subdomain on Localtonet's domain
 *   subdomain    — custom subdomain: opts.subDomain + opts.domain (e.g. myapp.localto.net)
 *   custom-domain — your own domain: opts.domain (e.g. myapp.com)
 */
export async function createTunnel(
  deploymentId: number | null,
  localPort: number,
  apiKey: string,
  opts?: { type?: TunnelType; subDomain?: string; domain?: string }
): Promise<{ tunnelId: string; tunnelUrl: string }> {
  if (!apiKey) throw new Error('LOCALTONET_AUTH_TOKEN is required');

  const type = opts?.type || 'random';
  logNetwork(`Creating Localtonet tunnel (${type}) for port ${localPort}`, { deployment_id: deploymentId });

  const clientToken = await getOnlineClientToken(apiKey);
  const serverCode = process.env.LOCALTONET_SERVER_CODE || 'fr2';

  let endpoint: string;
  let body: Record<string, unknown>;

  const base = {
    ip: '127.0.0.1',
    port: localPort,
    serverCode,
    authToken: clientToken,
    protocolType: 1,
  };

  if (type === 'subdomain') {
    if (!opts?.subDomain) throw new Error('tunnel_subdomain is required for subdomain mode');
    endpoint = `${API}/tunnels/http/custom-subdomain`;
    body = { ...base, subDomainName: opts.subDomain, domainName: opts.domain || 'localto.net' };
  } else if (type === 'custom-domain') {
    if (!opts?.domain) throw new Error('tunnel_domain is required for custom-domain mode');
    endpoint = `${API}/tunnels/http/custom-domain`;
    body = { ...base, domainName: opts.domain };
  } else {
    endpoint = `${API}/tunnels/http/random-subdomain`;
    body = { ...base };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Localtonet create tunnel error ${response.status}: ${text}`);
  }

  const tunnel = (await response.json()) as LocaltonetTunnel;
  if (!tunnel.id || !tunnel.url) {
    throw new Error(`Localtonet returned invalid tunnel data: ${JSON.stringify(tunnel)}`);
  }

  logSystem(`Tunnel created (not yet started): ${tunnel.url}`, { deployment_id: deploymentId });
  return { tunnelId: String(tunnel.id), tunnelUrl: tunnel.url };
}

/**
 * Start an existing tunnel so it actually routes traffic.
 * Must be called after createTunnel() on first deploy, and on every redeploy.
 */
export async function startTunnel(tunnelId: string, apiKey: string): Promise<void> {
  const res = await fetch(`${API}/tunnels/${tunnelId}/actions/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Localtonet StartTunnel error ${res.status}: ${body}`);
  }
  logSystem(`Tunnel ${tunnelId} started`);
}

/**
 * Update the local port a tunnel forwards to.
 * Called on redeploy when the fixed host port may have changed (e.g. after a reset).
 */
export async function updateTunnelPort(tunnelId: string, localPort: number, apiKey: string): Promise<void> {
  const res = await fetch(`${API}/tunnels/${tunnelId}/local-port`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localPort }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Localtonet UpdatePort error ${res.status}: ${body}`);
  }
  logSystem(`Tunnel ${tunnelId} local port updated to ${localPort}`);
}

/**
 * Stop a tunnel (keeps it registered but stops routing traffic).
 */
export async function stopTunnel(tunnelId: string, apiKey: string): Promise<void> {
  if (!apiKey || !tunnelId) return;
  logNetwork(`Stopping Localtonet tunnel ${tunnelId}`);
  try {
    const res = await fetch(`${API}/tunnels/${tunnelId}/actions/stop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      logError(`Failed to stop tunnel ${tunnelId}: ${res.status} ${body}`);
    }
  } catch (err) {
    logError(`Error stopping tunnel ${tunnelId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Permanently delete a tunnel. Called when a repo is deleted or tunnel is reset.
 */
export async function deleteTunnel(tunnelId: string, apiKey: string): Promise<void> {
  if (!apiKey || !tunnelId) return;
  logNetwork(`Deleting Localtonet tunnel ${tunnelId}`);
  try {
    const res = await fetch(`${API}/tunnels/${tunnelId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      logError(`Failed to delete tunnel ${tunnelId}: ${res.status} ${body}`);
    }
  } catch (err) {
    logError(`Error deleting tunnel ${tunnelId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Stop all repo tunnels on server shutdown.
 */
export async function stopAllTunnels(): Promise<void> {
  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  if (!authToken) return;

  logSystem('Stopping all Localtonet tunnels...');
  try {
    const result = await query<{ localtonet_tunnel_id: string }>(
      `SELECT localtonet_tunnel_id FROM repositories WHERE localtonet_tunnel_id IS NOT NULL`
    );
    for (const row of result.rows) {
      await stopTunnel(row.localtonet_tunnel_id, authToken);
    }
  } catch (error) {
    logError(`Error stopping tunnels: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getActiveTunnels(): Promise<Array<{
  id: number;
  tunnel_id: string;
  deployment_id: number;
  repo_name: string;
  tunnel_url: string;
  tunnel_port: number;
  started_at: Date;
}>> {
  try {
    const result = await query<{
      id: number;
      localtonet_tunnel_id: string;
      tunnel_url: string;
      tunnel_port: number;
      started_at: Date;
      repo_full_name: string;
    }>(`
      SELECT d.id, d.localtonet_tunnel_id, d.tunnel_url, d.tunnel_port, d.started_at,
             r.full_name as repo_full_name
      FROM deployments d
      JOIN repositories r ON r.id = d.repo_id
      WHERE d.status = 'running'
        AND d.localtonet_tunnel_id IS NOT NULL
        AND d.tunnel_url IS NOT NULL
      ORDER BY d.started_at DESC
    `);

    return result.rows.map(row => ({
      id: row.id,
      tunnel_id: row.localtonet_tunnel_id,
      deployment_id: row.id,
      repo_name: row.repo_full_name,
      tunnel_url: row.tunnel_url,
      tunnel_port: row.tunnel_port,
      started_at: row.started_at,
    }));
  } catch (error) {
    logError(`Error fetching active tunnels: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function getTunnelStatus(tunnelId: string, authToken: string): Promise<{
  exists: boolean;
  isActive: boolean;
  url?: string;
  error?: string;
}> {
  if (!authToken) return { exists: false, isActive: false, error: 'No auth token' };

  try {
    const res = await fetch(`${API}/tunnels/${tunnelId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.status === 404) return { exists: false, isActive: false };
    if (!res.ok) {
      const body = await res.text();
      return { exists: true, isActive: false, error: `API error ${res.status}: ${body}` };
    }

    const tunnel = await res.json() as LocaltonetTunnel;
    return { exists: true, isActive: tunnel.status === 1, url: tunnel.url };
  } catch (error) {
    return { exists: false, isActive: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function testLocaltonetConnection(authToken: string): Promise<{
  success: boolean;
  error?: string;
  activeTunnelsCount?: number;
}> {
  if (!authToken) return { success: false, error: 'No auth token provided' };

  try {
    const res = await fetch(`${API}/tunnels`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `API error ${res.status}: ${body}` };
    }

    const data = await res.json() as any[];
    return { success: true, activeTunnelsCount: data.filter((t: any) => t.status === 1).length };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), activeTunnelsCount: 0 };
  }
}
