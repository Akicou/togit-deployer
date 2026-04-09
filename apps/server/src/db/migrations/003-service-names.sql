-- Service name support for monorepos
-- Allows multiple deployable services (frontend, backend, etc.) from the same repo
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS service_name TEXT NOT NULL DEFAULT 'app';
