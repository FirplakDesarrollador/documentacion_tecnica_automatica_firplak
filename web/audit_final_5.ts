
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const envPath = path.resolve(__dirname, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
            process.env[key] = value;
        }
    });

    const { dbQuery } = await import('./src/lib/supabase.ts');

    try {
        // 1. Check Foreign Keys pointing to cabinet_products
        console.log('=== 1. Foreign Keys pointing to cabinet_products ===');
        const fks = await dbQuery(`
            SELECT
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' 
              AND ccu.table_name = 'cabinet_products';
        `);
        if (fks.length > 0) {
            for (const fk of fks) {
                console.log(`  Table: ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
            }
        } else {
            console.log('  No foreign keys found pointing to cabinet_products.');
        }

        // 2. ID Comparison (Are they the same UUIDs?)
        console.log('\n=== 2. ID Compatibility Check ===');
        const idCheck = await dbQuery(`
            SELECT cp.id as cp_id, s.id as s_id, cp.code
            FROM public.cabinet_products cp
            JOIN public.product_skus s ON cp.code = s.sku_complete
            LIMIT 5
        `);
        for (const row of idCheck) {
            const match = row.cp_id === row.s_id;
            console.log(`  SKU: ${row.code} | CP_ID: ${row.cp_id} | S_ID: ${row.s_id} | Match: ${match}`);
        }

        // 3. Search for cabinet_products in non-web directories
        console.log('\n=== 3. Searching for cabinet_products in scripts/execution ===');
    } catch (e) {
        console.error(e);
    }
}
main();
