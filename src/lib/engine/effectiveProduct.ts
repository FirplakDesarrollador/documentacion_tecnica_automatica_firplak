import { normalizeWeightKgTotal } from './labelParts'

type AttrRecord = Record<string, unknown>

export interface EffectiveContextOptions {
    includeSkuOverrides?: boolean
}

export interface EffectiveProductContext {
    family_defaults: AttrRecord
    ref_attrs: AttrRecord
    global_version_rules: AttrRecord
    version_attrs: AttrRecord
    sku_attrs: AttrRecord
    effective_attrs: AttrRecord
    sku_status: string
    version_status: string
    ref_status: string
    family_status: string
    global_version_rule_status: string
    effective_status: string
    is_exportable: boolean
    inactive_reasons: string[]
    resolved_color_name: string | null
    resolved_private_label_client_name: string | null
    resolved_special_label: string | null
    resolved_width_cm: number | null
    resolved_depth_cm: number | null
    resolved_height_cm: number | null
    resolved_weight_kg: number | null
    resolved_stacking_max: number | null
    resolved_use_destination: string | null
}

const OVERRIDE_KEY_ALIASES: Record<string, string> = {
    client_name: 'private_label_client_name',
}

const PLACEHOLDER_VALUES = new Set(['', 'NA', 'N/A', 'NULL', 'UNDEFINED'])
const REFERENCE_ONLY_EFFECTIVE_KEYS = new Set(['use_destination'])

function isPlainObject(value: unknown): value is AttrRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAttrs(input: unknown): AttrRecord {
    if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input)
            return isPlainObject(parsed) ? parsed : {}
        } catch {
            return {}
        }
    }
    return isPlainObject(input) ? input : {}
}

function normalizeText(value: unknown): string | null {
    if (value === null || value === undefined) return null
    const normalized = String(value).trim()
    if (!normalized) return null
    if (PLACEHOLDER_VALUES.has(normalized.toUpperCase())) return null
    return normalized
}

function normalizeDestination(value: unknown): string | null {
    const normalized = normalizeText(value)
    return normalized ? normalized.toUpperCase() : null
}

function normalizeNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
    return normalizeWeightKgTotal(value)
}

function normalizeStatus(value: unknown, fallback: string = 'ACTIVO'): string {
    const normalized = normalizeText(value)
    return normalized ? normalized.toUpperCase() : fallback
}

function buildInactiveReasons(statuses: {
    skuStatus: string
    versionStatus: string
    refStatus: string
    familyStatus: string
    globalVersionRuleStatus: string
}): string[] {
    const reasons: string[] = []

    if (statuses.skuStatus === 'INACTIVO') reasons.push('SKU inactivo')
    if (statuses.versionStatus === 'INACTIVO') reasons.push('Version inactiva')
    if (statuses.refStatus === 'INACTIVO') reasons.push('Referencia inactiva')
    if (statuses.familyStatus === 'INACTIVO') reasons.push('Familia inactiva')
    if (statuses.globalVersionRuleStatus === 'INACTIVO') reasons.push('Global version rule inactiva')

    return reasons
}

export function canonicalizeOverrideKey(key: string): string {
    return OVERRIDE_KEY_ALIASES[key] || key
}

export function canonicalizeOverrideAttrs(input: unknown): AttrRecord {
    const attrs = parseAttrs(input)
    const canonical: AttrRecord = {}

    for (const [rawKey, rawValue] of Object.entries(attrs)) {
        const key = canonicalizeOverrideKey(rawKey)
        const existing = canonical[key]

        if (rawKey === key) {
            canonical[key] = rawValue
            continue
        }

        if (existing === undefined || existing === null || existing === '') {
            canonical[key] = rawValue
        }
    }

    return canonical
}

function removeReferenceOnlyEffectiveKeys(attrs: AttrRecord): AttrRecord {
    const filtered = { ...attrs }
    for (const key of REFERENCE_ONLY_EFFECTIVE_KEYS) {
        delete filtered[key]
    }
    return filtered
}

function buildFamilyDefaults(row: Record<string, unknown>): AttrRecord {
    const rhDefault = row?.rh_default ? 'RH' : 'NA'
    const assembledDefault = row?.assembled_default === true
    return {
        rh: rhDefault,
        assembled_flag: assembledDefault,
    }
}

export function buildEffectiveProductContext(
    row: Record<string, unknown>,
    options: EffectiveContextOptions = {}
): EffectiveProductContext {
    const includeSkuOverrides = options.includeSkuOverrides !== false
    const skuStatus = normalizeStatus(row?.status)
    const versionStatus = normalizeStatus(row?.version_status ?? row?.product_version_status)
    const refStatus = normalizeStatus(row?.ref_status)
    const familyStatus = normalizeStatus(row?.family_status)
    const globalVersionRuleStatus = normalizeStatus(row?.global_version_rule_status)
    const inactiveReasons = buildInactiveReasons({
        skuStatus,
        versionStatus,
        refStatus,
        familyStatus,
        globalVersionRuleStatus,
    })
    const effectiveStatus = inactiveReasons.length > 0 ? 'INACTIVO' : 'ACTIVO'
    const isExportable = effectiveStatus === 'ACTIVO'

    const familyDefaults = buildFamilyDefaults(row)
    const refAttrs = canonicalizeOverrideAttrs(row?.ref_attrs)
    const globalVersionRules = globalVersionRuleStatus === 'INACTIVO'
        ? {}
        : removeReferenceOnlyEffectiveKeys(canonicalizeOverrideAttrs(row?.automatic_version_rules))
    const versionAttrs = removeReferenceOnlyEffectiveKeys(canonicalizeOverrideAttrs(row?.version_attrs))
    const skuAttrs = includeSkuOverrides
        ? removeReferenceOnlyEffectiveKeys(canonicalizeOverrideAttrs(row?.sku_attrs))
        : {}
    const resolvedUseDestination =
        normalizeDestination(refAttrs.use_destination) ??
        normalizeDestination(row?.use_destination)

    const effectiveAttrs: AttrRecord = {
        ...familyDefaults,
        ...refAttrs,
        ...globalVersionRules,
        ...versionAttrs,
        ...skuAttrs,
        use_destination: resolvedUseDestination,
    }

    const resolvedColorName =
        normalizeText(effectiveAttrs.color_name) ??
        normalizeText(row?.resolved_color_name) ??
        normalizeText(row?.name_color_sap)

    const resolvedPrivateLabelClientName =
        normalizeText(effectiveAttrs.private_label_client_name) ??
        normalizeText(row?.resolved_private_label_client_name) ??
        normalizeText(row?.private_label_client_name)

    const resolvedSpecialLabel =
        normalizeText(effectiveAttrs.special_label) ??
        normalizeText(row?.resolved_special_label) ??
        normalizeText(row?.special_label)

    const resolvedWidthCm =
        normalizeNumber(effectiveAttrs.width_cm) ??
        normalizeNumber(row?.resolved_width_cm) ??
        normalizeNumber(row?.width_cm)

    const resolvedDepthCm =
        normalizeNumber(effectiveAttrs.depth_cm) ??
        normalizeNumber(row?.resolved_depth_cm) ??
        normalizeNumber(row?.depth_cm)

    const resolvedHeightCm =
        normalizeNumber(effectiveAttrs.height_cm) ??
        normalizeNumber(row?.resolved_height_cm) ??
        normalizeNumber(row?.height_cm)

    const resolvedWeightKg =
        normalizeNumber(effectiveAttrs.weight_kg) ??
        normalizeNumber(row?.resolved_weight_kg) ??
        normalizeNumber(row?.weight_kg)

    const resolvedStackingMax =
        normalizeNumber(effectiveAttrs.stacking_max) ??
        normalizeNumber(row?.resolved_stacking_max) ??
        normalizeNumber(row?.stacking_max)

    return {
        family_defaults: familyDefaults,
        ref_attrs: refAttrs,
        global_version_rules: globalVersionRules,
        version_attrs: versionAttrs,
        sku_attrs: skuAttrs,
        effective_attrs: effectiveAttrs,
        sku_status: skuStatus,
        version_status: versionStatus,
        ref_status: refStatus,
        family_status: familyStatus,
        global_version_rule_status: globalVersionRuleStatus,
        effective_status: effectiveStatus,
        is_exportable: isExportable,
        inactive_reasons: inactiveReasons,
        resolved_color_name: resolvedColorName,
        resolved_private_label_client_name: resolvedPrivateLabelClientName,
        resolved_special_label: resolvedSpecialLabel,
        resolved_width_cm: resolvedWidthCm,
        resolved_depth_cm: resolvedDepthCm,
        resolved_height_cm: resolvedHeightCm,
        resolved_weight_kg: resolvedWeightKg,
        resolved_stacking_max: resolvedStackingMax,
        resolved_use_destination: resolvedUseDestination,
    }
}

export function getEffectiveOverrideValue(
    context: EffectiveProductContext,
    key: string,
    row?: AttrRecord
): unknown {
    const canonicalKey = canonicalizeOverrideKey(key)

    switch (canonicalKey) {
        case 'color_name':
            return context.resolved_color_name
        case 'private_label_client_name':
            return context.resolved_private_label_client_name
        case 'special_label':
            return context.resolved_special_label
        case 'width_cm':
            return context.resolved_width_cm
        case 'depth_cm':
            return context.resolved_depth_cm
        case 'height_cm':
            return context.resolved_height_cm
        case 'weight_kg':
            return context.resolved_weight_kg
        case 'stacking_max':
            return context.resolved_stacking_max
        case 'use_destination':
            return context.resolved_use_destination
        default:
            return context.effective_attrs[canonicalKey] ?? row?.[canonicalKey] ?? null
    }
}
