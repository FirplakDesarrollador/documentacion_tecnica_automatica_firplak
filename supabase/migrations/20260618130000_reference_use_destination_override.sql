-- Allow product_references.ref_attrs.use_destination as the only reference-level
-- exception that can override families.use_destination without requiring schema.

CREATE OR REPLACE FUNCTION public.rpc_preview_mass_update(
  p_reference_ids uuid[],
  p_normal_updates jsonb,
  p_ref_attrs_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref RECORD;
  v_attr_key text;
  v_attr_val jsonb;
  v_val_text text;
  v_schema jsonb;
  v_allowed_values jsonb;
  v_errors text[] := ARRAY[]::text[];
  v_family_codes text[];
  v_affected_count int;
  v_allowed_cols text[] := ARRAY['product_name', 'designation', 'line', 'commercial_measure', 'special_label', 'width_cm', 'depth_cm', 'height_cm', 'weight_kg', 'stacking_max'];
  v_col text;
BEGIN
  v_affected_count := array_length(p_reference_ids, 1);

  SELECT array_agg(DISTINCT family_code) INTO v_family_codes
  FROM product_references
  WHERE id = ANY(p_reference_ids);

  IF p_normal_updates IS NOT NULL AND p_normal_updates != '{}'::jsonb THEN
    FOR v_col IN SELECT jsonb_object_keys(p_normal_updates) LOOP
      IF NOT (v_col = ANY(v_allowed_cols)) THEN
        v_errors := array_append(v_errors, format('Columna "%s" no permitida para edicion', v_col));
      END IF;
    END LOOP;
  END IF;

  IF p_ref_attrs_updates IS NOT NULL AND p_ref_attrs_updates != '{}'::jsonb THEN
    FOR v_ref IN SELECT DISTINCT family_code FROM product_references WHERE id = ANY(p_reference_ids) LOOP
      SELECT ref_attrs_schema INTO v_schema
      FROM families
      WHERE family_code = v_ref.family_code;

      FOR v_attr_key, v_attr_val IN SELECT * FROM jsonb_each(p_ref_attrs_updates) LOOP
        IF lower(btrim(v_attr_key)) = 'use_destination' THEN
          IF v_attr_val = 'null'::jsonb THEN
            CONTINUE;
          END IF;

          IF jsonb_typeof(v_attr_val) <> 'string' THEN
            v_errors := array_append(v_errors, format('Atributo "%s" debe ser texto escalar o null', v_attr_key));
            CONTINUE;
          END IF;

          v_val_text := upper(btrim(coalesce(v_attr_val #>> '{}', '')));
          IF v_val_text = '' OR v_val_text IN ('NA', 'N/A', 'NULL', 'UNDEFINED') THEN
            CONTINUE;
          END IF;

          CONTINUE;
        END IF;

        IF v_schema IS NULL OR NOT (v_schema ? v_attr_key) THEN
          v_errors := array_append(v_errors, format('Atributo "%s" no existe en la familia "%s"', v_attr_key, v_ref.family_code));
        ELSE
          IF v_attr_val = 'null'::jsonb THEN
            CONTINUE;
          END IF;

          v_allowed_values := v_schema -> v_attr_key -> 'allowed_values';
          IF v_allowed_values IS NOT NULL AND jsonb_typeof(v_allowed_values) = 'array' THEN
            IF NOT (v_allowed_values @> jsonb_build_array(v_attr_val #>> '{}')) THEN
              v_errors := array_append(v_errors, format('Valor "%s" no permitido para "%s" en familia "%s"', v_attr_val #>> '{}', v_attr_key, v_ref.family_code));
            END IF;
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'affected_count', v_affected_count,
    'families', v_family_codes,
    'errors', v_errors,
    'is_valid', array_length(v_errors, 1) IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_mass_update_references(
  p_reference_ids uuid[],
  p_normal_updates jsonb,
  p_ref_attrs_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_validation jsonb;
  v_attr_key text;
  v_attr_val jsonb;
  v_val_text text;
  v_ref_attrs_to_set jsonb := '{}'::jsonb;
  v_ref_attrs_to_delete text[] := ARRAY[]::text[];
BEGIN
  v_validation := public.rpc_preview_mass_update(p_reference_ids, p_normal_updates, p_ref_attrs_updates);

  IF NOT (v_validation ->> 'is_valid')::boolean THEN
    RAISE EXCEPTION 'Errores de validacion: %', v_validation -> 'errors';
  END IF;

  IF p_ref_attrs_updates IS NOT NULL AND p_ref_attrs_updates != '{}'::jsonb THEN
    FOR v_attr_key, v_attr_val IN SELECT * FROM jsonb_each(p_ref_attrs_updates) LOOP
      IF lower(btrim(v_attr_key)) = 'use_destination' THEN
        v_ref_attrs_to_delete := array_append(v_ref_attrs_to_delete, v_attr_key);
        v_ref_attrs_to_delete := array_append(v_ref_attrs_to_delete, 'use_destination');

        IF v_attr_val = 'null'::jsonb THEN
          CONTINUE;
        END IF;

        IF jsonb_typeof(v_attr_val) = 'string' THEN
          v_val_text := upper(btrim(coalesce(v_attr_val #>> '{}', '')));
          IF v_val_text = '' OR v_val_text IN ('NA', 'N/A', 'NULL', 'UNDEFINED') THEN
            CONTINUE;
          END IF;

          v_ref_attrs_to_set := v_ref_attrs_to_set || jsonb_build_object('use_destination', v_val_text);
        END IF;
      ELSIF v_attr_val = 'null'::jsonb THEN
        v_ref_attrs_to_delete := array_append(v_ref_attrs_to_delete, v_attr_key);
      ELSE
        v_ref_attrs_to_set := v_ref_attrs_to_set || jsonb_build_object(v_attr_key, v_attr_val);
      END IF;
    END LOOP;
  END IF;

  IF p_normal_updates IS NOT NULL AND p_normal_updates != '{}'::jsonb THEN
    UPDATE product_references pr
    SET
      product_name = (pr_new).product_name,
      designation = (pr_new).designation,
      line = (pr_new).line,
      commercial_measure = (pr_new).commercial_measure,
      special_label = (pr_new).special_label,
      width_cm = (pr_new).width_cm,
      depth_cm = (pr_new).depth_cm,
      height_cm = (pr_new).height_cm,
      weight_kg = (pr_new).weight_kg,
      stacking_max = (pr_new).stacking_max
    FROM (
      SELECT pr_inner.id AS p_id, jsonb_populate_record(pr_inner, p_normal_updates) AS pr_new
      FROM product_references pr_inner
      WHERE pr_inner.id = ANY(p_reference_ids)
    ) sub
    WHERE pr.id = sub.p_id;
  END IF;

  IF array_length(v_ref_attrs_to_delete, 1) IS NOT NULL OR v_ref_attrs_to_set != '{}'::jsonb THEN
    UPDATE product_references
    SET ref_attrs = (COALESCE(ref_attrs, '{}'::jsonb) - v_ref_attrs_to_delete) || v_ref_attrs_to_set
    WHERE id = ANY(p_reference_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_count', array_length(p_reference_ids, 1));
END;
$function$;

DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.bulk_import_products_v2(jsonb, boolean, boolean)'::regprocedure)
  INTO v_def;

  v_old := $old$
        FOR v_attr_key, v_val IN SELECT * FROM jsonb_each(v_ref_attrs_clean) LOOP
          IF v_schema IS NULL OR v_schema = '{}'::jsonb THEN
            CONTINUE;
          END IF;
$old$;

  v_new := $new$
        FOR v_attr_key, v_val IN SELECT * FROM jsonb_each(v_ref_attrs_clean) LOOP
          IF lower(btrim(v_attr_key)) = 'use_destination' THEN
            IF v_val = 'null'::jsonb THEN
              v_ref_attrs_clean := v_ref_attrs_clean - v_attr_key - 'use_destination';
              CONTINUE;
            END IF;

            IF jsonb_typeof(v_val) <> 'string' THEN
              v_errs := array_append(v_errs, format('REF_ATTR "%s" debe ser texto escalar o null (SKU=%s)', v_attr_key, r.sku_complete));
              CONTINUE;
            END IF;

            v_val_text := upper(btrim(coalesce(v_val #>> '{}', '')));
            IF v_val_text = '' OR v_val_text IN ('NA', 'N/A', 'NULL', 'UNDEFINED') THEN
              v_ref_attrs_clean := v_ref_attrs_clean - v_attr_key - 'use_destination';
            ELSE
              v_ref_attrs_clean := (v_ref_attrs_clean - v_attr_key - 'use_destination') || jsonb_build_object('use_destination', v_val_text);
            END IF;
            CONTINUE;
          END IF;

          IF v_schema IS NULL OR v_schema = '{}'::jsonb THEN
            CONTINUE;
          END IF;
$new$;

  IF position(v_old IN v_def) > 0 THEN
    v_def := replace(v_def, v_old, v_new);
  ELSIF position(v_new IN v_def) = 0 THEN
    RAISE EXCEPTION 'bulk_import_products_v2 ref_attrs validation block not found';
  END IF;

  v_old := $old$COALESCE(r.version_attrs,'{}'::jsonb) - 'label_boxes' - 'weight_kg' - 'q_package',$old$;
  v_new := $new$COALESCE(r.version_attrs,'{}'::jsonb) - 'label_boxes' - 'weight_kg' - 'q_package' - 'use_destination',$new$;
  IF position(v_old IN v_def) > 0 THEN
    v_def := replace(v_def, v_old, v_new);
  ELSIF position(v_new IN v_def) = 0 THEN
    RAISE EXCEPTION 'bulk_import_products_v2 version_attrs cleanup expression not found';
  END IF;

  v_old := $old$COALESCE(r.sku_attrs, '{}'::jsonb)$old$;
  v_new := $new$COALESCE(r.sku_attrs, '{}'::jsonb) - 'use_destination'$new$;
  IF position(v_old IN v_def) > 0 THEN
    v_def := replace(v_def, v_old, v_new);
  ELSIF position(v_new IN v_def) = 0 THEN
    RAISE EXCEPTION 'bulk_import_products_v2 sku_attrs cleanup expression not found';
  END IF;

  EXECUTE v_def;
END;
$migration$;

DO $migration$
DECLARE
  v_def text;
  v_old text := $old$COALESCE(ver.automatic_version_rules, '{}'::jsonb),$old$;
  v_new text := $new$COALESCE(ver.automatic_version_rules, '{}'::jsonb) - 'use_destination',$new$;
BEGIN
  SELECT pg_get_functiondef('public.bulk_import_products_v3(jsonb, boolean, boolean)'::regprocedure)
  INTO v_def;

  IF position(v_old IN v_def) > 0 THEN
    v_def := replace(v_def, v_old, v_new);
  ELSIF position(v_new IN v_def) = 0 THEN
    RAISE EXCEPTION 'bulk_import_products_v3 automatic_version_rules cleanup expression not found';
  END IF;

  EXECUTE v_def;
END;
$migration$;

WITH target_ref AS (
  SELECT id
  FROM public.product_references
  WHERE family_code = 'ROP03'
    AND reference_code = '0007'
)
UPDATE public.product_references pr
SET ref_attrs = COALESCE(pr.ref_attrs, '{}'::jsonb) || jsonb_build_object('use_destination', 'LAVATRAPEROS'),
    updated_at = now()
FROM target_ref tr
WHERE pr.id = tr.id;

UPDATE public.product_versions
SET version_attrs = COALESCE(version_attrs, '{}'::jsonb) - 'use_destination',
    updated_at = now()
WHERE sku_base = 'VROP03-0007-000'
  AND COALESCE(version_attrs, '{}'::jsonb) ? 'use_destination';

INSERT INTO public.glossary (category, term_es, term_en, context, active, notes, priority)
VALUES (
  'RESOLVED_TYPE',
  'MUEBLE A PISO LAVATRAPEROS',
  'FREESTANDING MOP SINK CABINET',
  NULL,
  true,
  'Created for reference-level use_destination override ROP03-0007.',
  20
)
ON CONFLICT (term_es) DO UPDATE
SET category = EXCLUDED.category,
    term_en = EXCLUDED.term_en,
    context = EXCLUDED.context,
    active = true,
    notes = EXCLUDED.notes,
    priority = EXCLUDED.priority;

SELECT public.mark_naming_stale_for_references(
  ARRAY(
    SELECT id
    FROM public.product_references
    WHERE family_code = 'ROP03'
      AND reference_code = '0007'
  ),
  NULL,
  'reference_use_destination_override'
);
