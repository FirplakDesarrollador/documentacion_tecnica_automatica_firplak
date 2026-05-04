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

    // 5. GLOBAL DIFFERENCE REPORT
    console.log("\n--- 5. Global Difference Report (V6.1 vs Legacy) ---");
    const { count: v6_count } = await supabaseServer.from('product_skus').select('*', { count: 'exact', head: true });
    const { count: legacy_count } = await supabaseServer.from('cabinet_products').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVO');
    
    console.log(`V6.1 SKUs Count: ${v6_count}`);
    console.log(`Legacy Active SKUs Count: ${legacy_count}`);

    const { data: v6_all } = await supabaseServer.from('v_ui_generate_list').select('*');
    const { data: legacy_all } = await supabaseServer.from('cabinet_products').select('*').eq('status', 'ACTIVO').limit(1000);

    const risks = {
        HIGH: [],
        MEDIUM: [],
        LOW: []
    };

    let totalDiscrepancies = 0;

    if (v6_all && legacy_all) {
        legacy_all.forEach(l => {
            const v = v6_all.find(rv => rv.sku_complete === l.code);
            if (!v) {
                risks.HIGH.push({ sku: l.code, issue: 'SKU MISSING IN V6.1' });
                return;
            }

            const diffs = [];
            if (v.product_name !== l.cabinet_name) diffs.push(`Name: ${l.cabinet_name} -> ${v.product_name}`);
            if (v.width_cm !== l.width_cm) diffs.push(`Width: ${l.width_cm} -> ${v.width_cm}`);
            if (v.accessory_text !== l.accessory_text && l.accessory_text !== 'NA') diffs.push(`Acc: ${l.accessory_text} -> ${v.accessory_text}`);
            if (v.special_label !== l.special_label && l.special_label !== 'NA') diffs.push(`Label: ${l.special_label} -> ${v.special_label}`);
            if (v.isometric_path !== l.isometric_path && l.isometric_path !== null) diffs.push(`Iso: ${l.isometric_path} -> ${v.isometric_path}`);

            if (diffs.length > 0) {
                totalDiscrepancies++;
                const item = {
                    sku: l.code,
                    differences: diffs.join(' | '),
                    family: l.familia_code,
                    ref: l.ref_code
                };
                if (diffs.some(d => d.startsWith('Name') || d.startsWith('Width') || d.startsWith('Iso'))) {
                    risks.HIGH.push(item);
                } else {
                    risks.MEDIUM.push(item);
                }
            }
        });
    }

    console.log(`Total SKUs compared: ${legacy_all?.length || 0}`);
    console.log(`Total SKUs with discrepancies: ${totalDiscrepancies}`);
    logData("Top High Risk Discrepancies", risks.HIGH.slice(0, 20));

    console.log("\n=== AUDIT END ===");
}

runAudits().catch(console.error);
