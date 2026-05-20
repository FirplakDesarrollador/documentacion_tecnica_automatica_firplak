import { dbQuery } from '@/lib/supabase'
import { evaluateProductRules } from './ruleEvaluator'
import { translateProductToEnglish } from './translator'
import { mapRowToComposedProduct, type ComposedProduct } from './product_composer'

export interface RecomputedSkuName {
    id: string
    version_id: string | null
    code: string
    previous_final_name_es: string | null
    previous_final_name_en: string | null
    final_name_es: string
    final_name_en: string
}

export interface RecomputedVersionName {
    version_id: string
    sku_base: string
    previous_final_name_es: string | null
    previous_final_name_en: string | null
    final_name_es: string
    final_name_en: string
    validation_status: string
}

export interface RecomputeMasterNamesResult {
    processedSkus: number
    updatedSkus: number
    updatedVersions: number
    products: RecomputedSkuName[]
    versions: RecomputedVersionName[]
}

async function loadEnabledRules() {
    return await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`) || []
}

function toSqlList(ids: string[]) {
    return ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',')
}

async function fetchRowsByPredicate(predicate: string) {
    return await dbQuery(`
        SELECT *
        FROM public.v_ui_generate_list
        WHERE ${predicate}
        ORDER BY sku_complete ASC
    `) || []
}

async function computeNames(product: ComposedProduct, rules: any[]) {
    const evaluation = evaluateProductRules(product as any, rules)
    const translation = await translateProductToEnglish(
        { ...evaluation.transformedProduct, final_name_es: evaluation.finalNameEs } as any,
        product.product_type || 'MUEBLE',
        evaluation.activeVariableIds
    )

    return {
        final_name_es: evaluation.finalNameEs,
        final_name_en: translation.isValid ? translation.translatedName : '',
        validation_status: translation.isValid ? 'ready' : 'needs_review',
    }
}

async function recomputeFromRows(rows: any[]): Promise<RecomputeMasterNamesResult> {
    if (!rows.length) {
        return {
            processedSkus: 0,
            updatedSkus: 0,
            updatedVersions: 0,
            products: [],
            versions: [],
        }
    }

    const rules = await loadEnabledRules()
    const skuProducts = rows.map(row => mapRowToComposedProduct(row, { includeSkuOverrides: true }))

    const versionRows = new Map<string, any>()
    for (const row of rows) {
        const versionId = row.version_id ? String(row.version_id) : null
        if (versionId && !versionRows.has(versionId)) {
            versionRows.set(versionId, row)
        }
    }

    const versionResults: RecomputedVersionName[] = []
    for (const row of versionRows.values()) {
        const versionProduct = mapRowToComposedProduct(row, { includeSkuOverrides: false })
        const names = await computeNames(versionProduct, rules)

        if (versionProduct.version_id) {
            await dbQuery(
                `UPDATE public.product_versions
                 SET final_base_name_es = $1,
                     final_base_name_en = $2,
                     validation_status = $3,
                     updated_at = NOW()
                 WHERE id = $4`,
                [names.final_name_es, names.final_name_en, names.validation_status, versionProduct.version_id]
            )
        }

        versionResults.push({
            version_id: String(versionProduct.version_id || ''),
            sku_base: versionProduct.sku_base,
            previous_final_name_es: row.final_base_name_es ?? null,
            previous_final_name_en: row.final_base_name_en ?? null,
            final_name_es: names.final_name_es,
            final_name_en: names.final_name_en,
            validation_status: names.validation_status,
        })
    }

    const skuResults: RecomputedSkuName[] = []
    for (const product of skuProducts) {
        const names = await computeNames(product, rules)

        await dbQuery(
            `UPDATE public.product_skus
             SET final_complete_name_es = $1,
                 final_complete_name_en = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [names.final_name_es, names.final_name_en, product.id]
        )

        skuResults.push({
            id: product.id,
            version_id: product.version_id ?? null,
            code: product.code,
            previous_final_name_es: product.final_complete_name_es,
            previous_final_name_en: product.final_complete_name_en,
            final_name_es: names.final_name_es,
            final_name_en: names.final_name_en,
        })
    }

    return {
        processedSkus: skuProducts.length,
        updatedSkus: skuResults.length,
        updatedVersions: versionResults.length,
        products: skuResults,
        versions: versionResults,
    }
}

export async function recomputeMasterNamesForSkuIds(ids: string[]): Promise<RecomputeMasterNamesResult> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
    if (uniqueIds.length === 0) {
        return {
            processedSkus: 0,
            updatedSkus: 0,
            updatedVersions: 0,
            products: [],
            versions: [],
        }
    }

    const rows = await fetchRowsByPredicate(`id IN (${toSqlList(uniqueIds)})`)
    return recomputeFromRows(rows)
}

export async function recomputeMasterNamesForVersionIds(ids: string[]): Promise<RecomputeMasterNamesResult> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
    if (uniqueIds.length === 0) {
        return {
            processedSkus: 0,
            updatedSkus: 0,
            updatedVersions: 0,
            products: [],
            versions: [],
        }
    }

    const rows = await fetchRowsByPredicate(`version_id IN (${toSqlList(uniqueIds)})`)
    return recomputeFromRows(rows)
}

export async function recomputeMasterNamesByProductType(
    productType: string,
    offset: number,
    limit: number
): Promise<RecomputeMasterNamesResult> {
    const safeType = productType.replace(/'/g, "''")
    const rows = await dbQuery(`
        SELECT *
        FROM public.v_ui_generate_list
        WHERE product_type = '${safeType}'
          AND product_name IS NOT NULL
        ORDER BY sku_complete ASC
        LIMIT ${limit} OFFSET ${offset}
    `) || []

    return recomputeFromRows(rows)
}
