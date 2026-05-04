require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function dbQuery(sql) {
    const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });
    if (error) throw error;
    return data || [];
}

async function runAudits() {
    console.log("=== PHASE 2C.1 AUDIT START ===");

    // 1. AUDIT accessory_text CONTAMINATION
    console.log("\n--- 1. accessory_text Contamination Audit ---");
    // Buscamos discrepancias y patrones de contaminación (RH, MADERA, etc)
    const accAudit = await dbQuery(`
        SELECT 
            r.family_code, 
            r.reference_code, 
            cp.code as example_sku,
            cp.accessory_text as legacy_acc,
            r.ref_attrs->>'accessory_text' as v6_acc,
            CASE 
                WHEN (r.ref_attrs->>'accessory_text') ~* 'RH|MADERA|HUMEDAD|CARB2|PUR' THEN 'CONTAMINADO (Metadato)'
                WHEN (r.ref_attrs->>'accessory_text') != cp.accessory_text THEN 'DISCREPANCIA (Valor distinto)'
                ELSE 'OK'
            END as status
        FROM public.product_references r
        JOIN public.cabinet_products cp ON r.family_code = cp.familia_code AND r.reference_code = cp.ref_code
        WHERE (r.ref_attrs->>'accessory_text') ~* 'RH|MADERA|HUMEDAD|CARB2|PUR'
           OR (r.ref_attrs->>'accessory_text' != cp.accessory_text AND cp.accessory_text IS NOT NULL AND cp.accessory_text != 'NA')
        LIMIT 20;
    `);
    console.table(accAudit);

    // 2. AUDIT REFERENCE COLLISIONS
    console.log("\n--- 2. Reference Collision Audit ---");
    const collisionAudit = await dbQuery(`
        SELECT 
            familia_code, 
            ref_code, 
            COUNT(DISTINCT cabinet_name) as distinct_names,
            COUNT(DISTINCT commercial_measure) as distinct_measures,
            STRING_AGG(DISTINCT cabinet_name, ' | ') as all_names,
            COUNT(*) as total_skus
        FROM public.cabinet_products
        WHERE status = 'ACTIVO'
        GROUP BY familia_code, ref_code
        HAVING COUNT(DISTINCT cabinet_name) > 1 
           OR COUNT(DISTINCT commercial_measure) > 1
        ORDER BY total_skus DESC
        LIMIT 10;
    `);
    console.table(collisionAudit);

    // 3. AUDIT VEXH01 CASE
    console.log("\n--- 3. VEXH01 Case Diagnosis ---");
    const vexh01 = await dbQuery(`
        SELECT 
            f.family_code, f.use_destination, f.product_type,
            r.reference_code, r.product_name,
            v.final_base_name_es, v.final_base_name_en,
            s.sku_complete
        FROM public.families f
        LEFT JOIN public.product_references r ON f.family_code = r.family_code
        LEFT JOIN public.product_versions v ON r.id = v.reference_id
        LEFT JOIN public.product_skus s ON v.id = s.version_id
        WHERE f.family_code = 'VEXH01' OR s.sku_complete = 'VEXH01-0051-000-0467'
    `);
    console.table(vexh01);

    // 4. TEST MEASUREMENT PARSER
    console.log("\n--- 4. Measurement Parser Test ---");
    function convertMeasureToPulgadas(value) {
        if (!value) return null;
        const clean = value.trim().toUpperCase().replace('CM', '').replace('PULG', '').trim();
        const match = clean.match(/^(\d+(?:[.,]\d+)?)\s*[Xx]\s*(\d+(?:[.,]\d+)?)$/);
        if (!match) return null;
        const valW = match[1].replace(',', '.');
        const valH = match[2].replace(',', '.');
        const w = Math.round(parseFloat(valW) / 2.54);
        const h = Math.round(parseFloat(valH) / 2.54);
        return `${w}INX${h}IN`;
    }
    const testMeasures = ["44,5X43,5", "44.5X43.5", "60X20", "44,5 X 43,5"];
    testMeasures.forEach(m => {
        console.log(`Input: "${m}" -> Result: ${convertMeasureToPulgadas(m)}`);
    });

    // 5. GLOBAL DIFFERENCE SUMMARY
    console.log("\n--- 5. Global Difference Summary ---");
    const globalDiff = await dbQuery(`
        SELECT 
            COUNT(*) as total_skus,
            COUNT(*) FILTER (WHERE v.product_name != c.cabinet_name) as name_mismatch,
            COUNT(*) FILTER (WHERE v.commercial_measure != c.commercial_measure) as measure_mismatch,
            COUNT(*) FILTER (WHERE (v.ref_attrs->>'accessory_text') != c.accessory_text AND c.accessory_text != 'NA') as acc_mismatch
        FROM public.v_ui_generate_list v
        JOIN public.cabinet_products c ON v.sku_complete = c.code
        WHERE c.status = 'ACTIVO';
    `);
    console.table(globalDiff);

    console.log("\n=== AUDIT END ===");
}

runAudits().catch(console.error);
