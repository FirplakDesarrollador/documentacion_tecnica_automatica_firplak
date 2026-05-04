import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    const { data, error } = await (sb.rpc as any)('exec_sql', { 
        query_text: "SELECT * FROM rules WHERE enabled = true ORDER BY priority ASC" 
    });
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Rules:', JSON.stringify(data, null, 2));
    }
}

main().catch(console.error);
