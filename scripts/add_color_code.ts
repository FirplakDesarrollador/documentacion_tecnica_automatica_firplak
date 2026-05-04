import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function addColorCode() {
    console.log("=== ADDING COLOR CODE TO SKUS ===\n");
    try {
        await dbQuery(`ALTER TABLE public.product_skus ADD COLUMN IF NOT EXISTS color_code text`);
        await dbQuery(`
            UPDATE public.product_skus
            SET color_code = SUBSTRING(sku_complete FROM '\\d{4}$')
            WHERE color_code IS NULL
        `);
        console.log("Done.");
    } catch (e: any) {
        console.error("FATAL Error:", e.message);
    }
}

addColorCode();
