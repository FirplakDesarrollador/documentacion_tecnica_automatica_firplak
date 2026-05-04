import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testWith() {
    const query = `
        WITH t AS (
            SELECT 'test' as val
        )
        SELECT * FROM t
    `;
    const { data, error } = await (supabase.rpc as any)('exec_sql', { query_text: query });
    console.log('Error:', error);
    console.log('Data:', data);
}

testWith();
