import { extractTemplateVariables } from './templateVariables'

type UnknownRecord = Record<string, unknown>

type DatasetSchemaField = {
    key: string
    original: string
    isIdentifier: boolean
}

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

function getString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function getDatasetSchemaFields(schemaJson: unknown): {
    fields: DatasetSchemaField[]
    identifierSource: string
    displaySource: string
} {
    const schema = parseMaybeJson(schemaJson)
    const schemaRecord = isRecord(schema) ? schema : null
    const fieldMap = schemaRecord && isRecord(schemaRecord.fieldMap) ? schemaRecord.fieldMap : null
    const identifierSource = getString(fieldMap?.code)
    const displaySource = getString(fieldMap?.final_name_es)
    const sourceColumns = Array.isArray(schema)
        ? schema
        : Array.isArray(schemaRecord?.columns)
            ? schemaRecord.columns
            : Array.isArray(schemaRecord?.selectedColumns)
                ? schemaRecord.selectedColumns
                : []

    const fields = sourceColumns.flatMap((column): DatasetSchemaField[] => {
        if (typeof column === 'string') {
            const key = column.trim()
            return key ? [{ key, original: key, isIdentifier: key === identifierSource }] : []
        }
        if (!isRecord(column)) return []

        const key = getString(column.key ?? column.original)
        const original = getString(column.original ?? column.key)
        if (!key || !original) return []
        return [{
            key,
            original,
            isIdentifier: column.is_identifier === true || key === identifierSource || original === identifierSource,
        }]
    })

    return { fields, identifierSource, displaySource }
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

/** Returns the two dataset fields that make the safest default export filename. */
export function getExternalDatasetDefaultExportFilenameFormat(schemaJson: unknown): string | null {
    const { fields, identifierSource, displaySource } = getDatasetSchemaFields(schemaJson)
    const identifier = fields.find((field) => field.isIdentifier || field.key === identifierSource || field.original === identifierSource)
        ?? fields[0]
    if (!identifier) return null

    const displayField = fields.find((field) => (
        field.key !== identifier.key
        && (field.key === displaySource || field.original === displaySource)
    )) ?? fields.find((field) => field.key !== identifier.key)

    return [identifier, displayField]
        .filter((field): field is DatasetSchemaField => Boolean(field))
        .map((field) => `{${field.key}}`)
        .join('_')
}

export function isExternalDatasetSchemaCompatible(elementsJson: string | null | undefined, schemaJson: unknown): boolean {
    const availableKeys = getExternalDatasetSchemaKeys(schemaJson)
    return extractTemplateVariables(elementsJson).every((key) => availableKeys.has(key))
}
