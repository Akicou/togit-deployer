import { spawn, type ChildProcess } from 'child_process';
import { logNetwork, logSystem, logError } from '../logger/index.js';
import { query } from '../db/client.js';

// Store child processes for each deployment
const tunnelProcesses = new Map<number, ChildProcess>();

export async function checkLocaltonetInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', ['localtonet']);
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}

export async function installLocaltonet(): Promise<void> {
  logSystem('Installing Localtonet...');

  return new Promise((resolve, reject) => {
    const proc = spawn('curl', ['-fsSL', 'https://localtonet.com/install.sh', '|', 'sh'], {
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
      logNetwork(`Localtonet install: ${data.toString().trim()}`);
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
      logNetwork(`Localtonet install error: ${data.toString().trim()}`);
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        logSystem('Localtonet installed successfully');
        resolve();
      } else {
        const errorMsg = `Localtonet install failed with code ${code}: ${stderr}`;
        logError(errorMsg);
        reject(new Error(errorMsg));
      }
    });

    proc.on('error', (err) => {
      const errorMsg = `Failed to run Localtonet install: ${err.message}`;
      logError(errorMsg);
      reject(new Error(errorMsg));
    });
  });
}

export async function startTunnel(
  deploymentId: number,
  localPort: number,
  protocol: 'http' | 'tcp' | 'udp' = 'http',
  authToken: string
): Promise<string> {
  const authTokenEnv = process.env.LOCALTONET_AUTH_TOKEN || authToken;
  
  if (!authTokenEnv) {
    throw new Error('LOCALTONET_AUTH_TOKEN is required');
  }

  logNetwork(`Starting Localtonet tunnel for port ${localPort}`, { deployment_id: deploymentId });

  // Build command based on protocol
  let args: string[];
  if (protocol === 'http') {
    args = ['http', '--authtoken', authTokenEnv, '--port', localPort.toString()];
  } else {
    args = [protocol, '--authtoken', authTokenEnv, '--port', localPort.toString()];
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('localtonet', args);

    tunnelProcesses.set(deploymentId, proc);

    let stdout = '';
    let stderr = '';
    let tunnelUrl = '';
    let resolved = false;

    // Parse stdout for tunnel URL
    const urlRegex = /https?:\/\/[^\s]+\.localtonet\.com/;

    proc.stdout?.on('data', async (data) => {
      const text = data.toString();
      stdout += text;
      
      await logNetwork(text.trim(), { deployment_id: deploymentId });

      // Extract tunnel URL
      const match = text.match(urlRegex);
      if (match && !resolved) {
        tunnelUrl = match[0];
        resolved = true;
        logSystem(`Tunnel established: ${tunnelUrl}`, { deployment_id: deploymentId });
        resolve(tunnelUrl);
      }
    });

    proc.stderr?.on('data', async (data) => {
      const text = data.toString();
      stderr += text;
      await logNetwork(`Localtonet stderr: ${text.trim()}`, { deployment_id: deploymentId });
    });

    proc.on('close', async (code) => {
      tunnelProcesses.delete(deploymentId);
      
      if (code !== 0 && !resolved) {
        const errorMsg = `Localtonet tunnel exited with code ${code}: ${stderr}`;
        await logError(errorMsg, { deployment_id: deploymentId });
        reject(new Error(errorMsg));
      }
    });

    proc.on('error', async (err) => {
      tunnelProcesses.delete(deploymentId);
      const errorMsg = `Localtonet tunnel error: ${err.message}`;
      await logError(errorMsg, { deployment_id: deploymentId });
      reject(new Error(errorMsg));
    });

    // Timeout after 30 seconds if no URL found
    setTimeout(() => {
      if (!resolved) {
        stopTunnel(deploymentId);
        reject(new Error('Localtonet tunnel timeout - no URL received'));
      }
    }, 30000);
  });
}

export async function stopTunnel(deploymentId: number): Promise<void> {
  const proc = tunnelProcesses.get(deploymentId);
  
  if (proc) {
    logNetwork(`Stopping Localtonet tunnel for deployment ${deploymentId}`);
    proc.kill('SIGTERM');
    tunnelProcesses.delete(deploymentId);
  }

  // Also try to find and kill any orphan processes
  try {
    const killProc = spawn('pkill', ['-f', `localtonet.*${deploymentId}`]);
    await new Promise<void>((resolve) => {
      killProc.on('close', () => resolve());
    });
  } catch {
    // Ignore pkill errors
  }
}

export async function stopAllTunnels(): Promise<void> {
  logSystem('Stopping all Localtonet tunnels...');
  
  for (const [deploymentId, proc] of tunnelProcesses) {
    logNetwork(`Stopping tunnel for deployment ${deploymentId}`);
    proc.kill('SIGTERM');
  }
  
  tunnelProcesses.clear();
}

export function getActiveTunnels(): number[] {
  return Array.from(tunnelProcesses.keys());
}
