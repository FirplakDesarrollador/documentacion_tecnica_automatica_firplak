'use server'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { dbQuery } from '@/lib/supabase'
import { computeNameWithNamingComponents } from '@/lib/engine/namingComponentsEngine'
import type { ProductPayload } from '@/lib/engine/translator'
import { assertRole } from '@/utils/auth/access'

async function assertAdminAccess() {
    await assertRole('admin')
}

/**
 * Escanea el catálogo en busca de términos faltantes en las traducciones
 * sin realizar modificaciones en la base de datos.
 * Retorna una lista de términos y su frecuencia.
 */
export async function scanMissingGlossaryTermsAction(): Promise<{ success: boolean; missingTerms?: { term: string, count: number }[]; error?: string }> {
    await assertAdminAccess()

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
                    computeNameWithNamingComponents(product as ProductPayload, 'final_base_name'),
                    computeNameWithNamingComponents(product as ProductPayload, 'final_complete_name'),
                    computeNameWithNamingComponents(product as ProductPayload, 'sap_description_recommended'),
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
    } catch (error: unknown) {
        console.error("Scan Missing Terms Error:", error)
        const errorMessage = error instanceof Error ? error.message : 'Error al escanear conflictos'
        return { success: false, error: errorMessage }
    }
}
