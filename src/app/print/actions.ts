'use server'

import { assertPermission } from '@/utils/auth/access'
import { composeProductsByFilters, type ProductFilters } from '@/lib/engine/product_composer'
import { dbQuery, supabaseServer } from '@/lib/supabase'
import { listCatalogTargetContexts } from '@/lib/templates/catalogScopeServer'
import { normalizeCatalogScope, type CatalogScope, type TemplateBrandScope } from '@/lib/templates/catalogScope'

type PrintTemplateSource = {
    id: string
    data_source: string | null
    brand_scope: string | null
    private_label_client_name: string | null
    catalog_scope: CatalogScope | null
}

type DatasetRow = {
    id: string
    data_json: string | Record<string, unknown> | null
}

const CORE_FIRPLAK_SOURCE = 'core_firplak'
const GENERIC_DATASETS_SOURCE = 'custom_datasets'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
}

function parseDatasetJson(value: DatasetRow['data_json']): Record<string, unknown> {
    if (!value) return {}
    if (typeof value !== 'string') return asRecord(value)

    try {
        return asRecord(JSON.parse(value))
    } catch {
        return {}
    }
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = record[key]
        if (value !== null && value !== undefined && String(value).trim()) {
            return String(value).trim()
        }
    }
    return null
}

function matchesDatasetSearch(record: Record<string, unknown>, search: string | null): boolean {
    const query = search?.trim().toLowerCase()
    if (!query) return true

    const haystack = Object.values(record)
        .map((value) => {
            if (value === null || value === undefined) return ''
            if (typeof value === 'object') return JSON.stringify(value)
            return String(value)
        })
        .join(' ')
        .toLowerCase()

    return query.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
}

function mapDatasetRow(row: DatasetRow) {
    const parsed = parseDatasetJson(row.data_json)
    const code = stringField(parsed, ['code', 'sku', 'codigo', 'id']) || row.id
    const finalNameEs = stringField(parsed, [
        'final_name_es',
        'name',
        'nombre',
        'tienda',
        'store',
        'descripcion',
        'description',
    ]) || 'Registro dataset'

    return {
        ...parsed,
        id: row.id,
        code,
        final_name_es: finalNameEs,
        status: 'ACTIVO',
        is_external: true,
    }
}

async function getTemplateSource(templateId: string | null): Promise<PrintTemplateSource | null> {
    if (!templateId) return null

    const rows = await dbQuery(
        `SELECT id, data_source, brand_scope, private_label_client_name,
                to_jsonb(plantillas_doc_tec)->>'catalog_scope' AS catalog_scope
         FROM public.plantillas_doc_tec
         WHERE id = $1
         LIMIT 1`,
        [templateId]
    ) as PrintTemplateSource[]

    return rows[0] ?? null
}

async function getLinkedDatasetIds(templateId: string): Promise<string[]> {
    const rows = await dbQuery(
        `SELECT dataset_id
         FROM public.template_dataset_links
         WHERE template_id = $1`,
        [templateId]
    ) as { dataset_id: string | null }[]

    return rows
        .map((row) => row.dataset_id)
        .filter((id): id is string => Boolean(id))
}

async function getDatasetProducts(datasetIds: string[], search: string | null, page: number, pageSize: number) {
    if (datasetIds.length === 0) return { products: [], totalCount: 0 }

    const safeDatasetIds = datasetIds.map((id) => id.replace(/'/g, "''"))
    const rows = await dbQuery(
        `SELECT id, data_json
         FROM public.custom_dataset_rows
         WHERE dataset_id IN (${safeDatasetIds.map((id) => `'${id}'`).join(',')})
         ORDER BY created_at ASC
         LIMIT 5000`
    ) as DatasetRow[]

    const filteredRows = rows.filter((row) => matchesDatasetSearch(parseDatasetJson(row.data_json), search))
    const offset = (page - 1) * pageSize
    const products = filteredRows
        .slice(offset, offset + pageSize)
        .map(mapDatasetRow)

    return {
        products,
        totalCount: filteredRows.length,
    }
}

export async function getFilteredProducts(
    search: string | null,
    page: number = 1,
    pageSize: number = 500,
    templateId: string | null = null
) {
    await assertPermission('action:print')

    const templateSource = await getTemplateSource(templateId)
    const dataSource = String(templateSource?.data_source || CORE_FIRPLAK_SOURCE).trim()

    if (dataSource === GENERIC_DATASETS_SOURCE && templateSource?.id) {
        const linkedDatasetIds = await getLinkedDatasetIds(templateSource.id)
        return getDatasetProducts(linkedDatasetIds, search, page, pageSize)
    }

    if (dataSource !== CORE_FIRPLAK_SOURCE && UUID_PATTERN.test(dataSource)) {
        return getDatasetProducts([dataSource], search, page, pageSize)
    }

    const brandScope: TemplateBrandScope = templateSource?.brand_scope === 'private_label'
        ? 'private_label'
        : 'firplak'
    const catalogScope = normalizeCatalogScope(templateSource?.catalog_scope)

    if (dataSource === CORE_FIRPLAK_SOURCE && catalogScope !== 'sku') {
        const result = await listCatalogTargetContexts({
            scope: catalogScope,
            search,
            brandScope,
            privateLabelClientName: templateSource?.private_label_client_name,
            limit: pageSize,
            offset: (page - 1) * pageSize,
        })

        return {
            products: result.targets,
            totalCount: result.totalCount,
        }
    }

    const filters: ProductFilters = {}
    if (search) filters.search = search
    if (brandScope === 'private_label') {
        filters.brandFilter = {
            scope: 'private_label',
            clientName: String(templateSource?.private_label_client_name || '').trim(),
        }
    } else {
        filters.brandFilter = { scope: 'firplak' }
    }

    const result = await composeProductsByFilters(filters, pageSize, (page - 1) * pageSize)
    return result
}

export async function resolvePrintAssetsAction(assetIds: string[]) {
    await assertPermission('action:print')

    const map: Record<string, string> = {}
    const systemNames = [
        'Logo Firplak general',
        'Icono RH Fijo',
        'Icono Canto',
        'Icono Canto 1.5mm',
        'Icono CARB2',
        'Icono Cierre Lento',
        'Icono Extensión Total',
    ]

    const { data: sysAssets, error: sysError } = await supabaseServer
        .from('assets')
        .select('name, file_path')
        .in('name', systemNames)

    if (sysError) {
        console.error('Error fetching system assets for print:', sysError)
    }

    if (sysAssets) {
        (sysAssets as { name: string | null; file_path: string | null }[]).forEach((asset) => {
            if (!asset.name) return

            map[asset.name] = asset.file_path || ''
            if (asset.name === 'Logo Firplak general') map.logo_empresa = asset.file_path || ''
            if (asset.name === 'Icono RH Fijo') map.sys_icon_rh = asset.file_path || ''
            if (asset.name === 'Icono Canto') map.sys_icon_canto = asset.file_path || ''
            if (asset.name === 'Icono Canto 1.5mm') map.sys_icon_edge_1_5mm = asset.file_path || ''
            if (asset.name === 'Icono CARB2') map.sys_icon_carb2 = asset.file_path || ''
            if (asset.name === 'Icono Cierre Lento') map.sys_icon_soft_close = asset.file_path || ''
            if (asset.name === 'Icono Extensión Total') map.sys_icon_full_extension = asset.file_path || ''
        })
    }

    if (!assetIds || assetIds.length === 0) return map

    const uniqueIds = Array.from(new Set(assetIds)).filter((id) => id && id.length > 30)
    if (uniqueIds.length === 0) return map

    const { data: customAssets, error: customError } = await supabaseServer
        .from('assets')
        .select('id, file_path')
        .in('id', uniqueIds)

    if (customError) {
        console.error('Error fetching custom assets for print:', customError)
    }

    if (customAssets) {
        (customAssets as { id: string; file_path: string | null }[]).forEach((asset) => {
            map[asset.id] = asset.file_path || ''
        })
    }

    return map
}

export async function resolveZoneHomeEnForPrintAction(zoneEs: string | null | undefined): Promise<string | null> {
    await assertPermission('action:print')

    if (!zoneEs) return null

    const key = zoneEs.trim().toUpperCase()
    try {
        const rows = await dbQuery(
            `SELECT term_en FROM public.glossary 
             WHERE term_es = '${key.replace(/'/g, "''")}' 
               AND active = true 
             LIMIT 1`
        )
        return rows && rows.length > 0 ? (rows[0].term_en as string) : null
    } catch {
        return null
    }
}
