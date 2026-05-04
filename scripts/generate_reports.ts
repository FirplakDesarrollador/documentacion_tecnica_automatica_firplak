import { supabaseServer } from './src/lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:\\Users\\oswaldo.rivera\\.gemini\\antigravity\\brain\\c948c33c-25a5-4570-89d1-5f80d46c9d09\\artifacts';

async function generateReports() {
    console.log("Iniciando generación de reportes...");

    // Fetch data
    console.log("Fetching legacy data...");
    const { data: legacyData } = await supabaseServer.from('cabinet_products').select('*').eq('status', 'ACTIVO');
    console.log("Fetching V6.1 families...");
    const { data: families } = await supabaseServer.from('families').select('*');
    console.log("Fetching V6.1 references...");
    const { data: references } = await supabaseServer.from('product_references').select('*');
    console.log("Fetching V6.1 versions...");
    const { data: versions } = await supabaseServer.from('product_versions').select('*');
    console.log("Fetching V6.1 skus...");
    const { data: skus } = await supabaseServer.from('product_skus').select('*');

    if (!legacyData || !families || !references || !versions || !skus) {
        console.error("Error fetching data");
        return;
    }

    // =========================================================================
    // A. Reporte de históricos con coma (comma_decimal_report.md)
    // =========================================================================
    console.log("Generando reporte de comas...");
    let commaMd = `# Reporte de Históricos con Coma\n\n| Tabla | Campo | SKU/Llave | Valor Actual | Valor Propuesto | Razón | Riesgo | Afectación |\n|---|---|---|---|---|---|---|---|\n`;
    const numFieldsRef = ['commercial_measure', 'width_cm', 'depth_cm', 'height_cm', 'weight_kg'];
    
    references.forEach(ref => {
        numFieldsRef.forEach(field => {
            const val = ref[field];
            if (typeof val === 'string' && val.includes(',')) {
                commaMd += `| product_references | ${field} | ${ref.reference_code} | ${val} | ${val.replace(/,/g, '.')} | Formato legacy no normalizado | Medio | Cálculos numéricos y conversión |\n`;
            }
        });
    });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'comma_decimal_report.md'), commaMd);

    // =========================================================================
    // B. Reporte de accessory_text contaminado
    // =========================================================================
    console.log("Generando reporte de accesorios...");
    let accMd = `# Auditoría de Accessory Text\n\n| Familia | Referencia | SKU Ejemplo | Legacy \`accessory_text\` | V6.1 \`ref_attrs->>accessory_text\` | Diferencia | Posible Origen | Recomendación |\n|---|---|---|---|---|---|---|---|\n`;
    
    const processedRefs = new Set();
    legacyData.forEach(l => {
        const refKey = `${l.familia_code}-${l.ref_code}`;
        if (processedRefs.has(refKey)) return;
        processedRefs.add(refKey);

        const v6Ref = references.find(r => r.family_code === l.familia_code && r.reference_code === l.ref_code);
        if (v6Ref) {
            const refAttrs = typeof v6Ref.ref_attrs === 'string' ? JSON.parse(v6Ref.ref_attrs) : (v6Ref.ref_attrs || {});
            const v6Acc = refAttrs.accessory_text || 'NA';
            const legAcc = l.accessory_text || 'NA';

            if (v6Acc !== legAcc) {
                accMd += `| ${l.familia_code} | ${l.ref_code} | ${l.code} | ${legAcc} | ${v6Acc} | Contaminación | ETL o Compose | Auditar y limpiar manual |\n`;
            }
        }
    });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'accessory_text_audit.md'), accMd);

    // =========================================================================
    // C. Reporte de colisiones de referencia
    // =========================================================================
    console.log("Generando reporte de colisiones...");
    let colMd = `# Reporte de Colisiones de Referencia Legacy\n\n`;
    
    // Group legacy by fam-ref
    const legGroups: Record<string, any[]> = {};
    legacyData.forEach(l => {
        const key = `${l.familia_code}-${l.ref_code}`;
        if (!legGroups[key]) legGroups[key] = [];
        legGroups[key].push(l);
    });

    for (const [key, items] of Object.entries(legGroups)) {
        if (items.length <= 1) continue;
        
        const names = new Set(items.map(i => i.cabinet_name));
        const measures = new Set(items.map(i => i.commercial_measure));
        const accessories = new Set(items.map(i => i.accessory_text));

        if (names.size > 1 || measures.size > 1 || accessories.size > 1) {
            const v6Ref = references.find(r => r.family_code === items[0].familia_code && r.reference_code === items[0].ref_code);
            colMd += `### Colisión en ${key}\n`;
            colMd += `- **SKUs afectados**: ${items.map(i => i.code).join(', ')}\n`;
            if (names.size > 1) colMd += `- **Nombres Legacy**: ${Array.from(names).join(' vs ')}\n`;
            if (measures.size > 1) colMd += `- **Medidas Legacy**: ${Array.from(measures).join(' vs ')}\n`;
            colMd += `- **Valor actual en V6.1 (product_name)**: ${v6Ref?.product_name || 'NO ENCONTRADO'}\n`;
            colMd += `- **Recomendación Técnica**: Definir SSOT para esta referencia.\n`;
            colMd += `- **Decisión Requerida**: ¿Qué nombre y medida deben prevalecer?\n\n`;
        }
    }
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'reference_collisions_report.md'), colMd);

    console.log("Reportes generados con éxito.");
}

generateReports().catch(console.error);
