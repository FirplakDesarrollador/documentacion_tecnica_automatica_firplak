'use server';

import { revalidatePath } from 'next/cache';
import { dbQuery, supabaseServer } from '@/lib/supabase';
import {
  buildEffectiveProductContext,
  canonicalizeOverrideAttrs,
  canonicalizeOverrideKey,
} from '@/lib/engine/effectiveProduct';
import { recomputeMasterNamesForVersionIds } from '@/lib/engine/masterNaming';

function esc(value: string) {
  return value.replace(/'/g, "''");
}

function normalizeOverridePayload(input: any) {
  return canonicalizeOverrideAttrs(input || {});
}

function mapVersionRow(row: any) {
  const versionAttrs = canonicalizeOverrideAttrs(row.version_attrs);
  const effectiveContext = buildEffectiveProductContext(
    {
      ...row,
      status: 'ACTIVO',
      version_status: row.status,
      version_attrs: versionAttrs,
      sku_attrs: {}
    },
    { includeSkuOverrides: false }
  );

  return {
    ...row,
    version_attrs: versionAttrs,
    effective_attrs: effectiveContext.effective_attrs,
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

export async function searchVersions(filters: any) {
  const conditions: string[] = [];

  if (filters.familyCode) conditions.push(`f.family_code = '${esc(filters.familyCode)}'`);
  if (filters.referenceCode) conditions.push(`r.reference_code = '${esc(filters.referenceCode)}'`);
  if (filters.versionCode) conditions.push(`v.version_code = '${esc(filters.versionCode)}'`);
  if (filters.productName) conditions.push(`r.product_name = '${esc(filters.productName)}'`);
  if (filters.designation) conditions.push(`r.designation = '${esc(filters.designation)}'`);
  if (filters.commercialMeasure) conditions.push(`r.commercial_measure = '${esc(filters.commercialMeasure)}'`);
  if (filters.specialLabel) conditions.push(`r.special_label = '${esc(filters.specialLabel)}'`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await dbQuery(`
    SELECT
      v.id,
      v.version_code,
      v.sku_base,
      v.final_base_name_es,
      v.final_base_name_en,
      v.version_label,
      v.version_attrs,
      v.status,
      v.validation_status,
      r.status AS ref_status,
      r.reference_code,
      r.product_name,
      r.designation,
      r.commercial_measure,
      r.special_label,
      r.width_cm,
      r.depth_cm,
      r.height_cm,
      r.weight_kg,
      r.stacking_max,
      r.ref_attrs,
      f.family_code,
      f.family_name,
      f.product_type,
      f.use_destination,
      f.zone_home,
      f.rh_default,
      f.assembled_default,
      'ACTIVO'::text AS family_status,
      gvr.status AS global_version_rule_status,
      gvr.automatic_version_rules
    FROM public.product_versions v
    JOIN public.product_references r ON v.reference_id = r.id
    JOIN public.families f ON r.family_code = f.family_code
    LEFT JOIN public.global_version_rules gvr ON v.version_code = gvr.version_code
    ${whereClause}
    ORDER BY v.sku_base ASC
    LIMIT 2000
  `);

  let filteredData = (rows || []).map(mapVersionRow);

  if (filters.refAttrsKey && filters.refAttrsValue) {
    filteredData = filteredData.filter((row: any) => {
      const refAttrs = row.ref_attrs;
      if (!refAttrs || typeof refAttrs !== 'object') return false;
      return String(refAttrs[filters.refAttrsKey]) === String(filters.refAttrsValue);
    });
  } else if (filters.refAttrsKey) {
    filteredData = filteredData.filter((row: any) => Object.prototype.hasOwnProperty.call(row.ref_attrs || {}, filters.refAttrsKey));
  }

  if (filters.keyword) {
    const keyword = filters.keyword.toLowerCase().trim();
    filteredData = filteredData.filter((row: any) => {
      if (row.version_code?.toLowerCase().includes(keyword)) return true;
      if (row.sku_base?.toLowerCase().includes(keyword)) return true;
      if (row.final_base_name_es?.toLowerCase().includes(keyword)) return true;
      if (row.final_base_name_en?.toLowerCase().includes(keyword)) return true;
      if (row.version_label?.toLowerCase().includes(keyword)) return true;
      if (row.status?.toLowerCase().includes(keyword)) return true;
      if (row.reference_code?.toLowerCase().includes(keyword)) return true;
      if (row.product_name?.toLowerCase().includes(keyword)) return true;
      if (row.designation?.toLowerCase().includes(keyword)) return true;
      if (row.commercial_measure?.toLowerCase().includes(keyword)) return true;
      if (row.special_label?.toLowerCase().includes(keyword)) return true;
      if (row.family_code?.toLowerCase().includes(keyword)) return true;
      if (row.family_name?.toLowerCase().includes(keyword)) return true;
      if (row.resolved_private_label_client_name?.toLowerCase().includes(keyword)) return true;

      for (const val of Object.values(row.ref_attrs || {})) {
        if (String(val).toLowerCase().includes(keyword)) return true;
      }
      for (const val of Object.values(row.version_attrs || {})) {
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

export async function getVersionFilterOptions() {
  const [rows, familiesRows] = await Promise.all([
    dbQuery(`
      SELECT
        v.version_code,
        v.version_attrs,
        r.reference_code,
        r.product_name,
        r.designation,
        r.commercial_measure,
        r.special_label,
        r.ref_attrs,
        f.family_code
      FROM public.product_versions v
      JOIN public.product_references r ON v.reference_id = r.id
      JOIN public.families f ON r.family_code = f.family_code
      ORDER BY v.sku_base ASC
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

  const opts: any = {
    familyCodes: new Set(),
    referenceCodes: new Set(),
    versionCodes: new Set(),
    productNames: new Set(),
    designations: new Set(),
    measures: new Set(),
    labels: new Set(),
    refAttrsKeys: new Set(),
    refAttrsValues: {},
    versionAttrsKeys: new Set(),
    versionAttrsValues: {}
  };

  (rows || []).forEach((row: any) => {
    if (row.version_code) opts.versionCodes.add(row.version_code);
    if (row.reference_code) opts.referenceCodes.add(row.reference_code);
    if (row.product_name) opts.productNames.add(row.product_name);
    if (row.designation) opts.designations.add(row.designation);
    if (row.commercial_measure) opts.measures.add(row.commercial_measure);
    if (row.special_label) opts.labels.add(row.special_label);
    if (row.family_code) opts.familyCodes.add(row.family_code);

    const refAttrs = row.ref_attrs || {};
    Object.entries(refAttrs).forEach(([k, val]) => {
      opts.refAttrsKeys.add(k);
      if (!opts.refAttrsValues[k]) opts.refAttrsValues[k] = new Set();
      opts.refAttrsValues[k].add(String(val));
    });

    const versionAttrs = canonicalizeOverrideAttrs(row.version_attrs);
    Object.entries(versionAttrs).forEach(([rawKey, val]) => {
      const key = canonicalizeOverrideKey(rawKey);
      opts.versionAttrsKeys.add(key);
      if (!opts.versionAttrsValues[key]) opts.versionAttrsValues[key] = new Set();
      opts.versionAttrsValues[key].add(String(val));
    });
  });

  return {
    success: true,
    data: {
      familyCodes: Array.from(opts.familyCodes).sort(),
      referenceCodes: Array.from(opts.referenceCodes).sort(),
      versionCodes: Array.from(opts.versionCodes).sort(),
      productNames: Array.from(opts.productNames).sort(),
      designations: Array.from(opts.designations).sort(),
      measures: Array.from(opts.measures).sort(),
      labels: Array.from(opts.labels).sort(),
      refAttrsKeys: Array.from(opts.refAttrsKeys).sort(),
      refAttrsValues: Object.fromEntries(
        Object.entries(opts.refAttrsValues).map(([k, s]: any) => [k, Array.from(s).sort()])
      ),
      versionAttrsKeys: Array.from(opts.versionAttrsKeys).sort(),
      versionAttrsValues: Object.fromEntries(
        Object.entries(opts.versionAttrsValues).map(([k, s]: any) => [k, Array.from(s).sort()])
      ),
      familyRefAttrsKeys
    }
  };
}

export async function previewMassUpdateVersions(ids: string[], normalUpdates: any, versionAttrsUpdates: any) {
  const normalizedVersionAttrsUpdates = normalizeOverridePayload(versionAttrsUpdates);
  try {
    const { data, error } = await (supabaseServer.rpc as any)('rpc_preview_mass_update_versions', {
      p_ids: ids,
      p_normal_updates: normalUpdates,
      p_version_attrs_updates: normalizedVersionAttrsUpdates
    });
    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function executeMassUpdateVersions(ids: string[], normalUpdates: any, versionAttrsUpdates: any) {
  const normalizedVersionAttrsUpdates = normalizeOverridePayload(versionAttrsUpdates);
  try {
    const { data, error } = await (supabaseServer.rpc as any)('rpc_mass_update_versions', {
      p_ids: ids,
      p_normal_updates: normalUpdates,
      p_version_attrs_updates: normalizedVersionAttrsUpdates
    });
    if (error) throw error;

    await recomputeMasterNamesForVersionIds(ids);
    revalidatePath('/configuration/version-editor');

    revalidatePath('/generate');
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function previewDeleteVersionInstancesAction(versionIds: string[]) {
  const ids = versionIds.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
  const result = await dbQuery(`
    SELECT COUNT(*)::int AS sku_count
    FROM public.product_skus
    WHERE version_id IN (${ids})
  `) || [];
  return {
    versionCount: versionIds.length,
    skuCount: result[0]?.sku_count ?? 0
  };
}

export async function deleteVersionInstancesAction(versionIds: string[]) {
  const ids = versionIds.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
  await dbQuery(`
    DELETE FROM public.product_skus WHERE version_id IN (${ids});
    DELETE FROM public.product_versions WHERE id IN (${ids});
  `);
  revalidatePath('/configuration/version-editor');
  revalidatePath('/products');
  revalidatePath('/generate');
}
