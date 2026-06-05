import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function listTables() {
    try {
        const res = await dbQuery("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
        console.log("Tables:", JSON.stringify(res, null, 2));
    } catch (e: unknown) {
        console.error("Error:", errorMessage(e));
    }
}

listTables();
