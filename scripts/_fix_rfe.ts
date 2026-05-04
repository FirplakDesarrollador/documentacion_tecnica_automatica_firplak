import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    const { data, error } = await (sb.rpc as any)('exec_sql', {
        query_text: "UPDATE public.cabinet_products SET accessory_text = 'RFE + MANIJA NEGRA 520' WHERE code = 'VBAN05-0114-151-0442'"
    });
    if (error) { console.error('Error:', error.message); return; }
    console.log('UPDATE OK:', JSON.stringify(data));

    const { data: check } = await (sb.rpc as any)('exec_sql', {
        query_text: "SELECT code, accessory_text FROM public.cabinet_products WHERE code = 'VBAN05-0114-151-0442'"
    });
    console.log('Verificación:', JSON.stringify(check));
}

main().catch(console.error);
