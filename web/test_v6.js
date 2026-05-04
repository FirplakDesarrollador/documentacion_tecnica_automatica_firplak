require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
    console.log("1. Testing specific SKUs in v_ui_generate_list...");
    const { data: d1, error: e1 } = await supabase.from('v_ui_generate_list').select('*').in('sku_complete', ['VCOC01-0128-000-0321', 'VBAN05-0140-000-0437']);
    console.log("SKU Test Error:", e1);
    console.log("SKU Test Rows:", d1?.length);
    if (d1 && d1.length > 0) {
        console.log("Sample Keys:", Object.keys(d1[0]));
        console.log("Product Type:", d1[0].product_type);
        console.log("Attrs existing:", !!d1[0].ref_attrs, !!d1[0].version_attrs, !!d1[0].sku_attrs);
    }
    
    console.log("\n2. Testing Product Type 'MUEBLE'...");
    const { data: d2, error: e2 } = await supabase.from('v_ui_generate_list').select('*').ilike('product_type', '%mueble%').limit(5);
    console.log("Type Test Error:", e2);
    console.log("Type Test Rows:", d2?.length);
    if (d2 && d2.length > 0) {
        console.log("Sample Product Types Found:", d2.map(r => r.product_type));
    }
}
test();
