import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function execSql(sql: string): Promise<any> {
    const { data, error } = await (supabase.rpc as any)('exec_sql', { query_text: sql });
    if (error) throw new Error(`DB Error: ${error.message}`);
    return data;
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CORRECCIONES PUNTUALES — Auditoría V2');
    console.log('═══════════════════════════════════════════════════════\n');

    // ── 1. VBAN05-0097-000-0458: accessory_text → "MANIJA NEGRA 128" ──
    console.log('1. VBAN05-0097-000-0458: accessory_text → "MANIJA NEGRA 128"');
    await execSql(`UPDATE public.cabinet_products SET accessory_text = 'MANIJA NEGRA 128' WHERE code = 'VBAN05-0097-000-0458'`);
    console.log('   ✅ Actualizado\n');

    // ── 2. VBAN05-0114-151-0442: accessory_text → "MANIJA NEGRA 520" ──
    // SAP real: "MUEBLE MISUS LIFE LVM 79X48 GRACIA/SIKUANI-MANIJA NEGRA"
    // Actualmente tiene accessory_text = "RFE"
    // Se necesita que quede: el RFE se mantiene implícito y se agrega la manija
    console.log('2. VBAN05-0114-151-0442: accessory_text → "MANIJA NEGRA 520"');
    await execSql(`UPDATE public.cabinet_products SET accessory_text = 'MANIJA NEGRA 520' WHERE code = 'VBAN05-0114-151-0442'`);
    console.log('   ✅ Actualizado\n');

    // ── 3. VBAN12-0088/89/90-MRH-0484: accessory_text → "MANIJA NEGRA 520" ──
    // Actualmente tienen: "R OCULTO CIERRE LENTO"
    // El usuario dice que MNJS NEGRAS = MANIJA NEGRA 520
    // IMPORTANTE: No perder la info de "R OCULTO CIERRE LENTO" — concatenar
    console.log('3. VBAN12-0088/89/90-MRH-0484: accessory_text += " + MANIJA NEGRA 520"');
    const mnjsCodes = ['VBAN12-0088-MRH-0484', 'VBAN12-0089-MRH-0484', 'VBAN12-0090-MRH-0484'];
    for (const code of mnjsCodes) {
        await execSql(`UPDATE public.cabinet_products SET accessory_text = 'R OCULTO CIERRE LENTO + MANIJA NEGRA 520' WHERE code = '${code}'`);
        console.log(`   ✅ ${code} actualizado`);
    }
    console.log('');

    // ── 4. VBAN12-0049-*: cabinet_name "VITELI" → "VITELLI" ──
    console.log('4. VBAN12-0049-*: cabinet_name "VITELI" → "VITELLI"');
    const result4 = await execSql(`UPDATE public.cabinet_products SET cabinet_name = 'VITELLI' WHERE code LIKE 'VBAN12-0049-%' AND cabinet_name = 'VITELI'`);
    console.log(`   ✅ Actualizado\n`);

    // ── 5. VBAN05-0090-000-0452: special_label → "LONDON" ──
    console.log('5. VBAN05-0090-000-0452: special_label → "LONDON"');
    await execSql(`UPDATE public.cabinet_products SET special_label = 'LONDON' WHERE code = 'VBAN05-0090-000-0452'`);
    console.log('   ✅ Actualizado\n');

    // ══════════════════════════════════════
    // VERIFICACIÓN POST-FIX
    // ══════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════');
    console.log('  VERIFICACIÓN POST-FIX');
    console.log('═══════════════════════════════════════════════════════\n');

    const checks = [
        { code: 'VBAN05-0097-000-0458', fields: 'accessory_text' },
        { code: 'VBAN05-0114-151-0442', fields: 'accessory_text' },
        { code: 'VBAN12-0088-MRH-0484', fields: 'accessory_text' },
        { code: 'VBAN12-0089-MRH-0484', fields: 'accessory_text' },
        { code: 'VBAN12-0090-MRH-0484', fields: 'accessory_text' },
        { code: 'VBAN05-0090-000-0452', fields: 'special_label' },
    ];

    for (const chk of checks) {
        const r = await execSql(`SELECT code, ${chk.fields}, cabinet_name FROM public.cabinet_products WHERE code = '${chk.code}'`);
        console.log(`${chk.code}: ${JSON.stringify(r)}`);
    }

    // Verificar VITELLI
    const vitelli = await execSql(`SELECT code, cabinet_name FROM public.cabinet_products WHERE code LIKE 'VBAN12-0049-%'`);
    console.log('\nVITELLI check:');
    for (const v of (Array.isArray(vitelli) ? vitelli : [])) {
        console.log(`  ${v.code}: cabinet_name = "${v.cabinet_name}"`);
    }

    console.log('\n✅ Todas las correcciones aplicadas.');
}

main().catch(console.error);
