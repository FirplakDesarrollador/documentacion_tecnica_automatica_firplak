import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

(async () => {
    async function measure(name: string, queryFn: () => any) {
        const start = Date.now();
        const { data, error } = await queryFn();
        const end = Date.now();
        if (error) {
            console.error(`[${name}] Error:`, error.message);
        } else {
            console.log(`[${name}] Rows: ${data?.length || 0} | Time: ${end - start}ms`);
        }
    }

    console.log("--- RENDIMIENTO DE LA VISTA (Supabase Data API) ---");

    await measure('Sin Filtros (LIMIT 200)', () => 
        sb.from('v_ui_generate_list').select('*').limit(200)
    );

    await measure('Filtro Familia BAN05 (LIMIT 200)', () => 
        sb.from('v_ui_generate_list').select('*').eq('family_code', 'BAN05').limit(200)
    );

    await measure('Filtro Referencia 0131 (LIMIT 200)', () => 
        sb.from('v_ui_generate_list').select('*').eq('reference_code', '0131').limit(200)
    );

    await measure('Busqueda por SKU Exacto', () => 
        sb.from('v_ui_generate_list').select('*').eq('sku_complete', 'VBAN05-0131-000-0442').limit(1)
    );
    
    // Testing specific columns instead of select *
    await measure('Filtro Familia BAN05 (Solo ID y SKU)', () => 
        sb.from('v_ui_generate_list').select('id, sku_complete').eq('family_code', 'BAN05').limit(200)
    );

})();
