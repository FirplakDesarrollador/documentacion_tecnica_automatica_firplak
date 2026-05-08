import * as dotenv from 'dotenv';
import path from 'path';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    try {
        const res = await dbQuery("SELECT sku_base FROM product_versions LIMIT 5");
        console.table(res);
    } catch (e) {
        console.error(e);
    }
}
main();
