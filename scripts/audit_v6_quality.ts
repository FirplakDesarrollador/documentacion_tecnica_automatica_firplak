import { supabaseServer } from './src/lib/supabase';

const logData = (title: string, data: any) => {
    console.log(`\n--- ${title} ---`);
    if (Array.isArray(data)) {
        if (data.length === 0) console.log("No data found.");
        else console.table(data);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
};

async function runAudits() {
    console.log("=== PHASE 2C.1 AUDIT START ===");

    // 1. AUDIT accessory_text CONTAMINATION
    console.log("\n--- 1. accessory_text Contamination Audit ---");
    const { data: v6_acc } = await supabaseServer.from('product_references').select('family_code, reference_code, ref_attrs');
    const { data: legacy_acc } = await supabaseServer.from('cabinet_products').select('familia_code, ref_code, code, accessory_text').eq('status', 'ACTIVO');

    const accDiscrepancies = [];
    if (v6_acc && legacy_acc) {
        legacy_acc.forEach(l => {
            const v = v6_acc.find(rv => rv.family_code === l.familia_code && rv.reference_code === l.ref_code);
            if (v) {
                const v6Acc = v.ref_attrs?.accessory_text;
                const isContaminated = /RH|MADERA|HUMEDAD|CARB2|PUR/i.test(v6Acc || '');
                const isDifferent = v6Acc !== l.accessory_text && l.accessory_text !== 'NA' && l.accessory_text !== null;
                
                if (isContaminated || isDifferent) {
                    accDiscrepancies.push({
                        family: l.familia_code,
                        ref: l.ref_code,
                        sku: l.code,
                        legacy: l.accessory_text,
                        v6: v6Acc,
                        type: isContaminated ? 'CONTAMINADO' : 'DISCREPANCIA'
                    });
                }
            }
        });
    }
    logData("accessory_text Discrepancies (First 20)", accDiscrepancies.slice(0, 20));

    // 2. AUDIT REFERENCE COLLISIONS
    console.log("\n--- 2. Reference Collision Audit ---");
    // Detectamos si familia + ref tienen distintos nombres o medidas en legacy
    const { data: collisions } = await supabaseServer.rpc('exec_sql', { query_text: `
        SELECT 
            familia_code, 
            ref_code, 
            COUNT(DISTINCT cabinet_name) as names,
            COUNT(DISTINCT commercial_measure) as measures,
            STRING_AGG(DISTINCT cabinet_name, ' | ') as all_names
        FROM public.cabinet_products
        WHERE status = 'ACTIVO'
        GROUP BY familia_code, ref_code
        HAVING COUNT(DISTINCT cabinet_name) > 1 OR COUNT(DISTINCT commercial_measure) > 1
        LIMIT 10
    ` });
    logData("Legacy Collisions", collisions);

    // 3. AUDIT VEXH01 CASE
    const { data: vexh01Deep } = await supabaseServer.from('families').select(`
        family_code, use_destination, product_type,
        product_references (
            reference_code, product_name,
            product_versions (
                version_code,
                final_base_name_es, final_base_name_en,
                product_skus ( sku_complete )
            )
        )
    `).eq('family_code', 'EXH01');
    logData("VEXH01 Family Data", vexh01Deep?.[0]);
    logData("VEXH01 Version Data", vexh01Deep?.[0]?.product_references?.[0]?.product_versions?.[0]);

    // 4. TEST MEASUREMENT PARSER
    console.log("\n--- 4. Measurement Parser Test ---");
    function convertMeasureToPulgadas(value: string): string | null {
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

    console.log("\n=== AUDIT END ===");
}

runAudits().catch(console.error);
