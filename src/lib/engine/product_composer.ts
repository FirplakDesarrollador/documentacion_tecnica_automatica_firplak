import { dbQuery } from '@/lib/supabase';
import { buildEffectiveProductContext, type EffectiveContextOptions } from './effectiveProduct';
import { normalizeWeightKgTotal } from './labelParts';

// ============================================================================
// PHASE 1A: COMPOSITION LAYER
// ============================================================================

interface ViewProductRow {
    [key: string]: unknown
    id: string
    version_id: string | null
    reference_id: string | null
    sku_complete: string
    family_code: string
    reference_code: string
    version_code: string
    color_code: string
    sku_base: string
    product_type: string | null
    zone_home: string | null
    use_destination: string | null
    assembled_default: boolean | null
    allowed_lines: string | string[] | null
    product_name: string | null
    designation: string | null
    line: string | null
    commercial_measure: string | null
    version_label: string | null
    final_base_name_es: string | null
    final_base_name_en: string | null
    validation_status: string | null
    sap_description_original: string | null
    final_complete_name_es: string | null
    final_complete_name_en: string | null
    sap_description_recommended_es?: string | null
    sap_description_recommended_en?: string | null
    barcode_text: string | null
    barcode_path: string | null
    isometric_path: string | null
    isometric_asset_id: string | null
    weight_kg?: unknown
    weight_kg_payload?: unknown
    resolved_weight_kg?: unknown
}

export interface ComposedProduct {
    // === Identity ===
    id: string;
    version_id?: string | null;
    reference_id?: string | null;
    code: string;
    familia_code: string;
    ref_code: string;
    version_code: string;
    color_code: string;
    sku_base: string;
    sku_complete: string;

    // === Family-level ===
    product_type: string | null;
    zone_home: string | null;
    use_destination: string | null;
    assembled_flag: boolean;
    allowed_lines: string[];

    // === Reference-level ===
    product_name: string | null;
    designation: string | null;
    line: string | null;
    commercial_measure: string | null;
    special_label: string | null;
    width_cm: number | null;
    depth_cm: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    weight_kg_payload?: unknown;
    stacking_max: number | null;
    isometric_path: string | null;
    isometric_asset_id: string | null;

    // === Composed attributes (ref_attrs + overrides) ===
    rh: string;
    carb2: string;
    bisagras: string;
    canto_puertas: string;
    accessory_text: string;
    door_color_text: string;
    armado_con_lvm: string;
    pur: string;

    // === Version-level ===
    version_label: string | null;
    final_base_name_es: string | null;
    final_base_name_en: string | null;
    final_name_es: string | null;
    final_name_en: string | null;
    validation_status: string;

    // === SKU-level ===
    sap_description: string | null;
    final_complete_name_es: string | null;
    final_complete_name_en: string | null;
    sap_description_recommended_es?: string | null;
    sap_description_recommended_en?: string | null;
    barcode_text: string | null;
    barcode_path: string | null;
    status: string;
    version_status: string;
    ref_status: string;
    family_status: string;
    global_version_rule_status: string;
    effective_status: string;
    is_exportable: boolean;
    inactive_reasons: string[];

    private_label_client_name: string | null;

    // === Color ===
    color_name: string | null;

    // === Metadata ===
    _source: 'composed';
    effective_attrs: Record<string, unknown>;
    dynamic_attrs: Record<string, unknown>;
}

const BASE_QUERY = `SELECT * FROM public.v_ui_generate_list`;

export function mapRowToComposedProduct(row: ViewProductRow, options: EffectiveContextOptions = {}): ComposedProduct {
    const effectiveContext = buildEffectiveProductContext(row, options);
    const effectiveAttrs = effectiveContext.effective_attrs;
    const referenceWeightPayload = row.weight_kg_payload ?? row.weight_kg;

    const resolveAttr = (key: string, defaultValue: string = 'NA') => {
        const value = effectiveAttrs[key];
        return value !== undefined && value !== null ? String(value) : defaultValue;
    };
    const resolveOptionalString = (value: unknown) =>
        value !== undefined && value !== null && value !== '' ? String(value) : null;

    return {
        // === Identity ===
        id: row.id,
        version_id: row.version_id ?? null,
        reference_id: row.reference_id ?? null,
        code: row.sku_complete,
        familia_code: row.family_code,
        ref_code: row.reference_code,
        version_code: row.version_code,
        color_code: row.color_code,
        sku_base: row.sku_base,
        sku_complete: row.sku_complete,

        // === Family-level ===
        product_type: row.product_type,
        zone_home: row.zone_home,
        use_destination: effectiveContext.resolved_use_destination,
        assembled_flag: row.assembled_default || false,
        allowed_lines: Array.isArray(row.allowed_lines) ? row.allowed_lines : [],

        // === Reference-level ===
        product_name: row.product_name,
        designation: row.designation,
        line: row.line,
        commercial_measure: row.commercial_measure,
        special_label: effectiveContext.resolved_special_label,
        width_cm: effectiveContext.resolved_width_cm,
        depth_cm: effectiveContext.resolved_depth_cm,
        height_cm: effectiveContext.resolved_height_cm,
        weight_kg: effectiveContext.resolved_weight_kg ?? normalizeWeightKgTotal(referenceWeightPayload),
        weight_kg_payload: referenceWeightPayload,
        stacking_max: effectiveContext.resolved_stacking_max !== null
            ? parseInt(String(effectiveContext.resolved_stacking_max), 10)
            : null,
        isometric_path: resolveOptionalString(effectiveAttrs.isometric_path) || row.isometric_path,
        isometric_asset_id: resolveOptionalString(effectiveAttrs.isometric_asset_id) || row.isometric_asset_id,

        // === Composed attributes ===
        rh: resolveAttr('rh'),
        carb2: resolveAttr('carb2'),
        bisagras: resolveAttr('bisagras'),
        canto_puertas: resolveAttr('canto_puertas'),
        accessory_text: resolveAttr('accessory_text'),
        door_color_text: resolveAttr('door_color_text'),
        armado_con_lvm: resolveAttr('armado_con_lvm'),
        pur: resolveAttr('pur'),

        // === Version-level ===
        version_label: (effectiveAttrs.version_label !== undefined && effectiveAttrs.version_label !== null)
            ? String(effectiveAttrs.version_label)
            : row.version_label,
        final_base_name_es: row.final_base_name_es,
        final_base_name_en: row.final_base_name_en,
        final_name_es: row.final_complete_name_es,
        final_name_en: row.final_complete_name_en,
        validation_status: row.validation_status || 'incomplete',

        // === SKU-level ===
        sap_description: row.sap_description_original,
        final_complete_name_es: row.final_complete_name_es,
        final_complete_name_en: row.final_complete_name_en,
        sap_description_recommended_es: row.sap_description_recommended_es ?? null,
        sap_description_recommended_en: row.sap_description_recommended_en ?? null,
        barcode_text: row.barcode_text,
        barcode_path: row.barcode_path,
        status: effectiveContext.sku_status,
        version_status: effectiveContext.version_status,
        ref_status: effectiveContext.ref_status,
        family_status: effectiveContext.family_status,
        global_version_rule_status: effectiveContext.global_version_rule_status,
        effective_status: effectiveContext.effective_status,
        is_exportable: effectiveContext.is_exportable,
        inactive_reasons: effectiveContext.inactive_reasons,

        private_label_client_name: effectiveContext.resolved_private_label_client_name,

        // === Color ===
        color_name: effectiveContext.resolved_color_name,

        // === Metadata ===
        _source: 'composed',
        effective_attrs: effectiveAttrs,
        dynamic_attrs: effectiveAttrs
    };
}

export async function composeProductBySku(skuComplete: string): Promise<ComposedProduct | null> {
    const rows = await dbQuery(`${BASE_QUERY} WHERE sku_complete = $1 LIMIT 1`, [skuComplete]) as ViewProductRow[];
    if (!rows || rows.length === 0) return null;
    return mapRowToComposedProduct(rows[0]);
}

export async function composeProductById(id: string): Promise<ComposedProduct | null> {
    const rows = await dbQuery(`${BASE_QUERY} WHERE id = $1 LIMIT 1`, [id]) as ViewProductRow[];
    if (!rows || rows.length === 0) return null;
    return mapRowToComposedProduct(rows[0]);
}

import { supabaseServer } from '@/lib/supabase';

export interface ProductFilters {
    families?: string[];
    references?: string[];
    measures?: string[];
    search?: string;
    brandFilter?:
        | { scope: 'firplak' }
        | { scope: 'private_label'; clientName: string };
}

export async function composeProductsByFilters(
    filters: ProductFilters, 
    limit: number = 200,
    offset: number = 0
): Promise<{ products: ComposedProduct[], totalCount: number }> {
    let query = supabaseServer.from('v_ui_generate_list').select('*', { count: 'exact' })

    if (filters.families && filters.families.length > 0) {
        query = query.in('family_code', filters.families)
    }
    if (filters.references && filters.references.length > 0) {
        query = query.in('reference_code', filters.references)
    }
    if (filters.measures && filters.measures.length > 0) {
        query = query.in('commercial_measure', filters.measures)
    }
    if (filters.search) {
        const words = filters.search.toLowerCase().trim().split(/\s+/).filter(Boolean)
        const searchableFields = ['sku_complete', 'final_complete_name_es', 'final_base_name_es', 'color_code', 'resolved_color_name', 'name_color_sap', 'reference_code']
        for (const word of words) {
            const orClauses = searchableFields.map(f => `${f}.ilike.%${word}%`).join(',')
            query = query.or(orClauses)
        }
    }

    if (filters.brandFilter) {
        if (filters.brandFilter.scope === 'firplak') {
            query = query.is('resolved_private_label_client_name', null)
        } else if (filters.brandFilter.scope === 'private_label') {
            const clientName = String(filters.brandFilter.clientName || '').trim()
            if (clientName) {
                query = query.ilike('resolved_private_label_client_name', clientName)
            } else {
                query = query.eq('id', '00000000-0000-0000-0000-000000000000')
            }
        }
    }
    
    query = query
        .order('is_exportable', { ascending: false })
        .order('sku_complete', { ascending: true })
        .range(offset, offset + limit - 1)
    
    const { data, count, error } = await query
    
    if (error) {
        console.error('Error fetching v_ui_generate_list:', error)
        throw new Error(`Data API Query Error: ${error.message}`)
    }
    
    if (!data || !Array.isArray(data)) return { products: [], totalCount: 0 };
    return {
        products: data.map((row: ViewProductRow) => mapRowToComposedProduct(row)),
        totalCount: count ?? 0
    };
}
