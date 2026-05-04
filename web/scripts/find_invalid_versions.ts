import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function findInvalidVersions() {
    try {
        const res = await dbQuery(`
            SELECT version_code, count(*) as qty 
            FROM public.cabinet_products 
            WHERE version_code NOT IN (SELECT code FROM public.global_version_rules)
            GROUP BY version_code
        `);
        console.log("Invalid Version Codes found:", JSON.stringify(res, null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

findInvalidVersions();
