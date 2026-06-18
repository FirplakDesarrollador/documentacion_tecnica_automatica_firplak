export const PACKAGE_QUANTITY_ATTR_KEY = 'q_package'

export const LABEL_BOX_VARIABLE_KEYS = {
    partesTexto: 'partes_texto',
    partesFileSuffix: 'partes_file_suffix',
} as const

export type LabelBoxVariableKey =
    typeof LABEL_BOX_VARIABLE_KEYS[keyof typeof LABEL_BOX_VARIABLE_KEYS]

export type LabelBoxRuntimeValues = Record<LabelBoxVariableKey, string>

export type LabelBoxProduct<T extends Record<string, unknown>> = T & LabelBoxRuntimeValues & {
    weight_kg?: number | null
    weight_lb?: string
    _labelBoxIndex: number | null
    _labelBoxTotal: number | null
}

export type LabelBoxesAttr = {
    weights_kg: (number | null)[]
    peso_total: number | null
}

const BOX_LABEL_PATTERN = /\b(\d+)\s*CAJAS?\b/i
const MAX_LABEL_BOXES = 20
const KG_TO_LB = 2.20462

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePositiveInteger(value: unknown): number | null {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LABEL_BOXES) return null
    return parsed
}

function normalizeNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const normalized = typeof value === 'string'
        ? value.trim().replace(',', '.')
        : value
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
}

function parseJsonWeightValue(value: unknown): unknown {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value

    try {
        return JSON.parse(trimmed) as unknown
    } catch {
        return value
    }
}

function formatLb(valueKg: number | null): string {
    if (valueKg === null) return ''
    return (valueKg * KG_TO_LB).toFixed(1)
}

function sumCompleteWeights(weights: (number | null)[]): number | null {
    if (weights.length === 0 || weights.some(weight => weight === null)) return null
    const total = weights.reduce<number>((sum, weight) => sum + (weight ?? 0), 0)
    return Number(total.toFixed(3))
}

function getNestedRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = source[key]
    return isRecord(value) ? value : {}
}

function getProductAttrs(product: Record<string, unknown>): Record<string, unknown> {
    const effectiveAttrs = getNestedRecord(product, 'effective_attrs')
    const dynamicAttrs = getNestedRecord(product, 'dynamic_attrs')
    const refAttrs = getNestedRecord(product, 'ref_attrs')
    const versionAttrs = getNestedRecord(product, 'version_attrs')
    return {
        ...refAttrs,
        ...versionAttrs,
        ...dynamicAttrs,
        ...effectiveAttrs,
    }
}

export function getLabelBoxTotal(versionLabel: unknown): number | null {
    const label = typeof versionLabel === 'string' ? versionLabel.trim() : ''
    if (!label) return null
    const match = label.match(BOX_LABEL_PATTERN)
    return normalizePositiveInteger(match?.[1])
}

export function buildPackageQuantityLabel(total: number | null): string {
    if (!total) return 'NA'
    return `${total} CAJA${total === 1 ? '' : 'S'}`
}

function getPackageQuantity(product: Record<string, unknown>): unknown {
    const refAttrs = getNestedRecord(product, 'ref_attrs')
    const attrs = getProductAttrs(product)
    return product[PACKAGE_QUANTITY_ATTR_KEY] ?? refAttrs[PACKAGE_QUANTITY_ATTR_KEY] ?? attrs[PACKAGE_QUANTITY_ATTR_KEY]
}

function getWeightValue(source: Record<string, unknown>): unknown {
    return parseJsonWeightValue(source.weight_kg_payload ?? source.weight_kg)
}

function extractWeightsFromValue(value: unknown): (number | null)[] {
    const parsed = parseJsonWeightValue(value)
    if (Array.isArray(parsed)) return parsed.map(normalizeNumber)
    if (isRecord(parsed)) {
        if (Array.isArray(parsed.weights_kg)) return parsed.weights_kg.map(normalizeNumber)
        if (Array.isArray(parsed.cajas_kg)) return parsed.cajas_kg.map(normalizeNumber)
    }
    const singleWeight = normalizeNumber(parsed)
    return singleWeight === null ? [] : [singleWeight]
}

function hasStructuredBoxWeights(value: unknown): boolean {
    const parsed = parseJsonWeightValue(value)
    return Array.isArray(parsed) ||
        (isRecord(parsed) && (Array.isArray(parsed.weights_kg) || Array.isArray(parsed.cajas_kg)))
}

export function normalizeWeightKgTotal(value: unknown): number | null {
    const parsed = parseJsonWeightValue(value)
    const directWeight = normalizeNumber(parsed)
    if (directWeight !== null) return directWeight

    if (Array.isArray(parsed)) {
        return sumCompleteWeights(parsed.map(normalizeNumber))
    }

    if (!isRecord(parsed)) return null

    const explicitTotal =
        normalizeNumber(parsed.peso_total) ??
        normalizeNumber(parsed.total_weight_kg) ??
        normalizeNumber(parsed.weight_total_kg) ??
        normalizeNumber(parsed.total_kg)
    if (explicitTotal !== null) return explicitTotal

    return sumCompleteWeights(extractWeightsFromValue(parsed))
}

export function getLabelBoxWeightsKg(source: unknown, total: number | null = null): (number | null)[] {
    if (!isRecord(source)) return []
    const rawWeightValue = getWeightValue(source)
    if (total && total > 1 && !hasStructuredBoxWeights(rawWeightValue)) {
        return Array.from({ length: total }, () => null)
    }
    const weights = extractWeightsFromValue(rawWeightValue)
    if (!total) return weights
    return Array.from({ length: total }, (_, index) => weights[index] ?? null)
}

export function buildLabelBoxesAttr(weights: unknown[], total: number): LabelBoxesAttr {
    const normalizedWeights = Array.from({ length: total }, (_, index) => normalizeNumber(weights[index]))
    return {
        weights_kg: normalizedWeights,
        peso_total: sumCompleteWeights(normalizedWeights),
    }
}

export function getLabelBoxRuntimeValues(
    current: number | null,
    total: number | null
): LabelBoxRuntimeValues {
    if (!current || !total) {
        return {
            partes_texto: '',
            partes_file_suffix: '',
        }
    }

    return {
        partes_texto: `Caja ${current}/${total}`,
        partes_file_suffix: `${current}-de-${total}`,
    }
}

export function expandLabelBoxProducts<T extends Record<string, unknown>>(product: T): LabelBoxProduct<T>[] {
    const total = getLabelBoxTotal(getPackageQuantity(product))

    if (!total || total <= 1) {
        return [{
            ...product,
            ...getLabelBoxRuntimeValues(null, null),
            _labelBoxIndex: null,
            _labelBoxTotal: null,
        }]
    }

    const weights = getLabelBoxWeightsKg(product, total)
    return Array.from({ length: total }, (_, index) => {
        const current = index + 1
        const boxWeightKg = weights[index] ?? null
        return {
            ...product,
            weight_kg: boxWeightKg,
            weight_lb: formatLb(boxWeightKg),
            ...getLabelBoxRuntimeValues(current, total),
            _labelBoxIndex: current,
            _labelBoxTotal: total,
        }
    })
}

export function filenameFormatUsesLabelBoxVariable(format: string | null | undefined): boolean {
    const normalized = String(format || '')
    return Object.values(LABEL_BOX_VARIABLE_KEYS).some(key => normalized.includes(`{${key}}`))
}

export function appendLabelBoxSuffix(filenameBase: string, product: Record<string, unknown>): string {
    const suffix = typeof product.partes_file_suffix === 'string' ? product.partes_file_suffix.trim() : ''
    if (!suffix) return filenameBase
    return `${filenameBase}_${suffix}`
}
