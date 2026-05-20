CREATE OR REPLACE FUNCTION public.normalize_override_aliases(p_attrs jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_attrs IS NULL OR jsonb_typeof(p_attrs) <> 'object' THEN '{}'::jsonb
        ELSE
            CASE
                WHEN (p_attrs ? 'client_name')
                  AND NOT (p_attrs ? 'private_label_client_name')
                THEN (p_attrs - 'client_name') || jsonb_build_object('private_label_client_name', p_attrs->'client_name')
                ELSE p_attrs - 'client_name'
            END
    END;
$$;

CREATE OR REPLACE FUNCTION public.compute_effective_version_attrs(p_version_code text, p_version_attrs jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT public.normalize_override_aliases(public.get_version_automatic_rules(p_version_code))
        || public.normalize_override_aliases(COALESCE(p_version_attrs, '{}'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.compute_effective_product_attrs(
    p_rh_default boolean,
    p_assembled_default boolean,
    p_ref_attrs jsonb,
    p_version_code text,
    p_version_attrs jsonb,
    p_sku_attrs jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
            'rh', CASE WHEN COALESCE(p_rh_default, false) THEN 'RH' ELSE 'NA' END,
            'assembled_flag', COALESCE(p_assembled_default, false)
        )
        || public.normalize_override_aliases(COALESCE(p_ref_attrs, '{}'::jsonb))
        || public.compute_effective_version_attrs(p_version_code, p_version_attrs)
        || public.normalize_override_aliases(COALESCE(p_sku_attrs, '{}'::jsonb));
$$;

UPDATE public.product_versions
SET version_attrs = public.normalize_override_aliases(version_attrs),
    updated_at = NOW()
WHERE version_attrs ? 'client_name';

UPDATE public.product_skus
SET sku_attrs = public.normalize_override_aliases(sku_attrs),
    updated_at = NOW()
WHERE sku_attrs ? 'client_name';

DROP VIEW IF EXISTS public.v_ui_generate_list;
CREATE VIEW public.v_ui_generate_list AS
SELECT
    s.id,
    v.id AS version_id,
    r.id AS reference_id,
    s.sku_complete,
    s.color_code,
    s.sap_description_original,
    s.final_complete_name_es,
    s.final_complete_name_en,
    s.barcode_text,
    s.barcode_path,
    s.status,
    COALESCE(r.status, 'ACTIVO') AS ref_status,
    public.normalize_override_aliases(s.sku_attrs) AS sku_attrs,
    v.version_code,
    v.sku_base,
    v.final_base_name_es,
    v.final_base_name_en,
    v.validation_status,
    v.version_label,
    public.normalize_override_aliases(v.version_attrs) AS version_attrs,
    r.reference_code,
    r.product_name,
    r.designation,
    r.line,
    r.commercial_measure,
    r.special_label,
    r.width_cm,
    r.depth_cm,
    r.height_cm,
    r.weight_kg,
    r.stacking_max,
    r.isometric_path,
    r.isometric_asset_id,
    public.normalize_override_aliases(r.ref_attrs) AS ref_attrs,
    f.family_code,
    f.family_name,
    f.product_type,
    f.zone_home,
    f.use_destination,
    f.manufacturing_process,
    f.assembled_default,
    f.rh_default,
    f.allowed_lines,
    public.normalize_override_aliases(gvr.automatic_version_rules) AS automatic_version_rules,
    c.name_color_sap,
    public.compute_effective_version_attrs(v.version_code, v.version_attrs) AS effective_version_attrs,
    public.compute_effective_product_attrs(
        f.rh_default,
        f.assembled_default,
        r.ref_attrs,
        v.version_code,
        v.version_attrs,
        s.sku_attrs
    ) AS effective_attrs,
    COALESCE(
        NULLIF(BTRIM(public.compute_effective_product_attrs(
            f.rh_default,
            f.assembled_default,
            r.ref_attrs,
            v.version_code,
            v.version_attrs,
            s.sku_attrs
        )->>'color_name'), ''),
        NULLIF(BTRIM(c.name_color_sap), '')
    ) AS resolved_color_name,
    NULLIF(
        NULLIF(BTRIM(public.compute_effective_product_attrs(
            f.rh_default,
            f.assembled_default,
            r.ref_attrs,
            v.version_code,
            v.version_attrs,
            s.sku_attrs
        )->>'private_label_client_name'), ''),
        'NA'
    ) AS resolved_private_label_client_name,
    COALESCE(
        NULLIF(BTRIM(public.compute_effective_product_attrs(
            f.rh_default,
            f.assembled_default,
            r.ref_attrs,
            v.version_code,
            v.version_attrs,
            s.sku_attrs
        )->>'special_label'), ''),
        NULLIF(BTRIM(r.special_label), '')
    ) AS resolved_special_label,
    COALESCE((public.compute_effective_product_attrs(
        f.rh_default,
        f.assembled_default,
        r.ref_attrs,
        v.version_code,
        v.version_attrs,
        s.sku_attrs
    )->>'width_cm')::numeric, r.width_cm) AS resolved_width_cm,
    COALESCE((public.compute_effective_product_attrs(
        f.rh_default,
        f.assembled_default,
        r.ref_attrs,
        v.version_code,
        v.version_attrs,
        s.sku_attrs
    )->>'depth_cm')::numeric, r.depth_cm) AS resolved_depth_cm,
    COALESCE((public.compute_effective_product_attrs(
        f.rh_default,
        f.assembled_default,
        r.ref_attrs,
        v.version_code,
        v.version_attrs,
        s.sku_attrs
    )->>'height_cm')::numeric, r.height_cm) AS resolved_height_cm,
    COALESCE((public.compute_effective_product_attrs(
        f.rh_default,
        f.assembled_default,
        r.ref_attrs,
        v.version_code,
        v.version_attrs,
        s.sku_attrs
    )->>'weight_kg')::numeric, r.weight_kg) AS resolved_weight_kg,
    COALESCE((public.compute_effective_product_attrs(
        f.rh_default,
        f.assembled_default,
        r.ref_attrs,
        v.version_code,
        v.version_attrs,
        s.sku_attrs
    )->>'stacking_max')::integer, r.stacking_max) AS resolved_stacking_max,
    NULLIF(
        NULLIF(BTRIM(public.compute_effective_product_attrs(
            f.rh_default,
            f.assembled_default,
            r.ref_attrs,
            v.version_code,
            v.version_attrs,
            s.sku_attrs
        )->>'private_label_client_name'), ''),
        'NA'
    ) AS private_label_client_name
FROM public.product_skus s
JOIN public.product_versions v ON s.version_id = v.id
JOIN public.product_references r ON v.reference_id = r.id
JOIN public.families f ON r.family_code = f.family_code
LEFT JOIN public.global_version_rules gvr ON v.version_code = gvr.version_code
LEFT JOIN public.colors c ON s.color_code = c.code_4dig;

COMMENT ON VIEW public.v_ui_generate_list IS 'READ-ONLY UI MODEL: Vista UI con contexto efectivo de overrides (familia -> referencia -> regla global -> versión -> SKU).';

CREATE OR REPLACE FUNCTION public.rpc_preview_mass_update_skus(p_sku_ids uuid[], p_normal_updates jsonb, p_sku_attrs_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errors text[] := ARRAY[]::text[];
  v_affected_count int;
  v_allowed_cols text[] := ARRAY['barcode_text', 'status'];
  v_col text;
BEGIN
  v_affected_count := array_length(p_sku_ids, 1);

  IF p_normal_updates IS NOT NULL AND p_normal_updates != '{}'::jsonb THEN
    FOR v_col IN SELECT jsonb_object_keys(p_normal_updates) LOOP
      IF NOT (v_col = ANY(v_allowed_cols)) THEN
        v_errors := array_append(v_errors, format('Columna "%s" no permitida para edición en SKUs', v_col));
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'affected_count', v_affected_count,
    'errors', v_errors,
    'is_valid', array_length(v_errors, 1) IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_mass_update_skus(p_sku_ids uuid[], p_normal_updates jsonb, p_sku_attrs_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation jsonb;
  v_normalized_sku_attrs_updates jsonb := public.normalize_override_aliases(p_sku_attrs_updates);
BEGIN
  v_validation := public.rpc_preview_mass_update_skus(p_sku_ids, p_normal_updates, v_normalized_sku_attrs_updates);
  
  IF NOT (v_validation ->> 'is_valid')::boolean THEN
    RAISE EXCEPTION 'Errores de validación: %', v_validation -> 'errors';
  END IF;

  IF p_normal_updates IS NOT NULL AND p_normal_updates != '{}'::jsonb THEN
    UPDATE product_skus ps
    SET
      barcode_text = COALESCE((ps_new).barcode_text, barcode_text),
      status = COALESCE((ps_new).status, status)
    FROM (
      SELECT ps_inner.id as p_id, jsonb_populate_record(ps_inner, p_normal_updates) as ps_new
      FROM product_skus ps_inner 
      WHERE ps_inner.id = ANY(p_sku_ids)
    ) sub
    WHERE ps.id = sub.p_id;
  END IF;

  IF v_normalized_sku_attrs_updates IS NOT NULL AND v_normalized_sku_attrs_updates != '{}'::jsonb THEN
    UPDATE product_skus
    SET sku_attrs = COALESCE(sku_attrs, '{}'::jsonb) || v_normalized_sku_attrs_updates
    WHERE id = ANY(p_sku_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_count', array_length(p_sku_ids, 1));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_preview_mass_update_versions(
    p_ids uuid[],
    p_normal_updates jsonb,
    p_version_attrs_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_affected_count int;
    v_errors text[] := '{}';
    v_allowed_cols text[] := ARRAY['version_label', 'status'];
    v_key text;
BEGIN
    IF p_ids IS NULL OR array_length(p_ids, 1) = 0 THEN
        v_errors := array_append(v_errors, 'No se proporcionaron IDs de versiones.');
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_normal_updates)
    LOOP
        IF NOT (v_key = ANY(v_allowed_cols)) THEN
            v_errors := array_append(v_errors, 'La columna "' || v_key || '" no está permitida para edición masiva.');
        END IF;
    END LOOP;

    SELECT count(*) INTO v_affected_count
    FROM public.product_versions
    WHERE id = ANY(p_ids);

    IF v_affected_count = 0 THEN
        v_errors := array_append(v_errors, 'No se encontraron las versiones especificadas.');
    END IF;

    RETURN jsonb_build_object(
        'is_valid', (array_length(v_errors, 1) IS NULL),
        'errors', v_errors,
        'affected_count', v_affected_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_mass_update_versions(
    p_ids uuid[],
    p_normal_updates jsonb,
    p_version_attrs_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_preview jsonb;
    v_query text;
    v_updates_text text := '';
    v_key text;
    v_val jsonb;
    v_normalized_version_attrs_updates jsonb := public.normalize_override_aliases(p_version_attrs_updates);
BEGIN
    v_preview := rpc_preview_mass_update_versions(p_ids, p_normal_updates, v_normalized_version_attrs_updates);
    
    IF NOT (v_preview->>'is_valid')::boolean THEN
        RETURN v_preview;
    END IF;

    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_normal_updates)
    LOOP
        v_updates_text := v_updates_text || v_key || ' = ' || quote_nullable(v_val #>> '{}') || ', ';
    END LOOP;

    IF v_normalized_version_attrs_updates IS NOT NULL
       AND jsonb_typeof(v_normalized_version_attrs_updates) = 'object'
       AND v_normalized_version_attrs_updates <> '{}'::jsonb THEN
        v_updates_text := v_updates_text || 'version_attrs = COALESCE(version_attrs, ''{}''::jsonb) || '
            || quote_literal(v_normalized_version_attrs_updates::text) || '::jsonb, ';
    END IF;

    IF v_updates_text <> '' THEN
        v_updates_text := rtrim(v_updates_text, ', ');
        v_query := 'UPDATE public.product_versions SET ' || v_updates_text || ' WHERE id = ANY($1)';
        EXECUTE v_query USING p_ids;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'affected_count', v_preview->>'affected_count'
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
