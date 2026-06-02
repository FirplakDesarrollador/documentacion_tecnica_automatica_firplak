import { NextResponse } from 'next/server';
import { dbQuery, supabaseServer } from '@/lib/supabase';
import { readTemplateXlsx } from '@/lib/massImport/io';
import { composeProductById } from '@/lib/engine/product_composer';
import { computeMasterNamePreview } from '@/lib/engine/masterNaming';
import { markNamingStaleForSkus, processNamingJobsInline } from '@/lib/engine/namingQueue';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function getMassImportSettings(): Promise<{ executeEnabled: boolean; safeMaxRows: number }> {
  // Source of truth: DB settings (editable in /configuration; /rules is legacy alias).
  // Intentionally does NOT read from .env (per governance requirement).
  try {
    const rows =
      (await dbQuery(`
        SELECT key, value
        FROM public.app_settings
        WHERE key IN ('mass_import_execute_enabled', 'mass_import_safe_max_rows')
      `)) || [];

    const byKey = new Map<string, any>();
    for (const r of rows) byKey.set(String(r.key), r.value);

    const execDb = byKey.get('mass_import_execute_enabled');
    const maxDb = byKey.get('mass_import_safe_max_rows');

    const executeEnabled = (() => {
      if (typeof execDb === 'boolean') return execDb;
      if (typeof execDb === 'number') return execDb !== 0;
      if (execDb === null || execDb === undefined) return false;
      return String(execDb).trim().toLowerCase() === 'true';
    })();

    const safeMaxRowsRaw =
      typeof maxDb === 'number'
        ? maxDb
        : maxDb === null || maxDb === undefined
          ? NaN
          : parseInt(String(maxDb).trim(), 10);
    const safeMaxRows = Number.isFinite(safeMaxRowsRaw) && safeMaxRowsRaw > 0 ? safeMaxRowsRaw : 15;

    // If the table exists but values are missing, we still return sane defaults.
    if (rows && rows.length > 0) return { executeEnabled, safeMaxRows };
  } catch {
    // ignore; fall back to safe defaults
  }

  return { executeEnabled: false, safeMaxRows: 15 };
}

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

async function ensureClientsExist(clientNames: string[]) {
  const unique: string[] = [];
  for (const n of clientNames) {
    const trimmed = String(n || '').trim();
    if (!trimmed) continue;
    const up = trimmed.toUpperCase();
    if (up === 'NA' || up === 'N/A' || up === 'NULL' || up === 'NONE') continue;
    if (!unique.find((x) => x.toUpperCase() === up)) unique.push(up);
  }

  for (const nameUpper of unique) {
    await dbQuery(
      `
      INSERT INTO public.clients (id, name, logo_asset_id, created_at)
      SELECT gen_random_uuid(), $1, NULL, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.clients c WHERE UPPER(BTRIM(c.name)) = $1
      )
    `,
      [nameUpper]
    );
  }
}

function normalizeOptionalText(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up === 'NA' || up === 'N/A' || up === 'N.A' || up === 'NULL' || up === 'NONE') return null;
  return s;
}

function buildPayloadFromTemplate(parsed: Awaited<ReturnType<typeof readTemplateXlsx>>) {
  const { carga, familias, colores, versiones } = parsed;

  const rowsToCreate = (carga || [])
    .filter(r => String(r.IMPORT_ACTION || '').toUpperCase() === 'CREAR')
    .map(r => {
      const sku = String(r.SKU_COMPLETE || '').trim().toUpperCase();
      if (!sku) return null;

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

  return { rows: rowsToCreate, families: familiesToCreate, colors: colorsToCreate, versions: versionsToCreate };
}

export async function POST(req: Request) {
  const { executeEnabled, safeMaxRows } = await getMassImportSettings();
  const safeMode = !executeEnabled;

  try {
    const data = await req.formData();
    const file = data.get('file') as unknown as File | null;
    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

    const parsed = await readTemplateXlsx(file);
    const basePayload = buildPayloadFromTemplate(parsed);
    const payload: any = {
      rows: basePayload.rows,
      families: basePayload.families,
      colors: basePayload.colors,
      versions: basePayload.versions,
    };

    if (safeMode && payload.rows.length > safeMaxRows) {
      return NextResponse.json(
        {
          success: false,
          error: `Ejecucion deshabilitada (modo seguro). Limite: ${safeMaxRows} filas por prueba. Recibidas: ${payload.rows.length}.`,
          error_code: 'MASS_IMPORT_SAFE_ROW_LIMIT',
          details: { safe_max_rows: safeMaxRows, received_rows: payload.rows.length },
        },
        { status: 400 }
      );
    }

    // In safe mode, we ALLOW creating brand-new families/colors/versions only if we can clean them up safely.
    // We must not upsert/modify existing master data.
    let safeNewFamilyCodes = payload.families.map((f: any) => String(f.family_code || '').trim()).filter(Boolean);
    let safeNewColorCodes = payload.colors.map((c: any) => String(c.code_4dig || '').trim()).filter(Boolean);
    let safeNewVersionCodes = payload.versions.map((v: any) => String(v.version_code || '').trim().toUpperCase()).filter(Boolean);
    const safeIgnoredMaster: { families: string[]; colors: string[]; versions: string[] } = { families: [], colors: [], versions: [] };

    if (safeMode) {
      if (safeNewFamilyCodes.length > 0) {
        const { data, error } = await supabaseServer.from('families').select('family_code').in('family_code', safeNewFamilyCodes);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        const existing = (data || []).map((r: any) => String(r.family_code)).filter(Boolean);
        if (existing.length > 0) {
          // In safe mode we simply ignore existing master data to avoid upserts.
          safeIgnoredMaster.families = existing;
          payload.families = payload.families.filter((f: any) => !existing.includes(String(f.family_code || '').trim()));
          safeNewFamilyCodes = payload.families.map((f: any) => String(f.family_code || '').trim()).filter(Boolean);
        }
      }

      if (safeNewColorCodes.length > 0) {
        const { data, error } = await supabaseServer.from('colors').select('code_4dig').in('code_4dig', safeNewColorCodes);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        const existing = (data || []).map((r: any) => String(r.code_4dig)).filter(Boolean);
        if (existing.length > 0) {
          safeIgnoredMaster.colors = existing;
          payload.colors = payload.colors.filter((c: any) => !existing.includes(String(c.code_4dig || '').trim()));
          safeNewColorCodes = payload.colors.map((c: any) => String(c.code_4dig || '').trim()).filter(Boolean);
        }
      }

      if (safeNewVersionCodes.length > 0) {
        const { data, error } = await supabaseServer.from('global_version_rules').select('version_code').in('version_code', safeNewVersionCodes);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        const existing = (data || []).map((r: any) => String(r.version_code)).filter(Boolean);
        if (existing.length > 0) {
          safeIgnoredMaster.versions = existing;
          payload.versions = payload.versions.filter((v: any) => !existing.includes(String(v.version_code || '').trim().toUpperCase()));
          safeNewVersionCodes = payload.versions.map((v: any) => String(v.version_code || '').trim().toUpperCase()).filter(Boolean);
        }
      }
    }

    // 1) Import execute (writes)
    const { data: importRes, error: importErr } = await (supabaseServer as any).rpc('bulk_import_products_v3', {
      p_payload: payload,
      p_dry_run: false,
      p_test_rollback: false,
    });
    if (importErr) return NextResponse.json({ success: false, error: importErr.message }, { status: 500 });

    const rows = importRes?.rows || [];
    const createdSkuIds = rows.map((r: any) => r?.created_ids?.sku_id).filter((v: any) => !!v) as string[];
    // Only delete versions/references that were created in this run.
    const createdVersionIds = rows
      .filter((r: any) => !!r?.created_flags?.version)
      .map((r: any) => r?.created_ids?.version_id)
      .filter((v: any) => !!v) as string[];
    const createdReferenceIds = rows
      .filter((r: any) => !!r?.created_flags?.reference)
      .map((r: any) => r?.created_ids?.reference_id)
      .filter((v: any) => !!v) as string[];
    const versionIdBySkuId = new Map<string, string>();
    const shouldUpdateVersionBySkuId = new Map<string, boolean>();
    rows.forEach((r: any) => {
      const sid = r?.created_ids?.sku_id;
      const vid = r?.created_ids?.version_id;
      if (sid && vid) versionIdBySkuId.set(String(sid), String(vid));
      if (sid) shouldUpdateVersionBySkuId.set(String(sid), !!r?.created_flags?.version);
    });

    // In safe mode, we allow reusing existing references/versions, but we must avoid writing to existing versions.

    // 2) Naming V6 (app-layer), persist via bulk_apply_names_v6 (no legacy)

    const updates: any[] = [];
    const clientNamesToEnsure = new Set<string>();
    for (const skuId of createdSkuIds) {
      const composed = await composeProductById(skuId);
      if (!composed) continue;

      const plc = composed.private_label_client_name ? String(composed.private_label_client_name).trim() : '';
      if (plc && plc.toUpperCase() !== 'NA') clientNamesToEnsure.add(plc);

      const working: any = {
        code: composed.code,
        sap_description: composed.sap_description,
        product_type: composed.product_type,
        product_name: composed.product_name,
        color_code: composed.color_code,
        rh_flag: String(composed.rh || '').toUpperCase() === 'RH',
        rh: composed.rh,
        assembled_flag: !!composed.assembled_flag,
        canto_puertas: composed.canto_puertas,
        carb2: composed.carb2,
        line: composed.line,
        use_destination: composed.use_destination,
        zone_home: composed.zone_home,
        commercial_measure: composed.commercial_measure,
        accessory_text: composed.accessory_text,
        designation: composed.designation,
        bisagras: composed.bisagras,
        special_label: composed.special_label,
        door_color_text: composed.door_color_text,
        private_label_client_name: composed.private_label_client_name,
      };

      const baseName = await computeMasterNamePreview(working as any, 'final_base_name');
      const completeName = await computeMasterNamePreview(working as any, 'final_complete_name');

      updates.push({
        sku_id: composed.id,
        // In real execution we allow updating version names even if the version already existed,
        // because naming is deterministic and we want to avoid leaving null names behind.
        // In safe mode we never write to pre-existing versions.
        version_id: (!safeMode || shouldUpdateVersionBySkuId.get(composed.id))
          ? (versionIdBySkuId.get(composed.id) || null)
          : null,
        final_base_name_es: baseName.final_name_es,
        final_base_name_en: baseName.final_name_en,
        final_complete_name_es: completeName.final_name_es,
        final_complete_name_en: completeName.final_name_en,
        validation_status: baseName.final_name_es && baseName.final_name_en && completeName.final_name_es && completeName.final_name_en ? 'ready' : 'needs_review',
      });
    }

    if (!safeMode && clientNamesToEnsure.size > 0) {
      await ensureClientsExist(Array.from(clientNamesToEnsure));
    }

    const { data: nameRes, error: nameErr } = await (supabaseServer as any).rpc('bulk_apply_names_v6', {
      p_updates: updates,
      p_test_rollback: false,
    });
    if (nameErr) return NextResponse.json({ success: false, error: nameErr.message, importResult: importRes }, { status: 500 });

    if (!safeMode && createdSkuIds.length > 0) {
      await markNamingStaleForSkus(createdSkuIds, null, 'mass_import_execute');
      await processNamingJobsInline();
    }

    // 3) Safe mode cleanup (delete created rows so nothing persists)
    let cleanupRes: any = null;
    if (safeMode) {
      const { data: cData, error: cErr } = await (supabaseServer as any).rpc('bulk_cleanup_import_v6', {
        p_sku_ids: createdSkuIds,
        p_version_ids: createdVersionIds,
        p_reference_ids: createdReferenceIds,
      });
      if (cErr) {
        return NextResponse.json(
          { success: false, error: 'Cleanup failed in safe mode: ' + cErr.message, importResult: importRes, namingResult: nameRes },
          { status: 500 }
        );
      }
      cleanupRes = cData;

      // Cleanup master data created in safe mode (best effort).
      // We only ever allow brand-new codes in safe mode (validated above), so deleting is safe.
      const deleted: any = {};
      if (safeNewVersionCodes.length > 0) {
        const { error } = await supabaseServer.from('global_version_rules').delete().in('version_code', safeNewVersionCodes);
        if (error) deleted.versions_error = error.message;
        else deleted.versions = safeNewVersionCodes.length;
      }
      if (safeNewColorCodes.length > 0) {
        const { error } = await supabaseServer.from('colors').delete().in('code_4dig', safeNewColorCodes);
        if (error) deleted.colors_error = error.message;
        else deleted.colors = safeNewColorCodes.length;
      }
      if (safeNewFamilyCodes.length > 0) {
        const { error } = await supabaseServer.from('families').delete().in('family_code', safeNewFamilyCodes);
        if (error) deleted.families_error = error.message;
        else deleted.families = safeNewFamilyCodes.length;
      }

      cleanupRes = { ...(cleanupRes || {}), cleanup_master_data: deleted, safe_ignored_master_data: safeIgnoredMaster };
    }

    return NextResponse.json({
      success: true,
      safeMode,
      importResult: importRes,
      namingResult: nameRes,
      cleanupResult: cleanupRes,
      summary: {
        created_skus: importRes?.created?.skus ?? createdSkuIds.length,
        created_reference_variants: importRes?.created?.references ?? 0,
        created_version_variants: importRes?.created?.versions ?? 0,
        created_families: importRes?.created?.families ?? 0,
        created_colors: importRes?.created?.colors ?? 0,
        created_global_versions: safeNewVersionCodes.length,
        reused_existing_master_data: safeIgnoredMaster,
      },
    });
  } catch (e: any) {
    console.error('[mass-import/execute] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Execute failed' }, { status: 500 });
  }
}
