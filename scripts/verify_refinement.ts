import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function verifyAll() {
    console.log("=== POST-REFINEMENT VERIFICATION ===\n");

    // 1. Verify families structure
    const famCols = await dbQuery(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'families' ORDER BY ordinal_position`);
    console.log("Families columns:", famCols.map((c: any) => `${c.column_name}(${c.data_type})`).join(', '));

    // 2. Verify product_references no longer has zone_home/use_destination
    const refCols = await dbQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = 'product_references' ORDER BY ordinal_position`);
    console.log("\nReferences columns:", refCols.map((c: any) => c.column_name).join(', '));

    // 3. Verify global_version_rules no longer has version_attrs
    const gvrCols = await dbQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = 'global_version_rules' ORDER BY ordinal_position`);
    console.log("\nVersion rules columns:", gvrCols.map((c: any) => c.column_name).join(', '));

    // 4. Verify FK still works with trigger test
    const testCode = 'TEST-REFINEMENT-001';
    await dbQuery("DELETE FROM public.cabinet_products WHERE code = $1", [testCode]);
    await dbQuery(`
        INSERT INTO public.cabinet_products (code, familia_code, ref_code, version_code, color_code, sku_base, cabinet_name, status)
        VALUES ($1, 'BAN05', 'RFTEST', '000', '0437', 'BAN05-RFTEST-000', 'TEST REFINEMENT', 'ACTIVO')
    `, [testCode]);

    const sku = await dbQuery(`SELECT sku_complete, final_name_complete_es FROM public.product_skus WHERE sku_complete = $1`, [testCode]);
    console.log("\nTrigger test result:", JSON.stringify(sku, null, 2));

    // Cleanup
    await dbQuery("DELETE FROM public.cabinet_products WHERE code = $1", [testCode]);
    await dbQuery("DELETE FROM public.product_skus WHERE sku_complete = $1", [testCode]);

    // 5. Final counts
    const counts = await dbQuery(`
        SELECT
            (SELECT count(*) FROM public.families) as families,
            (SELECT count(*) FROM public.product_references) as refs,
            (SELECT count(*) FROM public.product_versions) as vers,
            (SELECT count(*) FROM public.product_skus) as skus
    `);
    console.log("\nFinal counts:", JSON.stringify(counts[0], null, 2));
}

verifyAll().catch(e => console.error("FATAL:", e.message));
