import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function main() {
    console.log("Actualizando variable {cabinet_name} a {product_name} en la tabla rules...");
    const { data: updateRes, error: updateErr } = await sb.rpc('exec_sql', {
        query_text: `UPDATE public.rules SET action_payload = REPLACE(action_payload, '{cabinet_name}', '{product_name}') WHERE action_payload LIKE '%{cabinet_name}%';`
    });
    
    if (updateErr) {
        console.error("Error al actualizar rules:", updateErr);
    } else {
        console.log("Tabla rules actualizada satisfactoriamente:", updateRes);
    }
}

main().catch(console.error);
