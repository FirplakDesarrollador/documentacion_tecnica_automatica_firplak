'use server'

import { dbQuery } from '@/lib/supabase'
import { computeNameWithNamingComponents } from '@/lib/engine/namingComponentsEngine'
import { mapRowToComposedProduct } from '@/lib/engine/product_composer'
import type { ProductPayload } from '@/lib/engine/translator'
import { assertPermission } from '@/utils/auth/access'

async function assertAdminAccess() {
    await assertPermission('module:configuration')
}

const SCAN_PRODUCT_PAGE_SIZE = 500

const SCAN_PRODUCT_COLUMNS = [
    'id',
    'version_id',
    'reference_id',
    'sku_complete',
    'family_code',
    'reference_code',
    'version_code',
    'color_code',
    'sku_base',
    'product_type',
    'zone_home',
    'use_destination',
    'assembled_default',
    'rh_default',
    'allowed_lines',
    'product_name',
    'designation',
    'line',
    'commercial_measure',
    'version_label',
    'final_base_name_es',
    'final_base_name_en',
    'validation_status',
    'sap_description_original',
    'final_complete_name_es',
    'final_complete_name_en',
    'barcode_text',
    'barcode_path',
    'isometric_path',
    'isometric_asset_id',
    'weight_kg',
    'weight_kg_payload',
    'stacking_max',
    'status',
    'version_status',
    'ref_status',
    'family_status',
    'global_version_rule_status',
    'inactive_reasons',
    'sku_attrs',
    'ref_attrs',
    'automatic_version_rules',
    'version_attrs',
    'resolved_color_name',
    'name_color_sap',
    'resolved_private_label_client_name',
    'private_label_client_name',
    'resolved_special_label',
    'special_label',
    'resolved_width_cm',
    'width_cm',
    'resolved_depth_cm',
    'depth_cm',
    'resolved_height_cm',
    'height_cm',
    'resolved_weight_kg',
    'resolved_stacking_max',
] as const

type ScanProductRow = Parameters<typeof mapRowToComposedProduct>[0]

function escapeSqlLiteral(value: string) {
    return value.replace(/'/g, "''")
}

async function loadScanProductRows(): Promise<ScanProductRow[]> {
    const rows: ScanProductRow[] = []
    let lastSkuComplete = ''

    while (true) {
        const cursorCondition = lastSkuComplete
            ? `AND sku_complete > '${escapeSqlLiteral(lastSkuComplete)}'`
            : ''

        const pageResult = await dbQuery(`
            SELECT ${SCAN_PRODUCT_COLUMNS.join(', ')}
            FROM public.v_ui_generate_list
            WHERE COALESCE(is_exportable, true) = true
              AND (effective_status IS NULL OR effective_status <> 'INACTIVO')
              AND (status IS NULL OR status = 'ACTIVO')
              ${cursorCondition}
            ORDER BY sku_complete ASC
            LIMIT ${SCAN_PRODUCT_PAGE_SIZE}
        `)
        const page = (pageResult || []) as ScanProductRow[]

        rows.push(...page)

        if (page.length < SCAN_PRODUCT_PAGE_SIZE) {
            break
        }

        lastSkuComplete = String(page[page.length - 1]?.sku_complete || '')

        if (!lastSkuComplete) {
            break
        }
    }

    return rows
}

/**
 * Escanea el catálogo en busca de términos faltantes en las traducciones
 * sin realizar modificaciones en la base de datos.
 * Retorna una lista de términos y su frecuencia.
 */
export async function scanMissingGlossaryTermsAction(): Promise<{ success: boolean; missingTerms?: { term: string, count: number }[]; error?: string }> {
    await assertAdminAccess()

    try {
        const rows = await loadScanProductRows()

        if (!rows || rows.length === 0) {
            return { success: true, missingTerms: [] }
        }

        const products = rows.map(row => mapRowToComposedProduct(row))

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
