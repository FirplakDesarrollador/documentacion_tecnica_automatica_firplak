import 'server-only'

import { dbQuery } from '@/lib/supabase'
import {
    PUBLIC_DOCUMENT_SLUG_STRATEGY_VERSION,
    buildPublicDocumentUrl,
    buildPublicSlug,
    isValidDocumentSlot,
    isValidPublicDocumentSlug,
    normalizeDocumentSlot,
    slugifyDocumentPart,
} from '@/lib/documentLinks'

export type ProductAssetLinkScope =
    | 'reference'
    | 'version'
    | 'sku'
    | 'family'
    | 'product_type'
    | 'manufacturing_process'
    | 'use_destination'
    | 'global'

export type DocumentSlugPrefix = {
    document_slot: string
    label: string
    prefix: string
    description: string | null
    active: boolean
}

export type PublicDocumentOption = {
    documentSlot: string
    documentLabel: string
    slugPrefix: string
    publicSlug: string
    publicUrl: string
}

export type PublicDocumentAsset = {
    name: string
    file_path: string
    type: string | null
    document_label: string | null
    public_slug: string
}

type TargetForSlug = {
    scope: ProductAssetLinkScope
    ids: string[]
    values: string[]
}

type NamingRow = {
    product_type?: string | null
    designation?: string | null
    line?: string | null
    product_name?: string | null
    use_destination?: string | null
    commercial_measure?: string | null
    special_label?: string | null
    version_label?: string | null
    family_name?: string | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function escapeSql(value: unknown) {
    return String(value ?? '').replace(/'/g, "''")
}

function sqlText(value: unknown) {
    return `'${escapeSql(value)}'`
}

function cleanText(value: unknown) {
    const text = String(value ?? '').trim()
    if (!text || ['NA', 'N/A', 'NULL', 'UNDEFINED'].includes(text.toUpperCase())) return ''
    return text
}

function uniqueClean(values: unknown[]) {
    return Array.from(new Set(values.map(cleanText).filter(Boolean)))
}

function getProductValue(product: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = cleanText(product[key])
        if (value) return value
    }
    return ''
}

async function getUseDestinationAbbreviation(value: unknown) {
    const source = cleanText(value)
    if (!source) return ''

    const rows = await dbQuery(`
        SELECT abbreviation
        FROM public.nomenclature_abbreviations
        WHERE category = 'use_destination'
          AND active = true
          AND upper(btrim(source_value)) = upper(btrim(${sqlText(source)}))
        LIMIT 1
    `) as Array<{ abbreviation?: string | null }>

    const abbreviation = cleanText(rows?.[0]?.abbreviation)
    if (abbreviation) return abbreviation

    throw new Error(`Falta definir abreviatura para destino de uso "${source}" en Configuracion > Nomenclatura.`)
}

export async function getDocumentSlugPrefixes(activeOnly = false): Promise<DocumentSlugPrefix[]> {
    const rows = await dbQuery(`
        SELECT document_slot, label, prefix, description, active
        FROM public.document_slug_prefixes
        ${activeOnly ? 'WHERE active = true' : ''}
        ORDER BY active DESC, label ASC
    `) as DocumentSlugPrefix[]

    return rows || []
}

export async function getDocumentPrefixBySlot(documentSlot: string) {
    const normalized = normalizeDocumentSlot(documentSlot)
    if (!normalized) return null

    const rows = await dbQuery(`
        SELECT document_slot, label, prefix, description, active
        FROM public.document_slug_prefixes
        WHERE document_slot = ${sqlText(normalized)}
          AND active = true
        LIMIT 1
    `) as DocumentSlugPrefix[]

    return rows?.[0] || null
}

export async function getNomenclatureAbbreviations() {
    return await dbQuery(`
        SELECT id, category, source_value, abbreviation, description, active
        FROM public.nomenclature_abbreviations
        ORDER BY category ASC, source_value ASC
    `) || []
}

export async function getPublicDocumentOptions(): Promise<PublicDocumentOption[]> {
    const rows = await dbQuery(`
        SELECT DISTINCT ON (pal.public_slug)
            pal.document_slot,
            coalesce(nullif(btrim(pal.document_label), ''), dsp.label, a.name) as document_label,
            pal.slug_prefix,
            pal.public_slug
        FROM public.product_asset_links pal
        JOIN public.assets a ON a.id = pal.asset_id
        LEFT JOIN public.document_slug_prefixes dsp ON dsp.document_slot = pal.document_slot
        WHERE pal.is_public = true
          AND pal.status = 'approved'
          AND pal.public_slug IS NOT NULL
        ORDER BY pal.public_slug, pal.version_number DESC, pal.updated_at DESC
    `) as Array<{
        document_slot?: string | null
        document_label?: string | null
        slug_prefix?: string | null
        public_slug?: string | null
    }>

    return (rows || [])
        .map((row) => {
            const publicSlug = cleanText(row.public_slug)
            const documentSlot = cleanText(row.document_slot)
            if (!publicSlug || !documentSlot) return null
            return {
                documentSlot,
                documentLabel: cleanText(row.document_label) || publicSlug,
                slugPrefix: cleanText(row.slug_prefix) || publicSlug.split('/')[0] || '',
                publicSlug,
                publicUrl: buildPublicDocumentUrl(publicSlug),
            }
        })
        .filter((row): row is PublicDocumentOption => Boolean(row))
}

export async function resolvePublicDocumentBySlug(publicSlug: string): Promise<PublicDocumentAsset | null> {
    const normalizedSlug = String(publicSlug || '').trim().toLowerCase()
    if (!isValidPublicDocumentSlug(normalizedSlug)) return null

    const rows = await dbQuery(`
        SELECT
            a.name,
            a.file_path,
            a.type,
            pal.document_label,
            pal.public_slug
        FROM public.product_asset_links pal
        JOIN public.assets a ON a.id = pal.asset_id
        WHERE pal.public_slug = ${sqlText(normalizedSlug)}
          AND pal.is_public = true
          AND pal.status = 'approved'
        ORDER BY pal.version_number DESC, pal.updated_at DESC
        LIMIT 1
    `) as PublicDocumentAsset[]

    return rows?.[0] || null
}

export async function resolvePublicDocumentForProduct(
    product: Record<string, unknown>,
    documentSlot: string
): Promise<PublicDocumentOption | null> {
    const slot = normalizeDocumentSlot(documentSlot)
    if (!isValidDocumentSlot(slot)) return null

    const skuId = getProductValue(product, ['id', 'sku_id'])
    const versionId = getProductValue(product, ['version_id'])
    const referenceId = getProductValue(product, ['reference_id'])
    const familyCode = getProductValue(product, ['familia_code', 'family_code'])
    const productType = getProductValue(product, ['product_type'])
    const useDestination = getProductValue(product, ['use_destination'])
    const manufacturingProcess = getProductValue(product, ['manufacturing_process'])

    const clauses: string[] = []
    const priorityCases: string[] = []

    if (UUID_PATTERN.test(skuId)) {
        clauses.push(`pal.sku_id::text = ${sqlText(skuId)}`)
        priorityCases.push(`WHEN pal.sku_id::text = ${sqlText(skuId)} THEN 1`)
    }
    if (UUID_PATTERN.test(versionId)) {
        clauses.push(`pal.version_id::text = ${sqlText(versionId)}`)
        priorityCases.push(`WHEN pal.version_id::text = ${sqlText(versionId)} THEN 2`)
    }
    if (UUID_PATTERN.test(referenceId)) {
        clauses.push(`pal.reference_id::text = ${sqlText(referenceId)}`)
        priorityCases.push(`WHEN pal.reference_id::text = ${sqlText(referenceId)} THEN 3`)
    }
    if (familyCode) {
        clauses.push(`upper(btrim(pal.family_code)) = upper(btrim(${sqlText(familyCode)}))`)
        priorityCases.push(`WHEN upper(btrim(pal.family_code)) = upper(btrim(${sqlText(familyCode)})) THEN 4`)
    }
    if (useDestination) {
        clauses.push(`upper(btrim(pal.use_destination)) = upper(btrim(${sqlText(useDestination)}))`)
        priorityCases.push(`WHEN upper(btrim(pal.use_destination)) = upper(btrim(${sqlText(useDestination)})) THEN 5`)
    }
    if (productType) {
        clauses.push(`upper(btrim(pal.product_type)) = upper(btrim(${sqlText(productType)}))`)
        priorityCases.push(`WHEN upper(btrim(pal.product_type)) = upper(btrim(${sqlText(productType)})) THEN 6`)
    }
    if (manufacturingProcess) {
        clauses.push(`upper(btrim(pal.manufacturing_process)) = upper(btrim(${sqlText(manufacturingProcess)}))`)
        priorityCases.push(`WHEN upper(btrim(pal.manufacturing_process)) = upper(btrim(${sqlText(manufacturingProcess)})) THEN 7`)
    }
    clauses.push(`pal.global_key = 'global'`)
    priorityCases.push(`WHEN pal.global_key = 'global' THEN 8`)

    const rows = await dbQuery(`
        SELECT
            pal.document_slot,
            coalesce(nullif(btrim(pal.document_label), ''), dsp.label, a.name) as document_label,
            pal.slug_prefix,
            pal.public_slug
        FROM public.product_asset_links pal
        JOIN public.assets a ON a.id = pal.asset_id
        LEFT JOIN public.document_slug_prefixes dsp ON dsp.document_slot = pal.document_slot
        WHERE pal.is_public = true
          AND pal.status = 'approved'
          AND pal.public_slug IS NOT NULL
          AND pal.document_slot = ${sqlText(slot)}
          AND (${clauses.join(' OR ')})
        ORDER BY
          CASE ${priorityCases.join(' ')} ELSE 99 END ASC,
          pal.version_number DESC,
          pal.updated_at DESC
        LIMIT 1
    `) as Array<{
        document_slot?: string | null
        document_label?: string | null
        slug_prefix?: string | null
        public_slug?: string | null
    }>

    const row = rows?.[0]
    const publicSlug = cleanText(row?.public_slug)
    if (!row || !publicSlug) return null

    return {
        documentSlot: cleanText(row.document_slot),
        documentLabel: cleanText(row.document_label) || publicSlug,
        slugPrefix: cleanText(row.slug_prefix) || publicSlug.split('/')[0] || '',
        publicSlug,
        publicUrl: buildPublicDocumentUrl(publicSlug),
    }
}

async function getNamingRowForSingleTarget(target: TargetForSlug): Promise<NamingRow | null> {
    const id = target.ids[0]
    const value = target.values[0]

    if (target.scope === 'reference' && UUID_PATTERN.test(id)) {
        const rows = await dbQuery(`
            SELECT
                f.product_type,
                r.designation,
                r.line,
                r.product_name,
                coalesce(r.ref_attrs->>'use_destination', f.use_destination) as use_destination,
                r.commercial_measure,
                r.special_label,
                null::text as version_label
            FROM public.product_references r
            LEFT JOIN public.families f ON f.family_code = r.family_code
            WHERE r.id::text = ${sqlText(id)}
            LIMIT 1
        `) as NamingRow[]
        return rows?.[0] || null
    }

    if (target.scope === 'version' && UUID_PATTERN.test(id)) {
        const rows = await dbQuery(`
            SELECT
                f.product_type,
                r.designation,
                r.line,
                r.product_name,
                coalesce(v.version_attrs->>'use_destination', r.ref_attrs->>'use_destination', f.use_destination) as use_destination,
                r.commercial_measure,
                coalesce(v.version_attrs->>'special_label', r.special_label) as special_label,
                v.version_label
            FROM public.product_versions v
            JOIN public.product_references r ON r.id = v.reference_id
            LEFT JOIN public.families f ON f.family_code = r.family_code
            WHERE v.id::text = ${sqlText(id)}
            LIMIT 1
        `) as NamingRow[]
        return rows?.[0] || null
    }

    if (target.scope === 'family' && value) {
        const rows = await dbQuery(`
            SELECT product_type, family_name, use_destination
            FROM public.families
            WHERE family_code = ${sqlText(value)}
            LIMIT 1
        `) as NamingRow[]
        return rows?.[0] || null
    }

    return null
}

async function buildSlugFromNamingRow(row: NamingRow) {
    const useDestination = await getUseDestinationAbbreviation(row.use_destination)
    const parts = [
        row.product_type,
        row.designation,
        row.line,
        row.product_name || row.family_name,
        useDestination,
        row.commercial_measure,
        row.special_label,
        row.version_label,
    ]

    return slugifyDocumentPart(uniqueClean(parts).join(' '))
}

export async function buildProductAssetSlugBody(params: {
    target: TargetForSlug
    documentLabel?: string | null
    assetName?: string | null
}) {
    const target = params.target

    if (target.ids.length === 1 || target.values.length === 1) {
        const namingRow = await getNamingRowForSingleTarget(target)
        if (namingRow) {
            const generated = await buildSlugFromNamingRow(namingRow)
            if (generated) return generated
        }
    }

    const targetDescriptor = target.scope === 'global'
        ? 'global'
        : target.values.length === 1
            ? target.values[0]
            : ''
    const fallbackParts = [
        params.documentLabel,
        params.assetName,
        targetDescriptor,
    ]
    return slugifyDocumentPart(uniqueClean(fallbackParts).join(' '))
}

export function composePublicSlug(prefix: string, slugBody: string) {
    const publicSlug = buildPublicSlug(prefix, slugBody)
    if (!publicSlug || !isValidPublicDocumentSlug(publicSlug)) {
        throw new Error('No fue posible generar un slug publico valido para este recurso.')
    }
    return {
        publicSlug,
        slugPrefix: publicSlug.split('/')[0],
        slugBody: publicSlug.split('/').slice(1).join('/'),
        slugStrategyVersion: PUBLIC_DOCUMENT_SLUG_STRATEGY_VERSION,
    }
}
