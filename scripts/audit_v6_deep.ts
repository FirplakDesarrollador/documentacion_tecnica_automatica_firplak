import { supabaseServer } from './src/lib/supabase';

async function runDeepAudit() {
    console.log("=== INICIANDO AUDITORÍA DE CALIDAD V6.1 (SOLO LECTURA) ===");

    // 1. Detección de Comas en Campos Estructurados
    const fieldsToAudit = ['commercial_measure', 'width_cm', 'height_cm', 'depth_cm', 'weight_kg'];
    const commaIssues = [];

    const { data: v6_data } = await supabaseServer.from('v_ui_generate_list').select('*');
    
    if (v6_data) {
        v6_data.forEach(item => {
            fieldsToAudit.forEach(field => {
                const val = item[field];
                if (val && typeof val === 'string' && val.includes(',')) {
                    commaIssues.push({
                        sku: item.sku_complete,
                        field: field,
                        current_value: val,
                        proposed_value: val.replace(/,/g, '.'),
                        risk: 'Medio (Formato)'
                    });
                }
            });
        });
    }

    // 2. Clasificación de Discrepancias vs Legacy (Muestra representativa)
    const { data: legacy_data } = await supabaseServer.from('cabinet_products').select('*').eq('status', 'ACTIVO').limit(1000);
    const classification = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    const riskyDiscrepancies = [];

    if (v6_data && legacy_data) {
        legacy_data.forEach(l => {
            const v = v6_data.find(rv => rv.sku_complete === l.code);
            if (!v) return;

            const diffs = [];
            let highRisk = false;

            if (v.product_name !== l.cabinet_name) {
                diffs.push(`Nombre: ${l.cabinet_name} -> ${v.product_name}`);
                if (!l.cabinet_name.includes(v.product_name) && !v.product_name.includes(l.cabinet_name)) highRisk = true;
            }
            if (v.width_cm !== l.width_cm) {
                diffs.push(`Medida: ${l.width_cm} -> ${v.width_cm}`);
                highRisk = true;
            }
            if (v.accessory_text !== l.accessory_text && l.accessory_text !== 'NA') {
                diffs.push(`Acc: ${l.accessory_text} -> ${v.accessory_text}`);
                highRisk = true;
            }

            if (diffs.length > 0) {
                if (highRisk) {
                    classification.D++;
                    riskyDiscrepancies.push({ sku: l.code, diffs: diffs.join(' | '), category: 'D' });
                } else {
                    classification.C++;
                }
            } else {
                classification.A++;
            }
        });
    }

    console.log("\n--- RESULTADOS PRELIMINARES ---");
    console.log(`Registros con comas detectados: ${commaIssues.length}`);
    console.log("Distribución de Riesgo (Estimada):", classification);
    
    if (commaIssues.length > 0) {
        console.log("\n--- Muestra de Registros con Comas ---");
        console.table(commaIssues.slice(0, 15));
    }

    if (riskyDiscrepancies.length > 0) {
        console.log("\n--- Muestra de Discrepancias de Alto Riesgo (D) ---");
        console.table(riskyDiscrepancies.slice(0, 15));
    }

    console.log("\n=== FIN DE AUDITORÍA ===");
}

runDeepAudit().catch(console.error);
