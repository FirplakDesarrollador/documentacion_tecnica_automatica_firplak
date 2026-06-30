export const PUBLIC_DOCUMENT_SLUG_STRATEGY_VERSION = 1

export function slugifyDocumentPart(value: unknown) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
}

export function normalizeDocumentSlot(value: unknown) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_{2,}/g, '_')
}

export function normalizeSlugPrefix(value: unknown) {
    return slugifyDocumentPart(value)
}

export function buildPublicSlug(prefix: unknown, body: unknown) {
    const cleanPrefix = normalizeSlugPrefix(prefix)
    const cleanBody = slugifyDocumentPart(body)
    if (!cleanPrefix || !cleanBody) return ''
    return `${cleanPrefix}/${cleanBody}`
}

export function getPublicDocumentsBaseUrl() {
    return (
        process.env.NEXT_PUBLIC_DOCS_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        ''
    ).replace(/\/$/, '')
}

export function buildPublicDocumentUrl(publicSlug: unknown, baseUrl = getPublicDocumentsBaseUrl()) {
    const cleanSlug = String(publicSlug ?? '').trim().replace(/^\/+/, '')
    if (!cleanSlug) return ''
    const cleanBase = String(baseUrl || '').trim().replace(/\/$/, '')
    const browserBase = typeof window !== 'undefined' ? window.location.origin : ''
    const resolvedBase = cleanBase || browserBase.replace(/\/$/, '')
    return resolvedBase ? `${resolvedBase}/${cleanSlug}` : `/${cleanSlug}`
}

export function isValidPublicDocumentSlug(value: unknown) {
    return /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/.test(String(value ?? '').trim())
}

export function isValidDocumentSlot(value: unknown) {
    return /^[a-z0-9_]+$/.test(String(value ?? '').trim())
}
