import { NextResponse } from 'next/server';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseServer } from '@/lib/supabase';
import { readTemplateXlsx } from '@/lib/massImport/io';
import { parseSkuComplete } from '@/lib/massImport/sku';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parseJsonObjectOrNull(val: any): Record<string, any> | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  try {
    const j = JSON.parse(s);
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    return j as any;
  } catch {
    return null;
  }
}

function normalizeBool(val: any): boolean | null {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  const s = String(val).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

function toNumberOrNull(val: any): number | null {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  const n = Number(String(val).trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeOptionalText(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up === 'NA' || up === 'N/A' || up === 'N.A' || up === 'NULL' || up === 'NONE') return null;
  return s;
}

export async function POST(req: Request) {
  try {
    const data = await req.formData();
    const file = data.get('file') as unknown as File | null;
    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

    const { carga, familias, colores, versiones } = await readTemplateXlsx(file);
    if (!carga.length) return NextResponse.json({ success: false, error: 'La hoja "Carga" esta vacia.' }, { status: 400 });

    const rowsToCreate = carga
      .filter(r => String(r.IMPORT_ACTION || '').toUpperCase() === 'CREAR')
      .map(r => {
        const sku = String(r.SKU_COMPLETE || '').trim().toUpperCase();
        if (!sku) return null;
        try {
          parseSkuComplete(sku);
        } catch {
          // ignore; RPC will report
        }

        const ref_attrs: Record<string, any> = {};
        Object.keys(r).forEach(k => {
          if (!k.startsWith('REF_ATTR_')) return;
          const key = k.replace('REF_ATTR_', '').toLowerCase();
          if (key === 'product_type') return; // inherited from family
          const raw = r[k];
          if (raw === null || raw === undefined || String(raw).trim() === '') return;
          const b = normalizeBool(raw);
          ref_attrs[key] = b === null ? String(raw).trim() : b;
        });

        const version_attrs: Record<string, any> = {};
        const extraVer = parseJsonObjectOrNull(r.VERSION_ATTRS_JSON);
        if (extraVer) {
          // Avoid overriding with sentinel values like "NA" that mean "unset".
          const plc = (extraVer as any).private_label_client_name;
          const plcNorm = normalizeOptionalText(plc);
          if (plc !== undefined && !plcNorm) delete (extraVer as any).private_label_client_name;
          Object.assign(version_attrs, extraVer);
        }

        const sku_attrs: Record<string, any> = {};
        const extraSku = parseJsonObjectOrNull(r.SKU_ATTRS_JSON);
        if (extraSku) Object.assign(sku_attrs, extraSku);

        return {
          sku_complete: sku,
          sap_description_original: String(r.SAP_DESCRIPTION || '').trim(),
          product_name: String(r.PRODUCT_NAME || '').trim(),
          designation: String(r.DESIGNATION || '').trim(),
          line: String(r.LINE || '').trim(),
          commercial_measure: String(r.COMMERCIAL_MEASURE || '').trim(),
          special_label: String(r.SPECIAL_LABEL || '').trim(),
          width_cm: toNumberOrNull(r.WIDTH_CM),
          depth_cm: toNumberOrNull(r.DEPTH_CM),
          height_cm: toNumberOrNull(r.HEIGHT_CM),
          weight_kg: toNumberOrNull(r.WEIGHT_KG),
          stacking_max: toNumberOrNull(r.STACKING_MAX),
          ref_attrs,
          version_label: String(r.VERSION_LABEL || '').trim(),
          version_attrs,
          sku_attrs,
        };
      })
      .filter(Boolean) as any[];

    const familiesToCreate = (familias || [])
      .map(r => ({
        family_code: String(r.FAMILY_CODE || '').trim(),
        family_name: String(r.FAMILY_NAME || '').trim(),
        product_type: String(r.PRODUCT_TYPE || '').trim(),
        zone_home: String(r.ZONE_HOME || '').trim(),
        use_destination: String(r.USE_DESTINATION || '').trim(),
        manufacturing_process: String(r.MANUFACTURING_PROCESS || '').trim(),
        assembled_default: normalizeBool(r.ASSEMBLED_DEFAULT) ?? false,
        rh_default: normalizeBool(r.RH_DEFAULT) ?? false,
        allowed_lines: String(r.ALLOWED_LINES || '')
          .split('|')
          .map((s: string) => s.trim())
          .filter(Boolean),
      }))
      .filter(r => r.family_code);

    const colorsToCreate = (colores || [])
      .map(r => ({
        code_4dig: String(r.COLOR_CODE_4DIG || '').trim(),
        name_color_sap: String(r.NAME_COLOR_SAP || '').trim(),
        code_short: toNumberOrNull(r.CODE_SHORT),
      }))
      .filter(r => r.code_4dig);

    const versionsToCreate = (versiones || [])
      .map(r => ({
        version_code: String(r.VERSION_CODE || '').trim().toUpperCase(),
        version_description: String(r.VERSION_DESCRIPTION || '').trim(),
        automatic_version_rules: parseJsonObjectOrNull(r.AUTOMATIC_VERSION_RULES_JSON) || {},
        product_types: String(r.PRODUCT_TYPES || '')
          .split('|')
          .map((s: string) => s.trim())
          .filter(Boolean),
      }))
      .filter(r => r.version_code && !r.version_code.toLowerCase().includes('no hay version_codes'));

    const payload = { rows: rowsToCreate, families: familiesToCreate, colors: colorsToCreate, versions: versionsToCreate };

    const { data: rpcData, error } = await (supabaseServer as any).rpc('bulk_import_products_v3', {
      p_payload: payload,
      p_dry_run: true,
      p_test_rollback: false,
    });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, result: rpcData });
  } catch (e) {
    console.error('[mass-import/preview] error', e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Preview failed' }, { status: 500 });
  }
}
