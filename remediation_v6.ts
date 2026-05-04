import { supabaseServer, dbQuery } from './src/lib/supabase';
import { composeProductBySku } from './src/lib/engine/product_composer';
import { evaluateProductRules } from './src/lib/engine/ruleEvaluator';
import { translateProductToEnglish } from './src/lib/engine/translator';
import * as fs from 'fs';

async function logBeforeAfter(table: string, field: string, id: string, fam: string, ref: string, ver: string, sku: string, before: any, after: any, reason: string) {
    const line = `| ${table} | ${field} | ${id} | ${fam} | ${ref} | ${ver} | ${sku} | ${before} | ${after} | ${reason} |\n`;
    fs.appendFileSync('before_after_remediation.md', line);
}

async function runRemediation() {
    fs.writeFileSync('before_after_remediation.md', '# Reporte Before/After Final\n\n| Tabla | Campo | ID | Family | Ref | Version | SKU | Valor Actual | Valor Propuesto | Razón |\n|---|---|---|---|---|---|---|---|---|---|\n');
    let affectedRows = { product_references: 0, product_versions: 0, product_skus: 0, families: 0 };
    const affectedSkusToRegenerate = new Set<string>();

    // =========================================================================
    // 1. DECIMALES CON COMA
    // =========================================================================
    console.log("--- 1. Corrigiendo Decimales con Coma ---");
    const { data: references } = await supabaseServer.from('product_references').select('*');
    if (!references) return;

    for (const ref of references) {
        let updated = false;
        let newRef = { ...ref };
        const numFields = ['commercial_measure', 'width_cm', 'depth_cm', 'height_cm', 'weight_kg'];
        
        for (const field of numFields) {
            const val = ref[field];
            if (typeof val === 'string' && val.includes(',')) {
                const newVal = val.replace(/,/g, '.');
                newRef[field] = newVal;
                updated = true;
                await logBeforeAfter('product_references', field, ref.id, ref.family_code, ref.reference_code, 'N/A', 'N/A', val, newVal, 'Remediación decimal coma a punto');
            }
        }
        
        if (updated) {
            await dbQuery(`UPDATE product_references SET commercial_measure = $1, width_cm = $2, depth_cm = $3, height_cm = $4, weight_kg = $5 WHERE id = $6`, [newRef.commercial_measure, newRef.width_cm, newRef.depth_cm, newRef.height_cm, newRef.weight_kg, ref.id]);
            affectedRows.product_references++;
            // Get SKUs
            const { data: skus } = await supabaseServer.from('product_skus')
                .select('sku_complete, version_id')
                .in('version_id', (await supabaseServer.from('product_versions').select('id').eq('reference_id', ref.id)).data?.map(v => v.id) || []);
            skus?.forEach(s => affectedSkusToRegenerate.add(s.sku_complete));
        }
    }

    // =========================================================================
    // 2. VEXH01 DIAGNOSTICO (Prueba de Family)
    // =========================================================================
    console.log("--- 2. Diagnóstico VEXH01 Controlado ---");
    await dbQuery(`INSERT INTO families (family_code, family_name, use_destination) VALUES ('TEST_FAM', 'TEST', 'PRUEBA_DEST') ON CONFLICT (family_code) DO NOTHING`);
    const testFam = await dbQuery(`SELECT use_destination FROM families WHERE family_code = 'TEST_FAM'`);
    console.log("Test Family use_destination guardado como:", testFam?.[0]?.use_destination);
    await dbQuery(`DELETE FROM families WHERE family_code = 'TEST_FAM'`);

    // =========================================================================
    // 3. ACCESSORY_TEXT
    // =========================================================================
    console.log("--- 3. Corrigiendo accessory_text ---");
    const updateRefAccessory = async (fam: string, ref: string, newText: string) => {
        const r = references.find(x => x.family_code === fam && x.reference_code === ref);
        if (r) {
            const attrs = typeof r.ref_attrs === 'string' ? JSON.parse(r.ref_attrs) : (r.ref_attrs || {});
            const oldText = attrs.accessory_text;
            attrs.accessory_text = newText;
            await logBeforeAfter('product_references', 'ref_attrs.accessory_text', r.id, fam, ref, 'N/A', 'N/A', oldText, newText, 'Regla Aprobada');
            await dbQuery(`UPDATE product_references SET ref_attrs = $1 WHERE id = $2`, [JSON.stringify(attrs), r.id]);
            affectedRows.product_references++;
            // fetch skus
            const { data: skus } = await supabaseServer.from('product_skus')
                .select('sku_complete, version_id')
                .in('version_id', (await supabaseServer.from('product_versions').select('id').eq('reference_id', r.id)).data?.map(v => v.id) || []);
            skus?.forEach(s => affectedSkusToRegenerate.add(s.sku_complete));
        }
    };

    await updateRefAccessory('BAN05', '0114', 'RFE');
    await updateRefAccessory('BAN05', '0108', 'CON MANIJAS');
    await updateRefAccessory('BAN22', '0082', 'RFE CIERRE LENTO');
    await updateRefAccessory('BAN31', '0001', 'NA');
    await updateRefAccessory('BAN31', '0002', 'NA');
    await updateRefAccessory('BAN31', '0003', 'NA');
    await updateRefAccessory('BAN31', '0004', 'NA');

    // Version overrides
    const { data: versions } = await supabaseServer.from('product_versions').select('id, reference_id, version_code, version_attrs');
    const updateVerAccessory = async (fam: string, ref: string, verCode: string, newText: string) => {
        const r = references.find(x => x.family_code === fam && x.reference_code === ref);
        if (!r) return;
        const v = versions?.find(x => x.reference_id === r.id && x.version_code === verCode);
        if (v) {
            const attrs = typeof v.version_attrs === 'string' ? JSON.parse(v.version_attrs) : (v.version_attrs || {});
            const oldText = attrs.accessory_text;
            attrs.accessory_text = newText;
            await logBeforeAfter('product_versions', 'version_attrs.accessory_text', v.id, fam, ref, verCode, 'N/A', oldText, newText, 'Override Aprobado');
            await dbQuery(`UPDATE product_versions SET version_attrs = $1 WHERE id = $2`, [JSON.stringify(attrs), v.id]);
            affectedRows.product_versions++;
            const { data: skus } = await supabaseServer.from('product_skus').select('sku_complete').eq('version_id', v.id);
            skus?.forEach(s => affectedSkusToRegenerate.add(s.sku_complete));
        }
    };
    
    await updateVerAccessory('BAN05', '0114', '151', 'RFE + MANIJA NEGRA 520');
    // For BAN05-0130 CME, check legacy
    const legacyCME = await dbQuery(`SELECT accessory_text FROM cabinet_products WHERE familia_code = 'BAN05' AND ref_code = '0130' AND version_code = 'CME' LIMIT 1`);
    if (legacyCME && legacyCME.length > 0 && legacyCME[0].accessory_text === 'RFE + MANIJA NEGRA 520') {
        await updateVerAccessory('BAN05', '0130', 'CME', 'RFE + MANIJA NEGRA 520');
    }

    // =========================================================================
    // 4. COLISIONES DE REFERENCIA
    // =========================================================================
    console.log("--- 4. Corrigiendo Colisiones ---");
    const resolveCollision = async (fam: string, ref: string, matchMeasure: string, matchName?: string) => {
        let query = `SELECT * FROM cabinet_products WHERE familia_code = $1 AND ref_code = $2 AND commercial_measure = $3 AND status = 'ACTIVO'`;
        const params: any[] = [fam, ref, matchMeasure];
        if (matchName) {
            query += ` AND cabinet_name = $4`;
            params.push(matchName);
        }
        query += ` LIMIT 1`;
        const leg = await dbQuery(query, params);
        if (leg && leg.length > 0) {
            const l = leg[0];
            const r = references.find(x => x.family_code === fam && x.reference_code === ref);
            if (r) {
                await logBeforeAfter('product_references', 'Colisión SSOT', r.id, fam, ref, 'N/A', 'N/A', `${r.product_name} ${r.commercial_measure}`, `${l.cabinet_name} ${l.commercial_measure}`, 'Decisión SSOT');
                await dbQuery(`
                    UPDATE product_references SET 
                        product_name = $1, commercial_measure = $2, width_cm = $3, depth_cm = $4, height_cm = $5, weight_kg = $6,
                        designation = $7, line = $8
                    WHERE id = $9
                `, [l.cabinet_name, l.commercial_measure, l.width_cm, l.depth_cm, l.height_cm, l.weight_kg, l.designation, l.line, r.id]);
                affectedRows.product_references++;
                const { data: skus } = await supabaseServer.from('product_skus')
                    .select('sku_complete, version_id')
                    .in('version_id', (await supabaseServer.from('product_versions').select('id').eq('reference_id', r.id)).data?.map(v => v.id) || []);
                skus?.forEach(s => affectedSkusToRegenerate.add(s.sku_complete));
            }
        }
    };

    await resolveCollision('BAN05', '0108', '40X30');
    await resolveCollision('BAN05', '0111', '40X30');
    await resolveCollision('BAN22', '0082', '63X48', 'MACAO');

    // =========================================================================
    // 5. REGENERACIÓN DE NOMBRES (SOLO AFECTADOS)
    // =========================================================================
    console.log(`--- 5. Regenerando Nombres para ${affectedSkusToRegenerate.size} SKUs afectados ---`);
    const { data: rules } = await supabaseServer.from('naming_rules').select('*').eq('active', true);
    
    // Convert rules mapping if necessary
    for (const skuStr of Array.from(affectedSkusToRegenerate)) {
        const product = await composeProductBySku(skuStr);
        if (!product) continue;
        
        // We map the composed product back to Product type logic expected by evaluateProductRules
        // or we just call the RPC!
        // It's safer to just let the RPC handle it if we can.
        // Wait, I can just use evaluateProductRules if I pass it the mapped product.
        const mappedProduct: any = {
            cabinet_name: product.product_name,
            use_destination: product.use_destination,
            designation: product.designation,
            commercial_measure: product.commercial_measure,
            product_type: product.product_type,
            assembled_flag: product.assembled_flag,
            sink_flag: product.sink_flag,
            mirror_flag: product.mirror_flag,
            line: product.line,
            familia_code: product.familia_code,
            ...product.ref_attrs,
            ...product.version_attrs,
            ...product.sku_attrs
        };
        const res = evaluateProductRules(mappedProduct, rules || []);
        const finalEs = res.finalNameEs;
        
        // Let's use translation actions manually
        const transRes = await translateProductToEnglish(mappedProduct, product.product_type || 'MUEBLE');
        const finalEn = transRes.translatedName;

        // Update Version (Base Name)
        await dbQuery(`UPDATE product_versions SET final_base_name_es = $1, final_base_name_en = $2 WHERE version_code = $3 AND reference_id = (SELECT id FROM product_references WHERE reference_code = $4 AND family_code = $5)`, [finalEs, finalEn, product.version_code, product.ref_code, product.familia_code]);
        affectedRows.product_versions++;

        // Update SKU (Complete Name)
        const finalCompleteEs = `${finalEs} ${product.color_name || ''}`.trim();
        const finalCompleteEn = `${finalEn} ${product.color_name || ''}`.trim();
        await dbQuery(`UPDATE product_skus SET final_complete_name_es = $1, final_complete_name_en = $2 WHERE sku_complete = $3`, [finalCompleteEs, finalCompleteEn, skuStr]);
        affectedRows.product_skus++;
    }

    fs.writeFileSync('remediation_stats.json', JSON.stringify(affectedRows, null, 2));
    console.log("Remediación terminada. Estadísticas:", affectedRows);
}

runRemediation().catch(console.error);
