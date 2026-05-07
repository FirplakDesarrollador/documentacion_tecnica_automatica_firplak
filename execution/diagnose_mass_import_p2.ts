import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import { dbQuery } from '../src/lib/supabase';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const CSV_PATH = path.resolve(process.cwd(), 'prisma/data/Artículos con RH candelaria mate 15abril26(Hoja2).csv');
const OUTPUT_DIR = path.resolve(process.cwd(), 'artifacts');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

async function runDiagnosis() {
    console.log('🔍 Starting Part 2 Diagnosis...');

    // 1. Read and parse CSV
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    
    const allRows = parsed.data as any[];

    // Filtrar: excluir "NO NECESITA ETIQUETA" y "OTRO FORMATO ETIQUETA"
    const excludedRows = allRows.filter(r => {
        const obs = (r['Observacion'] || '').trim().toUpperCase();
        return obs === 'NO NECESITA ETIQUETA' || obs === 'OTRO FORMATO ETIQUETA';
    });
    const rows = allRows.filter(r => {
        const obs = (r['Observacion'] || '').trim().toUpperCase();
        return obs !== 'NO NECESITA ETIQUETA' && obs !== 'OTRO FORMATO ETIQUETA';
    });

    const allSkus = rows.map(r => r['SKU Codigo SAP']?.trim()).filter(Boolean);
    
    const totalCsvRaw = allRows.length;
    const totalSkus = allSkus.length;
    const uniqueSkusSet = new Set(allSkus);
    const uniqueSkus = Array.from(uniqueSkusSet);

    console.log(`📊 CSV Statistics:
- Total filas CSV (bruto): ${totalCsvRaw}
- Excluidos (NO NECESITA ETIQUETA / OTRO FORMATO ETIQUETA): ${excludedRows.length}
- Total SKUs válidos: ${totalSkus}
- SKUs Únicos: ${uniqueSkus.length}
- SKUs Duplicados: ${totalSkus - uniqueSkus.length}`);

    // 2. Query Supabase for existing SKUs
    const CHUNK_SIZE = 500;
    let foundRecords: any[] = [];
    
    for (let i = 0; i < uniqueSkus.length; i += CHUNK_SIZE) {
        const chunk = uniqueSkus.slice(i, i + CHUNK_SIZE);
        const skuList = chunk.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
        const query = `
            SELECT 
                s.sku_complete, 
                s.id as sku_id,
                v.id as version_id,
                v.version_code,
                r.id as reference_id,
                r.reference_code,
                r.product_name,
                r.ref_attrs
            FROM public.product_skus s
            JOIN public.product_versions v ON s.version_id = v.id
            JOIN public.product_references r ON v.reference_id = r.id
            WHERE s.sku_complete IN (${skuList})
        `;
        const result = await dbQuery(query);
        foundRecords = [...foundRecords, ...result];
    }

    const foundSkusMap = new Map(foundRecords.map(r => [r.sku_complete, r]));
    const foundSkus = uniqueSkus.filter(sku => foundSkusMap.has(sku));
    const notFoundSkus = uniqueSkus.filter(sku => !foundSkusMap.has(sku));

    console.log(`\n🔍 Search Results:
- Found in Supabase: ${foundSkus.length}
- NOT found in Supabase: ${notFoundSkus.length}`);

    // 3. Group found SKUs by Reference
    const groupedByRef = new Map<string, {
        ref_id: string,
        ref_code: string,
        product_name: string,
        current_attrs: any,
        skus: string[]
    }>();

    foundSkus.forEach(sku => {
        const record = foundSkusMap.get(sku);
        const refId = record.reference_id;
        if (!groupedByRef.has(refId)) {
            groupedByRef.set(refId, {
                ref_id: refId,
                ref_code: record.reference_code,
                product_name: record.product_name,
                current_attrs: record.ref_attrs,
                skus: []
            });
        }
        groupedByRef.get(refId)!.skus.push(sku);
    });

    // 4. Generate Exportable Table for Not Found SKUs
    const notFoundTable = notFoundSkus.map(sku => {
        const originalRow = rows.find(r => r['SKU Codigo SAP']?.trim() === sku);
        return {
            SKU: sku,
            Description: originalRow?.['DescripciO del articulo'] || '',
            Observation: originalRow?.['Observacion'] || '',
            Isometric: originalRow?.['Isometrico'] || ''
        };
    });

    const notFoundCsv = Papa.unparse(notFoundTable);
    const notFoundFilePath = path.join(OUTPUT_DIR, 'skus_not_found_p2.csv');
    fs.writeFileSync(notFoundFilePath, notFoundCsv);

    // 5. Generate Report JSON/Markdown
    const report = {
        stats: {
            total_csv: totalSkus,
            unique_csv: uniqueSkus.length,
            duplicates_csv: totalSkus - uniqueSkus.length,
            found_in_db: foundSkus.length,
            not_found_in_db: notFoundSkus.length
        },
        found_references: Array.from(groupedByRef.values()).map(ref => ({
            reference_code: ref.ref_code,
            product_name: ref.product_name,
            sku_count: ref.skus.length,
            skus: ref.skus,
            current_attrs: ref.current_attrs
        })),
        not_found_sample: notFoundSkus.slice(0, 10),
        files: {
            not_found_csv: 'artifacts/skus_not_found_p2.csv'
        }
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, 'diagnosis_report_p2.json'), JSON.stringify(report, null, 2));

    // Print summary table
    console.log('\n📋 FOUND REFERENCES SUMMARY:');
    console.table(Array.from(groupedByRef.values()).map(ref => ({
        'Ref Code': ref.ref_code,
        'Name': ref.product_name,
        'SKUs Count': ref.skus.length
    })));

    console.log(`\n✅ Diagnosis complete. 
- Report saved to: artifacts/diagnosis_report_p2.json
- Missing SKUs CSV saved to: artifacts/skus_not_found_p2.csv`);
}

runDiagnosis().catch(console.error);
