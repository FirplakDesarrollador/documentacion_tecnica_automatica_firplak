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
    console.log('🔍 Iniciando generación de XLSX...');

    // 1. Leer CSV
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const allRows = parsed.data as any[];

    const excludedNoEtiqueta = allRows.filter(r => (r['Observacion'] || '').trim().toUpperCase() === 'NO NECESITA ETIQUETA');
    const otherFormatoEtiqueta = allRows.filter(r => (r['Observacion'] || '').trim().toUpperCase() === 'OTRO FORMATO ETIQUETA');
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
            SELECT 
                s.sku_complete, s.id as sku_id,
                v.id as version_id, v.version_code, v.version_attrs,
                r.id as reference_id, r.reference_code, r.family_code, r.product_name, r.ref_attrs
            FROM public.product_skus s
            JOIN public.product_versions v ON s.version_id = v.id
            JOIN public.product_references r ON v.reference_id = r.id
            WHERE s.sku_complete IN (${skuList})
        `;
        const result = await dbQuery(query);
        foundRecords = [...foundRecords, ...result];
    }
    const foundSkusMap = new Map(foundRecords.map(r => [r.sku_complete, r]));

    const colorsQuery = await dbQuery(`SELECT id, code_4dig FROM public.colors`);
    const colorsMap = new Map(colorsQuery.map((c: any) => [c.code_4dig, c.id]));

    // 3. Procesar filas y calcular agrupaciones
    const rowDataList: any[] = [];
    const referenceCounts = new Map<string, number>();

    // Primera pasada para contar ocurrencias
    rowsToProcess.forEach(r => {
        const sku = r['SKU Codigo SAP']?.trim();
        const parts = sku.split('-');
        const fam = parts[0]?.replace(/^V/, '') || '';
        const ref = parts[1] || '';
        const refKey = `${fam}-${ref}`;
        referenceCounts.set(refKey, (referenceCounts.get(refKey) || 0) + 1);
    });

    const processedReferences = new Set<string>();

    rowsToProcess.forEach((r, idx) => {
        const sku = r['SKU Codigo SAP']?.trim();
        const found = foundSkusMap.get(sku);
        const parts = sku.split('-');
        const fam = parts[0]?.replace(/^V/, '') || '';
        const ref = parts[1] || '';
        const ver = parts[2] || '';
        const col = parts[3] || '';

        const refKey = `${fam}-${ref}`;
        const isFirstRefOccurrence = !processedReferences.has(refKey);
        if (isFirstRefOccurrence) processedReferences.add(refKey);

        const desc = r['DescripciO del articulo'] || '';
        let productType = '';
        if (desc.toUpperCase().includes('MUEBLE')) productType = 'MUEBLE';
        else if (desc.toUpperCase().includes('GABINETE')) productType = 'GABINETE';

        const colorId = colorsMap.get(col);

        rowDataList.push({
            // A. Control
            row_number: idx + 1,
            validation_status: found ? 'EXISTENTE' : 'PENDIENTE',
            validation_errors: '',
            validation_warnings: '',
            source_observation: r['Observacion'] || '',
            import_action: found ? 'IGNORAR' : 'CREAR',
            existing_in_supabase: found ? 'SI' : 'NO',
            exclusion_reason: '',
            REFERENCE_GROUP_KEY: refKey,
            IS_FIRST_REFERENCE_OCCURRENCE: isFirstRefOccurrence ? 'SI' : 'NO',
            REFERENCE_GROUP_ROW_COUNT: referenceCounts.get(refKey),

            // B. Inferidas
            SKU_COMPLETE: sku,
            FAMILY_CODE: fam,
            REF_CODE: ref,
            VERSION_CODE: ver,
            COLOR_CODE: col,
            SAP_DESCRIPTION: desc,
            PRODUCT_TYPE: productType,
            DESIGNATION: '', 
            PRODUCT_NAME: '',

            // C. Manuales
            WIDTH_CM: '',
            DEPTH_CM: '',
            HEIGHT_CM: '',
            WEIGHT_KG: '',
            UNIT_OF_MEASURE: 'UN',

            // D. Ref Attrs
            REF_ATTR_rh: found ? (found.ref_attrs?.rh ?? '') : (desc.toUpperCase().includes('RH') ? true : ''),
            REF_ATTR_carb2: found ? (found.ref_attrs?.carb2 ?? '') : (desc.toUpperCase().includes('CARB2') ? true : ''),
            REF_ATTR_bisagras: found ? (found.ref_attrs?.bisagras ?? '') : '',
            REF_ATTR_canto_puertas: found ? (found.ref_attrs?.canto_puertas ?? '') : '',
            REF_ATTR_accessory_text: found ? (found.ref_attrs?.accessory_text ?? '') : '',
            REF_ATTR_armado_con_lvm: found ? (found.ref_attrs?.armado_con_lvm ?? '') : '',
            REF_ATTR_door_color_text: found ? (found.ref_attrs?.door_color_text ?? '') : '',
            REF_ATTR_product_type: found ? (found.ref_attrs?.product_type ?? '') : '',
            REF_ATTR_assembled_flag: found ? (found.ref_attrs?.assembled_flag ?? '') : '',

            // E. Ver Attrs
            VERSION_ATTR_isometric_path: found ? (found.version_attrs?.isometric_path ?? '') : '',
            VERSION_ATTR_isometric_asset_id: found ? (found.version_attrs?.isometric_asset_id ?? '') : '',
            VERSION_ATTR_private_label_flag: found ? (found.version_attrs?.private_label_flag ?? '') : '',
            VERSION_ATTR_private_label_client_id: found ? (found.version_attrs?.private_label_client_id ?? '') : '',
            VERSION_ATTR_private_label_client_name: found ? (found.version_attrs?.private_label_client_name ?? '') : '',
            VERSION_ATTR_accessory_text: found ? (found.version_attrs?.accessory_text ?? '') : '',

            // F. RH/CARB2/PUR
            RH: desc.toUpperCase().includes('RH') ? true : false,
            CARB2: desc.toUpperCase().includes('CARB2') ? true : false,
            PUR: desc.toUpperCase().includes('PUR') ? true : false,
            RH_SOURCE: desc.toUpperCase().includes('RH') ? 'DESCRIPCION' : '',
            CARB2_SOURCE: desc.toUpperCase().includes('CARB2') ? 'DESCRIPCION' : '',
            PUR_SOURCE: desc.toUpperCase().includes('PUR') ? 'DESCRIPCION' : '',
            RH_VALIDATION: '',
            CARB2_VALIDATION: '',
            PUR_VALIDATION: '',

            // G. Names
            NAME_ES_CURRENT_OR_GENERATED: found ? found.product_name : '',
            NAME_EN_CURRENT_OR_GENERATED: '',
            NAME_ES_REQUIRES_REVIEW: found ? 'NO' : 'SI',
            NAME_EN_REQUIRES_REVIEW: 'SI',
            NAME_GENERATION_NOTES: '',

            // H. Resources
            ISOMETRIC_SOURCE_PATH: '',
            ISOMETRIC_TARGET_PATH: '',
            ISOMETRIC_ASSET_ID: found ? (found.version_attrs?.isometric_asset_id ?? '') : '',
            ISOMETRIC_STATUS: found ? 'VINCULADO' : 'PENDIENTE',
            ISOMETRIC_NOTES: '',

            // I. Relation
            existing_family_id: '',
            existing_product_reference_id: found ? found.reference_id : '',
            existing_product_version_id: found ? found.version_id : '',
            existing_color_id: colorId || '',
            matched_reference_base: found ? found.reference_code : '',
            matched_version: found ? found.version_code : '',
            matched_color: found ? col : '',

            // J. Decision
            create_family: '',
            create_reference: (!found && isFirstRefOccurrence) ? 'SI' : 'NO',
            create_version: found ? 'NO' : 'SI',
            create_color: colorId ? 'NO' : 'SI',
            create_sku: found ? 'NO' : 'SI',
            reuse_existing_family: 'SI',
            reuse_existing_reference: (!found && isFirstRefOccurrence) ? 'NO' : 'SI',
            reuse_existing_version: found ? 'SI' : 'NO',
            reuse_existing_color: colorId ? 'SI' : 'NO'
        });
    });

    // 4. Crear XLSX
    console.log('Creando archivo Excel...');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('SKUs Faltantes', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    if (rowDataList.length > 0) {
        const columns = Object.keys(rowDataList[0]).map(key => ({
            header: key,
            key: key,
            width: 20
        }));
        worksheet.columns = columns;

        rowDataList.forEach(row => {
            worksheet.addRow(row);
        });

        // Estilos
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
        worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: rowDataList.length + 1, column: columns.length }
        };
    }

    const outputPath = path.join(OUTPUT_DIR, 'PLANTILLA_CARGA_MASIVA_FINAL.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    console.log(`✅ Archivo generado: artifacts/PLANTILLA_CARGA_MASIVA_FINAL.xlsx`);

    // Reporte final para la terminal
    const notFound = rowDataList.filter(r => r.existing_in_supabase === 'NO');
    const colorsMissing = notFound.filter(r => r.existing_color_id === '').length;
    
    const families = new Set();
    const refs = new Set();
    const vers = new Set();
    const colors = new Set();
    
    notFound.forEach(r => {
        families.add(r.FAMILY_CODE);
        refs.add(r.REFERENCE_GROUP_KEY);
        vers.add(r.VERSION_CODE);
        colors.add(r.COLOR_CODE);
    });

    console.log('--- RESUMEN FINAL ---');
    console.log({
        Total_CSV_Original: allRows.length,
        Excluidos_No_Necesita_Etiqueta: excludedNoEtiqueta.length,
        Incluidos_Otro_Formato: otherFormatoEtiqueta.length,
        Total_Validos_A_Procesar: rowDataList.length,
        SKUs_Existentes_Supabase: rowDataList.length - notFound.length,
        SKUs_Faltantes_A_Crear: notFound.length,
        Referencias_Unicas_Nuevas: refs.size,
        Familias_Nuevas: families.size,
        Colores_Faltantes_En_DB: colorsMissing
    });
}

main().catch(console.error);
