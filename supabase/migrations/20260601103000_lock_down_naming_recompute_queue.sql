ALTER TABLE public.naming_recompute_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.naming_recompute_jobs FROM anon, authenticated;
GRANT ALL ON TABLE public.naming_recompute_jobs TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_naming_job(text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_next_naming_job(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_naming_stale_for_product_type(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_naming_stale_for_families(text[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_naming_stale_for_references(uuid[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_naming_stale_for_versions(uuid[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_naming_stale_for_skus(uuid[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_naming_stale_for_color(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_naming_stale_for_version_rule(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_naming_stale_for_all(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_naming_job(text, text, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_naming_job(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_naming_stale_for_product_type(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_naming_stale_for_families(text[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_naming_stale_for_references(uuid[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_naming_stale_for_versions(uuid[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_naming_stale_for_skus(uuid[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_naming_stale_for_color(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_naming_stale_for_version_rule(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_naming_stale_for_all(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
