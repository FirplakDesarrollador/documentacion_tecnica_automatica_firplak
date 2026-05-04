import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function checkCols() {
    const cols = await dbQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = 'global_version_rules'`);
    console.log("Global Version Rules columns:", JSON.stringify(cols, null, 2));
}

checkCols();
