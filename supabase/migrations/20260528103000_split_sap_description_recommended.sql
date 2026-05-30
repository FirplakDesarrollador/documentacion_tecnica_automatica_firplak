ALTER TABLE public.product_skus
  ADD COLUMN IF NOT EXISTS sap_description_recommended_es text,
  ADD COLUMN IF NOT EXISTS sap_description_recommended_en text;

UPDATE public.product_skus
SET sap_description_recommended_es = COALESCE(sap_description_recommended_es, sap_description_recommended)
WHERE sap_description_recommended IS NOT NULL
  AND sap_description_recommended_es IS NULL;

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
            assembled_default, rh_default, allowed_lines
        ) VALUES (
            payload->'family'->>'family_code',
            payload->'family'->>'family_name',
            payload->'family'->>'product_type',
            payload->'family'->>'zone_home',
            payload->'family'->>'use_destination',
            payload->'family'->>'manufacturing_process',
            COALESCE((payload->'family'->>'assembled_default')::boolean, false),
            COALESCE((payload->'family'->>'rh_default')::boolean, false),
            (SELECT ARRAY(SELECT jsonb_array_elements_text(payload->'family'->'allowed_lines')))
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
        (payload->'reference'->>'weight_kg')::numeric,
        (payload->'reference'->>'stacking_max')::integer,
        payload->'reference'->>'isometric_path',
        payload->'reference'->>'isometric_asset_id',
        COALESCE(payload->'reference'->'ref_attrs', '{}'::jsonb)
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
        COALESCE(payload->'version'->'version_attrs', '{}'::jsonb),
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

ALTER TABLE public.product_skus
  DROP COLUMN IF EXISTS sap_description_recommended;
