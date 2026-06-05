'use server';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache';
import { dbQuery, supabaseServer } from '@/lib/supabase';
import {
  buildEffectiveProductContext,
  canonicalizeOverrideAttrs,
  canonicalizeOverrideKey,
} from '@/lib/engine/effectiveProduct';
import { markNamingStaleForSkus, processNamingJobsInline } from '@/lib/engine/namingQueue';
import { assertRole } from '@/utils/auth/access';

async function assertAdminAccess() {
  await assertRole('admin');
}

function esc(value: string) {
  return value.replace(/'/g, "''");
}

function normalizeOverridePayload(input: any) {
  return canonicalizeOverrideAttrs(input || {});
}

function mapSkuRow(row: Record<string, unknown>) {
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

export async function searchSkus(filters: any) {
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await dbQuery(`
    SELECT *
    FROM public.v_ui_generate_list
    ${whereClause}
    ORDER BY sku_complete ASC
    LIMIT 5000
  `);

  let filteredData = (rows || []).map(mapSkuRow);

  if (filters.refAttrsKey) {
    filteredData = filteredData.filter((row: any) => {
      const refAttrs = row.ref_attrs;
      if (!refAttrs || typeof refAttrs !== 'object') return false;
      const hasKey = Object.prototype.hasOwnProperty.call(refAttrs, filters.refAttrsKey);
      if (!hasKey) return false;
      if (filters.refAttrsValue) {
        return String(refAttrs[filters.refAttrsKey]) === String(filters.refAttrsValue);
      }
      return true;
    });
  }

  if (filters.keyword) {
    const keyword = filters.keyword.toLowerCase().trim();
    filteredData = filteredData.filter((row: any) => {
      if (row.sku_complete?.toLowerCase().includes(keyword)) return true;
      if (row.sap_description_original?.toLowerCase().includes(keyword)) return true;
      if (row.final_complete_name_es?.toLowerCase().includes(keyword)) return true;
      if (row.final_complete_name_en?.toLowerCase().includes(keyword)) return true;
      if (row.color_code?.toLowerCase().includes(keyword)) return true;
      if (row.resolved_color_name?.toLowerCase().includes(keyword)) return true;
      if (row.resolved_private_label_client_name?.toLowerCase().includes(keyword)) return true;
      if (row.barcode_text?.toLowerCase().includes(keyword)) return true;
      if (row.version_code?.toLowerCase().includes(keyword)) return true;
      if (row.family_code?.toLowerCase().includes(keyword)) return true;
      if (row.reference_code?.toLowerCase().includes(keyword)) return true;
      if (row.product_name?.toLowerCase().includes(keyword)) return true;
      if (row.designation?.toLowerCase().includes(keyword)) return true;
      if (row.commercial_measure?.toLowerCase().includes(keyword)) return true;
      if (row.special_label?.toLowerCase().includes(keyword)) return true;

      for (const val of Object.values(row.ref_attrs || {})) {
        if (String(val).toLowerCase().includes(keyword)) return true;
      }
      for (const val of Object.values(row.sku_attrs || {})) {
        if (String(val).toLowerCase().includes(keyword)) return true;
      }
      for (const val of Object.values(row.effective_attrs || {})) {
        if (String(val).toLowerCase().includes(keyword)) return true;
      }

      return false;
    });
  }

  return { success: true, data: filteredData };
}

export async function previewMassUpdateSkus(skuIds: string[], normalUpdates: any, skuAttrsUpdates: any) {
  await assertAdminAccess();

  const normalizedSkuAttrsUpdates = normalizeOverridePayload(skuAttrsUpdates);
  const { data, error } = await (supabaseServer as any).rpc('rpc_preview_mass_update_skus', {
    p_sku_ids: skuIds,
    p_normal_updates: normalUpdates,
    p_sku_attrs_updates: normalizedSkuAttrsUpdates
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function executeMassUpdateSkus(skuIds: string[], normalUpdates: any, skuAttrsUpdates: any) {
  await assertAdminAccess();

  const normalizedSkuAttrsUpdates = normalizeOverridePayload(skuAttrsUpdates);
  const { data, error } = await (supabaseServer as any).rpc('rpc_mass_update_skus', {
    p_sku_ids: skuIds,
    p_normal_updates: normalUpdates,
    p_sku_attrs_updates: normalizedSkuAttrsUpdates
  });

  if (error) return { success: false, error: error.message };

  await markNamingStaleForSkus(skuIds, null, 'sku_mass_update');
  await processNamingJobsInline();
  revalidatePath('/configuration/sku-editor');

  revalidatePath('/generate');
  return { success: true, data };
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

  const [rows, familiesRows] = await Promise.all([
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
  (familiesRows || []).forEach((row: any) => {
    const schema = row.ref_attrs_schema || {};
    familyRefAttrsKeys[row.family_code] = Object.keys(schema).filter(
      k => schema[k] && schema[k].active !== false
    );
  });

  const skus = (rows || []).map((row: any) => ({
    ...row,
    sku_attrs: canonicalizeOverrideAttrs(row.sku_attrs),
  })) as any[];

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
