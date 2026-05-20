-- 20260516110000_mass_edit_versions_rpc.sql
-- RPCs for previewing and executing mass updates on product_versions table

-- 1. PREVIEW FUNCTION
CREATE OR REPLACE FUNCTION rpc_preview_mass_update_versions(
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
    -- Validate IDs
    IF p_ids IS NULL OR array_length(p_ids, 1) = 0 THEN
        v_errors := array_append(v_errors, 'No se proporcionaron IDs de versiones.');
    END IF;

    -- Validate normal columns
    FOR v_key IN SELECT jsonb_object_keys(p_normal_updates)
    LOOP
        IF NOT (v_key = ANY(v_allowed_cols)) THEN
            v_errors := array_append(v_errors, 'La columna "' || v_key || '" no está permitida para edición masiva.');
        END IF;
    END LOOP;

    -- Get count of existing versions
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

-- 2. EXECUTION FUNCTION
CREATE OR REPLACE FUNCTION rpc_mass_update_versions(
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
BEGIN
    -- Run preview validation first
    v_preview := rpc_preview_mass_update_versions(p_ids, p_normal_updates, p_version_attrs_updates);
    
    IF NOT (v_preview->>'is_valid')::boolean THEN
        RETURN v_preview;
    END IF;

    -- Start building update for normal columns
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_normal_updates)
    LOOP
        v_updates_text := v_updates_text || v_key || ' = ' || quote_nullable(v_val #>> '{}') || ', ';
    END LOOP;

    -- Add version_attrs merge if provided
    IF p_version_attrs_updates IS NOT NULL AND jsonb_typeof(p_version_attrs_updates) = 'object' AND p_version_attrs_updates <> '{}'::jsonb THEN
        v_updates_text := v_updates_text || 'version_attrs = COALESCE(version_attrs, ''{}''::jsonb) || ' || quote_literal(p_version_attrs_updates::text) || '::jsonb, ';
    END IF;

    -- Remove last comma and space
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
