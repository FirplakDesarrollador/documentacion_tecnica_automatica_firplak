import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function debugProduct() {
    try {
        const res = await dbQuery("SELECT p.code, p.final_name_es, p.door_color_text, c.name_color_sap FROM public.cabinet_products p LEFT JOIN public.colors c ON p.color_code = c.code_4dig LIMIT 10;");
        console.log("Sample Data:", JSON.stringify(res, null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

debugProduct();
