import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function q(sql: string): Promise<any[]> {
    const { data, error } = await (sb.rpc as any)('exec_sql', { query_text: sql });
    if (error) throw new Error(`DB Error: ${error.message}`);
    return Array.isArray(data) ? data : [];
}

const AFFECTED_SKUS = [
    'VBAN05-0097-000-0458',
    'VBAN05-0114-151-0442',
    'VBAN12-0088-MRH-0484',
    'VBAN12-0089-MRH-0484',
    'VBAN12-0090-MRH-0484',
    'VBAN05-0090-000-0452',
];

const SHAKER_PATTERN = 'VBAN05-0131-%';
const VITELLI_PATTERN = 'VBAN12-0049-%';

async function main() {
    // ══════════════════════════════════════════════════════
    // CHECK 1: Materialized names — were they regenerated?
    // ══════════════════════════════════════════════════════
    console.log('════════════════════════════════════════════════════════');
    console.log(' CHECK 1 — MATERIALIZED NAMES (product_versions + product_skus)');
    console.log('════════════════════════════════════════════════════════\n');

    const allCodes = [...AFFECTED_SKUS];
    const inList = allCodes.map(c => `'${c}'`).join(',');

    // Get cabinet_products current state (source of truth post-fix)
    const cpRows = await q(`
        SELECT code, final_name_es, final_name_en, accessory_text, cabinet_name, special_label
        FROM public.cabinet_products
        WHERE code IN (${inList}) OR code LIKE '${SHAKER_PATTERN}' OR code LIKE '${VITELLI_PATTERN}'
    `);

    // Get product_skus current state
    const skuRows = await q(`
        SELECT sku_complete, final_complete_name_es, final_complete_name_en, sap_description_recommended
        FROM public.product_skus
        WHERE sku_complete IN (${inList}) OR sku_complete LIKE '${SHAKER_PATTERN}' OR sku_complete LIKE '${VITELLI_PATTERN}'
    `);

    const cpMap = new Map(cpRows.map((r: any) => [r.code, r]));
    const skuMap = new Map(skuRows.map((r: any) => [r.sku_complete, r]));

    let namesOutOfSync = 0;
    for (const cp of cpRows) {
        const sku = skuMap.get(cp.code);
        if (!sku) {
            console.log(`⚠️  ${cp.code}: Existe en cabinet_products pero NO en product_skus`);
            namesOutOfSync++;
            continue;
        }
        // Compare cabinet_products.final_name_es with product_skus.final_complete_name_es
        // They won't match exactly (skus includes color suffix), but we check if the base is contained
        const cpBase = (cp.final_name_es || '').trim();
        const skuFull = (sku.final_complete_name_es || '').trim();
        
        // Check key fields that changed
        const accessoryInSku = cp.accessory_text && cp.accessory_text !== 'NA' 
            ? skuFull.toUpperCase().includes(cp.accessory_text.split('+')[0].trim().toUpperCase())
            : true;
        const cabinetInSku = cp.cabinet_name 
            ? skuFull.toUpperCase().includes(cp.cabinet_name.toUpperCase())
            : true;

        const synced = accessoryInSku && cabinetInSku;
        
        console.log(`${synced ? '✅' : '🔴'} ${cp.code}`);
        console.log(`   CP final_name_es:  ${cpBase}`);
        console.log(`   SKU final_complete: ${skuFull}`);
        console.log(`   CP accessory_text:  ${cp.accessory_text || '(null)'}`);
        console.log(`   CP cabinet_name:    ${cp.cabinet_name || '(null)'}`);
        console.log(`   CP special_label:   ${cp.special_label || '(null)'}`);
        if (!synced) {
            namesOutOfSync++;
            if (!accessoryInSku) console.log(`   ❌ accessory_text "${cp.accessory_text}" NOT reflected in SKU name`);
            if (!cabinetInSku) console.log(`   ❌ cabinet_name "${cp.cabinet_name}" NOT reflected in SKU name`);
        }
        console.log('');
    }

    console.log(`RESULTADO: ${namesOutOfSync} SKUs con nombres NO regenerados tras las correcciones.\n`);

    // ══════════════════════════════════════════════════════
    // CHECK 2: SHAKER naming decision
    // ══════════════════════════════════════════════════════
    console.log('════════════════════════════════════════════════════════');
    console.log(' CHECK 2 — SHAKER NAMING DECISION');
    console.log('════════════════════════════════════════════════════════\n');

    const shakerRows = cpRows.filter((r: any) => r.code.startsWith('VBAN05-0131-'));
    for (const s of shakerRows) {
        const sku = skuMap.get(s.code);
        const hasShaker = (sku?.final_complete_name_es || '').toUpperCase().includes('SHAKER');
        console.log(`${hasShaker ? '✅' : '🔴'} ${s.code}`);
        console.log(`   special_label: "${s.special_label}"`);
        console.log(`   In final name: ${hasShaker ? 'SÍ' : 'NO'}`);
        console.log(`   Final: ${sku?.final_complete_name_es || '(no en product_skus)'}`);
        console.log('');
    }

    // ══════════════════════════════════════════════════════
    // CHECK 3: Sync consistency CP ↔ V6.1
    // ══════════════════════════════════════════════════════
    console.log('════════════════════════════════════════════════════════');
    console.log(' CHECK 3 — SYNC CONSISTENCY (cabinet_products ↔ V6.1)');
    console.log('════════════════════════════════════════════════════════\n');

    // Check if the V6.1 tables have the corrected data
    const v6Check = await q(`
        SELECT 
            s.sku_complete,
            r.product_name as v6_cabinet_name,
            r.ref_attrs,
            v.version_attrs
        FROM public.product_skus s
        JOIN public.product_versions v ON s.version_id = v.id
        JOIN public.product_references r ON v.reference_id = r.id
        WHERE s.sku_complete IN (${inList}) OR s.sku_complete LIKE '${SHAKER_PATTERN}' OR s.sku_complete LIKE '${VITELLI_PATTERN}'
    `);

    let syncIssues = 0;
    for (const v6 of v6Check) {
        const cp = cpMap.get(v6.sku_complete);
        if (!cp) continue;

        const v6Name = (v6.v6_cabinet_name || '').toUpperCase();
        const cpName = (cp.cabinet_name || '').toUpperCase();
        const nameMatch = v6Name === cpName;

        // Check ref_attrs for accessory_text
        const attrs = typeof v6.ref_attrs === 'string' ? JSON.parse(v6.ref_attrs) : (v6.ref_attrs || {});
        const v6Accessory = (attrs.accessory_text || '').toUpperCase();
        const cpAccessory = (cp.accessory_text || '').toUpperCase();
        const accessoryMatch = v6Accessory === cpAccessory;

        const ok = nameMatch && accessoryMatch;
        if (!ok) syncIssues++;

        console.log(`${ok ? '✅' : '🔴'} ${v6.sku_complete}`);
        if (!nameMatch) console.log(`   ❌ cabinet_name: CP="${cpName}" vs V6="${v6Name}"`);
        if (!accessoryMatch) console.log(`   ❌ accessory_text: CP="${cpAccessory}" vs V6.ref_attrs="${v6Accessory}"`);
    }

    console.log(`\nRESULTADO: ${syncIssues} discrepancias entre cabinet_products y V6.1.\n`);

    // ══════════════════════════════════════════════════════
    // CHECK 4: Delta validation summary
    // ══════════════════════════════════════════════════════
    console.log('════════════════════════════════════════════════════════');
    console.log(' CHECK 4 — DELTA VALIDATION SUMMARY');
    console.log('════════════════════════════════════════════════════════\n');

    // Re-run the specific SAP vs final checks for corrected SKUs
    const deltaSkus = await q(`
        SELECT s.sku_complete, s.sap_description_original, s.final_complete_name_es
        FROM public.product_skus s
        WHERE s.sku_complete IN (${inList}) OR s.sku_complete LIKE '${SHAKER_PATTERN}' OR s.sku_complete LIKE '${VITELLI_PATTERN}'
    `);

    console.log('--- Re-check: MANIJA NEGRA ---');
    for (const s of deltaSkus) {
        const sap = (s.sap_description_original || '').toUpperCase();
        const final = (s.final_complete_name_es || '').toUpperCase();
        if (/MANIJA\s*NEGRA|MNJS\s*NEGRAS/.test(sap)) {
            const inFinal = /MANIJA\s*NEGRA/.test(final);
            console.log(`  ${inFinal ? '✅' : '🔴'} ${s.sku_complete}: ${inFinal ? 'RESOLVED' : 'STILL MISSING in final name (pending regen)'}`);
        }
    }

    console.log('\n--- Re-check: VITELLI ---');
    for (const s of deltaSkus) {
        if (!s.sku_complete.startsWith('VBAN12-0049-')) continue;
        const final = (s.final_complete_name_es || '').toUpperCase();
        const hasVitelli = final.includes('VITELLI');
        console.log(`  ${hasVitelli ? '✅' : '🔴'} ${s.sku_complete}: ${hasVitelli ? 'VITELLI in name' : 'Still shows VITELI (pending regen)'}`);
    }

    console.log('\n--- Re-check: SHAKER ---');
    for (const s of deltaSkus) {
        if (!s.sku_complete.startsWith('VBAN05-0131-')) continue;
        const final = (s.final_complete_name_es || '').toUpperCase();
        const hasShaker = final.includes('SHAKER');
        console.log(`  ${hasShaker ? '✅' : '🟡'} ${s.sku_complete}: ${hasShaker ? 'SHAKER in name' : 'No SHAKER (pending naming decision)'}`);
    }

    console.log('\n--- Re-check: LONDON ---');
    for (const s of deltaSkus) {
        if (s.sku_complete !== 'VBAN05-0090-000-0452') continue;
        const final = (s.final_complete_name_es || '').toUpperCase();
        const hasLondon = final.includes('LONDON');
        console.log(`  ${hasLondon ? '✅' : '🔴'} ${s.sku_complete}: ${hasLondon ? 'LONDON in name' : 'LONDON missing (pending regen)'}`);
    }

    console.log('\n✅ Consistency check complete.');
}

main().catch(console.error);
