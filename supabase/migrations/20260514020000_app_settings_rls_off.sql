-- Ensure app_settings is readable/writable without RLS.
ALTER TABLE IF EXISTS public.app_settings DISABLE ROW LEVEL SECURITY;

