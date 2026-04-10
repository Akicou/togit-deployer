import { query } from '../db/client.js';
import { z } from 'zod';
import type { User, Project, ProjectAccessRequest, ProjectPermission } from '../types.js';

const createProjectSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/, 'Project name must be lowercase alphanumeric, dashes, or underscores'),
  description: z.string().max(500).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/).optional(),
  description: z.string().max(500).nullable().optional(),
});

const processRequestSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  can_deploy: z.boolean().optional().default(false),
  note: z.string().optional(),
});

export async function checkProjectAccess(
  user: User,
  projectId: number,
  permission: 'view' | 'deploy' = 'view'
): Promise<boolean> {
  if (user.role === 'admin') return true;

  const created = await query<{ created_by: number | null }>(
    'SELECT created_by FROM projects WHERE id = $1',
    [projectId]
  );
  if (created.rows.length === 0) return false;
  if (created.rows[0].created_by === user.id) return true;

  const perms = await query<ProjectPermission>(
    'SELECT can_view, can_deploy FROM user_project_permissions WHERE user_id = $1 AND project_id = $2',
    [user.id, projectId]
  );
  if (perms.rows.length === 0) return false;
  return permission === 'deploy' ? perms.rows[0].can_deploy : perms.rows[0].can_view;
}

export async function listProjects(req: Request, user: User): Promise<Response> {
  const url = new URL(req.url);
  const includeAll = url.searchParams.get('all') === 'true';

  let sql = `
    SELECT p.*, u.github_login AS created_by_login,
           (SELECT COUNT(*) FROM repositories r WHERE r.project_id = p.id) AS service_count,
           (SELECT COUNT(*) FROM service_tunnels st
             JOIN repositories r ON r.id = st.repo_id
            WHERE r.project_id = p.id AND st.status = 'active') AS active_tunnel_count
    FROM projects p
    LEFT JOIN users u ON u.id = p.created_by
  `;
  const params: unknown[] = [];

  if (user.role !== 'admin' || !includeAll) {
    sql += `
      WHERE p.created_by = $1
         OR EXISTS (
           SELECT 1 FROM user_project_permissions upp
           WHERE upp.project_id = p.id AND upp.user_id = $1 AND upp.can_view = true
         )
    `;
    params.push(user.id);
  }

  sql += ' ORDER BY p.created_at DESC';
  const result = await query<Project>(sql, params);
  return Response.json({ projects: result.rows });
}

export async function createProject(req: Request, user: User): Promise<Response> {
  if (user.role === 'viewer') {
    return Response.json({ error: 'Viewers cannot create projects' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const result = await query<Project>(
      `INSERT INTO projects (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [parsed.data.name, parsed.data.description || null, user.id]
    );
    return Response.json({ project: result.rows[0] }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to create project' }, { status: 500 });
  }
}

export async function getProject(req: Request, user: User, projectId: number): Promise<Response> {
  const allowed = await checkProjectAccess(user, projectId, 'view');
  if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const projectResult = await query<Project & { created_by_login: string }>(
    `SELECT p.*, u.github_login AS created_by_login
     FROM projects p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.id = $1`,
    [projectId]
  );
  if (projectResult.rows.length === 0) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  const services = await query(
    `SELECT r.*,
            d.ref AS last_deployed_ref,
            d.ref_type AS last_deployed_ref_type,
            d.status AS last_deployment_status,
            st.tunnel_url AS active_tunnel_url
     FROM repositories r
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
     WHERE r.project_id = $1
     ORDER BY r.created_at DESC`,
    [projectId]
  );

  const requests = await query<ProjectAccessRequest & { github_login: string }>(
    `SELECT par.*, u.github_login
     FROM project_access_requests par
     JOIN users u ON u.id = par.user_id
     WHERE par.project_id = $1 AND par.status = 'pending'
     ORDER BY par.requested_at DESC`,
    [projectId]
  );

  return Response.json({ project: projectResult.rows[0], services: services.rows, pending_access_requests: requests.rows });
}

export async function updateProject(req: Request, user: User, projectId: number): Promise<Response> {
  const allowed = user.role === 'admin' || await checkProjectAccess(user, projectId, 'deploy');
  if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (parsed.data.name !== undefined) { updates.push(`name = $${i++}`); values.push(parsed.data.name); }
  if (parsed.data.description !== undefined) { updates.push(`description = $${i++}`); values.push(parsed.data.description); }
  if (updates.length === 0) return Response.json({ error: 'No updates provided' }, { status: 400 });
  values.push(projectId);

  const result = await query<Project>(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, values);
  if (result.rows.length === 0) return Response.json({ error: 'Project not found' }, { status: 404 });
  return Response.json({ project: result.rows[0] });
}

export async function deleteProject(req: Request, user: User, projectId: number): Promise<Response> {
  const project = await query<{ created_by: number | null }>('SELECT created_by FROM projects WHERE id = $1', [projectId]);
  if (project.rows.length === 0) return Response.json({ error: 'Project not found' }, { status: 404 });
  if (user.role !== 'admin' && project.rows[0].created_by !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  await query('DELETE FROM projects WHERE id = $1', [projectId]);
  return Response.json({ success: true });
}

export async function requestProjectAccess(req: Request, user: User, projectId: number): Promise<Response> {
  const existingPerm = await checkProjectAccess(user, projectId, 'view');
  if (existingPerm) return Response.json({ error: 'Already has access' }, { status: 400 });

  const existing = await query(
    `SELECT 1 FROM project_access_requests
     WHERE user_id = $1 AND project_id = $2 AND status = 'pending'`,
    [user.id, projectId]
  );
  if (existing.rows.length > 0) {
    return Response.json({ error: 'Access request already pending' }, { status: 400 });
  }

  const result = await query<ProjectAccessRequest>(
    `INSERT INTO project_access_requests (user_id, project_id, status)
     VALUES ($1, $2, 'pending')
     RETURNING *`,
    [user.id, projectId]
  );
  return Response.json({ access_request: result.rows[0] }, { status: 201 });
}

export async function processProjectAccessRequest(req: Request, user: User, projectId: number, targetUserId: number): Promise<Response> {
  const project = await query<{ created_by: number | null }>('SELECT created_by FROM projects WHERE id = $1', [projectId]);
  if (project.rows.length === 0) return Response.json({ error: 'Project not found' }, { status: 404 });
  if (user.role !== 'admin' && project.rows[0].created_by !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = processRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  const result = await query<ProjectAccessRequest>(
    `UPDATE project_access_requests
     SET status = $3, processed_by = $4, processed_at = NOW(), note = $5
     WHERE user_id = $1 AND project_id = $2 AND status = 'pending'
     RETURNING *`,
    [targetUserId, projectId, parsed.data.status, user.id, parsed.data.note || null]
  );

  if (result.rows.length === 0) {
    return Response.json({ error: 'Pending access request not found' }, { status: 404 });
  }

  if (parsed.data.status === 'approved') {
    await query(
      `INSERT INTO user_project_permissions (user_id, project_id, can_view, can_deploy)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (user_id, project_id)
       DO UPDATE SET can_view = true, can_deploy = $3`,
      [targetUserId, projectId, parsed.data.can_deploy]
    );
  }

  return Response.json({ access_request: result.rows[0] });
}

export async function listProjectUsers(req: Request, user: User, projectId: number): Promise<Response> {
  const allowed = await checkProjectAccess(user, projectId, 'view');
  if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const result = await query(
    `SELECT u.id, u.github_login, u.role, upp.can_view, upp.can_deploy, upp.created_at
     FROM user_project_permissions upp
     JOIN users u ON u.id = upp.user_id
     WHERE upp.project_id = $1
     ORDER BY upp.created_at DESC`,
    [projectId]
  );
  return Response.json({ users: result.rows });
}

export async function removeProjectUser(req: Request, user: User, projectId: number, targetUserId: number): Promise<Response> {
  const project = await query<{ created_by: number | null }>('SELECT created_by FROM projects WHERE id = $1', [projectId]);
  if (project.rows.length === 0) return Response.json({ error: 'Project not found' }, { status: 404 });
  if (user.role !== 'admin' && project.rows[0].created_by !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await query('DELETE FROM user_project_permissions WHERE user_id = $1 AND project_id = $2', [targetUserId, projectId]);
  return Response.json({ success: true });
}
