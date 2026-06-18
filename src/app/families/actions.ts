'use server';

import { supabaseServer, dbQuery } from '@/lib/supabase';
import {
  markNamingStaleForFamilies,
  markNamingStaleForReferences,
  processNamingJobsInline,
} from '@/lib/engine/namingQueue';
import { parseProductCode } from '@/lib/engine/codeParser';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertRole } from '@/utils/auth/access';

async function assertAdminAccess() {
  await assertRole('admin');
}

type FamilyFilterOptionsRow = {
  family_code?: string | null;
  family_name?: string | null;
  product_type?: string | null;
  zone_home?: string | null;
  manufacturing_process?: string | null;
};

type FamilySearchFilters = {
  familyCode?: string;
  familyName?: string;
  productType?: string;
  zoneHome?: string;
  manufacturingProcess?: string;
};

type MassUpdateValue = string | boolean | null | undefined;
type FamilyMassUpdatePayload = Partial<Record<(typeof ALLOWED_NORMAL_COLS)[number], MassUpdateValue>>;

type LineRow = {
  line?: string | null;
};

type ProductTypeRow = {
  product_type?: string | null;
};

type PreviewRemoveAttrRow = {
  family_code: string;
  total_refs: number | string;
  refs_with_key: number | string;
};

type PreviewAddAttrRow = PreviewRemoveAttrRow & {
  refs_without_key?: number | string;
};

type PreviewUpdateAttrRow = PreviewRemoveAttrRow & {
  refs_outside_allowed?: number | string;
};

type RpcResult<T> = {
  data: T;
  error: { message: string } | null;
};

type RpcCaller = {
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<RpcResult<T>>;
};

const rpcClient = supabaseServer as unknown as RpcCaller;

type FamilyUpsertInput = {
  code: string;
  name?: string | null;
  product_type?: string | null;
  use_destination?: string | null;
  zone_home?: string | null;
  allowed_lines?: string[] | null;
  rh_default?: boolean;
  assembled_default?: boolean;
  manufacturing_process?: string | null;
};

function formatPGArray(arr: string[] | null | undefined) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "'{}'";
  const escaped = arr.map((value) => value.trim().replace(/'/g, "''").replace(/"/g, '\\"'));
  return `'{${escaped.join(',')}}'`;
}

// --- FILTER OPTIONS ---

export async function getFamiliesFilterOptions() {
  await assertAdminAccess();

  const { data: fams } = await supabaseServer
    .from('families')
    .select('family_code, family_name, product_type, zone_home, manufacturing_process')
    .order('family_code', { ascending: true });

  const rows = (fams || []) as FamilyFilterOptionsRow[];

  const familyCodes = Array.from(new Set(rows.map(r => r.family_code).filter(Boolean))).sort();
  const familyNames = Array.from(new Set(rows.map(r => r.family_name).filter(Boolean))).sort();
  const productTypes = Array.from(new Set(rows.map(r => r.product_type).filter(Boolean))).sort();
  const zoneHomes = Array.from(new Set(rows.map(r => r.zone_home).filter(Boolean))).sort();
  const manufacturingProcesses = Array.from(new Set(rows.map(r => r.manufacturing_process).filter(Boolean))).sort();

  return {
    success: true,
    data: { familyCodes, familyNames, productTypes, zoneHomes, manufacturingProcesses }
  };
}

export async function checkFamilyExists(code: string) {
  await assertAdminAccess();

  if (!code) return true;
  const parsed = await parseProductCode(code, '', false);
  if (!parsed.familia_code) return true;

  const rows = await dbQuery(
    `SELECT family_code FROM public.families WHERE family_code = '${parsed.familia_code.replace(/'/g, "''")}' LIMIT 1`
  );
  return rows && rows.length > 0;
}

export async function checkFamilyExistsAction(code: string) {
  await assertAdminAccess();
  return await checkFamilyExists(code);
}

export async function upsertFamilyAction(data: FamilyUpsertInput) {
  await assertAdminAccess();

  if (!data.code) throw new Error('Family code is required');

  const query = `
    INSERT INTO public.families (
      family_code, family_name, product_type, use_destination, zone_home,
      allowed_lines, rh_default, assembled_default, manufacturing_process
    )
    VALUES (
      '${data.code.replace(/'/g, "''")}',
      ${data.name ? `'${data.name.replace(/'/g, "''")}'` : 'NULL'},
      ${data.product_type ? `'${data.product_type}'` : 'NULL'},
      ${data.use_destination ? `'${data.use_destination}'` : 'NULL'},
      ${data.zone_home ? `'${data.zone_home}'` : 'NULL'},
      ${formatPGArray(data.allowed_lines)},
      ${data.rh_default ? 'true' : 'false'},
      ${data.assembled_default ? 'true' : 'false'},
      ${data.manufacturing_process ? `'${data.manufacturing_process}'` : "'FABRICADO'"}
    )
    ON CONFLICT (family_code) DO UPDATE SET
      family_name = EXCLUDED.family_name,
      product_type = EXCLUDED.product_type,
      use_destination = EXCLUDED.use_destination,
      zone_home = EXCLUDED.zone_home,
      allowed_lines = EXCLUDED.allowed_lines,
      rh_default = EXCLUDED.rh_default,
      assembled_default = EXCLUDED.assembled_default,
      manufacturing_process = EXCLUDED.manufacturing_process,
      updated_at = now()
    RETURNING *
  `;

  const rows = await dbQuery(query);
  await markNamingStaleForFamilies([data.code], null, 'family_upsert');
  await processNamingJobsInline();
  revalidatePath('/configuration/families');
  return rows ? rows[0] : null;
}

export async function updateFamilyAction(code: string, data: Omit<FamilyUpsertInput, 'code'>) {
  await assertAdminAccess();

  if (!code) throw new Error('Family code is required');

  await dbQuery(`
    UPDATE public.families SET
      family_name=${data.name ? `'${data.name.replace(/'/g, "''")}'` : 'NULL'},
      product_type=${data.product_type ? `'${data.product_type}'` : 'NULL'},
      use_destination=${data.use_destination ? `'${data.use_destination}'` : 'NULL'},
      zone_home=${data.zone_home ? `'${data.zone_home}'` : 'NULL'},
      allowed_lines=${formatPGArray(data.allowed_lines)},
      rh_default=${data.rh_default ? 'true' : 'false'},
      assembled_default=${data.assembled_default ? 'true' : 'false'},
      manufacturing_process=${data.manufacturing_process ? `'${data.manufacturing_process}'` : "'FABRICADO'"},
      updated_at=now()
    WHERE family_code='${code.replace(/'/g, "''")}'
  `);

  await markNamingStaleForFamilies([code], null, 'family_update');
  await processNamingJobsInline();
  revalidatePath('/configuration/families');
  redirect('/families');
}

// --- SEARCH ---

export async function searchFamilies(filters: FamilySearchFilters) {
  await assertAdminAccess();

  let query = supabaseServer
    .from('families')
    .select('*')
    .order('family_code', { ascending: true });

  if (filters.familyCode) query = query.ilike('family_code', `%${filters.familyCode}%`);
  if (filters.familyName) query = query.ilike('family_name', `%${filters.familyName}%`);
  if (filters.productType) query = query.eq('product_type', filters.productType);
  if (filters.zoneHome) query = query.eq('zone_home', filters.zoneHome);
  if (filters.manufacturingProcess) query = query.eq('manufacturing_process', filters.manufacturingProcess);

  const { data, error } = await query.limit(500);
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// --- PREVIEW MASS UPDATE (normal columns) ---

const ALLOWED_NORMAL_COLS = [
  'family_name', 'product_type', 'use_destination',
  'zone_home', 'manufacturing_process', 'rh_default', 'assembled_default'
];

const NAMING_MODELS_KEY = 'naming_models_enabled_types';

function normalizeProductType(raw: string) {
  return String(raw || '').trim().toUpperCase();
}

function parseTypesValue(value: unknown): string[] {
  if (!value) return [];
  const src = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
      : [];

  const dedup = new Set<string>();
  for (const item of src) {
    const normalized = normalizeProductType(String(item || ''));
    if (normalized) dedup.add(normalized);
  }
  return Array.from(dedup).sort();
}

async function resolveNamingModelTypes(): Promise<string[]> {
  const settingRows = await dbQuery(`
    SELECT value
    FROM public.app_settings
    WHERE key = '${NAMING_MODELS_KEY}'
    LIMIT 1
  `) || [];

  const fromSetting = parseTypesValue(settingRows?.[0]?.value);
  if (fromSetting.length > 0) return fromSetting;

  const componentRows = await dbQuery(`
    SELECT DISTINCT product_type
    FROM public.naming_components
    WHERE product_type IS NOT NULL
      AND btrim(product_type) <> ''
    ORDER BY product_type ASC
  `) || [];

  return parseTypesValue(componentRows.map((row: { product_type?: string }) => row.product_type || ''));
}

async function saveNamingModelTypes(types: string[]) {
  const normalized = parseTypesValue(types);
  const payload = JSON.stringify(normalized).replace(/'/g, "''");
  await dbQuery(`
    INSERT INTO public.app_settings (key, value, updated_at)
    VALUES ('${NAMING_MODELS_KEY}', to_jsonb('${payload}'::json), now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now()
  `);
}

type ProductTypeImpact = {
  fromType: string | null;
  toType: string;
  selectedTypes: string[];
  selectedCount: number;
  sourceWillBeOrphan: boolean;
  sourceModelExists: boolean;
  targetModelExists: boolean;
  canMigrateNamingModel: boolean;
  reason: string | null;
};

async function computeProductTypeRenameImpact(ids: string[], rawNextType: string): Promise<ProductTypeImpact> {
  const nextType = normalizeProductType(rawNextType);
  const selectedCount = ids.length;

  if (!nextType) {
    return {
      fromType: null,
      toType: '',
      selectedTypes: [],
      selectedCount,
      sourceWillBeOrphan: false,
      sourceModelExists: false,
      targetModelExists: false,
      canMigrateNamingModel: false,
      reason: 'El nuevo product_type está vacío.',
    };
  }

  const safeCodes = ids.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const selectedRows = await dbQuery(`
    SELECT product_type, COUNT(*)::int AS selected_count
    FROM public.families
    WHERE family_code IN (${safeCodes})
      AND product_type IS NOT NULL
      AND btrim(product_type) <> ''
    GROUP BY product_type
    ORDER BY product_type ASC
  `) || [];

  const selectedTypes: string[] = Array.from(new Set<string>(
    selectedRows
      .map((row: { product_type?: string }) => normalizeProductType(row.product_type || ''))
      .filter(Boolean)
  ));

  if (selectedTypes.length !== 1) {
    return {
      fromType: selectedTypes.length === 1 ? selectedTypes[0] : null,
      toType: nextType,
      selectedTypes,
      selectedCount,
      sourceWillBeOrphan: false,
      sourceModelExists: false,
      targetModelExists: false,
      canMigrateNamingModel: false,
      reason: selectedTypes.length === 0
        ? 'No se encontró product_type en las familias seleccionadas.'
        : 'La selección mezcla múltiples product_type; no se puede migrar nomenclatura automáticamente.',
    };
  }

  const fromType = selectedTypes[0];
  if (fromType === nextType) {
    return {
      fromType,
      toType: nextType,
      selectedTypes,
      selectedCount,
      sourceWillBeOrphan: false,
      sourceModelExists: false,
      targetModelExists: false,
      canMigrateNamingModel: false,
      reason: 'El product_type nuevo es igual al actual.',
    };
  }

  const remainingRows = await dbQuery(`
    SELECT COUNT(*)::int AS count
    FROM public.families
    WHERE upper(btrim(product_type)) = '${fromType.replace(/'/g, "''")}'
      AND family_code NOT IN (${safeCodes})
  `) || [];
  const remainingCount = Number(remainingRows?.[0]?.count || 0);
  const sourceWillBeOrphan = remainingCount === 0;

  const namingModels = await resolveNamingModelTypes();
  const sourceModelExists = namingModels.includes(fromType);
  const targetModelExists = namingModels.includes(nextType);

  if (!sourceWillBeOrphan) {
    return {
      fromType,
      toType: nextType,
      selectedTypes,
      selectedCount,
      sourceWillBeOrphan,
      sourceModelExists,
      targetModelExists,
      canMigrateNamingModel: false,
      reason: `Aún quedan familias con ${fromType}; no corresponde renombrar el modelo completo.`,
    };
  }

  if (!sourceModelExists) {
    return {
      fromType,
      toType: nextType,
      selectedTypes,
      selectedCount,
      sourceWillBeOrphan,
      sourceModelExists,
      targetModelExists,
      canMigrateNamingModel: false,
      reason: `No existe modelo de nomenclatura para ${fromType}.`,
    };
  }

  if (targetModelExists) {
    return {
      fromType,
      toType: nextType,
      selectedTypes,
      selectedCount,
      sourceWillBeOrphan,
      sourceModelExists,
      targetModelExists,
      canMigrateNamingModel: false,
      reason: `Ya existe un modelo para ${nextType}; no se puede renombrar para evitar duplicados.`,
    };
  }

  return {
    fromType,
    toType: nextType,
    selectedTypes,
    selectedCount,
    sourceWillBeOrphan,
    sourceModelExists,
    targetModelExists,
    canMigrateNamingModel: true,
    reason: null,
  };
}

export async function previewMassUpdateFamilies(ids: string[], normalUpdates: FamilyMassUpdatePayload) {
  await assertAdminAccess();

  const errors: string[] = [];
  const col = Object.keys(normalUpdates || {})[0];

  if (!col || !ALLOWED_NORMAL_COLS.includes(col)) {
    errors.push(`Columna no permitida: "${col}"`);
  }
  if (!ids || ids.length === 0) {
    errors.push('No hay familias seleccionadas');
  }

  if (errors.length > 0) {
    return { success: true, data: { is_valid: false, affected_count: 0, errors, families: [] } };
  }

  return {
    success: true,
    data: {
      is_valid: true,
      affected_count: ids.length,
      errors: [],
      families: ids.map(code => ({ family_code: code }))
    }
  };
}

export async function previewProductTypeRenameImpactAction(ids: string[], nextProductType: string) {
  await assertAdminAccess();

  if (!ids || ids.length === 0) {
    return { success: false, error: 'No hay familias seleccionadas' };
  }

  try {
    const impact = await computeProductTypeRenameImpact(ids, nextProductType);
    return { success: true, data: impact };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// --- EXECUTE MASS UPDATE (normal columns) ---

export async function executeMassUpdateFamilies(
  ids: string[],
  normalUpdates: FamilyMassUpdatePayload,
  options?: { migrateNamingModel?: boolean; migrationFromType?: string }
) {
  await assertAdminAccess();

  const col = Object.keys(normalUpdates || {})[0];
  if (!col || !ALLOWED_NORMAL_COLS.includes(col)) {
    return { success: false, error: `Columna no permitida: "${col}"` };
  }
  if (!ids || ids.length === 0) {
    return { success: false, error: 'No hay familias seleccionadas' };
  }

  const codes = ids.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  let setClause = '';

  const val = normalUpdates[col];
  if (typeof val === 'boolean') {
    setClause = `${col} = ${val ? 'true' : 'false'}`;
  } else if (val !== null && val !== undefined) {
    setClause = `${col} = '${String(val).replace(/'/g, "''")}'`;
  } else {
    setClause = `${col} = NULL`;
  }

  try {
    let migrationImpact: ProductTypeImpact | null = null;
    const wantsMigration = !!options?.migrateNamingModel && col === 'product_type' && typeof val === 'string';
    if (wantsMigration) {
      migrationImpact = await computeProductTypeRenameImpact(ids, val);
      if (!migrationImpact.canMigrateNamingModel) {
        return { success: false, error: migrationImpact.reason || 'No es posible migrar el modelo de nomenclatura.' };
      }
      if (options?.migrationFromType && migrationImpact.fromType !== normalizeProductType(options.migrationFromType)) {
        return { success: false, error: 'El product_type origen cambió durante la validación. Repite la operación.' };
      }
    }

    await dbQuery(`
      UPDATE public.families SET ${setClause}, updated_at = now()
      WHERE family_code IN (${codes})
    `);

    let namingMigration: { migrated: boolean; fromType?: string; toType?: string } = { migrated: false };
    if (wantsMigration && migrationImpact?.fromType) {
      const fromType = migrationImpact.fromType;
      const toType = migrationImpact.toType;

      await dbQuery(`
        UPDATE public.naming_components
        SET product_type = '${toType.replace(/'/g, "''")}',
            updated_at = now()
        WHERE upper(btrim(product_type)) = '${fromType.replace(/'/g, "''")}';
      `);

      const currentModels = await resolveNamingModelTypes();
      const remapped = currentModels.map(type => (type === fromType ? toType : type));
      await saveNamingModelTypes(remapped);

      namingMigration = { migrated: true, fromType, toType };
    }

    await markNamingStaleForFamilies(ids, null, 'family_mass_update');
    await processNamingJobsInline();
    revalidatePath('/configuration/families');
    revalidatePath('/configuration/reference-editor');
    revalidatePath('/configuration');
    return { success: true, namingMigration };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// --- LINES MANAGEMENT ---

export async function getAvailableLines() {
  await assertAdminAccess();

  const data = await dbQuery(`
    SELECT DISTINCT line
    FROM public.product_references
    WHERE line IS NOT NULL AND line != ''
      AND line NOT IN (SELECT name_color_sap FROM public.colors)
    ORDER BY line ASC
  `) || [];
  return {
    success: true,
    data: (data as LineRow[])
      .map((r) => r.line)
      .filter((line): line is string => typeof line === 'string' && line.length > 0)
  };
}

export async function updateFamilyLinesAction(familyCode: string, lines: string[]) {
  await assertAdminAccess();

  const safeCode = familyCode.replace(/'/g, "''");
  const safeLines = lines.length > 0
    ? `'{${lines.map(l => l.replace(/'/g, "''").replace(/"/g, '\\"')).join(',')}}'`
    : "'{}'";

  await dbQuery(`
    UPDATE public.families SET
      allowed_lines = ${safeLines},
      updated_at = now()
    WHERE family_code = '${safeCode}'
  `);

  revalidatePath('/families');
  revalidatePath('/configuration/reference-editor');
  return { success: true };
}

export async function deleteLineAction(line: string) {
  await assertAdminAccess();

  const safeLine = line.replace(/'/g, "''");
  const affectedRows = await dbQuery(`
    SELECT id
    FROM public.product_references
    WHERE line = '${safeLine}'
  `) || [];
  const affectedReferenceIds = affectedRows.map((row: { id?: string }) => row.id).filter(Boolean) as string[];

  await dbQuery(`
    UPDATE public.product_references SET line = NULL WHERE line = '${safeLine}';
    UPDATE public.families SET allowed_lines = array_remove(allowed_lines, '${safeLine}') WHERE '${safeLine}' = ANY(allowed_lines);
  `);

  await markNamingStaleForReferences(affectedReferenceIds, null, 'line_delete');
  await processNamingJobsInline();
  revalidatePath('/families');
  revalidatePath('/configuration/reference-editor');
  return { success: true };
}

// --- DELETE PREVIEW (show counts before cascade) ---

export async function previewDeleteFamiliesAction(codes: string[]) {
  await assertAdminAccess();

  if (!codes || codes.length === 0) throw new Error('No hay familias seleccionadas');

  const safe = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');

  const { data } = await dbQuery(`
    SELECT
      f.family_code,
      f.family_name,
      (SELECT COUNT(*) FROM public.product_references r WHERE r.family_code = f.family_code)::int AS ref_count,
      (SELECT COUNT(*) FROM public.product_versions v
        JOIN public.product_references r ON v.reference_id = r.id
        WHERE r.family_code = f.family_code)::int AS version_count,
      (SELECT COUNT(*) FROM public.product_skus s
        JOIN public.product_versions v ON s.version_id = v.id
        JOIN public.product_references r ON v.reference_id = r.id
        WHERE r.family_code = f.family_code)::int AS sku_count
    FROM public.families f
    WHERE f.family_code = ANY(ARRAY[${safe}])
    ORDER BY f.family_code
  `);

  return {
    success: true,
    data: data || []
  };
}

// --- DELETE FAMILIES (cascade) ---

export async function deleteFamiliesAction(codes: string[]) {
  await assertAdminAccess();

  if (!codes || codes.length === 0) throw new Error('No hay familias seleccionadas');

  const safe = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');

  const affectedTypesRows = await dbQuery(`
    SELECT DISTINCT product_type
    FROM public.families
    WHERE family_code = ANY(ARRAY[${safe}])
      AND product_type IS NOT NULL
      AND btrim(product_type) <> ''
  `) || [];
  const affectedTypes: string[] = Array.from(new Set<string>(
    affectedTypesRows
      .map((r: ProductTypeRow) => String(r.product_type || '').trim().toUpperCase())
      .filter(Boolean)
  ));

  await dbQuery(`
    DELETE FROM public.product_skus
    WHERE version_id IN (
      SELECT v.id FROM public.product_versions v
      JOIN public.product_references r ON v.reference_id = r.id
      WHERE r.family_code = ANY(ARRAY[${safe}])
    );
    DELETE FROM public.product_versions
    WHERE reference_id IN (
      SELECT id FROM public.product_references
      WHERE family_code = ANY(ARRAY[${safe}])
    );
    DELETE FROM public.product_references
    WHERE family_code = ANY(ARRAY[${safe}]);
    DELETE FROM public.families
    WHERE family_code = ANY(ARRAY[${safe}]);
  `);

  const orphanedProductTypes: string[] = [];
  for (const productType of affectedTypes) {
    const stillUsedRows = await dbQuery(`
      SELECT COUNT(*)::int AS count
      FROM public.families
      WHERE upper(btrim(product_type)) = '${productType.replace(/'/g, "''")}'
    `) || [];
    const stillUsedCount = Number(stillUsedRows?.[0]?.count || 0);
    if (stillUsedCount > 0) continue;

    const hasRulesRows = await dbQuery(`
      SELECT COUNT(*)::int AS count
      FROM public.naming_components
      WHERE upper(btrim(product_type)) = '${productType.replace(/'/g, "''")}'
    `) || [];
    const hasRules = Number(hasRulesRows?.[0]?.count || 0) > 0;

    if (hasRules) orphanedProductTypes.push(productType);
  }

  revalidatePath('/families');
  revalidatePath('/configuration/reference-editor');
  revalidatePath('/configuration');

  return {
    success: true,
    orphanedProductTypes,
  };
}

// --- SCHEMA CONFIG (FLUJO A, movido desde reference-editor) ---

export async function getFamiliesWithSchema(productTypeFilter?: string) {
  await assertAdminAccess();

  let query = supabaseServer.from('families').select('family_code, product_type, ref_attrs_schema');

  if (productTypeFilter) {
    query = query.eq('product_type', productTypeFilter);
  }

  const { data, error } = await query.order('family_code', { ascending: true });

  if (error) {
    console.error('Error fetching families schema:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function previewAddAttrToFamilies(familyCodes: string[], attrKey: string) {
  await assertAdminAccess();

  const { data, error } = await rpcClient.rpc<PreviewAddAttrRow[]>('rpc_preview_add_attr_to_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const rows = (data || []) as PreviewAddAttrRow[];

  return {
    success: true,
    data: {
      is_valid: true,
      affected_count: rows.length,
      errors: [],
      families: rows.map((row) => ({
        family_code: row.family_code,
        total_refs: Number(row.total_refs),
        refs_with_key: Number(row.refs_with_key),
        refs_without_key: Number(row.refs_without_key || 0),
      })),
    }
  };
}

export async function executeAddAttrToFamilies(familyCodes: string[], attrKey: string, attrDef: unknown, defaultValue: string) {
  await assertAdminAccess();

  const { error } = await rpcClient.rpc<unknown>('rpc_add_attr_to_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey,
    p_attr_def: attrDef,
    p_default_value: defaultValue
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await markNamingStaleForFamilies(familyCodes, null, 'family_attr_add');
  await processNamingJobsInline();
  revalidatePath('/families');
  revalidatePath('/configuration/reference-editor');
  return { success: true };
}

export async function previewUpdateAttrAllowedValues(familyCodes: string[], attrKey: string, allowedValues: string[]) {
  await assertAdminAccess();

  const errors: string[] = [];

  if (!attrKey || !attrKey.trim()) {
    errors.push('Debes seleccionar un atributo a modificar');
  }
  if (!familyCodes || familyCodes.length === 0) {
    errors.push('No hay familias seleccionadas');
  }

  if (errors.length > 0) {
    return { success: true, data: { is_valid: false, affected_count: 0, errors, families: [] } };
  }

  const safeCodes = familyCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const safeAttrKey = attrKey.replace(/'/g, "''");
  const normalizedAllowed = Array.from(new Set(
    allowedValues
      .map(value => String(value || '').trim())
      .filter(Boolean)
  )).sort();
  const allowedArray = normalizedAllowed.length > 0
    ? `ARRAY[${normalizedAllowed.map(value => `'${value.replace(/'/g, "''")}'`).join(',')}]::text[]`
    : 'ARRAY[]::text[]';
  const outsideAllowedSql = normalizedAllowed.length > 0
    ? `COUNT(pr.id) FILTER (
        WHERE COALESCE(pr.ref_attrs, '{}'::jsonb) ? '${safeAttrKey}'
          AND NOT ((pr.ref_attrs->>'${safeAttrKey}') = ANY(${allowedArray}))
      )::int`
    : '0::int';

  const rows = await dbQuery(`
    WITH selected_families AS (
      SELECT family_code
      FROM public.families
      WHERE family_code IN (${safeCodes})
        AND COALESCE(ref_attrs_schema, '{}'::jsonb) ? '${safeAttrKey}'
    )
    SELECT
      sf.family_code,
      COUNT(pr.id)::int AS total_refs,
      COUNT(pr.id) FILTER (WHERE COALESCE(pr.ref_attrs, '{}'::jsonb) ? '${safeAttrKey}')::int AS refs_with_key,
      ${outsideAllowedSql} AS refs_outside_allowed
    FROM selected_families sf
    LEFT JOIN public.product_references pr ON pr.family_code = sf.family_code
    GROUP BY sf.family_code
    ORDER BY sf.family_code ASC
  `) || [];

  const previewRows = rows as PreviewUpdateAttrRow[];
  if (previewRows.length === 0) {
    return {
      success: true,
      data: {
        is_valid: false,
        affected_count: 0,
        errors: [`El atributo "${attrKey}" no existe en las familias seleccionadas.`],
        families: [],
      }
    };
  }

  const refsOutsideAllowed = previewRows.reduce(
    (acc, row) => acc + Number(row.refs_outside_allowed || 0),
    0
  );

  return {
    success: true,
    data: {
      is_valid: true,
      affected_count: previewRows.length,
      errors: [],
      warnings: refsOutsideAllowed > 0
        ? [`${refsOutsideAllowed} referencias tienen valores actuales que no quedan en la nueva lista permitida.`]
        : [],
      families: previewRows.map((row) => ({
        family_code: row.family_code,
        total_refs: Number(row.total_refs),
        refs_with_key: Number(row.refs_with_key),
        refs_outside_allowed: Number(row.refs_outside_allowed || 0),
      })),
    }
  };
}

export async function executeUpdateAttrAllowedValues(familyCodes: string[], attrKey: string, allowedValues: string[]) {
  await assertAdminAccess();

  if (!attrKey || !attrKey.trim()) {
    return { success: false, error: 'Debes seleccionar un atributo a modificar' };
  }
  if (!familyCodes || familyCodes.length === 0) {
    return { success: false, error: 'No hay familias seleccionadas' };
  }

  const safeCodes = familyCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const safeAttrKey = attrKey.replace(/'/g, "''");
  const normalizedAllowed = Array.from(new Set(
    allowedValues
      .map(value => String(value || '').trim())
      .filter(Boolean)
  )).sort();
  const allowedJson = JSON.stringify(normalizedAllowed).replace(/'/g, "''");

  try {
    await dbQuery(`
      UPDATE public.families
      SET ref_attrs_schema = jsonb_set(
            COALESCE(ref_attrs_schema, '{}'::jsonb),
            ARRAY['${safeAttrKey}', 'allowed_values']::text[],
            '${allowedJson}'::jsonb,
            false
          ),
          updated_at = now()
      WHERE family_code IN (${safeCodes})
        AND COALESCE(ref_attrs_schema, '{}'::jsonb) ? '${safeAttrKey}'
    `);

    await markNamingStaleForFamilies(familyCodes, null, 'family_attr_allowed_values_update');
    await processNamingJobsInline();
    revalidatePath('/families');
    revalidatePath('/configuration/families');
    revalidatePath('/configuration/reference-editor');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function previewRemoveAttrFromFamilies(familyCodes: string[], attrKey: string) {
  await assertAdminAccess();

  const errors: string[] = [];

  if (!attrKey || !attrKey.trim()) {
    errors.push('Debes seleccionar un atributo a eliminar');
  }
  if (!familyCodes || familyCodes.length === 0) {
    errors.push('No hay familias seleccionadas');
  }

  if (errors.length > 0) {
    return { success: true, data: { is_valid: false, affected_count: 0, errors, families: [] } };
  }

  const { data, error } = await rpcClient.rpc<PreviewRemoveAttrRow[]>('rpc_preview_remove_attr_from_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const rows = (data || []) as PreviewRemoveAttrRow[];

  return {
    success: true,
    data: {
      is_valid: true,
      affected_count: rows.length,
      errors: [],
      families: rows.map((r) => ({
        family_code: r.family_code,
        total_refs: Number(r.total_refs),
        refs_with_key: Number(r.refs_with_key),
      })),
    }
  };
}

export async function executeRemoveAttrFromFamilies(familyCodes: string[], attrKey: string) {
  await assertAdminAccess();

  const { error } = await rpcClient.rpc<unknown>('rpc_remove_attr_from_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await markNamingStaleForFamilies(familyCodes, null, 'family_attr_remove');
  await processNamingJobsInline();
  revalidatePath('/families');
  revalidatePath('/configuration/reference-editor');
  return { success: true };
}
