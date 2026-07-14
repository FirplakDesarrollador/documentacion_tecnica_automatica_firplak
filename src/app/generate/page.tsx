import { dbQuery } from '@/lib/supabase'
import { getFamilyFilters, getReferenceFilters } from '@/lib/data/filters'
import { GenerateClient } from '@/components/generate/GenerateClient'
import type { GenerateProduct } from '@/components/generate/GenerateProductTable'
import type { TemplateOption } from '@/components/generate/TemplatePicker'
import { FileOutput } from 'lucide-react'
import { loadAllRulesForNamingType } from '@/lib/engine/namingComponents'
import { listCatalogTargetContexts, type CatalogTargetContext } from '@/lib/templates/catalogScopeServer'
import { getTemplateCatalogScope, isCatalogScope, isCoreCatalogDataSource } from '@/lib/templates/catalogScope'

type LinkedDatasetRow = {
    id: string
    name: string | null
}

type DatasetRow = {
    id: string
    data_json: string | Record<string, unknown>
}

type GenerateProductIdentity = {
    id: string
    code: string
    final_name_es: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
}

function parseDatasetData(value: string | Record<string, unknown>): Record<string, unknown> {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
    return asRecord(parsed)
}

function getTextValue(record: Record<string, unknown>, key: string): string | null {
    const value = record[key]
    if (typeof value === 'string') return value || null
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return null
}

function getFirstTextValue(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = getTextValue(record, key)
        if (value) return value
    }
    return null
}

function getNumberValue(record: Record<string, unknown>, key: string): number | null {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function getStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
    const value = record[key]
    return Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
        ? value
        : undefined
}

function toGenerateProduct(source: GenerateProductIdentity): GenerateProduct {
    const record = source as unknown as Record<string, unknown>
    return {
        ...record,
        id: source.id,
        code: source.code,
        final_name_es: source.final_name_es,
        product_type: getTextValue(record, 'product_type'),
        validation_status: getTextValue(record, 'validation_status') || '',
        familia_code: getTextValue(record, 'familia_code') || getTextValue(record, 'family_code'),
        isometric_asset_id: getTextValue(record, 'isometric_asset_id'),
        barcode_text: getTextValue(record, 'barcode_text'),
        commercial_measure: getTextValue(record, 'commercial_measure'),
        weight_kg: getNumberValue(record, 'weight_kg'),
        width_cm: getNumberValue(record, 'width_cm'),
        depth_cm: getNumberValue(record, 'depth_cm'),
        height_cm: getNumberValue(record, 'height_cm'),
        color_code: getTextValue(record, 'color_code'),
        color_name: getTextValue(record, 'color_name'),
        ref_code: getTextValue(record, 'ref_code'),
        effective_status: getTextValue(record, 'effective_status') || undefined,
        is_exportable: typeof record.is_exportable === 'boolean' ? record.is_exportable : undefined,
        inactive_reasons: getStringArray(record, 'inactive_reasons'),
        catalog_scope: isCatalogScope(record.catalog_scope) ? record.catalog_scope : undefined,
        catalog_target_id: getTextValue(record, 'catalog_target_id') || undefined,
    }
}

function toScopedGenerateProduct(target: CatalogTargetContext): GenerateProduct {
    return toGenerateProduct(target)
}

function toExternalDatasetProduct(row: DatasetRow): GenerateProduct {
    const data = parseDatasetData(row.data_json)
    const source = {
        ...data,
        id: row.id,
        code: getFirstTextValue(data, ['code', 'sku', 'id']) || row.id,
        final_name_es: getFirstTextValue(data, ['final_name_es', 'name', 'nombre']) || 'Registro dataset',
        status: 'ACTIVO',
        is_external: true,
    }
    return toGenerateProduct(source)
}

export default async function GeneratePage({
    searchParams: searchParamsPromise,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const searchParams = await searchParamsPromise

    const toArray = (val: string | string[] | undefined) => {
        if (!val) return []
        if (Array.isArray(val)) return val
        return [val]
    }

    const f = toArray(searchParams?.f)
    const r = toArray(searchParams?.r)
    const m = toArray(searchParams?.m)
    const q = typeof searchParams?.q === 'string' ? searchParams.q : null
    const pageStr = typeof searchParams?.page === 'string' ? searchParams.page : '1'
    const page = Math.max(1, parseInt(pageStr, 10) || 1)
    const pageSize = 200
    const templateId = typeof searchParams?.template_id === 'string' ? searchParams.template_id : null
    const datasetIdParam = typeof searchParams?.dataset_id === 'string' ? searchParams.dataset_id : null

    // Para filtrar productos: extraer reference_code y commercial_measure desde valores compuestos.
    // Formatos soportados (compat):
    // - "family_code|||reference_code|||commercial_measure" (formato actual, evita cruces entre familias)
    // - "reference_code|||commercial_measure" (formato legacy)
    const parsedR = r.map((v) => {
        const parts = v.split('|||')
        if (parts.length >= 3) {
            const [family_code, reference_code, commercial_measure] = parts
            return { family_code, reference_code, commercial_measure }
        }
        if (parts.length === 2) {
            const [reference_code, commercial_measure] = parts
            return { family_code: undefined, reference_code, commercial_measure }
        }
        const [reference_code] = parts
        return { family_code: undefined, reference_code, commercial_measure: undefined }
    })

    const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0
    const rDecoded = parsedR.map(p => p.reference_code).filter(isNonEmptyString)
    const mDecoded = parsedR.map(p => p.commercial_measure).filter(isNonEmptyString)
    const familiesFromR = parsedR.map(p => p.family_code).filter(isNonEmptyString)

    const hasFilter = f.length > 0 || r.length > 0 || m.length > 0 || (typeof q === 'string' && q.trim().length > 0)

    // --- Cargar productos filtrados ---
    let products: GenerateProduct[] = []
    let totalCount = 0
    // Se cargan después de determinar la plantilla seleccionada (para aplicar discriminación de marca).

    // --- Filtros centralizados (src/lib/data/filters.ts) ---
    // Para modificar cómo se obtienen familias o referencias, edita ese módulo.
    const families = await getFamilyFilters()
    const references = await getReferenceFilters(f)

    // Las medidas ya van integradas en el label de referencias — no se exponen como filtro separado.

    // --- Cargar plantillas activas ---
     
    const templates = await dbQuery(
        `SELECT t.id, t.name, t.document_type, t.width_mm, t.height_mm, t.orientation, t.print_target, t.media_width_mm, t.media_length_mm, t.media_gap_mm, t.active, t.elements_json, t.export_formats, t.export_filename_format, t.data_source, to_jsonb(t)->>'catalog_scope' AS catalog_scope, t.template_font_family, t.brand_scope, t.private_label_client_name
         FROM public.plantillas_doc_tec t WHERE t.active = true ORDER BY t.created_at ASC`
    ) as TemplateOption[] || []

    // --- Cargar componentes del motor de nombres ---
    const rules = await loadAllRulesForNamingType('final_complete_name')

    const selectedTemplateInfo = templates.find((template) => template.id === templateId) || templates[0]
    const templateDataSource = selectedTemplateInfo?.data_source || 'core_firplak'
    const templateCatalogScope = getTemplateCatalogScope(templateDataSource, selectedTemplateInfo?.catalog_scope)

    const isLegacySpecificDataset =
        templateDataSource !== 'core_firplak' &&
        templateDataSource !== 'custom_datasets' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(templateDataSource))

    const isGenericDatasets = templateDataSource === 'custom_datasets'

    let effectiveDatasetId: string | null = null
    let availableDatasetsForTemplate: { id: string; name: string }[] = []

    if (isLegacySpecificDataset) {
        effectiveDatasetId = String(templateDataSource)
    } else if (isGenericDatasets && selectedTemplateInfo?.id) {
         
        const linkedDatasets = await dbQuery(`
            SELECT d.id, d.name, d.schema_json, d.created_at
            FROM public.template_dataset_links l
            JOIN public.custom_datasets d ON d.id = l.dataset_id
            WHERE l.template_id = '${String(selectedTemplateInfo.id).replace(/'/g, "''")}'
            ORDER BY d.created_at DESC
        `) as LinkedDatasetRow[] || []

        // Show ALL linked datasets — synced or not — so the user can preview any associated data.
        // The sync status is visible in the DatasetConfigurator.
        availableDatasetsForTemplate = linkedDatasets.map((d) => ({
            id: String(d.id),
            name: String(d.name || ''),
        }))

        if (datasetIdParam && availableDatasetsForTemplate.some(d => d.id === datasetIdParam)) {
            effectiveDatasetId = datasetIdParam
        } else {
            effectiveDatasetId = null
        }
    }

    const isDataSourceExternal = Boolean(effectiveDatasetId)

    const brandScope = selectedTemplateInfo?.brand_scope === 'private_label' ? 'private_label' : 'firplak'
    const plc = selectedTemplateInfo?.private_label_client_name ? String(selectedTemplateInfo.private_label_client_name).trim() : ''
    const brandFilter =
        brandScope === 'firplak'
            ? { scope: 'firplak' as const }
            : { scope: 'private_label' as const, clientName: plc }

    let templateBrandWarning: string | null = null
    let effectiveHasFilter = hasFilter

    // Dataset-genérico no requiere filtros (se usa selector de dataset).
    if (isGenericDatasets) {
        effectiveHasFilter = true
    }
    
    // Si la plantilla usa dataset externo (legacy o genérico con dataset seleccionado), sobreescribimos los productos con todo el dataset
    // (no aplican los filtros de Familia/Referencia)
    if (isDataSourceExternal && effectiveDatasetId) {
        effectiveHasFilter = true 
         
        const dsRows = await dbQuery(`
            SELECT id, data_json 
            FROM public.custom_dataset_rows 
            WHERE dataset_id = '${effectiveDatasetId.replace(/'/g, "''")}'
            LIMIT 500
        `) as DatasetRow[] || []
        
         products = dsRows.map(toExternalDatasetProduct)
         totalCount = products.length
     } else if (brandScope === 'private_label' && !plc) {
        // Private label template without client configured: block listing/export safely.
        effectiveHasFilter = true
        products = []
        totalCount = 0
        templateBrandWarning = 'La plantilla seleccionada es Marca Propia pero no tiene cliente configurado. Ve a Plantillas → Configurar y selecciona el cliente.'
    } else if (hasFilter) {
        // Si no viene `f`, intentamos derivar la familia desde `r` (cuando viene en formato triple).
        const effectiveFamilies = f.length > 0 ? f : familiesFromR
        const offset = (page - 1) * pageSize
        const effectiveMeasures = mDecoded.length > 0 ? mDecoded : m

        if (isCoreCatalogDataSource(templateDataSource) && templateCatalogScope && templateCatalogScope !== 'sku') {
            const result = await listCatalogTargetContexts({
                scope: templateCatalogScope,
                familyCodes: effectiveFamilies,
                referenceCodes: rDecoded,
                measures: effectiveMeasures,
                search: q || undefined,
                brandScope,
                privateLabelClientName: plc || null,
                limit: pageSize,
                offset,
            })
            products = result.targets.map(toScopedGenerateProduct)
            totalCount = result.totalCount
        } else {
            const filtersObj = {
                families: effectiveFamilies,
                references: rDecoded,
                measures: effectiveMeasures,
                search: q || undefined,
                brandFilter,
            }
            const { composeProductsByFilters } = await import('@/lib/engine/product_composer')
            const result = await composeProductsByFilters(filtersObj, pageSize, offset)
            const composedProducts = result.products.map(toGenerateProduct)
            products = isCoreCatalogDataSource(templateDataSource)
                ? composedProducts.map((product) => ({
                    ...product,
                    catalog_scope: 'sku' as const,
                    catalog_target_id: product.id,
                    target_scope: 'sku',
                    target_id: product.id,
                }))
                : composedProducts
            totalCount = result.totalCount
        }
    }

    return (
        <div className="flex flex-col gap-8 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                                <FileOutput className="w-5 h-5 text-indigo-600" />
                            </div>
                            Generar documentos
                        </h1>
                        <div className="flex items-center gap-2 mt-1 md:mt-0 ml-0 md:ml-4">
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-inset ring-slate-200 uppercase tracking-tight">
                                300 DPI
                            </span>
                            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-inset ring-indigo-200 uppercase tracking-tight" title="Tiempo máximo que el sistema espera para procesar cada documento">
                                Espera Máx: 30s
                            </span>
                        </div>
                    </div>
                    <p className="text-slate-500">
                        Filtra productos, elige una plantilla y exporta fichas técnicas de forma individual o masiva.
                    </p>
                </div>
            </div>

            <GenerateClient
                 
                products={products}
                templates={templates}
                rules={rules}
                families={families}
                references={references}
                initialTemplateId={templateId}
                hasFilter={effectiveHasFilter}
                isExternalSource={isDataSourceExternal}
                totalCount={totalCount}
                page={page}
                pageSize={pageSize}
                templateBrandWarning={templateBrandWarning}
                datasetsForTemplate={availableDatasetsForTemplate}
                initialDatasetId={effectiveDatasetId}
            />
        </div>
    )
}
