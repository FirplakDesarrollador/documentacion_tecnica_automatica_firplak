import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function findExtra() {
    const extra = await dbQuery(`
        SELECT sku_complete FROM public.product_skus 
        WHERE sku_complete NOT IN (SELECT code FROM public.cabinet_products)
    `);
    console.log("Extra SKUs in V6:", JSON.stringify(extra, null, 2));
}

findExtra();
