import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function dbQuery(sql: string): Promise<any[]> {
    const { data, error } = await (supabase.rpc as any)('exec_sql', { query_text: sql });
    if (error) throw new Error(`DB Error: ${error.message}`);
    return Array.isArray(data) ? data : [];
}

async function main() {
    console.log('=== VERIFICACIÓN PREVIA ===\n');

    // 1. Verificar VBAN05-0114-151-0442 — el usuario dice que mi dato era incorrecto
    console.log('── VBAN05-0114-151-0442 (dato cuestionado) ──');
    const r1 = await dbQuery(`SELECT code, sap_description, final_name_es, accessory_text, cabinet_name, special_label FROM public.cabinet_products WHERE code = 'VBAN05-0114-151-0442'`);
    console.log(JSON.stringify(r1, null, 2));

    // Verificar también en product_skus
    const s1 = await dbQuery(`SELECT sku_complete, sap_description_original, final_complete_name_es FROM public.product_skus WHERE sku_complete = 'VBAN05-0114-151-0442'`);
    console.log('product_skus:', JSON.stringify(s1, null, 2));

    // 2. Verificar VBAN05-0097-000-0458
    console.log('\n── VBAN05-0097-000-0458 ──');
    const r2 = await dbQuery(`SELECT code, sap_description, final_name_es, accessory_text, cabinet_name FROM public.cabinet_products WHERE code = 'VBAN05-0097-000-0458'`);
    console.log(JSON.stringify(r2, null, 2));

    // 3. Verificar VBAN05-0131-* (SHAKER)
    console.log('\n── VBAN05-0131-* (SHAKER) ──');
    const r3 = await dbQuery(`SELECT code, sap_description, final_name_es, special_label, cabinet_name FROM public.cabinet_products WHERE code LIKE 'VBAN05-0131-%'`);
    console.log(JSON.stringify(r3, null, 2));

    // 4. Verificar VBAN12-0049-* (VITELLI/VITELI)
    console.log('\n── VBAN12-0049-* (VITELLI) ──');
    const r4 = await dbQuery(`SELECT code, sap_description, cabinet_name, final_name_es FROM public.cabinet_products WHERE code LIKE 'VBAN12-0049-%'`);
    console.log(JSON.stringify(r4, null, 2));

    // 5. Verificar VBAN12-0088/89/90 (MNJS NEGRAS)
    console.log('\n── VBAN12-0088/89/90-MRH-0484 (MNJS NEGRAS) ──');
    const r5 = await dbQuery(`SELECT code, sap_description, accessory_text, final_name_es FROM public.cabinet_products WHERE code IN ('VBAN12-0088-MRH-0484','VBAN12-0089-MRH-0484','VBAN12-0090-MRH-0484')`);
    console.log(JSON.stringify(r5, null, 2));

    // 6. Verificar VBAN05-0090-000-0452 (LONDON)
    console.log('\n── VBAN05-0090-000-0452 (LONDON) ──');
    const r6 = await dbQuery(`SELECT code, sap_description, special_label, final_name_es FROM public.cabinet_products WHERE code = 'VBAN05-0090-000-0452'`);
    console.log(JSON.stringify(r6, null, 2));
}

main().catch(console.error);
