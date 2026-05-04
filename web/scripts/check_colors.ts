import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function checkColors() {
    try {
        const sample = await dbQuery("SELECT * FROM public.colors LIMIT 5;");
        console.log("Sample colors:", JSON.stringify(sample, null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

checkColors();
