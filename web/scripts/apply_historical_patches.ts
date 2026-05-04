import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';

async function applyPatches() {
    console.log("=== APLICANDO PARCHES DE DATOS HISTÓRICOS ===\n");

    // 1. BAN05-0111: Es SIN MANIJAS
    console.log("1. Parcheando BAN05-0111 (SIN MANIJAS)...");
    await dbQuery(`
        UPDATE public.product_references
        SET ref_attrs = ref_attrs || '{"accessory_text": "SIN MANIJAS"}'::jsonb
        WHERE family_code = 'BAN05' AND reference_code = '0111'
    `);
    console.log("   ✓ Actualizado.");

    // 2. BAN05-0108: Es D-ACQUA (Actualizaremos la designación o accesorio según corresponda)
    console.log("2. Parcheando BAN05-0108 (D-ACQUA)...");
    await dbQuery(`
        UPDATE public.product_references
        SET ref_attrs = ref_attrs || '{"accessory_text": "D-ACQUA"}'::jsonb
        WHERE family_code = 'BAN05' AND reference_code = '0108'
    `);
    console.log("   ✓ Actualizado.");

    // 3. BAN22-0082: Es MACAO y RH (Inconsistente en legacy, forzamos la normalización solicitada)
    console.log("3. Parcheando BAN22-0082 (MACAO, RH, ARMADO C/OSLO)...");
    await dbQuery(`
        UPDATE public.product_references
        SET product_name = 'MACAO',
            line = 'CLASS',
            ref_attrs = ref_attrs || '{"rh": "RH", "accessory_text": "CIERRE LENTO ARMADO C/OSLO"}'::jsonb
        WHERE family_code = 'BAN22' AND reference_code = '0082'
    `);
    console.log("   ✓ Actualizado.");

    // 4. Eliminar RFTEST
    console.log("4. Eliminando RFTEST...");
    await dbQuery(`DELETE FROM public.product_skus WHERE sku_complete LIKE '%RFTEST%'`);
    await dbQuery(`DELETE FROM public.product_versions WHERE reference_id IN (SELECT id FROM public.product_references WHERE reference_code = 'RFTEST')`);
    await dbQuery(`DELETE FROM public.product_references WHERE reference_code = 'RFTEST'`);
    console.log("   ✓ Eliminado.");

    console.log("\n=== PARCHES APLICADOS CORRECTAMENTE ===");
}

applyPatches().catch(console.error);
