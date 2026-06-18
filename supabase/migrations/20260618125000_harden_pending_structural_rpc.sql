CREATE OR REPLACE FUNCTION public.pending_safe_jsonb_array(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_json jsonb;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  v_json := p_text::jsonb;

  IF jsonb_typeof(v_json) = 'array' THEN
    RETURN v_json;
  END IF;

  RETURN '[]'::jsonb;
EXCEPTION WHEN others THEN
  RETURN '[]'::jsonb;
END;
$$;

ALTER FUNCTION public.rpc_pending_structural_summary() SECURITY INVOKER;
ALTER FUNCTION public.rpc_pending_structural_page(integer, integer, text) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.rpc_pending_structural_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_pending_structural_page(integer, integer, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
