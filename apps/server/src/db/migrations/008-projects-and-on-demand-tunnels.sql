-- Migration: Projects and On-Demand Tunnels
-- Creates projects table, links repositories to projects, and enables per-project access control

-- 1. Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);

-- 2. Add project_id to repositories (nullable initially for migration)
ALTER TABLE repositories 
ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_repositories_project_id ON repositories(project_id);

-- 3. Create project access requests table (for requesting access to specific projects)
CREATE TABLE IF NOT EXISTS project_access_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  UNIQUE (user_id, project_id, status) -- Only one pending request per user/project
);

CREATE INDEX IF NOT EXISTS idx_project_access_requests_user_id ON project_access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_project_access_requests_project_id ON project_access_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_project_access_requests_status ON project_access_requests(status);

-- 4. Create user project permissions table
CREATE TABLE IF NOT EXISTS user_project_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_deploy BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_user_project_permissions_project_id ON user_project_permissions(project_id);

-- 5. Create service_tunnels table for on-demand tunnels
CREATE TABLE IF NOT EXISTS service_tunnels (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  localtonet_tunnel_id TEXT NOT NULL,
  tunnel_url TEXT NOT NULL,
  tunnel_port INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  stop_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_service_tunnels_repo_id ON service_tunnels(repo_id);
CREATE INDEX IF NOT EXISTS idx_service_tunnels_status ON service_tunnels(status);
CREATE INDEX IF NOT EXISTS idx_service_tunnels_localtonet_id ON service_tunnels(localtonet_tunnel_id);

-- 6. Move tunnel config from repositories to columns that indicate "tunnel on demand" mode
-- We keep tunnel_port as the host port assignment, but tunnels are no longer auto-created
-- Add a flag to indicate if service is currently tunneled
ALTER TABLE repositories 
ADD COLUMN IF NOT EXISTS tunnel_enabled BOOLEAN NOT NULL DEFAULT false;

-- 7. Create a default project for existing repositories and link them
DO $$
DECLARE
  default_project_id INTEGER;
  system_user_id INTEGER;
BEGIN
  -- Find an admin user to be the creator, or the first user
  SELECT id INTO system_user_id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  IF system_user_id IS NULL THEN
    SELECT id INTO system_user_id FROM users ORDER BY created_at LIMIT 1;
  END IF;

  -- Only proceed if we have repositories without projects and we have a user
  IF system_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM repositories WHERE project_id IS NULL) THEN
    -- Create a default project for existing repositories
    INSERT INTO projects (name, description, created_by)
    VALUES ('default-project', 'Default project for existing repositories', system_user_id)
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO default_project_id;

    -- If project already existed, get its id
    IF default_project_id IS NULL THEN
      SELECT id INTO default_project_id FROM projects WHERE name = 'default-project';
    END IF;

    -- Link existing repositories to the default project
    UPDATE repositories SET project_id = default_project_id WHERE project_id IS NULL;
  END IF;
END $$;

-- 8. Add settings for tunnel limits
-- First check if settings table has the right structure (key/value format)
DO $$
BEGIN
  -- Try to insert using the settings table format (key/value columns)
  -- If it fails, the table might have a different structure
  BEGIN
    INSERT INTO settings (key, value) 
    VALUES ('max_tunnels_per_project', '10')
    ON CONFLICT (key) DO NOTHING;
    
    INSERT INTO settings (key, value)
    VALUES ('max_tunnels_per_user', '5')
    ON CONFLICT (key) DO NOTHING;
  EXCEPTION 
    WHEN undefined_column THEN
      -- Settings table might use the old format (single row with columns)
      -- Skip adding these settings
      NULL;
  END;
END $$;
