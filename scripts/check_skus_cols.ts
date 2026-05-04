import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function checkCols() {
    const cols = await dbQuery(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'product_skus'`);
    console.log("Product SKUs columns:", cols.map((c: any) => c.column_name).join(', '));
}

checkCols();
