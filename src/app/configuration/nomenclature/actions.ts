'use server'

import { revalidatePath } from 'next/cache'
import { dbQuery } from '@/lib/supabase'
import { normalizeDocumentSlot, normalizeSlugPrefix } from '@/lib/documentLinks'
import { assertRole } from '@/utils/auth/access'

async function assertAdminAccess() {
    await assertRole('admin')
}

function escapeSql(value: unknown) {
    return String(value ?? '').replace(/'/g, "''")
}

function sqlText(value: unknown) {
    return `'${escapeSql(value)}'`
}

function normalizeKey(value: unknown) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_{2,}/g, '_')
}

export async function getNomenclatureConfigAction() {
    await assertAdminAccess()

    const [prefixes, abbreviations] = await Promise.all([
        dbQuery(`
            SELECT id, document_slot, label, prefix, description, active
            FROM public.document_slug_prefixes
            ORDER BY active DESC, label ASC
        `),
        dbQuery(`
            SELECT id, category, source_value, abbreviation, description, active
            FROM public.nomenclature_abbreviations
            ORDER BY category ASC, source_value ASC
        `),
    ])

    return {
        prefixes: prefixes || [],
        abbreviations: abbreviations || [],
    }
}

export async function upsertDocumentSlugPrefixAction(data: {
    document_slot: string
    label: string
    prefix: string
    description?: string | null
    active?: boolean
}) {
    await assertAdminAccess()

    const documentSlot = normalizeDocumentSlot(data.document_slot)
    const label = String(data.label || '').trim()
    const prefix = normalizeSlugPrefix(data.prefix)
    const description = String(data.description || '').trim()
    const active = data.active !== false

    if (!documentSlot) throw new Error('El slot del documento es obligatorio.')
    if (!label) throw new Error('La etiqueta del documento es obligatoria.')
    if (!prefix) throw new Error('El prefijo publico es obligatorio.')

    await dbQuery(`
        INSERT INTO public.document_slug_prefixes (document_slot, label, prefix, description, active, updated_at)
        VALUES (${sqlText(documentSlot)}, ${sqlText(label)}, ${sqlText(prefix)}, ${description ? sqlText(description) : 'NULL'}, ${active ? 'true' : 'false'}, now())
        ON CONFLICT (document_slot) DO UPDATE
        SET label = EXCLUDED.label,
            prefix = EXCLUDED.prefix,
            description = EXCLUDED.description,
            active = EXCLUDED.active,
            updated_at = now()
    `)

    revalidatePath('/configuration')
    revalidatePath('/configuration/nomenclature')
    return { success: true }
}

export async function upsertNomenclatureAbbreviationAction(data: {
    category: string
    source_value: string
    abbreviation: string
    description?: string | null
    active?: boolean
}) {
    await assertAdminAccess()

    const category = normalizeKey(data.category)
    const sourceValue = String(data.source_value || '').trim().toUpperCase()
    const abbreviation = normalizeSlugPrefix(data.abbreviation)
    const description = String(data.description || '').trim()
    const active = data.active !== false

    if (!category) throw new Error('La categoria es obligatoria.')
    if (!sourceValue) throw new Error('El valor original es obligatorio.')
    if (!abbreviation) throw new Error('La abreviatura es obligatoria.')

    await dbQuery(`
        INSERT INTO public.nomenclature_abbreviations (category, source_value, abbreviation, description, active, updated_at)
        VALUES (${sqlText(category)}, ${sqlText(sourceValue)}, ${sqlText(abbreviation)}, ${description ? sqlText(description) : 'NULL'}, ${active ? 'true' : 'false'}, now())
        ON CONFLICT (category, source_value) DO UPDATE
        SET abbreviation = EXCLUDED.abbreviation,
            description = EXCLUDED.description,
            active = EXCLUDED.active,
            updated_at = now()
    `)

    revalidatePath('/configuration')
    revalidatePath('/configuration/nomenclature')
    return { success: true }
}
