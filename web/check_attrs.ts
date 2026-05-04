import { supabaseServer } from './src/lib/supabase';

async function run() {
    const { data } = await supabaseServer.from('product_references').select('reference_code, ref_attrs').eq('reference_code', '0093').limit(1);
    console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
