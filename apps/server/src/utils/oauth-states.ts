/**
 * Simple, secure token store (backed by DB) for OAuth state values.
 * Replaces the in-memory Map that was lost on restart.
 */
import { randomBytes } from 'crypto';
import { query } from '../db/client.js';

export async function generateAndStoreOAuthState(): Promise<string> {
  const state = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await query(
    `INSERT INTO oauth_states (state, expires_at) VALUES ($1, $2)`,
    [state, expiresAt]
  );

  return state;
}

export async function validateAndConsumeOAuthState(state: string): Promise<boolean> {
  const result = await query<{ id: number }>(
    `DELETE FROM oauth_states WHERE state = $1 AND expires_at > NOW() RETURNING id`,
    [state]
  );

  return result.rows.length > 0;
}

export async function cleanupExpiredOAuthStates(): Promise<number> {
  const result = await query<{ count: string }>(
    `DELETE FROM oauth_states WHERE expires_at < NOW() RETURNING *`
  );
  return result.rowCount || 0;
}
