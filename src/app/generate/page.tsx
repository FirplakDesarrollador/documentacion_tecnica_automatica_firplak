import { dbQuery } from '@/lib/supabase'
import { getFamilyFilters, getReferenceFilters } from '@/lib/data/filters'
import { GenerateClient } from '@/components/generate/GenerateClient'
import { FileOutput } from 'lucide-react'

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
    const templateId = typeof searchParams?.template_id === 'string' ? searchParams.template_id : null

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
    let products: any[] = []
    let totalCount = 0
    // Se cargan después de determinar la plantilla seleccionada (para aplicar discriminación de marca).

    // --- Filtros centralizados (src/lib/data/filters.ts) ---
    // Para modificar cómo se obtienen familias o referencias, edita ese módulo.
    const families = await getFamilyFilters()
    const references = await getReferenceFilters(f)

    // Las medidas ya van integradas en el label de referencias — no se exponen como filtro separado.

    // --- Cargar plantillas activas ---
    let templates: any[] = []
    try {
        const res = await dbQuery(
            `SELECT id, name, document_type, width_mm, height_mm, orientation, active, elements_json, export_formats, export_filename_format, data_source, template_font_family, brand_scope, private_label_client_name
             FROM public.plantillas_doc_tec WHERE active = true ORDER BY created_at ASC`
        )
        templates = Array.isArray(res) ? res : (res?.rows || [])
    } catch (e: any) {
        const msg = String(e?.message || e || "")
        if (msg.includes('column "template_font_family"') && msg.includes('does not exist')) {
            const res = await dbQuery(
                `SELECT id, name, document_type, width_mm, height_mm, orientation, active, elements_json, export_formats, export_filename_format, data_source, brand_scope, private_label_client_name
                 FROM public.plantillas_doc_tec WHERE active = true ORDER BY created_at ASC`
            )
            templates = Array.isArray(res) ? res : (res?.rows || [])
        } else {
            throw e
        }
    }

    // --- Cargar reglas del motor ---
    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true`) || []

    const selectedTemplateInfo = templates.find((t: any) => t.id === templateId) || templates[0]
    const currentDataSource = selectedTemplateInfo?.data_source || 'core_firplak'
    const isDataSourceExternal = currentDataSource !== 'core_firplak'

    const brandScope = selectedTemplateInfo?.brand_scope === 'private_label' ? 'private_label' : 'firplak'
    const plc = selectedTemplateInfo?.private_label_client_name ? String(selectedTemplateInfo.private_label_client_name).trim() : ''
    const brandFilter =
        brandScope === 'firplak'
            ? { scope: 'firplak' as const }
            : { scope: 'private_label' as const, clientName: plc }

    let templateBrandWarning: string | null = null
    let effectiveHasFilter = hasFilter
    
    // Si la plantilla es de un dataset externo, sobreescribimos los productos con todo el dataset
    // (no aplican los filtros de Familia/Referencia)
    if (isDataSourceExternal) {
        effectiveHasFilter = true 
        const dsRows = await dbQuery(`
            SELECT id, data_json 
            FROM public.custom_dataset_rows 
            WHERE dataset_id = '${currentDataSource.replace(/'/g, "''")}'
            LIMIT 500
        `) || []
        
        products = dsRows.map((r: any) => {
            const parsed = typeof r.data_json === 'string' ? JSON.parse(r.data_json) : r.data_json
            return {
                ...parsed,
                id: r.id,
                code: parsed.code || parsed.sku || parsed.id || r.id,
                final_name_es: parsed.final_name_es || parsed.name || parsed.nombre || 'Registro dataset',
                status: 'ACTIVO'
            }
        })
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
        const filtersObj = {
            families: effectiveFamilies,
            references: rDecoded,
            measures: mDecoded.length > 0 ? mDecoded : m,
            search: q || undefined,
            brandFilter,
        }
        
        const { composeProductsByFilters } = await import('@/lib/engine/product_composer')
        const limitVal = q ? 1000 : 200
        const result = await composeProductsByFilters(filtersObj, limitVal)
        products = result.products
        totalCount = result.totalCount
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
                            Generar Documentos
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
                templateBrandWarning={templateBrandWarning}
            />
        </div>
    )
}
