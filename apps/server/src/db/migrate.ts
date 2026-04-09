import { pool } from './client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Read all .sql files from the migrations directory, ordered by filename.
 * Also includes inlined core schema for the initial table creation
 * (so the first run works even without SQL files).
 *
 * The SQL files are:
 *   001-env-vars-and-access.sql — ADDs columns / tables that were added later
 *   002-access-env.sql          — (similar purpose)
 *
 * This function runs ALL inlined schema first, then applies .sql files
 * in alphabetical order for deterministic execution.
 */
const coreMigrations: string[] = [
  // Core tables
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    github_id BIGINT UNIQUE NOT NULL,
    github_login TEXT NOT NULL,
    github_access_token TEXT,
    role TEXT NOT NULL DEFAULT 'viewer'
      CHECK (role IN ('admin', 'deployer', 'viewer')),
    access_level TEXT NOT NULL DEFAULT 'pending'
      CHECK (access_level IN ('pending', 'approved', 'blocked', 'banned')),
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
    deploy_mode TEXT NOT NULL DEFAULT 'release'
      CHECK (deploy_mode IN ('release', 'commit')),
    watch_branch TEXT NOT NULL DEFAULT 'main',
    enabled BOOLEAN DEFAULT TRUE,
    added_by INTEGER REFERENCES users(id),
    deployment_env_vars JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS deployments (
    id SERIAL PRIMARY KEY,
    repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    triggered_by INTEGER REFERENCES users(id),
    ref TEXT NOT NULL,
    ref_type TEXT NOT NULL
      CHECK (ref_type IN ('release', 'commit')),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'building', 'running', 'failed', 'rolled_back')),
    container_id TEXT,
    tunnel_url TEXT,
    tunnel_port INTEGER,
    localtonet_tunnel_id TEXT,
    error_message TEXT,
    env_vars JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS logs (
    id BIGSERIAL PRIMARY KEY,
    deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
    repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    category TEXT NOT NULL
      CHECK (category IN ('build', 'network', 'system', 'docker')),
    level TEXT NOT NULL DEFAULT 'info'
      CHECK (level IN ('info', 'warn', 'error')),
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

  // OAuth states (persistent, survives server restarts)
  `CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS access_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status TEXT
      CHECK (status IN ('pending', 'approved', 'blocked', 'banned'))
      DEFAULT 'pending',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processed_by INTEGER REFERENCES users(id),
    note TEXT
  )`,

  // Default settings
  `INSERT INTO settings (key, value)
   VALUES ('poll_interval_seconds', '60')
   ON CONFLICT (key) DO NOTHING`,

  // Performance indexes
  `CREATE INDEX IF NOT EXISTS idx_deployments_repo_id ON deployments(repo_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_deployment_id ON logs(deployment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_repo_id ON logs(repo_id)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status)`,
  // For OAuth state cleanup
  `CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at)`,
];

export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Run core schema
    console.log('  Applying core schema...');
    for (const migration of coreMigrations) {
      await client.query(migration);
    }

    // 2. Discover and run .sql migration files from disk
    if (fs.existsSync(migrationsDir)) {
      const sqlFiles = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort(); // alphabetical order

      for (const file of sqlFiles) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        console.log(`  Applying migration file: ${file}`);
        await client.query(sql);
      }
    } else {
      console.log('  No SQL migration files found (skipping)');
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
