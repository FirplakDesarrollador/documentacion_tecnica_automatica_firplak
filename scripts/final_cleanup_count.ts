import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function finalCleanupAndCount() {
    console.log("=== FINAL CLEANUP AND CORRECTED COUNTS ===\n");

    // Remove test data
    await dbQuery("DELETE FROM public.product_skus WHERE sku_complete LIKE 'TEST-%'");
    await dbQuery("DELETE FROM public.cabinet_products WHERE code LIKE 'TEST-%'");

    const stats = await dbQuery(`
        SELECT 
            (SELECT count(*) FROM public.cabinet_products) as old_total,
            (SELECT count(DISTINCT (familia_code || '-' || ref_code)) FROM public.cabinet_products) as old_refs,
            (SELECT count(DISTINCT sku_base) FROM public.cabinet_products) as old_vers,
            (SELECT count(DISTINCT code) FROM public.cabinet_products) as old_skus,
            (SELECT count(*) FROM public.product_references) as new_refs,
            (SELECT count(*) FROM public.product_versions) as new_vers,
            (SELECT count(*) FROM public.product_skus) as new_skus
    `);

    console.log(JSON.stringify(stats[0], null, 2));

    const missing = await dbQuery(`
        SELECT code, familia_code, ref_code, version_code 
        FROM public.cabinet_products 
        WHERE code NOT IN (SELECT sku_complete FROM public.product_skus)
    `);
    console.log(`\nRemaining excluded SKUs: ${missing.length}`);
    if (missing.length > 0) {
        console.log(JSON.stringify(missing, null, 2));
    }
}

finalCleanupAndCount();
