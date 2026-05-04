import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    const { data, error } = await (sb.rpc as any)('exec_sql', { 
        query_text: "SELECT column_name FROM information_schema.columns WHERE table_name = 'product_skus' AND table_schema = 'public'" 
    });
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Columns:', JSON.stringify(data.map((c: any) => c.column_name), null, 2));
    }
}

main().catch(console.error);
