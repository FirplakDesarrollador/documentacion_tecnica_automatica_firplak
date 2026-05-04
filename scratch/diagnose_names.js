const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

async function diagnose() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; 

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing env vars");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("--- naming_config_en ---");
    const { data: config } = await supabase
        .from('naming_config_en')
        .select('*')
        .eq('target_entity', 'MUEBLE')
        .order('order_index', { ascending: true });
    
    console.table(config?.map(c => ({
        id: c.variable_id,
        emit: c.emit,
        order: c.order_index,
        behavior: c.behavior
    })));

    console.log("\n--- Checking specific SKUs in product_skus ---");
    const skus = ['VBAN05-0114-000-0437', 'VBAN05-0114-151-0442'];
    const { data: skuData } = await supabase
        .from('v_ui_generate_list')
        .select('sku_complete, final_complete_name_es, final_complete_name_en, product_type')
        .in('sku_complete', skus);
    
    console.log("\n--- Checking Raw Attributes ---");
    const { data: refData } = await supabase
        .from('product_references')
        .select('*, product_versions(*)')
        .eq('reference_code', '0114')
        .eq('family_code', 'BAN05');
    
    console.log("\n--- Checking Rules ---");
    const { data: rules } = await supabase
        .from('rules')
        .select('*')
        .eq('enabled', true)
        .order('priority', { ascending: true });
    
    console.table(rules.map(r => ({
        id: r.id,
        desc: r.rule_description,
        type: r.rule_type
    })));
}

diagnose();
