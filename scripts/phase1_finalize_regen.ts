import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { evaluateProductRules } from '../src/lib/engine/ruleEvaluator';
import { translateProductToEnglish } from '../src/lib/engine/translator';

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

const TARGET_SKUS = [
    'VBAN05-0097-000-0458',
    'VBAN05-0114-151-0442',
    'VBAN12-0088-MRH-0484',
    'VBAN12-0089-MRH-0484',
    'VBAN12-0090-MRH-0484',
    'VBAN05-0090-000-0452', // LONDON fix
];

const TARGET_PATTERNS = [
    'VBAN12-0049-%', // VITELLI fix
    'VBAN05-0131-%'  // SHAKER fix
];

async function main() {
    console.log('🚀 Finalizing Phase 1: Regenerating Materialized Names...\n');

    // 1. Fetch Rules and Colors
    const rules = await q("SELECT * FROM rules WHERE enabled = true ORDER BY priority ASC");
    const colors = await q("SELECT code_4dig, name_color_sap FROM colors");
    const colorMap = new Map(colors.map(c => [c.code_4dig, c.name_color_sap]));

    // 2. Fetch Products from cabinet_products (Source of Truth)
    const inList = TARGET_SKUS.map(s => `'${s}'`).join(',');
    const likeList = TARGET_PATTERNS.map(p => `code LIKE '${p}'`).join(' OR ');
    
    const products = await q(`
        SELECT * 
        FROM public.cabinet_products 
        WHERE code IN (${inList}) OR ${likeList}
    `);

    console.log(`Found ${products.length} products to regenerate.\n`);

    const results = [];

    for (const p of products) {
        // A. Regenerate Spanish Name
        // The evaluateProductRules expects a 'Product' type from Prisma, 
        // cabinet_products has most fields. We need to ensure types match.
        const resEs = evaluateProductRules(p as any, rules as any);
        const newNameEs = resEs.finalNameEs;

        // B. Regenerate English Name
        const resEn = await translateProductToEnglish(p as any, p.product_type || 'MUEBLE', resEs.activeVariableIds);
        const newNameEn = resEn.translatedName;

        // C. Recommended SAP Description (usually Spanish name truncated to 40 chars or similar, 
        // but we'll use the full name as requested or as standard in this project)
        // Since no specific logic was found, we use the generated ES name.
        const sapRec = newNameEs;

        // D. Store results for update
        results.push({
            id: p.id,
            code: p.code,
            oldNameEs: p.final_name_es,
            newNameEs,
            oldNameEn: p.final_name_en,
            newNameEn,
            sapRec,
            colorCode: p.color_code
        });
    }

    // 3. Apply Updates
    console.log('Applying updates to database...');
    
    for (const res of results) {
        // Update cabinet_products (Trigger will sync basic fields)
        const { error: cpErr } = await sb.from('cabinet_products').update({
            final_name_es: res.newNameEs,
            final_name_en: res.newNameEn,
            updated_at: new Date().toISOString()
        }).eq('id', res.id);

        if (cpErr) console.error(`Error updating cabinet_products for ${res.code}:`, cpErr.message);

        // Update product_skus.sap_description_recommended (Trigger doesn't handle this)
        // Also manually update names just in case trigger is indeed wonky or to ensure total consistency
        const colorName = colorMap.get(res.colorCode);
        const fullSkuNameEs = res.newNameEs + (colorName ? ` - ${colorName}` : '');
        const fullSkuNameEn = res.newNameEn + (colorName ? ` - ${colorName}` : '');

        const { error: skuErr } = await sb.from('product_skus').update({
            sap_description_recommended: res.sapRec,
            final_complete_name_es: fullSkuNameEs,
            final_complete_name_en: fullSkuNameEn,
            updated_at: new Date().toISOString()
        }).eq('sku_complete', res.code);

        if (skuErr) console.error(`Error updating product_skus for ${res.code}:`, skuErr.message);

        // Update product_versions (since trigger might only update if NEW row differs, 
        // and we want to be 100% sure the V6.1 is perfect)
        // We need the reference/version info from the SKU or CP
        const { data: skuData } = await sb.from('product_skus').select('version_id').eq('sku_complete', res.code).single();
        if (skuData) {
            const { error: verErr } = await sb.from('product_versions').update({
                final_base_name_es: res.newNameEs,
                final_base_name_en: res.newNameEn,
                updated_at: new Date().toISOString()
            }).eq('id', skuData.version_id);
            if (verErr) console.error(`Error updating product_versions for ${res.code}:`, verErr.message);
        }

        console.log(`✅ ${res.code.padEnd(25)} | ES: ${res.newNameEs.substring(0, 30)}... | EN: ${res.newNameEn.substring(0, 30)}...`);
    }

    console.log('\n✨ Regeneration complete.');
}

main().catch(console.error);
