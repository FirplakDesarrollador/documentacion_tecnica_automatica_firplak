import { dbQuery } from './src/lib/supabase';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function getRPCs() {
    const rpcs = [
        'bulk_update_product_names',
        'bulk_direct_update_names',
        'bulk_update_product_translations',
        'create_product_v6_transaction',
        'update_product_v6_transaction'
    ];

    for (const name of rpcs) {
        console.log(`--- FETCHING ${name} ---`);
        try {
            const res = await dbQuery(`
                SELECT p.proname, pg_get_functiondef(p.oid) as definition
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = 'public' AND p.proname = '${name}'
            `);
            if (res && res.length > 0) {
                console.log(res[0].definition);
            } else {
                console.log(`RPC ${name} not found.`);
            }
        } catch (e: any) {
            console.error(`Error fetching ${name}:`, e.message);
        }
        console.log('\n');
    }
}

getRPCs();
