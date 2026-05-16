-- Mass Import V6: unknown REF_ATTR keys become warnings (dropped), not blocking errors.
-- Governance still enforced for:
-- - family without ref_attrs_schema (blocks)
-- - enum values outside allowed_values (blocks)
-- - SKU already exists (blocks)

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
    -- 1) Create/Upsert families (only if provided)
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

    -- 2) Create/Upsert colors (only if provided)
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

    -- 3) Process rows
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
      v_created_ref := false;
      v_created_ver := false;

      -- Parse SKU
      SELECT * INTO v_family_code, v_reference_code, v_version_code, v_color_code, v_sku_base
      FROM public.parse_sku_complete(r.sku_complete);

      -- Validate version_code exists in global rules
      IF NOT EXISTS (SELECT 1 FROM public.global_version_rules WHERE version_code = v_version_code) THEN
        v_errs := array_append(v_errs, format('version_code "%s" no existe en global_version_rules (SKU=%s)', v_version_code, r.sku_complete));
      END IF;

      -- Validate color exists (or will be created via payload.colors)
      SELECT EXISTS(SELECT 1 FROM public.colors WHERE code_4dig = lpad(v_color_code, 4, '0')) INTO v_color_exists;
      IF NOT v_color_exists THEN
        IF NOT (v_colors @> jsonb_build_array(jsonb_build_object('code_4dig', v_color_code))) THEN
          v_errs := array_append(v_errs, format('color_code "%s" no existe y no viene en hoja Colores_nuevos (SKU=%s)', v_color_code, r.sku_complete));
        END IF;
      END IF;

      -- Validate family exists and has schema (or will be created via payload.families)
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
            v_errs := array_append(v_errs, format('familia "%s" no tiene PRODUCT_TYPE válido en hoja Familias_nuevas (SKU=%s)', v_family_code, r.sku_complete));
          END IF;
        END IF;
      END IF;

      -- Validate REF_ATTR keys and enum strictness
      IF v_ref_attrs_clean IS NOT NULL AND v_ref_attrs_clean <> '{}'::jsonb THEN
        FOR v_attr_key, v_val IN SELECT * FROM jsonb_each(v_ref_attrs_clean) LOOP
          IF v_schema IS NULL OR v_schema = '{}'::jsonb THEN
            CONTINUE;
          END IF;

          IF NOT (v_schema ? v_attr_key) THEN
            -- Unknown keys are dropped (warning), not blocking.
            v_warns := array_append(v_warns, format('REF_ATTR "%s" no existe en ref_attrs_schema para familia "%s" (SKU=%s). Se ignoró este atributo.', v_attr_key, v_family_code, r.sku_complete));
            v_ref_attrs_clean := v_ref_attrs_clean - v_attr_key;
            CONTINUE;
          END IF;

          v_attr_def := v_schema -> v_attr_key;
          v_type := COALESCE(v_attr_def->>'type', 'string');

          IF v_type = 'enum' THEN
            v_allowed_values := v_attr_def->'allowed_values';
            IF v_allowed_values IS NULL OR jsonb_typeof(v_allowed_values) <> 'array' THEN
              v_errs := array_append(v_errs, format('Schema enum inválido para "%s" (familia=%s). Falta allowed_values', v_attr_key, v_family_code));
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
              v_errs := array_append(v_errs, format('Valor "%s" no permitido para "%s" en familia "%s" (SKU=%s)', v_val #>> '{}', v_attr_key, v_family_code, r.sku_complete));
            ELSE
              IF v_mapped <> (v_val #>> '{}') THEN
                v_warns := array_append(v_warns, format('Valor "%s" normalizado/mapeado a "%s" para "%s" (SKU=%s)', v_val #>> '{}', v_mapped, v_attr_key, r.sku_complete));
              END IF;
              v_ref_attrs_clean := jsonb_set(v_ref_attrs_clean, ARRAY[v_attr_key], to_jsonb(v_mapped), true);
            END IF;
          END IF;
        END LOOP;
      END IF;

      -- Validate SKU does not already exist
      IF EXISTS (SELECT 1 FROM public.product_skus WHERE sku_complete = r.sku_complete) THEN
        v_errs := array_append(v_errs, format('SKU ya existe: %s', r.sku_complete));
      END IF;

      IF array_length(v_errs, 1) IS NOT NULL THEN
        v_any_errors := true;
      END IF;

      IF NOT p_dry_run AND array_length(v_errs, 1) IS NULL THEN
        -- product_references
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
            r.width_cm, r.depth_cm, r.height_cm, r.weight_kg, r.stacking_max,
            COALESCE(v_ref_attrs_clean, '{}'::jsonb)
          )
          RETURNING id INTO v_ref_id;
          v_created_references := v_created_references + 1;
          v_created_ref := true;
        END IF;

        -- product_versions
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
            COALESCE(r.version_attrs,'{}'::jsonb),
            'incomplete'
          )
          RETURNING id INTO v_ver_id;
          v_created_versions := v_created_versions + 1;
          v_created_ver := true;
        END IF;

        -- product_skus
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

