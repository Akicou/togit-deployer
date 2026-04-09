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

  const result = await query<AccessRequest & { github_login: string }>(
    `SELECT ar.*, u.github_login
     FROM access_requests ar
     JOIN users u ON u.id = ar.user_id`
  );

  return Response.json({ access_requests: result.rows });
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
    // First update the access request
    const requestResult = await query<AccessRequest>(
      `UPDATE access_requests 
       SET status = $2, processed_by = $3, processed_at = NOW(), note = $4
       WHERE user_id = $1
       RETURNING *`,
      [userId, status, adminUser.id, note || null]
    );

    if (requestResult.rows.length === 0) {
      return Response.json({ error: 'Access request not found' }, { status: 404 });
    }

    // Update the user's access level
    await query('UPDATE users SET access_level = $1 WHERE id = $2', [status, userId]);

    // If rejected and user is banned/removed from system, clear their sessions too
    if (status === 'banned' || status === 'blocked') {
      const { revokeUserSessions } = await import('./../daemon/deployer.js');
      await revokeUserSessions(userId);
    }

    return Response.json({ access_request: requestResult.rows[0] });
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