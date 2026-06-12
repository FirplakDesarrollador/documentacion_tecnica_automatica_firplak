export type TemplateTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'sentence'

type TextTransformContext = Record<string, unknown>

const CSS_TEXT_TRANSFORMS = new Set<TemplateTextTransform>(['none', 'uppercase', 'lowercase'])
const HTML_BOUNDARY_PATTERN = /(<[^>]+>|&[a-zA-Z0-9#]+;)/g
const TOKEN_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:[./+\-][A-Za-zÀ-ÖØ-öø-ÿ0-9]+|\/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*/g
const LETTER_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿ]/
const DIGIT_PATTERN = /\d/
const MEASURE_TOKEN_PATTERN = /^\d[\d.,]*(?:(?:MM|CM|IN)|X\d[\d.,]*(?:MM|CM|IN)?)+$/i
const STANDALONE_MEASURE_UNITS = new Set(['MM', 'CM', 'IN'])

const TECHNICAL_ACRONYMS = new Set([
    'CARB2',
    'ERP',
    'HDF',
    'LED',
    'LVM',
    'MDF',
    'MDP',
    'MR',
    'PVC',
    'PUR',
    'RFE',
    'RH',
    'SAP',
    'SFE',
    'SKU',
    'USB',
    'UV',
])

const TITLE_CASE_CONTEXT_FIELDS = [
    'product_name',
    'line',
    'private_label_client_name',
    'resolved_private_label_client_name',
]

function normalizeToken(token: string) {
    return token.trim().toLocaleUpperCase('es-CO')
}

function hasLetter(token: string) {
    return LETTER_PATTERN.test(token)
}

function titleCaseToken(token: string) {
    const lower = token.toLocaleLowerCase('es-CO')
    return lower.charAt(0).toLocaleUpperCase('es-CO') + lower.slice(1)
}

function titleCaseCompoundToken(token: string) {
    return token
        .split(/([/-])/)
        .map(part => {
            if (part === '/' || part === '-') return part
            if (!hasLetter(part)) return part
            return titleCaseToken(part)
        })
        .join('')
}

function isMeasureToken(token: string) {
    const normalized = normalizeToken(token)
    return STANDALONE_MEASURE_UNITS.has(normalized) || MEASURE_TOKEN_PATTERN.test(normalized)
}

function isCompoundAcronym(token: string) {
    if (!token.includes('/') && !token.includes('-')) return false

    const parts = normalizeToken(token).split(/[/-]/).filter(Boolean)
    if (parts.length < 2) return false

    return parts.every(part => part.length === 1 || TECHNICAL_ACRONYMS.has(part) || DIGIT_PATTERN.test(part))
}

function shouldPreserveUppercase(token: string) {
    const normalized = normalizeToken(token)
    if (!hasLetter(normalized)) return false
    if (isMeasureToken(normalized)) return false
    if (TECHNICAL_ACRONYMS.has(normalized)) return true
    if (normalized.length === 1) return true
    if (DIGIT_PATTERN.test(normalized) && /^[A-Z0-9./+\-]+$/.test(normalized)) return true
    return isCompoundAcronym(normalized)
}

function buildTitleCaseTokenSet(context?: TextTransformContext) {
    const tokens = new Set<string>()
    if (!context) return tokens

    for (const field of TITLE_CASE_CONTEXT_FIELDS) {
        const value = context[field]
        if (typeof value !== 'string') continue

        const matches = value.match(TOKEN_PATTERN) || []
        for (const token of matches) {
            if (!hasLetter(token) || shouldPreserveUppercase(token)) continue
            tokens.add(normalizeToken(token))
        }
    }

    return tokens
}

function formatTechnicalSentenceToken(
    token: string,
    state: { hasStarted: boolean },
    titleCaseTokens: Set<string>
) {
    if (!hasLetter(token)) return token

    if (isMeasureToken(token)) {
        return token.toLocaleLowerCase('es-CO')
    }

    if (shouldPreserveUppercase(token)) {
        return token.toLocaleUpperCase('es-CO')
    }

    if (titleCaseTokens.has(normalizeToken(token))) {
        state.hasStarted = true
        return titleCaseToken(token)
    }

    if (!state.hasStarted) {
        state.hasStarted = true
        return titleCaseToken(token)
    }

    return token.toLocaleLowerCase('es-CO')
}

function formatTechnicalTitleToken(token: string) {
    if (!hasLetter(token)) return token

    if (isMeasureToken(token)) {
        return token.toLocaleLowerCase('es-CO')
    }

    if (shouldPreserveUppercase(token)) {
        return token.toLocaleUpperCase('es-CO')
    }

    return titleCaseCompoundToken(token)
}

function transformTextSegments(text: string, formatToken: (token: string) => string) {
    return text
        .split(HTML_BOUNDARY_PATTERN)
        .map(part => {
            if (!part || part.startsWith('<') || /^&[a-zA-Z0-9#]+;$/.test(part)) return part
            return part.replace(TOKEN_PATTERN, formatToken)
        })
        .join('')
}

function toTechnicalSentenceCase(text: string, context?: TextTransformContext) {
    const state = { hasStarted: false }
    const titleCaseTokens = buildTitleCaseTokenSet(context)

    return transformTextSegments(text, token => formatTechnicalSentenceToken(token, state, titleCaseTokens))
}

function toTechnicalTitleCase(text: string) {
    return transformTextSegments(text, formatTechnicalTitleToken)
}

export function isSemanticTextTransform(transform: string | null | undefined) {
    return transform === 'sentence' || transform === 'capitalize'
}

export function resolveCssTextTransform(transform: string | null | undefined) {
    if (!transform) return 'none'
    return CSS_TEXT_TRANSFORMS.has(transform as TemplateTextTransform) ? transform as Exclude<TemplateTextTransform, 'sentence' | 'capitalize'> : 'none'
}

export function applyTemplateTextTransform(
    text: string,
    transform: string | null | undefined,
    context?: TextTransformContext
) {
    if (!text || !isSemanticTextTransform(transform)) return text
    if (transform === 'capitalize') return toTechnicalTitleCase(text)
    return toTechnicalSentenceCase(text, context)
}
