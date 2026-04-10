import { query } from '../db/client.js';
import type { ServerWebSocket } from 'bun';
import type { Log, WebSocketLogMessage } from '../types.js';

export type WSData = { key: number | 'global' } | { type: 'container-exec'; repoId: number };

// Store active WebSocket connections by deployment_id
const wsConnections = new Map<number | 'global', Set<ServerWebSocket<WSData>>>();
// Store container exec WebSocket connections
const execConnections = new Map<number, ServerWebSocket<WSData>>();

export function handleWSOpen(ws: ServerWebSocket<WSData>): void {
  if ('type' in ws.data && ws.data.type === 'container-exec') {
    // Container exec connection
    execConnections.set(ws.data.repoId, ws);
    console.log(`WebSocket exec connected: repoId=${ws.data.repoId}`);
  } else {
    // Regular log connection
    const { key } = ws.data;
    if (!wsConnections.has(key)) {
      wsConnections.set(key, new Set());
    }
    wsConnections.get(key)!.add(ws);
    console.log(`WebSocket connected: deploymentId=${key}, total=${wsConnections.get(key)!.size}`);
  }
}

export function handleWSClose(ws: ServerWebSocket<WSData>): void {
  if ('type' in ws.data && ws.data.type === 'container-exec') {
    // Container exec connection closing
    execConnections.delete(ws.data.repoId);
  } else {
    // Regular log connection closing
    const { key } = ws.data;
    wsConnections.get(key)?.delete(ws);
    if (wsConnections.get(key)?.size === 0) {
      wsConnections.delete(key);
    }
  }
}

export function handleWSError(ws: ServerWebSocket<WSData>, error: Error): void {
  console.error('WebSocket error:', error);
  handleWSClose(ws);
}

export async function log(
  category: Log['category'],
  level: Log['level'],
  message: string,
  options: {
    deployment_id?: number | null;
    repo_id?: number | null;
    meta?: Record<string, unknown>;
  } = {}
): Promise<void> {
  const { deployment_id = null, repo_id = null, meta = null } = options;

  // Insert into database
  try {
    const result = await query<{ id: number; created_at: Date }>(
      `INSERT INTO logs (deployment_id, repo_id, category, level, message, meta)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [deployment_id, repo_id, category, level, message, meta ? JSON.stringify(meta) : null]
    );

    // Create WebSocket message
    const wsMessage: WebSocketLogMessage = {
      level,
      category,
      message,
      created_at: result.rows[0].created_at.toISOString(),
    };
    if (deployment_id) {
      wsMessage.deployment_id = deployment_id;
    }

    // Stream to WebSocket subscribers
    broadcastLog(wsMessage, deployment_id);

    // Also log to stdout in development
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${category.toUpperCase()}]`;
      if (level === 'error') {
        console.error(prefix, message);
      } else if (level === 'warn') {
        console.warn(prefix, message);
      } else {
        console.log(prefix, message);
      }
    }
  } catch (error) {
    console.error('Failed to insert log:', error);
  }
}

function broadcastLog(message: WebSocketLogMessage, deploymentId: number | null): void {
  const messageStr = JSON.stringify(message);

  // Broadcast to specific deployment subscribers
  if (deploymentId && wsConnections.has(deploymentId)) {
    for (const ws of wsConnections.get(deploymentId)!) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  // Broadcast to global subscribers
  if (wsConnections.has('global')) {
    for (const ws of wsConnections.get('global')!) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }
}

export function logBuild(message: string, options?: Partial<Pick<Log, 'deployment_id' | 'repo_id'>>) {
  return log('build', 'info', message, options);
}

export function logNetwork(message: string, options?: Partial<Pick<Log, 'deployment_id' | 'repo_id'>>) {
  return log('network', 'info', message, options);
}

export function logDocker(message: string, options?: Partial<Pick<Log, 'deployment_id' | 'repo_id'>>) {
  return log('docker', 'info', message, options);
}

export function logSystem(message: string, options?: Partial<Pick<Log, 'deployment_id' | 'repo_id'>>) {
  return log('system', 'info', message, options);
}

export function logWarn(message: string, options?: Partial<Pick<Log, 'deployment_id' | 'repo_id'>> & { meta?: Record<string, unknown> }) {
  return log('system', 'warn', message, { ...options, meta: options?.meta });
}

export function logError(message: string, options?: Partial<Pick<Log, 'deployment_id' | 'repo_id'>> & { meta?: Record<string, unknown> }) {
  return log('system', 'error', message, { ...options, meta: options?.meta });
}

export async function handleWSMessage(ws: ServerWebSocket<WSData>, message: Uint8Array): Promise<void> {
  if ('type' in ws.data && ws.data.type === 'container-exec') {
    // Handle container exec messages
    try {
      const { getContainerForRepo } = await import('../daemon/deployer.js');
      const container = await getContainerForRepo(ws.data.repoId);

      if (!container) {
        ws.send(JSON.stringify({ type: 'error', message: 'No running container found' }));
        ws.close();
        return;
      }

      const command = new TextDecoder().decode(message).trim();
      
      // Execute command in container
      const exec = await container.exec({
        Cmd: ['sh', '-c', command],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });

      const output = await exec.start({
        Detach: false,
        Tty: false,
      });

      const textEncoder = new TextEncoder();
      
      output.on('stdout', (chunk: Buffer) => {
        ws.send(textEncoder.encode(chunk.toString()));
      });
      
      output.on('stderr', (chunk: Buffer) => {
        ws.send(textEncoder.encode(chunk.toString()));
      });
      
      output.on('end', () => {
        ws.send(textEncoder.encode('\r\n$ '));
      });
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      ws.send(JSON.stringify({ type: 'error', message: errorMsg }));
    }
  }
}
