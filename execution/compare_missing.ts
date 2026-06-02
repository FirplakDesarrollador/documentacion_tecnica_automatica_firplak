import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const CSV_PATH = path.resolve(process.cwd(), 'prisma/data/Artículos con RH candelaria mate 15abril26(Hoja2).csv');

async function main() {
    // 1. Leer CSV y filtrar
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const allRows = parsed.data as any[];
    const rows = allRows.filter(r => (r['Observacion'] || '').trim().toUpperCase() !== 'NO NECESITA ETIQUETA');
    const skus = rows.map(r => r['SKU Codigo SAP']?.trim()).filter(Boolean);
    const uniqueSkus = Array.from(new Set(skus));

    // 2. Obtener SKUs existentes
    const foundSkus: string[] = [];
    for (let i = 0; i < uniqueSkus.length; i += 500) {
        const chunk = uniqueSkus.slice(i, i + 500);
        const list = chunk.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
        const res = await dbQuery(`SELECT sku_complete FROM product_skus WHERE sku_complete IN (${list})`);
        foundSkus.push(...res.map((r: any) => r.sku_complete));
    }
    const foundSet = new Set(foundSkus);
    const missingSkus = uniqueSkus.filter(s => !foundSet.has(s));

    // 3. Parsear SKUs faltantes
    const parsedSkus = missingSkus.map(sku => {
        const parts = sku.split('-');
        return {
            sku,
            family: parts[0]?.replace(/^V/, '') || '',
            ref: parts[1] || '',
            ver: parts[2] || '',
            color: parts[3] || ''
        };
    });

    // 4. Familias únicas de los faltantes
    const missingFamilies = new Set(parsedSkus.map(p => p.family));
    const existingFamilies = await dbQuery(`SELECT family_code FROM families`);
    const existingFamSet = new Set(existingFamilies.map((f: any) => f.family_code));
    
    console.log('=== FAMILIAS EN SKUs FALTANTES ===');
    for (const fam of Array.from(missingFamilies).sort()) {
        const exists = existingFamSet.has(fam);
        const count = parsedSkus.filter(p => p.family === fam).length;
        console.log(`${fam}: ${exists ? 'EXISTE' : '❌ NUEVA'} (${count} SKUs)`);
    }

    // 5. Version codes únicos de los faltantes
    const missingVersionCodes = new Set(parsedSkus.map(p => p.ver));
    const existingVersionRules = await dbQuery(`SELECT version_code FROM global_version_rules`);
    const existingVerSet = new Set(existingVersionRules.map((v: any) => v.version_code));

    console.log('\n=== VERSION CODES EN SKUs FALTANTES ===');
    for (const ver of Array.from(missingVersionCodes).sort()) {
        const exists = existingVerSet.has(ver);
        const count = parsedSkus.filter(p => p.ver === ver).length;
        console.log(`${ver}: ${exists ? 'EXISTE' : '❌ NO EXISTE en global_version_rules'} (${count} SKUs)`);
    }

    // 6. Listar todas las global_version_rules existentes
    console.log('\n=== GLOBAL_VERSION_RULES EXISTENTES ===');
    const allRules = await dbQuery(`SELECT version_code, version_description, status FROM global_version_rules ORDER BY version_code`);
    allRules.forEach((r: any) => console.log(`${r.version_code}: ${r.version_description} [${r.status}]`));

    // 7. Colores
    const missingColors = new Set(parsedSkus.map(p => p.color));
    const existingColors = await dbQuery(`SELECT code_4dig FROM colors`);
    const existingColSet = new Set(existingColors.map((c: any) => c.code_4dig));

    console.log('\n=== COLORES EN SKUs FALTANTES ===');
    for (const col of Array.from(missingColors).sort()) {
        const exists = existingColSet.has(col);
        const count = parsedSkus.filter(p => p.color === col).length;
        if (!exists) console.log(`${col}: ❌ NO EXISTE (${count} SKUs)`);
    }

    // 8. Resumen
    console.log('\n=== RESUMEN ===');
    console.log(`SKUs faltantes: ${missingSkus.length}`);
    console.log(`Familias únicas: ${missingFamilies.size}`);
    console.log(`Familias nuevas: ${Array.from(missingFamilies).filter(f => !existingFamSet.has(f)).join(', ') || 'NINGUNA'}`);
    console.log(`Version codes únicos: ${missingVersionCodes.size}`);
    console.log(`Version codes sin regla: ${Array.from(missingVersionCodes).filter(v => !existingVerSet.has(v)).join(', ') || 'NINGUNO'}`);
    console.log(`Colores sin registrar: ${Array.from(missingColors).filter(c => !existingColSet.has(c)).join(', ') || 'NINGUNO'}`);
}

main().catch(console.error);
