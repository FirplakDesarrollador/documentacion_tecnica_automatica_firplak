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
    console.log('🔍 Starting Comprehensive Diagnosis...');

    // 1. Read and parse CSV
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const allRows = parsed.data as any[];

    // 2. Filters
    // Exclude only "NO NECESITA ETIQUETA"
    const excludedNoEtiqueta = allRows.filter(r => (r['Observacion'] || '').trim().toUpperCase() === 'NO NECESITA ETIQUETA');
    const otherFormatoEtiqueta = allRows.filter(r => (r['Observacion'] || '').trim().toUpperCase() === 'OTRO FORMATO ETIQUETA');
    
    const rowsToProcess = allRows.filter(r => (r['Observacion'] || '').trim().toUpperCase() !== 'NO NECESITA ETIQUETA');

    const validSkus = rowsToProcess.map(r => r['SKU Codigo SAP']?.trim()).filter(Boolean);
    const uniqueSkusSet = new Set(validSkus);
    const uniqueSkus = Array.from(uniqueSkusSet);

    // 3. Query Supabase
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
                r.family_code,
                r.product_name,
                r.ref_attrs,
                v.version_attrs
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

    // 4. Analyze NOT FOUND entities
    const families = new Set();
    const references = new Set();
    const versions = new Set();
    const colors = new Set();

    notFoundSkus.forEach(sku => {
        // Pattern: V-FAMILY-REFERENCE-VERSION-COLOR
        // Example: VBAN05-0010-000-0100
        const parts = sku.split('-');
        if (parts.length >= 4) {
            const fam = parts[0].replace(/^V/, '');
            const ref = parts[1];
            const ver = parts[2];
            const col = parts[3];
            families.add(fam);
            references.add(`${fam}-${ref}`);
            versions.add(`${fam}-${ref}-${ver}`);
            colors.add(col);
        }
    });

    // 5. Results Report
    const report = {
        counts: {
            total_raw: allRows.length,
            excluded_no_etiqueta: excludedNoEtiqueta.length,
            included_otro_formato: otherFormatoEtiqueta.length,
            valid_to_process: rowsToProcess.length,
            unique_skus: uniqueSkus.length,
            found_in_supabase: foundSkus.length,
            not_found_in_supabase: notFoundSkus.length
        },
        entities_not_found: {
            unique_families: families.size,
            unique_references: references.size,
            unique_versions: versions.size,
            unique_colors: colors.size
        },
        ref_attrs_keys: ["rh", "carb2", "bisagras", "canto_puertas", "accessory_text", "armado_con_lvm", "door_color_text", "product_type", "assembled_flag"],
        version_attrs_keys: ["isometric_path", "isometric_asset_id", "private_label_flag", "private_label_client_id", "private_label_client_name", "accessory_text"]
    };

    console.log('--- DIAGNOSIS REPORT ---');
    console.log(JSON.stringify(report, null, 2));

    // 6. Generate CSV
    const csvData: any[] = [];
    rowsToProcess.forEach((r, idx) => {
        const sku = r['SKU Codigo SAP']?.trim();
        const found = foundSkusMap.get(sku);
        const parts = sku.split('-');
        const fam = parts[0]?.replace(/^V/, '') || '';
        const ref = parts[1] || '';
        const ver = parts[2] || '';
        const col = parts[3] || '';

        const desc = r['DescripciO del articulo'] || '';
        let productType = '';
        if (desc.toUpperCase().includes('MUEBLE')) productType = 'MUEBLE';
        else if (desc.toUpperCase().includes('GABINETE')) productType = 'GABINETE';

        const row: any = {
            // Block A: Control
            'row_number': idx + 1,
            'validation_status': found ? 'EXISTENTE' : 'PENDIENTE',
            'validation_errors': '',
            'validation_warnings': '',
            'source_observation': r['Observacion'] || '',
            'import_action': found ? 'IGNORAR' : 'CREAR',
            'existing_in_supabase': found ? 'SI' : 'NO',
            'exclusion_reason': '',

            // Block B: Inferido
            'SKU_COMPLETE': sku,
            'FAMILY_CODE': fam,
            'REF_CODE': ref,
            'VERSION_CODE': ver,
            'COLOR_CODE': col,
            'SAP_DESCRIPTION': desc,
            'PRODUCT_TYPE': productType,
            'DESIGNATION': '', // A llenar o inferir mejor luego
            'PRODUCT_NAME': '', // A llenar

            // Block C: Manual
            'WIDTH_CM': '',
            'DEPTH_CM': '',
            'HEIGHT_CM': '',
            'WEIGHT_KG': '',
            'UNIT_OF_MEASURE': 'UN',

            // Block D: Ref Attrs
            'REF_ATTR_rh': found ? found.ref_attrs?.rh : (desc.toUpperCase().includes('RH') ? 'true' : 'false'),
            'REF_ATTR_carb2': found ? found.ref_attrs?.carb2 : (desc.toUpperCase().includes('CARB2') ? 'true' : 'false'),
            'REF_ATTR_bisagras': found ? found.ref_attrs?.bisagras : '',
            'REF_ATTR_canto_puertas': found ? found.ref_attrs?.canto_puertas : '',
            'REF_ATTR_accessory_text': found ? found.ref_attrs?.accessory_text : '',
            'REF_ATTR_armado_con_lvm': found ? found.ref_attrs?.armado_con_lvm : '',
            'REF_ATTR_door_color_text': found ? found.ref_attrs?.door_color_text : '',
            'REF_ATTR_product_type': found ? found.ref_attrs?.product_type : productType,
            'REF_ATTR_assembled_flag': found ? found.ref_attrs?.assembled_flag : '',

            // Block E: Ver Attrs
            'VERSION_ATTR_isometric_path': found ? found.version_attrs?.isometric_path : '',
            'VERSION_ATTR_isometric_asset_id': found ? found.version_attrs?.isometric_asset_id : '',
            'VERSION_ATTR_private_label_flag': found ? found.version_attrs?.private_label_flag : '',
            'VERSION_ATTR_private_label_client_id': found ? found.version_attrs?.private_label_client_id : '',
            'VERSION_ATTR_private_label_client_name': found ? found.version_attrs?.private_label_client_name : '',
            'VERSION_ATTR_accessory_text': found ? found.version_attrs?.accessory_text : '',

            // Block F: RH/CARB2/PUR
            'RH': desc.toUpperCase().includes('RH') ? 'true' : 'false',
            'CARB2': desc.toUpperCase().includes('CARB2') ? 'true' : 'false',
            'PUR': desc.toUpperCase().includes('PUR') ? 'true' : 'false',
            'RH_SOURCE': desc.toUpperCase().includes('RH') ? 'DESCRIPCION' : '',
            'CARB2_SOURCE': desc.toUpperCase().includes('CARB2') ? 'DESCRIPCION' : '',
            'PUR_SOURCE': desc.toUpperCase().includes('PUR') ? 'DESCRIPCION' : '',
            'RH_VALIDATION': '',
            'CARB2_VALIDATION': '',
            'PUR_VALIDATION': '',

            // Block G: Names
            'NAME_ES_CURRENT_OR_GENERATED': found ? found.product_name : '',
            'NAME_EN_CURRENT_OR_GENERATED': '',
            'NAME_ES_REQUIRES_REVIEW': found ? 'NO' : 'SI',
            'NAME_EN_REQUIRES_REVIEW': 'SI',
            'NAME_GENERATION_NOTES': '',

            // Block H: Resources
            'ISOMETRIC_SOURCE_PATH': '',
            'ISOMETRIC_TARGET_PATH': '',
            'ISOMETRIC_ASSET_ID': found ? found.version_attrs?.isometric_asset_id : '',
            'ISOMETRIC_STATUS': found ? 'VINCULADO' : 'PENDIENTE',
            'ISOMETRIC_NOTES': '',

            // Block I: Relation
            'existing_family_id': '',
            'existing_product_reference_id': found ? found.reference_id : '',
            'existing_product_version_id': found ? found.version_id : '',
            'existing_color_id': '',
            'matched_reference_base': found ? found.reference_code : '',
            'matched_version': found ? found.version_code : '',
            'matched_color': found ? col : '',

            // Block J: Decision
            'create_family': '',
            'create_reference': found ? 'NO' : 'SI',
            'create_version': found ? 'NO' : 'SI',
            'create_color': '',
            'create_sku': found ? 'NO' : 'SI',
            'reuse_existing_family': found ? 'SI' : 'PENDIENTE',
            'reuse_existing_reference': found ? 'SI' : 'NO',
            'reuse_existing_version': found ? 'SI' : 'NO',
            'reuse_existing_color': 'SI'
        };
        csvData.push(row);
    });

    const csvOutput = Papa.unparse(csvData);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'PLANTILLA_CARGA_MASIVA_P2.csv'), csvOutput);
    console.log('✅ Template generated: artifacts/PLANTILLA_CARGA_MASIVA_P2.csv');
}

runDiagnosis().catch(console.error);
