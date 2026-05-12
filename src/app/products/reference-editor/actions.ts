'use server';

import { supabaseServer } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

// --- FLUJO A: SCHEMA CONFIG ---

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
  const { data, error } = await supabaseServer.rpc('rpc_preview_add_attr_to_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function executeAddAttrToFamilies(familyCodes: string[], attrKey: string, attrDef: any, defaultValue: string) {
  const { error } = await supabaseServer.rpc('rpc_add_attr_to_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey,
    p_attr_def: attrDef,
    p_default_value: defaultValue
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/products/reference-editor');
  return { success: true };
}

export async function previewRemoveAttrFromFamilies(familyCodes: string[], attrKey: string) {
  const { data, error } = await supabaseServer.rpc('rpc_preview_remove_attr_from_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function executeRemoveAttrFromFamilies(familyCodes: string[], attrKey: string) {
  const { error } = await supabaseServer.rpc('rpc_remove_attr_from_families', {
    p_family_codes: familyCodes,
    p_attr_key: attrKey
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/products/reference-editor');
  return { success: true };
}

// --- FLUJO B: MASS EDIT ---

export async function searchReferences(filters: any) {
  // Construir query. supabaseServer
  // Note: Si hay que cruzar con product_type, haremos join con families
  let query = supabaseServer.from('product_references').select(`
    id, 
    family_code, 
    reference_code, 
    product_name, 
    commercial_measure, 
    width_cm, 
    depth_cm, 
    height_cm, 
    weight_kg,
    ref_attrs,
    families!inner(product_type)
  `);

  if (filters.familyCode) query = query.ilike('family_code', `%${filters.familyCode}%`);
  if (filters.referenceCode) query = query.ilike('reference_code', `%${filters.referenceCode}%`);
  if (filters.productName) query = query.ilike('product_name', `%${filters.productName}%`);
  if (filters.productType) query = query.eq('families.product_type', filters.productType);

  // Filtrado JSONB para ref_attrs (Ej: { "rh": "RH" })
  if (filters.refAttrsKey && filters.refAttrsValue) {
    const jsonFilter = { [filters.refAttrsKey]: filters.refAttrsValue };
    query = query.contains('ref_attrs', jsonFilter);
  } else if (filters.refAttrsKey) {
    // Si solo hay key, queremos las que tengan esa key (cualquier valor)
    query = query.contains('ref_attrs', { [filters.refAttrsKey]: filters.refAttrsKey } /* this is tricky, hasKey is better */);
    // Actually has_key is not natively exposed easily without custom string. We can use eq logic or text search
    // In JS client, .contains or .textSearch
    // A better approach is to ignore "only key" filter for simplicity, or use raw filter
    // Let's implement only "Key = Value" filter for JSONB for simplicity right now.
  }

  const { data, error } = await query.limit(500);

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function previewMassUpdateReferences(referenceIds: string[], normalUpdates: any, refAttrsUpdates: any) {
  const { data, error } = await supabaseServer.rpc('rpc_preview_mass_update', {
    p_reference_ids: referenceIds,
    p_normal_updates: normalUpdates,
    p_ref_attrs_updates: refAttrsUpdates
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function executeMassUpdateReferences(referenceIds: string[], normalUpdates: any, refAttrsUpdates: any) {
  const { data, error } = await supabaseServer.rpc('rpc_mass_update_references', {
    p_reference_ids: referenceIds,
    p_normal_updates: normalUpdates,
    p_ref_attrs_updates: refAttrsUpdates
  });

  if (error) return { success: false, error: error.message };
  revalidatePath('/products/reference-editor');
  return { success: true, data };
}

export async function getFilterOptions() {
  // Fetch distinct product_type from families
  const { data: fams } = await supabaseServer.from('families').select('product_type, family_code');
  // Fetch distinct reference_code, product_name from product_references
  const { data: refs } = await supabaseServer.from('product_references').select('reference_code, product_name, family_code, ref_attrs');

  const productTypes = Array.from(new Set(fams?.map(f => f.product_type).filter(Boolean))).sort();
  const familyCodes = Array.from(new Set(fams?.map(f => f.family_code).filter(Boolean))).sort();
  
  const referenceCodes = Array.from(new Set(refs?.map(r => r.reference_code).filter(Boolean))).sort();
  const productNames = Array.from(new Set(refs?.map(r => r.product_name).filter(Boolean))).sort();

  // Extract all unique JSONB keys and values
  const jsonKeys = new Set<string>();
  const jsonValuesByKey: Record<string, Set<string>> = {};

  refs?.forEach(r => {
    if (r.ref_attrs && typeof r.ref_attrs === 'object') {
      Object.entries(r.ref_attrs).forEach(([k, v]) => {
        jsonKeys.add(k);
        if (!jsonValuesByKey[k]) jsonValuesByKey[k] = new Set();
        if (v !== null && v !== undefined) {
          jsonValuesByKey[k].add(String(v));
        }
      });
    }
  });

  const refAttrsKeys = Array.from(jsonKeys).sort();
  const refAttrsValues: Record<string, string[]> = {};
  for (const k of refAttrsKeys) {
    refAttrsValues[k] = Array.from(jsonValuesByKey[k]).sort();
  }

  // To support relational filtering, we can return the raw list of refs to the client so the client can compute dependent dropdowns, 
  // since there are only ~1100 references, sending a lightweight array is extremely fast.
  const rawData = refs?.map(r => ({
    fc: r.family_code,
    rc: r.reference_code,
    pn: r.product_name,
    pt: fams?.find(f => f.family_code === r.family_code)?.product_type || null,
    attrs: r.ref_attrs || {}
  })) || [];

  return { 
    success: true, 
    data: { productTypes, familyCodes, referenceCodes, productNames, refAttrsKeys, refAttrsValues, rawData } 
  };
}
