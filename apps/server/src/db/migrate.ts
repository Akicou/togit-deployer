import { pool } from './client.js';
import fs from 'fs';
import path from 'path';

const migrationsDir = path.join(import.meta.dir, 'migrations');

const migrations = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    github_id BIGINT UNIQUE NOT NULL,
    github_login TEXT NOT NULL,
    github_access_token TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    access_level TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS repositories (
    id SERIAL PRIMARY KEY,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT UNIQUE NOT NULL,
    private BOOLEAN DEFAULT FALSE,
    root_path TEXT DEFAULT '/',
    deploy_mode TEXT NOT NULL DEFAULT 'release',
    enabled BOOLEAN DEFAULT TRUE,
    added_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS deployments (
    id SERIAL PRIMARY KEY,
    repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    triggered_by INTEGER REFERENCES users(id),
    ref TEXT NOT NULL,
    ref_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    container_id TEXT,
    tunnel_url TEXT,
    tunnel_port INTEGER,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS logs (
    id BIGSERIAL PRIMARY KEY,
    deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
    repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS user_repo_permissions (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT TRUE,
    can_deploy BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, repo_id)
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `INSERT INTO settings (key, value) VALUES ('poll_interval_seconds', '60') ON CONFLICT (key) DO NOTHING`,


  // Indexes for performance
  `CREATE INDEX IF NOT EXISTS idx_deployments_repo_id ON deployments(repo_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_deployment_id ON logs(deployment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_repo_id ON logs(repo_id)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,

  // Add watch_branch to existing repositories
  `ALTER TABLE repositories ADD COLUMN IF NOT EXISTS watch_branch TEXT NOT NULL DEFAULT 'main'`,

  // Add localtonet_tunnel_id to store the API tunnel ID for clean deletion
  `ALTER TABLE deployments ADD COLUMN IF NOT EXISTS localtonet_tunnel_id TEXT`,

  `ALTER TABLE repositories ADD COLUMN IF NOT EXISTS deployment_env_vars JSONB DEFAULT '{}'`,
  
  `ALTER TABLE deployments ADD COLUMN IF NOT EXISTS env_vars JSONB DEFAULT '{}'`,
  
  // Add access_level column to users table if it doesn't exist
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'pending'`,
  
  `CREATE TABLE IF NOT EXISTS access_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'approved', 'blocked', 'banned')) DEFAULT 'pending',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processed_by INTEGER REFERENCES users(id),
    note TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status)`
];

export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const migration of migrations) {
      await client.query(migration);
    }
    
    await client.query('COMMIT');
    console.log('✓ All migrations completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migrations if this file is executed directly
if (import.meta.main) {
  runMigrations()
    .then(() => {
      console.log('Migrations complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}
