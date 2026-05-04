import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function createColorFK() {
    console.log("=== CREATING FK: product_skus.color_code → colors.code_4dig ===\n");

    try {
        await dbQuery(`
            ALTER TABLE public.product_skus 
            ADD CONSTRAINT fk_skus_color_code 
            FOREIGN KEY (color_code) REFERENCES public.colors(code_4dig)
        `);
        console.log("FK created successfully. ✓");

        // Verify
        const fks = await dbQuery(`
            SELECT conname, pg_get_constraintdef(oid) as def
            FROM pg_constraint
            WHERE conrelid = 'public.product_skus'::regclass AND contype = 'f'
        `);
        console.log("\nAll FKs on product_skus:");
        for (const fk of fks) {
            console.log(`  ${fk.conname}: ${fk.def}`);
        }
    } catch (e: any) {
        if (e.message.includes('already exists')) {
            console.log("FK already exists. ✓");
        } else {
            console.error("Error:", e.message);
        }
    }
}

createColorFK().catch(e => console.error("FATAL:", e.message));
