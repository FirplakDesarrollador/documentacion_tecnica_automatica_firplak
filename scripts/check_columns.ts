import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function checkColumns() {
    try {
        const cols = await dbQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'product_skus' ORDER BY ordinal_position;");
        console.log("Columns in product_skus:");
        console.log(cols.map((c: any) => c.column_name).join(', '));
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

checkColumns();
