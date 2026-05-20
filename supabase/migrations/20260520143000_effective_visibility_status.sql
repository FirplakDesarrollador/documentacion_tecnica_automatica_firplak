CREATE OR REPLACE FUNCTION public.get_version_automatic_rules(p_version_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT public.normalize_override_aliases(COALESCE(gvr.automatic_version_rules, '{}'::jsonb))
    FROM public.global_version_rules gvr
    WHERE gvr.version_code = p_version_code
      AND COALESCE(gvr.status, 'ACTIVO') <> 'INACTIVO'
    LIMIT 1;
$$;

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
    COALESCE(s.status, 'ACTIVO') AS status,
    COALESCE(v.status, 'ACTIVO') AS version_status,
    COALESCE(r.status, 'ACTIVO') AS ref_status,
    'ACTIVO'::text AS family_status,
    COALESCE(gvr.status, 'ACTIVO') AS global_version_rule_status,
    CASE
        WHEN COALESCE(s.status, 'ACTIVO') = 'INACTIVO'
          OR COALESCE(v.status, 'ACTIVO') = 'INACTIVO'
          OR COALESCE(r.status, 'ACTIVO') = 'INACTIVO'
        THEN 'INACTIVO'
        ELSE 'ACTIVO'
    END AS effective_status,
    CASE
        WHEN COALESCE(s.status, 'ACTIVO') = 'INACTIVO'
          OR COALESCE(v.status, 'ACTIVO') = 'INACTIVO'
          OR COALESCE(r.status, 'ACTIVO') = 'INACTIVO'
        THEN false
        ELSE true
    END AS is_exportable,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN COALESCE(s.status, 'ACTIVO') = 'INACTIVO' THEN 'SKU inactivo' END,
        CASE WHEN COALESCE(v.status, 'ACTIVO') = 'INACTIVO' THEN 'Version inactiva' END,
        CASE WHEN COALESCE(r.status, 'ACTIVO') = 'INACTIVO' THEN 'Referencia inactiva' END
    ], NULL)::text[] AS inactive_reasons,
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
    CASE
        WHEN COALESCE(gvr.status, 'ACTIVO') = 'INACTIVO' THEN '{}'::jsonb
        ELSE public.normalize_override_aliases(gvr.automatic_version_rules)
    END AS automatic_version_rules,
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

COMMENT ON VIEW public.v_ui_generate_list IS 'READ-ONLY UI MODEL: Vista UI con contexto efectivo de overrides y estado efectivo para visibilidad/exportacion.';

NOTIFY pgrst, 'reload schema';
