import { logNetwork, logSystem, logError } from '../logger/index.js';
import { query } from '../db/client.js';

const LOCALTONET_V1 = 'https://localtonet.com/api';
const LOCALTONET_V2 = 'https://localtonet.com/api/v2';

interface LocaltonetTunnel {
  id: number;
  url: string;
  status: number;
}

/**
 * Checks if Localtonet is configured.
 */
export function checkLocaltonetInstalled(): boolean {
  return !!process.env.LOCALTONET_AUTH_TOKEN;
}

export async function installLocaltonet(): Promise<void> {
  console.log('ℹ️  Localtonet uses the HTTP API. No CLI installation needed.');
  console.log('   Set LOCALTONET_AUTH_TOKEN (API key) in your .env file to enable tunnels.');
}

/**
 * Find the first auth token whose client is currently online.
 */
async function getOnlineClientToken(apiKey: string): Promise<string> {
  const res = await fetch(`${LOCALTONET_V2}/auth-tokens`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Localtonet auth-tokens API error ${res.status}: ${body}`);
  }
  const tokens = (await res.json()) as Array<{ token: string; clientIsOnline: boolean; name: string }>;
  const online = tokens.find((t) => t.clientIsOnline);
  if (!online) {
    throw new Error('No Localtonet client is online. Make sure the Localtonet client is running on the host.');
  }
  return online.token;
}

/**
 * Create a tunnel (does NOT start it — call startTunnel() after).
 * Uses custom subdomain if provided, otherwise random subdomain.
 */
export async function createTunnel(
  deploymentId: number,
  localPort: number,
  apiKey: string,
  opts?: { subDomain?: string }
): Promise<{ tunnelId: string; tunnelUrl: string }> {
  if (!apiKey) throw new Error('LOCALTONET_AUTH_TOKEN is required');

  logNetwork(`Creating Localtonet tunnel for port ${localPort}`, { deployment_id: deploymentId });

  const clientToken = await getOnlineClientToken(apiKey);
  const serverCode = process.env.LOCALTONET_SERVER_CODE || 'fr2';

  let endpoint: string;
  let body: Record<string, unknown>;

  if (opts?.subDomain) {
    endpoint = `${LOCALTONET_V1}/CreateHttpCustomSubDomainTunnel`;
    body = {
      subDomainName: opts.subDomain,
      ip: '127.0.0.1',
      port: localPort,
      serverCode,
      authToken: clientToken,
      protocolType: 1,
    };
  } else {
    endpoint = `${LOCALTONET_V1}/CreateHttpRandomSubDomainTunnel`;
    body = {
      ip: '127.0.0.1',
      port: localPort,
      serverCode,
      authToken: clientToken,
      protocolType: 1,
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Localtonet create tunnel error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { result?: LocaltonetTunnel } | LocaltonetTunnel;
  // v1 wraps in { result: ... }, v2 returns directly
  const tunnel = ('result' in data && data.result) ? data.result : data as LocaltonetTunnel;

  if (!tunnel.id || !tunnel.url) {
    throw new Error(`Localtonet returned invalid tunnel data: ${JSON.stringify(data)}`);
  }

  logSystem(`Tunnel created (not yet started): ${tunnel.url}`, { deployment_id: deploymentId });

  return { tunnelId: String(tunnel.id), tunnelUrl: tunnel.url };
}

/**
 * Start an existing tunnel by ID.
 * Must be called after createTunnel() for the tunnel to actually route traffic.
 */
export async function startTunnel(tunnelId: string, apiKey: string): Promise<void> {
  const response = await fetch(`${LOCALTONET_V1}/StartTunnel/${tunnelId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Localtonet StartTunnel error ${response.status}: ${body}`);
  }

  logSystem(`Tunnel ${tunnelId} started`);
}

/**
 * Stop a tunnel (keeps it registered, just not routing).
 */
export async function stopTunnel(tunnelId: string, apiKey: string): Promise<void> {
  if (!apiKey || !tunnelId) return;

  logNetwork(`Stopping Localtonet tunnel ${tunnelId}`);
  try {
    const response = await fetch(`${LOCALTONET_V1}/StopTunnel/${tunnelId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      logError(`Failed to stop tunnel ${tunnelId}: ${response.status} ${body}`);
    }
  } catch (error) {
    logError(`Error stopping tunnel ${tunnelId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Permanently delete a tunnel. Called when a repo is deleted.
 */
export async function deleteTunnel(tunnelId: string, apiKey: string): Promise<void> {
  if (!apiKey || !tunnelId) return;

  logNetwork(`Deleting Localtonet tunnel ${tunnelId}`);
  try {
    const response = await fetch(`${LOCALTONET_V1}/DeleteTunnel/${tunnelId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      logError(`Failed to delete tunnel ${tunnelId}: ${response.status} ${body}`);
    }
  } catch (error) {
    logError(`Error deleting tunnel ${tunnelId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Stop all tunnels on server shutdown. Queries repositories (not deployments)
 * since tunnels are now per-repo.
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
      SELECT
        d.id,
        d.localtonet_tunnel_id,
        d.tunnel_url,
        d.tunnel_port,
        d.started_at,
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
  if (!authToken) {
    return { exists: false, isActive: false, error: 'No auth token' };
  }

  try {
    const response = await fetch(`${LOCALTONET_V2}/tunnels/${tunnelId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.status === 404) {
      return { exists: false, isActive: false };
    }

    if (!response.ok) {
      const body = await response.text();
      return { exists: true, isActive: false, error: `API error ${response.status}: ${body}` };
    }

    const tunnel = await response.json() as LocaltonetTunnel & { url?: string };

    return {
      exists: true,
      isActive: tunnel.status === 1,
      url: tunnel.url
    };
  } catch (error) {
    return {
      exists: false,
      isActive: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function testLocaltonetConnection(authToken: string): Promise<{
  success: boolean;
  error?: string;
  activeTunnelsCount?: number;
}> {
  if (!authToken) {
    return { success: false, error: 'No auth token provided' };
  }

  try {
    const response = await fetch(`${LOCALTONET_V2}/tunnels`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `API error ${response.status}: ${body}` };
    }

    const data = await response.json() as any[];
    const activeCount = data.filter((t: any) => t.status === 1).length;

    return {
      success: true,
      activeTunnelsCount: activeCount,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      activeTunnelsCount: 0
    };
  }
}
