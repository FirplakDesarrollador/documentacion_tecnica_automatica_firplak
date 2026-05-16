-- Mass Import V6 compatibility: some DBs may not have colors.updated_at.
-- The importer uses updated_at in ON CONFLICT DO UPDATE, so we ensure the column exists.

ALTER TABLE IF EXISTS public.colors
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

