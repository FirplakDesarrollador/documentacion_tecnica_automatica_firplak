CREATE OR REPLACE FUNCTION public.rpc_pending_structural_summary()
RETURNS TABLE (
  pending_count integer,
  critical_count integer,
  missing_isometric_count integer,
  missing_template_field_count integer,
  translation_candidate_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH template_elements AS (
    SELECT
      COALESCE(t.brand_scope, 'firplak') AS brand_scope,
      NULLIF(upper(btrim(t.private_label_client_name)), '') AS private_label_client_name,
      elem
    FROM public.plantillas_doc_tec t
    CROSS JOIN LATERAL jsonb_array_elements(public.pending_safe_jsonb_array(t.elements_json)) elem
    WHERE t.active = true
  ),
  required_fields AS (
    SELECT DISTINCT
      CASE
        WHEN elem->>'type' = 'image'
          AND lower(btrim(COALESCE(elem->>'content', ''))) LIKE 'isom%'
          THEN 'isometric'
        WHEN elem->>'type' IN ('dynamic_text', 'barcode', 'dynamic_image')
          THEN NULLIF(btrim(elem->>'dataField'), '')
        ELSE NULL
      END AS field,
      brand_scope,
      private_label_client_name
    FROM template_elements
    WHERE lower(COALESCE(elem->>'required', 'false')) = 'true'
  ),
  requirements AS (
    SELECT
      field,
      bool_or(brand_scope = 'firplak') AS global_required,
      array_remove(array_agg(DISTINCT private_label_client_name) FILTER (
        WHERE brand_scope = 'private_label' AND private_label_client_name IS NOT NULL
      ), NULL) AS required_clients
    FROM required_fields
    WHERE field IS NOT NULL
      AND field NOT IN ('print_datetime', 'of_number', 'partes_texto')
    GROUP BY field
  ),
  base_source AS (
    SELECT
      s.id,
      s.sku_complete,
      s.barcode_text,
      s.final_complete_name_es,
      s.final_complete_name_en,
      s.sap_description_recommended_es,
      s.sap_description_recommended_en,
      s.naming_stale_final_complete_name,
      s.naming_stale_sap_description_recommended,
      s.naming_stale,
      s.sku_attrs,
      pv.validation_status,
      pv.version_attrs,
      pv.version_code,
      pv.version_label,
      pr.ref_attrs,
      pr.isometric_asset_id,
      pr.isometric_path,
      pr.special_label,
      pr.product_name,
      pr.designation,
      pr.line,
      pr.commercial_measure,
      f.rh_default,
      f.assembled_default,
      f.product_type,
      f.use_destination,
      f.zone_home,
      c.name_color_sap
    FROM public.product_skus s
    JOIN public.product_versions pv ON pv.id = s.version_id
    JOIN public.product_references pr ON pr.id = pv.reference_id
    JOIN public.families f ON f.family_code = pr.family_code
    LEFT JOIN public.global_version_rules gvr ON gvr.version_code = pv.version_code
    LEFT JOIN public.colors c ON c.code_4dig = s.color_code
    WHERE COALESCE(s.status, 'ACTIVO') <> 'INACTIVO'
      AND COALESCE(pv.status, 'ACTIVO') <> 'INACTIVO'
      AND COALESCE(pr.status, 'ACTIVO') <> 'INACTIVO'
      AND COALESCE(gvr.status, 'ACTIVO') <> 'INACTIVO'
  ),
  base AS MATERIALIZED (
    SELECT
      bs.*,
      public.compute_effective_product_attrs(
        bs.rh_default,
        bs.assembled_default,
        bs.ref_attrs,
        bs.version_code,
        bs.version_attrs,
        bs.sku_attrs
      ) AS effective_attrs,
      public.compute_effective_version_attrs(bs.version_code, bs.version_attrs) AS effective_version_attrs
    FROM base_source bs
  ),
  missing_fields AS (
    SELECT
      b.id,
      r.field
    FROM base b
    JOIN requirements r
      ON r.global_required
      OR upper(btrim(COALESCE(NULLIF(NULLIF(btrim(b.effective_attrs->>'private_label_client_name'), ''), 'NA'), ''))) = ANY(COALESCE(r.required_clients, ARRAY[]::text[]))
    CROSS JOIN LATERAL (
      SELECT CASE r.field
        WHEN 'isometric' THEN COALESCE(
          NULLIF(b.effective_attrs->>'isometric_asset_id', ''),
          NULLIF(b.effective_version_attrs->>'isometric_asset_id', ''),
          NULLIF(b.isometric_asset_id, ''),
          NULLIF(b.effective_attrs->>'isometric_path', ''),
          NULLIF(b.effective_version_attrs->>'isometric_path', ''),
          NULLIF(b.isometric_path, '')
        )
        WHEN 'barcode_text' THEN COALESCE(NULLIF(b.effective_attrs->>'barcode_text', ''), NULLIF(b.barcode_text, ''))
        WHEN 'color_name' THEN COALESCE(NULLIF(b.effective_attrs->>'color_name', ''), NULLIF(b.name_color_sap, ''))
        WHEN 'private_label_client_name' THEN COALESCE(NULLIF(b.effective_attrs->>'private_label_client_name', ''), NULLIF(NULLIF(btrim(b.effective_attrs->>'private_label_client_name'), ''), 'NA'))
        WHEN 'special_label' THEN COALESCE(NULLIF(b.effective_attrs->>'special_label', ''), NULLIF(b.special_label, ''))
        WHEN 'product_type' THEN COALESCE(NULLIF(b.effective_attrs->>'product_type', ''), NULLIF(b.product_type, ''))
        WHEN 'product_name' THEN COALESCE(NULLIF(b.effective_attrs->>'product_name', ''), NULLIF(b.product_name, ''))
        WHEN 'designation' THEN COALESCE(NULLIF(b.effective_attrs->>'designation', ''), NULLIF(b.designation, ''))
        WHEN 'line' THEN COALESCE(NULLIF(b.effective_attrs->>'line', ''), NULLIF(b.line, ''))
        WHEN 'commercial_measure' THEN COALESCE(NULLIF(b.effective_attrs->>'commercial_measure', ''), NULLIF(b.commercial_measure, ''))
        WHEN 'use_destination' THEN COALESCE(NULLIF(b.effective_attrs->>'use_destination', ''), NULLIF(b.use_destination, ''))
        WHEN 'zone_home' THEN COALESCE(NULLIF(b.effective_attrs->>'zone_home', ''), NULLIF(b.zone_home, ''))
        WHEN 'version_label' THEN COALESCE(NULLIF(b.effective_attrs->>'version_label', ''), NULLIF(b.version_label, ''))
        ELSE NULLIF(b.effective_attrs->>r.field, '')
      END AS field_value
    ) resolved
    WHERE CASE
      WHEN r.field = 'isometric'
        THEN resolved.field_value IS NULL OR upper(btrim(resolved.field_value)) IN ('NA', 'N/A', '-')
      ELSE resolved.field_value IS NULL OR resolved.field_value = ''
    END
  ),
  product_reasons AS (
    SELECT
      b.id,
      bool_or(m.field = 'isometric') AS missing_isometric,
      COALESCE(
        array_agg(DISTINCT m.field) FILTER (WHERE m.field <> 'isometric'),
        ARRAY[]::text[]
      ) AS missing_template_fields
    FROM base b
    JOIN missing_fields m ON m.id = b.id
    GROUP BY b.id
  ),
  translation_candidates AS (
    SELECT COUNT(*)::integer AS count
    FROM base b
    WHERE b.validation_status = 'needs_review'
       OR (
          NULLIF(b.final_complete_name_es, '') IS NOT NULL
          AND NULLIF(b.final_complete_name_en, '') IS NULL
       )
       OR (
          NULLIF(b.sap_description_recommended_es, '') IS NOT NULL
          AND NULLIF(b.sap_description_recommended_en, '') IS NULL
       )
  )
  SELECT
    COUNT(*)::integer AS pending_count,
    COUNT(*)::integer AS critical_count,
    COUNT(*) FILTER (WHERE pr.missing_isometric)::integer AS missing_isometric_count,
    COUNT(*) FILTER (WHERE array_length(pr.missing_template_fields, 1) > 0)::integer AS missing_template_field_count,
    COALESCE((SELECT count FROM translation_candidates), 0)::integer AS translation_candidate_count
  FROM product_reasons pr;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_pending_structural_page(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  product_id text,
  product_code text,
  product_name text,
  severity text,
  reasons jsonb,
  total_count integer,
  page integer,
  page_size integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_reason text := NULLIF(upper(btrim(COALESCE(p_reason, ''))), '');
BEGIN
  RETURN QUERY
  WITH template_elements AS (
    SELECT
      COALESCE(t.brand_scope, 'firplak') AS brand_scope,
      NULLIF(upper(btrim(t.private_label_client_name)), '') AS private_label_client_name,
      elem
    FROM public.plantillas_doc_tec t
    CROSS JOIN LATERAL jsonb_array_elements(public.pending_safe_jsonb_array(t.elements_json)) elem
    WHERE t.active = true
  ),
  required_fields AS (
    SELECT DISTINCT
      CASE
        WHEN elem->>'type' = 'image'
          AND lower(btrim(COALESCE(elem->>'content', ''))) LIKE 'isom%'
          THEN 'isometric'
        WHEN elem->>'type' IN ('dynamic_text', 'barcode', 'dynamic_image')
          THEN NULLIF(btrim(elem->>'dataField'), '')
        ELSE NULL
      END AS field,
      brand_scope,
      private_label_client_name
    FROM template_elements
    WHERE lower(COALESCE(elem->>'required', 'false')) = 'true'
  ),
  requirements AS (
    SELECT
      field,
      bool_or(brand_scope = 'firplak') AS global_required,
      array_remove(array_agg(DISTINCT private_label_client_name) FILTER (
        WHERE brand_scope = 'private_label' AND private_label_client_name IS NOT NULL
      ), NULL) AS required_clients
    FROM required_fields
    WHERE field IS NOT NULL
      AND field NOT IN ('print_datetime', 'of_number', 'partes_texto')
    GROUP BY field
  ),
  base_source AS (
    SELECT
      s.id,
      s.sku_complete,
      s.barcode_text,
      s.final_complete_name_es,
      s.sku_attrs,
      pv.version_attrs,
      pv.version_code,
      pv.version_label,
      pr.ref_attrs,
      pr.isometric_asset_id,
      pr.isometric_path,
      pr.special_label,
      pr.product_name,
      pr.designation,
      pr.line,
      pr.commercial_measure,
      f.rh_default,
      f.assembled_default,
      f.product_type,
      f.use_destination,
      f.zone_home,
      c.name_color_sap
    FROM public.product_skus s
    JOIN public.product_versions pv ON pv.id = s.version_id
    JOIN public.product_references pr ON pr.id = pv.reference_id
    JOIN public.families f ON f.family_code = pr.family_code
    LEFT JOIN public.global_version_rules gvr ON gvr.version_code = pv.version_code
    LEFT JOIN public.colors c ON c.code_4dig = s.color_code
    WHERE COALESCE(s.status, 'ACTIVO') <> 'INACTIVO'
      AND COALESCE(pv.status, 'ACTIVO') <> 'INACTIVO'
      AND COALESCE(pr.status, 'ACTIVO') <> 'INACTIVO'
      AND COALESCE(gvr.status, 'ACTIVO') <> 'INACTIVO'
  ),
  base AS MATERIALIZED (
    SELECT
      bs.*,
      public.compute_effective_product_attrs(
        bs.rh_default,
        bs.assembled_default,
        bs.ref_attrs,
        bs.version_code,
        bs.version_attrs,
        bs.sku_attrs
      ) AS effective_attrs,
      public.compute_effective_version_attrs(bs.version_code, bs.version_attrs) AS effective_version_attrs
    FROM base_source bs
  ),
  missing_fields AS (
    SELECT
      b.id,
      r.field
    FROM base b
    JOIN requirements r
      ON r.global_required
      OR upper(btrim(COALESCE(NULLIF(NULLIF(btrim(b.effective_attrs->>'private_label_client_name'), ''), 'NA'), ''))) = ANY(COALESCE(r.required_clients, ARRAY[]::text[]))
    CROSS JOIN LATERAL (
      SELECT CASE r.field
        WHEN 'isometric' THEN COALESCE(
          NULLIF(b.effective_attrs->>'isometric_asset_id', ''),
          NULLIF(b.effective_version_attrs->>'isometric_asset_id', ''),
          NULLIF(b.isometric_asset_id, ''),
          NULLIF(b.effective_attrs->>'isometric_path', ''),
          NULLIF(b.effective_version_attrs->>'isometric_path', ''),
          NULLIF(b.isometric_path, '')
        )
        WHEN 'barcode_text' THEN COALESCE(NULLIF(b.effective_attrs->>'barcode_text', ''), NULLIF(b.barcode_text, ''))
        WHEN 'color_name' THEN COALESCE(NULLIF(b.effective_attrs->>'color_name', ''), NULLIF(b.name_color_sap, ''))
        WHEN 'private_label_client_name' THEN COALESCE(NULLIF(b.effective_attrs->>'private_label_client_name', ''), NULLIF(NULLIF(btrim(b.effective_attrs->>'private_label_client_name'), ''), 'NA'))
        WHEN 'special_label' THEN COALESCE(NULLIF(b.effective_attrs->>'special_label', ''), NULLIF(b.special_label, ''))
        WHEN 'product_type' THEN COALESCE(NULLIF(b.effective_attrs->>'product_type', ''), NULLIF(b.product_type, ''))
        WHEN 'product_name' THEN COALESCE(NULLIF(b.effective_attrs->>'product_name', ''), NULLIF(b.product_name, ''))
        WHEN 'designation' THEN COALESCE(NULLIF(b.effective_attrs->>'designation', ''), NULLIF(b.designation, ''))
        WHEN 'line' THEN COALESCE(NULLIF(b.effective_attrs->>'line', ''), NULLIF(b.line, ''))
        WHEN 'commercial_measure' THEN COALESCE(NULLIF(b.effective_attrs->>'commercial_measure', ''), NULLIF(b.commercial_measure, ''))
        WHEN 'use_destination' THEN COALESCE(NULLIF(b.effective_attrs->>'use_destination', ''), NULLIF(b.use_destination, ''))
        WHEN 'zone_home' THEN COALESCE(NULLIF(b.effective_attrs->>'zone_home', ''), NULLIF(b.zone_home, ''))
        WHEN 'version_label' THEN COALESCE(NULLIF(b.effective_attrs->>'version_label', ''), NULLIF(b.version_label, ''))
        ELSE NULLIF(b.effective_attrs->>r.field, '')
      END AS field_value
    ) resolved
    WHERE CASE
      WHEN r.field = 'isometric'
        THEN resolved.field_value IS NULL OR upper(btrim(resolved.field_value)) IN ('NA', 'N/A', '-')
      ELSE resolved.field_value IS NULL OR resolved.field_value = ''
    END
  ),
  product_reasons AS (
    SELECT
      b.id::text AS product_id,
      b.sku_complete AS product_code,
      COALESCE(NULLIF(b.final_complete_name_es, ''), 'Sin nombre') AS product_name,
      bool_or(m.field = 'isometric') AS missing_isometric,
      COALESCE(
        array_agg(DISTINCT m.field) FILTER (WHERE m.field <> 'isometric'),
        ARRAY[]::text[]
      ) AS missing_template_fields
    FROM base b
    JOIN missing_fields m ON m.id = b.id
    GROUP BY b.id, b.sku_complete, b.final_complete_name_es
  ),
  enriched AS (
    SELECT
      pr.product_id,
      pr.product_code,
      pr.product_name,
      'critical'::text AS severity,
      (
        CASE WHEN pr.missing_isometric THEN
          jsonb_build_array(jsonb_build_object(
            'code', 'MISSING_ISOMETRIC',
            'severity', 'critical',
            'message', 'Falta isometrico (requerido por plantillas activas).',
            'fields', jsonb_build_array('isometric')
          ))
        ELSE '[]'::jsonb END
      ) ||
      (
        CASE WHEN array_length(pr.missing_template_fields, 1) > 0 THEN
          jsonb_build_array(jsonb_build_object(
            'code', 'MISSING_TEMPLATE_FIELD',
            'severity', 'critical',
            'message', 'Faltan campos requeridos por plantillas activas: ' || array_to_string(pr.missing_template_fields, ', ') || '.',
            'fields', to_jsonb(pr.missing_template_fields)
          ))
        ELSE '[]'::jsonb END
      ) AS reasons,
      pr.missing_isometric,
      array_length(pr.missing_template_fields, 1) > 0 AS missing_template_field
    FROM product_reasons pr
  ),
  filtered AS (
    SELECT *
    FROM enriched e
    WHERE v_reason IS NULL
       OR (v_reason = 'MISSING_ISOMETRIC' AND e.missing_isometric)
       OR (v_reason = 'MISSING_TEMPLATE_FIELD' AND e.missing_template_field)
  ),
  counted AS (
    SELECT
      f.*,
      COUNT(*) OVER()::integer AS total_count
    FROM filtered f
    ORDER BY f.product_code ASC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  )
  SELECT
    c.product_id,
    c.product_code,
    c.product_name,
    c.severity,
    c.reasons,
    c.total_count,
    v_page AS page,
    v_page_size AS page_size
  FROM counted c;
END;
$$;

NOTIFY pgrst, 'reload schema';
