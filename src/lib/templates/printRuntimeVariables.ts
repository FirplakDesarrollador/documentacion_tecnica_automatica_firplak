export const PRINT_RUNTIME_TIME_ZONE = 'America/Bogota'

export const PRINT_RUNTIME_VARIABLE_KEYS = {
    printDatetime: 'print_datetime',
    ofNumber: 'of_number',
    partesTexto: 'partes_texto',
} as const

export type PrintRuntimeVariableKey =
    typeof PRINT_RUNTIME_VARIABLE_KEYS[keyof typeof PRINT_RUNTIME_VARIABLE_KEYS]

export type TemplateRenderRuntimeValues = {
    ofNumber?: string | null
    partesTexto?: string | null
}

export const PRINT_RUNTIME_VARIABLE_OPTIONS: { key: PrintRuntimeVariableKey; label: string }[] = [
    { key: PRINT_RUNTIME_VARIABLE_KEYS.printDatetime, label: 'Fecha y hora de impresion' },
    { key: PRINT_RUNTIME_VARIABLE_KEYS.ofNumber, label: 'OF / Orden de fabricacion' },
    { key: PRINT_RUNTIME_VARIABLE_KEYS.partesTexto, label: 'Texto de caja (Caja 1/2)' },
]

const PRINT_RUNTIME_VARIABLE_KEY_SET = new Set<string>(
    PRINT_RUNTIME_VARIABLE_OPTIONS.map(option => option.key)
)

const OF_NUMBER_PATTERN = /^\d{4}$/

function getDateTimePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
    return parts.find(part => part.type === type)?.value || ''
}

export function isPrintRuntimeVariable(field: string | null | undefined): field is PrintRuntimeVariableKey {
    return PRINT_RUNTIME_VARIABLE_KEY_SET.has(String(field || '').trim())
}

export function isValidOfNumber(value: string | null | undefined) {
    return OF_NUMBER_PATTERN.test(String(value || '').trim())
}

export function normalizeOfNumberInput(value: string) {
    return value.replace(/\D/g, '').slice(0, 4)
}

function readRuntimeValue(source: Record<string, unknown>, key: string) {
    const value = source[key]
    if (value === null || value === undefined) return null
    const normalized = String(value).trim()
    return normalized || null
}

export function getTemplateRenderRuntimeValues(source: Record<string, unknown>): TemplateRenderRuntimeValues {
    return {
        ofNumber: readRuntimeValue(source, PRINT_RUNTIME_VARIABLE_KEYS.ofNumber),
        partesTexto: readRuntimeValue(source, PRINT_RUNTIME_VARIABLE_KEYS.partesTexto),
    }
}

function parseRuntimePayloadValue(value: unknown): string | null | undefined {
    if (value === null || value === undefined) return null
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
    return undefined
}

export function parseTemplateRenderRuntimeValues(value: unknown): TemplateRenderRuntimeValues | null {
    if (value === null || value === undefined) return {}
    if (typeof value !== 'object' || Array.isArray(value)) return null

    const source = value as Record<string, unknown>
    const ofNumber = parseRuntimePayloadValue(source.ofNumber)
    const partesTexto = parseRuntimePayloadValue(source.partesTexto)
    if (ofNumber === undefined || partesTexto === undefined) return null

    return { ofNumber, partesTexto }
}

export function formatPrintDateTime(date: Date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: PRINT_RUNTIME_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23',
    }).formatToParts(date)

    const year = getDateTimePart(parts, 'year')
    const month = getDateTimePart(parts, 'month')
    const day = getDateTimePart(parts, 'day')
    const hour = getDateTimePart(parts, 'hour')
    const minute = getDateTimePart(parts, 'minute')

    return `${year}-${month}-${day} ${hour}:${minute}`
}

export function buildPrintRuntimeValues(params: {
    date?: Date
    ofNumber?: string | null
} = {}): Record<string, string> {
    return {
        [PRINT_RUNTIME_VARIABLE_KEYS.printDatetime]: formatPrintDateTime(params.date),
        [PRINT_RUNTIME_VARIABLE_KEYS.ofNumber]: params.ofNumber || '',
    }
}

export function buildPrintRuntimePreviewValues() {
    return {
        [PRINT_RUNTIME_VARIABLE_KEYS.printDatetime]: formatPrintDateTime(),
        [PRINT_RUNTIME_VARIABLE_KEYS.ofNumber]: '1234',
    }
}

export function templateUsesPrintRuntimeVariable(
    elementsJson: string | null | undefined,
    variableKey: PrintRuntimeVariableKey
) {
    if (!elementsJson) return false

    try {
        const elements = JSON.parse(elementsJson) as unknown
        if (!Array.isArray(elements)) return false

        return elements.some((raw) => {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
            const element = raw as Record<string, unknown>
            const dataField = typeof element.dataField === 'string' ? element.dataField.trim() : ''
            if (dataField === variableKey) return true

            const content = typeof element.content === 'string' ? element.content : ''
            return content.includes(`{${variableKey}}`)
        })
    } catch {
        return false
    }
}
