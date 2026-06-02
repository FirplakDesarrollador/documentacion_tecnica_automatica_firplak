import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function migrateLabelsAndDetails() {
    console.log("=== MIGRATING LABELS, DESIGNATION, LINE, AND MEASURES ===\n");

    try {
        // 1. Schema alteration
        console.log("Adding version_label column to product_versions...");
        await dbQuery(`ALTER TABLE public.product_versions ADD COLUMN IF NOT EXISTS version_label text`);
        console.log("Schema updated.\n");

        // 2. Update product_references with data from version '000'
        console.log("Migrating reference-level data (designation, line, commercial_measure, special_label)...");
        await dbQuery(`
            UPDATE public.product_references pr
            SET 
                designation = cp.designation,
                line = cp.line,
                commercial_measure = cp.commercial_measure,
                special_label = cp.special_label
            FROM public.cabinet_products cp
            WHERE pr.family_code = cp.familia_code 
              AND pr.reference_code = cp.ref_code
              AND cp.version_code = '000'
        `);
        console.log("Reference data updated.\n");

        // Fallback for references that might not have a '000' version (if any exist)
        console.log("Applying fallback for references without '000' version...");
        await dbQuery(`
            UPDATE public.product_references pr
            SET 
                designation = COALESCE(pr.designation, cp.designation),
                line = COALESCE(pr.line, cp.line),
                commercial_measure = COALESCE(pr.commercial_measure, cp.commercial_measure)
            FROM (
                SELECT DISTINCT ON (familia_code, ref_code) familia_code, ref_code, designation, line, commercial_measure
                FROM public.cabinet_products
                WHERE designation IS NOT NULL OR line IS NOT NULL OR commercial_measure IS NOT NULL
            ) cp
            WHERE pr.family_code = cp.familia_code 
              AND pr.reference_code = cp.ref_code
              AND (pr.designation IS NULL AND pr.line IS NULL AND pr.commercial_measure IS NULL)
        `);
        console.log("Fallback applied.\n");

        // 3. Update product_versions with version_label for non-'000' versions
        console.log("Migrating version-level labels to product_versions.version_label...");
        await dbQuery(`
            UPDATE public.product_versions pv
            SET version_label = cp.special_label
            FROM public.cabinet_products cp
            JOIN public.product_references pr ON cp.familia_code = pr.family_code AND cp.ref_code = pr.reference_code
            WHERE pv.reference_id = pr.id
              AND pv.version_code = cp.version_code
              AND cp.version_code != '000'
              AND cp.special_label IS NOT NULL
        `);
        console.log("Version labels updated.\n");

        // 4. Verify some data
        console.log("Verifying data migration:");
        const sampleRefs = await dbQuery(`
            SELECT family_code, reference_code, designation, line, commercial_measure, special_label 
            FROM public.product_references 
            WHERE special_label IS NOT NULL OR designation IS NOT NULL 
            LIMIT 3
        `);
        console.log("Sample References:", JSON.stringify(sampleRefs, null, 2));

        const sampleVers = await dbQuery(`
            SELECT pv.sku_base, pv.version_code, pv.version_label 
            FROM public.product_versions pv 
            WHERE pv.version_label IS NOT NULL 
            LIMIT 3
        `);
        console.log("Sample Versions:", JSON.stringify(sampleVers, null, 2));

        console.log("\n=== MIGRATION COMPLETE ===");

    } catch (e: any) {
        console.error("FATAL Error:", e.message);
    }
}

migrateLabelsAndDetails().catch(e => console.error("FATAL:", e.message));
