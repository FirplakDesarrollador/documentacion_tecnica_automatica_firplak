import { dbQuery } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PreviewClient } from '@/components/generate/PreviewClient'
import type { TemplateOption } from '@/components/generate/TemplatePicker'
import { computeNameWithNamingComponents } from '@/lib/engine/namingComponentsEngine'
import { resolveTemplateCatalogTarget } from '@/lib/templates/catalogScopeServer'
import { isCatalogScope, type CatalogScope } from '@/lib/templates/catalogScope'

export const dynamic = 'force-dynamic'

type DatasetPreviewRow = {
    id: string
    data_json: unknown
}

type PageProduct = Record<string, unknown> & {
    id: string
    code: string
    final_name_es: string | null
    final_name_en?: string | null
    sap_description?: string | null
    status?: string
    is_external?: boolean
    catalog_scope?: CatalogScope
    catalog_target_id?: string
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
}

function parseDatasetData(value: unknown): Record<string, unknown> {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
    return asRecord(parsed)
}

function getTextValue(record: Record<string, unknown>, key: string): string | null {
    const value = record[key]
    if (typeof value === 'string') return value || null
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return null
}

function toDatasetPreviewProduct(row: DatasetPreviewRow): PageProduct {
    const data = parseDatasetData(row.data_json)
    return {
        ...data,
        id: row.id,
        code: getTextValue(data, 'code') || getTextValue(data, 'sku') || getTextValue(data, 'id') || row.id,
        final_name_es: getTextValue(data, 'final_name_es') || getTextValue(data, 'name') || getTextValue(data, 'nombre') || 'Registro dataset',
        status: 'ACTIVO',
        is_external: true,
    }
}

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
    const requestedScope = isCatalogScope(searchParams?.scope) ? searchParams.scope : null
    const requestedTargetId = typeof searchParams?.target === 'string' && searchParams.target.trim()
        ? searchParams.target.trim()
        : id
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!requestedScope && !uuidRegex.test(id)) {
        redirect('/generate')
    }

    // 1. Cargar plantillas activas
     
    const templates = await dbQuery(
        `SELECT t.id, t.name, t.document_type, t.width_mm, t.height_mm, t.orientation, t.print_target, t.media_width_mm, t.media_length_mm, t.media_gap_mm, t.active, t.elements_json, t.export_formats, t.export_filename_format, t.data_source, to_jsonb(t)->>'catalog_scope' AS catalog_scope, t.template_font_family, t.brand_scope, t.private_label_client_name
         FROM public.plantillas_doc_tec t WHERE t.active = true ORDER BY t.updated_at DESC`
    ) as TemplateOption[] || []

    const initialTemplateId = templateIdParam ?? templates[0]?.id ?? null
    // 2. Cargar el producto según el origen
    let product: PageProduct | null = null
    
    if (requestedScope) {
        if (!initialTemplateId) redirect('/generate')

        const resolved = await resolveTemplateCatalogTarget(initialTemplateId, {
            scope: requestedScope,
            id: requestedTargetId,
        })
        if (!resolved.context) redirect('/generate')
        product = resolved.context
    } else {
        const { composeProductById } = await import('@/lib/engine/product_composer')
        const coreProduct = await composeProductById(id)

        if (coreProduct) {
            product = {
                ...coreProduct,
                catalog_scope: 'sku',
                catalog_target_id: coreProduct.id,
            }
        } else {
            const dRows = await dbQuery(
                `SELECT r.*, d.schema_json
                 FROM public.custom_dataset_rows r
                 LEFT JOIN public.custom_datasets d ON r.dataset_id = d.id
                 WHERE r.id = '${id}' LIMIT 1`
            ) as DatasetPreviewRow[]
            if (dRows && dRows[0]) {
                product = toDatasetPreviewProduct(dRows[0])
            }
        }
    }

    if (!product) {
        redirect('/generate')
    }

    // 3. Evaluar reglas del motor
    const isNonSkuCatalogTarget = isCatalogScope(product.catalog_scope) && product.catalog_scope !== 'sku'
    const namingResult = isNonSkuCatalogTarget
        ? null
        : await computeNameWithNamingComponents(product, 'final_complete_name')
    const engineResult = namingResult?.evaluation

    // Traducir a inglés en caliente usando el motor adaptativo
    const fullEngineResult = {
        ...engineResult,
        finalNameEs: isNonSkuCatalogTarget ? product.final_name_es || '' : engineResult?.finalNameEs || product.final_name_es || '',
        finalNameEn: namingResult?.finalNameEn || product.final_name_en || '',
        activeIcons: engineResult?.activeIcons || [],
        trace: engineResult?.trace || [],
    }

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
                engineResult={fullEngineResult}
            />
        </div>
    )
}
