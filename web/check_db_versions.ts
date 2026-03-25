import { dbQuery } from './src/lib/supabase';

async function run() {
    try {
        const res = await dbQuery("SELECT code, description, automatic_rules FROM public.versions WHERE code='CHT'");
        console.log("DATABASE RECORD FOR CHT:");
        console.log(JSON.stringify(res, null, 2));

        const res2 = await dbQuery("SELECT code, description, automatic_rules FROM public.versions WHERE code='MRH'");
        console.log("\nDATABASE RECORD FOR MRH:");
        console.log(JSON.stringify(res2, null, 2));

    } catch (e) {
        console.error(e);
    }
}
run();
