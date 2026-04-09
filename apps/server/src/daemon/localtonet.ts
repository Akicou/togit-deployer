import { logNetwork, logSystem, logError } from '../logger/index.js';
import { query } from '../db/client.js';

const LOCALTONET_API = 'https://localtonet.com/api/v2';

interface LocaltonetTunnel {
  id: number;
  url: string;
  status: number;
}

/**
 * Checks if Localtonet is configured and usable.
 * Since Localtonet uses the HTTP API (no CLI), we verify
 * the token is set and perform a lightweight connectivity test.
 */
export async function checkLocaltonetInstalled(): Promise<boolean> {
  if (!process.env.LOCALTONET_AUTH_TOKEN) return false;

  // Do a lightweight test to verify the token actually works
  try {
    const response = await fetch(`${LOCALTONET_API}/tunnels`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.LOCALTONET_AUTH_TOKEN}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Localtonet no longer requires CLI installation — it uses an HTTP API.
 * This function is now a no-op; the check is done via checkLocaltonetInstalled().
 */
export async function installLocaltonet(): Promise<void> {
  // No installation needed — Localtonet uses a REST API.
  // Ensure LOCALTONET_AUTH_TOKEN is set in your .env file.
  console.log('ℹ️  Localtonet uses the HTTP API. No CLI installation needed.');
  console.log('   Set LOCALTONET_AUTH_TOKEN in your .env file to enable tunnels.');
}

export async function startTunnel(
  deploymentId: number,
  localPort: number,
  authToken: string
): Promise<{ tunnelId: string; tunnelUrl: string }> {
  if (!authToken) {
    throw new Error('LOCALTONET_AUTH_TOKEN is required');
  }

  logNetwork(`Creating Localtonet tunnel for port ${localPort}`, { deployment_id: deploymentId });

  // API: POST /tunnels/http/random-subdomain
  // Body: { port: number, protocolType: 1 } (authToken in header only)
  const response = await fetch(`${LOCALTONET_API}/tunnels/http/random-subdomain`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      port: localPort,
      protocolType: 1, // 1 = HTTP
      name: `togit-deployment-${deploymentId}`, // Optional descriptive name
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Localtonet API error ${response.status}: ${body}`);
  }

  const tunnel = (await response.json()) as LocaltonetTunnel;

  if (!tunnel.url) {
    throw new Error('Localtonet API returned no tunnel URL');
  }

  logSystem(`Tunnel created: ${tunnel.url}`, { deployment_id: deploymentId });

  return { tunnelId: String(tunnel.id), tunnelUrl: tunnel.url };
}

export async function stopTunnel(localtonetTunnelId: string, authToken: string): Promise<void> {
  if (!authToken || !localtonetTunnelId) return;

  logNetwork(`Deleting Localtonet tunnel ${localtonetTunnelId}`);

  try {
    const response = await fetch(`${LOCALTONET_API}/tunnels/${localtonetTunnelId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      logError(`Failed to delete tunnel ${localtonetTunnelId}: ${response.status} ${body}`);
    }
  } catch (error) {
    logError(`Error deleting tunnel ${localtonetTunnelId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function stopAllTunnels(): Promise<void> {
  const authToken = process.env.LOCALTONET_AUTH_TOKEN || '';
  if (!authToken) return;

  logSystem('Stopping all Localtonet tunnels...');

  try {
    const result = await query<{ localtonet_tunnel_id: string }>(
      `SELECT localtonet_tunnel_id FROM deployments
       WHERE status = 'running' AND localtonet_tunnel_id IS NOT NULL`
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
    // API: GET /tunnels/{tunnelId}
    const response = await fetch(`${LOCALTONET_API}/tunnels/${tunnelId}`, {
      method: 'GET',
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
    // API: GET /tunnels - returns list of all tunnels (active and inactive)
    const response = await fetch(`${LOCALTONET_API}/tunnels`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `API error ${response.status}: ${body}` };
    }

    const data = await response.json() as any[];
    
    // Count active tunnels (status === 1 means active)
    const activeCount = data.filter((t: any) => t.status === 1).length;
    
    return { 
      success: true,
      activeTunnelsCount: activeCount,
      error: undefined
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      activeTunnelsCount: 0
    };
  }
}
