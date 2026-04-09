import { serve } from 'bun';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkConnection, closePool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { checkLocaltonetInstalled, installLocaltonet } from './daemon/localtonet.js';
import { checkDockerRunning } from './daemon/deployer.js';
import { startScheduler, stopScheduler } from './daemon/scheduler.js';
import { cleanupInterruptedBuilds } from './daemon/deployer.js';
import { handleWSOpen, handleWSClose, handleWSError } from './logger/index.js';
import type { WSData } from './logger/index.js';
import { getSession } from './github/oauth.js';
import { logSystem, logError } from './logger/index.js';
import * as authApi from './api/auth.js';
import * as reposApi from './api/repos.js';
import * as deploymentsApi from './api/deployments.js';
import * as logsApi from './api/logs.js';
import * as usersApi from './api/users.js';
import * as accessApi from './api/access-requests.js';
import type { User } from './types.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file if it exists
const envPath = join(__dirname, '../../.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
}

// Also check root .env
const rootEnvPath = join(__dirname, '../../../.env');
if (existsSync(rootEnvPath)) {
  const envContent = readFileSync(rootEnvPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && !process.env[key.trim()] && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
}

// Authentication middleware
async function requireAuth(
  req: Request,
  options: { allowRestricted?: boolean } = {}
): Promise<{ user: User; sessionId: string } | Response> {
  const cookieHeader = req.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );

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

async function requireRole(user: User, ...roles: string[]): Promise<Response | null> {
  if (!roles.includes(user.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// Request context type
interface AppContext {
  user: User;
  params: Record<string, string>;
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS headers for development
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Public auth routes
    if (path === '/api/auth/github' && req.method === 'GET') {
      return authApi.handleGitHubAuth(req as any);
    }

    if (path.startsWith('/api/auth/callback') && req.method === 'GET') {
      return authApi.handleCallback(req as any);
    }

    // Auth routes
    if (path === '/api/auth/me' && req.method === 'GET') {
      const authResult = await requireAuth(req, { allowRestricted: true });
      if (authResult instanceof Response) return authResult;
      return authApi.handleMe(req as any);
    }

    if (path === '/api/auth/logout' && req.method === 'POST') {
      return authApi.handleLogout(req as any);
    }

    // Protected routes - require authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof Response) {
      // Redirect to login if accessing app routes
      if (!path.startsWith('/api/')) {
        return Response.redirect('/login', 302);
      }
      return authResult;
    }

    const { user } = authResult;

    // Repository routes
    if (path === '/api/repos' && req.method === 'GET') {
      return reposApi.listRepos(req as any, user);
    }

    if (path === '/api/repos/search' && req.method === 'GET') {
      return reposApi.searchGitHubRepos(req as any, user);
    }

    if (path === '/api/repos' && req.method === 'POST') {
      return reposApi.addRepo(req as any, user);
    }

    const repoIdMatch = path.match(/^\/api\/repos\/(\d+)$/);
    if (repoIdMatch) {
      const repoId = parseInt(repoIdMatch[1], 10);

      if (req.method === 'PATCH') {
        return reposApi.updateRepo(req as any, user, repoId);
      }

      if (req.method === 'DELETE') {
        return reposApi.deleteRepo(req as any, user, repoId);
      }
    }

    const repoDeployMatch = path.match(/^\/api\/repos\/(\d+)\/deployments$/);
    if (repoDeployMatch) {
      const repoId = parseInt(repoDeployMatch[1], 10);
      return reposApi.getRepoDeployments(req as any, repoId);
    }

    const repoDeployTriggerMatch = path.match(/^\/api\/repos\/(\d+)\/deploy$/);
    if (repoDeployTriggerMatch) {
      const repoId = parseInt(repoDeployTriggerMatch[1], 10);
      return reposApi.triggerDeploy(req as any, user, repoId);
    }

    // Deployment routes
    const deployIdMatch = path.match(/^\/api\/deployments\/(\d+)$/);
    if (deployIdMatch) {
      const deploymentId = parseInt(deployIdMatch[1], 10);
      if (req.method === 'DELETE') {
        return deploymentsApi.deleteDeployment(req as any, deploymentId, user);
      }
      return deploymentsApi.getDeployment(req as any, deploymentId);
    }

    const deployLogsMatch = path.match(/^\/api\/deployments\/(\d+)\/logs$/);
    if (deployLogsMatch) {
      const deploymentId = parseInt(deployLogsMatch[1], 10);
      return deploymentsApi.getDeploymentLogs(req as any, deploymentId);
    }

    if (path === '/api/deployments/recent' && req.method === 'GET') {
      return deploymentsApi.listRecentDeployments(req as any);
    }

    // Log routes
    if (path === '/api/logs' && req.method === 'GET') {
      return logsApi.getGlobalLogs(req as any);
    }

    if (path === '/api/stats' && req.method === 'GET') {
      return logsApi.getStats(req as any);
    }

    if (path === '/api/system/status' && req.method === 'GET') {
      return logsApi.getSystemStatus(req as any);
    }

    // User routes
    if (path === '/api/users' && req.method === 'GET') {
      return usersApi.listUsers(req as any, user);
    }

    const userIdMatch = path.match(/^\/api\/users\/(\d+)$/);
    if (userIdMatch) {
      const targetUserId = parseInt(userIdMatch[1], 10);

      if (req.method === 'PATCH') {
        return usersApi.updateUserRole(req as any, user, targetUserId);
      }
    }

    const userPermMatch = path.match(/^\/api\/users\/(\d+)\/permissions$/);
    if (userPermMatch) {
      const targetUserId = parseInt(userPermMatch[1], 10);
      return usersApi.getUserPermissions(req as any, user, targetUserId);
    }

    const userRepoPermMatch = path.match(/^\/api\/users\/(\d+)\/permissions\/(\d+)$/);
    if (userRepoPermMatch) {
      const targetUserId = parseInt(userRepoPermMatch[1], 10);
      const repoId = parseInt(userRepoPermMatch[2], 10);

      if (req.method === 'PATCH') {
        return usersApi.updateUserPermission(req as any, user, targetUserId, repoId);
      }
    }

    // Settings routes
    if (path === '/api/settings' && req.method === 'GET') {
      return usersApi.getSettings(req as any);
    }

    if (path === '/api/settings' && req.method === 'PATCH') {
      return usersApi.updateSettings(req as any, user);
    }

    // Access request routes
    // POST /api/access-requests — create (allow restricted users)
    const authResultForAR = await requireAuth(req, { allowRestricted: true });
    if (path === '/api/access-requests' && req.method === 'POST') {
      if (authResultForAR instanceof Response) return authResultForAR;
      return accessApi.createAccessRequest(req as any, authResultForAR.user);
    }

    // GET /api/access-requests — list (admin only)
    if (path === '/api/access-requests' && req.method === 'GET') {
      return accessApi.listAccessRequests(req as any, user);
    }

    // PATCH /api/access-requests/:userId — approve/block/ban
    const arMatch = path.match(/^\/api\/access-requests\/(\d+)$/);
    if (arMatch && req.method === 'PATCH') {
      const targetUserId = parseInt(arMatch[1], 10);
      return accessApi.updateAccessRequest(req as any, user, targetUserId);
    }

    // POST /api/access-requests/:userId/kick
    const arKickMatch = path.match(/^\/api\/access-requests\/(\d+)\/kick$/);
    if (arKickMatch && req.method === 'POST') {
      const targetUserId = parseInt(arKickMatch[1], 10);
      return accessApi.kickUser(req as any, user, targetUserId);
    }

    // POST /api/access-requests/:userId/unban
    const arUnbanMatch = path.match(/^\/api\/access-requests\/(\d+)\/unban$/);
    if (arUnbanMatch && req.method === 'POST') {
      const targetUserId = parseInt(arUnbanMatch[1], 10);
      return accessApi.unbanUser(req as any, user, targetUserId);
    }

    // Serve static files for production
    if (process.env.NODE_ENV === 'production') {
      const staticPath = join(__dirname, '../../web/dist');
      
      // Try exact path match
      let filePath = join(staticPath, path.substring(1));
      if (existsSync(filePath) && !filePath.endsWith('/')) {
        return new Response(readFileSync(filePath), {
          headers: { 'Content-Type': getMimeType(filePath) },
        });
      }

      // Try index.html for SPA routes
      if (!path.startsWith('/api/')) {
        const indexPath = join(staticPath, 'index.html');
        if (existsSync(indexPath)) {
          return new Response(readFileSync(indexPath), {
            headers: { 'Content-Type': 'text/html' },
          });
        }
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('Request error:', error);
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

async function startup(): Promise<void> {
  console.log('\n🚀 togit-deployer starting...\n');

  // Run database migrations
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

  // Check/Install Localtonet
  console.log('\n🌐 Checking Localtonet...');
  const localtonetInstalled = await checkLocaltonetInstalled();
  if (!localtonetInstalled) {
    console.log('   Localtonet not found, installing...');
    try {
      await installLocaltonet();
      console.log('✅ Localtonet installed');
    } catch (error) {
      console.error('❌ Failed to install Localtonet:', error);
      console.log('   Please install manually: curl -fsSL https://localtonet.com/install.sh | sh');
    }
  } else {
    console.log('✅ Localtonet is installed');
  }

  // Clean up interrupted deployments from previous runs
  console.log('\n🧹 Cleaning up interrupted deployments...');
  await cleanupInterruptedBuilds();
  console.log('✅ Cleanup completed');

  // Start the scheduler
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

// Start the server
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

    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };

    // Clone response to add headers
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  },
  websocket: {
    open: handleWSOpen,
    close: handleWSClose,
    error: handleWSError,
    message(_ws, _message) {},
  },
});

// Run startup and then start accepting requests
startup().catch((error) => {
  console.error('Startup error:', error);
  process.exit(1);
});

console.log(`Server listening on port ${PORT}`);
