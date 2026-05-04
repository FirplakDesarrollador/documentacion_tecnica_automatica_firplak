import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';
import { getFamilyFilters, getReferenceFilters } from '../src/lib/data/filters';

async function validateFilters() {
    console.log("=== VALIDACIÓN DE MIGRACIÓN DE FILTROS (1D) ===\n");

    // 1. Validar Familias
    console.log("1. Validando Familias...");
    const legacyFamilies = await dbQuery(`
        SELECT familia_code, MAX(name) as family_name
        FROM public.cabinet_products p
        LEFT JOIN public.familias f ON f.code = p.familia_code OR (f.code = SUBSTRING(p.familia_code FROM 2) AND p.familia_code ~ '^[VCP].+')
        WHERE p.status = 'ACTIVO'
        GROUP BY familia_code
    `);
    
    const newFamilies = await getFamilyFilters();
    
    console.log(`   Legacy: ${legacyFamilies.length} familias`);
    console.log(`   Nuevo:  ${newFamilies.length} familias`);

    const legacySet = new Set(legacyFamilies.map(f => f.familia_code));
    const newSet = new Set(newFamilies.map(f => f.value));

    const missing = [...legacySet].filter(x => !newSet.has(x));
    const extra = [...newSet].filter(x => !legacySet.has(x));

    if (missing.length === 0 && extra.length === 0) {
        console.log("   ✓ Paridad de familias alcanzada.");
    } else {
        if (missing.length > 0) console.log("   ❌ Faltan familias:", missing);
        if (extra.length > 0) console.log("   ⚠️ Familias extra en el nuevo sistema (esto puede ser normal si hay referencias activas sin SKUs):", extra);
    }

    // 2. Validar Referencias para una familia común (ej: BAN05)
    const testFamily = 'BAN05';
    console.log(`\n2. Validando Referencias para la familia ${testFamily}...`);
    
    const legacyRefs = await dbQuery(`
        SELECT ref_code, commercial_measure
        FROM public.cabinet_products
        WHERE status = 'ACTIVO' AND familia_code = '${testFamily}'
        GROUP BY ref_code, commercial_measure
    `);

    const newRefs = await getReferenceFilters([testFamily]);

    console.log(`   Legacy: ${legacyRefs.length} combinaciones Ref/Medida`);
    console.log(`   Nuevo:  ${newRefs.length} combinaciones Ref/Medida`);

    const legacyRefSet = new Set(legacyRefs.map(r => `${r.ref_code}|||${(r.commercial_measure || '').toUpperCase()}`));
    const newRefSet = new Set(newRefs.map(r => r.value.toUpperCase()));

    const missingRefs = [...legacyRefSet].filter(x => !newRefSet.has(x));
    const extraRefs = [...newRefSet].filter(x => !legacyRefSet.has(x));

    if (missingRefs.length === 0) {
        console.log("   ✓ Todas las referencias legacy están presentes.");
    } else {
        console.log("   ❌ Faltan referencias:", missingRefs);
    }

    if (extraRefs.length > 0) {
        console.log("   ⚠️ Hay referencias extra (probablemente referencias nuevas en el sistema relacional):", extraRefs.length);
    }

    console.log("\n=== VALIDACIÓN FINALIZADA ===");
}

validateFilters().catch(console.error);
