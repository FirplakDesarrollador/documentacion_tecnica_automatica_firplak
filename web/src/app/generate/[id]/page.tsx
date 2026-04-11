import { dbQuery } from '@/lib/supabase'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PreviewClient } from '@/components/generate/PreviewClient'

export const dynamic = 'force-dynamic'

export default async function GeneratePreviewPage({
    params,
    searchParams: searchParamsPromise,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const { id } = await params
    const searchParams = await searchParamsPromise
    const templateIdParam = typeof searchParams?.template_id === 'string' ? searchParams.template_id : null
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
        redirect('/generate')
    }

    // 1. Cargar plantillas activas
    const templates = await dbQuery(
        `SELECT id, name, document_type, width_mm, height_mm, orientation, active, elements_json, export_formats, export_filename_format, data_source
         FROM public.plantillas_doc_tec WHERE active = true ORDER BY updated_at DESC`
    ) || []

    const initialTemplateId = templateIdParam ?? templates[0]?.id ?? null
    const selectedTemplate = templates.find((t: any) => t.id === initialTemplateId)
    const dataSource = selectedTemplate?.data_source || 'core_firplak'
    
    // 2. Cargar el producto según el origen
    let product: any = null
    
    // Intentar buscar en productos core
    const pRows = await dbQuery(
        `SELECT p.*, c.name_color_sap as color_name 
         FROM public.cabinet_products p
         LEFT JOIN public.colors c ON p.color_code = c.code_4dig
         WHERE p.id='${id}' LIMIT 1`
    )
    
    if (pRows && pRows[0]) {
        product = pRows[0]
    } else {
        // Buscar en datasets externos
        const dRows = await dbQuery(
            `SELECT r.*, d.schema_json 
             FROM public.custom_dataset_rows r
             LEFT JOIN public.custom_datasets d ON r.dataset_id = d.id
             WHERE r.id = '${id}' LIMIT 1`
        )
        if (dRows && dRows[0]) {
            const row = dRows[0]
            const parsed = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json
            product = {
                ...parsed,
                id: row.id,
                code: parsed.code || parsed.sku || parsed.id || row.id,
                final_name_es: parsed.final_name_es || parsed.name || parsed.nombre || 'Registro dataset',
                status: 'ACTIVO',
                is_external: true
            }
        }
    }

    if (!product) {
        redirect('/generate')
    }

    // 3. Evaluar reglas del motor
    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true`) || []
    const engineResult = await evaluateProductRules(product, rules)

    // Construir el link de regreso
    const urlParams = new URLSearchParams()
    Object.entries(searchParams).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach(v => urlParams.append(key, v))
        } else if (value !== undefined) {
            urlParams.append(key, value)
        }
    })
    const backHref = `/generate${urlParams.toString() ? `?${urlParams.toString()}` : ''}`

    return (
        <div className="flex flex-col gap-6 pb-10">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href={backHref}
                    className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-700"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        Preview: <span className="font-mono text-indigo-600">{product.code}</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {product.final_name_es || product.sap_description || 'Sin nombre configurado'}
                    </p>
                </div>
            </div>

            {/* Preview interactivo */}
            <PreviewClient
                product={product}
                templates={templates}
                initialTemplateId={initialTemplateId}
                engineResult={engineResult}
            />
        </div>
    )
}
