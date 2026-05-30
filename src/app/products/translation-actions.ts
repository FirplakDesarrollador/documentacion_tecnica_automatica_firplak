'use server'

import { dbQuery } from '@/lib/supabase'
import { computeNameWithNamingComponents } from '@/lib/engine/namingComponentsEngine'

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

        const termFrequency: Record<string, number> = {}

        for (const product of products) {
            try {
                const results = await Promise.all([
                    computeNameWithNamingComponents(product as any, 'final_base_name'),
                    computeNameWithNamingComponents(product as any, 'final_complete_name'),
                    computeNameWithNamingComponents(product as any, 'sap_description_recommended'),
                ])
                const missingTerms = [...new Set(results.flatMap(result => result.missingTerms))]
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
