import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const CSV_PATH = path.resolve(process.cwd(), 'prisma/data/Artículos con RH candelaria mate 15abril26(Hoja2).csv');
const OUTPUT_DIR = path.resolve(process.cwd(), 'artifacts');

async function main() {
    console.log('🔍 Iniciando generación de XLSX Simplificado...');

    // 1. Leer CSV
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const allRows = parsed.data as any[];

    const excludedNoEtiqueta = allRows.filter(r => (r['Observacion'] || '').trim().toUpperCase() === 'NO NECESITA ETIQUETA');
    const rowsToProcess = allRows.filter(r => (r['Observacion'] || '').trim().toUpperCase() !== 'NO NECESITA ETIQUETA');

    const validSkus = rowsToProcess.map(r => r['SKU Codigo SAP']?.trim()).filter(Boolean);
    const uniqueSkusSet = new Set(validSkus);
    const uniqueSkus = Array.from(uniqueSkusSet);

    // 2. Traer info de la base de datos
    console.log('Consultando Supabase...');
    const CHUNK_SIZE = 500;
    let foundRecords: any[] = [];
    for (let i = 0; i < uniqueSkus.length; i += CHUNK_SIZE) {
        const chunk = uniqueSkus.slice(i, i + CHUNK_SIZE);
        const skuList = chunk.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
        const query = `
            SELECT s.sku_complete
            FROM public.product_skus s
            WHERE s.sku_complete IN (${skuList})
        `;
        const result = await dbQuery(query);
        foundRecords = [...foundRecords, ...result];
    }
    const foundSkusSet = new Set(foundRecords.map(r => r.sku_complete));

    const colorsQuery = await dbQuery(`SELECT id, code_4dig FROM public.colors`);
    const colorsSet = new Set(colorsQuery.map((c: any) => c.code_4dig));

    // 3. Procesar datos para las hojas
    const cargaRows: any[] = [];
    const diagnosticoRows: any[] = [];
    const referenceCounts = new Map<string, number>();

    // Primera pasada para contar referencias y separar datos
    rowsToProcess.forEach(r => {
        const sku = r['SKU Codigo SAP']?.trim();
        const parts = sku.split('-');
        const fam = parts[0]?.replace(/^V/, '') || '';
        const ref = parts[1] || '';
        const refKey = `${fam}-${ref}`;
        referenceCounts.set(refKey, (referenceCounts.get(refKey) || 0) + 1);
    });

    const processedReferences = new Set<string>();
    const colorsMissingSet = new Set<string>();
    const uniqueReferences = new Set<string>();
    const uniqueColors = new Set<string>();

    rowsToProcess.forEach((r, idx) => {
        const sku = r['SKU Codigo SAP']?.trim();
        const found = foundSkusSet.has(sku);
        const parts = sku.split('-');
        const fam = parts[0]?.replace(/^V/, '') || '';
        const ref = parts[1] || '';
        const ver = parts[2] || '';
        const col = parts[3] || '';
        
        uniqueColors.add(col);

        const refKey = `${fam}-${ref}`;
        if (!found) uniqueReferences.add(refKey);

        const isFirstRefOccurrence = !processedReferences.has(refKey);
        if (isFirstRefOccurrence) processedReferences.add(refKey);

        const desc = r['DescripciO del articulo'] || '';
        let productType = '';
        if (desc.toUpperCase().includes('MUEBLE')) productType = 'MUEBLE';
        else if (desc.toUpperCase().includes('GABINETE')) productType = 'GABINETE';

        const colorExists = colorsSet.has(col);
        if (!colorExists && !found) colorsMissingSet.add(col);

        let validationNotes = [];
        if (!found && !colorExists) validationNotes.push(`COLOR_NAME requerido porque el color ${col} no existe en Supabase.`);

        // Fila de Diagnóstico
        diagnosticoRows.push({
            SKU_COMPLETE: sku,
            FAMILIA_PARSEADA: fam,
            REFERENCIA_PARSEADA: ref,
            VERSION_PARSEADA: ver,
            COLOR_PARSEADO: col,
            REFERENCIA_AGRUPADA: refKey,
            CONTEO_SKUS_POR_REFERENCIA: referenceCounts.get(refKey),
            EXISTE_EN_SUPABASE: found ? 'SI' : 'NO',
            COLOR_EXISTE_EN_SUPABASE: colorExists ? 'SI' : 'NO',
            OBSERVACIONES_DIAGNOSTICO: validationNotes.join(' | ')
        });

        // Fila de Carga (solo los que no existen)
        if (!found) {
            cargaRows.push({
                // A. Identificación
                SKU_COMPLETE: sku,
                SAP_DESCRIPTION: desc,
                SOURCE_OBSERVATION: r['Observacion'] || '',

                // B. Datos manuales
                PRODUCT_NAME: '',
                PRODUCT_TYPE: productType,
                DESIGNATION: '',
                WIDTH_CM: '',
                DEPTH_CM: '',
                HEIGHT_CM: '',
                WEIGHT_KG: '',
                UNIT_OF_MEASURE: 'UN',

                // C. Color
                COLOR_NAME: '',

                // D. Atributos técnicos
                RH: desc.toUpperCase().includes('RH') ? true : false,
                CARB2: desc.toUpperCase().includes('CARB2') ? true : false,
                PUR: desc.toUpperCase().includes('PUR') ? true : false,

                // E. Recursos futuros
                ISOMETRIC_SOURCE_PATH: '',

                // F. Observaciones
                USER_NOTES: '',
                VALIDATION_NOTES: validationNotes.join(' | ')
            });
        }
    });

    // 4. Crear XLSX
    console.log('Creando archivo Excel...');
    const workbook = new ExcelJS.Workbook();
    
    // -- Hoja "Instrucciones" --
    const sheetInstrucciones = workbook.addWorksheet('Instrucciones');
    sheetInstrucciones.columns = [{ width: 100 }];
    const instructions = [
        'INSTRUCCIONES PARA LLENADO DE PLANTILLA DE CARGA MASIVA',
        '',
        '1. Llenar solo la hoja "Carga".',
        '2. No modificar la columna SKU_COMPLETE, es la llave principal.',
        '3. Completar las medidas (WIDTH_CM, DEPTH_CM, HEIGHT_CM) y el peso (WEIGHT_KG) con números enteros o decimales.',
        '4. Completar PRODUCT_NAME y DESIGNATION solo cuando haga falta (la lógica del sistema intentará generarlos si están vacíos, pero proveerlos evita errores).',
        '5. Completar COLOR_NAME solo si la columna VALIDATION_NOTES indica que el color no existe en base de datos.',
        '6. No intentar llenar nombres finales ES/EN manualmente (eso se gestiona en la lógica del motor).',
        '7. No llenar códigos partidos (Familia, Referencia, Versión, Color). El importador interno se encargará de partirlos a partir del SKU_COMPLETE.',
        '8. No modificar la hoja "Diagnóstico", es únicamente de consulta informativa.',
        '9. Los atributos RH, CARB2 y PUR ya están pre-inferidos desde la descripción. Puedes ajustarlos modificando VERDADERO/FALSO (TRUE/FALSE).'
    ];
    instructions.forEach(inst => sheetInstrucciones.addRow([inst]));
    sheetInstrucciones.getRow(1).font = { bold: true, size: 14 };

    // -- Hoja "Carga" --
    const sheetCarga = workbook.addWorksheet('Carga', { views: [{ state: 'frozen', ySplit: 1 }] });
    if (cargaRows.length > 0) {
        const columns = Object.keys(cargaRows[0]).map(key => ({
            header: key,
            key: key,
            width: 20
        }));
        // Ajustes de ancho específicos
        columns.find(c => c.key === 'SAP_DESCRIPTION')!.width = 45;
        columns.find(c => c.key === 'VALIDATION_NOTES')!.width = 50;
        columns.find(c => c.key === 'PRODUCT_NAME')!.width = 30;

        sheetCarga.columns = columns;

        cargaRows.forEach(row => {
            sheetCarga.addRow(row);
        });

        // Estilos
        sheetCarga.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheetCarga.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
        sheetCarga.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: cargaRows.length + 1, column: columns.length }
        };
    }

    // -- Hoja "Diagnóstico" --
    const sheetDiag = workbook.addWorksheet('Diagnóstico', { views: [{ state: 'frozen', ySplit: 1 }] });
    if (diagnosticoRows.length > 0) {
        const columnsDiag = Object.keys(diagnosticoRows[0]).map(key => ({
            header: key,
            key: key,
            width: 20
        }));
        columnsDiag.find(c => c.key === 'OBSERVACIONES_DIAGNOSTICO')!.width = 50;
        sheetDiag.columns = columnsDiag;

        diagnosticoRows.forEach(row => {
            sheetDiag.addRow(row);
        });

        sheetDiag.getRow(1).font = { bold: true };
        sheetDiag.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        sheetDiag.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: diagnosticoRows.length + 1, column: columnsDiag.length }
        };
    }

    const outputPath = path.join(OUTPUT_DIR, 'PLANTILLA_CARGA_MASIVA_SIMPLIFICADA.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    console.log(`✅ Archivo generado: artifacts/PLANTILLA_CARGA_MASIVA_SIMPLIFICADA.xlsx`);

    // Reporte para la terminal
    console.log('--- REPORTE FINAL ---');
    console.log(JSON.stringify({
        Total_SKUs_Hoja_Carga: cargaRows.length,
        Total_Referencias_Base_Unicas_A_Crear: uniqueReferences.size,
        Total_Colores_Unicos: uniqueColors.size,
        Colores_Que_No_Existen_Requieren_Nombre: Array.from(colorsMissingSet)
    }, null, 2));
}

main().catch(console.error);
