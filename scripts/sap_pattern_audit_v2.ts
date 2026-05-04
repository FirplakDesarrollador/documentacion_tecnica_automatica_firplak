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
    return Array.isArray(data) ? data : (data?.rows || []);
}

// ============================================================
// AUDITORÍA V2 — Correcciones:
// - Compara product_skus.final_complete_name_es vs product_skus.sap_description_original
// - LVM = Lavamanos (designation), NO parte de ARMADO
// - ARMADO es minoría (~94), no mayoría
// - Listados explícitos para CARB2 y Manija Negra
// - Ignora cierre lento, suave (ya mapeados en accessory_text)
// ============================================================

async function runAuditV2() {
    console.log('\n════════════════════════════════════════════════════════');
    console.log('  AUDITORÍA V2 — product_skus: sap_description_original vs final_complete_name_es');
    console.log('════════════════════════════════════════════════════════\n');

    // ── QUERY 1: Datos principales desde product_skus ──
    console.log('📡 Cargando product_skus activos...');
    const skus: any[] = await dbQuery(`
        SELECT
            s.sku_complete,
            s.sap_description_original,
            s.final_complete_name_es,
            s.status
        FROM public.product_skus s
        WHERE s.status = 'ACTIVO'
          AND s.sap_description_original IS NOT NULL
          AND s.sap_description_original <> ''
    `);
    console.log(`✅ ${skus.length} SKUs activos con sap_description_original cargados.\n`);

    if (skus.length === 0) {
        console.log('⚠️  Sin datos en product_skus. Verificando cabinet_products como fallback...');
        const cpRows: any[] = await dbQuery(`
            SELECT code as sku_complete, sap_description as sap_description_original, 
                   final_name_es as final_complete_name_es, status
            FROM public.cabinet_products 
            WHERE status = 'ACTIVO' AND sap_description IS NOT NULL AND sap_description <> ''
        `);
        console.log(`Fallback: ${cpRows.length} registros desde cabinet_products.\n`);
        if (cpRows.length === 0) {
            console.log('Sin datos en ninguna tabla. Abortando.');
            return;
        }
        skus.push(...cpRows);
    }

    // Normalizar nombre de columna (puede ser final_complete_name_es o final_complete_name_es)
    for (const s of skus) {
        if (!s.final_complete_name_es && s.final_complete_name_es) {
            s.final_complete_name_es = s.final_complete_name_es;
        }
    }

    // ── QUERY 2: Verificar conteo real de ARMADO en cabinet_products ──
    console.log('📡 Verificando conteo real de ARMADO en cabinet_products...');
    const armadoCount: any[] = await dbQuery(`
        SELECT COUNT(*) as total 
        FROM public.cabinet_products 
        WHERE status = 'ACTIVO' 
          AND sap_description ILIKE '%ARMADO%'
          AND sap_description NOT ILIKE '%ARMADO CON LVM%'
          AND sap_description NOT ILIKE '%ARMADO CON LAVAMANOS%'
    `);
    const armadoRealCount = armadoCount[0]?.total || 0;

    const armadoConLVM: any[] = await dbQuery(`
        SELECT COUNT(*) as total 
        FROM public.cabinet_products 
        WHERE status = 'ACTIVO' 
          AND sap_description ILIKE '%ARMADO CON LVM%'
    `);
    const armadoConLVMCount = armadoConLVM[0]?.total || 0;

    console.log(`  → ARMADO sin LVM (real armado): ${armadoRealCount}`);
    console.log(`  → ARMADO CON LVM (= designation lavamanos): ${armadoConLVMCount}`);
    console.log('');

    // ── ANÁLISIS PRINCIPAL ──
    console.log('═══════════════════════════════════════════════════════');
    console.log(' BLOQUE A — PATRONES SEMÁNTICOS: sap_description_original vs final_complete_name_es');
    console.log('═══════════════════════════════════════════════════════\n');

    // ---- CARB2: listado explícito ----
    console.log('── CARB2 / CARB 2 ──');
    const carb2List: { sku: string; sap: string; final: string }[] = [];
    for (const s of skus) {
        const sap = (s.sap_description_original || '').toUpperCase();
        const final = (s.final_complete_name_es || '').toUpperCase();
        if (/CARB\s*2/i.test(sap) && !/CARB\s*2/i.test(final)) {
            carb2List.push({ sku: s.sku_complete, sap: s.sap_description_original, final: s.final_complete_name_es || '' });
        }
    }
    if (carb2List.length > 0) {
        console.log(`🔴 ${carb2List.length} SKUs con CARB2 en SAP pero NO en nombre final:\n`);
        for (const c of carb2List) {
            console.log(`  SKU: ${c.sku}`);
            console.log(`  SAP: ${c.sap}`);
            console.log(`  FIN: ${c.final}`);
            console.log('');
        }
    } else {
        console.log('✅ Todos los CARB2 están reflejados en nombre final.\n');
    }

    // ---- MANIJA NEGRA: listado explícito ----
    console.log('── MANIJA NEGRA ──');
    const manijaNegra: { sku: string; sap: string; final: string }[] = [];
    for (const s of skus) {
        const sap = (s.sap_description_original || '').toUpperCase();
        const final = (s.final_complete_name_es || '').toUpperCase();
        if (/MANIJA\s+NEGRA/i.test(sap)) {
            const inFinal = /MANIJA\s+NEGRA/i.test(final);
            manijaNegra.push({ sku: s.sku_complete, sap: s.sap_description_original, final: s.final_complete_name_es || '' });
            console.log(`  ${inFinal ? '✅' : '🔴'} SKU: ${s.sku_complete}`);
            console.log(`     SAP: ${s.sap_description_original}`);
            console.log(`     FIN: ${s.final_complete_name_es || '(vacío)'}`);
            console.log('');
        }
    }
    if (manijaNegra.length === 0) console.log('  Sin resultados.\n');

    // ---- SIN MANIJAS: verificar que esté en final ----
    console.log('── SIN MANIJAS ──');
    for (const s of skus) {
        const sap = (s.sap_description_original || '').toUpperCase();
        const final = (s.final_complete_name_es || '').toUpperCase();
        if (/SIN\s+MANIJA/i.test(sap)) {
            const inFinal = /SIN\s+MANIJA/i.test(final);
            console.log(`  ${inFinal ? '✅' : '🔴'} SKU: ${s.sku_complete}`);
            console.log(`     SAP: ${s.sap_description_original}`);
            console.log(`     FIN: ${s.final_complete_name_es || '(vacío)'}`);
            console.log('');
        }
    }

    // ---- RH: verificar en nombre final ----
    console.log('── RH ──');
    let rhOk = 0, rhMiss = 0;
    const rhMissExamples: string[] = [];
    for (const s of skus) {
        const sap = (s.sap_description_original || '').toUpperCase();
        const final = (s.final_complete_name_es || '').toUpperCase();
        if (/\bRH\b/.test(sap)) {
            if (/\bRH\b/.test(final)) { rhOk++; }
            else { rhMiss++; if (rhMissExamples.length < 5) rhMissExamples.push(`${s.sku_complete} | SAP: ${s.sap_description_original} | FIN: ${s.final_complete_name_es}`); }
        }
    }
    console.log(`  ✅ En nombre final: ${rhOk} | 🔴 Faltante: ${rhMiss}`);
    if (rhMiss > 0) { for (const e of rhMissExamples) console.log(`     ${e}`); }
    console.log('');

    // ---- D-ACQUA: verificar en nombre final ----
    console.log('── D-ACQUA ──');
    let dacOk = 0, dacMiss = 0;
    const dacMissExamples: string[] = [];
    for (const s of skus) {
        const sap = (s.sap_description_original || '').toUpperCase();
        const final = (s.final_complete_name_es || '').toUpperCase();
        if (/ACQUA|D[-\s]ACQUA/.test(sap)) {
            if (/ACQUA/.test(final)) { dacOk++; }
            else { dacMiss++; if (dacMissExamples.length < 5) dacMissExamples.push(`${s.sku_complete} | SAP: ${s.sap_description_original} | FIN: ${s.final_complete_name_es}`); }
        }
    }
    console.log(`  ✅ En nombre final: ${dacOk} | 🔴 Faltante: ${dacMiss}`);
    if (dacMiss > 0) { for (const e of dacMissExamples) console.log(`     ${e}`); }
    console.log('');

    // ---- ARMADO (real, sin LVM) ----
    console.log('── ARMADO (excluyendo "ARMADO CON LVM") ──');
    let armOk = 0, armMiss = 0;
    const armMissExamples: string[] = [];
    for (const s of skus) {
        const sap = (s.sap_description_original || '').toUpperCase();
        const final = (s.final_complete_name_es || '').toUpperCase();
        if (/\bARMAD[OA]\b/.test(sap) && !/ARMAD[OA]\s+CON\s+LVM/.test(sap) && !/ARMAD[OA]\s+CON\s+LAVAMANOS/.test(sap)) {
            if (/\bARMAD[OA]\b/.test(final)) { armOk++; }
            else { armMiss++; if (armMissExamples.length < 10) armMissExamples.push(`${s.sku_complete} | SAP: ${s.sap_description_original}`); }
        }
    }
    console.log(`  Total ARMADO real en SAP: ${armOk + armMiss}`);
    console.log(`  ✅ En nombre final: ${armOk} | 🔴 Faltante: ${armMiss}`);
    if (armMiss > 0) { console.log('  Ejemplos faltantes:'); for (const e of armMissExamples) console.log(`     ${e}`); }
    console.log('');

    // ---- 1.5MM / 1.5 MM ----
    console.log('── 1.5MM / 1.5 MM ──');
    let mmOk = 0, mmMiss = 0;
    const mmMissExamples: string[] = [];
    for (const s of skus) {
        const sap = (s.sap_description_original || '').toUpperCase();
        const final = (s.final_complete_name_es || '').toUpperCase();
        if (/1[\.,]5\s*MM/.test(sap)) {
            if (/1[\.,]5\s*MM/.test(final)) { mmOk++; }
            else { mmMiss++; if (mmMissExamples.length < 5) mmMissExamples.push(`${s.sku_complete} | SAP: ${s.sap_description_original} | FIN: ${s.final_complete_name_es}`); }
        }
    }
    console.log(`  ✅ En nombre final: ${mmOk} | 🔴 Faltante: ${mmMiss}`);
    if (mmMiss > 0) { for (const e of mmMissExamples) console.log(`     ${e}`); }
    console.log('');

    // ── BLOQUE B: Tokens libres (corregido) ──
    console.log('═══════════════════════════════════════════════════════');
    console.log(' BLOQUE B — TOKENS EN SAP NO REFLEJADOS EN NOMBRE FINAL');
    console.log(' (Ignorando: colores, LVM, cierre lento, suave, medidas)');
    console.log('═══════════════════════════════════════════════════════\n');

    // Tokens a ignorar completamente
    const IGNORE = new Set([
        'MUEBLE','MUEBLES','PARA','CON','SIN','LA','EL','DE','Y','EN','DEL',
        'X','CM','MM','UNA','UNO','LOS','LAS','SUS','POR','QUE','COD','NUM','REF','MOD',
        // LVM ya se sabe que es designation
        'LVM','LAVAMANOS',
        // Cierre lento / suave — ya mapeados en accessory_text
        'CIERRE','LENTO','SUAVE','SOFT','CLOSE',
        // Armado con LVM — ya entendido
        'ARMADO','ARMADA',
        // Canto — ya mapeado
        'CANTO','PUERTAS','PUERTA',
        // Ruido genérico
        'TIPO','BASE','SUPERIOR','INFERIOR','LATERAL','INTERIOR','EXTERIOR',
        'MEDIDA','COMERCIAL',
    ]);

    // Cargar tabla de colores para filtrar nombres de color
    const colorNames: any[] = await dbQuery(`SELECT UPPER(name_color_sap) as name FROM public.colors WHERE name_color_sap IS NOT NULL`);
    const colorTokens = new Set<string>();
    for (const c of colorNames) {
        const parts = (c.name || '').split(/[\s\/\-]+/);
        for (const p of parts) { if (p.length > 2) colorTokens.add(p); }
    }

    const MEASURE_RE = /^\d+[.,]?\d*(X\d+[.,]?\d*)?$/;

    const freeTokenMap: Record<string, { count: number; examples: string[] }> = {};

    for (const s of skus) {
        const sap = (s.sap_description_original || '').toUpperCase();
        const final = (s.final_complete_name_es || '').toUpperCase();

        const tokens = sap.split(/[\s,\/\-+()]+/).filter(t =>
            t.length > 2 && !IGNORE.has(t) && !MEASURE_RE.test(t) && !colorTokens.has(t)
        );

        for (const tok of tokens) {
            if (!final.includes(tok)) {
                if (!freeTokenMap[tok]) freeTokenMap[tok] = { count: 0, examples: [] };
                freeTokenMap[tok].count++;
                if (freeTokenMap[tok].examples.length < 3) freeTokenMap[tok].examples.push(s.sku_complete);
            }
        }
    }

    const topFree = Object.entries(freeTokenMap)
        .filter(([, v]) => v.count >= 3)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 30);

    if (topFree.length > 0) {
        console.log('TOKEN'.padEnd(24) + 'FREQ'.padEnd(8) + 'EJEMPLOS');
        console.log('─'.repeat(70));
        for (const [tok, data] of topFree) {
            console.log(`${tok.padEnd(24)}${String(data.count).padEnd(8)}${data.examples.join(', ')}`);
        }
    } else {
        console.log('✅ Sin tokens significativos no reflejados.');
    }

    // ── RESUMEN ──
    console.log('\n════════════════════════════════════════════════════════');
    console.log(' RESUMEN');
    console.log('════════════════════════════════════════════════════════\n');
    console.log(`Total SKUs analizados:         ${skus.length}`);
    console.log(`ARMADO real (sin LVM) en CP:    ~${armadoRealCount}`);
    console.log(`ARMADO CON LVM en CP:           ~${armadoConLVMCount} (= designation Lavamanos, NO es flag armado)`);
    console.log(`CARB2 faltante en nombre final: ${carb2List.length}`);
    console.log(`Manija Negra encontrados:       ${manijaNegra.length}`);
    console.log(`Tokens libres (freq ≥ 3):       ${topFree.length}`);
    console.log('\n✅ Auditoría V2 completada. Sin modificaciones aplicadas.');
}

runAuditV2().catch(console.error);
