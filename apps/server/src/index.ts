import { serve } from 'bun';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkConnection, closePool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { checkLocaltonetInstalled, installLocaltonet } from './daemon/localtonet.js';
import { checkDockerRunning, cleanupInterruptedBuilds, pruneUnusedImages } from './daemon/deployer.js';
import { startScheduler, stopScheduler } from './daemon/scheduler.js';
import { cleanupExpiredOAuthStates } from './utils/oauth-states.js';
import { parseCookies } from './utils/cookie.js';
import { handleWSOpen, handleWSClose } from './logger/index.js';
import type { WSData } from './logger/index.js';
import { getSession } from './github/oauth.js';
import { logSystem, logError } from './logger/index.js';
import * as authApi from './api/auth.js';
import * as reposApi from './api/repos.js';
import * as deploymentsApi from './api/deployments.js';
import * as logsApi from './api/logs.js';
import * as usersApi from './api/users.js';
import * as accessApi from './api/access-requests.js';
import { handleGitHubWebhook } from './api/webhooks.js';
import type { User } from './types.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env files using robust parser
loadEnvFiles();

// ─── Authentication middleware ───────────────────────────────────────────────

async function requireAuth(
  req: Request,
  options: { allowRestricted?: boolean } = {}
): Promise<{ user: User; sessionId: string } | Response> {
  const cookies = parseCookies(req.headers.get('Cookie'));
  const sessionId = cookies['session_id'];

  if (!sessionId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return Response.json({ error: 'Session expired' }, { status: 401 });
  }

  if (!options.allowRestricted && session.user.access_level !== 'approved') {
    return Response.json({
      error: 'Access restricted',
      access_level: session.user.access_level,
    }, { status: 403 });
  }

  return { user: session.user, sessionId };
}

// ─── Simple route matcher ────────────────────────────────────────────────────

/**
 * Lightweight route matcher. Replaces the if/regex chain in handleRequest.
 * Returns route params if the path matches the pattern, null otherwise.
 * Pattern uses :param syntax, e.g. /api/repos/:id/deployments
 */
function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length + 1) return null; // +1 for leading empty

  const params: Record<string, string> = {};
  for (let i = 1; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = pathParts[i - 1];
    } else if (p !== pathParts[i - 1]) {
      return null;
    }
  }

  return params;
}

// ─── Request handler ─────────────────────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS headers
  const addCors = (response: Response): Response => {
    const origin = process.env.ALLOWED_ORIGIN || '*';
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Allow-Credentials', 'true');
    return new Response(response.body, { status: response.status, headers });
  };

  if (req.method === 'OPTIONS') {
    return addCors(new Response(null));
  }

  try {
    // ── Public auth routes ───────────────────────────────────────────────────
    if (path === '/api/auth/github' && req.method === 'GET') {
      return addCors(await authApi.handleGitHubAuth(req));
    }
    if (path.startsWith('/api/auth/callback') && req.method === 'GET') {
      return addCors(await authApi.handleCallback(req));
    }

    // ── Public webhook routes (no auth — verified via HMAC signature) ────────
    if (path === '/api/webhooks/github' && req.method === 'POST') {
      return addCors(await handleGitHubWebhook(req));
    }

    // ── Auth routes (no auth required for /me, but reads session) ────────────
    if (path === '/api/auth/me' && req.method === 'GET') {
      const authResult = await requireAuth(req, { allowRestricted: true });
      if (authResult instanceof Response) return addCors(authResult);
      return addCors(await authApi.handleMe(req));
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      return addCors(await authApi.handleLogout(req));
    }

    // ── All protected routes require authentication ─────────────────────────
    const authResult = await requireAuth(req);
    if (authResult instanceof Response) {
      if (!path.startsWith('/api/')) {
        return Response.redirect('/login', 302);
      }
      return addCors(authResult);
    }
    const { user } = authResult;

    // ── Repository routes ────────────────────────────────────────────────────
    if (path === '/api/repos' && req.method === 'GET') {
      return addCors(await reposApi.listRepos(req, user));
    }
    if (path === '/api/repos/search' && req.method === 'GET') {
      return addCors(await reposApi.searchGitHubRepos(req, user));
    }
    if (path === '/api/repos' && req.method === 'POST') {
      return addCors(await reposApi.addRepo(req, user));
    }

    let params: Record<string, string> | null;

    // PATCH/DELETE /api/repos/:id
    params = matchRoute('/api/repos/:id', path);
    if (params && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const repoId = parseInt(params.id, 10);
      if (isNaN(repoId)) return addCors(Response.json({ error: 'Invalid repo ID' }, { status: 400 }));
      if (req.method === 'PATCH') return addCors(await reposApi.updateRepo(req, user, repoId));
      if (req.method === 'DELETE') return addCors(await reposApi.deleteRepo(req, user, repoId));
    }

    // GET /api/repos/:id/deployments
    params = matchRoute('/api/repos/:id/deployments', path);
    if (params && req.method === 'GET') {
      const repoId = parseInt(params.id, 10);
      if (isNaN(repoId)) return addCors(Response.json({ error: 'Invalid repo ID' }, { status: 400 }));
      return addCors(await reposApi.getRepoDeployments(req, repoId));
    }

    // POST /api/repos/:id/deploy
    params = matchRoute('/api/repos/:id/deploy', path);
    if (params && req.method === 'POST') {
      const repoId = parseInt(params.id, 10);
      if (isNaN(repoId)) return addCors(Response.json({ error: 'Invalid repo ID' }, { status: 400 }));
      return addCors(await reposApi.triggerDeploy(req, user, repoId));
    }

    // GET /api/repos/:id/env-example
    params = matchRoute('/api/repos/:id/env-example', path);
    if (params && req.method === 'GET') {
      const repoId = parseInt(params.id, 10);
      if (isNaN(repoId)) return addCors(Response.json({ error: 'Invalid repo ID' }, { status: 400 }));
      return addCors(await reposApi.getEnvExample(req, user, repoId));
    }

    // ── Deployment routes ────────────────────────────────────────────────────
    // GET/DELETE /api/deployments/:id
    params = matchRoute('/api/deployments/:id', path);
    if (params) {
      const deploymentId = parseInt(params.id, 10);
      if (isNaN(deploymentId)) return addCors(Response.json({ error: 'Invalid deployment ID' }, { status: 400 }));
      if (req.method === 'GET') return addCors(await deploymentsApi.getDeployment(req, deploymentId));
      if (req.method === 'DELETE') return addCors(await deploymentsApi.deleteDeployment(req, deploymentId, user));
    }

    // GET /api/deployments/:id/logs
    params = matchRoute('/api/deployments/:id/logs', path);
    if (params && req.method === 'GET') {
      const deploymentId = parseInt(params.id, 10);
      if (isNaN(deploymentId)) return addCors(Response.json({ error: 'Invalid deployment ID' }, { status: 400 }));
      return addCors(await deploymentsApi.getDeploymentLogs(req, deploymentId));
    }

    if (path === '/api/deployments/recent' && req.method === 'GET') {
      return addCors(await deploymentsApi.listRecentDeployments(req));
    }

    // ── Tunnel management routes ─────────────────────────────────────────────
    if (path === '/api/tunnels' && req.method === 'GET') {
      return addCors(await deploymentsApi.listActiveTunnels(req, user));
    }

    params = matchRoute('/api/tunnels/:id/stop', path);
    if (params && req.method === 'POST') {
      const deploymentId = parseInt(params.id, 10);
      if (isNaN(deploymentId)) return addCors(Response.json({ error: 'Invalid tunnel ID' }, { status: 400 }));
      return addCors(await deploymentsApi.stopTunnel(req, user, deploymentId));
    }

    if (path === '/api/tunnels/test' && req.method === 'POST') {
      return addCors(await deploymentsApi.testLocaltonetConnection(req, user));
    }

    params = matchRoute('/api/tunnels/:id/status', path);
    if (params && req.method === 'GET') {
      return addCors(await deploymentsApi.getTunnelStatus(req, user, params.id));
    }

    // ── Log routes ───────────────────────────────────────────────────────────
    if (path === '/api/logs' && req.method === 'GET') {
      return addCors(await logsApi.getGlobalLogs(req));
    }
    if (path === '/api/stats' && req.method === 'GET') {
      return addCors(await logsApi.getStats(req));
    }
    if (path === '/api/system/status' && req.method === 'GET') {
      return addCors(await logsApi.getSystemStatus(req));
    }

    // ── User routes ──────────────────────────────────────────────────────────
    if (path === '/api/users' && req.method === 'GET') {
      return addCors(await usersApi.listUsers(req, user));
    }

    params = matchRoute('/api/users/:id', path);
    if (params && req.method === 'PATCH') {
      const targetUserId = parseInt(params.id, 10);
      if (isNaN(targetUserId)) return addCors(Response.json({ error: 'Invalid user ID' }, { status: 400 }));
      return addCors(await usersApi.updateUserRole(req, user, targetUserId));
    }

    params = matchRoute('/api/users/:id/permissions', path);
    if (params && req.method === 'GET') {
      const targetUserId = parseInt(params.id, 10);
      if (isNaN(targetUserId)) return addCors(Response.json({ error: 'Invalid user ID' }, { status: 400 }));
      return addCors(await usersApi.getUserPermissions(req, user, targetUserId));
    }

    params = matchRoute('/api/users/:id/permissions/:repoId', path);
    if (params && req.method === 'PATCH') {
      const targetUserId = parseInt(params.id, 10);
      const repoId = parseInt(params.repoId, 10);
      if (isNaN(targetUserId) || isNaN(repoId)) return addCors(Response.json({ error: 'Invalid IDs' }, { status: 400 }));
      return addCors(await usersApi.updateUserPermission(req, user, targetUserId, repoId));
    }

    // ── Settings routes ──────────────────────────────────────────────────────
    if (path === '/api/settings' && req.method === 'GET') {
      return addCors(await usersApi.getSettings(req));
    }
    if (path === '/api/settings' && req.method === 'PATCH') {
      return addCors(await usersApi.updateSettings(req, user));
    }
    if (path === '/api/system/config' && req.method === 'GET') {
      return addCors(await usersApi.getSystemConfig(req));
    }

    // ── Image pruning (new endpoint) ─────────────────────────────────────────
    if (path === '/api/images/prune' && req.method === 'POST') {
      if (user.role !== 'admin') {
        return addCors(Response.json({ error: 'Only admins can prune images' }, { status: 403 }));
      }
      return addCors(Response.json(await pruneUnusedImages()));
    }

    // ── Access request routes ────────────────────────────────────────────────
    // POST — create (allow restricted users)
    if (path === '/api/access-requests' && req.method === 'POST') {
      const restrictedAuth = await requireAuth(req, { allowRestricted: true });
      if (restrictedAuth instanceof Response) return addCors(restrictedAuth);
      return addCors(await accessApi.createAccessRequest(req, restrictedAuth.user));
    }
    // GET — list (admin only)
    if (path === '/api/access-requests' && req.method === 'GET') {
      return addCors(await accessApi.listAccessRequests(req, user));
    }
    // PATCH /api/access-requests/:id
    params = matchRoute('/api/access-requests/:id', path);
    if (params && req.method === 'PATCH') {
      const targetUserId = parseInt(params.id, 10);
      if (isNaN(targetUserId)) return addCors(Response.json({ error: 'Invalid user ID' }, { status: 400 }));
      return addCors(await accessApi.updateAccessRequest(req, user, targetUserId));
    }
    // POST /api/access-requests/:id/kick
    params = matchRoute('/api/access-requests/:id/kick', path);
    if (params && req.method === 'POST') {
      const targetUserId = parseInt(params.id, 10);
      if (isNaN(targetUserId)) return addCors(Response.json({ error: 'Invalid user ID' }, { status: 400 }));
      return addCors(await accessApi.kickUser(req, user, targetUserId));
    }
    // POST /api/access-requests/:id/unban
    params = matchRoute('/api/access-requests/:id/unban', path);
    if (params && req.method === 'POST') {
      const targetUserId = parseInt(params.id, 10);
      if (isNaN(targetUserId)) return addCors(Response.json({ error: 'Invalid user ID' }, { status: 400 }));
      return addCors(await accessApi.unbanUser(req, user, targetUserId));
    }

    // ── Serve static files (production) ──────────────────────────────────────
    if (process.env.NODE_ENV === 'production') {
      const staticPath = join(__dirname, '../../web/dist');

      let filePath = join(staticPath, path.substring(1));
      if (existsSync(filePath) && !filePath.endsWith('/')) {
        return new Response(readFileSync(filePath), {
          headers: { 'Content-Type': getMimeType(filePath) },
        });
      }
      if (!path.startsWith('/api/')) {
        const indexPath = join(staticPath, 'index.html');
        if (existsSync(indexPath)) {
          return new Response(readFileSync(indexPath), {
            headers: { 'Content-Type': 'text/html' },
          });
        }
      }
    }

    return addCors(Response.json({ error: 'Not found' }, { status: 404 }));
  } catch (error) {
    logError(`Request error: ${error instanceof Error ? error.message : String(error)}`);
    return Response.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    js: 'application/javascript',
    ts: 'application/javascript',
    css: 'text/css',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

// ─── Startup ─────────────────────────────────────────────────────────────────

async function startup(): Promise<void> {
  console.log('\n🚀 togit-deployer starting...\n');

  // Check database
  console.log('📦 Checking database...');
  const dbConnected = await checkConnection();
  if (!dbConnected) {
    console.error('❌ Failed to connect to database. Make sure PostgreSQL is running.');
    console.log('   Run: docker-compose up -d postgres');
    process.exit(1);
  }
  console.log('✅ Database connected');

  await runMigrations();

  // Check Docker
  console.log('\n🐳 Checking Docker...');
  const dockerRunning = await checkDockerRunning();
  if (!dockerRunning) {
    console.error('❌ Docker is not running. Please start Docker and try again.');
    process.exit(1);
  }
  console.log('✅ Docker is running');

  // Check Localtonet (env var check only; no network call)
  console.log('\n🌐 Checking Localtonet...');
  const localtonetInstalled = checkLocaltonetInstalled();
  if (!localtonetInstalled) {
    console.warn('⚠️  LOCALTONET_AUTH_TOKEN not set in .env. Tunnel features will be unavailable.');
  } else {
    console.log('✅ Localtonet token is configured');
  }

  // Clean up interrupted deployments
  console.log('\n🧹 Cleaning up interrupted deployments...');
  await cleanupInterruptedBuilds();
  console.log('✅ Cleanup completed');

  // Start scheduler
  console.log('\n⏰ Starting deployment scheduler...');
  await startScheduler();
  console.log('✅ Scheduler started');

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🎉 togit-deployer is ready!');
  console.log('');
  console.log(`  🌐 Server:   http://localhost:${PORT}`);
  console.log(`  📊 API:      http://localhost:${PORT}/api`);
  console.log('═══════════════════════════════════════════════════════\n');
}

// ─── Shutdown ────────────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down gracefully...');

  try {
    await stopScheduler();
    console.log('✅ Scheduler stopped');
  } catch (error) {
    console.error('Error stopping scheduler:', error);
  }

  try {
    const { stopAllTunnels } = await import('./daemon/localtonet.js');
    await stopAllTunnels();
    console.log('✅ All tunnels stopped');
  } catch (error) {
    console.error('Error stopping tunnels:', error);
  }

  try {
    const { stopAllTogitContainers } = await import('./daemon/deployer.js');
    await stopAllTogitContainers();
    console.log('✅ All containers stopped');
  } catch (error) {
    console.error('Error stopping containers:', error);
  }

  try {
    await closePool();
    console.log('✅ Database pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error);
  }

  console.log('👋 Goodbye!');
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Periodic cleanup of expired OAuth states (every hour)
setInterval(async () => {
  try {
    const count = await cleanupExpiredOAuthStates();
    if (count > 0) console.log(`Cleaned up ${count} expired OAuth states`);
  } catch (err) {}
}, 60 * 60 * 1000);

// ─── Bun server ──────────────────────────────────────────────────────────────

const server = serve<WSData>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade for /ws/logs
    if (url.pathname === '/ws/logs') {
      const deploymentId = url.searchParams.get('deploymentId');
      let key: number | 'global' = 'global';
      if (deploymentId && deploymentId !== 'all') {
        const parsed = parseInt(deploymentId, 10);
        if (!isNaN(parsed)) key = parsed;
      }
      server.upgrade(req, { data: { key } });
      return;
    }

    const response = await handleRequest(req);

    if (response.status !== 302 && response.status !== 301) {
      const origin = process.env.ALLOWED_ORIGIN || '*';
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      headers.set('Access-Control-Allow-Credentials', 'true');
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
  websocket: {
    open: handleWSOpen,
    close: handleWSClose,
    message(_ws, _message) {},
  },
});

// Run startup then start accepting requests
startup().catch((error) => {
  console.error('Startup error:', error);
  process.exit(1);
});

console.log(`Server listening on port ${PORT}`);
