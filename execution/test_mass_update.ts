import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const familyCode = 'BAN22';

    console.log(`\n--- Setup: Add 'pur' schema to ${familyCode} ---`);
    const attrDef = { label: 'PUR', type: 'enum', allowed_values: ['PUR', 'NA'], default_value: 'NA' };
    await supabase.rpc('rpc_add_attr_to_families', {
        p_family_codes: [familyCode],
        p_attr_key: 'pur',
        p_attr_def: attrDef,
        p_default_value: 'NA'
    });

    console.log(`\n--- Fetching a sample reference for ${familyCode} ---`);
    const { data: refs, error: errFam } = await supabase.from('product_references').select('id, ref_attrs').eq('family_code', familyCode).limit(1);
    if (errFam || !refs || refs.length === 0) {
        console.error("No refs found:", errFam);
        return;
    }
    const refId = refs[0].id;
    console.log(`Using reference: ${refId}`);

    console.log(`\n--- Test 1: Preview Mass Update with INVALID value ---`);
    const { data: prevInv, error: errPrevInv } = await supabase.rpc('rpc_preview_mass_update', {
        p_reference_ids: [refId],
        p_normal_updates: {},
        p_ref_attrs_updates: { pur: 'INVALID_VALUE' }
    });
    console.log(errPrevInv ? errPrevInv : JSON.stringify(prevInv, null, 2));

    console.log(`\n--- Test 2: Mass Update with INVALID value (Should throw) ---`);
    const { data: execInv, error: errExecInv } = await supabase.rpc('rpc_mass_update_references', {
        p_reference_ids: [refId],
        p_normal_updates: {},
        p_ref_attrs_updates: { pur: 'INVALID_VALUE' }
    });
    console.log(errExecInv ? errExecInv : execInv);

    console.log(`\n--- Test 3: Preview Mass Update with VALID value ---`);
    const { data: prevVal, error: errPrevVal } = await supabase.rpc('rpc_preview_mass_update', {
        p_reference_ids: [refId],
        p_normal_updates: { width_cm: 60.5 },
        p_ref_attrs_updates: { pur: 'PUR' }
    });
    console.log(errPrevVal ? errPrevVal : JSON.stringify(prevVal, null, 2));

    console.log(`\n--- Test 4: Mass Update with VALID value ---`);
    const { data: execVal, error: errExecVal } = await supabase.rpc('rpc_mass_update_references', {
        p_reference_ids: [refId],
        p_normal_updates: { width_cm: 60.5 },
        p_ref_attrs_updates: { pur: 'PUR' }
    });
    console.log(errExecVal ? errExecVal : execVal);

    console.log(`\n--- Test 5: Check ref after update ---`);
    const { data: refAfter, error: errAfter } = await supabase.from('product_references').select('width_cm, ref_attrs').eq('id', refId).single();
    console.log(errAfter ? errAfter : JSON.stringify(refAfter, null, 2));

    console.log(`\n--- Cleanup: Reverting width_cm and removing pur ---`);
    await supabase.from('product_references').update({ width_cm: null }).eq('id', refId);
    await supabase.rpc('rpc_remove_attr_from_families', { p_family_codes: [familyCode], p_attr_key: 'pur' });
}
run();
