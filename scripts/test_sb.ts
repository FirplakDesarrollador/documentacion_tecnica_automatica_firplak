import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
    console.log('Testing connection to public.rules...');
    const { data, error } = await supabase.from('rules').select('*').limit(5);
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Rules sample:', data);
    }

    console.log('Testing connection to public.families...');
    const { data: fams, error: famErr } = await supabase.from('families').select('*').limit(5);
    if (famErr) {
        console.error('Error families:', famErr);
    } else {
        console.log('Families sample:', fams);
    }
})();
