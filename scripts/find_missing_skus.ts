import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function findMissing() {
    console.log("=== FINDING REMAINING MISSING SKUS ===\n");

    const missing = await dbQuery(`
        SELECT code, familia_code, ref_code, version_code, sku_base, cabinet_name 
        FROM public.cabinet_products 
        WHERE code NOT IN (SELECT sku_complete FROM public.product_skus)
        LIMIT 20
    `);
    
    console.log(`Found ${missing.length} missing SKUs. Samples:`);
    console.log(JSON.stringify(missing, null, 2));

    // Analyze why they are missing
    if (missing.length > 0) {
        const m = missing[0];
        console.log(`\nAnalyzing ${m.code}:`);
        const ref = await dbQuery("SELECT id FROM public.product_references WHERE family_code=$1 AND reference_code=$2", [m.familia_code, m.ref_code]);
        console.log(`Reference ${m.familia_code}-${m.ref_code} exists? ${ref.length > 0 ? 'YES (' + ref[0].id + ')' : 'NO'}`);
        
        if (ref.length > 0) {
            const ver = await dbQuery("SELECT id FROM public.product_versions WHERE reference_id=$1 AND version_code=$2", [ref[0].id, m.version_code]);
            console.log(`Version ${m.version_code} exists for this ref? ${ver.length > 0 ? 'YES' : 'NO'}`);
        }
    }
}

findMissing();
