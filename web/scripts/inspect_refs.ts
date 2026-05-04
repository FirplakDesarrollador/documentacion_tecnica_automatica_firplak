import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function test() {
    const refs = await dbQuery("SELECT commercial_measure, COUNT(*) as count FROM cabinet_products WHERE ref_code = '0082' AND familia_code = 'BAN22' GROUP BY commercial_measure");
    console.log(JSON.stringify(refs, null, 2));
}
test();
