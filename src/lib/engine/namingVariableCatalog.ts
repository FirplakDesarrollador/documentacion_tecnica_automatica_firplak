export type NamingVariableType = 'text' | 'boolean' | 'number'

export type NamingVariableSource =
    | 'family'
    | 'reference'
    | 'version'
    | 'sku'
    | 'color'
    | 'ref_attrs'
    | 'version_attrs'
    | 'sku_attrs'

export interface NamingVariableField {
    field: string
    label: string
    type: NamingVariableType
    source: NamingVariableSource
}

export const NAMING_VARIABLE_SOURCE_LABELS: Record<NamingVariableSource, string> = {
    family: 'Familia',
    reference: 'Referencia',
    version: 'Version',
    sku: 'SKU',
    color: 'Color',
    ref_attrs: 'Atributos referencia',
    version_attrs: 'Atributos version',
    sku_attrs: 'Atributos SKU',
}

export const BASE_NAMING_VARIABLE_FIELDS: NamingVariableField[] = [
    { field: 'product_type', label: 'Tipo de producto', type: 'text', source: 'family' },
    { field: 'zone_home', label: 'Zona', type: 'text', source: 'family' },
    { field: 'use_destination', label: 'Destino de uso', type: 'text', source: 'family' },
    { field: 'assembled_flag', label: 'Armado', type: 'boolean', source: 'family' },

    { field: 'product_name', label: 'Nombre del producto', type: 'text', source: 'reference' },
    { field: 'designation', label: 'Designacion', type: 'text', source: 'reference' },
    { field: 'line', label: 'Linea', type: 'text', source: 'reference' },
    { field: 'commercial_measure', label: 'Medida comercial', type: 'text', source: 'reference' },
    { field: 'special_label', label: 'Marca especial', type: 'text', source: 'reference' },
    { field: 'width_cm', label: 'Ancho cm', type: 'number', source: 'reference' },
    { field: 'depth_cm', label: 'Profundidad cm', type: 'number', source: 'reference' },
    { field: 'height_cm', label: 'Alto cm', type: 'number', source: 'reference' },
    { field: 'weight_kg', label: 'Peso kg', type: 'number', source: 'reference' },
    { field: 'stacking_max', label: 'Apilamiento maximo', type: 'number', source: 'reference' },

    { field: 'version_label', label: 'Etiqueta de version', type: 'text', source: 'version' },
    { field: 'version_code', label: 'Codigo version', type: 'text', source: 'version' },
    { field: 'sku_base', label: 'Codigo base SKU', type: 'text', source: 'version' },

    { field: 'code', label: 'Codigo SKU', type: 'text', source: 'sku' },
    { field: 'sku_complete', label: 'SKU completo', type: 'text', source: 'sku' },
    { field: 'barcode_text', label: 'Codigo de barras', type: 'text', source: 'sku' },

    { field: 'color_name', label: 'Nombre del color', type: 'text', source: 'color' },
    { field: 'color_code', label: 'Codigo del color', type: 'text', source: 'color' },

    { field: 'accessory_text', label: 'Accesorio', type: 'text', source: 'ref_attrs' },
    { field: 'door_color_text', label: 'Color de puerta', type: 'text', source: 'ref_attrs' },
    { field: 'canto_puertas', label: 'Canto puertas', type: 'text', source: 'ref_attrs' },
    { field: 'rh', label: 'RH', type: 'text', source: 'ref_attrs' },
    { field: 'pur', label: 'PUR', type: 'text', source: 'ref_attrs' },
    { field: 'armado_con_lvm', label: 'Kit lavamanos', type: 'text', source: 'ref_attrs' },
    { field: 'carb2', label: 'Certificacion CARB2', type: 'text', source: 'ref_attrs' },
    { field: 'private_label_client_name', label: 'Cliente marca propia', type: 'text', source: 'ref_attrs' },
]

const INTERNAL_DYNAMIC_KEYS = new Set([
    'id',
    'created_at',
    'updated_at',
    'createdat',
    'updatedat',
    'status',
    'validation_status',
    'isometric_path',
    'isometric_asset_id',
    'final_name_es',
    'final_name_en',
    'final_base_name_es',
    'final_base_name_en',
    'final_complete_name_es',
    'final_complete_name_en',
    'sap_description_recommended_es',
    'sap_description_recommended_en',
    'naming_stale',
    'naming_stale_at',
    'naming_recomputed_at',
])

export function normalizeNamingVariableKey(key: string) {
    return String(key || '').trim().toLowerCase()
}

export function isAllowedDynamicNamingKey(key: string) {
    const normalized = normalizeNamingVariableKey(key)
    return /^[a-z][a-z0-9_]*$/.test(normalized) && !INTERNAL_DYNAMIC_KEYS.has(normalized)
}

export function humanizeNamingVariableKey(key: string) {
    return normalizeNamingVariableKey(key)
        .split('_')
        .filter(Boolean)
        .map(part => part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

export function mergeNamingVariableFields(fields: NamingVariableField[]) {
    const merged = new Map<string, NamingVariableField>()
    for (const field of fields) {
        const key = normalizeNamingVariableKey(field.field)
        if (!key || !isAllowedDynamicNamingKey(key)) continue
        if (!merged.has(key)) {
            merged.set(key, {
                ...field,
                field: key,
                label: field.label || humanizeNamingVariableKey(key),
            })
        }
    }
    return Array.from(merged.values())
}
