import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function updateFamiliesData() {
    console.log("=== UPDATING FAMILIES MASTER DATA (FIXED ARRAYS) ===\n");

    const data = [
        { code: 'BAN22', lines: '{"CLASS"}', zone: 'BAÑO', use: 'LAVAMANOS' },
        { code: 'ROP07', lines: '{"PRO"}', zone: 'ROPAS', use: 'LAVARROPAS' },
        { code: 'BAN05', lines: '{"ESSENTIAL","LIFE"}', zone: 'BAÑO', use: 'LAVAMANOS' },
        { code: 'BAN24', lines: '{"ESSENTIAL"}', zone: 'BAÑO', use: 'LAVAMANOS' },
        { code: 'BAN31', lines: '{}', zone: 'BAÑO', use: 'LAVAMANOS' },
        { code: 'BAN23', lines: '{"LIFE"}', zone: 'BAÑO', use: 'LAVAMANOS' },
        { code: 'COC01', lines: '{}', zone: 'COCINA', use: 'COCINA' },
        { code: 'BAN30', lines: '{}', zone: 'BAÑO', use: 'SANITARIO' },
        { code: 'ROP03', lines: '{}', zone: 'ROPAS', use: 'LAVARROPAS' },
        { code: 'BAN12', lines: '{"CLASS"}', zone: 'BAÑO', use: 'LAVAMANOS' }
    ];

    for (const row of data) {
        // Since our dbQuery is a bit limited in how it handles parameters (it stringifies everything),
        // we pass the postgres array literal as a string.
        await dbQuery(`
            UPDATE public.families 
            SET allowed_lines = $1, 
                zone_home = $2, 
                use_destination = $3
            WHERE family_code = $4
        `, [row.lines, row.zone, row.use, row.code]);
        console.log(`Updated ${row.code}: Lines=${row.lines}, Zone=${row.zone}, Use=${row.use}`);
    }

    console.log("\n=== DATA UPDATE COMPLETE ===");
}

updateFamiliesData().catch(e => console.error("FATAL:", e.message));
