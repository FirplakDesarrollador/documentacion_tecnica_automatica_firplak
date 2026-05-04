import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function diagnose() {
    console.log("=== DIAGNOSIS OF PHASE 0 DISCREPANCIES ===\n");

    // 1. Check for orphans (FK violations prevented insertion)
    const orphans = await dbQuery(`
        SELECT count(*) as count 
        FROM public.cabinet_products 
        WHERE familia_code NOT IN (SELECT code FROM public.families)
    `);
    console.log(`Products with invalid familia_code (orphans): ${orphans[0].count}`);

    const versionOrphans = await dbQuery(`
        SELECT count(*) as count 
        FROM public.cabinet_products 
        WHERE version_code NOT IN (SELECT code FROM public.global_version_rules)
    `);
    console.log(`Products with invalid version_code: ${versionOrphans[0].count}`);

    // 2. Identify a valid family and version for trigger testing
    const validFamily = await dbQuery("SELECT code FROM public.families LIMIT 1");
    const validVersion = await dbQuery("SELECT code FROM public.global_version_rules LIMIT 1");
    console.log(`\nValid Family for test: ${validFamily[0].code}`);
    console.log(`Valid Version for test: ${validVersion[0].code}`);

    // 3. Find exactly where the "95" discrepancy comes from
    // Count distinct keys in cabinet_products
    const distinctSkus = await dbQuery("SELECT count(DISTINCT code) as count FROM public.cabinet_products");
    const totalSkusInNew = await dbQuery("SELECT count(*) as count FROM public.product_skus");
    
    console.log(`\nDistinct SKUs in Old: ${distinctSkus[0].count}`);
    console.log(`Total SKUs in New: ${totalSkusInNew[0].count}`);
    console.log(`Missing: ${Number(distinctSkus[0].count) - Number(totalSkusInNew[0].count)}`);

    // 4. Check if any duplicate code exists in Old
    const duplicates = await dbQuery(`
        SELECT code, count(*) as qty 
        FROM public.cabinet_products 
        GROUP BY code 
        HAVING count(*) > 1
    `);
    console.log(`Actual duplicate codes in cabinet_products: ${duplicates.length}`);
}

diagnose();
