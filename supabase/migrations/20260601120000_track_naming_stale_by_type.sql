ALTER TABLE public.product_versions
  ADD COLUMN IF NOT EXISTS naming_stale_final_base_name boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_skus
  ADD COLUMN IF NOT EXISTS naming_stale_final_complete_name boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS naming_stale_sap_description_recommended boolean NOT NULL DEFAULT false;

UPDATE public.product_versions
SET naming_stale_final_base_name = true
WHERE naming_stale = true
  AND naming_stale_final_base_name = false;

UPDATE public.product_skus
SET naming_stale_final_complete_name = true,
    naming_stale_sap_description_recommended = true
WHERE naming_stale = true
  AND (
    naming_stale_final_complete_name = false
    OR naming_stale_sap_description_recommended = false
  );

UPDATE public.product_versions
SET naming_stale = naming_stale_final_base_name
WHERE naming_stale IS DISTINCT FROM naming_stale_final_base_name;

UPDATE public.product_skus
SET naming_stale = (
  naming_stale_final_complete_name
  OR naming_stale_sap_description_recommended
)
WHERE naming_stale IS DISTINCT FROM (
  naming_stale_final_complete_name
  OR naming_stale_sap_description_recommended
);

CREATE INDEX IF NOT EXISTS idx_product_versions_naming_stale_final_base_name
  ON public.product_versions (naming_stale_final_base_name, naming_stale_at)
  WHERE naming_stale_final_base_name = true;

CREATE INDEX IF NOT EXISTS idx_product_skus_naming_stale_final_complete_name
  ON public.product_skus (naming_stale_final_complete_name, naming_stale_at)
  WHERE naming_stale_final_complete_name = true;

CREATE INDEX IF NOT EXISTS idx_product_skus_naming_stale_sap_description_recommended
  ON public.product_skus (naming_stale_sap_description_recommended, naming_stale_at)
  WHERE naming_stale_sap_description_recommended = true;

CREATE OR REPLACE FUNCTION public.naming_type_marks_final_base_name(
  p_naming_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(btrim(p_naming_type), ''), 'all') IN ('all', 'final_base_name')
$$;

CREATE OR REPLACE FUNCTION public.naming_type_marks_final_complete_name(
  p_naming_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(btrim(p_naming_type), ''), 'all') IN ('all', 'final_complete_name')
$$;

CREATE OR REPLACE FUNCTION public.naming_type_marks_sap_description_recommended(
  p_naming_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(btrim(p_naming_type), ''), 'all') IN ('all', 'sap_description_recommended')
$$;

CREATE OR REPLACE FUNCTION public.naming_type_marks_skus(
  p_naming_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.naming_type_marks_final_complete_name(p_naming_type)
      OR public.naming_type_marks_sap_description_recommended(p_naming_type)
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

  IF public.naming_type_marks_final_base_name(p_naming_type) THEN
    UPDATE public.product_versions v
    SET naming_stale = true,
        naming_stale_final_base_name = true,
        naming_stale_at = now()
    FROM public.product_references r
    JOIN public.families f ON r.family_code = f.family_code
    WHERE v.reference_id = r.id
      AND upper(btrim(COALESCE(f.product_type, ''))) = v_product_type;
  END IF;

  IF public.naming_type_marks_skus(p_naming_type) THEN
    UPDATE public.product_skus s
    SET naming_stale = true,
        naming_stale_final_complete_name = (
          naming_stale_final_complete_name
          OR public.naming_type_marks_final_complete_name(p_naming_type)
        ),
        naming_stale_sap_description_recommended = (
          naming_stale_sap_description_recommended
          OR public.naming_type_marks_sap_description_recommended(p_naming_type)
        ),
        naming_stale_at = now()
    FROM public.product_versions v
    JOIN public.product_references r ON v.reference_id = r.id
    JOIN public.families f ON r.family_code = f.family_code
    WHERE s.version_id = v.id
      AND upper(btrim(COALESCE(f.product_type, ''))) = v_product_type;
  END IF;

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

  IF public.naming_type_marks_final_base_name(p_naming_type) THEN
    UPDATE public.product_versions v
    SET naming_stale = true,
        naming_stale_final_base_name = true,
        naming_stale_at = now()
    FROM public.product_references r
    WHERE v.reference_id = r.id
      AND upper(btrim(r.family_code)) = ANY(v_codes);
  END IF;

  IF public.naming_type_marks_skus(p_naming_type) THEN
    UPDATE public.product_skus s
    SET naming_stale = true,
        naming_stale_final_complete_name = (
          naming_stale_final_complete_name
          OR public.naming_type_marks_final_complete_name(p_naming_type)
        ),
        naming_stale_sap_description_recommended = (
          naming_stale_sap_description_recommended
          OR public.naming_type_marks_sap_description_recommended(p_naming_type)
        ),
        naming_stale_at = now()
    FROM public.product_versions v
    JOIN public.product_references r ON v.reference_id = r.id
    WHERE s.version_id = v.id
      AND upper(btrim(r.family_code)) = ANY(v_codes);
  END IF;

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

  IF public.naming_type_marks_final_base_name(p_naming_type) THEN
    UPDATE public.product_versions
    SET naming_stale = true,
        naming_stale_final_base_name = true,
        naming_stale_at = now()
    WHERE reference_id = ANY(v_ids);
  END IF;

  IF public.naming_type_marks_skus(p_naming_type) THEN
    UPDATE public.product_skus s
    SET naming_stale = true,
        naming_stale_final_complete_name = (
          naming_stale_final_complete_name
          OR public.naming_type_marks_final_complete_name(p_naming_type)
        ),
        naming_stale_sap_description_recommended = (
          naming_stale_sap_description_recommended
          OR public.naming_type_marks_sap_description_recommended(p_naming_type)
        ),
        naming_stale_at = now()
    FROM public.product_versions v
    WHERE s.version_id = v.id
      AND v.reference_id = ANY(v_ids);
  END IF;

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

  IF public.naming_type_marks_final_base_name(p_naming_type) THEN
    UPDATE public.product_versions
    SET naming_stale = true,
        naming_stale_final_base_name = true,
        naming_stale_at = now()
    WHERE id = ANY(v_ids);
  END IF;

  IF public.naming_type_marks_skus(p_naming_type) THEN
    UPDATE public.product_skus
    SET naming_stale = true,
        naming_stale_final_complete_name = (
          naming_stale_final_complete_name
          OR public.naming_type_marks_final_complete_name(p_naming_type)
        ),
        naming_stale_sap_description_recommended = (
          naming_stale_sap_description_recommended
          OR public.naming_type_marks_sap_description_recommended(p_naming_type)
        ),
        naming_stale_at = now()
    WHERE version_id = ANY(v_ids);
  END IF;

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

  IF COALESCE(array_length(v_ids, 1), 0) = 0
     OR NOT public.naming_type_marks_skus(p_naming_type) THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_skus
  SET naming_stale = true,
      naming_stale_final_complete_name = (
        naming_stale_final_complete_name
        OR public.naming_type_marks_final_complete_name(p_naming_type)
      ),
      naming_stale_sap_description_recommended = (
        naming_stale_sap_description_recommended
        OR public.naming_type_marks_sap_description_recommended(p_naming_type)
      ),
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
  IF v_color_code = ''
     OR NOT public.naming_type_marks_skus(p_naming_type) THEN
    RETURN NULL;
  END IF;

  UPDATE public.product_skus
  SET naming_stale = true,
      naming_stale_final_complete_name = (
        naming_stale_final_complete_name
        OR public.naming_type_marks_final_complete_name(p_naming_type)
      ),
      naming_stale_sap_description_recommended = (
        naming_stale_sap_description_recommended
        OR public.naming_type_marks_sap_description_recommended(p_naming_type)
      ),
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

  IF public.naming_type_marks_final_base_name(p_naming_type) THEN
    UPDATE public.product_versions
    SET naming_stale = true,
        naming_stale_final_base_name = true,
        naming_stale_at = now()
    WHERE upper(btrim(version_code)) = v_version_code;
  END IF;

  IF public.naming_type_marks_skus(p_naming_type) THEN
    UPDATE public.product_skus s
    SET naming_stale = true,
        naming_stale_final_complete_name = (
          naming_stale_final_complete_name
          OR public.naming_type_marks_final_complete_name(p_naming_type)
        ),
        naming_stale_sap_description_recommended = (
          naming_stale_sap_description_recommended
          OR public.naming_type_marks_sap_description_recommended(p_naming_type)
        ),
        naming_stale_at = now()
    FROM public.product_versions v
    WHERE s.version_id = v.id
      AND upper(btrim(v.version_code)) = v_version_code;
  END IF;

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
  IF public.naming_type_marks_final_base_name(p_naming_type) THEN
    UPDATE public.product_versions
    SET naming_stale = true,
        naming_stale_final_base_name = true,
        naming_stale_at = now();
  END IF;

  IF public.naming_type_marks_skus(p_naming_type) THEN
    UPDATE public.product_skus
    SET naming_stale = true,
        naming_stale_final_complete_name = (
          naming_stale_final_complete_name
          OR public.naming_type_marks_final_complete_name(p_naming_type)
        ),
        naming_stale_sap_description_recommended = (
          naming_stale_sap_description_recommended
          OR public.naming_type_marks_sap_description_recommended(p_naming_type)
        ),
        naming_stale_at = now();
  END IF;

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
