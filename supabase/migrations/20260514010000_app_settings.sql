-- App settings: simple key/value store for runtime configuration.
-- Used for toggles like MASS_IMPORT_EXECUTE_ENABLED and MASS_IMPORT_SAFE_MAX_ROWS.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NOTE: We intentionally do NOT enable RLS for app_settings in this project because the app
-- uses dbQuery/exec_sql in several server-side paths and may run without a service role key
-- in some environments. This table only stores non-secret operational flags.

-- Seed defaults (do not overwrite if already present).
INSERT INTO public.app_settings (key, value, description)
VALUES
  ('mass_import_execute_enabled', to_jsonb(false), 'Allow mass-import execute to persist rows. If false, execute should behave in safe mode.'),
  ('mass_import_safe_max_rows', to_jsonb(15), 'Max rows allowed in safe mode.')
ON CONFLICT (key) DO NOTHING;
