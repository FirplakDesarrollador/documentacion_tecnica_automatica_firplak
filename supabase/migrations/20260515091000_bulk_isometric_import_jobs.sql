-- Bulk isometric mass-import (job + items)
-- This is used by /products/mass-import (Isometrics module) for preview/apply with auditability and resume.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.bulk_isometric_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'preview_ready',
  options jsonb NOT NULL DEFAULT '{}'::jsonb,

  total int NOT NULL DEFAULT 0,
  ignored int NOT NULL DEFAULT 0,
  match_ok int NOT NULL DEFAULT 0,
  no_match int NOT NULL DEFAULT 0,
  ambiguous int NOT NULL DEFAULT 0,
  conflicts int NOT NULL DEFAULT 0,
  applied_ok int NOT NULL DEFAULT 0,
  applied_err int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bulk_isometric_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.bulk_isometric_import_jobs(id) ON DELETE CASCADE,

  relative_path text NOT NULL,
  base_name text NOT NULL,
  ext text NOT NULL,

  sha256 text NULL,
  storage_path text NULL,

  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_status text NOT NULL,

  target_reference_ids uuid[] NULL,
  target_version_ids uuid[] NULL,

  conflict_group_code text NULL,
  selected boolean NOT NULL DEFAULT false,

  applied_at timestamptz NULL,
  error text NULL,
  notes text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bulk_isometric_import_items_job_id_idx
  ON public.bulk_isometric_import_items(job_id);

CREATE INDEX IF NOT EXISTS bulk_isometric_import_items_job_conflict_group_idx
  ON public.bulk_isometric_import_items(job_id, conflict_group_code);

-- Operational toggles (non-secret)
INSERT INTO public.app_settings (key, value, description)
VALUES
  ('isometric_mass_import_execute_enabled', to_jsonb(false), 'Allow isometric mass-import execute to persist changes. If false, apply endpoints should reject writes.'),
  ('isometric_mass_import_safe_max_files_per_apply', to_jsonb(200), 'Safety ceiling for how many files/items can be applied per request.'),
  ('isometric_mass_import_chunk_size', to_jsonb(25), 'Default chunk size for apply in UI.')
ON CONFLICT (key) DO NOTHING;

