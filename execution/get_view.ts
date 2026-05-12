import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { dbQuery } from '../src/lib/supabase';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
async function main() {
    const r = await dbQuery(`SELECT pg_get_viewdef('public.v_ui_generate_list', true) as def`);
    fs.writeFileSync(path.join(process.cwd(), 'artifacts', 'view_definition.txt'), r[0]?.def || 'NOT FOUND', 'utf8');
    console.log('DONE');
}
main();
