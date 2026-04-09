ALTER TABLE users ADD COLUMN IF NOT EXISTS access_level TEXT 
  CHECK (access_level IN ('pending', 'approved', 'blocked', 'banned')) 
  DEFAULT 'pending';

UPDATE users SET access_level = 'approved' 
WHERE access_level IS NULL;

ALTER TABLE repositories ADD COLUMN IF NOT EXISTS deployment_env_vars JSONB DEFAULT '{}';
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS env_vars JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS access_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending', 'approved', 'blocked', 'banned')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by INTEGER REFERENCES users(id),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
