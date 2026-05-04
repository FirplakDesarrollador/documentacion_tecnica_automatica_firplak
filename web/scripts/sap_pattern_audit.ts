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
// CONOCIMIENTO DE NEGOCIO: Patrones semánticos conocidos
// ============================================================
const SEMANTIC_PATTERNS: {
    key: string;
    regex: RegExp;
    label: string;
    expectedField: string;
    checkFn: (p: any) => boolean;
    impacto: 'ALTO' | 'MEDIO' | 'BAJO';
}[] = [
    { key: 'RH',            regex: /\bRH\b/,                        label: 'RH (Manija Derecha)',      expectedField: 'cp.rh',             checkFn: (p) => p.rh === true || p.rh === 't',       impacto: 'ALTO' },
    { key: 'ACQUA',         regex: /ACQUA|D[-\s]ACQUA/,             label: 'D-ACQUA (Línea/Acabado)',  expectedField: 'cp.line/designation', checkFn: (p) => (p.final_name_es||'').toUpperCase().includes('ACQUA'), impacto: 'ALTO' },
    { key: 'SIN_MANIJAS',   regex: /SIN\s+MANIJA/,                  label: 'Sin Manijas',              expectedField: 'cp.accessory_text', checkFn: (p) => (p.accessory_text||'').toUpperCase().includes('SIN MANIJA'), impacto: 'ALTO' },
    { key: 'ARMADO',        regex: /\bARMADO\b|\bARMADA\b/,         label: 'Armado con LVM',           expectedField: 'cp.armado_con_lvm', checkFn: (p) => p.armado_con_lvm === true || p.armado_con_lvm === 't', impacto: 'ALTO' },
    { key: 'CIERRE_LENTO',  regex: /CIERRE\s+LENTO|SOFT\s+CLOSE/,  label: 'Cierre Lento',             expectedField: 'cp.bisagras/accessory_text', checkFn: (p) => (p.accessory_text||'').toUpperCase().includes('CIERRE') || (p.bisagras||'').toUpperCase().includes('CIERRE'), impacto: 'ALTO' },
    { key: 'CARB2',         regex: /CARB\s*2|CARB2/,                label: 'CARB2',                   expectedField: 'cp.carb2',          checkFn: (p) => p.carb2 === true || p.carb2 === 't', impacto: 'MEDIO' },
    { key: 'MANIJA_COD',    regex: /MANIJA\s*\w*\s*\d{3,}/,         label: 'Manija con código',        expectedField: 'cp.accessory_text', checkFn: (p) => /MANIJA\s*\w*\s*\d{3,}/.test((p.accessory_text||'').toUpperCase()), impacto: 'ALTO' },
    { key: 'MANIJA_NEGRA',  regex: /MANIJA\s+NEGRA/,                label: 'Manija Negra',             expectedField: 'cp.accessory_text', checkFn: (p) => (p.accessory_text||'').toUpperCase().includes('NEGRA'), impacto: 'ALTO' },
    { key: 'VIDRIO',        regex: /\bVIDRIO\b|\bCRISTAL\b/,        label: 'Vidrio/Cristal',           expectedField: 'ref_attrs',         checkFn: (p) => (p.final_name_es||'').toUpperCase().includes('VIDRIO') || (p.final_name_es||'').toUpperCase().includes('CRISTAL'), impacto: 'MEDIO' },
    { key: 'ESPEJO',        regex: /\bESPEJO\b/,                    label: 'Espejo',                   expectedField: 'ref_attrs',         checkFn: (p) => (p.final_name_es||'').toUpperCase().includes('ESPEJO'), impacto: 'MEDIO' },
    { key: 'LACADO',        regex: /LACAD[OA]/,                     label: 'Lacado',                   expectedField: 'ref_attrs',         checkFn: (p) => (p.final_name_es||'').toUpperCase().includes('LACAD'), impacto: 'MEDIO' },
    { key: 'PERFORACIONES', regex: /PERFORAC/,                      label: 'Perforaciones',            expectedField: 'ref_attrs',         checkFn: (p) => (p.final_name_es||'').toUpperCase().includes('PERFORAC'), impacto: 'BAJO' },
    { key: 'COLOR_TEXTO',   regex: /\b(NEGRO|BLANCO|GRIS|CAFÉ|CAFE|CASTAÑO)\b/, label: 'Color en texto libre', expectedField: 'cp.door_color_text', checkFn: (p) => (p.door_color_text||'') !== '', impacto: 'MEDIO' },
    { key: 'VERSION_TEXTO', regex: /\b(POLOCK|PICASSO|NÓRDIC|NORDIC|ELEGANT)\b/, label: 'Nombre de versión/línea en SAP', expectedField: 'cp.cabinet_name', checkFn: (p) => (p.final_name_es||'').length > 0, impacto: 'ALTO' },
    { key: 'CANTO',         regex: /CANTO\s*(PUERTAS?)?/,           label: 'Canto de puertas',         expectedField: 'cp.canto_puertas', checkFn: (p) => !!(p.canto_puertas && p.canto_puertas !== 'NA' && p.canto_puertas !== ''), impacto: 'BAJO' },
];

// Tokens ruidosos — ignorar para el análisis libre de tokens
const NOISE_TOKENS = new Set([
    'MUEBLE','MUEBLES','PARA','CON','LA','EL','DE','Y','EN','DEL','X','CM','MM',
    'UNA','UNO','LOS','LAS','SUS','POR','QUE','COD','NUM','REF','MOD',
]);

// Medidas numéricas (ej: 60X48, 120CM)
const MEASURE_RE = /^\d+X\d+$|^\d+(CM|MM|KG)?$/;

// ============================================================
// CLASIFICAR un patrón según si el campo interno está cubierto
// ============================================================
function classify(found: boolean, inFinalName: boolean): string {
    if (found && inFinalName)  return 'CUBIERTO_VISIBLE';
    if (found && !inFinalName) return 'CUBIERTO_NO_VISIBLE';
    return 'NO_MAPEADO';
}

// ============================================================
// MAIN
// ============================================================
async function runAudit() {
    console.log('\n════════════════════════════════════════════════════════');
    console.log('  AUDITORÍA INTELIGENTE SAP → MODELO RELACIONAL (v1)');
    console.log('════════════════════════════════════════════════════════\n');

    // ── 1. UNA SOLA QUERY masiva ──────────────────────────────
    console.log('📡 Cargando catálogo activo...');
    const rows: any[] = await dbQuery(`
        SELECT
            cp.code, cp.familia_code, cp.ref_code, cp.version_code, cp.color_code,
            cp.cabinet_name, cp.designation, cp.line,
            cp.sap_description,
            cp.final_name_es,
            cp.rh, cp.armado_con_lvm, cp.carb2,
            cp.accessory_text, cp.door_color_text,
            cp.canto_puertas, cp.bisagras
        FROM public.cabinet_products cp
        WHERE cp.status = 'ACTIVO'
          AND cp.sap_description IS NOT NULL
          AND cp.sap_description <> ''
    `);

    console.log(`✅ ${rows.length} SKUs activos con descripción SAP cargados.\n`);
    if (rows.length === 0) {
        console.log('⚠️  Sin datos. Verifica que cabinet_products tenga registros activos con sap_description.');
        return;
    }

    // ── 2. ANÁLISIS SEMÁNTICO por patrones de negocio ─────────
    console.log('═══════════════════════════════════════════════════════');
    console.log(' BLOQUE A — ANÁLISIS SEMÁNTICO (Patrones de Negocio)');
    console.log('═══════════════════════════════════════════════════════\n');

    type SemanticResult = {
        count: number;
        cubierto: number;
        no_mapeado: number;
        cubierto_no_visible: number;
        examples: string[];
    };
    const semanticResults: Record<string, SemanticResult> = {};

    for (const p of SEMANTIC_PATTERNS) {
        semanticResults[p.key] = { count: 0, cubierto: 0, no_mapeado: 0, cubierto_no_visible: 0, examples: [] };
    }

    for (const row of rows) {
        const sap = (row.sap_description || '').toUpperCase();
        const finalName = (row.final_name_es || '').toUpperCase();

        for (const p of SEMANTIC_PATTERNS) {
            if (p.regex.test(sap)) {
                const r = semanticResults[p.key];
                r.count++;
                const fieldCovered = p.checkFn(row);
                const inFinalName = p.regex.test(finalName);
                const cls = classify(fieldCovered, inFinalName);
                if (cls === 'CUBIERTO_VISIBLE')    r.cubierto++;
                else if (cls === 'NO_MAPEADO')     r.no_mapeado++;
                else                               r.cubierto_no_visible++;
                if (r.examples.length < 4) r.examples.push(row.code);
            }
        }
    }

    for (const p of SEMANTIC_PATTERNS) {
        const r = semanticResults[p.key];
        if (r.count === 0) continue;

        const pctOk     = ((r.cubierto / r.count) * 100).toFixed(0);
        const pctHidden = ((r.cubierto_no_visible / r.count) * 100).toFixed(0);
        const pctMiss   = ((r.no_mapeado / r.count) * 100).toFixed(0);

        let estado = '✅ OK';
        if (r.no_mapeado > 0)          estado = '🔴 NO MAPEADO';
        else if (r.cubierto_no_visible > 0) estado = '🟡 CUBIERTO/NO VISIBLE';

        console.log(`[${p.impacto.padEnd(5)}] ${estado.padEnd(24)} | ${p.label}`);
        console.log(`         Ocurrencias: ${r.count} | OK: ${r.cubierto} (${pctOk}%) | No-visible: ${r.cubierto_no_visible} (${pctHidden}%) | Sin mapeo: ${r.no_mapeado} (${pctMiss}%)`);
        console.log(`         Campo esperado: ${p.expectedField}`);
        console.log(`         Ejemplos SKU: ${r.examples.join(', ')}`);
        console.log('');
    }

    // ── 3. ANÁLISIS LIBRE DE TOKENS ───────────────────────────
    console.log('═══════════════════════════════════════════════════════');
    console.log(' BLOQUE B — TOKENS LIBRES EN SAP NO REFLEJADOS EN NOMBRE FINAL');
    console.log('═══════════════════════════════════════════════════════\n');

    const freeTokenMap: Record<string, { count: number; examples: string[] }> = {};

    for (const row of rows) {
        const sap = (row.sap_description || '').toUpperCase();
        const finalName = (row.final_name_es || '').toUpperCase();
        const allKnown = [
            row.cabinet_name, row.designation, row.line,
            row.accessory_text, row.door_color_text, row.canto_puertas,
            row.familia_code, row.ref_code, row.version_code
        ].join(' ').toUpperCase();

        const context = finalName + ' ' + allKnown;
        const tokens = sap.split(/[\s,/\-+()]+/).filter(t =>
            t.length > 2 && !NOISE_TOKENS.has(t) && !MEASURE_RE.test(t)
        );

        for (const tok of tokens) {
            if (!context.includes(tok)) {
                if (!freeTokenMap[tok]) freeTokenMap[tok] = { count: 0, examples: [] };
                freeTokenMap[tok].count++;
                if (freeTokenMap[tok].examples.length < 3) freeTokenMap[tok].examples.push(row.code);
            }
        }
    }

    const topFree = Object.entries(freeTokenMap)
        .filter(([, v]) => v.count >= 3)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 40);

    console.log(`Top tokens en SAP no encontrados en nombre final ni en campos internos:\n`);
    console.log('TOKEN'.padEnd(24) + 'FRECUENCIA'.padEnd(14) + 'EJEMPLOS');
    console.log('─'.repeat(70));
    for (const [tok, data] of topFree) {
        console.log(`${tok.padEnd(24)}${String(data.count).padEnd(14)}${data.examples.join(', ')}`);
    }

    // ── 4. DISTRIBUCIÓN POR VERSIÓN ───────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(' BLOQUE C — VERSIONES CON MAYOR DIVERGENCIA SAP ↔ NOMBRE');
    console.log('═══════════════════════════════════════════════════════\n');

    const versionDivergence: Record<string, { total: number; divergentes: number }> = {};

    for (const row of rows) {
        const sap = (row.sap_description || '').toUpperCase();
        const final = (row.final_name_es || '').toUpperCase();
        const key = row.version_code || 'SIN_VERSION';
        if (!versionDivergence[key]) versionDivergence[key] = { total: 0, divergentes: 0 };
        versionDivergence[key].total++;
        // Divergencia = longitud de SAP mucho mayor al nombre final
        if (sap.length > final.length + 20) versionDivergence[key].divergentes++;
    }

    const sortedVer = Object.entries(versionDivergence)
        .map(([v, d]) => ({ version: v, ...d, pct: ((d.divergentes / d.total) * 100).toFixed(0) }))
        .filter(x => x.total >= 3)
        .sort((a, b) => b.divergentes - a.divergentes);

    console.log('VERSION'.padEnd(16) + 'TOTAL'.padEnd(10) + 'DIVERGEN.'.padEnd(12) + 'PCT');
    console.log('─'.repeat(50));
    for (const v of sortedVer.slice(0, 15)) {
        console.log(`${v.version.padEnd(16)}${String(v.total).padEnd(10)}${String(v.divergentes).padEnd(12)}${v.pct}%`);
    }

    // ── 5. RESUMEN ESTRATÉGICO ────────────────────────────────
    console.log('\n════════════════════════════════════════════════════════');
    console.log(' RESUMEN ESTRATÉGICO');
    console.log('════════════════════════════════════════════════════════\n');

    const totalConSAP = rows.length;
    const conFinalVacio = rows.filter(r => !r.final_name_es || r.final_name_es.trim() === '').length;
    const conDivergencia = rows.filter(r => {
        const s = (r.sap_description || '').length;
        const f = (r.final_name_es || '').length;
        return s > f + 20;
    }).length;

    console.log(`Total SKUs activos con SAP:        ${totalConSAP}`);
    console.log(`Sin nombre final generado:          ${conFinalVacio} (${((conFinalVacio/totalConSAP)*100).toFixed(1)}%)`);
    console.log(`Con divergencia alta SAP↔Nombre:   ${conDivergencia} (${((conDivergencia/totalConSAP)*100).toFixed(1)}%)`);
    console.log(`\nPatrones semánticos analizados:    ${SEMANTIC_PATTERNS.length}`);
    console.log(`Tokens libres únicos detectados:   ${Object.keys(freeTokenMap).length}`);
    console.log(`Tokens significativos (freq ≥ 3):  ${topFree.length}`);
    console.log('\n✅ Auditoría completada. Sin modificaciones aplicadas.');
}

runAudit().catch(console.error);
