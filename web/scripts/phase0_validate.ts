import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function validate() {
    console.log("Validating Phase 0 Migration (Final Check - Refined Names)...\n");

    const stats = await dbQuery(`
        SELECT 
            (SELECT count(*) FROM public.cabinet_products) as old_total,
            (SELECT count(*) FROM public.families) as new_families,
            (SELECT count(*) FROM public.product_references) as new_refs,
            (SELECT count(*) FROM public.product_versions) as new_vers,
            (SELECT count(*) FROM public.product_skus) as new_skus
    `);

    console.log("--- CONTEOS ---");
    console.log(`Original cabinet_products: ${stats[0].old_total}`);
    console.log(`Nuevas families:          ${stats[0].new_families}`);
    console.log(`Nuevas product_references: ${stats[0].new_refs}`);
    console.log(`Nuevas product_versions:   ${stats[0].new_vers}`);
    console.log(`Nuevos product_skus:       ${stats[0].new_skus}`);

    // Integrity check
    const skus = await dbQuery("SELECT sku_complete, final_complete_name_es FROM public.product_skus WHERE sku_complete = 'VBAN05-0093-000-0437'");
    
    if (skus.length > 0) {
        console.log("\n--- INTEGRIDAD (Spot Check) ---");
        console.log(`SKU: ${skus[0].sku_complete}`);
        console.log(`Nombre Completo: ${skus[0].final_complete_name_es}`);
    }

    const versionRules = await dbQuery("SELECT version_code, version_description, automatic_version_rules FROM public.global_version_rules WHERE version_code = 'MDT'");
    if (versionRules.length > 0) {
        console.log("\n--- REGLAS DE VERSIÓN ---");
        console.log(`Código: ${versionRules[0].version_code}`);
        console.log(`Descripción: ${versionRules[0].version_description}`);
        console.log(`Reglas Automáticas: ${JSON.stringify(versionRules[0].automatic_version_rules)}`);
    }

    console.log("\nValidation complete.");
}

validate();
