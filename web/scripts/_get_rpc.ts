import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    const { data, error } = await (sb.rpc as any)('exec_sql', { 
        query_text: "SELECT prosrc FROM pg_proc WHERE proname = 'bulk_direct_update_names'" 
    });
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('RPC Source:', data[0]?.prosrc);
    }

    const { data: d2 } = await (sb.rpc as any)('exec_sql', { 
        query_text: "SELECT prosrc FROM pg_proc WHERE proname = 'bulk_update_product_names'" 
    });
    console.log('RPC Source 2:', d2[0]?.prosrc);
}

main().catch(console.error);
