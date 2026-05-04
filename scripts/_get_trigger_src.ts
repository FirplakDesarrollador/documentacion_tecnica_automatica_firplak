import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    const { data, error } = await (sb.rpc as any)('exec_sql', { 
        query_text: "SELECT prosrc FROM pg_proc JOIN pg_trigger ON tgfoid = pg_proc.oid WHERE tgname = 'trg_sync_product_v6'" 
    });
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Trigger Source:', data[0]?.prosrc);
    }
}

main().catch(console.error);
