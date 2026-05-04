import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

(async () => {
    console.log('Fetching all rules from public.rules...');
    const { data: rules, error } = await sb
        .from('rules')
        .select('*');
    
    if (error) {
        console.error('Error fetching rules:', error.message);
        return;
    }

    console.log(`Fetched ${rules.length} rules.`);
    
    // Search for any rule that mentions commercial_measure
    const cmRules = rules.filter(r => 
        (r.action_payload && r.action_payload.toLowerCase().includes('commercial_measure')) ||
        (r.condition_expression && r.condition_expression.toLowerCase().includes('commercial_measure'))
    );
    
    if (cmRules.length > 0) {
        console.log('Rules mentioning commercial_measure:', cmRules);
    } else {
        console.log('No rules found mentioning commercial_measure.');
    }

    // Search for rules for MUEBLE COCINA
    const cocinaRules = rules.filter(r => 
        r.target_entity && (r.target_entity.includes('COCINA') || r.target_entity === 'product')
    ).sort((a, b) => a.priority - b.priority);
    
    console.log('Rules for COCINA or product:', cocinaRules.map(r => ({ id: r.id, priority: r.priority, payload: r.action_payload, condition: r.condition_expression })));
})();
