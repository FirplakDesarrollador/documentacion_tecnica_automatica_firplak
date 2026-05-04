import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';
import { composeProductBySku } from '../src/lib/engine/product_composer';

const IGNORE_TOKENS = new Set([
    'MUEBLE', 'MUEBLES', 'PARA', 'CON', 'SIN', 'LVM', 'CONCEALED', 'SAGANO', 'POLAR', 'RUSTIK',
    'MODULAR', 'DE', 'LA', 'EL', 'Y', 'EN', 'DEL', 'X', 'CM', 'MM'
]);

async function audit() {
    console.log("=== INICIANDO AUDITORÍA INTELIGENTE SAP VS MODELO RELACIONAL ===\n");

    // 1. Obtener todos los SKUs activos con su descripción original
    const skus = await dbQuery(`
        SELECT s.sku_complete, s.sap_description_original, s.id as sku_id
        FROM public.product_skus s
        WHERE s.status = 'ACTIVO'
    `);

    console.log(`Procesando ${skus.length} SKUs...\n`);

    const missingPatterns: Record<string, { count: number, examples: string[] }> = {};

    for (const sku of skus) {
        const sap = (sku.sap_description_original || "").toUpperCase();
        if (!sap) continue;

        // Componer el producto para ver qué "entiende" el sistema actualmente
        const composed = await composeProductBySku(sku.sku_complete);
        if (!composed) continue;

        const composedText = [
            composed.final_complete_name_es,
            composed.accessory_text,
            composed.rh,
            composed.cabinet_name,
            composed.designation,
            composed.commercial_measure,
            composed.canto_puertas
        ].join(" ").toUpperCase();

        // Tokenizar la descripción SAP
        const tokens = sap.split(/[\s,/\-+]+/).filter(t => t.length > 2 && !IGNORE_TOKENS.has(t));

        for (const token of tokens) {
            // Ignorar medidas comerciales (ej: 48X38)
            if (/^\d+X\d+$/.test(token)) continue;

            // Si el token NO aparece en el texto compuesto
            if (!composedText.includes(token)) {
                if (!missingPatterns[token]) {
                    missingPatterns[token] = { count: 0, examples: [] };
                }
                missingPatterns[token].count++;
                if (missingPatterns[token].examples.length < 3) {
                    missingPatterns[token].examples.push(sku.sku_complete);
                }
            }
        }
    }

    // 2. Ordenar y agrupar resultados
    const sortedPatterns = Object.entries(missingPatterns)
        .sort((a, b) => b[1].count - a[1].count)
        .filter(p => p[1].count > 2); // Solo patrones con frecuencia significativa

    console.log("TOP HALLAZGOS (Tokens en SAP no reflejados en el modelo):\n");
    
    for (const [token, data] of sortedPatterns) {
        console.log(`TOKEN: ${token.padEnd(20)} | FRECUENCIA: ${data.count}`);
        console.log(`EJEMPLOS: ${data.examples.join(", ")}`);
        console.log("--------------------------------------------------");
    }
}

audit().catch(console.error);
