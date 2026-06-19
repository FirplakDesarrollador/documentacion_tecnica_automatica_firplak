-- Allow mass editing of product_references.status (ACTIVO/INACTIVO)
-- from the reference-editor bulk edit panel.

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
  v_allowed_cols text[] := ARRAY['product_name', 'designation', 'line', 'commercial_measure', 'special_label', 'width_cm', 'depth_cm', 'height_cm', 'weight_kg', 'stacking_max', 'status'];
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
      stacking_max = (pr_new).stacking_max,
      status = (pr_new).status
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
