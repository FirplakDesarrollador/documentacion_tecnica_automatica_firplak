import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function checkLabels() {
    const res = await dbQuery(`
        SELECT ref_code, version_code, special_label 
        FROM public.cabinet_products 
        WHERE special_label IS NOT NULL AND special_label != 'NA'
        ORDER BY ref_code, version_code
        LIMIT 20
    `);
    console.log(JSON.stringify(res, null, 2));
}

checkLabels();
