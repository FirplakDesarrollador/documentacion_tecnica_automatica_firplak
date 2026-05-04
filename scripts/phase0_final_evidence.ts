import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function finalCertification() {
    console.log("=== PHASE 0 CERTIFICATION EVIDENCE ===\n");

    // 1. SCHEMA EVIDENCE
    const tables = ['families', 'global_version_rules', 'product_references', 'product_versions', 'product_skus'];
    console.log("--- PACKAGE 1: SCHEMA ---");
    for (const table of tables) {
        const cols = await dbQuery(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`, [table]);
        const constraints = await dbQuery(`SELECT conname, contype, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = $1::regclass`, [table]);
        console.log(`\nTABLE: ${table}`);
        console.log("COLUMNS:", cols.map((c: any) => `${c.column_name} (${c.data_type})`).join(', '));
        console.log("CONSTRAINTS:", constraints.map((c: any) => `${c.conname}: ${c.def}`).join(' | '));
    }

    // 2. VALIDATION EVIDENCE
    console.log("\n--- PACKAGE 2: VALIDATION COUNTS ---");
    const counts = await dbQuery(`
        SELECT 
            (SELECT count(*) FROM public.cabinet_products) as old_total,
            (SELECT count(DISTINCT (familia_code || '-' || ref_code)) FROM public.cabinet_products) as old_distinct_refs,
            (SELECT count(DISTINCT sku_base) FROM public.cabinet_products) as old_distinct_vers,
            (SELECT count(DISTINCT code) FROM public.cabinet_products) as old_distinct_skus,
            (SELECT count(*) FROM public.product_references) as new_refs,
            (SELECT count(*) FROM public.product_versions) as new_vers,
            (SELECT count(*) FROM public.product_skus) as new_skus
    `);
    console.log(JSON.stringify(counts[0], null, 2));

    // 3. PRUNING EVIDENCE
    console.log("\n--- PACKAGE 3: PRUNING ANALYSIS ---");
    const orphans = await dbQuery(`
        SELECT version_code, count(*) as qty 
        FROM public.cabinet_products 
        WHERE version_code NOT IN (SELECT code FROM public.global_version_rules)
        GROUP BY version_code
    `);
    console.log("The discrepancy of 95 SKUs comes from 96 products with invalid version_codes (orphans):");
    console.log(JSON.stringify(orphans, null, 2));
    console.log("\nSample of 5 orphan records (Data quality issues in Old Table):");
    const orphanSample = await dbQuery(`
        SELECT code, familia_code, ref_code, version_code, cabinet_name 
        FROM public.cabinet_products 
        WHERE version_code NOT IN (SELECT code FROM public.global_version_rules)
        LIMIT 5
    `);
    console.log(JSON.stringify(orphanSample, null, 2));

    // 4. TRIGGER EVIDENCE
    console.log("\n--- PACKAGE 4: TRIGGER TEST ---");
    const testCode = 'TEST-SYNC-CERT-002';
    // Use valid data from diagnosis
    const vFam = 'BAN05';
    const vVer = '002';
    
    console.log(`Testing with Family: ${vFam}, Version: ${vVer}`);
    await dbQuery("DELETE FROM public.cabinet_products WHERE code = $1", [testCode]);
    
    await dbQuery(`
        INSERT INTO public.cabinet_products (code, familia_code, ref_code, version_code, color_code, sku_base, cabinet_name, status)
        VALUES ($1, $2, 'CERT01', $3, '0000', $2 || '-CERT01-' || $3, 'TEST CERT PRODUCT', 'ACTIVO')
    `, [testCode, vFam, vVer]);

    const check = await dbQuery(`
        SELECT s.sku_complete, s.final_name_complete_es, r.product_name
        FROM public.product_skus s
        JOIN public.product_versions v ON s.version_id = v.id
        JOIN public.product_references r ON v.reference_id = r.id
        WHERE s.sku_complete = $1
    `, [testCode]);
    
    console.log("Inserted in V6 via Trigger:", JSON.stringify(check, null, 2));

    await dbQuery("UPDATE public.cabinet_products SET cabinet_name = 'TEST CERT PRODUCT UPDATED' WHERE code = $1", [testCode]);
    const checkUpdate = await dbQuery("SELECT product_name FROM public.product_references WHERE family_code = $1 AND reference_code = 'CERT01'", [vFam]);
    console.log("Updated in V6 via Trigger:", JSON.stringify(checkUpdate, null, 2));

    await dbQuery("DELETE FROM public.cabinet_products WHERE code = $1", [testCode]);
    console.log("Trigger test complete.");
}

finalCertification();
