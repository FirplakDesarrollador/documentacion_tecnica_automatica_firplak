'use server'

import { recomputeMasterNamesForSkuIds } from '@/lib/engine/masterNaming'

const BATCH_SIZE = 100

export interface NamingBatchResult {
    batchIndex: number
    processed: number
    updated: number
    warnings: number
    failedIds: string[]
    error?: string
}

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

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batchIds = ids.slice(i, i + BATCH_SIZE)
        const batchIndex = Math.floor(i / BATCH_SIZE)

        try {
            const result = await recomputeMasterNamesForSkuIds(batchIds)
            batches.push({
                batchIndex,
                processed: result.processedSkus,
                updated: result.updatedSkus,
                warnings: 0,
                failedIds: [],
            })
            totalProcessed += result.processedSkus
            totalUpdated += result.updatedSkus
        } catch (err: unknown) {
            batches.push({
                batchIndex,
                processed: 0,
                updated: 0,
                warnings: 0,
                failedIds: batchIds,
                error: err instanceof Error ? err.message : 'Error desconocido'
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
