const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

async function diagnose() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { console.error("Missing env"); return; }
    const sb = createClient(url, key);

    // 1. View definition
    console.log("=== VIEW DEFINITION ===");
    const { data: vdef } = await sb.rpc('exec_sql', { 
        query: "SELECT pg_get_viewdef('public.v_ui_generate_list', true)"
    });
    console.log(vdef);

    // 2. Affected SKUs - current state
    console.log("\n=== AFFECTED SKUs (product_skus) ===");
    const targetSkus = ['VBAN05-0114-000-0437', 'VBAN05-0114-000-0442', 'VBAN05-0114-151-0442', 'VBAN05-0114-MRH-0100'];
    const { data: skuRows } = await sb
        .from('product_skus')
        .select('id, sku_complete, color_code, final_complete_name_es, final_complete_name_en, status, version_id')
        .in('sku_complete', targetSkus);
    console.table(skuRows);

    // 3. Versions for this reference
    console.log("\n=== VERSIONS (product_versions) ===");
    const { data: refRow } = await sb
        .from('product_references')
        .select('id')
        .eq('reference_code', '0114')
        .eq('family_code', 'BAN05')
        .single();
    
    if (refRow) {
        const { data: verRows } = await sb
            .from('product_versions')
            .select('id, version_code, sku_base, final_base_name_es, final_base_name_en, validation_status, version_attrs')
            .eq('reference_id', refRow.id);
        console.table(verRows?.map(v => ({
            id: v.id,
            version: v.version_code,
            sku_base: v.sku_base,
            name_es: v.final_base_name_es || '(EMPTY)',
            name_en: v.final_base_name_en || '(EMPTY)',
            status: v.validation_status,
            has_overrides: Object.keys(v.version_attrs || {}).length > 0
        })));

        // 4. Reference data
        console.log("\n=== REFERENCE (product_references) ===");
        const { data: fullRef } = await sb
            .from('product_references')
            .select('*')
            .eq('id', refRow.id)
            .single();
        console.log("product_name:", fullRef.product_name);
        console.log("designation:", fullRef.designation);
        console.log("line:", fullRef.line);
        console.log("commercial_measure:", fullRef.commercial_measure);
        console.log("special_label:", fullRef.special_label);
        console.log("ref_attrs:", JSON.stringify(fullRef.ref_attrs, null, 2));
    }

    // 5. Family data
    console.log("\n=== FAMILY (families) ===");
    const { data: famRow } = await sb
        .from('families')
        .select('*')
        .eq('family_code', 'BAN05')
        .single();
    if (famRow) {
        console.log("product_type:", famRow.product_type);
        console.log("use_destination:", famRow.use_destination);
        console.log("zone_home:", famRow.zone_home);
        console.log("assembled_default:", famRow.assembled_default);
    }

    // 6. Check all SKUs for this reference (not just 4 target ones)
    console.log("\n=== ALL SKUs for BAN05-0114 ===");
    const { data: allSkus } = await sb
        .from('product_skus')
        .select('sku_complete, final_complete_name_es, final_complete_name_en, color_code')
        .like('sku_complete', 'VBAN05-0114-%')
        .order('sku_complete');
    console.table(allSkus);
}

diagnose().catch(console.error);
