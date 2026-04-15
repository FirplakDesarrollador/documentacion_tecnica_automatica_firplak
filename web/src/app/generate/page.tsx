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
    const templateId = typeof searchParams?.template_id === 'string' ? searchParams.template_id : null

    // Para filtrar productos: extraer ref_code y commercial_measure de los valores compuestos
    // Formato del valor: "ref_code|||commercial_measure" (permite filtrar ambos de un click)
    const rDecoded = r.map(v => v.split('|||')[0]).filter(Boolean)
    const mDecoded = r.map(v => v.split('|||')[1]).filter(Boolean)

    const hasFilter = f.length > 0 || r.length > 0 || m.length > 0

    // --- Cargar productos filtrados ---
    let products: any[] = []
    if (hasFilter) {
        const conditions: string[] = []
        if (f.length > 0) conditions.push(`familia_code IN (${f.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        if (rDecoded.length > 0) conditions.push(`ref_code IN (${rDecoded.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        if (mDecoded.length > 0) conditions.push(`commercial_measure IN (${mDecoded.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        else if (m.length > 0) conditions.push(`commercial_measure IN (${m.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        const where = conditions.length > 0 ? `WHERE status = 'ACTIVO' AND ${conditions.join(' AND ')}` : "WHERE status = 'ACTIVO'"
        products = await dbQuery(
            `SELECT p.*, c.name_color_sap as color_name
             FROM public.cabinet_products p
             LEFT JOIN public.colors c ON p.color_code = c.code_4dig
             ${where} ORDER BY p.code ASC LIMIT 200`
        ) || []
    }

    // --- Filtros centralizados (src/lib/data/filters.ts) ---
    // Para modificar cómo se obtienen familias o referencias, edita ese módulo.
    const families = await getFamilyFilters()
    const references = await getReferenceFilters(f)

    // Las medidas ya van integradas en el label de referencias — no se exponen como filtro separado.

    // --- Cargar plantillas activas ---
    const templates = await dbQuery(
        `SELECT id, name, document_type, width_mm, height_mm, orientation, active, elements_json, export_formats, export_filename_format, data_source
         FROM public.plantillas_doc_tec WHERE active = true ORDER BY created_at ASC`
    ) || []

    // --- Cargar reglas del motor ---
    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true`) || []

    const selectedTemplateInfo = templates.find((t: any) => t.id === templateId) || templates[0]
    const currentDataSource = selectedTemplateInfo?.data_source || 'core_firplak'
    const isDataSourceExternal = currentDataSource !== 'core_firplak'

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
            />
        </div>
    )
}
