import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function deepCleanup() {
    console.log("Deep Cleaning V6 Tables...\n");

    // Delete SKUs that are not in the old table
    await dbQuery(`
        DELETE FROM public.product_skus 
        WHERE sku_complete NOT IN (SELECT code FROM public.cabinet_products)
    `);

    // Delete Versions that have no SKUs
    await dbQuery(`
        DELETE FROM public.product_versions 
        WHERE id NOT IN (SELECT version_id FROM public.product_skus)
    `);

    // Delete References that have no Versions
    await dbQuery(`
        DELETE FROM public.product_references 
        WHERE id NOT IN (SELECT reference_id FROM public.product_versions)
    `);

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
}

deepCleanup();
