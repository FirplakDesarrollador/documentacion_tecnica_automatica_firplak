import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';
import { composeProductBySku, ComposedProduct } from '../src/lib/engine/product_composer';

const TEST_CASES = [
    { name: 'Mueble estándar', sku: 'VBAN05-0001-000-0387' },
    { name: 'Versión MRH', sku: 'VBAN05-0022-MRH-0484' },
    { name: 'Versión MDT (Mediterráneo)', sku: 'VBAN05-0141-MDT-0439' },
    { name: 'Versión PTT (Prototipo)', sku: 'VBAN12-0014-PTT-0437' },
    { name: 'Versión CME (Manija Especial)', sku: 'VBAN05-0130-CME-0496' }
];

async function getLegacyProduct(sku: string) {
    const rows = await dbQuery(`
        SELECT p.*, c.name_color_sap as expected_color 
        FROM public.cabinet_products p
        LEFT JOIN public.colors c ON p.color_code = c.code_4dig
        WHERE p.code = $1 LIMIT 1
    `, [sku]);
    return rows.length > 0 ? rows[0] : null;
}

function normalize(val: any): any {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val;
    return val;
}

function normalizeNumber(val: any): number | null {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return isNaN(num) ? null : Number(num.toFixed(2));
}

async function certify() {
    console.log("==================================================");
    console.log("PHASE 1B — COMPOSER CERTIFICATION");
    console.log("==================================================\n");

    let allPassed = true;

    for (const test of TEST_CASES) {
        console.log(`╔══════════════════════════════════════════════════════╗`);
        console.log(`║ CERTIFICATION REPORT: ${test.sku.padEnd(34, ' ')} ║`);
        console.log(`╠══════════════════════════════════════════════════════╣`);
        console.log(`║ Caso de negocio: ${test.name.padEnd(39, ' ')} ║`);

        const legacy = await getLegacyProduct(test.sku);
        if (!legacy) {
            console.log(`║ ⚠️ No existe en cabinet_products. Omitiendo.         ║`);
            console.log(`╚══════════════════════════════════════════════════════╝\n`);
            continue;
        }

        const composed = await composeProductBySku(test.sku);
        if (!composed) {
            console.log(`║ ❌ No encontrado por el Composer. FALLO.             ║`);
            console.log(`╚══════════════════════════════════════════════════════╝\n`);
            allPassed = false;
            continue;
        }

        const matches: string[] = [];
        const diffs: string[] = [];

        // Corrected Mappings
        const mappings: Array<{ legacyKey: string, composedKey: keyof ComposedProduct, type: 'string' | 'number' | 'boolean' }> = [
            { legacyKey: 'code', composedKey: 'code', type: 'string' },
            { legacyKey: 'product_type', composedKey: 'product_type', type: 'string' },
            { legacyKey: 'zone_home', composedKey: 'zone_home', type: 'string' },
            { legacyKey: 'use_destination', composedKey: 'use_destination', type: 'string' },
            { legacyKey: 'cabinet_name', composedKey: 'cabinet_name', type: 'string' }, 
            { legacyKey: 'designation', composedKey: 'designation', type: 'string' },
            { legacyKey: 'line', composedKey: 'line', type: 'string' },
            { legacyKey: 'commercial_measure', composedKey: 'commercial_measure', type: 'string' },
            { legacyKey: 'special_label', composedKey: 'special_label', type: 'string' },
            { legacyKey: 'width_cm', composedKey: 'width_cm', type: 'number' },
            { legacyKey: 'depth_cm', composedKey: 'depth_cm', type: 'number' },
            { legacyKey: 'height_cm', composedKey: 'height_cm', type: 'number' },
            { legacyKey: 'weight_kg', composedKey: 'weight_kg', type: 'number' },
            { legacyKey: 'stacking_max', composedKey: 'stacking_max', type: 'number' },
            { legacyKey: 'rh', composedKey: 'rh', type: 'string' },
            { legacyKey: 'carb2', composedKey: 'carb2', type: 'string' },
            { legacyKey: 'bisagras', composedKey: 'bisagras', type: 'string' },
            { legacyKey: 'canto_puertas', composedKey: 'canto_puertas', type: 'string' },
            { legacyKey: 'accessory_text', composedKey: 'accessory_text', type: 'string' },
            { legacyKey: 'door_color_text', composedKey: 'door_color_text', type: 'string' },
            { legacyKey: 'armado_con_lvm', composedKey: 'armado_con_lvm', type: 'string' },
            { legacyKey: 'sap_description', composedKey: 'sap_description', type: 'string' },
            { legacyKey: 'expected_color', composedKey: 'color_name', type: 'string' },
            { legacyKey: 'assembled_flag', composedKey: 'assembled_flag', type: 'boolean' }
        ];

        for (const m of mappings) {
            let lVal = legacy[m.legacyKey];
            let cVal = composed[m.composedKey];

            if (m.type === 'number') {
                lVal = normalizeNumber(lVal);
                cVal = normalizeNumber(cVal);
            } else if (m.type === 'boolean') {
                lVal = !!lVal;
                cVal = !!cVal;
            } else {
                lVal = normalize(lVal);
                cVal = normalize(cVal);
                
                if (lVal === 'NA' && cVal === null) lVal = null;
                if (cVal === 'NA' && lVal === null) cVal = null;
            }

            if (lVal === cVal) {
                matches.push(`✓ ${m.composedKey}`);
            } else {
                diffs.push(`❌ ${m.composedKey}: Legacy='${lVal}' | Composed='${cVal}'`);
            }
        }

        console.log(`║ MATCHING FIELDS (${matches.length}/${mappings.length})`.padEnd(55, ' ') + `║`);
        if (diffs.length > 0) {
            console.log(`║ DIFFERENCES (${diffs.length})`.padEnd(55, ' ') + `║`);
            for (const d of diffs) {
                console.log(`║   ${d.substring(0, 50)} ║`);
            }
            allPassed = false;
        } else {
            console.log(`║ DIFFERENCES (0)                                      ║`);
            console.log(`║   (none — CERTIFICATION PASSED)                      ║`);
        }

        console.log(`╚══════════════════════════════════════════════════════╝\n`);
    }

    if (allPassed) {
        console.log("✅ ALL CERTIFICATION CASES PASSED.");
    } else {
        console.log("❌ CERTIFICATION FAILED. Review differences before proceeding.");
    }
}

certify().catch(e => console.error("FATAL:", e.message));
