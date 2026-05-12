-- 1. Añadir columna JSONB a families
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS ref_attrs_schema JSONB DEFAULT '{}'::jsonb;

-- 2. Función Preview para Agregar Atributo
CREATE OR REPLACE FUNCTION public.rpc_preview_add_attr_to_families(p_family_codes text[], p_attr_key text)
RETURNS TABLE (family_code text, total_refs bigint, refs_with_key bigint, refs_without_key bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    pr.family_code,
    COUNT(pr.id) as total_refs,
    SUM(CASE WHEN pr.ref_attrs ? p_attr_key THEN 1 ELSE 0 END) as refs_with_key,
    SUM(CASE WHEN pr.ref_attrs ? p_attr_key THEN 0 ELSE 1 END) as refs_without_key
  FROM product_references pr
  WHERE pr.family_code = ANY(p_family_codes)
  GROUP BY pr.family_code;
$$;

-- 3. Función Ejecución Agregar Atributo
CREATE OR REPLACE FUNCTION public.rpc_add_attr_to_families(p_family_codes text[], p_attr_key text, p_attr_def jsonb, p_default_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Update families.ref_attrs_schema
  UPDATE families 
  SET ref_attrs_schema = COALESCE(ref_attrs_schema, '{}'::jsonb) || jsonb_build_object(p_attr_key, p_attr_def)
  WHERE family_code = ANY(p_family_codes);

  -- 2. Propagate default to product_references where key does NOT exist
  UPDATE product_references
  SET ref_attrs = COALESCE(jsonb_build_object(p_attr_key, p_default_value), '{}'::jsonb) || COALESCE(ref_attrs, '{}'::jsonb)
  WHERE family_code = ANY(p_family_codes);
END;
$$;

-- 4. Función Preview Quitar Atributo
CREATE OR REPLACE FUNCTION public.rpc_preview_remove_attr_from_families(p_family_codes text[], p_attr_key text)
RETURNS TABLE (family_code text, total_refs bigint, refs_with_key bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    pr.family_code,
    COUNT(pr.id) as total_refs,
    SUM(CASE WHEN pr.ref_attrs ? p_attr_key THEN 1 ELSE 0 END) as refs_with_key
  FROM product_references pr
  WHERE pr.family_code = ANY(p_family_codes)
  GROUP BY pr.family_code;
$$;

-- 5. Función Ejecución Quitar Atributo
CREATE OR REPLACE FUNCTION public.rpc_remove_attr_from_families(p_family_codes text[], p_attr_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Remove from schema
  UPDATE families 
  SET ref_attrs_schema = ref_attrs_schema - p_attr_key
  WHERE family_code = ANY(p_family_codes);

  -- 2. Remove from references
  UPDATE product_references
  SET ref_attrs = ref_attrs - p_attr_key
  WHERE family_code = ANY(p_family_codes);
END;
$$;

-- 6. Función Preview Mass Update
CREATE OR REPLACE FUNCTION public.rpc_preview_mass_update(p_reference_ids uuid[], p_normal_updates jsonb, p_ref_attrs_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref RECORD;
  v_attr_key text;
  v_attr_val jsonb;
  v_schema jsonb;
  v_allowed_values jsonb;
  v_errors text[] := ARRAY[]::text[];
  v_family_codes text[];
  v_affected_count int;
  v_allowed_cols text[] := ARRAY['product_name', 'designation', 'line', 'commercial_measure', 'special_label', 'width_cm', 'depth_cm', 'height_cm', 'weight_kg', 'stacking_max'];
  v_col text;
BEGIN
  v_affected_count := array_length(p_reference_ids, 1);

  -- Get unique families involved
  SELECT array_agg(DISTINCT family_code) INTO v_family_codes
  FROM product_references WHERE id = ANY(p_reference_ids);

  -- Normal columns validation
  IF p_normal_updates IS NOT NULL AND p_normal_updates != '{}'::jsonb THEN
    FOR v_col IN SELECT jsonb_object_keys(p_normal_updates) LOOP
      IF NOT (v_col = ANY(v_allowed_cols)) THEN
        v_errors := array_append(v_errors, format('Columna "%s" no permitida para edición', v_col));
      END IF;
    END LOOP;
  END IF;

  -- Validation of ref_attrs
  IF p_ref_attrs_updates IS NOT NULL AND p_ref_attrs_updates != '{}'::jsonb THEN
    FOR v_ref IN SELECT DISTINCT family_code FROM product_references WHERE id = ANY(p_reference_ids) LOOP
      SELECT ref_attrs_schema INTO v_schema FROM families WHERE family_code = v_ref.family_code;
      
      FOR v_attr_key, v_attr_val IN SELECT * FROM jsonb_each(p_ref_attrs_updates) LOOP
        IF v_schema IS NULL OR NOT (v_schema ? v_attr_key) THEN
          v_errors := array_append(v_errors, format('Atributo "%s" no existe en la familia "%s"', v_attr_key, v_ref.family_code));
        ELSE
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
$$;

-- 7. Función Ejecución Mass Update
CREATE OR REPLACE FUNCTION public.rpc_mass_update_references(p_reference_ids uuid[], p_normal_updates jsonb, p_ref_attrs_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation jsonb;
BEGIN
  -- Re-use preview for validation
  v_validation := public.rpc_preview_mass_update(p_reference_ids, p_normal_updates, p_ref_attrs_updates);
  
  IF NOT (v_validation ->> 'is_valid')::boolean THEN
    RAISE EXCEPTION 'Errores de validación: %', v_validation -> 'errors';
  END IF;

  -- 1. Normal updates
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
      SELECT pr_inner.id as p_id, jsonb_populate_record(pr_inner, p_normal_updates) as pr_new
      FROM product_references pr_inner 
      WHERE pr_inner.id = ANY(p_reference_ids)
    ) sub
    WHERE pr.id = sub.p_id;
  END IF;

  -- 2. ref_attrs updates
  IF p_ref_attrs_updates IS NOT NULL AND p_ref_attrs_updates != '{}'::jsonb THEN
    UPDATE product_references
    SET ref_attrs = COALESCE(ref_attrs, '{}'::jsonb) || p_ref_attrs_updates
    WHERE id = ANY(p_reference_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_count', array_length(p_reference_ids, 1));
END;
$$;
