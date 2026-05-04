import { supabaseServer } from './src/lib/supabase';

async function run() {
    const { data, error } = await supabaseServer.from('v_ui_generate_list').select('sku_complete, accessory_text').limit(5);
    if (error) console.error(error);
    console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
