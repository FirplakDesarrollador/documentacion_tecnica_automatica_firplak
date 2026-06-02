import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching a sample family...");
    const { data: families, error: errFam } = await supabase.from('families').select('family_code').limit(1);
    if (errFam || !families || families.length === 0) {
        console.error("No families found:", errFam);
        return;
    }
    const familyCode = families[0].family_code;
    console.log(`Using family: ${familyCode}`);

    console.log(`\n--- Test 1: Preview Add 'pur' to ${familyCode} ---`);
    const { data: previewAdd, error: err1 } = await supabase.rpc('rpc_preview_add_attr_to_families', {
        p_family_codes: [familyCode],
        p_attr_key: 'pur'
    });
    console.log(err1 ? err1 : previewAdd);

    console.log(`\n--- Test 2: Add 'pur' to ${familyCode} ---`);
    const attrDef = { label: 'PUR', type: 'enum', allowed_values: ['PUR', 'NA'], default_value: 'NA' };
    const { error: err2 } = await supabase.rpc('rpc_add_attr_to_families', {
        p_family_codes: [familyCode],
        p_attr_key: 'pur',
        p_attr_def: attrDef,
        p_default_value: 'NA'
    });
    console.log(err2 ? err2 : "Success");

    console.log(`\n--- Test 3: Check refs after adding 'pur' ---`);
    const { data: refsAfterAdd, error: err3 } = await supabase.from('product_references').select('reference_code, ref_attrs').eq('family_code', familyCode).limit(3);
    console.log(err3 ? err3 : JSON.stringify(refsAfterAdd, null, 2));

    console.log(`\n--- Test 4: Preview Remove 'pur' from ${familyCode} ---`);
    const { data: previewRemove, error: err4 } = await supabase.rpc('rpc_preview_remove_attr_from_families', {
        p_family_codes: [familyCode],
        p_attr_key: 'pur'
    });
    console.log(err4 ? err4 : previewRemove);

    console.log(`\n--- Test 5: Remove 'pur' from ${familyCode} ---`);
    const { error: err5 } = await supabase.rpc('rpc_remove_attr_from_families', {
        p_family_codes: [familyCode],
        p_attr_key: 'pur'
    });
    console.log(err5 ? err5 : "Success");

    console.log(`\n--- Test 6: Check refs after removing 'pur' ---`);
    const { data: refsAfterRemove, error: err6 } = await supabase.from('product_references').select('reference_code, ref_attrs').eq('family_code', familyCode).limit(3);
    console.log(err6 ? err6 : JSON.stringify(refsAfterRemove, null, 2));

    // Cleanup: also remove from schema explicitly just in case
}
run();
