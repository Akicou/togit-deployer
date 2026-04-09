-- Add UNIQUE constraint on tunnel_port to prevent port conflicts at database level
-- This ensures two repositories can never have the same host port

DO $$
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'repositories'::regclass
        AND contype = 'u'
        AND conname = 'repositories_tunnel_port_key'
    ) THEN
        -- Add unique constraint on tunnel_port
        -- NULL values are allowed (repos without assigned ports)
        ALTER TABLE repositories ADD CONSTRAINT repositories_tunnel_port_key UNIQUE (tunnel_port);
    END IF;
END $$;
