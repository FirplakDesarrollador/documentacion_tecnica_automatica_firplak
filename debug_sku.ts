// @ts-nocheck
import { createClient } from '@supabase/supabase-js';
require('dotenv').config();
import { validateProductReadiness } from './src/lib/engine/validator.ts';
import { mapRowToComposedProduct } from './src/lib/engine/product_composer.ts';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function checkSku(sku: string) {
    const { data: rows } = await supabase.rpc('exec_sql', { query_text: `SELECT * FROM public.v_ui_generate_list WHERE sku_complete = '${sku}'` });
    if (!rows || rows.length === 0) {
        console.log(`SKU ${sku} not found`);
        return;
    }
    const { data: rules } = await supabase.rpc('exec_sql', { query_text: 'SELECT * FROM public.rules WHERE enabled = true' });
    const { data: templates } = await supabase.rpc('exec_sql', { query_text: 'SELECT elements_json FROM public.plantillas_doc_tec WHERE active = true' });
    
    const allRequiredElements = [];
    templates.forEach(t => {
        try {
            allRequiredElements.push(...JSON.parse(t.elements_json || '[]'));
        } catch {}
    });

    const p = mapRowToComposedProduct(rows[0]);
    const issues = validateProductReadiness(p, rules, allRequiredElements);
    
    console.log(`Issues for ${sku}:`);
    console.log(JSON.stringify(issues, null, 2));
}

checkSku('VBAN22-0015-000-0439').then(() => process.exit());
