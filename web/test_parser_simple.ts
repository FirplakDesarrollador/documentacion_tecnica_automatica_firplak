import { dbQuery } from './src/lib/supabase';
import { parseProductCode } from './src/lib/engine/codeParser';

async function run() {
    try {
        console.log("Checking DB connection first...");
        const res = await dbQuery("SELECT 1 as test");
        console.log("DB Connection OK:", res);

        const code = 'VBAN05-0039-CHT-0439';
        const sapDesc = 'TEST';
        console.log(`Parsing code: ${code}`);
        const result = await parseProductCode(code, sapDesc);
        console.log("Result:", JSON.stringify(result, null, 2));

    } catch (e) {
        console.error("TEST FAILED:", e.message);
        if (e.stack) console.error(e.stack);
    }
}
run();
