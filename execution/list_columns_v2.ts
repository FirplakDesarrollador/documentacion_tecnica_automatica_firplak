import * as dotenv from 'dotenv';
import path from 'path';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    const ref = await dbQuery(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'product_references' AND table_schema = 'public' 
        ORDER BY ordinal_position
    `);
    console.log('--- PRODUCT_REFERENCES ---');
    console.table(ref);

    const fam = await dbQuery(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'families' AND table_schema = 'public' 
        ORDER BY ordinal_position
    `);
    console.log('--- FAMILIES ---');
    console.table(fam);
}
main();
