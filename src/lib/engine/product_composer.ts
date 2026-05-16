import { dbQuery } from '@/lib/supabase';

// ============================================================================
// PHASE 1A: COMPOSITION LAYER
// ============================================================================

export interface ComposedProduct {
    // === Identity ===
    id: string;
    code: string;
    familia_code: string;
    ref_code: string;
    version_code: string;
    color_code: string;
    sku_base: string;

    // === Family-level ===
    product_type: string | null;
    zone_home: string | null;
    use_destination: string | null;
    assembled_flag: boolean;
    allowed_lines: string[];

    // === Reference-level ===
    cabinet_name: string | null;
    designation: string | null;
    line: string | null;
    commercial_measure: string | null;
    special_label: string | null;
    width_cm: number | null;
    depth_cm: number | null;
    height_cm: number | null;
    weight_kg: number | null;
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

    // === Version-level ===
    version_label: string | null;
    final_name_es: string | null;
    final_name_en: string | null;
    validation_status: string;

    // === SKU-level ===
    sap_description: string | null;
    final_complete_name_es: string | null;
    final_complete_name_en: string | null;
    barcode_text: string | null;
    barcode_path: string | null;
    status: string;
    ref_status: string;

    // === Private label (from version rules or version_attrs) ===
    private_label_flag: boolean;
    private_label_client_name: string | null;

    // === Color ===
    color_name: string | null;

    // === Metadata ===
    _source: 'composed';
    dynamic_attrs: Record<string, string>;
}

const BASE_QUERY = `
    SELECT 
        s.id, s.sku_complete, s.color_code, s.sap_description_original,
        s.final_complete_name_es, s.final_complete_name_en,
        s.barcode_text, s.barcode_path, s.status, s.sku_attrs,
        
        v.version_code, v.sku_base, v.final_base_name_es,
        v.final_base_name_en, v.validation_status,
        v.version_label, v.version_attrs,
        
        r.reference_code, r.product_name, r.status AS ref_status,
        r.designation, r.line, r.commercial_measure,
        r.special_label, r.width_cm, r.depth_cm, r.height_cm,
        r.weight_kg, r.stacking_max, r.isometric_path,
        r.isometric_asset_id, r.ref_attrs,
        
        f.family_code, f.family_name, f.product_type, f.zone_home,
        f.use_destination, f.manufacturing_process,
        f.assembled_default, f.rh_default, f.allowed_lines,
        
        gvr.automatic_version_rules,
        
        c.name_color_sap
    FROM public.product_skus s
    JOIN public.product_versions v ON s.version_id = v.id
    JOIN public.product_references r ON v.reference_id = r.id
    JOIN public.families f ON r.family_code = f.family_code
    LEFT JOIN public.global_version_rules gvr ON v.version_code = gvr.version_code
    LEFT JOIN public.colors c ON s.color_code = c.code_4dig
`;

export function mapRowToComposedProduct(row: any): ComposedProduct {
    // Parse JSONB fields (dbQuery returns objects, but just in case it's a string, we handle it)
    const refAttrs = typeof row.ref_attrs === 'string' ? JSON.parse(row.ref_attrs) : (row.ref_attrs || {});
    const globalVerRules = typeof row.automatic_version_rules === 'string' ? JSON.parse(row.automatic_version_rules) : (row.automatic_version_rules || {});
    const verAttrs = typeof row.version_attrs === 'string' ? JSON.parse(row.version_attrs) : (row.version_attrs || {});
    
    // Level 3 & 4: Merge overrides
    const versionOverrides = { ...globalVerRules, ...verAttrs };

    // Prefer DB-computed attrs if present (v_ui_generate_list exposes it)
    const effectiveVerAttrs = (() => {
        if (row.effective_version_attrs === undefined || row.effective_version_attrs === null) return versionOverrides;
        return typeof row.effective_version_attrs === 'string'
            ? JSON.parse(row.effective_version_attrs)
            : (row.effective_version_attrs || {});
    })();

    // Function to resolve attribute with precedence: Version Override > Reference Base > Default
    const resolveAttr = (key: string, defaultValue: string = 'NA') => {
        return effectiveVerAttrs[key] !== undefined ? effectiveVerAttrs[key] : (refAttrs[key] || defaultValue);
    };

    const normalizePrivateLabelName = (val: any): string | null => {
        if (val === null || val === undefined) return null;
        const name = String(val).trim();
        if (!name) return null;
        if (name.toUpperCase() === 'NA') return null;
        return name;
    };

    const privateLabelName =
        normalizePrivateLabelName(row.private_label_client_name) ??
        normalizePrivateLabelName(effectiveVerAttrs.private_label_client_name);

    const skuAttrs = typeof row.sku_attrs === 'string' ? JSON.parse(row.sku_attrs) : (row.sku_attrs || {});
    const dynamic_attrs = { ...refAttrs, ...effectiveVerAttrs, ...skuAttrs };

    return {
        // === Identity ===
        id: row.id,
        code: row.sku_complete,
        familia_code: row.family_code,
        ref_code: row.reference_code,
        version_code: row.version_code,
        color_code: row.color_code,
        sku_base: row.sku_base,

        // === Family-level ===
        product_type: row.product_type,
        zone_home: row.zone_home,
        use_destination: row.use_destination,
        assembled_flag: row.assembled_default || false,
        allowed_lines: Array.isArray(row.allowed_lines) ? row.allowed_lines : [],

        // === Reference-level ===
        cabinet_name: row.product_name,
        designation: row.designation,
        line: row.line,
        commercial_measure: row.commercial_measure,
        special_label: row.special_label,
        width_cm: row.width_cm !== null ? parseFloat(row.width_cm) : null,
        depth_cm: row.depth_cm !== null ? parseFloat(row.depth_cm) : null,
        height_cm: row.height_cm !== null ? parseFloat(row.height_cm) : null,
        weight_kg: row.weight_kg !== null ? parseFloat(row.weight_kg) : null,
        stacking_max: row.stacking_max !== null ? parseInt(row.stacking_max, 10) : null,
        isometric_path: effectiveVerAttrs.isometric_path || row.isometric_path,
        isometric_asset_id: effectiveVerAttrs.isometric_asset_id || row.isometric_asset_id,

        // === Composed attributes ===
        rh: resolveAttr('rh'),
        carb2: resolveAttr('carb2'),
        bisagras: resolveAttr('bisagras'),
        canto_puertas: resolveAttr('canto_puertas'),
        accessory_text: resolveAttr('accessory_text'),
        door_color_text: resolveAttr('door_color_text'),
        armado_con_lvm: resolveAttr('armado_con_lvm'),

        // === Version-level ===
        version_label: row.version_label,
        final_name_es: row.final_base_name_es,
        final_name_en: row.final_base_name_en,
        validation_status: row.validation_status || 'incomplete',

        // === SKU-level ===
        sap_description: row.sap_description_original,
        final_complete_name_es: row.final_complete_name_es,
        final_complete_name_en: row.final_complete_name_en,
        barcode_text: row.barcode_text,
        barcode_path: row.barcode_path,
        status: row.status || 'ACTIVO',
        ref_status: row.ref_status || 'ACTIVO',

        // === Private label ===
        private_label_flag: privateLabelName !== null,
        private_label_client_name: privateLabelName,

        // === Color ===
        color_name: row.name_color_sap,

        // === Metadata ===
        _source: 'composed',
        dynamic_attrs
    };
}

export async function composeProductBySku(skuComplete: string): Promise<ComposedProduct | null> {
    const rows = await dbQuery(`${BASE_QUERY} WHERE s.sku_complete = $1 LIMIT 1`, [skuComplete]);
    if (!rows || rows.length === 0) return null;
    return mapRowToComposedProduct(rows[0]);
}

export async function composeProductById(id: string): Promise<ComposedProduct | null> {
    const rows = await dbQuery(`${BASE_QUERY} WHERE s.id = $1 LIMIT 1`, [id]);
    if (!rows || rows.length === 0) return null;
    return mapRowToComposedProduct(rows[0]);
}

import { supabaseServer } from '@/lib/supabase';

export interface ProductFilters {
    families?: string[];
    references?: string[];
    measures?: string[];
}

export async function composeProductsByFilters(
    filters: ProductFilters, 
    limit: number = 200
): Promise<{ products: ComposedProduct[], totalCount: number }> {
    let query = supabaseServer.from('v_ui_generate_list').select('*', { count: 'exact' })
    
    query = query.eq('status', 'ACTIVO')
    
    if (filters.families && filters.families.length > 0) {
        query = query.in('family_code', filters.families)
    }
    if (filters.references && filters.references.length > 0) {
        query = query.in('reference_code', filters.references)
    }
    if (filters.measures && filters.measures.length > 0) {
        query = query.in('commercial_measure', filters.measures)
    }
    
    query = query.order('sku_complete', { ascending: true }).limit(limit)
    
    const { data, count, error } = await query
    
    if (error) {
        console.error('Error fetching v_ui_generate_list:', error)
        throw new Error(`Data API Query Error: ${error.message}`)
    }
    
    if (!data || !Array.isArray(data)) return { products: [], totalCount: 0 };
    return {
        products: data.map(mapRowToComposedProduct),
        totalCount: count ?? 0
    };
}

