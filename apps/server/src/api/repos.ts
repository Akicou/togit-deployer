import { query } from '../db/client.js';
import { deploy } from '../daemon/deployer.js';
import { getUserRepos } from '../github/api.js';
import { decryptAccessToken } from '../github/oauth.js';
import { z } from 'zod';
import type { Repository, User } from '../types.js';

const addRepoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  root_path: z.string().default('/'),
  deploy_mode: z.enum(['release', 'commit']).default('release'),
  watch_branch: z.string().default('main'),
});

const updateRepoSchema = z.object({
  root_path: z.string().optional(),
  deploy_mode: z.enum(['release', 'commit']).optional(),
  watch_branch: z.string().optional(),
  enabled: z.boolean().optional(),
  deployment_env_vars: z.record(z.string(), z.string()).optional(),
});

export async function listRepos(req: Request, user: User): Promise<Response> {
  let queryText = `
    SELECT r.*, 
           d.ref as last_deployed_ref,
           d.ref_type as last_deployed_ref_type,
           d.status as last_deployment_status,
           d.tunnel_url as last_tunnel_url
    FROM repositories r
    LEFT JOIN LATERAL (
      SELECT ref, ref_type, status, tunnel_url
      FROM deployments
      WHERE repo_id = r.id
      ORDER BY started_at DESC
      LIMIT 1
    ) d ON true
  `;

  const params: unknown[] = [];

  // Filter by user permissions for non-admins
  if (user.role !== 'admin') {
    queryText += `
      WHERE r.enabled = true
      AND (
        r.id IN (
          SELECT repo_id FROM user_repo_permissions 
          WHERE user_id = $1 AND can_view = true
        )
        OR r.added_by = $1
      )
    `;
    params.push(user.id);
  }

  queryText += ' ORDER BY r.created_at DESC';

  const result = await query<Repository & {
    last_deployed_ref: string | null;
    last_deployed_ref_type: string | null;
    last_deployment_status: string | null;
    last_tunnel_url: string | null;
  }>(queryText, params);

  return Response.json({ repos: result.rows });
}

export async function addRepo(req: Request, user: User): Promise<Response> {
  if (user.role === 'viewer') {
    return Response.json({ error: 'Viewers cannot add repositories' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = addRepoSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const { owner, name, root_path, deploy_mode, watch_branch } = parsed.data;
  const full_name = `${owner}/${name}`;

  try {
    const result = await query<Repository>(
      `INSERT INTO repositories (owner, name, full_name, root_path, deploy_mode, watch_branch, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (full_name) DO UPDATE
       SET root_path = $4, deploy_mode = $5, watch_branch = $6
       RETURNING *`,
      [owner, name, full_name, root_path, deploy_mode, watch_branch, user.id]
    );

    return Response.json({ repo: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error adding repo:', error);
    return Response.json({ error: 'Failed to add repository' }, { status: 500 });
  }
}

export async function updateRepo(req: Request, user: User, repoId: number): Promise<Response> {
  if (user.role === 'viewer') {
    return Response.json({ error: 'Viewers cannot update repositories' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateRepoSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (parsed.data.root_path !== undefined) {
    updates.push(`root_path = $${paramIndex++}`);
    values.push(parsed.data.root_path);
  }
  if (parsed.data.deploy_mode !== undefined) {
    updates.push(`deploy_mode = $${paramIndex++}`);
    values.push(parsed.data.deploy_mode);
  }
  if (parsed.data.watch_branch !== undefined) {
    updates.push(`watch_branch = $${paramIndex++}`);
    values.push(parsed.data.watch_branch);
  }
  if (parsed.data.enabled !== undefined) {
    updates.push(`enabled = $${paramIndex++}`);
    values.push(parsed.data.enabled);
  }
  if (parsed.data.deployment_env_vars !== undefined) {
    updates.push(`deployment_env_vars = $${paramIndex++}`);
    values.push(JSON.stringify(parsed.data.deployment_env_vars));
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No updates provided' }, { status: 400 });
  }

  values.push(repoId);

  try {
    const result = await query<Repository>(
      `UPDATE repositories SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'Repository not found' }, { status: 404 });
    }

    return Response.json({ repo: result.rows[0] });
  } catch (error) {
    console.error('Error updating repo:', error);
    return Response.json({ error: 'Failed to update repository' }, { status: 500 });
  }
}

export async function deleteRepo(req: Request, user: User, repoId: number): Promise<Response> {
  if (user.role !== 'admin') {
    return Response.json({ error: 'Only admins can delete repositories' }, { status: 403 });
  }

  try {
    const result = await query(
      'DELETE FROM repositories WHERE id = $1 RETURNING id',
      [repoId]
    );

    if (result.rowCount === 0) {
      return Response.json({ error: 'Repository not found' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting repo:', error);
    return Response.json({ error: 'Failed to delete repository' }, { status: 500 });
  }
}

export async function getRepoDeployments(req: Request, repoId: number): Promise<Response> {
  const result = await query(
    `SELECT d.*, u.github_login as triggered_by_login
     FROM deployments d
     LEFT JOIN users u ON d.triggered_by = u.id
     WHERE d.repo_id = $1
     ORDER BY d.started_at DESC
     LIMIT 50`,
    [repoId]
  );

  return Response.json({ deployments: result.rows });
}

export async function triggerDeploy(req: Request, user: User, repoId: number): Promise<Response> {
  if (user.role === 'viewer') {
    return Response.json({ error: 'Viewers cannot trigger deployments' }, { status: 403 });
  }

  // Get the repo
  const repoResult = await query<Repository>(
    'SELECT * FROM repositories WHERE id = $1',
    [repoId]
  );

  if (repoResult.rows.length === 0) {
    return Response.json({ error: 'Repository not found' }, { status: 404 });
  }

  const repo = repoResult.rows[0];

  // Block if a deployment is already in progress
  const inProgress = await query<{ id: number }>(
    `SELECT id FROM deployments WHERE repo_id = $1 AND status IN ('pending', 'building') LIMIT 1`,
    [repoId]
  );
  if (inProgress.rows.length > 0) {
    return Response.json({ error: 'A deployment is already in progress for this repository' }, { status: 409 });
  }

  // Extract environment variables for this deployment from request body
  let env_vars: Record<string, string> = {};
  try {
    const body = await req.json();
    if (typeof body === 'object' && body !== null && 'env_vars' in body) {
      env_vars = body.env_vars || {};
    }
  } catch {
    // ignore invalid json
  }

  // Get the latest ref based on deploy mode
  let ref: string;
  let refType: 'release' | 'commit';

  if (repo.deploy_mode === 'release') {
    const { getLatestRelease } = await import('../github/api.js');
    const release = await getLatestRelease(repo.owner, repo.name, undefined, repo.watch_branch);
    if (!release) {
      return Response.json({ error: 'No releases found' }, { status: 404 });
    }
    ref = release.tag_name;
    refType = 'release';
  } else {
    const { getLatestCommit } = await import('../github/api.js');
    const commit = await getLatestCommit(repo.owner, repo.name, undefined, repo.watch_branch);
    if (!commit) {
      return Response.json({ error: 'No commits found' }, { status: 404 });
    }
    ref = commit.sha;
    refType = 'commit';
  }

  try {
    const deployment = await deploy(repo, ref, refType, user, env_vars);
    return Response.json({ deployment }, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}

export async function getEnvExample(req: Request, user: User, repoId: number): Promise<Response> {
  // Get the repo
  const repo = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repoId]);
  if (repo.rows.length === 0) {
    return Response.json({ error: 'Repository not found' }, { status: 404 });
  }

  const repoData = repo.rows[0];

  try {
    // Get GitHub token
    const tokenResult = await query<{ github_access_token: string }>(
      'SELECT github_access_token FROM users WHERE id = $1',
      [repoData.added_by || user.id]
    );

    if (!tokenResult.rows[0]?.github_access_token) {
      return Response.json({ error: 'No GitHub token found' }, { status: 401 });
    }

    const accessToken = decryptAccessToken(tokenResult.rows[0].github_access_token);

    // Fetch .env.example from the repository
    const path = repoData.root_path === '/' ? '.env.example' : `${repoData.root_path}/.env.example`;
    const url = `https://api.github.com/repos/${repoData.owner}/${repoData.name}/contents/${path}?ref=${repoData.watch_branch}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'togit-deployer',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return Response.json({ env_example: null, message: 'No .env.example found in repository' });
      }
      return Response.json({ error: `GitHub API error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json() as { content: string; encoding: string };
    
    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    
    // Parse env vars from .env.example
    const envVars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    }

    return Response.json({ 
      env_example: envVars,
      raw_content: content,
      message: 'Found .env.example'
    });
  } catch (error) {
    console.error('Error fetching .env.example:', error);
    return Response.json({ error: 'Failed to fetch .env.example' }, { status: 500 });
  }
}

export async function searchGitHubRepos(req: Request, user: User): Promise<Response> {
  const url = new URL(req.url);
  const query_ = url.searchParams.get('q') || '';

  try {
    const tokenResult = await query<{ github_access_token: string }>(
      'SELECT github_access_token FROM users WHERE id = $1',
      [user.id]
    );

    if (!tokenResult.rows[0]?.github_access_token) {
      return Response.json({ error: 'No GitHub token found' }, { status: 401 });
    }

    const accessToken = decryptAccessToken(tokenResult.rows[0].github_access_token);
    const repos = await getUserRepos(accessToken);

    // Filter by query if provided
    const filtered = query_
      ? repos.filter((r) =>
          r.name.toLowerCase().includes(query_.toLowerCase()) ||
          r.full_name.toLowerCase().includes(query_.toLowerCase())
        )
      : repos;

    return Response.json({
      repos: filtered.map((r) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        owner: r.owner.login,
      })),
    });
  } catch (error) {
    console.error('Error searching repos:', error);
    return Response.json({ error: 'Failed to search repositories' }, { status: 500 });
  }
}
