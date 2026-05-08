import * as dotenv from 'dotenv';
import path from 'path';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    try {
        const query = `
            SELECT conname, pg_get_constraintdef(c.oid) 
            FROM pg_constraint c 
            JOIN pg_namespace n ON n.oid = c.connamespace 
            WHERE n.nspname = 'public' 
            AND c.conrelid::regclass::text IN ('product_references', 'product_versions', 'product_skus')
        `;
        const res = await dbQuery(query);
        console.table(res);
    } catch (e) {
        console.error(e);
    }
}
main();
