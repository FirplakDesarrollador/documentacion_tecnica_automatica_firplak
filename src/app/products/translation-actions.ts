'use server'

import { dbQuery } from '@/lib/supabase'
import { translateProductToEnglish, ProductPayload } from '@/lib/engine/translator'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'

/**
 * Escanea el catálogo en busca de términos faltantes en las traducciones
 * sin realizar modificaciones en la base de datos.
 * Retorna una lista de términos y su frecuencia.
 */
export async function scanMissingGlossaryTermsAction(): Promise<{ success: boolean; missingTerms?: { term: string, count: number }[]; error?: string }> {
    try {
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
