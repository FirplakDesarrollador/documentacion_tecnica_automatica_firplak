import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function gatherEvidence() {
    console.log("=== PHASE 0 CERTIFICATION EVIDENCE GATHERING ===\n");

    // 1. SCHEMA EVIDENCE
    console.log("--- 1. SCHEMA EVIDENCE ---");
    const tables = ['families', 'global_version_rules', 'product_references', 'product_versions', 'product_skus'];
    
    for (const table of tables) {
        console.log(`\nTable: ${table}`);
        const cols = await dbQuery(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [table]);
        console.log("Columns:", JSON.stringify(cols, null, 2));
        
        const constraints = await dbQuery(`SELECT conname, contype, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = $1::regclass`, [table]);
        console.log("Constraints:", JSON.stringify(constraints, null, 2));
        
        const indexes = await dbQuery(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1`, [table]);
        console.log("Indexes:", JSON.stringify(indexes, null, 2));
    }

    // 2. VALIDATION EVIDENCE
    console.log("\n--- 2. VALIDATION EVIDENCE ---");
    const oldTotal = await dbQuery("SELECT count(*) as count FROM public.cabinet_products");
    const oldRefs = await dbQuery("SELECT count(DISTINCT (familia_code || '-' || ref_code)) as count FROM public.cabinet_products");
    const oldVers = await dbQuery("SELECT count(DISTINCT sku_base) as count FROM public.cabinet_products");
    const oldSkus = await dbQuery("SELECT count(DISTINCT code) as count FROM public.cabinet_products");

    const newRefs = await dbQuery("SELECT count(*) as count FROM public.product_references");
    const newVers = await dbQuery("SELECT count(*) as count FROM public.product_versions");
    const newSkus = await dbQuery("SELECT count(*) as count FROM public.product_skus");

    console.log(`Original cabinet_products (Total): ${oldTotal[0].count}`);
    console.log(`Original cabinet_products (Distinct Ref Keys): ${oldRefs[0].count} vs New References: ${newRefs[0].count}`);
    console.log(`Original cabinet_products (Distinct Version Keys): ${oldVers[0].count} vs New Versions: ${newVers[0].count}`);
    console.log(`Original cabinet_products (Distinct SKU Keys): ${oldSkus[0].count} vs New SKUs: ${newSkus[0].count}`);

    // 3. DUPLICATE PRUNING EVIDENCE
    console.log("\n--- 3. DUPLICATE PRUNING EVIDENCE ---");
    const dups = await dbQuery("SELECT code, count(*) as qty FROM public.cabinet_products GROUP BY code HAVING count(*) > 1 ORDER BY qty DESC");
    console.log(`Found ${dups.length} groups of duplicate codes.`);
    
    if (dups.length > 0) {
        const sampleCodes = dups.slice(0, 5).map((d: any) => d.code);
        const sampleData = await dbQuery("SELECT code, cabinet_name, final_name_es, sap_description, status FROM public.cabinet_products WHERE code = ANY($1) ORDER BY code", [sampleCodes]);
        console.log("Sample of duplicates and their values:");
        console.log(JSON.stringify(sampleData, null, 2));
        
        // Check for conflicts
        console.log("\nChecking for conflicting non-key values in duplicates...");
        for (const code of sampleCodes) {
            const rows = sampleData.filter((r: any) => r.code === code);
            const names = new Set(rows.map((r: any) => r.cabinet_name));
            if (names.size > 1) {
                console.log(`CONFLICT in ${code}: different names found -> ${Array.from(names)}`);
            } else {
                console.log(`No conflict in ${code}: all instances share the same metadata.`);
            }
        }
    }

    // 4. TRIGGER EVIDENCE
    console.log("\n--- 4. TRIGGER EVIDENCE ---");
    const testCode = 'TEST-SYNC-EVIDENCE-001';
    
    console.log(`\nPerforming Test INSERT for ${testCode}...`);
    // Ensure cleanup first
    await dbQuery("DELETE FROM public.cabinet_products WHERE code = $1", [testCode]);
    
    await dbQuery(`
        INSERT INTO public.cabinet_products (code, familia_code, ref_code, version_code, color_code, sku_base, cabinet_name, status)
        VALUES ($1, 'ACC', 'ETEST', '000', '0000', 'ACC-ETEST-000', 'TEST TRIGGER PRODUCT', 'ACTIVO')
    `, [testCode]);

    const syncCheck = await dbQuery(`
        SELECT s.sku_complete, s.final_name_complete_es, r.product_name, v.sku_base
        FROM public.product_skus s
        JOIN public.product_versions v ON s.version_id = v.id
        JOIN public.product_references r ON v.reference_id = r.id
        WHERE s.sku_complete = $1
    `, [testCode]);

    console.log("Resulting Row in V6 Tables:", JSON.stringify(syncCheck, null, 2));

    console.log(`\nPerforming Test UPDATE for ${testCode}...`);
    await dbQuery("UPDATE public.cabinet_products SET cabinet_name = 'TEST TRIGGER PRODUCT UPDATED' WHERE code = $1", [testCode]);

    const syncCheckUpdate = await dbQuery(`
        SELECT r.product_name FROM public.product_references r
        JOIN public.product_versions v ON v.reference_id = r.id
        JOIN public.product_skus s ON s.version_id = v.id
        WHERE s.sku_complete = $1
    `, [testCode]);
    
    console.log("Reflected change in product_references:", JSON.stringify(syncCheckUpdate, null, 2));

    // Cleanup
    await dbQuery("DELETE FROM public.cabinet_products WHERE code = $1", [testCode]);
    console.log("\nCleanup done. Trigger Test Complete.");
}

gatherEvidence();
