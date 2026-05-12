import * as dotenv from 'dotenv';
import path from 'path';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    console.log('=== ESQUEMA DETALLADO ===\n');

    const tables = ['families', 'product_references', 'product_versions', 'product_skus', 'colors'];
    
    for (const table of tables) {
        const cols = await dbQuery(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '${table}'
            ORDER BY ordinal_position
        `);
        console.log(`--- ${table.toUpperCase()} ---`);
        console.table(cols);
    }
}

main().catch(console.error);
