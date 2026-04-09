-- Fix unique constraint for monorepo support
-- Drop old constraint (if exists) and add proper (full_name, service_name) constraint

-- First, try to drop the old constraint if it exists
-- The constraint name is auto-generated as repositories_full_name_key or similar
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find and drop constraint on full_name only (if it exists)
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'repositories'::regclass
    AND contype = 'u'
    AND conname LIKE '%full_name%'
    AND NOT conname LIKE '%service_name%'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE repositories DROP CONSTRAINT ' || quote_ident(constraint_name);
    END IF;
END $$;

-- Add the proper unique constraint for monorepo support
-- This allows same repo (full_name) with different service names
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'repositories'::regclass
        AND contype = 'u'
        AND conname = 'repositories_full_name_service_name_key'
    ) THEN
        ALTER TABLE repositories ADD CONSTRAINT repositories_full_name_service_name_key UNIQUE (full_name, service_name);
    END IF;
END $$;
