import { query } from '../db/client.js';
import { deploy, acquireDeployLock, releaseDeployLock } from '../daemon/deployer.js';
import { getUserRepos, searchPublicRepos } from '../github/api.js';
import { decryptAccessToken } from '../github/oauth.js';
import { z } from 'zod';
import type { Repository, User } from '../types.js';
import { checkProjectAccess } from './projects.js';

const addRepoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  project_id: z.number().int().positive(),
  root_path: z.string().default('/'),
  deploy_mode: z.enum(['release', 'commit']).default('release'),
  watch_branch: z.string().default('main'),
  service_name: z.string().min(1).max(63).regex(/^[a-z0-9][a-z0-9_-]*$/, 'Service name must be lowercase alphanumeric, dashes, or underscores').default('app'),
});

const updateRepoSchema = z.object({
  project_id: z.number().int().positive().optional(),
  root_path: z.string().optional(),
  deploy_mode: z.enum(['release', 'commit']).optional(),
  watch_branch: z.string().optional(),
  enabled: z.boolean().optional(),
  deployment_env_vars: z.record(z.string(), z.string()).optional(),
  service_name: z.string().min(1).max(63).regex(/^[a-z0-9][a-z0-9_-]*$/, 'Service name must be lowercase alphanumeric, dashes, or underscores').optional(),
  container_port: z.number().int().min(1).max(65535).optional(),
  tunnel_type: z.enum(['random', 'subdomain', 'custom-domain']).optional(),
  tunnel_subdomain: z.string().nullable().optional(),
  tunnel_domain: z.string().nullable().optional(),
});

export async function listRepos(req: Request, user: User): Promise<Response> {
  let queryText = `
    SELECT r.*,
           d.ref as last_deployed_ref,
           d.ref_type as last_deployed_ref_type,
           d.status as last_deployment_status,
           st.tunnel_url as last_tunnel_url,
           p.name as project_name
    FROM repositories r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN LATERAL (
      SELECT ref, ref_type, status
      FROM deployments
      WHERE repo_id = r.id
      ORDER BY started_at DESC
      LIMIT 1
    ) d ON true
    LEFT JOIN LATERAL (
      SELECT tunnel_url
      FROM service_tunnels
      WHERE repo_id = r.id AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    ) st ON true
  `;

  const params: unknown[] = [];
  if (user.role !== 'admin') {
    queryText += `
      WHERE r.enabled = true
      AND (
        r.added_by = $1
        OR EXISTS (
          SELECT 1 FROM projects p2 WHERE p2.id = r.project_id AND p2.created_by = $1
        )
        OR EXISTS (
          SELECT 1 FROM user_project_permissions upp
          WHERE upp.project_id = r.project_id AND upp.user_id = $1 AND upp.can_view = true
        )
      )
    `;
    params.push(user.id);
  }

  queryText += ' ORDER BY r.created_at DESC';
  const result = await query(queryText, params);
  return Response.json({ repos: result.rows });
}

export async function addRepo(req: Request, user: User): Promise<Response> {
  if (user.role === 'viewer') {
    return Response.json({ error: 'Viewers cannot add repositories' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = addRepoSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  const { owner, name, project_id, root_path, deploy_mode, watch_branch, service_name } = parsed.data;
  const canUseProject = await checkProjectAccess(user, project_id, 'deploy');
  if (!canUseProject) return Response.json({ error: 'No deploy access to target project' }, { status: 403 });

  const full_name = `${owner}/${name}`;
  const existingRepo = await query<Repository>(
    `SELECT id, full_name, service_name FROM repositories WHERE full_name = $1 AND service_name = $2`,
    [full_name, service_name]
  );
  if (existingRepo.rows.length > 0) {
    return Response.json({ error: `Repository '${full_name}' with service '${service_name}' already exists.` }, { status: 409 });
  }

  try {
    const result = await query<Repository>(
      `INSERT INTO repositories (owner, name, full_name, project_id, root_path, deploy_mode, watch_branch, added_by, service_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [owner, name, full_name, project_id, root_path, deploy_mode, watch_branch, user.id, service_name]
    );
    return Response.json({ repo: result.rows[0] }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to add repository' }, { status: 500 });
  }
}

export async function updateRepo(req: Request, user: User, repoId: number): Promise<Response> {
  if (user.role === 'viewer') return Response.json({ error: 'Viewers cannot update repositories' }, { status: 403 });

  const current = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repoId]);
  if (current.rows.length === 0) return Response.json({ error: 'Repository not found' }, { status: 404 });
  const repo = current.rows[0];
  if (repo.project_id && !(await checkProjectAccess(user, repo.project_id, 'deploy'))) {
    return Response.json({ error: 'No deploy access to this project' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = updateRepoSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  if (parsed.data.project_id !== undefined) {
    const canMove = await checkProjectAccess(user, parsed.data.project_id, 'deploy');
    if (!canMove) return Response.json({ error: 'No deploy access to target project' }, { status: 403 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (parsed.data.project_id !== undefined) { updates.push(`project_id = $${i++}`); values.push(parsed.data.project_id); }
  if (parsed.data.root_path !== undefined) { updates.push(`root_path = $${i++}`); values.push(parsed.data.root_path); }
  if (parsed.data.deploy_mode !== undefined) { updates.push(`deploy_mode = $${i++}`); values.push(parsed.data.deploy_mode); }
  if (parsed.data.watch_branch !== undefined) { updates.push(`watch_branch = $${i++}`); values.push(parsed.data.watch_branch); }
  if (parsed.data.enabled !== undefined) { updates.push(`enabled = $${i++}`); values.push(parsed.data.enabled); }
  if (parsed.data.deployment_env_vars !== undefined) { updates.push(`deployment_env_vars = $${i++}::jsonb`); values.push(JSON.stringify(parsed.data.deployment_env_vars)); }
  if (parsed.data.service_name !== undefined) { updates.push(`service_name = $${i++}`); values.push(parsed.data.service_name); }
  if (parsed.data.container_port !== undefined) { updates.push(`container_port = $${i++}`); values.push(parsed.data.container_port); }
  if (parsed.data.tunnel_type !== undefined) { updates.push(`tunnel_type = $${i++}`); values.push(parsed.data.tunnel_type); }
  if (parsed.data.tunnel_subdomain !== undefined) { updates.push(`tunnel_subdomain = $${i++}`); values.push(parsed.data.tunnel_subdomain); }
  if (parsed.data.tunnel_domain !== undefined) { updates.push(`tunnel_domain = $${i++}`); values.push(parsed.data.tunnel_domain); }
  if (updates.length === 0) return Response.json({ error: 'No updates provided' }, { status: 400 });
  values.push(repoId);

  const result = await query<Repository>(`UPDATE repositories SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return Response.json({ repo: result.rows[0] });
}

export async function deleteRepo(req: Request, user: User, repoId: number): Promise<Response> {
  if (user.role !== 'admin') return Response.json({ error: 'Only admins can delete repositories' }, { status: 403 });
  const repoResult = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repoId]);
  if (repoResult.rows.length === 0) return Response.json({ error: 'Repository not found' }, { status: 404 });

  const running = await query<{ container_id: string }>(
    `SELECT container_id FROM deployments WHERE repo_id = $1 AND status = 'running' AND container_id IS NOT NULL LIMIT 1`,
    [repoId]
  );
  if (running.rows[0]?.container_id) {
    const { stopContainer } = await import('../daemon/deployer.js');
    await stopContainer(running.rows[0].container_id).catch(() => {});
  }

  const { deleteServiceTunnelByRepo } = await import('../daemon/tunnel-manager.js');
  await deleteServiceTunnelByRepo(repoId).catch(() => {});
  await query('DELETE FROM repositories WHERE id = $1', [repoId]);
  return Response.json({ success: true });
}

export async function resetTunnel(req: Request, user: User, repoId: number): Promise<Response> {
  if (user.role === 'viewer') return Response.json({ error: 'Forbidden' }, { status: 403 });
  const repoResult = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repoId]);
  if (repoResult.rows.length === 0) return Response.json({ error: 'Repository not found' }, { status: 404 });
  const repo = repoResult.rows[0];
  if (repo.project_id && !(await checkProjectAccess(user, repo.project_id, 'deploy'))) {
    return Response.json({ error: 'No deploy access to this project' }, { status: 403 });
  }
  const { deleteServiceTunnelByRepo } = await import('../daemon/tunnel-manager.js');
  await deleteServiceTunnelByRepo(repoId).catch(() => {});
  await query('UPDATE repositories SET tunnel_enabled = false WHERE id = $1', [repoId]);
  return Response.json({ success: true, message: 'Active service tunnel removed.' });
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
  if (user.role === 'viewer') return Response.json({ error: 'Viewers cannot trigger deployments' }, { status: 403 });

  const repoResult = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repoId]);
  if (repoResult.rows.length === 0) return Response.json({ error: 'Repository not found' }, { status: 404 });
  const repo = repoResult.rows[0];
  if (repo.project_id && !(await checkProjectAccess(user, repo.project_id, 'deploy'))) {
    return Response.json({ error: 'No deploy access to this project' }, { status: 403 });
  }

  let force = false;
  try {
    const body = await req.json();
    if (typeof body === 'object' && body !== null) {
      if ('force' in body) force = body.force === true;
    }
  } catch {}

  const hasLock = await acquireDeployLock(repoId);
  if (!hasLock) {
    if (!force) return Response.json({ error: 'A deployment is already in progress for this repository' }, { status: 409 });
    releaseDeployLock(repoId);
    await acquireDeployLock(repoId);
  }

  try {
    let ref: string;
    let refType: 'release' | 'commit';

    if (repo.deploy_mode === 'release') {
      const { getLatestRelease } = await import('../github/api.js');
      const release = await getLatestRelease(repo.owner, repo.name, undefined, repo.watch_branch);
      if (!release) return Response.json({ error: 'No releases found' }, { status: 404 });
      ref = release.tag_name;
      refType = 'release';
    } else {
      const { getLatestCommit } = await import('../github/api.js');
      const commit = await getLatestCommit(repo.owner, repo.name, undefined, repo.watch_branch);
      if (!commit) return Response.json({ error: 'No commits found' }, { status: 404 });
      ref = commit.sha;
      refType = 'commit';
    }

    // Use repo-level env vars from configuration
    const repoEnvVars = typeof repo.deployment_env_vars === 'string'
      ? JSON.parse(repo.deployment_env_vars)
      : (repo.deployment_env_vars || {});
    
    const deployment = await deploy(repo, ref, refType, user, repoEnvVars);
    return Response.json({ deployment }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    releaseDeployLock(repoId);
  }
}

export async function getEnvExample(req: Request, user: User, repoId: number): Promise<Response> {
  const repo = await query<Repository>('SELECT * FROM repositories WHERE id = $1', [repoId]);
  if (repo.rows.length === 0) return Response.json({ error: 'Repository not found' }, { status: 404 });
  const repoData = repo.rows[0];

  const tokenResult = await query<{ github_access_token: string }>('SELECT github_access_token FROM users WHERE id = $1', [repoData.added_by || user.id]);
  if (!tokenResult.rows[0]?.github_access_token) return Response.json({ error: 'No GitHub token found' }, { status: 401 });
  const accessToken = decryptAccessToken(tokenResult.rows[0].github_access_token);

  try {
    const encodedPath = encodeURIComponent(repoData.root_path === '/' ? '.env.example' : `${repoData.root_path}/.env.example`);
    const url = `https://api.github.com/repos/${repoData.owner}/${repoData.name}/contents/${encodedPath}?ref=${repoData.watch_branch}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'togit-deployer',
      },
    });
    if (!response.ok) {
      if (response.status === 404) return Response.json({ env_example: null, message: 'No .env.example found in repository' });
      return Response.json({ error: `GitHub API error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json() as { content: string };
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const envVars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
    return Response.json({ env_example: envVars, raw_content: content, message: 'Found .env.example' });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to fetch .env.example' }, { status: 500 });
  }
}

export async function searchGitHubRepos(req: Request, user: User): Promise<Response> {
  const url = new URL(req.url);
  const query_ = url.searchParams.get('q') || '';
  try {
    const tokenResult = await query<{ github_access_token: string }>('SELECT github_access_token FROM users WHERE id = $1', [user.id]);
    const accessToken = tokenResult.rows[0]?.github_access_token ? decryptAccessToken(tokenResult.rows[0].github_access_token) : undefined;

    let repos: Array<{ id: number; name: string; full_name: string; private: boolean; owner: { login: string } }>;
    if (query_) {
      repos = await searchPublicRepos(query_, accessToken);
    } else {
      if (!accessToken) return Response.json({ repos: [] });
      repos = await getUserRepos(accessToken);
    }

    return Response.json({
      repos: repos.map((r) => ({ id: r.id, name: r.name, full_name: r.full_name, private: r.private, owner: r.owner.login })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to search repositories' }, { status: 500 });
  }
}
