import { dbQuery } from '@/lib/supabase'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PreviewClient } from '@/components/generate/PreviewClient'

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

    // Cargar el producto
    const pRows = await dbQuery(`SELECT * FROM public.cabinet_products WHERE id='${id}' LIMIT 1`)
    const product = pRows?.[0]

    if (!product) {
        redirect('/generate')
    }

    // Cargar plantillas activas
    const templates = await dbQuery(
        `SELECT id, name, document_type, width_mm, height_mm, orientation, active, elements_json
         FROM public.templates WHERE active = true ORDER BY updated_at DESC`
    ) || []

    // Evaluar reglas del motor para obtener el nombre derivado e iconos
    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true`) || []
    const engineResult = await evaluateProductRules(product, rules)

    // Determinar template inicial
    const initialTemplateId = templateIdParam ?? templates[0]?.id ?? null

    return (
        <div className="flex flex-col gap-6 pb-10">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/generate"
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
