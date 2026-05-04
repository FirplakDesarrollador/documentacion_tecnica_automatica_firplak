import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

(async () => {
    console.log('Fetching rules related to commercial_measure or name components...');
    const { data: rules, error } = await sb
        .from('rules')
        .select('*')
        .or('action_payload.ilike.%commercial_measure%,rule_type.eq.name_component')
        .order('priority', { ascending: true });
    
    if (error) {
        console.error('Error fetching rules:', error.message);
        return;
    }

    console.log(`Found ${rules.length} rules.`);
    const cmRules = rules.filter(r => r.action_payload.includes('commercial_measure'));
    console.log('Rules with commercial_measure:', cmRules);
    
    const baseNameRules = rules.filter(r => r.priority < 50);
    console.log('Top priority naming rules (base components):', baseNameRules);
})();
