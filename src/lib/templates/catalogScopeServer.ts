import { canonicalizeOverrideAttrs } from '@/lib/engine/effectiveProduct'
import { normalizeWeightKgTotal } from '@/lib/engine/labelParts'
import { PIXELS_PER_MM } from '@/lib/constants'
import { normalizeTemplateFontFamily } from '@/lib/templates/templateTypography'
import {
    normalizeCatalogScope,
    type CatalogScope,
    type CatalogTarget,
    type TemplateBrandScope,
} from './catalogScope'

export type TemplateCatalogSource = {
    id: string
    data_source: string | null
    brand_scope: TemplateBrandScope | null
    private_label_client_name: string | null
    catalog_scope: CatalogScope | null
    width_mm: number | string | null
    height_mm: number | string | null
    template_font_family: string | null
    elements_json?: string | null
    export_filename_format?: string | null
}

export type PersistedTemplateRenderSettings = {
    widthPx: number
    heightPx: number
    templateFontFamily: string
}

export type CatalogTargetContext = Record<string, unknown> & {
    id: string
    code: string
    catalog_scope: CatalogScope
    catalog_target_id: string
    target_scope: CatalogScope
    target_id: string
    final_name_es: string | null
    status: string
    is_exportable: boolean
    inactive_reasons: string[]
}

export type CatalogTargetQuery = {
    scope: CatalogScope
    search?: string | null
    familyCodes?: string[]
    referenceCodes?: string[]
    measures?: string[]
    brandScope?: TemplateBrandScope | null
    privateLabelClientName?: string | null
    limit?: number
    offset?: number
    sort?: 'code' | 'name_length'
}

type HierarchyRow = Record<string, unknown> & {
    total_count?: number | string | null
    family_code?: string | null
    family_name?: string | null
    product_type?: string | null
    zone_home?: string | null
    use_destination?: string | null
    assembled_default?: boolean | null
    allowed_lines?: string[] | null
    rh_default?: boolean | null
    reference_id?: string | null
    reference_code?: string | null
    product_name?: string | null
    designation?: string | null
    line?: string | null
    commercial_measure?: string | null
    width_cm?: number | string | null
    depth_cm?: number | string | null
    height_cm?: number | string | null
    weight_kg?: unknown
    special_label?: string | null
    isometric_path?: string | null
    isometric_asset_id?: string | null
    ref_status?: string | null
    ref_attrs?: unknown
    stacking_max?: number | string | null
    version_id?: string | null
    version_code?: string | null
    sku_base?: string | null
    final_base_name_es?: string | null
    final_base_name_en?: string | null
    validation_status?: string | null
    version_status?: string | null
    version_attrs?: unknown
    version_label?: string | null
    global_version_rule_status?: string | null
    automatic_version_rules?: unknown
    sku_id?: string | null
    sku_complete?: string | null
    sap_description_original?: string | null
    barcode_text?: string | null
    barcode_path?: string | null
    final_complete_name_es?: string | null
    final_complete_name_en?: string | null
    sap_description_recommended_es?: string | null
    sap_description_recommended_en?: string | null
    sku_status?: string | null
    sku_attrs?: unknown
    color_code?: string | null
    color_name?: string | null
}

const CORE_FIRPLAK_SOURCE = 'core_firplak'
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

async function runCatalogQuery<T extends Record<string, unknown>>(query: string): Promise<T[]> {
    const { dbQuery } = await import('@/lib/supabase')
    return await dbQuery(query) as T[]
}

function sqlText(value: string) {
    return `'${value.replace(/'/g, "''")}'`
}

function sqlList(values: string[]) {
    return values.map(sqlText).join(', ')
}

function normalizeText(value: unknown): string | null {
    if (value === null || value === undefined) return null
    const normalized = String(value).trim()
    return normalized || null
}

function parseAttrs(value: unknown): Record<string, unknown> {
    return canonicalizeOverrideAttrs(value)
}

function normalizeStatus(value: unknown): string {
    return normalizeText(value)?.toUpperCase() || 'ACTIVO'
}

function isInactive(value: unknown) {
    return normalizeStatus(value) === 'INACTIVO'
}

function normalizeLimit(limit?: number) {
    const parsed = Number(limit ?? DEFAULT_LIMIT)
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
    return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)))
}

function normalizeOffset(offset?: number) {
    const parsed = Number(offset ?? 0)
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

export function getPersistedTemplateRenderSettings(
    template: Pick<TemplateCatalogSource, 'width_mm' | 'height_mm' | 'template_font_family'>,
): PersistedTemplateRenderSettings | null {
    const widthMm = Number(template.width_mm)
    const heightMm = Number(template.height_mm)
    const widthPx = Math.round(widthMm * PIXELS_PER_MM)
    const heightPx = Math.round(heightMm * PIXELS_PER_MM)

    if (
        !Number.isFinite(widthMm) ||
        !Number.isFinite(heightMm) ||
        widthMm <= 0 ||
        heightMm <= 0 ||
        widthPx < 50 ||
        widthPx > 5000 ||
        heightPx < 50 ||
        heightPx > 5000
    ) {
        return null
    }

    return {
        widthPx,
        heightPx,
        templateFontFamily: normalizeTemplateFontFamily(template.template_font_family),
    }
}

function getScopeTargetColumn(scope: CatalogScope) {
    switch (scope) {
        case 'family': return 'family_code'
        case 'reference': return 'reference_id'
        case 'version': return 'version_id'
        case 'sku': return 'id'
    }
}

function getCatalogTargetOrderBy(scope: CatalogScope, sort: CatalogTargetQuery['sort']) {
    if (sort === 'name_length') {
        switch (scope) {
            case 'family':
                return "LENGTH(COALESCE(f.family_name, f.family_code, '')) DESC, f.family_code ASC"
            case 'reference':
                return "LENGTH(COALESCE(r.product_name, r.designation, r.reference_code, '')) DESC, r.reference_code ASC"
            case 'version':
                return "LENGTH(COALESCE(v.final_base_name_es, v.version_label, v.sku_base, v.version_code, '')) DESC, r.reference_code ASC, v.version_code ASC"
            case 'sku':
                return "LENGTH(COALESCE(s.final_complete_name_es, s.sku_complete, '')) DESC, s.sku_complete ASC"
        }
    }

    switch (scope) {
        case 'family': return 'f.family_code ASC'
        case 'reference': return 'r.reference_code ASC, r.product_name ASC'
        case 'version': return 'r.reference_code ASC, v.version_code ASC, v.sku_base ASC'
        case 'sku': return 's.sku_complete ASC'
    }
}

function getBrandExistsClause(
    scope: CatalogScope,
    targetExpression: string,
    brandScope: TemplateBrandScope | null | undefined,
    privateLabelClientName?: string | null,
) {
    const targetColumn = getScopeTargetColumn(scope)
    const sourceAlias = 'available_sku'

    return `EXISTS (
        SELECT 1
        FROM public.v_ui_generate_list ${sourceAlias}
        WHERE ${sourceAlias}.${targetColumn} = ${targetExpression}
          AND ${getBrandAvailabilityClause(sourceAlias, brandScope, privateLabelClientName)}
    )`
}

function getBrandAvailabilityClause(
    sourceAlias: string,
    brandScope: TemplateBrandScope | null | undefined,
    privateLabelClientName?: string | null,
) {
    const normalizedBrandScope = brandScope === 'private_label' ? 'private_label' : 'firplak'
    const activeClause = `COALESCE(${sourceAlias}.is_exportable, true) = true`
    const brandClause = normalizedBrandScope === 'private_label'
        ? (() => {
            const clientName = normalizeText(privateLabelClientName)
            return clientName
                ? `UPPER(BTRIM(COALESCE(${sourceAlias}.resolved_private_label_client_name, ''))) = UPPER(${sqlText(clientName)})`
                : '1 = 0'
        })()
        : `NULLIF(BTRIM(COALESCE(${sourceAlias}.resolved_private_label_client_name, '')), '') IS NULL`

    return `${activeClause} AND ${brandClause}`
}

function getSearchClause(columns: string[], search?: string | null) {
    const words = String(search || '').trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ''

    return words
        .map((word) => {
            const pattern = sqlText(`%${word}%`)
            return ` AND (${columns.map((column) => `${column} ILIKE ${pattern}`).join(' OR ')})`
        })
        .join('')
}

function getFamilyFilterClause(alias: string, familyCodes?: string[]) {
    const codes = (familyCodes || []).map((code) => String(code).trim()).filter(Boolean)
    return codes.length > 0 ? ` AND ${alias}.family_code IN (${sqlList(codes)})` : ''
}

function getReferenceFilterClause(alias: string, referenceCodes?: string[]) {
    const codes = (referenceCodes || []).map((code) => String(code).trim()).filter(Boolean)
    return codes.length > 0 ? ` AND ${alias}.reference_code IN (${sqlList(codes)})` : ''
}

function getMeasureFilterClause(alias: string, measures?: string[]) {
    const normalizedMeasures = (measures || []).map((measure) => String(measure).trim()).filter(Boolean)
    return normalizedMeasures.length > 0 ? ` AND ${alias}.commercial_measure IN (${sqlList(normalizedMeasures)})` : ''
}

function getFamilyMeasureFilterClause(alias: string, measures?: string[]) {
    const normalizedMeasures = (measures || []).map((measure) => String(measure).trim()).filter(Boolean)
    if (normalizedMeasures.length === 0) return ''

    return ` AND EXISTS (
        SELECT 1
        FROM public.product_references measured_reference
        WHERE measured_reference.family_code = ${alias}.family_code
          AND measured_reference.commercial_measure IN (${sqlList(normalizedMeasures)})
    )`
}

function selectColumns() {
    return `
        f.family_code,
        f.family_name,
        f.product_type,
        f.zone_home,
        f.use_destination,
        f.assembled_default,
        f.allowed_lines,
        f.rh_default,
        r.id AS reference_id,
        r.reference_code,
        r.product_name,
        r.designation,
        r.line,
        r.commercial_measure,
        r.width_cm,
        r.depth_cm,
        r.height_cm,
        r.weight_kg,
        r.special_label,
        r.isometric_path,
        r.isometric_asset_id,
        r.status AS ref_status,
        r.ref_attrs,
        r.stacking_max,
        v.id AS version_id,
        v.version_code,
        v.sku_base,
        v.final_base_name_es,
        v.final_base_name_en,
        v.validation_status,
        v.status AS version_status,
        v.version_attrs,
        v.version_label,
        g.status AS global_version_rule_status,
        g.automatic_version_rules,
        s.id AS sku_id,
        s.sku_complete,
        s.sap_description_original,
        s.barcode_text,
        s.barcode_path,
        s.final_complete_name_es,
        s.final_complete_name_en,
        s.sap_description_recommended_es,
        s.sap_description_recommended_en,
        s.status AS sku_status,
        s.sku_attrs,
        s.color_code,
        c.name_color_sap AS color_name`
}

export function buildCatalogTargetQuery(input: CatalogTargetQuery) {
    const scope = input.scope
    const limit = normalizeLimit(input.limit)
    const offset = normalizeOffset(input.offset)
    const familyFilter = getFamilyFilterClause(scope === 'family' ? 'f' : 'r', input.familyCodes)
    const referenceFilter = scope === 'family'
        ? ''
        : getReferenceFilterClause('r', input.referenceCodes)
    const measureFilter = scope === 'family'
        ? getFamilyMeasureFilterClause('f', input.measures)
        : getMeasureFilterClause('r', input.measures)
    const brandExists = getBrandExistsClause(
        scope,
        scope === 'family'
            ? 'f.family_code'
            : scope === 'reference'
                ? 'r.id'
                : scope === 'version'
                    ? 'v.id'
                    : 's.id',
        input.brandScope,
        input.privateLabelClientName,
    )

    if (scope === 'family') {
        return `
            SELECT
                f.family_code,
                f.family_name,
                f.product_type,
                f.zone_home,
                f.use_destination,
                f.assembled_default,
                f.allowed_lines,
                f.rh_default,
                COUNT(*) OVER() AS total_count
            FROM public.families f
            WHERE ${brandExists}
            ${familyFilter}
            ${measureFilter}
            ${getSearchClause(['f.family_code', 'f.family_name', 'f.product_type'], input.search)}
            ORDER BY ${getCatalogTargetOrderBy(scope, input.sort)}
            LIMIT ${limit} OFFSET ${offset}
        `
    }

    if (scope === 'reference') {
        return `
            SELECT
                ${selectColumns()},
                COUNT(*) OVER() AS total_count
            FROM public.product_references r
            INNER JOIN public.families f ON f.family_code = r.family_code
            LEFT JOIN public.product_versions v ON false
            LEFT JOIN public.global_version_rules g ON false
            LEFT JOIN public.product_skus s ON false
            LEFT JOIN public.colors c ON false
            WHERE COALESCE(r.status, 'ACTIVO') <> 'INACTIVO'
              AND ${brandExists}
            ${familyFilter}
            ${referenceFilter}
            ${measureFilter}
            ${getSearchClause(['r.reference_code', 'r.product_name', 'r.designation', 'f.family_code'], input.search)}
            ORDER BY ${getCatalogTargetOrderBy(scope, input.sort)}
            LIMIT ${limit} OFFSET ${offset}
        `
    }

    if (scope === 'version') {
        return `
            SELECT
                ${selectColumns()},
                COUNT(*) OVER() AS total_count
            FROM public.product_versions v
            INNER JOIN public.product_references r ON r.id = v.reference_id
            INNER JOIN public.families f ON f.family_code = r.family_code
            LEFT JOIN public.global_version_rules g ON g.version_code = v.version_code
            LEFT JOIN public.product_skus s ON false
            LEFT JOIN public.colors c ON false
            WHERE COALESCE(r.status, 'ACTIVO') <> 'INACTIVO'
              AND COALESCE(v.status, 'ACTIVO') <> 'INACTIVO'
              AND COALESCE(g.status, 'ACTIVO') <> 'INACTIVO'
              AND ${brandExists}
            ${familyFilter}
            ${referenceFilter}
            ${measureFilter}
            ${getSearchClause(['v.version_code', 'v.sku_base', 'v.version_label', 'v.final_base_name_es', 'r.reference_code', 'r.product_name'], input.search)}
            ORDER BY ${getCatalogTargetOrderBy(scope, input.sort)}
            LIMIT ${limit} OFFSET ${offset}
        `
    }

    return `
        SELECT
            ${selectColumns()},
            COUNT(*) OVER() AS total_count
        FROM public.product_skus s
        INNER JOIN public.product_versions v ON v.id = s.version_id
        INNER JOIN public.product_references r ON r.id = v.reference_id
        INNER JOIN public.families f ON f.family_code = r.family_code
        LEFT JOIN public.global_version_rules g ON g.version_code = v.version_code
        LEFT JOIN public.colors c ON c.code_4dig = s.color_code
        WHERE COALESCE(r.status, 'ACTIVO') <> 'INACTIVO'
          AND COALESCE(v.status, 'ACTIVO') <> 'INACTIVO'
          AND COALESCE(s.status, 'ACTIVO') <> 'INACTIVO'
          AND COALESCE(g.status, 'ACTIVO') <> 'INACTIVO'
          AND ${brandExists}
        ${familyFilter}
        ${referenceFilter}
        ${measureFilter}
        ${getSearchClause(['s.sku_complete', 's.final_complete_name_es', 'v.final_base_name_es', 's.color_code', 'r.reference_code', 'r.product_name'], input.search)}
        ORDER BY ${getCatalogTargetOrderBy(scope, input.sort)}
        LIMIT ${limit} OFFSET ${offset}
    `
}

function getTargetIdentity(scope: CatalogScope, row: HierarchyRow): CatalogTarget | null {
    if (scope === 'family') {
        const id = normalizeText(row.family_code)
        return id ? { scope, id } : null
    }

    if (scope === 'reference') {
        const id = normalizeText(row.reference_id)
        return id ? { scope, id } : null
    }

    if (scope === 'version') {
        const id = normalizeText(row.version_id)
        return id ? { scope, id } : null
    }

    const id = normalizeText(row.sku_id)
    return id ? { scope, id } : null
}

function getTargetName(scope: CatalogScope, row: HierarchyRow) {
    if (scope === 'family') {
        return normalizeText(row.family_name) || normalizeText(row.family_code) || null
    }
    if (scope === 'reference') {
        return normalizeText(row.product_name) || normalizeText(row.designation) || normalizeText(row.reference_code) || null
    }
    if (scope === 'version') {
        return normalizeText(row.final_base_name_es)
            || normalizeText(row.version_label)
            || normalizeText(row.sku_base)
            || normalizeText(row.version_code)
            || null
    }
    return normalizeText(row.final_complete_name_es) || normalizeText(row.sku_complete) || null
}

function getTargetCode(scope: CatalogScope, row: HierarchyRow) {
    if (scope === 'family') return normalizeText(row.family_code) || ''
    if (scope === 'reference') return normalizeText(row.reference_code) || ''
    if (scope === 'version') return normalizeText(row.version_code) || normalizeText(row.sku_base) || ''
    return normalizeText(row.sku_complete) || ''
}

function getScopeActiveState(scope: CatalogScope, row: HierarchyRow) {
    const reasons: string[] = []
    if (scope === 'reference' || scope === 'version' || scope === 'sku') {
        if (isInactive(row.ref_status)) reasons.push('Referencia inactiva')
    }
    if (scope === 'version' || scope === 'sku') {
        if (isInactive(row.version_status)) reasons.push('Versión inactiva')
        if (isInactive(row.global_version_rule_status)) reasons.push('Regla global de versión inactiva')
    }
    if (scope === 'sku' && isInactive(row.sku_status)) reasons.push('SKU inactivo')
    return { inactiveReasons: reasons, isExportable: reasons.length === 0 }
}

function resolveValue(attrs: Record<string, unknown>, key: string, fallback: unknown = null) {
    const value = attrs[key]
    return value !== undefined && value !== null && value !== '' ? value : fallback
}

function addDynamicAttrs(target: Record<string, unknown>, attrs: Record<string, unknown>) {
    for (const [key, value] of Object.entries(attrs)) {
        if (!/^[a-z][a-z0-9_]*$/i.test(key)) continue
        if (Object.prototype.hasOwnProperty.call(target, key)) continue
        target[key] = value
    }
}

export function buildCatalogTargetContext(scope: CatalogScope, row: HierarchyRow): CatalogTargetContext | null {
    const target = getTargetIdentity(scope, row)
    if (!target) return null

    const rank = scope === 'family' ? 0 : scope === 'reference' ? 1 : scope === 'version' ? 2 : 3
    const familyAttrs: Record<string, unknown> = {
        rh: row.rh_default === true ? 'RH' : 'NA',
        assembled_flag: row.assembled_default === true,
    }
    const refAttrs = rank >= 1 ? parseAttrs(row.ref_attrs) : {}
    const globalVersionAttrs = rank >= 2 && !isInactive(row.global_version_rule_status)
        ? parseAttrs(row.automatic_version_rules)
        : {}
    const versionAttrs = rank >= 2 ? parseAttrs(row.version_attrs) : {}
    const skuAttrs = rank >= 3 ? parseAttrs(row.sku_attrs) : {}
    const effectiveAttrs = {
        ...familyAttrs,
        ...refAttrs,
        ...globalVersionAttrs,
        ...versionAttrs,
        ...skuAttrs,
    }
    const state = getScopeActiveState(scope, row)
    const targetName = getTargetName(scope, row)
    const targetCode = getTargetCode(scope, row)

    const context: Record<string, unknown> = {
        id: target.id,
        code: targetCode,
        catalog_scope: scope,
        catalog_target_id: target.id,
        target_scope: scope,
        target_id: target.id,
        scope_name: targetName,
        scope_code: targetCode,
        familia_code: normalizeText(row.family_code) || '',
        family_code: normalizeText(row.family_code) || '',
        product_type: normalizeText(row.product_type),
        zone_home: normalizeText(row.zone_home),
        rh_default: row.rh_default === true,
        use_destination: resolveValue(refAttrs, 'use_destination', normalizeText(row.use_destination)),
        assembled_flag: Boolean(resolveValue(effectiveAttrs, 'assembled_flag', row.assembled_default === true)),
        allowed_lines: Array.isArray(row.allowed_lines) ? row.allowed_lines : [],
        final_name_es: targetName,
        final_name_en: null,
        status: state.isExportable ? 'ACTIVO' : 'INACTIVO',
        effective_status: state.isExportable ? 'ACTIVO' : 'INACTIVO',
        is_exportable: state.isExportable,
        inactive_reasons: state.inactiveReasons,
        effective_attrs: effectiveAttrs,
        dynamic_attrs: effectiveAttrs,
        _source: 'catalog_scope',
    }

    if (rank >= 1) {
        Object.assign(context, {
            reference_id: normalizeText(row.reference_id),
            ref_code: normalizeText(row.reference_code) || '',
            reference_code: normalizeText(row.reference_code) || '',
            product_name: normalizeText(row.product_name),
            designation: normalizeText(row.designation),
            line: normalizeText(row.line),
            commercial_measure: normalizeText(row.commercial_measure),
            special_label: resolveValue(effectiveAttrs, 'special_label', normalizeText(row.special_label)),
            width_cm: resolveValue(effectiveAttrs, 'width_cm', row.width_cm == null ? null : Number(row.width_cm)),
            depth_cm: resolveValue(effectiveAttrs, 'depth_cm', row.depth_cm == null ? null : Number(row.depth_cm)),
            height_cm: resolveValue(effectiveAttrs, 'height_cm', row.height_cm == null ? null : Number(row.height_cm)),
            weight_kg: resolveValue(effectiveAttrs, 'weight_kg', normalizeWeightKgTotal(row.weight_kg)),
            stacking_max: resolveValue(effectiveAttrs, 'stacking_max', row.stacking_max == null ? null : Number(row.stacking_max)),
            isometric_path: resolveValue(effectiveAttrs, 'isometric_path', normalizeText(row.isometric_path)),
            isometric_asset_id: resolveValue(effectiveAttrs, 'isometric_asset_id', normalizeText(row.isometric_asset_id)),
            ref_status: normalizeStatus(row.ref_status),
        })
    }

    if (rank >= 2) {
        Object.assign(context, {
            version_id: normalizeText(row.version_id),
            version_code: normalizeText(row.version_code) || '',
            sku_base: normalizeText(row.sku_base) || '',
            version_label: resolveValue(effectiveAttrs, 'version_label', normalizeText(row.version_label)),
            final_base_name_es: normalizeText(row.final_base_name_es),
            final_base_name_en: normalizeText(row.final_base_name_en),
            validation_status: normalizeText(row.validation_status) || 'incomplete',
            version_status: normalizeStatus(row.version_status),
            global_version_rule_status: normalizeStatus(row.global_version_rule_status),
            private_label_client_name: resolveValue(effectiveAttrs, 'private_label_client_name', null),
        })
    }

    if (rank >= 3) {
        Object.assign(context, {
            sku_complete: normalizeText(row.sku_complete) || '',
            color_code: normalizeText(row.color_code),
            color_name: resolveValue(effectiveAttrs, 'color_name', normalizeText(row.color_name)),
            name_color_sap: normalizeText(row.color_name),
            sap_description: normalizeText(row.sap_description_original),
            final_complete_name_es: normalizeText(row.final_complete_name_es),
            final_complete_name_en: normalizeText(row.final_complete_name_en),
            sap_description_recommended_es: normalizeText(row.sap_description_recommended_es),
            sap_description_recommended_en: normalizeText(row.sap_description_recommended_en),
            barcode_text: normalizeText(row.barcode_text),
            barcode_path: normalizeText(row.barcode_path),
            sku_status: normalizeStatus(row.sku_status),
        })
        context.final_name_es = normalizeText(row.final_complete_name_es)
        context.final_name_en = normalizeText(row.final_complete_name_en)
    }

    addDynamicAttrs(context, effectiveAttrs)
    return context as CatalogTargetContext
}

export async function listCatalogTargetContexts(input: CatalogTargetQuery) {
    const rows = await runCatalogQuery<HierarchyRow>(buildCatalogTargetQuery(input))
    const contexts = rows
        .map((row) => buildCatalogTargetContext(input.scope, row))
        .filter((context): context is CatalogTargetContext => Boolean(context))

    return {
        targets: contexts,
        totalCount: rows.length > 0 ? Number(rows[0].total_count || 0) : 0,
    }
}

export async function searchCatalogTargets(input: Omit<CatalogTargetQuery, 'limit' | 'offset'>) {
    return listCatalogTargetContexts({ ...input, limit: 12, offset: 0 })
}

function getResolveTargetQuery(target: CatalogTarget) {
    if (target.scope === 'family') {
        return `
            SELECT
                f.family_code,
                f.family_name,
                f.product_type,
                f.zone_home,
                f.use_destination,
                f.assembled_default,
                f.allowed_lines,
                f.rh_default
            FROM public.families f
            WHERE f.family_code = ${sqlText(target.id)}
            LIMIT 1
        `
    }

    if (target.scope === 'reference') {
        return `
            SELECT ${selectColumns()}
            FROM public.product_references r
            INNER JOIN public.families f ON f.family_code = r.family_code
            LEFT JOIN public.product_versions v ON false
            LEFT JOIN public.global_version_rules g ON false
            LEFT JOIN public.product_skus s ON false
            LEFT JOIN public.colors c ON false
            WHERE r.id = ${sqlText(target.id)}
            LIMIT 1
        `
    }

    if (target.scope === 'version') {
        return `
            SELECT ${selectColumns()}
            FROM public.product_versions v
            INNER JOIN public.product_references r ON r.id = v.reference_id
            INNER JOIN public.families f ON f.family_code = r.family_code
            LEFT JOIN public.global_version_rules g ON g.version_code = v.version_code
            LEFT JOIN public.product_skus s ON false
            LEFT JOIN public.colors c ON false
            WHERE v.id = ${sqlText(target.id)}
            LIMIT 1
        `
    }

    return `
        SELECT ${selectColumns()}
        FROM public.product_skus s
        INNER JOIN public.product_versions v ON v.id = s.version_id
        INNER JOIN public.product_references r ON r.id = v.reference_id
        INNER JOIN public.families f ON f.family_code = r.family_code
        LEFT JOIN public.global_version_rules g ON g.version_code = v.version_code
        LEFT JOIN public.colors c ON c.code_4dig = s.color_code
        WHERE s.id = ${sqlText(target.id)}
        LIMIT 1
    `
}

export async function resolveCatalogTargetContext(target: CatalogTarget) {
    const rows = await runCatalogQuery<HierarchyRow>(getResolveTargetQuery(target))
    return rows.length > 0 ? buildCatalogTargetContext(target.scope, rows[0]) : null
}

async function isCatalogTargetAvailableForTemplate(target: CatalogTarget, template: TemplateCatalogSource) {
    const targetColumn = getScopeTargetColumn(target.scope)
    const rows = await runCatalogQuery<Record<string, unknown>>(`
        SELECT 1
        FROM public.v_ui_generate_list available_sku
        WHERE available_sku.${targetColumn} = ${sqlText(target.id)}
          AND ${getBrandAvailabilityClause(
              'available_sku',
              template.brand_scope,
              template.private_label_client_name,
          )}
        LIMIT 1
    `)

    return rows.length > 0
}

export async function getActiveTemplateCatalogSource(templateId: string): Promise<TemplateCatalogSource | null> {
    const rows = await runCatalogQuery<TemplateCatalogSource>(`
        SELECT t.id, t.data_source, t.brand_scope, t.private_label_client_name,
               to_jsonb(t)->>'catalog_scope' AS catalog_scope,
               t.width_mm, t.height_mm, t.template_font_family,
               t.elements_json, t.export_filename_format
        FROM public.plantillas_doc_tec t
        WHERE id = ${sqlText(templateId)}
          AND active = true
        LIMIT 1
    `)

    if (rows.length === 0) return null
    const template = rows[0]
    const dataSource = normalizeText(template.data_source) || CORE_FIRPLAK_SOURCE
    return {
        ...template,
        data_source: dataSource,
        brand_scope: template.brand_scope === 'private_label' ? 'private_label' : 'firplak',
        private_label_client_name: normalizeText(template.private_label_client_name),
        catalog_scope: dataSource === CORE_FIRPLAK_SOURCE
            ? normalizeCatalogScope(template.catalog_scope)
            : null,
    }
}

export async function resolveTemplateCatalogTarget(templateId: string, target: CatalogTarget) {
    const template = await getActiveTemplateCatalogSource(templateId)
    if (!template) return { template: null, context: null, error: 'Plantilla no encontrada o inactiva' }
    if (template.data_source !== CORE_FIRPLAK_SOURCE) {
        return { template, context: null, error: 'La plantilla no usa el catálogo Core' }
    }
    if (template.catalog_scope !== target.scope) {
        return { template, context: null, error: 'La entidad seleccionada no coincide con el alcance de la plantilla' }
    }

    const context = await resolveCatalogTargetContext(target)
    if (!context) return { template, context: null, error: 'La entidad seleccionada no existe' }
    if (!context.is_exportable) {
        return { template, context: null, error: 'La entidad seleccionada está inactiva' }
    }
    if (!await isCatalogTargetAvailableForTemplate(target, template)) {
        return { template, context: null, error: 'La entidad no está disponible para el alcance de marca de la plantilla' }
    }

    return { template, context, error: null }
}
