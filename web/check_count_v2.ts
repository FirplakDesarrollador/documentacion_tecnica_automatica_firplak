import { dbQuery } from './src/lib/supabase';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the current directory (web/)
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
    try {
        console.log("Using Token:", process.env.SUPABASE_ACCESS_TOKEN ? "FOUND" : "NOT FOUND");
        const res = await dbQuery("SELECT count(*) as count FROM public.versions");
        console.log("Current count:", res[0].count);
        
        const res2 = await dbQuery("SELECT code, description FROM public.versions WHERE code IN ('CHT', 'MRH', '001')");
        console.log("Target rows:", JSON.stringify(res2, null, 2));

    } catch (e) {
        console.error(e);
    }
}
run();
