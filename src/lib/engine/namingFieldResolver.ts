import { canonicalizeOverrideKey } from './effectiveProduct'

type NamingProductRecord = Record<string, unknown> & {
    effective_attrs?: Record<string, unknown>
    dynamic_attrs?: Record<string, unknown>
}

function isNamingProductRecord(value: unknown): value is NamingProductRecord {
    return typeof value === 'object' && value !== null
}

export function getNamingFieldValue(product: unknown, field: string): unknown {
    if (!isNamingProductRecord(product)) return null
    if (!product || !field) return null

    const canonicalField = canonicalizeOverrideKey(String(field).trim().toLowerCase())
    if (!canonicalField) return null

    if (Object.prototype.hasOwnProperty.call(product, canonicalField)) {
        return product[canonicalField]
    }

    const effectiveAttrs = product.effective_attrs
    if (effectiveAttrs && Object.prototype.hasOwnProperty.call(effectiveAttrs, canonicalField)) {
        return effectiveAttrs[canonicalField]
    }

    const dynamicAttrs = product.dynamic_attrs
    if (dynamicAttrs && Object.prototype.hasOwnProperty.call(dynamicAttrs, canonicalField)) {
        return dynamicAttrs[canonicalField]
    }

    return null
}

export function isMeaningfulNamingValue(value: unknown): boolean {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') {
        const normalized = value.trim()
        if (!normalized) return false
        return normalized.toUpperCase() !== 'NA'
    }
    return true
}

export function isNamingValueTrue(value: unknown): boolean {
    if (value === true) return true
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
    return false
}

export function isNamingValueFalse(value: unknown): boolean {
    if (value === false) return true
    if (typeof value === 'string') return value.trim().toLowerCase() === 'false'
    return false
}
