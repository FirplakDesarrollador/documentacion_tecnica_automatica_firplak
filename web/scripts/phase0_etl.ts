import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function runETL() {
    console.log("Starting Phase 0 ETL (Clean Version)...");
    
    // 1. Fetch current data from old table
    const products = await dbQuery(`
        SELECT p.*, c.name_color_sap 
        FROM public.cabinet_products p 
        LEFT JOIN public.colors c ON p.color_code = c.code_4dig
    `);
    
    const productsData = Array.isArray(products) ? products : (products.data || []);
    console.log(`Loaded ${productsData.length} records from cabinet_products.`);

    // 2. Clear old test data in new tables if needed (optional)
    // await dbQuery("TRUNCATE public.product_skus CASCADE");

    // 3. Process products
    console.log("Processing References, Versions and SKUs...");
    let refCount = 0;
    let versionCount = 0;
    let skuCount = 0;

    for (const p of productsData) {
        // A. Insert/Update Reference
        const refAttrs = {
            rh: p.rh,
            canto_puertas: p.canto_puertas,
            bisagras: p.bisagras,
            accessory_text: p.accessory_text,
            door_color_text: p.door_color_text,
            armado_con_lvm: p.armado_con_lvm,
            carb2: p.carb2
        };

        try {
            await dbQuery(`
                INSERT INTO public.product_references 
                (family_code, reference_code, product_name, product_type, width_cm, depth_cm, height_cm, weight_kg, isometric_path, isometric_asset_id, ref_attrs, status)
                VALUES ($1, $2, $3, 'MUEBLE', $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
                ON CONFLICT (family_code, reference_code) DO UPDATE SET
                    product_name = EXCLUDED.product_name,
                    ref_attrs = EXCLUDED.ref_attrs
            `, [
                p.familia_code, p.ref_code, p.cabinet_name || '', 
                p.width_cm || 0, p.depth_cm || 0, p.height_cm || 0, p.weight_kg || 0,
                p.isometric_path, p.isometric_asset_id, JSON.stringify(refAttrs), p.status || 'ACTIVO'
            ]);
        } catch(e) {}

        const refObj = await dbQuery("SELECT id FROM public.product_references WHERE family_code=$1 AND reference_code=$2", [p.familia_code, p.ref_code]);
        if (!refObj || refObj.length === 0) continue;
        const refId = refObj[0].id;
        refCount++;

        // B. Insert/Update Version
        try {
            await dbQuery(`
                INSERT INTO public.product_versions
                (reference_id, version_code, sku_base, final_base_name_es, final_base_name_en, validation_status, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (reference_id, version_code) DO UPDATE SET
                    final_base_name_es = EXCLUDED.final_base_name_es,
                    final_base_name_en = EXCLUDED.final_base_name_en
            `, [
                refId, p.version_code, p.sku_base, p.final_name_es, p.final_name_en, p.validation_status || 'incomplete', p.status || 'ACTIVO'
            ]);
        } catch(e) {}

        const verObj = await dbQuery("SELECT id FROM public.product_versions WHERE reference_id=$1 AND version_code=$2", [refId, p.version_code]);
        if (!verObj || verObj.length === 0) continue;
        const verId = verObj[0].id;
        versionCount++;

        // C. Insert/Update SKU
        try {
            const colorName = p.name_color_sap || p.door_color_text || '';
            const colorSuffix = colorName && colorName !== 'NA' ? ` - ${colorName}` : '';
            const fullNameEs = (p.final_name_es || '') + colorSuffix;
            const fullNameEn = (p.final_name_en || '') + colorSuffix;

            await dbQuery(`
                INSERT INTO public.product_skus
                (version_id, sku_complete, sap_description_original, final_complete_name_es, final_complete_name_en, status)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (sku_complete) DO UPDATE SET
                    final_complete_name_es = EXCLUDED.final_complete_name_es,
                    final_complete_name_en = EXCLUDED.final_complete_name_en
            `, [
                verId, p.code, p.sap_description, fullNameEs, fullNameEn, p.status || 'ACTIVO'
            ]);
            skuCount++;
        } catch(e) { 
            console.error("Error SKU:", p.code, e);
        }
    }

    console.log(`\n--- ETL Summary ---`);
    console.log(`References processed: ${refCount}`);
    console.log(`Versions processed: ${versionCount}`);
    console.log(`SKUs inserted/updated: ${skuCount}`);
}

runETL();
