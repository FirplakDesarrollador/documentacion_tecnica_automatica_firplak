import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    const { data, error } = await (sb.rpc as any)('exec_sql', { 
        query_text: "SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_sync_product_v6'" 
    });
    if (error) {
        console.error('Error fetching trigger status:', error.message);
    } else {
        console.log('Trigger Status:', JSON.stringify(data, null, 2));
    }
}

main().catch(console.error);
