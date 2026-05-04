const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

async function getViewDef() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { console.error("Missing env"); return; }
    const sb = createClient(url, key);

    // Get view definition via information_schema
    const { data, error } = await sb.rpc('exec_sql', { 
        query: "SELECT definition FROM pg_views WHERE viewname = 'v_ui_generate_list' AND schemaname = 'public'"
    });
    
    if (error) {
        console.log("RPC error, trying direct approach...");
        // Try via dbQuery style 
        const { data: d2, error: e2 } = await sb.from('product_skus')
            .select('id, sku_complete, final_complete_name_es, final_complete_name_en')
            .eq('sku_complete', 'VBAN05-0114-000-0437')
            .single();
        console.log("Direct SKU query:", d2);
        
        // Check what v_ui_generate_list returns for same SKU
        const { data: d3, error: e3 } = await sb.from('v_ui_generate_list')
            .select('sku_complete, final_complete_name_es, final_complete_name_en, product_name, designation, line, commercial_measure, ref_attrs, version_attrs')
            .eq('sku_complete', 'VBAN05-0114-000-0437')
            .single();
        console.log("\nView query:", JSON.stringify(d3, null, 2));
        if (e3) console.log("View error:", e3.message);
        return;
    }
    console.log("View definition:", data);
}

getViewDef().catch(console.error);
