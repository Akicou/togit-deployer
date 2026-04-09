import { query } from '../db/client.js';
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  getGitHubUser,
  upsertUser,
  createSession,
  getSession,
  deleteSession,
  generateState,
} from '../github/oauth.js';
import { logSystem } from '../logger/index.js';
import type { User } from '../types.js';

// Store for OAuth states (in production, use Redis or DB)
const oauthStates = new Map<string, { expiresAt: number }>();

function setCookie(res: Response, name: string, value: string, maxAge: number): void {
  res.headers.append('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

function deleteCookie(res: Response, name: string): void {
  res.headers.append('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function handleGitHubAuth(req: Request): Promise<Response> {
  const state = generateState();
  oauthStates.set(state, { expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 minutes

  const authUrl = getAuthorizationUrl(state);
  return Response.redirect(authUrl, 302);
}

export async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(JSON.stringify({ error: error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!code || !state) {
    return new Response(JSON.stringify({ error: 'Missing code or state' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate state
  const storedState = oauthStates.get(state);
  if (!storedState || storedState.expiresAt < Date.now()) {
    return new Response(JSON.stringify({ error: 'Invalid or expired state' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  oauthStates.delete(state);

  try {
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);

    // Get GitHub user
    const githubUser = await getGitHubUser(accessToken);

    // Upsert user in database
    const user = await upsertUser(githubUser, accessToken);

    // Create session
    const sessionId = await createSession(user.id);

    // Log the login
    await logSystem(`User ${user.github_login} logged in`);

    // Create response with redirect to dashboard
    const response = Response.redirect('/dashboard', 302);
    setCookie(response, 'session_id', sessionId, 7 * 24 * 60 * 60); // 7 days

    return response;
  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(JSON.stringify({ error: 'Authentication failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleMe(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );
  const sessionId = cookies['session_id'] as string | undefined;
  
  if (!sessionId) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const session = await getSession(sessionId);
  
  if (!session) {
    return Response.json({ error: 'Session expired' }, { status: 401 });
  }

  return Response.json({
    user: {
      id: session.user.id,
      github_login: session.user.github_login,
      role: session.user.role,
      created_at: session.user.created_at,
    },
    session: {
      expires_at: session.session.expires_at,
    },
  });
}

export async function handleLogout(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );
  const sessionId = cookies['session_id'] as string | undefined;
  
  if (sessionId) {
    await deleteSession(sessionId);
    await logSystem('User logged out');
  }

  const response = Response.redirect('/login', 302);
  deleteCookie(response, 'session_id');
  return response;
}
