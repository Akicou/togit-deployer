-- Base schema for togit-deployer
-- This migration creates all core tables that other migrations depend on.

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  github_id INTEGER UNIQUE NOT NULL,
  github_login TEXT NOT NULL,
  github_access_token TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'deployer', 'viewer')) DEFAULT 'viewer',
  access_level TEXT NOT NULL CHECK (access_level IN ('pending', 'approved', 'blocked', 'banned')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Repositories table
CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  private BOOLEAN NOT NULL DEFAULT false,
  root_path TEXT NOT NULL DEFAULT '/',
  deploy_mode TEXT NOT NULL CHECK (deploy_mode IN ('release', 'commit')) DEFAULT 'commit',
  watch_branch TEXT NOT NULL DEFAULT 'main',
  enabled BOOLEAN NOT NULL DEFAULT true,
  added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deployment_env_vars JSONB DEFAULT '{}',
  service_name TEXT NOT NULL DEFAULT 'app',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (full_name, service_name)
);

CREATE INDEX IF NOT EXISTS idx_repositories_owner_name ON repositories(owner, name);
CREATE INDEX IF NOT EXISTS idx_repositories_full_name ON repositories(full_name);

-- Deployments table
CREATE TABLE IF NOT EXISTS deployments (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  triggered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ref TEXT NOT NULL,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('release', 'commit')) DEFAULT 'commit',
  status TEXT NOT NULL CHECK (status IN ('pending', 'building', 'running', 'failed', 'rolled_back')) DEFAULT 'pending',
  container_id TEXT,
  tunnel_url TEXT,
  tunnel_port INTEGER,
  localtonet_tunnel_id TEXT,
  error_message TEXT,
  env_vars JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deployments_repo_id ON deployments(repo_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

-- Logs table
CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
  repo_id INTEGER REFERENCES repositories(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('build', 'network', 'system', 'docker')),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_deployment_id ON logs(deployment_id);
CREATE INDEX IF NOT EXISTS idx_logs_repo_id ON logs(repo_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  poll_interval_seconds INTEGER NOT NULL DEFAULT 30
);

-- Handle case where table existed from a prior partial migration
ALTER TABLE settings ADD COLUMN IF NOT EXISTS poll_interval_seconds INTEGER DEFAULT 30;
ALTER TABLE settings ALTER COLUMN poll_interval_seconds SET NOT NULL;
ALTER TABLE settings ALTER COLUMN poll_interval_seconds SET DEFAULT 30;

-- Insert default only if table is empty
INSERT INTO settings (poll_interval_seconds)
SELECT 30 WHERE NOT EXISTS (SELECT 1 FROM settings LIMIT 1);

-- User repo permissions table
CREATE TABLE IF NOT EXISTS user_repo_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_deploy BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, repo_id)
);