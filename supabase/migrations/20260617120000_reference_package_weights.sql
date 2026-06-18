-- Reference-level package quantity and box weights.
-- q_package lives in product_references.ref_attrs.
-- Per-box weights live in product_references.weight_kg as JSONB:
--   12.5
--   {"weights_kg":[12.5,8.7],"peso_total":21.2}

CREATE OR REPLACE FUNCTION public.normalize_product_reference_weight_kg(p_weight jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_type text;
  v_text text;
  v_item text;
  v_total numeric := 0;
  v_count integer := 0;
  v_weights jsonb;
BEGIN
  IF p_weight IS NULL OR p_weight = 'null'::jsonb THEN
    RETURN NULL;
  END IF;

  v_type := jsonb_typeof(p_weight);

  IF v_type IN ('number', 'string') THEN
    v_text := NULLIF(replace(btrim(p_weight #>> '{}'), ',', '.'), '');
    IF v_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RETURN v_text::numeric;
    END IF;
    RETURN NULL;
  END IF;

  IF v_type = 'object' THEN
    v_text := NULLIF(replace(btrim(COALESCE(p_weight->>'peso_total', '')), ',', '.'), '');
    IF v_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RETURN v_text::numeric;
    END IF;

    v_text := NULLIF(replace(btrim(COALESCE(p_weight->>'total_weight_kg', '')), ',', '.'), '');
    IF v_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RETURN v_text::numeric;
    END IF;

    v_text := NULLIF(replace(btrim(COALESCE(p_weight->>'weight_total_kg', '')), ',', '.'), '');
    IF v_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RETURN v_text::numeric;
    END IF;

    v_text := NULLIF(replace(btrim(COALESCE(p_weight->>'total_kg', '')), ',', '.'), '');
    IF v_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RETURN v_text::numeric;
    END IF;

    v_weights := COALESCE(p_weight->'weights_kg', p_weight->'cajas_kg');
    IF v_weights IS NULL OR jsonb_typeof(v_weights) <> 'array' THEN
      RETURN NULL;
    END IF;
  ELSIF v_type = 'array' THEN
    v_weights := p_weight;
  ELSE
    RETURN NULL;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements_text(v_weights) AS weight_values(value) LOOP
    v_text := NULLIF(replace(btrim(COALESCE(v_item, '')), ',', '.'), '');
    IF v_text IS NULL OR v_text !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RETURN NULL;
    END IF;
    v_total := v_total + v_text::numeric;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  RETURN v_total;
END;
$$;

DROP VIEW IF EXISTS public.v_ui_generate_list;

ALTER TABLE public.product_references
  ALTER COLUMN weight_kg TYPE jsonb
  USING CASE
    WHEN weight_kg IS NULL THEN 'null'::jsonb
    ELSE to_jsonb(weight_kg)
  END;

UPDATE public.product_versions
SET version_label = regexp_replace(version_label, '([0-9]+)\s*PARTES?', '\1 CAJAS', 'gi')
WHERE version_label ~* '[0-9]+\s*PARTES?';

WITH latest_version_boxes AS (
  SELECT DISTINCT ON (reference_id)
    reference_id,
    version_attrs->'label_boxes' AS label_boxes
  FROM public.product_versions
  WHERE version_attrs ? 'label_boxes'
  ORDER BY reference_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
)
UPDATE public.product_references r
SET weight_kg = CASE
  WHEN jsonb_typeof(lvb.label_boxes) = 'object' THEN
    lvb.label_boxes || jsonb_build_object(
      'peso_total',
      COALESCE(
        public.normalize_product_reference_weight_kg(lvb.label_boxes),
        public.normalize_product_reference_weight_kg(r.weight_kg)
      )
    )
  ELSE r.weight_kg
END
FROM latest_version_boxes lvb
WHERE r.id = lvb.reference_id;

WITH package_by_reference AS (
  SELECT
    r.id,
    GREATEST(
      1,
      COALESCE(
        MAX(NULLIF(substring(upper(COALESCE(v.version_label, '')) FROM '([0-9]+)\s*CAJAS?'), '')::int),
        1
      ),
      COALESCE(
        MAX(
          CASE
            WHEN jsonb_typeof(v.version_attrs->'label_boxes'->'weights_kg') = 'array'
            THEN jsonb_array_length(v.version_attrs->'label_boxes'->'weights_kg')
            ELSE NULL
          END
        ),
        1
      )
    ) AS total_boxes
  FROM public.product_references r
  LEFT JOIN public.product_versions v ON v.reference_id = r.id
  GROUP BY r.id
)
UPDATE public.product_references r
SET ref_attrs = COALESCE(r.ref_attrs, '{}'::jsonb) || jsonb_build_object(
  'q_package',
  CASE
    WHEN p.total_boxes = 1 THEN '1 CAJA'
    ELSE p.total_boxes::text || ' CAJAS'
  END
)
FROM package_by_reference p
WHERE p.id = r.id;

WITH allowed_values AS (
  SELECT jsonb_agg(
    CASE
      WHEN n = 0 THEN 'NA'
      WHEN n = 1 THEN '1 CAJA'
      ELSE n::text || ' CAJAS'
    END
    ORDER BY n
  ) AS values
  FROM generate_series(0, 20) AS n
)
UPDATE public.families f
SET ref_attrs_schema = COALESCE(f.ref_attrs_schema, '{}'::jsonb) ||
  jsonb_build_object(
    'q_package',
    jsonb_build_object(
      'type', 'enum',
      'allowed_values', allowed_values.values
    )
  )
FROM allowed_values;

CREATE OR REPLACE FUNCTION public.get_base_ref_attrs_schema(p_product_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package_values jsonb;
BEGIN
  IF p_product_type IS NULL OR btrim(p_product_type) = '' THEN
    RAISE EXCEPTION 'PRODUCT_TYPE is required to generate base ref_attrs_schema';
  END IF;

  SELECT jsonb_agg(
    CASE
      WHEN n = 0 THEN 'NA'
      WHEN n = 1 THEN '1 CAJA'
      ELSE n::text || ' CAJAS'
    END
    ORDER BY n
  )
  INTO v_package_values
  FROM generate_series(0, 20) AS n;

  RETURN jsonb_build_object(
    'accessory_text', jsonb_build_object('label','Accesorios','type','string','default_value',null,'active',true),
    'door_color_text', jsonb_build_object('label','Color Frente','type','string','default_value',null,'active',true),
    'bisagras', jsonb_build_object('label','Bisagras','type','string','default_value','NA','active',true),
    'canto_puertas', jsonb_build_object('label','Canto Puertas','type','string','default_value','NA','active',true),
    'armado_con_lvm', jsonb_build_object('label','Armado con LVM','type','string','default_value','NA','active',true),
    'assembled_flag', jsonb_build_object('label','Armado','type','boolean','default_value',false,'active',true),
    'rh', jsonb_build_object('label','RH','type','enum','allowed_values',jsonb_build_array('RH','NA'),'default_value','NA','active',true),
    'carb2', jsonb_build_object('label','CARB2','type','enum','allowed_values',jsonb_build_array('CARB2','NA'),'default_value','NA','active',true),
    'product_type', jsonb_build_object('label','Tipo','type','string','default_value',null,'active',true),
    'q_package', jsonb_build_object('label','Cantidad de cajas','type','enum','allowed_values',v_package_values,'default_value','1 CAJA','active',true)
  );
END;
$$;

UPDATE public.product_versions
SET version_attrs = version_attrs - 'label_boxes' - 'weight_kg' - 'q_package'
WHERE version_attrs ? 'label_boxes'
   OR version_attrs ? 'weight_kg'
   OR version_attrs ? 'q_package';

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
          OR COALESCE(gvr.status, 'ACTIVO') = 'INACTIVO'
        THEN 'INACTIVO'
        ELSE 'ACTIVO'
    END AS effective_status,
    CASE
        WHEN COALESCE(s.status, 'ACTIVO') = 'INACTIVO'
          OR COALESCE(v.status, 'ACTIVO') = 'INACTIVO'
          OR COALESCE(r.status, 'ACTIVO') = 'INACTIVO'
          OR COALESCE(gvr.status, 'ACTIVO') = 'INACTIVO'
        THEN false
        ELSE true
    END AS is_exportable,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN COALESCE(s.status, 'ACTIVO') = 'INACTIVO' THEN 'SKU inactivo' END,
        CASE WHEN COALESCE(v.status, 'ACTIVO') = 'INACTIVO' THEN 'Version inactiva' END,
        CASE WHEN COALESCE(r.status, 'ACTIVO') = 'INACTIVO' THEN 'Referencia inactiva' END,
        CASE WHEN COALESCE(gvr.status, 'ACTIVO') = 'INACTIVO' THEN 'Global version rule inactiva' END
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
    public.normalize_product_reference_weight_kg(r.weight_kg) AS weight_kg,
    r.weight_kg AS weight_kg_payload,
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
    COALESCE(
        public.normalize_product_reference_weight_kg(public.compute_effective_product_attrs(
            f.rh_default,
            f.assembled_default,
            r.ref_attrs,
            v.version_code,
            v.version_attrs,
            s.sku_attrs
        )->'weight_kg'),
        public.normalize_product_reference_weight_kg(r.weight_kg)
    ) AS resolved_weight_kg,
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

COMMENT ON VIEW public.v_ui_generate_list IS 'READ-ONLY UI MODEL: Overrides + effective status + reference package weights.';

CREATE OR REPLACE FUNCTION public.create_product_v6_transaction(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_reference_id uuid;
    v_version_id uuid;
    v_sku_id uuid;
    result jsonb;
BEGIN
    IF jsonb_typeof(payload->'family') = 'object' THEN
        INSERT INTO public.families (
            family_code, family_name, product_type, zone_home,
            use_destination, manufacturing_process,
            assembled_default, rh_default, allowed_lines, ref_attrs_schema
        ) VALUES (
            payload->'family'->>'family_code',
            payload->'family'->>'family_name',
            payload->'family'->>'product_type',
            payload->'family'->>'zone_home',
            payload->'family'->>'use_destination',
            payload->'family'->>'manufacturing_process',
            COALESCE((payload->'family'->>'assembled_default')::boolean, false),
            COALESCE((payload->'family'->>'rh_default')::boolean, false),
            (SELECT ARRAY(SELECT jsonb_array_elements_text(payload->'family'->'allowed_lines'))),
            public.get_base_ref_attrs_schema(payload->'family'->>'product_type')
        )
        ON CONFLICT (family_code) DO UPDATE SET
            family_name = EXCLUDED.family_name,
            product_type = EXCLUDED.product_type,
            zone_home = EXCLUDED.zone_home,
            use_destination = EXCLUDED.use_destination,
            manufacturing_process = EXCLUDED.manufacturing_process,
            assembled_default = EXCLUDED.assembled_default,
            rh_default = EXCLUDED.rh_default,
            allowed_lines = EXCLUDED.allowed_lines,
            ref_attrs_schema = CASE
                WHEN families.ref_attrs_schema IS NULL OR families.ref_attrs_schema = '{}'::jsonb
                THEN EXCLUDED.ref_attrs_schema
                ELSE families.ref_attrs_schema
            END,
            updated_at = NOW();
    END IF;

    INSERT INTO public.product_references (
        reference_code, family_code, product_name, designation,
        line, commercial_measure, special_label,
        width_cm, depth_cm, height_cm, weight_kg, stacking_max,
        isometric_path, isometric_asset_id, ref_attrs
    ) VALUES (
        payload->'reference'->>'reference_code',
        payload->'reference'->>'family_code',
        payload->'reference'->>'product_name',
        payload->'reference'->>'designation',
        payload->'reference'->>'line',
        payload->'reference'->>'commercial_measure',
        payload->'reference'->>'special_label',
        (payload->'reference'->>'width_cm')::numeric,
        (payload->'reference'->>'depth_cm')::numeric,
        (payload->'reference'->>'height_cm')::numeric,
        CASE
            WHEN payload->'reference' ? 'weight_kg' THEN payload->'reference'->'weight_kg'
            ELSE 'null'::jsonb
        END,
        (payload->'reference'->>'stacking_max')::integer,
        payload->'reference'->>'isometric_path',
        payload->'reference'->>'isometric_asset_id',
        COALESCE(payload->'reference'->'ref_attrs', '{}'::jsonb) || jsonb_build_object(
            'q_package',
            COALESCE(NULLIF(payload->'reference'->'ref_attrs'->>'q_package', ''), '1 CAJA')
        )
    )
    ON CONFLICT (family_code, reference_code) DO UPDATE SET
        product_name = EXCLUDED.product_name,
        designation = EXCLUDED.designation,
        line = EXCLUDED.line,
        commercial_measure = EXCLUDED.commercial_measure,
        special_label = EXCLUDED.special_label,
        width_cm = EXCLUDED.width_cm,
        depth_cm = EXCLUDED.depth_cm,
        height_cm = EXCLUDED.height_cm,
        weight_kg = EXCLUDED.weight_kg,
        stacking_max = EXCLUDED.stacking_max,
        isometric_path = EXCLUDED.isometric_path,
        isometric_asset_id = EXCLUDED.isometric_asset_id,
        ref_attrs = EXCLUDED.ref_attrs,
        updated_at = NOW()
    RETURNING id INTO v_reference_id;

    INSERT INTO public.product_versions (
        version_code, reference_id, sku_base, validation_status,
        version_label, version_attrs, final_base_name_es, final_base_name_en
    ) VALUES (
        payload->'version'->>'version_code',
        v_reference_id,
        payload->'version'->>'sku_base',
        COALESCE(payload->'version'->>'validation_status', 'incomplete'),
        payload->'version'->>'version_label',
        COALESCE(payload->'version'->'version_attrs', '{}'::jsonb) - 'label_boxes' - 'weight_kg' - 'q_package',
        payload->'version'->>'final_base_name_es',
        payload->'version'->>'final_base_name_en'
    )
    ON CONFLICT (reference_id, version_code) DO UPDATE SET
        sku_base = EXCLUDED.sku_base,
        validation_status = EXCLUDED.validation_status,
        version_label = EXCLUDED.version_label,
        version_attrs = EXCLUDED.version_attrs,
        final_base_name_es = EXCLUDED.final_base_name_es,
        final_base_name_en = EXCLUDED.final_base_name_en,
        updated_at = NOW()
    RETURNING id INTO v_version_id;

    INSERT INTO public.product_skus (
        sku_complete, version_id, color_code, status,
        sap_description_original, sap_description_recommended_es, sap_description_recommended_en,
        final_complete_name_es, final_complete_name_en,
        barcode_text, barcode_path, sku_attrs
    ) VALUES (
        payload->'sku'->>'sku_complete',
        v_version_id,
        payload->'sku'->>'color_code',
        COALESCE(payload->'sku'->>'status', 'ACTIVO'),
        payload->'sku'->>'sap_description_original',
        payload->'sku'->>'sap_description_recommended_es',
        payload->'sku'->>'sap_description_recommended_en',
        payload->'sku'->>'final_complete_name_es',
        payload->'sku'->>'final_complete_name_en',
        payload->'sku'->>'barcode_text',
        payload->'sku'->>'barcode_path',
        COALESCE(payload->'sku'->'sku_attrs', '{}'::jsonb)
    )
    ON CONFLICT (sku_complete) DO UPDATE SET
        color_code = EXCLUDED.color_code,
        status = EXCLUDED.status,
        sap_description_original = EXCLUDED.sap_description_original,
        sap_description_recommended_es = EXCLUDED.sap_description_recommended_es,
        sap_description_recommended_en = EXCLUDED.sap_description_recommended_en,
        final_complete_name_es = EXCLUDED.final_complete_name_es,
        final_complete_name_en = EXCLUDED.final_complete_name_en,
        barcode_text = EXCLUDED.barcode_text,
        barcode_path = EXCLUDED.barcode_path,
        sku_attrs = EXCLUDED.sku_attrs,
        updated_at = NOW()
    RETURNING id INTO v_sku_id;

    result := jsonb_build_object(
        'success', true,
        'reference_id', v_reference_id,
        'version_id', v_version_id,
        'sku_id', v_sku_id
    );

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Transaction failed: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_import_products_v2(
  p_payload jsonb,
  p_dry_run boolean DEFAULT true,
  p_test_rollback boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb := COALESCE(p_payload->'rows', '[]'::jsonb);
  v_families jsonb := COALESCE(p_payload->'families', '[]'::jsonb);
  v_colors jsonb := COALESCE(p_payload->'colors', '[]'::jsonb);

  r record;
  fam record;
  col record;

  v_family_code text;
  v_reference_code text;
  v_version_code text;
  v_color_code text;
  v_sku_base text;

  v_ref_id uuid;
  v_ver_id uuid;
  v_sku_id uuid;
  v_created_ref boolean;
  v_created_ver boolean;

  v_family_exists boolean;
  v_color_exists boolean;
  v_schema jsonb;

  v_attr_key text;
  v_attr_def jsonb;
  v_type text;
  v_allowed_values jsonb;
  v_val jsonb;
  v_val_text text;
  v_mapped text;
  v_warns text[];
  v_errs text[];
  v_pt text;
  v_ref_attrs_clean jsonb;
  v_row_result jsonb;
  v_results jsonb[] := '{}';

  v_created_families int := 0;
  v_created_colors int := 0;
  v_created_references int := 0;
  v_created_versions int := 0;
  v_created_skus int := 0;

  v_any_errors boolean := false;
  v_rolled_back boolean := false;
BEGIN
  IF jsonb_typeof(v_rows) <> 'array' THEN
    RAISE EXCEPTION 'payload.rows must be a JSON array';
  END IF;

  BEGIN
    FOR fam IN
      SELECT * FROM jsonb_to_recordset(v_families) AS x(
        family_code text,
        family_name text,
        product_type text,
        zone_home text,
        use_destination text,
        manufacturing_process text,
        assembled_default boolean,
        rh_default boolean,
        allowed_lines text[]
      )
    LOOP
      IF fam.family_code IS NULL OR btrim(fam.family_code) = '' THEN
        RAISE EXCEPTION 'families.family_code is required';
      END IF;
      IF fam.product_type IS NULL OR btrim(fam.product_type) = '' THEN
        RAISE EXCEPTION 'families.product_type is required for family_code=%', fam.family_code;
      END IF;

      IF NOT p_dry_run THEN
        INSERT INTO public.families (
          family_code, family_name, product_type, zone_home, use_destination,
          manufacturing_process, assembled_default, rh_default, allowed_lines, ref_attrs_schema
        ) VALUES (
          fam.family_code,
          NULLIF(fam.family_name, ''),
          fam.product_type,
          NULLIF(fam.zone_home, ''),
          NULLIF(fam.use_destination, ''),
          COALESCE(NULLIF(fam.manufacturing_process, ''), 'FABRICADO'),
          COALESCE(fam.assembled_default, false),
          COALESCE(fam.rh_default, false),
          COALESCE(fam.allowed_lines, '{}'::text[]),
          public.get_base_ref_attrs_schema(fam.product_type)
        )
        ON CONFLICT (family_code) DO UPDATE SET
          family_name = EXCLUDED.family_name,
          product_type = EXCLUDED.product_type,
          zone_home = EXCLUDED.zone_home,
          use_destination = EXCLUDED.use_destination,
          manufacturing_process = EXCLUDED.manufacturing_process,
          assembled_default = EXCLUDED.assembled_default,
          rh_default = EXCLUDED.rh_default,
          allowed_lines = EXCLUDED.allowed_lines,
          ref_attrs_schema = CASE
            WHEN families.ref_attrs_schema IS NULL OR families.ref_attrs_schema = '{}'::jsonb
            THEN EXCLUDED.ref_attrs_schema
            ELSE families.ref_attrs_schema
          END,
          updated_at = NOW();

        v_created_families := v_created_families + 1;
      END IF;
    END LOOP;

    FOR col IN
      SELECT * FROM jsonb_to_recordset(v_colors) AS x(
        code_4dig text,
        name_color_sap text,
        code_short int
      )
    LOOP
      IF col.code_4dig IS NULL OR btrim(col.code_4dig) = '' THEN
        RAISE EXCEPTION 'colors.code_4dig is required';
      END IF;
      IF col.name_color_sap IS NULL OR btrim(col.name_color_sap) = '' THEN
        RAISE EXCEPTION 'colors.name_color_sap is required for code_4dig=%', col.code_4dig;
      END IF;

      IF NOT p_dry_run THEN
        INSERT INTO public.colors (code_4dig, name_color_sap, code_short)
        VALUES (
          lpad(col.code_4dig, 4, '0'),
          col.name_color_sap,
          COALESCE(col.code_short, NULLIF(col.code_4dig, '')::int)
        )
        ON CONFLICT (code_4dig) DO UPDATE SET
          name_color_sap = EXCLUDED.name_color_sap,
          code_short = EXCLUDED.code_short,
          updated_at = NOW();
        v_created_colors := v_created_colors + 1;
      END IF;
    END LOOP;

    FOR r IN
      SELECT * FROM jsonb_to_recordset(v_rows) AS x(
        sku_complete text,
        sap_description_original text,
        product_name text,
        designation text,
        line text,
        commercial_measure text,
        special_label text,
        width_cm numeric,
        depth_cm numeric,
        height_cm numeric,
        weight_kg numeric,
        stacking_max int,
        ref_attrs jsonb,
        version_label text,
        version_attrs jsonb,
        sku_attrs jsonb
      )
    LOOP
      v_warns := ARRAY[]::text[];
      v_errs := ARRAY[]::text[];
      v_ref_id := NULL;
      v_ver_id := NULL;
      v_sku_id := NULL;
      v_ref_attrs_clean := COALESCE(r.ref_attrs, '{}'::jsonb);
      IF NOT (v_ref_attrs_clean ? 'q_package') THEN
        v_ref_attrs_clean := v_ref_attrs_clean || jsonb_build_object('q_package', '1 CAJA');
      END IF;
      v_created_ref := false;
      v_created_ver := false;

      SELECT * INTO v_family_code, v_reference_code, v_version_code, v_color_code, v_sku_base
      FROM public.parse_sku_complete(r.sku_complete);

      IF NOT EXISTS (SELECT 1 FROM public.global_version_rules WHERE version_code = v_version_code) THEN
        v_errs := array_append(v_errs, format('version_code "%s" no existe en global_version_rules (SKU=%s)', v_version_code, r.sku_complete));
      END IF;

      SELECT EXISTS(SELECT 1 FROM public.colors WHERE code_4dig = lpad(v_color_code, 4, '0')) INTO v_color_exists;
      IF NOT v_color_exists THEN
        IF NOT (v_colors @> jsonb_build_array(jsonb_build_object('code_4dig', v_color_code))) THEN
          v_errs := array_append(v_errs, format('color_code "%s" no existe y no viene en hoja Colores_nuevos (SKU=%s)', v_color_code, r.sku_complete));
        END IF;
      END IF;

      SELECT EXISTS(SELECT 1 FROM public.families WHERE family_code = v_family_code) INTO v_family_exists;
      IF v_family_exists THEN
        SELECT ref_attrs_schema INTO v_schema FROM public.families WHERE family_code = v_family_code;
        IF v_schema IS NULL OR v_schema = '{}'::jsonb THEN
          v_errs := array_append(v_errs, format('familia "%s" no tiene ref_attrs_schema. Configurar en /products/reference-editor (SKU=%s)', v_family_code, r.sku_complete));
        END IF;
      ELSE
        IF NOT (v_families @> jsonb_build_array(jsonb_build_object('family_code', v_family_code))) THEN
          v_errs := array_append(v_errs, format('familia "%s" no existe y no viene en hoja Familias_nuevas (SKU=%s)', v_family_code, r.sku_complete));
        ELSE
          SELECT (x->>'product_type') INTO v_pt
          FROM jsonb_array_elements(v_families) x
          WHERE x->>'family_code' = v_family_code
          LIMIT 1;

          IF v_pt IS NULL OR btrim(v_pt) = '' THEN
            v_schema := '{}'::jsonb;
          ELSE
            v_schema := public.get_base_ref_attrs_schema(v_pt);
          END IF;
          IF v_schema IS NULL OR v_schema = '{}'::jsonb THEN
            v_errs := array_append(v_errs, format('familia "%s" no tiene PRODUCT_TYPE valido en hoja Familias_nuevas (SKU=%s)', v_family_code, r.sku_complete));
          END IF;
        END IF;
      END IF;

      IF v_ref_attrs_clean IS NOT NULL AND v_ref_attrs_clean <> '{}'::jsonb THEN
        FOR v_attr_key, v_val IN SELECT * FROM jsonb_each(v_ref_attrs_clean) LOOP
          IF v_schema IS NULL OR v_schema = '{}'::jsonb THEN
            CONTINUE;
          END IF;

          IF NOT (v_schema ? v_attr_key) THEN
            v_warns := array_append(v_warns, format('REF_ATTR "%s" no existe en ref_attrs_schema para familia "%s" (SKU=%s). Se ignoro este atributo.', v_attr_key, v_family_code, r.sku_complete));
            v_ref_attrs_clean := v_ref_attrs_clean - v_attr_key;
            CONTINUE;
          END IF;

          v_attr_def := v_schema -> v_attr_key;
          v_type := COALESCE(v_attr_def->>'type', 'string');

          IF v_type = 'enum' THEN
            v_allowed_values := v_attr_def->'allowed_values';
            IF v_allowed_values IS NULL OR jsonb_typeof(v_allowed_values) <> 'array' THEN
              v_errs := array_append(v_errs, format('Schema enum invalido para "%s" (familia=%s). Falta allowed_values', v_attr_key, v_family_code));
              CONTINUE;
            END IF;

            v_val_text := upper(regexp_replace(coalesce(v_val #>> '{}',''), '\s+', ' ', 'g'));
            v_mapped := NULL;

            SELECT av INTO v_mapped
            FROM (
              SELECT jsonb_array_elements_text(v_allowed_values) AS av
            ) t
            WHERE upper(regexp_replace(av, '\s+', ' ', 'g')) = v_val_text
            LIMIT 1;

            IF v_mapped IS NULL THEN
              v_warns := array_append(v_warns, format('Valor "%s" no esta en allowed_values para "%s" (familia "%s"). Se guardara como nuevo valor; considera actualizar el schema.', v_val #>> '{}', v_attr_key, v_family_code));
            ELSE
              IF v_mapped <> (v_val #>> '{}') THEN
                v_warns := array_append(v_warns, format('Valor "%s" normalizado/mapeado a "%s" para "%s" (SKU=%s)', v_val #>> '{}', v_mapped, v_attr_key, r.sku_complete));
              END IF;
              v_ref_attrs_clean := jsonb_set(v_ref_attrs_clean, ARRAY[v_attr_key], to_jsonb(v_mapped), true);
            END IF;
          END IF;
        END LOOP;
      END IF;

      IF EXISTS (SELECT 1 FROM public.product_skus WHERE sku_complete = r.sku_complete) THEN
        v_errs := array_append(v_errs, format('SKU ya existe: %s', r.sku_complete));
      END IF;

      IF array_length(v_errs, 1) IS NOT NULL THEN
        v_any_errors := true;
      END IF;

      IF NOT p_dry_run AND array_length(v_errs, 1) IS NULL THEN
        SELECT id INTO v_ref_id
        FROM public.product_references
        WHERE family_code = v_family_code AND reference_code = v_reference_code;

        IF v_ref_id IS NULL THEN
          INSERT INTO public.product_references (
            family_code, reference_code, product_name, designation, line, commercial_measure,
            special_label, width_cm, depth_cm, height_cm, weight_kg, stacking_max, ref_attrs
          ) VALUES (
            v_family_code,
            v_reference_code,
            NULLIF(r.product_name, ''),
            NULLIF(r.designation, ''),
            NULLIF(r.line, ''),
            NULLIF(r.commercial_measure, ''),
            COALESCE(NULLIF(r.special_label,''), 'NA'),
            r.width_cm, r.depth_cm, r.height_cm, to_jsonb(r.weight_kg), r.stacking_max,
            COALESCE(v_ref_attrs_clean, '{}'::jsonb)
          )
          RETURNING id INTO v_ref_id;
          v_created_references := v_created_references + 1;
          v_created_ref := true;
        END IF;

        SELECT id INTO v_ver_id
        FROM public.product_versions
        WHERE reference_id = v_ref_id AND version_code = v_version_code;

        IF v_ver_id IS NULL THEN
          INSERT INTO public.product_versions (
            reference_id, version_code, sku_base, version_label, version_attrs, validation_status
          )
          VALUES (
            v_ref_id,
            v_version_code,
            v_sku_base,
            NULLIF(r.version_label, ''),
            COALESCE(r.version_attrs,'{}'::jsonb) - 'label_boxes' - 'weight_kg' - 'q_package',
            'incomplete'
          )
          RETURNING id INTO v_ver_id;
          v_created_versions := v_created_versions + 1;
          v_created_ver := true;
        END IF;

        INSERT INTO public.product_skus (
          version_id, sku_complete, sap_description_original, color_code, status, sku_attrs
        )
        VALUES (
          v_ver_id,
          r.sku_complete,
          r.sap_description_original,
          lpad(v_color_code,4,'0'),
          'ACTIVO',
          COALESCE(r.sku_attrs, '{}'::jsonb)
        )
        RETURNING id INTO v_sku_id;
        v_created_skus := v_created_skus + 1;
      END IF;

      v_row_result := jsonb_build_object(
        'sku_complete', r.sku_complete,
        'family_code', v_family_code,
        'reference_code', v_reference_code,
        'version_code', v_version_code,
        'color_code', v_color_code,
        'sku_base', v_sku_base,
        'errors', COALESCE(to_jsonb(v_errs), '[]'::jsonb),
        'warnings', COALESCE(to_jsonb(v_warns), '[]'::jsonb),
        'created_ids', jsonb_build_object(
          'reference_id', v_ref_id,
          'version_id', v_ver_id,
          'sku_id', v_sku_id
        ),
        'created_flags', jsonb_build_object(
          'reference', v_created_ref,
          'version', v_created_ver
        )
      );
      v_results := array_append(v_results, v_row_result);
    END LOOP;

    IF p_test_rollback AND NOT p_dry_run THEN
      RAISE EXCEPTION 'TEST_ROLLBACK';
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      IF p_test_rollback AND NOT p_dry_run THEN
        v_rolled_back := true;
      ELSE
        RAISE;
      END IF;
  END;

  RETURN jsonb_build_object(
    'success', NOT v_any_errors,
    'dry_run', p_dry_run,
    'rolled_back', v_rolled_back,
    'created', jsonb_build_object(
      'families', v_created_families,
      'colors', v_created_colors,
      'references', v_created_references,
      'versions', v_created_versions,
      'skus', v_created_skus
    ),
    'rows', COALESCE(to_jsonb(v_results), '[]'::jsonb)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
