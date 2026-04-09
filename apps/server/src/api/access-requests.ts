import { query } from '../db/client.js';
import type { User, AccessRequest } from '../types.js';
import { z } from 'zod';

const processRequestSchema = z.object({
  status: z.enum(['approved', 'blocked', 'banned']),
  note: z.string().optional(),
});

export async function listAccessRequests(req: Request, currentUser: User): Promise<Response> {
  if (currentUser.role !== 'admin') {
    return Response.json({ error: 'Only admins can list access requests' }, { status: 403 });
  }

  // Show all users who need approval: either have pending access_request OR access_level='pending'
  const result = await query<AccessRequest & { github_login: string; access_level: string }>(
    `SELECT DISTINCT ON (u.id)
       COALESCE(ar.id, 0) as id,
       u.id as user_id,
       COALESCE(ar.status, u.access_level) as status,
       COALESCE(ar.requested_at, u.created_at) as requested_at,
       ar.processed_at,
       ar.processed_by,
       ar.note,
       u.github_login,
       u.access_level
     FROM users u
     LEFT JOIN access_requests ar ON u.id = ar.user_id AND ar.status = 'pending'
     WHERE u.access_level = 'pending'
     ORDER BY u.id, ar.requested_at DESC NULLS LAST`
  );

  // Transform to expected format
  const accessRequests = result.rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    requested_at: row.requested_at,
    processed_at: row.processed_at,
    processed_by: row.processed_by,
    note: row.note,
    github_login: row.github_login,
  }));

  return Response.json({ access_requests: accessRequests });
}

export async function createAccessRequest(req: Request, currentUser: User): Promise<Response> {
  // Users can request access for themselves only
  const existingRequest = await query(
    'SELECT 1 FROM access_requests WHERE user_id = $1 AND status = $2',
    [currentUser.id, 'pending']
  );

  if (existingRequest.rows.length > 0) {
    return Response.json({ error: 'Access request already pending for this user' }, { status: 400 });
  }

  // Check if user already has access
  if (currentUser.access_level === 'approved') {
    return Response.json({ error: 'User already approved' }, { status: 400 });
  }

  try {
    const result = await query<AccessRequest>(
      `INSERT INTO access_requests (user_id, status)
       VALUES ($1, 'pending') 
       RETURNING *`,
      [currentUser.id]
    );

    // Update user's access level to reflect request status
    await query(
      'UPDATE users SET access_level = $1 WHERE id = $2',
      ['pending', currentUser.id]
    );

    return Response.json({ access_request: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating access request:', error);
    return Response.json({ error: 'Failed to create access request' }, { status: 500 });
  }
}

export async function updateAccessRequest(
  req: Request,
  adminUser: User,
  userId: number
): Promise<Response> {
  if (adminUser.role !== 'admin') {
    return Response.json({ error: 'Only admins can process access requests' }, { status: 403 });
  }

  if (adminUser.id === userId) {
    return Response.json({ error: 'Administrators cannot manage their own access requests' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = processRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const { status, note } = parsed.data;

  try {
    // Check if user exists
    const userCheck = await query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Try to update the access request if it exists
    const requestResult = await query<AccessRequest>(
      `UPDATE access_requests 
       SET status = $2, processed_by = $3, processed_at = NOW(), note = $4
       WHERE user_id = $1 AND status = 'pending'
       RETURNING *`,
      [userId, status, adminUser.id, note || null]
    );

    // Update the user's access level
    await query('UPDATE users SET access_level = $1 WHERE id = $2', [status, userId]);

    // If rejected and user is banned/removed from system, clear their sessions too
    if (status === 'banned' || status === 'blocked') {
      const { revokeUserSessions } = await import('./../daemon/deployer.js');
      await revokeUserSessions(userId);
    }

    return Response.json({ 
      access_request: requestResult.rows.length > 0 ? requestResult.rows[0] : { user_id: userId, status },
      message: requestResult.rows.length > 0 ? 'Access request processed' : 'User access level updated' 
    });
  } catch (error) {
    console.error('Error processing access request:', error);
    return Response.json({ error: 'Failed to process access request' }, { status: 500 });
  }
}

export async function kickUser(req: Request, adminUser: User, userId: number): Promise<Response> {
  if (adminUser.role !== 'admin') {
    return Response.json({ error: 'Only admins can kick users' }, { status: 403 });
  }

  if (adminUser.id === userId) {
    return Response.json({ error: 'Administrators cannot kick themselves' }, { status: 400 });
  }

  try {
    // Update user access level if not already banned or blocked
    const userResult = await query<{ access_level: string }>(
      'SELECT access_level FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const currentLevel = userResult.rows[0].access_level;

    if (currentLevel === 'banned' || currentLevel === 'blocked') {
      return Response.json({ error: 'User already banned or blocked' }, { status: 400 });
    }

    // Change to blocked, and remove active sessions
    await query('UPDATE users SET access_level = $1 WHERE id = $2', ['blocked', userId]);

    const { revokeUserSessions } = await import('./../daemon/deployer.js');
    await revokeUserSessions(userId);

    return Response.json({ 
      success: true, 
      message: 'User kicked and sessions revoked' 
    });
  } catch (error) {
    console.error('Error kicking user:', error);
    return Response.json({ error: 'Failed to kick user' }, { status: 500 });
  }
}

export async function unbanUser(req: Request, adminUser: User, userId: number): Promise<Response> {
  if (adminUser.role !== 'admin') {
    return Response.json({ error: 'Only admins can unban users' }, { status: 403 });
  }

  try {
    // Find the user
    const userResult = await query<{ access_level: string }>(
      'SELECT access_level FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const currentLevel = userResult.rows[0].access_level;

    if (currentLevel !== 'banned') {
      return Response.json({ error: 'User is not banned' }, { status: 400 });
    }

    // Update to blocked first, then user can request access again
    await query('UPDATE users SET access_level = $1 WHERE id = $2', ['blocked', userId]);

    // Clear their existing access requests to ensure they don't appear in lists
    await query(
      `UPDATE access_requests SET status = 'banned' 
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );

    return Response.json({ 
      success: true, 
      message: 'User unbanned. Can now request access again.' 
    });
  } catch (error) {
    console.error('Error unbanning user:', error);
    return Response.json({ error: 'Failed to unban user' }, { status: 500 });
  }
}