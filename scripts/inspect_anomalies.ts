import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function test() {
    console.log("=== INSPECTING LEGACY INCONSISTENCIES ===");
    
    const rows = await dbQuery(`
        SELECT code, ref_code, cabinet_name, accessory_text, door_color_text, rh
        FROM public.cabinet_products
        WHERE (familia_code = 'BAN05' AND ref_code IN ('0108', '0111'))
           OR (familia_code = 'BAN22' AND ref_code = '0082' AND version_code = '000')
        ORDER BY ref_code
    `);
    
    console.log(JSON.stringify(rows, null, 2));
}

test().catch(console.error);
