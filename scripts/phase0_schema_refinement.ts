import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function refineSchema() {
    console.log("=== PHASE 0 SCHEMA REFINEMENT ===\n");

    // Step 1: Add new columns to families
    console.log("Step 1: Adding new columns to families...");
    await dbQuery(`ALTER TABLE public.families ADD COLUMN IF NOT EXISTS zone_home text`);
    await dbQuery(`ALTER TABLE public.families ADD COLUMN IF NOT EXISTS use_destination text`);
    await dbQuery(`ALTER TABLE public.families ADD COLUMN IF NOT EXISTS allowed_lines text[] DEFAULT '{}'`);
    console.log("Done.\n");

    // Step 2: Populate zone_home and use_destination from cabinet_products into families
    console.log("Step 2: Migrating zone_home/use_destination data to families...");
    await dbQuery(`
        UPDATE public.families f SET
            zone_home = sub.zone_home,
            use_destination = sub.use_destination
        FROM (
            SELECT DISTINCT ON (familia_code) familia_code, zone_home, use_destination
            FROM public.cabinet_products
            WHERE zone_home IS NOT NULL
            ORDER BY familia_code
        ) sub
        WHERE f.code = sub.familia_code
    `);
    console.log("Done.\n");

    // Step 3: Rename columns in families
    console.log("Step 3: Renaming families columns...");
    await dbQuery(`ALTER TABLE public.families RENAME COLUMN code TO family_code`);
    await dbQuery(`ALTER TABLE public.families RENAME COLUMN name TO family_name`);
    console.log("Done.\n");

    // Step 4: Drop redundant columns from product_references
    console.log("Step 4: Dropping zone_home/use_destination from product_references...");
    await dbQuery(`ALTER TABLE public.product_references DROP COLUMN IF EXISTS zone_home`);
    await dbQuery(`ALTER TABLE public.product_references DROP COLUMN IF EXISTS use_destination`);
    console.log("Done.\n");

    // Step 5: Clean up global_version_rules - set proper automatic_rules
    console.log("Step 5: Setting proper automatic_rules...");
    const rules = [
        { code: 'MRH', rules: { rh: 'RH' } },
        { code: 'MDT', rules: { carb2: 'CARB2', private_label_flag: true, private_label_client_name: 'MEDITERRANEO' } },
        { code: 'CME', rules: { accessory_text: 'MANIJA NEGRA 520' } },
        { code: 'PTT', rules: {} }
    ];
    for (const r of rules) {
        await dbQuery(`UPDATE public.global_version_rules SET automatic_rules = $1::jsonb WHERE code = $2`, [JSON.stringify(r.rules), r.code]);
        console.log(`  ${r.code}: ${JSON.stringify(r.rules)}`);
    }
    // Drop the redundant version_attrs column
    await dbQuery(`ALTER TABLE public.global_version_rules DROP COLUMN IF EXISTS version_attrs`);
    console.log("Done.\n");

    // Step 6: Validate
    console.log("Step 6: Validation...");
    const fam = await dbQuery(`SELECT family_code, family_name, zone_home, use_destination FROM public.families LIMIT 5`);
    console.log("Sample families:", JSON.stringify(fam, null, 2));

    const ver = await dbQuery(`SELECT code, description, automatic_rules FROM public.global_version_rules WHERE code IN ('MRH','MDT','CME','PTT')`);
    console.log("Version rules:", JSON.stringify(ver, null, 2));

    const counts = await dbQuery(`
        SELECT
            (SELECT count(*) FROM public.families) as families,
            (SELECT count(*) FROM public.product_references) as refs,
            (SELECT count(*) FROM public.product_versions) as vers,
            (SELECT count(*) FROM public.product_skus) as skus
    `);
    console.log("Counts:", JSON.stringify(counts[0], null, 2));

    console.log("\n=== REFINEMENT COMPLETE ===");
}

refineSchema().catch(e => console.error("FATAL:", e.message));
