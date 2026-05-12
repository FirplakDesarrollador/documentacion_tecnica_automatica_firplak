// Simplified validator logic for debugging
function validate(product, requiredFields) {
    const missing = [];
    requiredFields.forEach(field => {
        let value = product[field];
        if (field === 'isometric') {
            value = product.isometric_asset_id || product.isometric_path;
        }
        if (value === null || value === undefined || value === '') {
            missing.push(field);
        }
    });
    return missing;
}

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function debug() {
    const { data: skuData } = await supabase.rpc('exec_sql', { query_text: "SELECT * FROM public.v_ui_generate_list WHERE sku_complete = 'VBAN22-0015-000-0439'" });
    const product = skuData[0];
    
    const { data: templates } = await supabase.rpc('exec_sql', { query_text: "SELECT elements_json FROM public.plantillas_doc_tec WHERE active = true" });
    const requiredFields = new Set();
    templates.forEach(t => {
        const elements = JSON.parse(t.elements_json || '[]');
        elements.forEach(el => {
            if (el.required) {
                if ((el.type === 'dynamic_text' || el.type === 'barcode' || el.type === 'dynamic_image') && el.dataField) {
                    requiredFields.add(el.dataField);
                }
                if (el.type === 'image' && el.content === 'Isométrico') {
                    requiredFields.add('isometric');
                }
            }
        });
    });

    const missing = validate(product, Array.from(requiredFields));
    const hasProductType = !!product.product_type;
    console.log('Required Fields:', Array.from(requiredFields));
    console.log('Missing Fields:', missing);
    console.log('Has Product Type:', hasProductType);
    console.log('Product Data (partial):', {
        isometric_path: product.isometric_path,
        isometric_asset_id: product.isometric_asset_id,
        final_complete_name_es: product.final_complete_name_es
    });
}

debug().then(() => process.exit());
