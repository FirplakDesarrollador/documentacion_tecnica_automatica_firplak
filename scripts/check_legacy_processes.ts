import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

(async () => {
    console.log('Checking for families with legacy manufacturing processes...');
    const { data: families, error } = await sb
        .from('families')
        .select('family_code, family_name, manufacturing_process')
        .in('manufacturing_process', ['FABRICADO', 'COMPRADO', 'ENSAMBLADO']);
    
    if (error) {
        console.error('Error fetching families:', error.message);
        return;
    }

    if (families && families.length > 0) {
        console.log('Found families with legacy processes:', families);
    } else {
        console.log('No families found with legacy manufacturing processes.');
    }
})();
