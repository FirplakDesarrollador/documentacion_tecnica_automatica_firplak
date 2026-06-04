import { dbQuery, supabaseServer } from '@/lib/supabase'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { evaluateProductRules } from './ruleEvaluator'
import { getNamingFieldValue } from './namingFieldResolver'
import {
    componentsToRules,
    loadNamingComponents,
    type NamingComponent,
} from './namingComponents'
import { mapRowToComposedProduct } from './product_composer'

type NamingType = string | null | undefined
type KnownNamingType = 'final_base_name' | 'final_complete_name' | 'sap_description_recommended'
type SupabaseRpcClient = {
    rpc: (
        functionName: string,
        args?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>
}

async function callMarkRpc(functionName: string, args: Record<string, unknown>) {
    const { data, error } = await (supabaseServer as unknown as SupabaseRpcClient).rpc(functionName, args)
    if (error) throw new Error(error.message)
    return data as string | null
}

function sqlString(value: string) {
    return `'${String(value).replace(/'/g, "''")}'`
}

function normalizeGlossaryValue(value: unknown) {
    if (value === null || value === undefined) return ''
    return String(value)
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim()
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
    return Array.from(new Set(
        values
            .map(normalizeGlossaryValue)
            .filter(Boolean)
    ))
}

function chunks<T>(values: T[], size: number) {
    const result: T[][] = []
    for (let index = 0; index < values.length; index += size) {
        result.push(values.slice(index, index + size))
    }
    return result
}

function isKnownNamingType(value: string): value is KnownNamingType {
    return value === 'final_base_name'
        || value === 'final_complete_name'
        || value === 'sap_description_recommended'
}

function isTranslatableEnglishComponent(component: NamingComponent) {
    if (component.order_en === null || component.order_en === undefined) return false
    return component.behavior_en === 'translate'
        || component.behavior_en === 'translate_if_exists'
        || component.behavior_en === 'resolved_type'
        || component.component_key === 'resolved_type'
}

function isVariableActiveForEnglish(variableId: string, activeVariableIds: string[]) {
    if (variableId === 'resolved_type') return true
    const mapping: Record<string, string[]> = {
        rh: ['rh_flag', 'rh'],
        canto_puertas: ['edge_2mm_flag', 'canto_puertas'],
        carb2: ['carb2'],
        product_name: ['product_name'],
        line: ['line'],
        commercial_measure: ['commercial_measure'],
        accessory_text: ['accessory_text'],
        door_color_text: ['door_color_text', 'id_color_frente'],
        special_label: ['special_label'],
        zone_home: ['zone_home'],
        private_label_client_name: ['private_label_client_name'],
        resolved_type: ['product_type', 'designation', 'use_destination'],
    }
    const possibleKeys = mapping[variableId] || [variableId]
    return possibleKeys.some(key => activeVariableIds.includes(key))
}

function getResolvedTypeGlossaryKeys(product: Record<string, unknown>) {
    const productType = normalizeGlossaryValue(product.product_type || 'MUEBLE')
    const designation = normalizeGlossaryValue(product.designation)
    const useDestination = normalizeGlossaryValue(product.use_destination)

    return uniqueNonEmpty([
        `${productType} ${designation} ${useDestination}`,
        `${productType} ${designation}`,
        `${productType} ${useDestination}`,
    ])
}

function hasExactGlossaryTermMatch(
    product: Record<string, unknown>,
    components: NamingComponent[],
    activeVariableIds: string[],
    termSet: Set<string>
) {
    const hasResolvedTypeConfig = components.some(component =>
        isTranslatableEnglishComponent(component)
        && (component.component_key === 'resolved_type' || component.behavior_en === 'resolved_type')
    )

    if (hasResolvedTypeConfig) {
        const keys = getResolvedTypeGlossaryKeys(product)
        if (keys.some(key => termSet.has(key))) return true
    }

    for (const component of components) {
        if (!isTranslatableEnglishComponent(component)) continue
        if (component.component_key === 'resolved_type') continue
        if (component.behavior_en === 'resolved_type') continue
        if (!isVariableActiveForEnglish(component.component_key, activeVariableIds)) continue

        const fieldValue = getNamingFieldValue(product, component.component_key)
        if (termSet.has(normalizeGlossaryValue(fieldValue))) return true
    }

    return false
}

async function loadTranslatableEnglishModels() {
    const rows = await dbQuery(`
        SELECT DISTINCT
            upper(btrim(product_type)) AS product_type,
            COALESCE(NULLIF(btrim(naming_type), ''), 'final_complete_name') AS naming_type
        FROM public.naming_components
        WHERE product_type IS NOT NULL
          AND btrim(product_type) <> ''
          AND order_en IS NOT NULL
          AND (
            behavior_en IN ('translate', 'translate_if_exists', 'resolved_type')
            OR component_key = 'resolved_type'
          )
        ORDER BY product_type ASC, naming_type ASC
    `) || []

    return (rows as Array<{ product_type?: string; naming_type?: string }>)
        .map(row => ({
            productType: normalizeGlossaryValue(row.product_type),
            namingType: String(row.naming_type || '').trim(),
        }))
        .filter(row => row.productType && isKnownNamingType(row.namingType)) as Array<{
            productType: string
            namingType: KnownNamingType
        }>
}

export type GlossaryChangedTerm = {
    termEs: string
    previousTermEs?: string | null
    category?: string | null
}

export type GlossaryStaleResult = {
    terms: number
    affectedVersions: number
    affectedSkus: number
    jobIds: string[]
}

export async function markNamingStaleForProductType(
    productType: string,
    namingType?: NamingType,
    origin = 'app'
) {
    return callMarkRpc('mark_naming_stale_for_product_type', {
        p_product_type: productType,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForFamilies(
    familyCodes: string[],
    namingType?: NamingType,
    origin = 'app'
) {
    if (!familyCodes.length) return null
    return callMarkRpc('mark_naming_stale_for_families', {
        p_family_codes: familyCodes,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForReferences(
    referenceIds: string[],
    namingType?: NamingType,
    origin = 'app'
) {
    if (!referenceIds.length) return null
    return callMarkRpc('mark_naming_stale_for_references', {
        p_reference_ids: referenceIds,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForVersions(
    versionIds: string[],
    namingType?: NamingType,
    origin = 'app'
) {
    if (!versionIds.length) return null
    return callMarkRpc('mark_naming_stale_for_versions', {
        p_version_ids: versionIds,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForSkus(
    skuIds: string[],
    namingType?: NamingType,
    origin = 'app'
) {
    if (!skuIds.length) return null
    return callMarkRpc('mark_naming_stale_for_skus', {
        p_sku_ids: skuIds,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForColor(
    colorCode: string,
    namingType?: NamingType,
    origin = 'app'
) {
    return callMarkRpc('mark_naming_stale_for_color', {
        p_color_code: colorCode,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForVersionRule(
    versionCode: string,
    namingType?: NamingType,
    origin = 'app'
) {
    return callMarkRpc('mark_naming_stale_for_version_rule', {
        p_version_code: versionCode,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markAllNamingStale(namingType?: NamingType, origin = 'backfill') {
    return callMarkRpc('mark_naming_stale_for_all', {
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForTranslatableEnglishModels(origin = 'glossary_update') {
    const rows = await dbQuery(`
        SELECT DISTINCT
            upper(btrim(product_type)) AS product_type,
            COALESCE(NULLIF(btrim(naming_type), ''), 'final_complete_name') AS naming_type
        FROM public.naming_components
        WHERE product_type IS NOT NULL
          AND btrim(product_type) <> ''
          AND order_en IS NOT NULL
          AND (
            behavior_en IN ('translate', 'translate_if_exists', 'resolved_type')
            OR component_key = 'resolved_type'
          )
        ORDER BY product_type ASC, naming_type ASC
    `) || []

    const jobIds: string[] = []
    for (const row of rows as Array<{ product_type?: string; naming_type?: string }>) {
        const productType = String(row.product_type || '').trim()
        const namingType = String(row.naming_type || '').trim()
        if (!productType || !namingType) continue

        const jobId = await markNamingStaleForProductType(productType, namingType, origin)
        if (jobId) jobIds.push(jobId)
    }

    return {
        affectedModels: rows.length,
        jobIds: Array.from(new Set(jobIds)),
    }
}

export async function markNamingStaleForGlossaryTerms(
    changedTerms: GlossaryChangedTerm[],
    origin = 'glossary_update'
): Promise<GlossaryStaleResult> {
    const termValues = uniqueNonEmpty(
        changedTerms.flatMap(term => [term.termEs, term.previousTermEs])
    )
    if (termValues.length === 0) {
        return { terms: 0, affectedVersions: 0, affectedSkus: 0, jobIds: [] }
    }

    const termSet = new Set(termValues)
    const models = await loadTranslatableEnglishModels()
    const affectedVersionIds = new Set<string>()
    const affectedSkuIds = new Set<string>()
    const jobIds = new Set<string>()
    const batchSize = 1000

    for (const model of models) {
        const components = await loadNamingComponents(model.productType, model.namingType)
        const translatableComponents = components.filter(isTranslatableEnglishComponent)
        if (translatableComponents.length === 0) continue

        const rules = componentsToRules(components, model.productType)
        const modelVersionIds = new Set<string>()
        const modelSkuIds = new Set<string>()
        let offset = 0

        while (true) {
             
            const rows: any[] = await dbQuery(`
                SELECT *
                FROM public.v_ui_generate_list
                WHERE upper(btrim(COALESCE(product_type, ''))) = ${sqlString(model.productType)}
                ORDER BY sku_complete ASC
                LIMIT ${batchSize} OFFSET ${offset}
            `) as any[] || []

            if (rows.length === 0) break

            for (const row of rows) {
                const product = mapRowToComposedProduct(row, {
                    includeSkuOverrides: model.namingType !== 'final_base_name',
                }) as unknown as Record<string, unknown>
                const evaluation = evaluateProductRules(
                    product as unknown as Parameters<typeof evaluateProductRules>[0],
                    rules as unknown as Parameters<typeof evaluateProductRules>[1]
                )
                const productForEnglish = {
                    ...(evaluation.transformedProduct as Record<string, unknown>),
                    final_name_es: evaluation.finalNameEs,
                }

                if (!hasExactGlossaryTermMatch(
                    productForEnglish,
                    translatableComponents,
                    evaluation.activeVariableIds || [],
                    termSet
                )) {
                    continue
                }

                if (model.namingType === 'final_base_name') {
                    const versionId = normalizeGlossaryValue(product.version_id)
                    if (versionId) {
                        modelVersionIds.add(versionId)
                        affectedVersionIds.add(versionId)
                    }
                } else {
                    const skuId = normalizeGlossaryValue(product.id)
                    if (skuId) {
                        modelSkuIds.add(skuId)
                        affectedSkuIds.add(skuId)
                    }
                }
            }

            offset += rows.length
            if (rows.length < batchSize) break
        }

        if (model.namingType === 'final_base_name') {
            for (const ids of chunks(Array.from(modelVersionIds), 500)) {
                const jobId = await markNamingStaleForVersions(ids, model.namingType, origin)
                if (jobId) jobIds.add(jobId)
            }
        } else {
            for (const ids of chunks(Array.from(modelSkuIds), 500)) {
                const jobId = await markNamingStaleForSkus(ids, model.namingType, origin)
                if (jobId) jobIds.add(jobId)
            }
        }
    }

    return {
        terms: termValues.length,
        affectedVersions: affectedVersionIds.size,
        affectedSkus: affectedSkuIds.size,
        jobIds: Array.from(jobIds),
    }
}

export async function processNamingJobsInline(maxRuntimeMs = 5000) {
    void maxRuntimeMs
    return { skipped: true, reason: 'naming_jobs_are_processed_by_sidebar_or_process_stale_endpoint' }
}
