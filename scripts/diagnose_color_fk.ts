import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function diagnose() {
    console.log("=== DIAGNÓSTICO DE INTEGRIDAD COLOR ===\n");

    // 1. Check if code_4dig is UNIQUE in colors
    console.log("1. Constraints en colors:");
    const constraints = await dbQuery(`
        SELECT conname, contype, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = 'public.colors'::regclass
    `);
    console.log(JSON.stringify(constraints, null, 2));

    // 2. Check if there are duplicates in code_4dig
    console.log("\n2. Duplicados en colors.code_4dig:");
    const dupes = await dbQuery(`
        SELECT code_4dig, COUNT(*) as cnt 
        FROM public.colors 
        GROUP BY code_4dig 
        HAVING COUNT(*) > 1
    `);
    console.log(dupes.length === 0 ? "Ninguno ✓" : JSON.stringify(dupes, null, 2));

    // 3. Check if any product_skus.color_code doesn't exist in colors
    console.log("\n3. SKUs con color_code huérfano:");
    const orphans = await dbQuery(`
        SELECT s.color_code, COUNT(*) as cnt
        FROM public.product_skus s
        LEFT JOIN public.colors c ON s.color_code = c.code_4dig
        WHERE c.code_4dig IS NULL AND s.color_code IS NOT NULL
        GROUP BY s.color_code
    `);
    console.log(orphans.length === 0 ? "Ninguno ✓" : JSON.stringify(orphans, null, 2));

    // 4. Check existing FKs on product_skus
    console.log("\n4. FKs actuales en product_skus:");
    const fks = await dbQuery(`
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = 'public.product_skus'::regclass AND contype = 'f'
    `);
    console.log(JSON.stringify(fks, null, 2));

    // 5. Check columns in colors
    console.log("\n5. Columnas en colors:");
    const cols = await dbQuery(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'colors' ORDER BY ordinal_position`);
    console.log(cols.map((c: any) => `${c.column_name} (${c.data_type})`).join(', '));
}

diagnose().catch(e => console.error("FATAL:", e.message));
