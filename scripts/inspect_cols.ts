import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function inspectCols() {
    try {
        const res = await dbQuery("SELECT * FROM public.cabinet_products LIMIT 1");
        const rows = Array.isArray(res) ? res : (res.data || []);
        if (rows.length > 0) {
            console.log("Actual Columns in DB:", Object.keys(rows[0]).join(', '));
        } else {
            console.log("No rows in cabinet_products.");
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

inspectCols();
