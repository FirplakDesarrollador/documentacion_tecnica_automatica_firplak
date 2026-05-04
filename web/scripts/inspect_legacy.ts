import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function test() {
    const rows = await dbQuery("SELECT * FROM cabinet_products WHERE code = 'VBAN05-0130-CME-0496'");
    console.log(JSON.stringify(rows[0], null, 2));
}
test();
