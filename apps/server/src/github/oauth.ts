import crypto from 'crypto';
import { query } from '../db/client.js';
import type { User } from '../types.js';

const GITHUB_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET || '';
const GITHUB_CALLBACK_URL = process.env.GITHUB_APP_CALLBACK_URL || 'http://localhost:3000/api/auth/callback';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_me_random_32chars';

const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): string {
  const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encrypted: string): string {
  const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
  const [ivHex, tagHex, encryptedHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encryptedText) + decipher.final('utf8');
}

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: 'repo,read:user',
    redirect_uri: GITHUB_CALLBACK_URL,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = (await response.json()) as { error?: string; error_description?: string; access_token?: string };
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data.access_token || '';
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url?: string;
  email?: string;
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'togit-deployer',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return (await response.json()) as GitHubUser;
}

// Get admin GitHub username from environment
const ADMIN_GITHUB_LOGIN = process.env.ADMIN_GITHUB_LOGIN || '';

export async function upsertUser(githubUser: GitHubUser, accessToken: string): Promise<User> {
  const encryptedToken = encrypt(accessToken);
  const isAdminUser = ADMIN_GITHUB_LOGIN && githubUser.login.toLowerCase() === ADMIN_GITHUB_LOGIN.toLowerCase();

  // Check if user exists
  const existing = await query<User>(
    'SELECT * FROM users WHERE github_id = $1',
    [githubUser.id]
  );

  if (existing.rows.length > 0) {
    // Update existing user - promote to admin if they match ADMIN_GITHUB_LOGIN
    const result = await query<User>(
      `UPDATE users 
       SET github_login = $2, github_access_token = $3, role = $4, access_level = $5
       WHERE github_id = $1
       RETURNING *`,
      [githubUser.id, githubUser.login, encryptedToken, isAdminUser ? 'admin' : existing.rows[0].role, isAdminUser ? 'approved' : existing.rows[0].access_level]
    );
    if (isAdminUser) {
      console.log(`User ${githubUser.login} promoted to admin with approved access`);
    }
    return result.rows[0];
  }

  // Determine role and access level
  const countResult = await query<{ count: string }>('SELECT COUNT(*) FROM users');
  const isFirstUser = parseInt(countResult.rows[0].count, 10) === 0;
  
  const role = isFirstUser || isAdminUser ? 'admin' : 'viewer';
  const accessLevel = isAdminUser ? 'approved' : 'pending';

  // Insert new user
  const result = await query<User>(
    `INSERT INTO users (github_id, github_login, github_access_token, role, access_level)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [githubUser.id, githubUser.login, encryptedToken, role, accessLevel]
  );

  console.log(`New user registered: ${githubUser.login} with role: ${role} and access_level: ${accessLevel}`);
  return result.rows[0];
}

export function decryptAccessToken(encryptedToken: string): string {
  try {
    return decrypt(encryptedToken);
  } catch {
    return '';
  }
}

export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: number): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await query(
    `INSERT INTO sessions (id, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [sessionId, userId, expiresAt]
  );

  return sessionId;
}

export async function getSession(sessionId: string): Promise<{ user: User; session: { id: string; expires_at: Date } } | null> {
  const result = await query<{
    session_id: string;
    session_expires_at: Date;
    user_id: number;
    github_id: number;
    github_login: string;
    github_access_token: string;
    role: 'admin' | 'deployer' | 'viewer';
    access_level: 'pending' | 'approved' | 'blocked' | 'banned';
    created_at: Date;
  }>(
    `SELECT 
       s.id as session_id,
       s.expires_at as session_expires_at,
       u.id as user_id,
       u.github_id,
       u.github_login,
       u.github_access_token,
       u.role,
       u.access_level,
       u.created_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    user: {
      id: row.user_id,
      github_id: row.github_id,
      github_login: row.github_login,
      github_access_token: row.github_access_token,
      role: row.role,
      access_level: row.access_level,
      created_at: row.created_at,
    },
    session: {
      id: row.session_id,
      expires_at: row.session_expires_at,
    },
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}
