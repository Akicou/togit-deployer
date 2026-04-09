import { logNetwork, logSystem, logError } from '../logger/index.js';
import { query } from '../db/client.js';

const LOCALTONET_API = 'https://localtonet.com/api/v2';

interface LocaltonetTunnel {
  id: number;
  url: string;
  status: number;
}

export async function checkLocaltonetInstalled(): Promise<boolean> {
  return !!(process.env.LOCALTONET_AUTH_TOKEN);
}

export async function installLocaltonet(): Promise<void> {
  throw new Error(
    'Localtonet now uses the HTTP API. Set LOCALTONET_AUTH_TOKEN in your .env file.'
  );
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

  const response = await fetch(`${LOCALTONET_API}/tunnels/http/random-subdomain`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      port: localPort,
      authToken,
      protocolType: 1,
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

export function getActiveTunnels(): string[] {
  return [];
}
