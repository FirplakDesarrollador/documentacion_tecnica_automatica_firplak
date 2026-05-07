import { dbQuery } from './src/lib/supabase';
async function run() {
    const cols = await dbQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'product_references'");
    console.log("product_references cols:", cols);
    const cols2 = await dbQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'v_ui_generate_list'");
    console.log("v_ui_generate_list cols:", cols2);
}
run();
