/* eslint-disable no-console */
// @ts-nocheck
// Acceptance-style checks for Mass Import V6.
// This script:
// - Exercises template generation (local only)
// - Exercises preview validation scenarios (no DB writes)
// - Exercises a controlled execute + naming + cleanup (writes then deletes)

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { supabaseServer, dbQuery } = require('../src/lib/supabase');
const { buildMassImportTemplateXlsx } = require('../src/lib/massImport/template');
const { evaluateProductRules } = require('../src/lib/engine/ruleEvaluator');
const { translateProductToEnglish } = require('../src/lib/engine/translator');

async function getFamilyWithSchema() {
  const { data, error } = await supabaseServer
    .from('families')
    .select('family_code, ref_attrs_schema, product_type')
    .order('family_code', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  const fam = (data || []).find((f) => f.ref_attrs_schema && Object.keys(f.ref_attrs_schema).length > 0);
  if (!fam) throw new Error('No family with ref_attrs_schema found');
  return fam;
}

async function ensureColor(code4: string) {
  const { data, error } = await supabaseServer.from('colors').select('code_4dig').eq('code_4dig', code4).limit(1);
  if (error) throw new Error(error.message);
  return !!(data && data[0]);
}

async function ensureReferenceMissing(familyCode: string, refCode: string) {
  const { data, error } = await supabaseServer
    .from('product_references')
    .select('id')
    .eq('family_code', familyCode)
    .eq('reference_code', refCode)
    .limit(1);
  if (error) throw new Error(error.message);
  return !data?.[0];
}

async function main() {
  console.log('=== Mass Import V6 Acceptance ===');

  const famWithSchema = await getFamilyWithSchema();
  const sampleSchemaKeys = Object.keys(famWithSchema.ref_attrs_schema || {});
  const sampleKey = sampleSchemaKeys.find((k) => k !== 'rh') || sampleSchemaKeys[0] || 'rh';
  const sampleDef = famWithSchema.ref_attrs_schema?.[sampleKey] || {};
  const sampleAllowed = Array.isArray(sampleDef.allowed_values) ? sampleDef.allowed_values : null;
  const sampleValue = sampleAllowed && sampleAllowed.length > 0 ? sampleAllowed[0] : 'NA';
  console.log('Schema sample key for REF_ATTR test:', sampleKey, 'value:', sampleValue);

  // 1) Template generation (local output)
  const exampleRows = [
    { sku_complete: 'VCOC01-0170-000-0100', sap_description: 'TEST TEMPLATE 1' },
    { sku_complete: 'VCOC01-0170-000-0000', sap_description: 'TEST TEMPLATE 2' },
    { sku_complete: 'VCOC01-0170-000-9999', sap_description: 'TEST TEMPLATE 3' },
  ];
  const tmpl = await buildMassImportTemplateXlsx(exampleRows);
  const outPath = path.resolve(process.cwd(), 'artifacts', 'PLANTILLA_CARGA_MASIVA_V6_TEST.xlsx');
  fs.writeFileSync(outPath, tmpl.buffer);
  console.log('Template generated:', outPath);

  // 2) Preview with 3 SKUs (no writes)
  const { data: prevOk, error: prevOkErr } = await supabaseServer.rpc('bulk_import_products_v2', {
    p_payload: {
      rows: exampleRows.map((r) => ({
        sku_complete: r.sku_complete,
        sap_description_original: r.sap_description,
        product_name: 'TEST PRODUCT',
        designation: '',
        line: '',
        commercial_measure: '',
        special_label: 'NA',
        width_cm: null,
        depth_cm: null,
        height_cm: null,
        weight_kg: null,
        stacking_max: null,
        ref_attrs: { rh: 'NA' },
        version_attrs: {},
      })),
      families: [],
      colors: [],
    },
    p_dry_run: true,
    p_test_rollback: false,
  });
  if (prevOkErr) throw new Error(prevOkErr.message);
  console.log('Preview (3 SKUs) success:', prevOk?.success, 'rows:', prevOk?.rows?.length);

  // 2.1) Preview with an existing REF_ATTR key from families.ref_attrs_schema (positive case)
  const schemaTestSku = 'V' + String(famWithSchema.family_code) + '-0001-000-0100';
  const { data: prevAttrOk, error: prevAttrOkErr } = await supabaseServer.rpc('bulk_import_products_v2', {
    p_payload: {
      rows: [{ sku_complete: schemaTestSku, sap_description_original: 'X', product_name: 'X', special_label: 'NA', ref_attrs: { [sampleKey]: sampleValue }, version_attrs: {} }],
      families: [],
      colors: [],
    },
    p_dry_run: true,
    p_test_rollback: false,
  });
  if (prevAttrOkErr) throw new Error(prevAttrOkErr.message);
  console.log('Preview existing REF_ATTR key accepted?', (prevAttrOk?.rows?.[0]?.errors || []).length === 0);

  // 3) Preview with color new (expect error)
  const missingColor = '1369';
  const has1369 = await ensureColor(missingColor);
  console.log('Color 1369 exists?', has1369);
  const skuMissingColor = `VCOC01-0170-000-${missingColor}`;
  const { data: prevColor, error: prevColorErr } = await supabaseServer.rpc('bulk_import_products_v2', {
    p_payload: { rows: [{ sku_complete: skuMissingColor, sap_description_original: 'X', product_name: 'X', special_label: 'NA', ref_attrs: { rh: 'NA' }, version_attrs: {} }], families: [], colors: [] },
    p_dry_run: true,
    p_test_rollback: false,
  });
  if (prevColorErr) throw new Error(prevColorErr.message);
  console.log('Preview missing color has errors?', (prevColor?.rows?.[0]?.errors || []).length > 0);

  // 4) Preview family new without families sheet (expect error)
  const skuMissingFamily = 'VZZZ01-0001-000-0100';
  const { data: prevFam, error: prevFamErr } = await supabaseServer.rpc('bulk_import_products_v2', {
    p_payload: { rows: [{ sku_complete: skuMissingFamily, sap_description_original: 'X', product_name: 'X', special_label: 'NA', ref_attrs: { rh: 'NA' }, version_attrs: {} }], families: [], colors: [] },
    p_dry_run: true,
    p_test_rollback: false,
  });
  if (prevFamErr) throw new Error(prevFamErr.message);
  console.log('Preview missing family has errors?', (prevFam?.rows?.[0]?.errors || []).length > 0);

  // 5) Preview unknown REF_ATTR (expect error)
  const { data: prevUnknown, error: prevUnknownErr } = await supabaseServer.rpc('bulk_import_products_v2', {
    p_payload: {
      rows: [{ sku_complete: skuMissingFamily, sap_description_original: 'X', product_name: 'X', special_label: 'NA', ref_attrs: { inventado: 'X' }, version_attrs: {} }],
      families: [{ family_code: 'ZZZ01', family_name: 'ZZZ01', product_type: 'MUEBLE', manufacturing_process: 'FABRICADO', assembled_default: false, rh_default: false, allowed_lines: [] }],
      colors: [],
    },
    p_dry_run: true,
    p_test_rollback: false,
  });
  if (prevUnknownErr) throw new Error(prevUnknownErr.message);
  console.log('Preview unknown REF_ATTR has errors?', (prevUnknown?.rows?.[0]?.errors || []).length > 0);

  // 6) Preview invalid enum (expect error)
  const { data: prevEnum, error: prevEnumErr } = await supabaseServer.rpc('bulk_import_products_v2', {
    p_payload: {
      rows: [{ sku_complete: skuMissingFamily, sap_description_original: 'X', product_name: 'X', special_label: 'NA', ref_attrs: { rh: 'BADVALUE' }, version_attrs: {} }],
      families: [{ family_code: 'ZZZ01', family_name: 'ZZZ01', product_type: 'MUEBLE', manufacturing_process: 'FABRICADO', assembled_default: false, rh_default: false, allowed_lines: [] }],
      colors: [],
    },
    p_dry_run: true,
    p_test_rollback: false,
  });
  if (prevEnumErr) throw new Error(prevEnumErr.message);
  console.log('Preview invalid enum blocked?', (prevEnum?.rows?.[0]?.errors || []).length > 0);

  // 7) Controlled execute + naming + cleanup (writes then deletes)
  const fam = famWithSchema;
  const familyCode = String(fam.family_code);
  const vprefix = 'V' + familyCode;
  const color0100Ok = await ensureColor('0100');
  if (!color0100Ok) throw new Error('Color 0100 must exist for execute test');

  // Pick a ref code that does not exist (try a few)
  let refCode = '9001';
  for (let i = 9001; i < 9010; i++) {
    const ok = await ensureReferenceMissing(familyCode, String(i).padStart(4, '0'));
    if (ok) { refCode = String(i).padStart(4, '0'); break; }
  }
  const skuExecute = `${vprefix}-${refCode}-000-0100`;
  console.log('Execute test SKU:', skuExecute);

  const payloadExecute = {
    rows: [{
      sku_complete: skuExecute,
      sap_description_original: 'TEST EXECUTE',
      product_name: 'TEST MUEBLE',
      designation: '',
      line: '',
      commercial_measure: '',
      special_label: 'NA',
      width_cm: 10,
      depth_cm: 10,
      height_cm: 10,
      weight_kg: 1,
      stacking_max: null,
      ref_attrs: { rh: 'NA', carb2: 'NA' },
      version_attrs: {},
    }],
    families: [],
    colors: [],
  };

  const { data: execRes, error: execErr } = await supabaseServer.rpc('bulk_import_products_v2', {
    p_payload: payloadExecute,
    p_dry_run: false,
    p_test_rollback: false,
  });
  if (execErr) throw new Error(execErr.message);
  const row0 = execRes?.rows?.[0];
  const skuId = row0?.created_ids?.sku_id;
  const verId = row0?.created_ids?.version_id;
  const refId = row0?.created_ids?.reference_id;
  if (!skuId || !verId || !refId) throw new Error('Execute did not create expected IDs');

  const rules = await dbQuery('SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC') || [];
  const composedRows = await dbQuery('SELECT * FROM public.v_ui_generate_list WHERE id = $1 LIMIT 1', [skuId]);
  const composed = composedRows?.[0];
  if (!composed) throw new Error('Failed to fetch composed row from v_ui_generate_list after execute');

  const working = {
    code: composed.sku_complete,
    sap_description: composed.sap_description_original,
    product_type: composed.product_type,
    cabinet_name: composed.product_name,
    color_code: composed.color_code,
    rh_flag: String(composed.ref_attrs?.rh || '').toUpperCase() === 'RH',
    rh: composed.ref_attrs?.rh,
    assembled_flag: !!(composed.ref_attrs?.assembled_flag ?? composed.assembled_default),
    canto_puertas: composed.ref_attrs?.canto_puertas,
    carb2: composed.ref_attrs?.carb2,
    line: composed.line,
    use_destination: composed.use_destination,
    zone_home: composed.zone_home,
    commercial_measure: composed.commercial_measure,
    accessory_text: composed.ref_attrs?.accessory_text,
    designation: composed.designation,
    bisagras: composed.ref_attrs?.bisagras,
    special_label: composed.special_label,
    door_color_text: composed.ref_attrs?.door_color_text,
    private_label_client_name: composed.private_label_client_name,
  };

  const evalRes = evaluateProductRules(working, rules);
  const finalNameEs = evalRes.finalNameEs || '';
  const tr = await translateProductToEnglish({ ...evalRes.transformedProduct, final_name_es: finalNameEs }, working.product_type || 'MUEBLE', evalRes.activeVariableIds);
  const finalNameEn = tr.isValid ? tr.translatedName : '';

  const { data: applyRes, error: applyErr } = await supabaseServer.rpc('bulk_apply_names_v6', {
    p_updates: [{
      sku_id: skuId,
      version_id: verId,
      final_base_name_es: finalNameEs,
      final_base_name_en: finalNameEn,
      final_complete_name_es: finalNameEs,
      final_complete_name_en: finalNameEn,
      validation_status: finalNameEs && finalNameEn ? 'ready' : 'needs_review',
    }],
    p_test_rollback: false,
  });
  if (applyErr) throw new Error(applyErr.message);

  const check = await dbQuery(`SELECT id, final_complete_name_es FROM public.product_skus WHERE id = $1`, [skuId]);
  console.log('Naming persisted ES non-empty?', !!(check?.[0]?.final_complete_name_es));

  const { data: cleanRes, error: cleanErr } = await supabaseServer.rpc('bulk_cleanup_import_v6', {
    p_sku_ids: [skuId],
    p_version_ids: [verId],
    p_reference_ids: [refId],
  });
  if (cleanErr) throw new Error(cleanErr.message);
  console.log('Cleanup result:', cleanRes);

  const checkGone = await dbQuery(`SELECT count(*)::int as c FROM public.product_skus WHERE id = $1`, [skuId]);
  console.log('SKU removed after cleanup?', (checkGone?.[0]?.c || 0) === 0);

  console.log('=== DONE ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
