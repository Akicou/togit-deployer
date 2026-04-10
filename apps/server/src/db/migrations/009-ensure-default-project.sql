-- Ensure a default project always exists once users exist
DO $$
DECLARE
  system_user_id INTEGER;
BEGIN
  SELECT id INTO system_user_id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  IF system_user_id IS NULL THEN
    SELECT id INTO system_user_id FROM users ORDER BY created_at LIMIT 1;
  END IF;

  IF system_user_id IS NOT NULL THEN
    INSERT INTO projects (name, description, created_by)
    VALUES ('default-project', 'Default project', system_user_id)
    ON CONFLICT (name) DO NOTHING;

    UPDATE repositories
    SET project_id = (SELECT id FROM projects WHERE name = 'default-project')
    WHERE project_id IS NULL;
  END IF;
END $$;
