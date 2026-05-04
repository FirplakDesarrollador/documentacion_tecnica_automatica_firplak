import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function dropSkus() {
    try {
        await dbQuery("DROP TABLE IF EXISTS public.product_skus CASCADE;");
        console.log("product_skus table dropped.");
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

dropSkus();
