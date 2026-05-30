-- Change version column from INTEGER to TEXT for semver support (e.g. "1.0.0", "1.1.0")
ALTER TABLE public.plantillas_doc_tec
    ALTER COLUMN version TYPE TEXT USING COALESCE(version::text, '1.0.0');

-- Set all existing rows to 1.0.0 (equivalent to the old integer 1)
UPDATE public.plantillas_doc_tec
SET version = '1.0.0'
WHERE version IS NULL OR version = '1' OR version = '';

-- Ensure new rows default to 1.0.0 if no version is specified
ALTER TABLE public.plantillas_doc_tec
    ALTER COLUMN version SET DEFAULT '1.0.0';
