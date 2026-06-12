'use server';

import { revalidatePath } from 'next/cache';
import { dbQuery, supabaseServer } from '@/lib/supabase';
import {
  buildEffectiveProductContext,
  canonicalizeOverrideAttrs,
  canonicalizeOverrideKey,
} from '@/lib/engine/effectiveProduct';
import { markNamingStaleForSkus, processNamingJobsInline } from '@/lib/engine/namingQueue';
import { assertRole } from '@/utils/auth/access';

type JsonRecord = Record<string, unknown>;

type SkuEditorFilters = {
  familyCode?: string;
  referenceCode?: string;
  versionCode?: string;
  colorCode?: string;
  productName?: string;
  designation?: string;
  commercialMeasure?: string;
  specialLabel?: string;
  refAttrsKey?: string;
  refAttrsValue?: string;
  keyword?: string;
};

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

type SupabaseRpc = (fn: string, args: JsonRecord) => Promise<RpcResult>;

async function assertAdminAccess() {
  await assertRole('admin');
}

function esc(value: string) {
  return value.replace(/'/g, "''");
}

function normalizeOverridePayload(input: unknown) {
  return canonicalizeOverrideAttrs(input || {});
}

function getRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function getText(row: JsonRecord, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function getRpc(): SupabaseRpc {
  return supabaseServer.rpc.bind(supabaseServer) as unknown as SupabaseRpc;
}

function mapSkuRow(row: JsonRecord): JsonRecord {
  const skuAttrs = canonicalizeOverrideAttrs(row.sku_attrs);
  const effectiveContext = buildEffectiveProductContext({ ...row, sku_attrs: skuAttrs }, { includeSkuOverrides: true });

  return {
    ...row,
    sku_attrs: skuAttrs,
    effective_attrs: effectiveContext.effective_attrs,
    resolved_color_name: effectiveContext.resolved_color_name,
    resolved_private_label_client_name: effectiveContext.resolved_private_label_client_name,
    resolved_special_label: effectiveContext.resolved_special_label,
    effective_status: effectiveContext.effective_status,
    is_exportable: effectiveContext.is_exportable,
    inactive_reasons: effectiveContext.inactive_reasons,
    version_status: effectiveContext.version_status,
    ref_status: effectiveContext.ref_status,
    family_status: effectiveContext.family_status,
  };
}

export async function searchSkus(filters: SkuEditorFilters) {
  await assertAdminAccess();

  const conditions: string[] = [];

  if (filters.familyCode) conditions.push(`family_code = '${esc(filters.familyCode)}'`);
  if (filters.referenceCode) conditions.push(`reference_code = '${esc(filters.referenceCode)}'`);
  if (filters.versionCode) conditions.push(`version_code = '${esc(filters.versionCode)}'`);
  if (filters.colorCode) conditions.push(`color_code = '${esc(filters.colorCode)}'`);
  if (filters.productName) conditions.push(`product_name = '${esc(filters.productName)}'`);
  if (filters.designation) conditions.push(`designation = '${esc(filters.designation)}'`);
  if (filters.commercialMeasure) conditions.push(`commercial_measure = '${esc(filters.commercialMeasure)}'`);
  if (filters.specialLabel) conditions.push(`special_label = '${esc(filters.specialLabel)}'`);
  if (filters.keyword) {
    const keyword = esc(`%${String(filters.keyword).trim()}%`);
    conditions.push(`(
      sku_complete ILIKE '${keyword}'
      OR sap_description_original ILIKE '${keyword}'
      OR final_complete_name_es ILIKE '${keyword}'
      OR final_complete_name_en ILIKE '${keyword}'
      OR color_code ILIKE '${keyword}'
      OR barcode_text ILIKE '${keyword}'
      OR version_code ILIKE '${keyword}'
      OR family_code ILIKE '${keyword}'
      OR reference_code ILIKE '${keyword}'
      OR product_name ILIKE '${keyword}'
      OR designation ILIKE '${keyword}'
      OR commercial_measure ILIKE '${keyword}'
      OR special_label ILIKE '${keyword}'
      OR name_color_sap ILIKE '${keyword}'
      OR ref_attrs::text ILIKE '${keyword}'
      OR sku_attrs::text ILIKE '${keyword}'
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows: JsonRecord[] = await dbQuery(`
    SELECT *
    FROM public.v_ui_generate_list
    ${whereClause}
    ORDER BY sku_complete ASC
    LIMIT 5000
  `);

  let filteredData = (rows || []).map(mapSkuRow);

  if (filters.refAttrsKey) {
    const refAttrsKey = filters.refAttrsKey;
    filteredData = filteredData.filter((row) => {
      const refAttrs = getRecord(row.ref_attrs);
      const hasKey = Object.prototype.hasOwnProperty.call(refAttrs, refAttrsKey);
      if (!hasKey) return false;
      if (filters.refAttrsValue) {
        return String(refAttrs[refAttrsKey]) === String(filters.refAttrsValue);
      }
      return true;
    });
  }

  if (filters.keyword) {
    const keyword = String(filters.keyword).toLowerCase().trim();
    filteredData = filteredData.filter((row) => {
      if (getText(row, 'sku_complete').includes(keyword)) return true;
      if (getText(row, 'sap_description_original').includes(keyword)) return true;
      if (getText(row, 'final_complete_name_es').includes(keyword)) return true;
      if (getText(row, 'final_complete_name_en').includes(keyword)) return true;
      if (getText(row, 'color_code').includes(keyword)) return true;
      if (getText(row, 'resolved_color_name').includes(keyword)) return true;
      if (getText(row, 'resolved_private_label_client_name').includes(keyword)) return true;
      if (getText(row, 'barcode_text').includes(keyword)) return true;
      if (getText(row, 'version_code').includes(keyword)) return true;
      if (getText(row, 'family_code').includes(keyword)) return true;
      if (getText(row, 'reference_code').includes(keyword)) return true;
      if (getText(row, 'product_name').includes(keyword)) return true;
      if (getText(row, 'designation').includes(keyword)) return true;
      if (getText(row, 'commercial_measure').includes(keyword)) return true;
      if (getText(row, 'special_label').includes(keyword)) return true;

      for (const val of Object.values(getRecord(row.ref_attrs))) {
        if (String(val).toLowerCase().includes(keyword)) return true;
      }
      for (const val of Object.values(getRecord(row.sku_attrs))) {
        if (String(val).toLowerCase().includes(keyword)) return true;
      }
      for (const val of Object.values(getRecord(row.effective_attrs))) {
        if (String(val).toLowerCase().includes(keyword)) return true;
      }

      return false;
    });
  }

  return { success: true, data: filteredData };
}

export async function previewMassUpdateSkus(skuIds: string[], normalUpdates: JsonRecord, skuAttrsUpdates: unknown) {
  await assertAdminAccess();

  const normalizedSkuAttrsUpdates = normalizeOverridePayload(skuAttrsUpdates);
  const { data, error } = await getRpc()('rpc_preview_mass_update_skus', {
    p_sku_ids: skuIds,
    p_normal_updates: normalUpdates,
    p_sku_attrs_updates: normalizedSkuAttrsUpdates
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: getRecord(data) };
}

export async function executeMassUpdateSkus(skuIds: string[], normalUpdates: JsonRecord, skuAttrsUpdates: unknown) {
  await assertAdminAccess();

  const normalizedSkuAttrsUpdates = normalizeOverridePayload(skuAttrsUpdates);
  const { data, error } = await getRpc()('rpc_mass_update_skus', {
    p_sku_ids: skuIds,
    p_normal_updates: normalUpdates,
    p_sku_attrs_updates: normalizedSkuAttrsUpdates
  });

  if (error) return { success: false, error: error.message };

  await markNamingStaleForSkus(skuIds, null, 'sku_mass_update');
  await processNamingJobsInline();
  revalidatePath('/configuration/sku-editor');

  revalidatePath('/generate');
  return { success: true, data: getRecord(data) };
}

export async function previewDeleteSkusAction(skuIds: string[]) {
  await assertAdminAccess();

  return { skuCount: skuIds.length };
}

export async function deleteSkusAction(skuIds: string[]) {
  await assertAdminAccess();

  const ids = skuIds.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
  await dbQuery(`DELETE FROM public.product_skus WHERE id IN (${ids})`);

  revalidatePath('/generate');
}

export async function getSkuFilterOptions() {
  await assertAdminAccess();

  const [rows, familiesRows]: [JsonRecord[], JsonRecord[]] = await Promise.all([
    dbQuery(`
      SELECT
        family_code,
        reference_code,
        version_code,
        color_code,
        product_name,
        designation,
        commercial_measure,
        special_label,
        ref_attrs,
        sku_attrs
      FROM public.v_ui_generate_list
      ORDER BY sku_complete ASC
    `),
    dbQuery(`
      SELECT family_code, ref_attrs_schema
      FROM public.families
    `)
  ]);

  const familyRefAttrsKeys: Record<string, string[]> = {};
  (familiesRows || []).forEach((row) => {
    const schema = getRecord(row.ref_attrs_schema);
    const familyCode = String(row.family_code ?? '');
    familyRefAttrsKeys[familyCode] = Object.keys(schema).filter(
      k => getRecord(schema[k]).active !== false
    );
  });

  const skus: JsonRecord[] = (rows || []).map((row): JsonRecord => ({
    ...row,
    sku_attrs: canonicalizeOverrideAttrs(row.sku_attrs),
  }));

  const familyCodes = Array.from(new Set(skus.map(s => s.family_code).filter(Boolean))).sort();
  const referenceCodes = Array.from(new Set(skus.map(s => s.reference_code).filter(Boolean))).sort();
  const versionCodes = Array.from(new Set(skus.map(s => s.version_code).filter(Boolean))).sort();
  const colorCodes = Array.from(new Set(skus.map(s => s.color_code).filter(Boolean))).sort();

  const jsonKeysRef = new Set<string>();
  const jsonValuesByKeyRef: Record<string, Set<string>> = {};
  const jsonKeysSku = new Set<string>();
  const jsonValuesByKeySku: Record<string, Set<string>> = {};

  skus.forEach(s => {
    const refAttrs = s.ref_attrs;
    if (refAttrs && typeof refAttrs === 'object') {
      Object.entries(refAttrs).forEach(([k, v]) => {
        jsonKeysRef.add(k);
        if (!jsonValuesByKeyRef[k]) jsonValuesByKeyRef[k] = new Set();
        if (v !== null && v !== undefined) jsonValuesByKeyRef[k].add(String(v));
      });
    }

    const skuAttrs = s.sku_attrs;
    if (skuAttrs && typeof skuAttrs === 'object') {
      Object.entries(skuAttrs).forEach(([rawKey, v]) => {
        const key = canonicalizeOverrideKey(rawKey);
        jsonKeysSku.add(key);
        if (!jsonValuesByKeySku[key]) jsonValuesByKeySku[key] = new Set();
        if (v !== null && v !== undefined) jsonValuesByKeySku[key].add(String(v));
      });
    }
  });

  const refAttrsKeys = Array.from(jsonKeysRef).sort();
  const refAttrsValues: Record<string, string[]> = {};
  for (const k of refAttrsKeys) {
    refAttrsValues[k] = Array.from(jsonValuesByKeyRef[k]).sort();
  }

  const skuAttrsKeys = Array.from(jsonKeysSku).sort();
  const skuAttrsValues: Record<string, string[]> = {};
  for (const k of skuAttrsKeys) {
    skuAttrsValues[k] = Array.from(jsonValuesByKeySku[k]).sort();
  }

  const productNames = Array.from(new Set(skus.map(s => s.product_name).filter(Boolean))).sort();
  const designations = Array.from(new Set(skus.map(s => s.designation).filter(Boolean))).sort();
  const measures = Array.from(new Set(skus.map(s => s.commercial_measure).filter(Boolean))).sort();
  const labels = Array.from(new Set(skus.map(s => s.special_label).filter(Boolean))).sort();

  return {
    success: true,
    data: {
      familyCodes,
      referenceCodes,
      versionCodes,
      colorCodes,
      refAttrsKeys,
      refAttrsValues,
      skuAttrsKeys,
      skuAttrsValues,
      productNames,
      designations,
      measures,
      labels,
      familyRefAttrsKeys
    }
  };
}
