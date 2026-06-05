import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/supabase'
import type { ComposedProduct } from '@/lib/engine/product_composer'
import { apiGuard } from '@/utils/auth/access'

function toArray(values: string[] | undefined) {
    if (!values) return []
    return values.filter(Boolean)
}

export async function GET(request: Request) {
    const guard = await apiGuard('admin')
    if (guard.response) return guard.response

    const url = new URL(request.url)
    const familyCodes = toArray(url.searchParams.getAll('f'))
    const referenceValues = toArray(url.searchParams.getAll('r'))
    const measures = toArray(url.searchParams.getAll('m'))
    const query = url.searchParams.get('q')?.trim() || null
    const templateId = url.searchParams.get('template_id')
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '200', 10) || 200)

    const parsedReferences = referenceValues.map((value) => {
        const parts = value.split('|||')
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

    const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0
    const referenceCodes = parsedReferences.map(item => item.reference_code).filter(isNonEmptyString)
    const referenceMeasures = parsedReferences.map(item => item.commercial_measure).filter(isNonEmptyString)
    const familiesFromReferences = parsedReferences.map(item => item.family_code).filter(isNonEmptyString)
    const effectiveFamilies = familyCodes.length > 0 ? familyCodes : familiesFromReferences
    const effectiveMeasures = referenceMeasures.length > 0 ? referenceMeasures : measures
    const hasFilter =
        effectiveFamilies.length > 0 ||
        referenceCodes.length > 0 ||
        effectiveMeasures.length > 0 ||
        Boolean(query)

    let brandFilter:
        | { scope: 'firplak' }
        | { scope: 'private_label'; clientName: string } = { scope: 'firplak' }
    let templateBrandWarning: string | null = null

    if (templateId) {
        const templates = await dbQuery(
            `SELECT id, brand_scope, private_label_client_name
             FROM public.plantillas_doc_tec
             WHERE id = '${templateId.replace(/'/g, "''")}'
             LIMIT 1`
        ) as Array<{ brand_scope?: string | null; private_label_client_name?: string | null }>

        const selectedTemplate = templates[0]
        const brandScope = selectedTemplate?.brand_scope === 'private_label' ? 'private_label' : 'firplak'
        const plc = selectedTemplate?.private_label_client_name ? String(selectedTemplate.private_label_client_name).trim() : ''

        if (brandScope === 'private_label') {
            if (!plc) {
                templateBrandWarning = 'La plantilla seleccionada es Marca Propia pero no tiene cliente configurado.'
            } else {
                brandFilter = { scope: 'private_label', clientName: plc }
            }
        }
    }

    if (templateBrandWarning) {
        return NextResponse.json({
            products: [],
            totalCount: 0,
            hasFilter: true,
            templateBrandWarning,
        })
    }

    if (!hasFilter) {
        return NextResponse.json({
            products: [],
            totalCount: 0,
            hasFilter: false,
            templateBrandWarning: null,
        })
    }

    const { composeProductsByFilters } = await import('@/lib/engine/product_composer')
    const result = await composeProductsByFilters(
        {
            families: effectiveFamilies,
            references: referenceCodes,
            measures: effectiveMeasures,
            search: query || undefined,
            brandFilter,
        },
        pageSize,
        (page - 1) * pageSize
    )

    return NextResponse.json({
        products: result.products as ComposedProduct[],
        totalCount: result.totalCount,
        hasFilter: true,
        templateBrandWarning: null,
    })
}
