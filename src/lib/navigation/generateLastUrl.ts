export const GENERATE_LAST_URL_STORAGE_KEY = 'generate-last-url'
export const GENERATE_LAST_URL_COOKIE = 'generate_last_url'

export function normalizeGenerateLastUrl(value: string | null | undefined): string | null {
    if (!value) return null

    const trimmed = value.trim()
    if (!trimmed.startsWith('/generate')) return null

    return trimmed
}

export function decodeGenerateLastUrl(value: string | null | undefined): string | null {
    if (!value) return null

    try {
        return normalizeGenerateLastUrl(decodeURIComponent(value))
    } catch {
        return null
    }
}
