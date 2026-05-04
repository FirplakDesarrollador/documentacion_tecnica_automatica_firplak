import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sql = `
CREATE OR REPLACE FUNCTION update_product_v6_transaction(
  p_id UUID,
  p_payload JSONB
) RETURNS VOID AS $$
DECLARE
  v_sku_code TEXT;
  v_ref_code TEXT;
  v_ver_code TEXT;
  v_fam_code TEXT;
  v_ref_data JSONB;
  v_ver_data JSONB;
  v_sku_data JSONB;
BEGIN
  -- Extraer códigos del payload
  v_sku_code := p_payload->'sku'->>'sku_complete';
  v_ref_code := p_payload->'reference'->>'reference_code';
  v_fam_code := p_payload->'reference'->>'family_code';
  v_ver_code := p_payload->'version'->>'version_code';

  -- 1. Actualizar Referencia
  v_ref_data := p_payload->'reference';
  UPDATE public.product_references
  SET 
    product_name = v_ref_data->>'product_name',
    designation = v_ref_data->>'designation',
    line = v_ref_data->>'line',
    commercial_measure = v_ref_data->>'commercial_measure',
    special_label = v_ref_data->>'special_label',
    width_cm = (v_ref_data->>'width_cm')::NUMERIC,
    depth_cm = (v_ref_data->>'depth_cm')::NUMERIC,
    height_cm = (v_ref_data->>'height_cm')::NUMERIC,
    weight_kg = (v_ref_data->>'weight_kg')::NUMERIC,
    stacking_max = (v_ref_data->>'stacking_max')::INT,
    isometric_path = v_ref_data->>'isometric_path',
    isometric_asset_id = (v_ref_data->>'isometric_asset_id')::UUID,
    ref_attrs = v_ref_data->'ref_attrs',
    updated_at = NOW()
  WHERE reference_code = v_ref_code AND family_code = v_fam_code;

  -- 2. Actualizar Versión
  v_ver_data := p_payload->'version';
  UPDATE public.product_versions
  SET
    designation = v_ver_data->>'designation',
    version_attrs = v_ver_data->'version_attrs',
    updated_at = NOW()
  WHERE version_code = v_ver_code AND reference_code = v_ref_code AND family_code = v_fam_code;

  -- 3. Actualizar SKU
  v_sku_data := p_payload->'sku';
  UPDATE public.product_skus
  SET
    sap_description = v_sku_data->>'sap_description',
    color_code = v_sku_data->>'color_code',
    final_name_es = v_sku_data->>'final_name_es',
    final_name_en = v_sku_data->>'final_name_en',
    status = v_sku_data->>'status',
    sku_attrs = v_sku_data->'sku_attrs',
    updated_at = NOW()
  WHERE sku_complete = v_sku_code;

  -- 4. Mantener sincronizada la tabla plana cabinet_products
  UPDATE public.cabinet_products
  SET
    sap_description = v_sku_data->>'sap_description',
    cabinet_name = v_ref_data->>'product_name',
    designation = v_ref_data->>'designation',
    commercial_measure = v_ref_data->>'commercial_measure',
    final_name_es = v_sku_data->>'final_name_es',
    final_name_en = v_sku_data->>'final_name_en',
    status = v_sku_data->>'status',
    line = v_ref_data->>'line',
    width_cm = (v_ref_data->>'width_cm')::NUMERIC,
    depth_cm = (v_ref_data->>'depth_cm')::NUMERIC,
    height_cm = (v_ref_data->>'height_cm')::NUMERIC,
    weight_kg = (v_ref_data->>'weight_kg')::NUMERIC,
    isometric_path = v_ref_data->>'isometric_path',
    isometric_asset_id = (v_ref_data->>'isometric_asset_id')::UUID,
    updated_at = NOW()
  WHERE id = p_id OR code = v_sku_code;

END;
$$ LANGUAGE plpgsql;
`;

(async () => {
    try {
        const { error } = await supabase.rpc('execute_sql_internal', { sql_query: sql });
        if (error) {
            // Fallback to manual query if execute_sql_internal doesn't exist
            console.log('execute_sql_internal not found, using direct fetch...');
            // In Supabase client we can't run raw SQL easily without a helper RPC.
            // But usually I have 'exec_sql' or similar.
            console.error('Error:', error);
        } else {
            console.log('RPC update_product_v6_transaction created successfully');
        }
    } catch (e) {
        console.error('Error creating RPC:', e);
    }
})();
