import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
async function main() {
    const { data } = await (s.rpc as any)('exec_sql', { query_text: "SELECT column_name FROM information_schema.columns WHERE table_name = 'product_skus' ORDER BY ordinal_position" });
    console.log(JSON.stringify(data, null, 2));
}
main();
