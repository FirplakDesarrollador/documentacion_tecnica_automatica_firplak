export const TEMPLATE_FONT_OPTIONS = [
    {
        value: 'montserrat',
        label: 'Montserrat',
        cssStack: 'var(--font-montserrat), ui-sans-serif, system-ui, sans-serif',
    },
    {
        value: 'lato',
        label: 'Lato',
        cssStack: 'var(--font-lato), ui-sans-serif, system-ui, sans-serif',
    },
    {
        value: 'open_sans',
        label: 'Open Sans',
        cssStack: 'var(--font-open-sans), ui-sans-serif, system-ui, sans-serif',
    },
    {
        value: 'roboto',
        label: 'Roboto',
        cssStack: 'var(--font-roboto), ui-sans-serif, system-ui, sans-serif',
    },
] as const

export type TemplateFontFamily = (typeof TEMPLATE_FONT_OPTIONS)[number]['value']

export const DEFAULT_TEMPLATE_FONT_FAMILY: TemplateFontFamily = 'montserrat'

export function normalizeTemplateFontFamily(value?: string | null): TemplateFontFamily {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')

    const match = TEMPLATE_FONT_OPTIONS.find((option) => option.value === normalized)
    return match?.value || DEFAULT_TEMPLATE_FONT_FAMILY
}

export function getTemplateFontLabel(value?: string | null): string {
    const normalized = normalizeTemplateFontFamily(value)
    return TEMPLATE_FONT_OPTIONS.find((option) => option.value === normalized)?.label || 'Montserrat'
}

export function getTemplateFontCssStack(value?: string | null): string {
    const normalized = normalizeTemplateFontFamily(value)
    return (
        TEMPLATE_FONT_OPTIONS.find((option) => option.value === normalized)?.cssStack ||
        TEMPLATE_FONT_OPTIONS[0].cssStack
    )
}
