import { query } from '../db/client.js';
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  getGitHubUser,
  upsertUser,
  createSession,
  getSession,
  deleteSession,
} from '../github/oauth.js';
import { logSystem } from '../logger/index.js';
import type { User } from '../types.js';
import { setCookie, clearCookie, parseCookies } from '../utils/cookie.js';
import { generateAndStoreOAuthState, validateAndConsumeOAuthState } from '../utils/oauth-states.js';

export async function handleGitHubAuth(req: Request): Promise<Response> {
  const state = await generateAndStoreOAuthState();
  const authUrl = getAuthorizationUrl(state);
  return Response.redirect(authUrl, 302);
}

export async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(JSON.stringify({ error }), {
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

  // Validate state from DB (prevents replay attacks, survives restarts)
  const isValid = await validateAndConsumeOAuthState(state);
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid or expired state' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
    setCookie(response.headers, 'session_id', sessionId, { maxAge: 7 * 24 * 60 * 60 });

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
  const sessionId = parseCookies(cookieHeader)['session_id'];
  
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
      access_level: session.user.access_level,
      created_at: session.user.created_at,
    },
    session: {
      expires_at: session.session.expires_at,
    },
  });
}

export async function handleLogout(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get('Cookie') || '';
  const sessionId = parseCookies(cookieHeader)['session_id'];
  
  if (sessionId) {
    await deleteSession(sessionId);
    await logSystem('User logged out');
  }

  const response = Response.redirect('/login', 302);
  clearCookie(response.headers, 'session_id');
  return response;
}
