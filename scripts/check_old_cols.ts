import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function checkOldCols() {
    const cols = await dbQuery(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cabinet_products'`);
    console.log("Cabinet Products columns:", cols.map((c: any) => c.column_name).join(', '));
}

checkOldCols();
