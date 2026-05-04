import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function analyzeOrphans() {
    console.log("=== ANALYZING ORPHAN VERSION CODES ===\n");

    const codes = ['MRH', 'MDT', 'PTT', 'CME'];
    
    for (const code of codes) {
        console.log(`\n--- Code: ${code} ---`);
        const sample = await dbQuery(`
            SELECT code, familia_code, ref_code, cabinet_name, sap_description, final_name_es 
            FROM public.cabinet_products 
            WHERE version_code = $1 
            LIMIT 5
        `, [code]);
        console.log(JSON.stringify(sample, null, 2));
    }
}

analyzeOrphans();
