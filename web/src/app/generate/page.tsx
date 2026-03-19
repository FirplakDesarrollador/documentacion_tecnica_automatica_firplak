import { dbQuery } from '@/lib/supabase'
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

    const hasFilter = f.length > 0 || r.length > 0 || m.length > 0

    // --- Cargar productos filtrados ---
    let products: any[] = []
    if (hasFilter) {
        const conditions: string[] = []
        if (f.length > 0) conditions.push(`familia_code IN (${f.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        if (r.length > 0) conditions.push(`ref_code IN (${r.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        if (m.length > 0) conditions.push(`commercial_measure IN (${m.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        products = await dbQuery(
            `SELECT id, code, final_name_es, final_name_en, product_type, validation_status, familia_code,
                    isometric_asset_id, barcode_text, commercial_measure, weight_kg, width_cm, depth_cm, height_cm,
                    sap_description, furniture_name, color_code, ref_code
             FROM public.products ${where} ORDER BY code ASC LIMIT 200`
        ) || []
    }

    // --- Cargar filtros dinámicos ---
    // Usamos los valores reales de familia_code en products (ej: 'VBAN05')
    // porque los códigos de la tabla familias ('BAN05') no coinciden con los de products
    const familiaRecords = await dbQuery(
        `SELECT DISTINCT p.familia_code, f.name
         FROM public.products p
         LEFT JOIN public.familias f ON f.code = LTRIM(p.familia_code, 'V')
         WHERE p.familia_code IS NOT NULL
         ORDER BY p.familia_code ASC`
    ) || []
    const families = familiaRecords.map((fam: any) => ({
        value: fam.familia_code,
        label: fam.name ? `${fam.familia_code} - ${fam.name}` : fam.familia_code
    }))

    let references: { value: string, label: string }[] = []
    if (f.length > 0) {
        const fFilter = f.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(',')
        const refRecords = await dbQuery(
            `SELECT DISTINCT ref_code, furniture_name FROM public.products WHERE ref_code IS NOT NULL AND familia_code IN (${fFilter})`
        ) || []
        references = refRecords
            .map((rec: any) => ({ value: rec.ref_code as string, label: `${rec.ref_code} - ${rec.furniture_name || ''}` }))
            .sort((a: any, b: any) => a.value.localeCompare(b.value))
    }

    let measures: string[] = []
    if (f.length > 0) {
        const fFilter = f.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(',')
        const measureRecords = await dbQuery(
            `SELECT DISTINCT commercial_measure FROM public.products WHERE commercial_measure IS NOT NULL AND commercial_measure != '' AND familia_code IN (${fFilter})`
        ) || []
        measures = measureRecords.map((rec: any) => rec.commercial_measure as string).sort()
    }

    // --- Cargar plantillas activas ---
    const templates = await dbQuery(
        `SELECT id, name, document_type, width_mm, height_mm, orientation, active, elements_json
         FROM public.templates WHERE active = true ORDER BY updated_at DESC`
    ) || []

    return (
        <div className="flex flex-col gap-8 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                            <FileOutput className="w-5 h-5 text-indigo-600" />
                        </div>
                        Generar Documentos
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Filtra productos, elige una plantilla y exporta fichas técnicas de forma individual o masiva.
                    </p>
                </div>
            </div>

            <GenerateClient
                products={products}
                templates={templates}
                families={families}
                references={references}
                measures={measures}
                initialTemplateId={templateId}
                hasFilter={hasFilter}
            />
        </div>
    )
}
