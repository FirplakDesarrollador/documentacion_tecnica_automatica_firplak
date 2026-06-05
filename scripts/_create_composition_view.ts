import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

(async () => {
    const sql = `
CREATE OR REPLACE VIEW public.v_product_composition AS
SELECT 
    s.id, s.sku_complete, s.color_code, s.sap_description_original,
    s.final_complete_name_es, s.final_complete_name_en,
    s.barcode_text, s.barcode_path, s.status, s.sku_attrs,
    
    v.version_code, v.sku_base, v.final_base_name_es,
    v.final_base_name_en, v.validation_status,
    v.version_label, v.version_attrs,
    
    r.reference_code, r.product_name,
    r.designation, r.line, r.commercial_measure,
    r.special_label, r.width_cm, r.depth_cm, r.height_cm,
    r.weight_kg, r.stacking_max, r.isometric_path,
    r.isometric_asset_id, r.ref_attrs,
    
    f.family_code, f.family_name, f.product_type, f.zone_home,
    f.use_destination, f.manufacturing_process,
    f.assembled_default, f.rh_default, f.allowed_lines,
    
    gvr.automatic_version_rules,
    
    c.name_color_sap
FROM public.product_skus s
JOIN public.product_versions v ON s.version_id = v.id
JOIN public.product_references r ON v.reference_id = r.id
JOIN public.families f ON r.family_code = f.family_code
LEFT JOIN public.global_version_rules gvr ON v.version_code = gvr.version_code
LEFT JOIN public.colors c ON s.color_code = c.code_4dig;
    `;
    
    const { error } = await (sb.rpc as any)('exec_sql', { query_text: sql });
    console.log(error ? 'Error creating view: ' + error.message : 'View created successfully');
    
    await (sb.rpc as any)('exec_sql', { query_text: 'NOTIFY pgrst, reload schema;' });
    console.log('Schema reloaded');
})();
