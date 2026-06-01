ALTER TABLE public.product_versions
  ADD COLUMN IF NOT EXISTS naming_stale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS naming_stale_at timestamptz,
  ADD COLUMN IF NOT EXISTS naming_recomputed_at timestamptz;

ALTER TABLE public.product_skus
  ADD COLUMN IF NOT EXISTS naming_stale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS naming_stale_at timestamptz,
  ADD COLUMN IF NOT EXISTS naming_recomputed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_product_versions_naming_stale
  ON public.product_versions (naming_stale, naming_stale_at)
  WHERE naming_stale = true;

CREATE INDEX IF NOT EXISTS idx_product_skus_naming_stale
  ON public.product_skus (naming_stale, naming_stale_at)
  WHERE naming_stale = true;

CREATE TABLE IF NOT EXISTS public.naming_recompute_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  scope_id text,
  scope_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  naming_type text,
  origin text,
  status text NOT NULL DEFAULT 'pending',
  total_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  last_error text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT naming_recompute_jobs_status_check
    CHECK (status IN ('pending', 'running', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_naming_recompute_jobs_status_created
  ON public.naming_recompute_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_naming_recompute_jobs_active_scope
  ON public.naming_recompute_jobs (scope_type, scope_id, naming_type, status)
  WHERE status IN ('pending', 'running');

CREATE OR REPLACE FUNCTION public.enqueue_naming_job(
  p_scope_type text,
  p_scope_id text DEFAULT NULL,
  p_scope_payload jsonb DEFAULT '{}'::jsonb,
  p_naming_type text DEFAULT NULL,
  p_origin text DEFAULT 'app'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key integer;
  v_existing uuid;
  v_new uuid;
  v_payload jsonb := COALESCE(p_scope_payload, '{}'::jsonb);
BEGIN
  IF p_scope_type IS NULL OR btrim(p_scope_type) = '' THEN
    RAISE EXCEPTION 'p_scope_type is required';
  END IF;

  v_lock_key := hashtext(
    COALESCE(p_scope_type, '') || '|' ||
    COALESCE(p_scope_id, '') || '|' ||
    COALESCE(p_naming_type, '') || '|' ||
    COALESCE(v_payload::text, '')
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT id
    INTO v_existing
  FROM public.naming_recompute_jobs
  WHERE scope_type = p_scope_type
    AND scope_id IS NOT DISTINCT FROM p_scope_id
    AND naming_type IS NOT DISTINCT FROM p_naming_type
    AND scope_payload = v_payload
    AND status IN ('pending', 'running')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.naming_recompute_jobs
    SET updated_at = now()
    WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.naming_recompute_jobs (
    scope_type,
    scope_id,
    scope_payload,
    naming_type,
    origin
  )
  VALUES (
    p_scope_type,
    p_scope_id,
    v_payload,
    p_naming_type,
    p_origin
  )
  RETURNING id INTO v_new;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_naming_job(
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.naming_recompute_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.naming_recompute_jobs
  SET status = 'pending',
      locked_at = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE status = 'running'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at < now();

  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM public.naming_recompute_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ),
  updated AS (
    UPDATE public.naming_recompute_jobs job
    SET status = 'running',
        locked_at = now(),
        lease_expires_at = now() + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 60), 10)),
        started_at = COALESCE(job.started_at, now()),
        updated_at = now(),
        last_error = NULL
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*
  )
  SELECT * FROM updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_naming_stale_for_product_type(
  p_product_type text,
  p_naming_type text DEFAULT NULL,
  p_origin text DEFAULT 'app'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_type text := upper(btrim(COALESCE(p_product_type, '')));
  v_job_id uuid;
BEGIN
  IF v_product_type = '' THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_versions v
  SET naming_stale = true,
      naming_stale_at = now()
  FROM public.product_references r
  JOIN public.families f ON r.family_code = f.family_code
  WHERE v.reference_id = r.id
    AND upper(btrim(COALESCE(f.product_type, ''))) = v_product_type;

  UPDATE public.product_skus s
  SET naming_stale = true,
      naming_stale_at = now()
  FROM public.product_versions v
  JOIN public.product_references r ON v.reference_id = r.id
  JOIN public.families f ON r.family_code = f.family_code
  WHERE s.version_id = v.id
    AND upper(btrim(COALESCE(f.product_type, ''))) = v_product_type;

  v_job_id := public.enqueue_naming_job(
    'product_type',
    v_product_type,
    '{}'::jsonb,
    p_naming_type,
    p_origin
  );
  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_naming_stale_for_families(
  p_family_codes text[],
  p_naming_type text DEFAULT NULL,
  p_origin text DEFAULT 'app'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes text[];
  v_job_id uuid;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT upper(btrim(value))
    FROM unnest(COALESCE(p_family_codes, ARRAY[]::text[])) AS item(value)
    WHERE btrim(value) <> ''
  ) INTO v_codes;

  IF COALESCE(array_length(v_codes, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_versions v
  SET naming_stale = true,
      naming_stale_at = now()
  FROM public.product_references r
  WHERE v.reference_id = r.id
    AND upper(btrim(r.family_code)) = ANY(v_codes);

  UPDATE public.product_skus s
  SET naming_stale = true,
      naming_stale_at = now()
  FROM public.product_versions v
  JOIN public.product_references r ON v.reference_id = r.id
  WHERE s.version_id = v.id
    AND upper(btrim(r.family_code)) = ANY(v_codes);

  v_job_id := public.enqueue_naming_job(
    'families',
    NULL,
    jsonb_build_object('family_codes', to_jsonb(v_codes)),
    p_naming_type,
    p_origin
  );
  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_naming_stale_for_references(
  p_reference_ids uuid[],
  p_naming_type text DEFAULT NULL,
  p_origin text DEFAULT 'app'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_job_id uuid;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT value
    FROM unnest(COALESCE(p_reference_ids, ARRAY[]::uuid[])) AS item(value)
  ) INTO v_ids;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_versions
  SET naming_stale = true,
      naming_stale_at = now()
  WHERE reference_id = ANY(v_ids);

  UPDATE public.product_skus s
  SET naming_stale = true,
      naming_stale_at = now()
  FROM public.product_versions v
  WHERE s.version_id = v.id
    AND v.reference_id = ANY(v_ids);

  v_job_id := public.enqueue_naming_job(
    'references',
    NULL,
    jsonb_build_object('reference_ids', to_jsonb(v_ids)),
    p_naming_type,
    p_origin
  );
  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_naming_stale_for_versions(
  p_version_ids uuid[],
  p_naming_type text DEFAULT NULL,
  p_origin text DEFAULT 'app'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_job_id uuid;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT value
    FROM unnest(COALESCE(p_version_ids, ARRAY[]::uuid[])) AS item(value)
  ) INTO v_ids;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_versions
  SET naming_stale = true,
      naming_stale_at = now()
  WHERE id = ANY(v_ids);

  UPDATE public.product_skus
  SET naming_stale = true,
      naming_stale_at = now()
  WHERE version_id = ANY(v_ids);

  v_job_id := public.enqueue_naming_job(
    'versions',
    NULL,
    jsonb_build_object('version_ids', to_jsonb(v_ids)),
    p_naming_type,
    p_origin
  );
  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_naming_stale_for_skus(
  p_sku_ids uuid[],
  p_naming_type text DEFAULT NULL,
  p_origin text DEFAULT 'app'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_job_id uuid;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT value
    FROM unnest(COALESCE(p_sku_ids, ARRAY[]::uuid[])) AS item(value)
  ) INTO v_ids;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_skus
  SET naming_stale = true,
      naming_stale_at = now()
  WHERE id = ANY(v_ids);

  v_job_id := public.enqueue_naming_job(
    'skus',
    NULL,
    jsonb_build_object('sku_ids', to_jsonb(v_ids)),
    p_naming_type,
    p_origin
  );
  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_naming_stale_for_color(
  p_color_code text,
  p_naming_type text DEFAULT NULL,
  p_origin text DEFAULT 'app'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_color_code text := upper(btrim(COALESCE(p_color_code, '')));
  v_job_id uuid;
BEGIN
  IF v_color_code = '' THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_skus
  SET naming_stale = true,
      naming_stale_at = now()
  WHERE upper(btrim(color_code)) = v_color_code;

  v_job_id := public.enqueue_naming_job(
    'color',
    v_color_code,
    '{}'::jsonb,
    p_naming_type,
    p_origin
  );
  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_naming_stale_for_version_rule(
  p_version_code text,
  p_naming_type text DEFAULT NULL,
  p_origin text DEFAULT 'app'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_code text := upper(btrim(COALESCE(p_version_code, '')));
  v_job_id uuid;
BEGIN
  IF v_version_code = '' THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_versions
  SET naming_stale = true,
      naming_stale_at = now()
  WHERE upper(btrim(version_code)) = v_version_code;

  UPDATE public.product_skus s
  SET naming_stale = true,
      naming_stale_at = now()
  FROM public.product_versions v
  WHERE s.version_id = v.id
    AND upper(btrim(v.version_code)) = v_version_code;

  v_job_id := public.enqueue_naming_job(
    'version_rule',
    v_version_code,
    '{}'::jsonb,
    p_naming_type,
    p_origin
  );
  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_naming_stale_for_all(
  p_naming_type text DEFAULT NULL,
  p_origin text DEFAULT 'backfill'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  UPDATE public.product_versions
  SET naming_stale = true,
      naming_stale_at = now();

  UPDATE public.product_skus
  SET naming_stale = true,
      naming_stale_at = now();

  v_job_id := public.enqueue_naming_job(
    'all',
    NULL,
    '{}'::jsonb,
    p_naming_type,
    p_origin
  );
  RETURN v_job_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
