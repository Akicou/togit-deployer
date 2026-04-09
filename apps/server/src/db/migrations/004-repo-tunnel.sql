-- Fixed tunnel-per-repo: tunnel identity lives on the repository, not per-deployment.
-- container_port: the port the app binds inside the container (default 3000).
-- tunnel_port:    the fixed host port Docker maps to container_port. Auto-assigned from 10000 upward.
-- tunnel_subdomain: optional custom subdomain (e.g. "myapp" → myapp.localto.net)
-- localtonet_tunnel_id: the Localtonet tunnel ID, reused across redeploys.
-- tunnel_url:     permanent public URL for this repo+service combo.

ALTER TABLE repositories
  ADD COLUMN IF NOT EXISTS container_port   INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS tunnel_port      INTEGER,
  ADD COLUMN IF NOT EXISTS tunnel_subdomain TEXT,
  ADD COLUMN IF NOT EXISTS localtonet_tunnel_id TEXT,
  ADD COLUMN IF NOT EXISTS tunnel_url       TEXT;
