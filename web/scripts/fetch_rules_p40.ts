import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
    console.log('Fetching rules priority 40-100...');
    const { data, error } = await supabase
        .from('rules')
        .select('*')
        .gte('priority', 40)
        .lte('priority', 100)
        .order('priority', { ascending: true });
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Rules 40-100:', data.map(r => ({ priority: r.priority, payload: r.action_payload, condition: r.condition_expression, target: r.target_entity })));
    }
})();
