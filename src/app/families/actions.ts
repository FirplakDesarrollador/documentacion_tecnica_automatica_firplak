'use server';

import { supabaseServer, dbQuery } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

// --- FILTER OPTIONS ---

export async function getFamiliesFilterOptions() {
  const { data: fams } = await supabaseServer
    .from('families')
    .select('family_code, family_name, product_type, zone_home, manufacturing_process')
    .order('family_code', { ascending: true });

  const rows = (fams || []) as any[];

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

// --- SEARCH ---

export async function searchFamilies(filters: any) {
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

export async function previewMassUpdateFamilies(ids: string[], normalUpdates: any) {
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

// --- EXECUTE MASS UPDATE (normal columns) ---

export async function executeMassUpdateFamilies(ids: string[], normalUpdates: any) {
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
    await dbQuery(`
      UPDATE public.families SET ${setClause}, updated_at = now()
      WHERE family_code IN (${codes})
    `);
    revalidatePath('/configuration/families');
    revalidatePath('/configuration/reference-editor');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// --- LINES MANAGEMENT ---

export async function getAvailableLines() {
  const data = await dbQuery(`
    SELECT DISTINCT line
    FROM public.product_references
    WHERE line IS NOT NULL AND line != ''
      AND line NOT IN (SELECT name_color_sap FROM public.colors)
    ORDER BY line ASC
  `) || [];
  return { success: true, data: data.map((r: any) => r.line).filter(Boolean) };
}

export async function updateFamilyLinesAction(familyCode: string, lines: string[]) {
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
  revalidatePath('/products/reference-editor');
  return { success: true };
}

export async function deleteLineAction(line: string) {
  const safeLine = line.replace(/'/g, "''");

  await dbQuery(`
    UPDATE public.product_references SET line = NULL WHERE line = '${safeLine}';
    UPDATE public.families SET allowed_lines = array_remove(allowed_lines, '${safeLine}') WHERE '${safeLine}' = ANY(allowed_lines);
  `);

  revalidatePath('/families');
  revalidatePath('/products/reference-editor');
  return { success: true };
}

// --- DELETE PREVIEW (show counts before cascade) ---

export async function previewDeleteFamiliesAction(codes: string[]) {
  if (!codes || codes.length === 0) throw new Error('No hay familias seleccionadas');

  const safe = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');

  const { data, error } = await dbQuery(`
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
  if (!codes || codes.length === 0) throw new Error('No hay familias seleccionadas');

  const safe = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');

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

  revalidatePath('/families');
  revalidatePath('/products/reference-editor');
}

// --- SCHEMA CONFIG (FLUJO A, movido desde reference-editor) ---

export async function getFamiliesWithSchema(productTypeFilter?: string) {
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
  const { data, error } = await (supabaseServer as any).rpc('rpc_preview_add_attr_to_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function executeAddAttrToFamilies(familyCodes: string[], attrKey: string, attrDef: any, defaultValue: string) {
  const { error } = await (supabaseServer as any).rpc('rpc_add_attr_to_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey,
    p_attr_def: attrDef,
    p_default_value: defaultValue
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/families');
  revalidatePath('/products/reference-editor');
  return { success: true };
}

export async function previewRemoveAttrFromFamilies(familyCodes: string[], attrKey: string) {
  const { data, error } = await (supabaseServer as any).rpc('rpc_preview_remove_attr_from_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function executeRemoveAttrFromFamilies(familyCodes: string[], attrKey: string) {
  const { error } = await (supabaseServer as any).rpc('rpc_remove_attr_from_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/families');
  revalidatePath('/products/reference-editor');
  return { success: true };
}
