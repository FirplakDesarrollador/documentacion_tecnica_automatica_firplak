import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

(async () => {
    console.log('Fetching all families starting with V...');
    const { data: families, error } = await sb
        .from('families')
        .select('family_code, family_name')
        .like('family_code', 'V%');
    
    if (error) {
        console.error('Error fetching families:', error.message);
        return;
    }

    console.log('Families starting with V:', families);
})();
