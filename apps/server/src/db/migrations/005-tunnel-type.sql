-- Tunnel type config per repo.
-- tunnel_type: 'random' (auto subdomain), 'subdomain' (custom sub on localto.net),
--              'custom-domain' (own domain linked to Localtonet account)
-- tunnel_domain: base domain for 'subdomain' mode (e.g. localto.net) or
--                full domain for 'custom-domain' mode (e.g. myapp.com)

ALTER TABLE repositories
  ADD COLUMN IF NOT EXISTS tunnel_type TEXT NOT NULL DEFAULT 'random'
    CHECK (tunnel_type IN ('random', 'subdomain', 'custom-domain')),
  ADD COLUMN IF NOT EXISTS tunnel_domain TEXT;
