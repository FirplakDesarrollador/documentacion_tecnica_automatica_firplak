import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function checkTrigger() {
    try {
        const triggers = await dbQuery(`
            SELECT trigger_name 
            FROM information_schema.triggers 
            WHERE event_object_table = 'cabinet_products'
        `);
        console.log("Triggers on cabinet_products:", JSON.stringify(triggers, null, 2));

        const functions = await dbQuery(`
            SELECT routine_name 
            FROM information_schema.routines 
            WHERE routine_schema = 'public' AND routine_name = 'sync_product_to_v6'
        `);
        console.log("Sync Function:", JSON.stringify(functions, null, 2));

        // Test with real data and check every step
        const testCode = 'TEST-TRIGGER-FINAL-003';
        await dbQuery("DELETE FROM public.cabinet_products WHERE code = $1", [testCode]);
        
        console.log("\nExecuting Test Insert...");
        await dbQuery(`
            INSERT INTO public.cabinet_products (code, familia_code, ref_code, version_code, color_code, sku_base, cabinet_name, status)
            VALUES ($1, 'BAN05', 'TTEST', '002', '0000', 'BAN05-TTEST-002', 'TEST TRIGGER', 'ACTIVO')
        `, [testCode]);

        const ref = await dbQuery("SELECT * FROM public.product_references WHERE reference_code = 'TTEST'");
        console.log("References check:", JSON.stringify(ref, null, 2));

        const ver = await dbQuery("SELECT * FROM public.product_versions WHERE sku_base = 'BAN05-TTEST-002'");
        console.log("Versions check:", JSON.stringify(ver, null, 2));

        const sku = await dbQuery("SELECT * FROM public.product_skus WHERE sku_complete = $1", [testCode]);
        console.log("SKU check:", JSON.stringify(sku, null, 2));

    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

checkTrigger();
