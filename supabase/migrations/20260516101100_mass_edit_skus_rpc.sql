-- Función Preview Mass Update SKUs
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

  -- Normal columns validation
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

-- Función Ejecución Mass Update SKUs
CREATE OR REPLACE FUNCTION public.rpc_mass_update_skus(p_sku_ids uuid[], p_normal_updates jsonb, p_sku_attrs_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation jsonb;
BEGIN
  -- Re-use preview for validation
  v_validation := public.rpc_preview_mass_update_skus(p_sku_ids, p_normal_updates, p_sku_attrs_updates);
  
  IF NOT (v_validation ->> 'is_valid')::boolean THEN
    RAISE EXCEPTION 'Errores de validación: %', v_validation -> 'errors';
  END IF;

  -- 1. Normal updates
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

  -- 2. sku_attrs updates
  IF p_sku_attrs_updates IS NOT NULL AND p_sku_attrs_updates != '{}'::jsonb THEN
    UPDATE product_skus
    SET sku_attrs = COALESCE(sku_attrs, '{}'::jsonb) || p_sku_attrs_updates
    WHERE id = ANY(p_sku_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_count', array_length(p_sku_ids, 1));
END;
$$;
