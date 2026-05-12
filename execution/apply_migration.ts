import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Applying Migration...");
    const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '20260512000000_mass_edit_rpc.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Supabase JS doesn't support multi-statement raw execution easily unless via exec_sql RPC
    // Let's split by double empty lines or just run it via the exec_sql RPC
    
    // The user's project has an exec_sql RPC already deployed to their DB. 
    // Let's try that first.
    const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });
    
    if (error) {
        console.error("Error applying migration:", error);
    } else {
        console.log("Migration applied successfully!");
    }
}
run();
