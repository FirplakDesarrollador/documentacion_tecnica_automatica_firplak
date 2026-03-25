import { dbQuery } from './web/src/lib/supabase';

async function run() {
    try {
        const q = `SELECT * FROM public.clients WHERE name ILIKE '%CHILEMAT%'`;
        const res = await dbQuery(q);
        console.log("CLIENTS FOUND:");
        console.log(JSON.stringify(res, null, 2));

        const q2 = `SELECT name FROM public.clients LIMIT 20`;
        const allClients = await dbQuery(q2);
        console.log("\nALL CLIENTS (LIMIT 20):");
        console.log(JSON.stringify(allClients, null, 2));

    } catch (e) {
        console.error(e);
    }
}
run();
