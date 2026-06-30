import { buildPublicDocumentUrl } from '@/lib/documentLinks'

export type DocumentQrElementLike = {
    type?: string
    documentQrMode?: string | null
    documentSlot?: string | null
    publicSlug?: string | null
}

const DOCUMENT_QR_URLS_FIELD = '__document_qr_urls'

export function normalizePublicDocumentQrUrl(value: unknown) {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    if (/^https?:\/\//i.test(raw)) return raw
    return buildPublicDocumentUrl(raw)
}

export function collectRelatedDocumentQrSlots(elements: DocumentQrElementLike[]) {
    return Array.from(new Set(
        elements
            .filter((element) => element.type === 'document_qr' && element.documentQrMode !== 'fixed')
            .map((element) => String(element.documentSlot || '').trim())
            .filter(Boolean)
    ))
}

export function attachDocumentQrUrls<T extends Record<string, unknown>>(product: T, urls: Record<string, string | null>) {
    return {
        ...product,
        [DOCUMENT_QR_URLS_FIELD]: urls,
    }
}

export function getAttachedDocumentQrUrl(product: Record<string, unknown>, documentSlot: string) {
    const urls = product[DOCUMENT_QR_URLS_FIELD]
    if (!urls || typeof urls !== 'object') return null
    const value = (urls as Record<string, unknown>)[documentSlot]
    const normalized = normalizePublicDocumentQrUrl(value)
    return normalized || null
}

export function resolveFixedDocumentQrUrl(publicSlug: unknown) {
    return normalizePublicDocumentQrUrl(publicSlug)
}
