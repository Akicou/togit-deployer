import fs from 'fs';

export interface DockerfilePortInfo {
  exposedPorts: number[];
  recommendedPort: number | null;
  hasEnvVars: boolean;
}

/**
 * Parse Dockerfile EXPOSE directives to detect port configuration.
 * Returns ports found and a recommended port for deployment.
 */
export function parseDockerfileExpose(dockerfilePath: string): DockerfilePortInfo {
  const result: DockerfilePortInfo = {
    exposedPorts: [],
    recommendedPort: null,
    hasEnvVars: false,
  };

  if (!fs.existsSync(dockerfilePath)) {
    return result;
  }

  const content = fs.readFileSync(dockerfilePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match EXPOSE directive (case-insensitive)
    const exposeMatch = trimmed.match(/^EXPOSE\s+(.+)/i);
    if (!exposeMatch) continue;

    const portSpec = exposeMatch[1].trim();

    // Check if port specification contains environment variables
    if (portSpec.includes('$')) {
      result.hasEnvVars = true;
      continue;
    }

    // Split by whitespace to handle multiple ports (e.g., EXPOSE 80 443)
    const portTokens = portSpec.split(/\s+/);

    for (const token of portTokens) {
      // Handle port/protocol format (e.g., 8080/tcp)
      const portStr = token.split('/')[0];

      // Handle port ranges (e.g., 8000-9000) — use lower bound
      const rangeMatch = portStr.match(/^(\d+)-\d+$/);
      if (rangeMatch) {
        const port = parseInt(rangeMatch[1], 10);
        if (!isNaN(port) && port > 0 && port < 65536) {
          result.exposedPorts.push(port);
        }
        continue;
      }

      // Handle simple port numbers
      const port = parseInt(portStr, 10);
      if (!isNaN(port) && port > 0 && port < 65536) {
        result.exposedPorts.push(port);
      }
    }
  }

  // Recommend first HTTP-like port (80, 443, or 3000-9999)
  for (const port of result.exposedPorts) {
    if (port === 80 || port === 443 || (port >= 3000 && port <= 9999)) {
      result.recommendedPort = port;
      break;
    }
  }

  // If no HTTP-like port found but we have ports, use the first one
  if (result.recommendedPort === null && result.exposedPorts.length > 0) {
    result.recommendedPort = result.exposedPorts[0];
  }

  return result;
}
