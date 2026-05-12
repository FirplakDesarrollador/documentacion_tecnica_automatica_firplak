import * as dotenv from 'dotenv';
import path from 'path';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    console.log('=== ESQUEMA REAL DE TABLAS ===\n');

    // 1. Families
    const familiesCols = await dbQuery(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'families'
        ORDER BY ordinal_position
    `);
    console.log('--- FAMILIES ---');
    console.table(familiesCols);

    // 2. Product References
    const refCols = await dbQuery(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_references'
        ORDER BY ordinal_position
    `);
    console.log('--- PRODUCT_REFERENCES ---');
    console.table(refCols);

    // 3. Product Versions
    const verCols = await dbQuery(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_versions'
        ORDER BY ordinal_position
    `);
    console.log('--- PRODUCT_VERSIONS ---');
    console.table(verCols);

    // 4. Product SKUs
    const skuCols = await dbQuery(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_skus'
        ORDER BY ordinal_position
    `);
    console.log('--- PRODUCT_SKUS ---');
    console.table(skuCols);

    // 5. Familias existentes
    const existingFamilies = await dbQuery(`SELECT family_code FROM public.families ORDER BY family_code`);
    console.log('--- FAMILIAS EXISTENTES ---');
    console.log(existingFamilies.map((f: any) => f.family_code));

    // 6. Chequear familias del CSV vs existentes
    console.log('\n--- FAMILIAS QUE NO EXISTEN ---');
    // Esto lo haré en el script principal

    // 7. Constraints de families
    const famConstraints = await dbQuery(`
        SELECT conname, pg_get_constraintdef(c.oid)
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public'
        AND c.conrelid::regclass::text = 'families'
    `);
    console.log('--- CONSTRAINTS DE FAMILIES ---');
    console.table(famConstraints);

    // 8. FK de product_references hacia families
    const refFKs = await dbQuery(`
        SELECT conname, pg_get_constraintdef(c.oid)
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public'
        AND c.conrelid::regclass::text = 'product_references'
        AND c.contype = 'f'
    `);
    console.log('--- FK DE PRODUCT_REFERENCES ---');
    console.table(refFKs);

    // 9. Global version rules
    const versionRules = await dbQuery(`SELECT version_code, label FROM public.global_version_rules ORDER BY version_code LIMIT 20`);
    console.log('--- GLOBAL_VERSION_RULES (muestra) ---');
    console.table(versionRules);

    // 10. Muestra de ref_attrs completos
    const sampleRefAttrs = await dbQuery(`
        SELECT reference_code, family_code, ref_attrs
        FROM public.product_references
        WHERE ref_attrs IS NOT NULL AND ref_attrs::text != '{}'
        LIMIT 5
    `);
    console.log('--- MUESTRA REF_ATTRS ---');
    sampleRefAttrs.forEach((r: any) => console.log(`${r.family_code}-${r.reference_code}:`, JSON.stringify(r.ref_attrs)));

    // 11. Muestra de version_attrs completos
    const sampleVerAttrs = await dbQuery(`
        SELECT sku_base, version_attrs
        FROM public.product_versions
        WHERE version_attrs IS NOT NULL AND version_attrs::text != '{}'
        LIMIT 5
    `);
    console.log('--- MUESTRA VERSION_ATTRS ---');
    sampleVerAttrs.forEach((r: any) => console.log(`${r.sku_base}:`, JSON.stringify(r.version_attrs)));
}

main().catch(console.error);
