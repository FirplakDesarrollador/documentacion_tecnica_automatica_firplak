
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function test() {
  console.log('Testing insertion into cabinet_products...');
  const { data, error } = await (supabase.rpc as any)('exec_sql', {
    query_text: "INSERT INTO public.cabinet_products (code, familia_code, ref_code, version_code, sku_base, status, accessory_text) VALUES ('COC01-9999-000-0000', 'COC01', '9999', '000', 'COC01-9999-000', 'ACTIVO', 'RIEL FULL EXTENSION') RETURNING *"
  });

  if (error) {
    console.error('FAILED with error:', error.message);
  } else {
    console.log('SUCCESS:', data);
    // Cleanup
    await (supabase.rpc as any)('exec_sql', {
      query_text: "DELETE FROM public.cabinet_products WHERE code = 'COC01-9999-000-0000'"
    });
  }
}

test();
