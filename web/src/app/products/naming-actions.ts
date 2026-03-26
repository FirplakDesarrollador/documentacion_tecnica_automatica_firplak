'use server'

import { createClient } from '@supabase/supabase-js'

// Cliente oficial con publishable/anon key — sin service_role, sin Management API
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

const BATCH_SIZE = 100 // Máximo de IDs por llamada

export interface NamingBatchResult {
    batchIndex: number
    processed: number
    updated: number
    warnings: number
    failedIds: string[]
    error?: string
}

/**
 * Aplica el motor de nombrado en masa usando el RPC de Supabase.
 * Itera en batches para mostrar progreso en el UI.
 * No usa Management API, no usa service_role, no usa conexión directa.
 */
export async function applyNamingRulesAction(
    ids: string[]
): Promise<{
    success: boolean
    totalProcessed: number
    totalUpdated: number
    batches: NamingBatchResult[]
    error?: string
}> {
    if (!ids || ids.length === 0) {
        return { success: false, totalProcessed: 0, totalUpdated: 0, batches: [], error: 'No se proporcionaron IDs' }
    }

    const batches: NamingBatchResult[] = []
    let totalProcessed = 0
    let totalUpdated = 0

    // Dividir en batches de BATCH_SIZE
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batchIds = ids.slice(i, i + BATCH_SIZE)
        const batchIndex = Math.floor(i / BATCH_SIZE)

        try {
            const { data, error } = await supabase.rpc('bulk_update_product_names', {
                product_ids: batchIds
            })

            if (error) {
                batches.push({
                    batchIndex,
                    processed: 0,
                    updated: 0,
                    warnings: 0,
                    failedIds: [],
                    error: error.message
                })
                continue
            }

            const result = data as {
                processed_count: number
                updated_count: number
                warnings_count: number
                failed_ids: string[]
            }
            batches.push({
                batchIndex,
                processed: result.processed_count,
                updated: result.updated_count,
                warnings: result.warnings_count,
                failedIds: result.failed_ids || []
            })
            totalProcessed += result.processed_count
            totalUpdated += result.updated_count

        } catch (err: any) {
            batches.push({
                batchIndex,
                processed: 0,
                updated: 0,
                warnings: 0,
                failedIds: [],
                error: err.message || 'Error desconocido'
            })
        }
    }

    const hasErrors = batches.some(b => b.error)
    return {
        success: !hasErrors || totalUpdated > 0,
        totalProcessed,
        totalUpdated,
        batches
    }
}
