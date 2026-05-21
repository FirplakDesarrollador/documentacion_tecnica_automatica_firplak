'use server'

import { supabase, dbQuery } from '@/lib/supabase'
import { translateProductToEnglish, ProductPayload } from '@/lib/engine/translator'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'

export interface TranslationBatchResult {
    processed: number
    updated: number
    skippedCount: number
    skippedDetails: {
        already_translated: number
        no_logic_change: number
    }
    failedCount: number
    failedItems: { code: string, reason: string, category: 'motor' | 'database' | 'validation' }[]
    missingTermsCount: number
    uniqueMissingTerms: string[]
    missingTermsMap: Record<string, string[]>
    updatedProducts: { id: string, final_name_en: string, validation_status: string }[]
}

/**
 * Procesa un lote de productos para traducciÃ³n a inglÃ©s.
 * Usa PostgREST y RPC para mÃ¡xima estabilidad.
 */
export async function translateEnglishBatchAction(
    ids: string[]
): Promise<{ success: boolean; data?: TranslationBatchResult; error?: string }> {
    if (!ids || ids.length === 0) {
        return { success: true, data: createEmptyResult() }
    }

    try {
        // 1. Fetch products via PostgREST (no Management API limits)
        const { data: rows, error: fetchError } = await supabase
            .from('v_ui_generate_list')
            .select('*')
            .in('id', ids)

        if (fetchError) throw new Error(`Fetch Error: ${fetchError.message}`)
        if (!rows || rows.length === 0) {
            return { success: true, data: createEmptyResult() }
        }

        const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
        const products = rows.map((row: any) => mapRowToComposedProduct(row))

        const { data: rules, error: rulesError } = await supabase
            .from('rules')
            .select('*')
            .eq('enabled', true)
            .order('priority', { ascending: true })

        if (rulesError) throw new Error(`Fetch Rules Error: ${rulesError.message}`)

        const result = createEmptyResult()
        const missingTermsTracker = new Map<string, Set<string>>()
        const updatesToApply: { id: string, final_name_en: string, validation_status: string }[] = []

        for (const product of products) {
            result.processed++
            try {
                const evalResult = evaluateProductRules(product as any, (rules || []) as any)
                const translation = await translateProductToEnglish(
                    ({ ...evalResult.transformedProduct, final_name_es: evalResult.finalNameEs } as any) as ProductPayload,
                    product.product_type || 'MUEBLE',
                    evalResult.activeVariableIds
                )
                const { translatedName, missingTerms } = translation

                // Tracking de tÃ©rminos faltantes por producto
                if (missingTerms.length > 0) {
                    missingTerms.forEach(t => {
                        if (!missingTermsTracker.has(t)) missingTermsTracker.set(t, new Set())
                        missingTermsTracker.get(t)?.add(product.code || product.id)
                    })
                }

                const currentName = product.final_name_en || ''
                const status = missingTerms.length > 0 ? 'needs_review' : 'ready'
                const isUnchanged = translatedName === currentName && product.validation_status === status

                if (isUnchanged) {
                    if (status === 'ready') result.skippedDetails.already_translated++
                    else result.skippedDetails.no_logic_change++
                    result.skippedCount++
                    continue
                }

                updatesToApply.push({
                    id: product.id,
                    final_name_en: translatedName,
                    validation_status: status
                })
            } catch (err: any) {
                console.error(`Error translating product ${product.code}:`, err)
                result.failedCount++
                result.failedItems.push({
                    code: product.code || product.id,
                    reason: err.message || 'Error en motor de traducciÃ³n',
                    category: 'motor'
                })
            }
        }

        // 2. Apply updates via RPC (Single transaction per batch)
        if (updatesToApply.length > 0) {
            const { error: rpcError } = await supabase.rpc('bulk_update_product_translations', {
                updates: updatesToApply
            })

            if (rpcError) {
                console.error("RPC Update Error:", rpcError)
                updatesToApply.forEach(up => {
                    const prod = products.find(p => p.id === up.id)
                    result.failedCount++
                    result.failedItems.push({
                        code: prod?.code || up.id,
                        reason: rpcError.message,
                        category: 'database'
                    })
                })
            } else {
                result.updated = updatesToApply.length
                result.updatedProducts = updatesToApply
            }
        }

        // 3. Finalize missing terms reporting
        const finalMap: Record<string, string[]> = {}
        missingTermsTracker.forEach((codes, term) => {
            finalMap[term] = Array.from(codes)
        })

        result.missingTermsMap = finalMap
        result.uniqueMissingTerms = Object.keys(finalMap)
        result.missingTermsCount = result.uniqueMissingTerms.length

        return { success: true, data: result }
    } catch (error: any) {
        console.error("Batch Translation Action Error:", error)
        return { success: false, error: error.message || 'Error crÃ­tico en el lote' }
    }
}

function createEmptyResult(): TranslationBatchResult {
    return {
        processed: 0,
        updated: 0,
        skippedCount: 0,
        skippedDetails: {
            already_translated: 0,
            no_logic_change: 0
        },
        failedCount: 0,
        failedItems: [],
        missingTermsCount: 0,
        uniqueMissingTerms: [],
        missingTermsMap: {},
        updatedProducts: []
    }
}

/**
 * Escanea el catÃ¡logo en busca de tÃ©rminos faltantes en las traducciones
 * sin realizar modificaciones en la base de datos.
 * Retorna una lista de tÃ©rminos y su frecuencia.
 */
export async function scanMissingGlossaryTermsAction(): Promise<{ success: boolean; missingTerms?: { term: string, count: number }[]; error?: string }> {
    try {
        // IMPORTANTE:
        // No filtrar por `validation_status` / `final_complete_name_en` (persistidos en DB),
        // porque pueden estar desactualizados vs el motor vivo (cambios de reglas/config/glosario).
        const rows =
            (await dbQuery(`
                SELECT *
                FROM public.v_ui_generate_list
                WHERE COALESCE(is_exportable, true) = true
                  AND (effective_status IS NULL OR effective_status <> 'INACTIVO')
                  AND (status IS NULL OR status = 'ACTIVO')
            `)) || []

        if (!rows || rows.length === 0) {
            return { success: true, missingTerms: [] }
        }

        const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
        const products = rows.map((row: any) => mapRowToComposedProduct(row))

        const rules = (await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`)) || []

        const termFrequency: Record<string, number> = {}

        for (const product of products) {
            try {
                const evalResult = evaluateProductRules(product as any, (rules || []) as any)
                const translation = await translateProductToEnglish(
                    ({ ...evalResult.transformedProduct, final_name_es: evalResult.finalNameEs } as any) as ProductPayload,
                    product.product_type || 'MUEBLE',
                    evalResult.activeVariableIds
                )

                const { missingTerms } = translation
                if (missingTerms.length > 0) {
                    missingTerms.forEach(t => {
                        termFrequency[t] = (termFrequency[t] || 0) + 1
                    })
                }
            } catch {
                // Ignore errors for individual products during scan
            }
        }

        const missingTermsArray = Object.entries(termFrequency)
            .map(([term, count]) => ({ term, count }))
            .sort((a, b) => b.count - a.count)

        return { success: true, missingTerms: missingTermsArray }
    } catch (error: any) {
        console.error("Scan Missing Terms Error:", error)
        return { success: false, error: error.message || 'Error al escanear conflictos' }
    }
}

