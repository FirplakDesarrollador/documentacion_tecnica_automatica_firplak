import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config(); // defaults to cwd which is workspace root

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Checking families table schema...");
    const { data: types, error: err1 } = await supabase.from('families').select('product_type').not('product_type', 'is', null);
    if (err1) console.error(err1);
    else {
        const uniqueTypes = [...new Set(types.map(t => t.product_type))];
        console.log("Distinct Product Types:", uniqueTypes);
    }

    console.log("\nChecking ref_attrs keys and values in product_references...");
    const { data: refs, error: err2 } = await supabase.from('product_references').select('ref_attrs, family_code').not('ref_attrs', 'is', null).limit(100);
    
    if (err2) console.error(err2);
    else {
        const keysMap: Record<string, Set<any>> = {};
        refs.forEach(r => {
            const attrs = r.ref_attrs;
            let parsed = attrs;
            if (typeof attrs === 'string') {
                try {
                    parsed = JSON.parse(attrs);
                } catch { parsed = {}; }
            }
            if (typeof parsed === 'object' && parsed !== null) {
                Object.keys(parsed).forEach(k => {
                    if (!keysMap[k]) keysMap[k] = new Set();
                    keysMap[k].add(parsed[k]);
                });
            }
        });
        
        console.log("Keys and Sample Values found in ref_attrs:");
        Object.keys(keysMap).forEach(k => {
            console.log(`- ${k}:`, Array.from(keysMap[k]).slice(0, 10));
        });
    }

    console.log("\nChecking colors table...");
    const { data: colors, error: err3 } = await supabase.from('colors').select('code_4dig');
    if (err3) console.error(err3);
    else {
        console.log(`Total colors in DB: ${colors.length}`);
    }
}
run();
