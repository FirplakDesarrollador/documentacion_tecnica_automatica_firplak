import * as dotenv from 'dotenv';
import path from 'path';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function inspectSchema() {
    try {
        // 1. product_references: columns, nullable, defaults
        const refCols = await dbQuery(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'product_references'
            ORDER BY ordinal_position
        `);
        console.log('=== product_references ===');
        console.table(refCols);

        // 2. product_versions
        const verCols = await dbQuery(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'product_versions'
            ORDER BY ordinal_position
        `);
        console.log('\n=== product_versions ===');
        console.table(verCols);

        // 3. product_skus
        const skuCols = await dbQuery(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'product_skus'
            ORDER BY ordinal_position
        `);
        console.log('\n=== product_skus ===');
        console.table(skuCols);

        // 4. Get color palette summary
        const colorCount = await dbQuery(`SELECT count(*) as total FROM public.colors`);
        console.log('\n=== Colors ===');
        console.log(`Total colores disponibles: ${colorCount[0]?.total}`);

        const sampleColors = await dbQuery(`
            SELECT code_4dig, name_color_sap 
            FROM public.colors 
            ORDER BY code_4dig 
            LIMIT 10
        `);
        console.log('Muestra:');
        console.table(sampleColors);

        // 5. Existing families
        const families = await dbQuery(`
            SELECT DISTINCT family_code 
            FROM public.product_references 
            ORDER BY family_code 
            LIMIT 20
        `);
        console.log('\n=== Familias existentes (muestra) ===');
        console.table(families);

    } catch (error) {
        console.error('Error:', error);
    }
}

inspectSchema();
