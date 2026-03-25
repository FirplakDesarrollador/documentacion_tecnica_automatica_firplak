import { dbQuery } from './src/lib/supabase';

async function run() {
    try {
        const res = await dbQuery("SELECT count(*) as count FROM public.versions");
        console.log("Current count:", res[0].count);
        
        const res2 = await dbQuery("SELECT * FROM public.versions LIMIT 5");
        console.log("Sample rows:", JSON.stringify(res2, null, 2));

    } catch (e) {
        console.error(e);
    }
}
run();
