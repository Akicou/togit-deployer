import { query } from '../db/client.js';
import type { User, UserRepoPermission } from '../types.js';
import { z } from 'zod';

const updateUserRoleSchema = z.object({
  role: z.enum(['admin', 'deployer', 'viewer']),
});

const updatePermissionSchema = z.object({
  can_view: z.boolean().optional(),
  can_deploy: z.boolean().optional(),
});

export async function listUsers(req: Request, currentUser: User): Promise<Response> {
  if (currentUser.role !== 'admin') {
    return Response.json({ error: 'Only admins can list users' }, { status: 403 });
  }

  const result = await query<User & { deployment_count: string }>(
    `SELECT u.*, COUNT(d.id) as deployment_count
     FROM users u
     LEFT JOIN deployments d ON d.triggered_by = u.id
     GROUP BY u.id
     ORDER BY u.created_at ASC`
  );

  return Response.json({ users: result.rows });
}

export async function updateUserRole(req: Request, currentUser: User, userId: number): Promise<Response> {
  if (currentUser.role !== 'admin') {
    return Response.json({ error: 'Only admins can update user roles' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateUserRoleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  // Prevent removing last admin
  if (userId !== currentUser.id) {
    const adminCount = await query<{ count: string }>(
      "SELECT COUNT(*) FROM users WHERE role = 'admin'"
    );

    if (parseInt(adminCount.rows[0].count, 10) <= 1) {
      const userResult = await query<User>(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows[0]?.role === 'admin' && parsed.data.role !== 'admin') {
        return Response.json({ error: 'Cannot remove the last admin' }, { status: 400 });
      }
    }
  }

  try {
    const result = await query<User>(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING *',
      [parsed.data.role, userId]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    return Response.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error updating user role:', error);
    return Response.json({ error: 'Failed to update user role' }, { status: 500 });
  }
}

export async function getUserPermissions(req: Request, currentUser: User, userId: number): Promise<Response> {
  if (currentUser.role !== 'admin' && currentUser.id !== userId) {
    return Response.json({ error: 'Access denied' }, { status: 403 });
  }

  const result = await query<UserRepoPermission & { repo_name: string; repo_full_name: string }>(
    `SELECT urp.*, r.name as repo_name, r.full_name as repo_full_name
     FROM user_repo_permissions urp
     JOIN repositories r ON r.id = urp.repo_id
     WHERE urp.user_id = $1`,
    [userId]
  );

  return Response.json({ permissions: result.rows });
}

export async function updateUserPermission(
  req: Request,
  currentUser: User,
  userId: number,
  repoId: number
): Promise<Response> {
  if (currentUser.role !== 'admin') {
    return Response.json({ error: 'Only admins can update permissions' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updatePermissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    // Upsert permission
    const result = await query<UserRepoPermission>(
      `INSERT INTO user_repo_permissions (user_id, repo_id, can_view, can_deploy)
       VALUES ($1, $2, COALESCE($3, true), COALESCE($4, false))
       ON CONFLICT (user_id, repo_id) DO UPDATE SET
         can_view = COALESCE($3, user_repo_permissions.can_view),
         can_deploy = COALESCE($4, user_repo_permissions.can_deploy)
       RETURNING *`,
      [userId, repoId, parsed.data.can_view ?? null, parsed.data.can_deploy ?? null]
    );

    return Response.json({ permission: result.rows[0] });
  } catch (error) {
    console.error('Error updating permission:', error);
    return Response.json({ error: 'Failed to update permission' }, { status: 500 });
  }
}

export async function getSettings(req: Request): Promise<Response> {
  const result = await query<{ key: string; value: unknown }>(
    'SELECT * FROM settings'
  );

  const settings: Record<string, unknown> = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }

  return Response.json({ settings });
}

export async function getSystemConfig(req: Request): Promise<Response> {
  return Response.json({
    config: {
      github_oauth: !!process.env.GITHUB_APP_CLIENT_ID && !!process.env.GITHUB_APP_CLIENT_SECRET,
      localtonet: !!process.env.LOCALTONET_AUTH_TOKEN,
      admin_github_login: !!process.env.ADMIN_GITHUB_LOGIN,
    },
  });
}

export async function updateSettings(req: Request, currentUser: User): Promise<Response> {
  if (currentUser.role !== 'admin') {
    return Response.json({ error: 'Only admins can update settings' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const bodyObj = body as Record<string, unknown>;
  for (const [key, value] of Object.entries(bodyObj)) {
    updates.push(`($${paramIndex++}, $${paramIndex++})`);
    values.push(key, JSON.stringify(value));
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No settings provided' }, { status: 400 });
  }

  try {
    await query(
      `INSERT INTO settings (key, value) VALUES ${updates.join(', ')}
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      values
    );

    // If poll_interval_seconds was updated, restart scheduler
    if (bodyObj.poll_interval_seconds !== undefined) {
      const { restartScheduler } = await import('../daemon/scheduler.js');
      await restartScheduler();
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    return Response.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
