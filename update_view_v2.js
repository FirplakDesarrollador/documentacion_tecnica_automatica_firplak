const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = `
DROP VIEW IF EXISTS public.v_ui_generate_list;
CREATE VIEW public.v_ui_generate_list AS
 SELECT s.id,
    s.sku_complete,
    s.color_code,
    s.sap_description_original,
    s.final_complete_name_es,
    s.final_complete_name_en,
    s.barcode_text,
    s.barcode_path,
    s.status,
    COALESCE(r.status, 'ACTIVO') AS ref_status,
    s.sku_attrs,
    v.version_code,
    v.sku_base,
    v.final_base_name_es,
    v.final_base_name_en,
    v.validation_status,
    v.version_label,
    v.version_attrs,
    r.reference_code,
    r.product_name,
    r.designation,
    r.line,
    r.commercial_measure,
    r.special_label,
    r.width_cm,
    r.depth_cm,
    r.height_cm,
    r.weight_kg,
    r.stacking_max,
    COALESCE(v.version_attrs->>'isometric_path', r.isometric_path::text, cp.isometric_path::text) AS isometric_path,
    COALESCE(v.version_attrs->>'isometric_asset_id', r.isometric_asset_id::text, cp.isometric_asset_id::text)::uuid AS isometric_asset_id,
    r.ref_attrs,
    f.family_code,
    f.family_name,
    f.product_type,
    f.zone_home,
    f.use_destination,
    f.manufacturing_process,
    f.assembled_default,
    f.rh_default,
    f.allowed_lines,
    gvr.automatic_version_rules,
    c.name_color_sap,
    compute_effective_version_attrs(v.version_code, v.version_attrs) AS effective_version_attrs,
    compute_private_label_client_name(v.version_code, v.version_attrs) AS private_label_client_name
   FROM ((((((product_skus s
     JOIN product_versions v ON ((s.version_id = v.id)))
     JOIN product_references r ON ((v.reference_id = r.id)))
     JOIN families f ON ((r.family_code = f.family_code)))
     LEFT JOIN global_version_rules gvr ON ((v.version_code = gvr.version_code)))
     LEFT JOIN colors c ON ((s.color_code = c.code_4dig)))
     LEFT JOIN cabinet_products cp ON ((s.sku_complete = cp.code)));
`;

async function updateView() {
    const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });
    if (error) {
        console.error('Error updating view:', error);
    } else {
        console.log('View updated successfully');
    }
}

updateView();
