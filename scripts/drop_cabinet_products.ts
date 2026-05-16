import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function main() {
    console.log("Comprobando existencia de cabinet_products...");
    const { data: check, error: checkErr } = await sb.rpc('exec_sql', {
        query_text: `SELECT table_name FROM information_schema.tables WHERE table_name = 'cabinet_products';`
    });
    
    console.log("Check result:", check);

    console.log("Ejecutando DROP TABLE public.cabinet_products CASCADE...");
    const { data: drop, error: dropErr } = await sb.rpc('exec_sql', {
        query_text: `DROP TABLE IF EXISTS public.cabinet_products CASCADE;`
    });

    if (dropErr) {
        console.error("Error al borrar la tabla:", dropErr);
    } else {
        console.log("Resultado del borrado:", drop);
        console.log("✅ Tabla cabinet_products eliminada satisfactoriamente.");
    }
}

main().catch(console.error);
