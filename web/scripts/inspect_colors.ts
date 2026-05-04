import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function inspectColors() {
    try {
        const res = await dbQuery("SELECT * FROM public.colors LIMIT 1;");
        console.log("Result type:", typeof res);
        console.log("Result content:", JSON.stringify(res, null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

inspectColors();
