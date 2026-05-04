import { supabaseServer } from './src/lib/supabase';

async function run() {
    const { data } = await supabaseServer.from('v_ui_generate_list').select('sku_complete, accessory_text').eq('sku_complete', 'VBAN05-0093-000-0437');
    console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
