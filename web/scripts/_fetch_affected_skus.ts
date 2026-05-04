import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    const targetPatterns = [
        'VBAN05-0097-000-0458', 
        'VBAN05-0114-151-0442', 
        'VBAN12-0088-MRH-0484', 
        'VBAN12-0089-MRH-0484', 
        'VBAN12-0090-MRH-0484', 
        'VBAN12-0049-', 
        'VBAN05-0131-'
    ];

    const orConditions = targetPatterns.map(p => 
        p.endsWith('-') ? `code.ilike.${p}%` : `code.eq.${p}`
    ).join(',');

    const { data, error } = await sb.from('cabinet_products').select('id, code, final_name_es, special_label, accessory_text, cabinet_name, product_type').or(orConditions);

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Affected SKUs:', JSON.stringify(data, null, 2));
    }
}

main().catch(console.error);
