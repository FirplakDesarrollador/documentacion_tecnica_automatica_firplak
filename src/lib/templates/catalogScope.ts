import type { NamingVariableField, NamingVariableSource } from '@/lib/engine/namingVariableCatalog'
import { isPrintRuntimeVariable } from './printRuntimeVariables'

export type CatalogScope = 'family' | 'reference' | 'version' | 'sku'
export type TemplateBrandScope = 'firplak' | 'private_label'

export type CatalogTarget = {
    scope: CatalogScope
    id: string
}

export type CatalogScopeOption = {
    value: CatalogScope
    label: string
    description: string
}

export function isCatalogScope(value: unknown): value is CatalogScope {
    const normalized = String(value || '').trim().toLowerCase()
    return normalized === 'family' || normalized === 'reference' || normalized === 'version' || normalized === 'sku'
}

export const CATALOG_SCOPE_OPTIONS: CatalogScopeOption[] = [
    { value: 'family', label: 'Familia', description: 'Datos de familia' },
    { value: 'reference', label: 'Referencia', description: 'Familia, referencia y sus atributos' },
    { value: 'version', label: 'Versión', description: 'Familia, referencia, versión y nombre base' },
    { value: 'sku', label: 'SKU completo', description: 'Toda la información, color y SKU' },
]

const SCOPE_RANK: Record<CatalogScope, number> = {
    family: 0,
    reference: 1,
    version: 2,
    sku: 3,
}

const SOURCE_MINIMUM_SCOPE: Record<NamingVariableSource, CatalogScope> = {
    family: 'family',
    reference: 'reference',
    ref_attrs: 'reference',
    version: 'version',
    version_attrs: 'version',
    sku: 'sku',
    color: 'sku',
    sku_attrs: 'sku',
}

const VARIABLE_MINIMUM_SCOPE: Record<string, CatalogScope | 'runtime'> = {
    id: 'family',
    code: 'family',
    catalog_scope: 'family',
    catalog_target_id: 'family',
    target_scope: 'family',
    target_id: 'family',
    scope_name: 'family',
    scope_code: 'family',
    familia_code: 'family',
    family_code: 'family',
    product_type: 'family',
    zone_home: 'family',
    zone_home_en: 'family',
    use_destination: 'family',
    assembled_flag: 'family',
    allowed_lines: 'family',
    rh: 'family',
    rh_default: 'family',
    ref_code: 'reference',
    reference_code: 'reference',
    reference_id: 'reference',
    product_name: 'reference',
    designation: 'reference',
    line: 'reference',
    commercial_measure: 'reference',
    special_label: 'reference',
    width_cm: 'reference',
    depth_cm: 'reference',
    height_cm: 'reference',
    weight_kg: 'reference',
    weight_lb: 'reference',
    stacking_max: 'reference',
    isometric_path: 'reference',
    isometric_asset_id: 'reference',
    partes_texto: 'reference',
    icon_rh: 'reference',
    icon_canto: 'reference',
    icon_bisagras: 'reference',
    icon_riel: 'reference',
    icon_group: 'reference',
    icon_logo: 'runtime',
    logo_empresa: 'runtime',
    caption_es: 'reference',
    caption_en: 'reference',
    icon_rh_caption_es: 'reference',
    icon_rh_caption_en: 'reference',
    icon_canto_caption_es: 'reference',
    icon_canto_caption_en: 'reference',
    icon_bisagras_caption_es: 'reference',
    icon_bisagras_caption_en: 'reference',
    icon_riel_caption_es: 'reference',
    icon_riel_caption_en: 'reference',
    version_id: 'version',
    version_code: 'version',
    sku_base: 'version',
    version_label: 'version',
    final_base_name_es: 'version',
    final_base_name_en: 'version',
    validation_status: 'version',
    version_status: 'version',
    global_version_rule_status: 'version',
    private_label_client_name: 'version',
    sku_complete: 'sku',
    color_code: 'sku',
    color_name: 'sku',
    color: 'sku',
    name_color_sap: 'sku',
    barcode_text: 'sku',
    barcode_path: 'sku',
    sap_description: 'sku',
    final_complete_name_es: 'sku',
    final_complete_name_en: 'sku',
    final_name_es: 'sku',
    final_name_en: 'sku',
    sap_description_recommended_es: 'sku',
    sap_description_recommended_en: 'sku',
    sku_status: 'sku',
    print_datetime: 'runtime',
    of_number: 'runtime',
}

export type TemplateVariableBinding = {
    variable: string
    location: string
}

export type CatalogScopeValidationIssue = TemplateVariableBinding & {
    minimumScope: CatalogScope | null
    reason: 'out_of_scope' | 'unknown'
}

type TemplateElementBindingSource = {
    type?: unknown
    dataField?: unknown
    content?: unknown
    caption?: unknown
}

export function normalizeCatalogScope(value: unknown): CatalogScope {
    return isCatalogScope(value) ? String(value).trim().toLowerCase() as CatalogScope : 'sku'
}

export function isCoreCatalogDataSource(dataSource: unknown) {
    return String(dataSource || 'core_firplak').trim() === 'core_firplak'
}

export function getTemplateCatalogScope(dataSource: unknown, value: unknown): CatalogScope | null {
    return isCoreCatalogDataSource(dataSource) ? normalizeCatalogScope(value) : null
}

export function getCatalogScopeLabel(scope: CatalogScope | null | undefined) {
    const normalized = scope ? normalizeCatalogScope(scope) : null
    return normalized ? CATALOG_SCOPE_OPTIONS.find((option) => option.value === normalized)?.label || 'SKU completo' : 'No aplica'
}

export function getCatalogScopeRank(scope: CatalogScope) {
    return SCOPE_RANK[scope]
}

export function isCatalogScopeAtLeast(scope: CatalogScope, minimumScope: CatalogScope) {
    return getCatalogScopeRank(scope) >= getCatalogScopeRank(minimumScope)
}

export function getNamingVariableMinimumScope(field: string, source?: NamingVariableSource | null): CatalogScope | 'runtime' | null {
    const normalized = String(field || '').trim().toLowerCase()
    if (!normalized) return null
    if (isPrintRuntimeVariable(normalized)) return 'runtime'
    const explicit = VARIABLE_MINIMUM_SCOPE[normalized]
    if (explicit) return explicit
    return source ? SOURCE_MINIMUM_SCOPE[source] : null
}

export function isNamingVariableAvailableForCatalogScope(
    field: string,
    scope: CatalogScope,
    source?: NamingVariableSource | null,
) {
    const minimumScope = getNamingVariableMinimumScope(field, source)
    return minimumScope === 'runtime' || (minimumScope ? isCatalogScopeAtLeast(scope, minimumScope) : false)
}

export function filterNamingVariableFieldsForCatalogScope(fields: NamingVariableField[], scope: CatalogScope) {
    return fields.filter((field) => isNamingVariableAvailableForCatalogScope(field.field, scope, field.source))
}

export function extractPlaceholderVariables(value: unknown): string[] {
    if (typeof value !== 'string' || !value.includes('{')) return []
    const variables = new Set<string>()
    for (const match of value.match(/\{([^}]+)\}/g) || []) {
        const variable = match.slice(1, -1).replace(/<[^>]*>/g, '').trim()
        if (variable) variables.add(variable)
    }
    return Array.from(variables)
}

function appendBindings(bindings: TemplateVariableBinding[], variables: string[], location: string) {
    for (const variable of variables) {
        const normalized = variable.trim()
        if (normalized && !isPrintRuntimeVariable(normalized)) {
            bindings.push({ variable: normalized, location })
        }
    }
}

export function extractTemplateScopeBindings(elements: unknown, exportFilenameFormat?: string | null) {
    const bindings: TemplateVariableBinding[] = []
    if (Array.isArray(elements)) {
        elements.forEach((raw, index) => {
            const element = raw as TemplateElementBindingSource
            const type = String(element?.type || '').trim()
            const location = `Elemento ${index + 1}`
            if ((type === 'dynamic_text' || type === 'barcode' || type === 'dynamic_image') && typeof element?.dataField === 'string') {
                appendBindings(bindings, [element.dataField.replace(/<[^>]*>/g, '').trim()], `${location}: campo dinámico`)
            }
            if (type === 'text') appendBindings(bindings, extractPlaceholderVariables(element?.content), `${location}: texto`)
            if (type === 'dynamic_image') appendBindings(bindings, extractPlaceholderVariables(element?.caption), `${location}: leyenda`)
        })
    }
    appendBindings(bindings, extractPlaceholderVariables(exportFilenameFormat), 'Nombre de exportación')

    const unique = new Map<string, TemplateVariableBinding>()
    for (const binding of bindings) {
        const key = `${binding.variable}:${binding.location}`
        if (!unique.has(key)) unique.set(key, binding)
    }
    return Array.from(unique.values())
}

export function validateTemplateScopeBindings(
    scope: CatalogScope,
    bindings: TemplateVariableBinding[],
    variableSources: ReadonlyMap<string, NamingVariableSource> = new Map(),
) {
    const issues: CatalogScopeValidationIssue[] = []
    for (const binding of bindings) {
        const key = binding.variable.trim().toLowerCase()
        const minimumScope = getNamingVariableMinimumScope(key, variableSources.get(key))
        if (minimumScope === 'runtime') continue
        if (!minimumScope) {
            issues.push({ ...binding, minimumScope: null, reason: 'unknown' })
            continue
        }
        if (!isCatalogScopeAtLeast(scope, minimumScope)) {
            issues.push({ ...binding, minimumScope, reason: 'out_of_scope' })
        }
    }
    return issues
}

export function formatCatalogScopeValidationIssue(issue: CatalogScopeValidationIssue) {
    if (issue.reason === 'unknown') return `${issue.variable} (${issue.location}) no está disponible en el catálogo Core.`
    return `${issue.variable} (${issue.location}) requiere alcance ${getCatalogScopeLabel(issue.minimumScope)}.`
}
