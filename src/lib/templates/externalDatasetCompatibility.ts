import { extractTemplateVariables } from './templateVariables'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMaybeJson(value: unknown): unknown {
    if (typeof value !== 'string') return value
    try {
        return JSON.parse(value) as unknown
    } catch {
        return null
    }
}

/** Returns the canonical variable keys declared by a dataset schema, including legacy shapes. */
export function getExternalDatasetSchemaKeys(schemaJson: unknown): Set<string> {
    const schema = parseMaybeJson(schemaJson)
    const keys = new Set<string>()

    const addKey = (value: unknown) => {
        const key = typeof value === 'string' ? value.trim() : ''
        if (key) keys.add(key)
    }

    if (Array.isArray(schema)) {
        for (const column of schema) {
            if (isRecord(column)) addKey(column.key ?? column.original)
        }
        return keys
    }

    if (!isRecord(schema)) return keys

    if (Array.isArray(schema.columns)) {
        for (const column of schema.columns) {
            if (isRecord(column)) addKey(column.key ?? column.original)
        }
        return keys
    }

    if (Array.isArray(schema.selectedColumns)) {
        for (const column of schema.selectedColumns) addKey(column)
    }

    return keys
}

export function isExternalDatasetSchemaCompatible(elementsJson: string | null | undefined, schemaJson: unknown): boolean {
    const availableKeys = getExternalDatasetSchemaKeys(schemaJson)
    return extractTemplateVariables(elementsJson).every((key) => availableKeys.has(key))
}
