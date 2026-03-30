'use server'

import { supabase } from '@/lib/supabase'
import { translateProductToEnglish, ProductPayload } from '@/lib/engine/translator'

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
 * Procesa un lote de productos para traducción a inglés.
 * Usa PostgREST y RPC para máxima estabilidad.
 */
export async function translateEnglishBatchAction(
    ids: string[]
): Promise<{ success: boolean; data?: TranslationBatchResult; error?: string }> {
    if (!ids || ids.length === 0) {
        return { success: true, data: createEmptyResult() }
    }

    try {
        // 1. Fetch products via PostgREST (no Management API limits)
        const { data: products, error: fetchError } = await supabase
            .from('cabinet_products')
            .select(`
                id, code, product_type, designation, cabinet_name, line,
                use_destination, commercial_measure, accessory_text, canto_puertas,
                door_color_text, rh, carb2, assembled_flag, special_label,
                private_label_client_name, armado_con_lvm,
                final_name_es, final_name_en, validation_status
            `)
            .in('id', ids)

        if (fetchError) throw new Error(`Fetch Error: ${fetchError.message}`)
        if (!products || products.length === 0) {
            return { success: true, data: createEmptyResult() }
        }

        const result = createEmptyResult()
        const missingTermsTracker = new Map<string, Set<string>>()
        const updatesToApply: { id: string, final_name_en: string, validation_status: string }[] = []

        for (const product of products) {
            result.processed++
            try {
                const translation = await translateProductToEnglish(product as ProductPayload, product.product_type || 'MUEBLE')
                const { translatedName, missingTerms } = translation

                // Tracking de términos faltantes por producto
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

                // Collect update
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
                    reason: err.message || 'Error en motor de traducción',
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
                // If RPC fails, all collected updates in this batch are considered failed
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
        return { success: false, error: error.message || 'Error crítico en el lote' }
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
