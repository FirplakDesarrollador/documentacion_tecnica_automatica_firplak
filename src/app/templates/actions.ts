"use server"
/* eslint-disable @typescript-eslint/no-explicit-any */

import { dbQuery } from "@/lib/supabase"
import { revalidatePath } from "next/cache"
import { normalizeTemplateFontFamily } from "@/lib/templates/templateTypography"
import { assertRole } from '@/utils/auth/access'

async function assertAdminAccess() {
    await assertRole('admin')
}

/**
 * Bumps a semver version string (MAJOR.MINOR.PATCH) by incrementing PATCH.
 *   1.0.0 → 1.0.1 → ... → 1.0.9 → 1.1.0 → ... → 1.9.9 → 2.0.0
 */
function bumpVersion(current: unknown): string {
    const v = String(current ?? '1.0.0')
    const parts = v.split('.').map(Number)
    let [major, minor, patch] = parts.length === 3 ? parts : [1, 0, 0]

    patch++
    if (patch > 9) {
        patch = 0
        minor++
        if (minor > 9) {
            minor = 0
            major++
        }
    }

    return `${major}.${minor}.${patch}`
}

export async function createTemplate(data: {
    name: string
    width_mm: number
    height_mm: number
    data_source: string
    template_font_family?: string
    brand_scope?: 'firplak' | 'private_label'
    private_label_client_name?: string | null
}) {
    await assertAdminAccess()

    try {
        const orientation = data.width_mm >= data.height_mm ? 'horizontal' : 'vertical'
        const brandScope = data.data_source === 'core_firplak' && data.brand_scope === 'private_label' ? 'private_label' : 'firplak'
        const plc = data.private_label_client_name ? String(data.private_label_client_name).trim() : ''
        const templateFontFamily = normalizeTemplateFontFamily(data.template_font_family)

        if (brandScope === 'private_label' && !plc) {
            return { success: false, error: 'Cliente marca propia requerido' }
        }

        const rows = await dbQuery(`
            INSERT INTO public.plantillas_doc_tec (
                name,
                width_mm,
                height_mm,
                orientation,
                document_type,
                elements_json,
                active,
                version,
                data_source,
                template_font_family,
                brand_scope,
                private_label_client_name
            )
            VALUES (
                '${data.name.replace(/'/g, "''")}',
                ${data.width_mm},
                ${data.height_mm},
                '${orientation}',
                'label',
                '[]',
                true,
                '1.0.0',
                '${data.data_source.replace(/'/g, "''")}',
                '${templateFontFamily}',
                '${brandScope}',
                ${brandScope === 'private_label' ? `'${plc.replace(/'/g, "''")}'` : 'NULL'}
            )
            RETURNING id
        `)

        revalidatePath('/templates')
        return { success: true, id: rows?.[0]?.id }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function duplicateTemplate(id: string, newName: string, dataSource: string, width_mm: number, height_mm: number) {
    await assertAdminAccess()

    try {
        const rows = await dbQuery(`SELECT * FROM public.plantillas_doc_tec WHERE id = '${id}' LIMIT 1`)
        if (!rows || rows.length === 0) return { success: false, error: 'Plantilla original no encontrada' }

        const original = rows[0]
        const originalBrandScope = original?.brand_scope === 'private_label' ? 'private_label' : 'firplak'
        const originalPrivateLabelClientName =
            originalBrandScope === 'private_label' && original?.private_label_client_name
                ? String(original.private_label_client_name)
                : null
        const originalTemplateFontFamily = normalizeTemplateFontFamily(original?.template_font_family)
        
        // Escape elements_json safely. Original is already a stringified JSON.
        const safeJson = original.elements_json ? original.elements_json.replace(/'/g, "''") : '[]'
        const finalWidth = width_mm || original.width_mm
        const finalHeight = height_mm || original.height_mm
        const orientation = finalWidth >= finalHeight ? 'horizontal' : 'vertical'

        const inserted = await dbQuery(`
            INSERT INTO public.plantillas_doc_tec (
                name,
                width_mm,
                height_mm,
                orientation,
                document_type,
                elements_json,
                active,
                version,
                data_source,
                template_font_family,
                export_formats,
                export_filename_format,
                brand_scope,
                private_label_client_name
            )
            VALUES (
                '${newName.replace(/'/g, "''")}', 
                ${finalWidth}, 
                ${finalHeight}, 
                '${orientation}', 

                '${original.document_type}', 
                '${safeJson}', 
                true, 
                '1.0.0',
                '${dataSource.replace(/'/g, "''")}',
                '${originalTemplateFontFamily}',
                ${original.export_formats ? `'${original.export_formats.replace(/'/g, "''")}'` : 'NULL'},
                ${original.export_filename_format ? `'${original.export_filename_format.replace(/'/g, "''")}'` : 'NULL'},
                '${originalBrandScope}',
                ${originalPrivateLabelClientName ? `'${originalPrivateLabelClientName.replace(/'/g, "''")}'` : 'NULL'}
            )
            RETURNING id
        `)

        revalidatePath('/templates')
        return { success: true, id: inserted?.[0]?.id }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function updateTemplate(id: string, data: {
    elements_json?: string
    name?: string
    width_mm?: number
    height_mm?: number
    export_formats?: string
    export_filename_format?: string
    data_source?: string
    template_font_family?: string
    brand_scope?: 'firplak' | 'private_label'
    private_label_client_name?: string | null
}) {
    await assertAdminAccess()

    try {
        const nameClause = data.name ? `, name='${data.name.replace(/'/g, "''")}' ` : ''
        const formatsClause = data.export_formats ? `, export_formats='${data.export_formats.replace(/'/g, "''")}' ` : ''
        const filenameClause = data.export_filename_format ? `, export_filename_format='${data.export_filename_format.replace(/'/g, "''")}' ` : ''
        const sourceClause = data.data_source ? `, data_source='${data.data_source.replace(/'/g, "''")}' ` : ''
        const templateFontClause =
            data.template_font_family !== undefined
                ? `, template_font_family='${normalizeTemplateFontFamily(data.template_font_family)}' `
                : ''
        const widthClause = data.width_mm ? `, width_mm=${data.width_mm} ` : ''
        const heightClause = data.height_mm ? `, height_mm=${data.height_mm} ` : ''
        const brandScopeClause = data.brand_scope ? `, brand_scope='${data.brand_scope}' ` : ''

        const plcNormalized =
            data.private_label_client_name !== undefined && data.private_label_client_name !== null
                ? String(data.private_label_client_name).trim()
                : null

        const plcClause =
            data.private_label_client_name !== undefined
                ? (plcNormalized ? `, private_label_client_name='${plcNormalized.replace(/'/g, "''")}' ` : `, private_label_client_name=NULL `)
                : ''
        
        let orientationClause = ''
        if (data.width_mm && data.height_mm) {
            orientationClause = `, orientation='${data.width_mm >= data.height_mm ? 'horizontal' : 'vertical'}'`
        }

        const elementsClause = data.elements_json ? `elements_json='${data.elements_json.replace(/'/g, "''")}', ` : ''

        // If switching to Firplak scope, force private_label_client_name to NULL to satisfy DB checks.
        const forcePlcNullClause =
            data.brand_scope === 'firplak'
                ? `, private_label_client_name=NULL `
                : ''

        let versionClause = ''
        if (data.elements_json) {
            const currentRows = await dbQuery(`SELECT version FROM public.plantillas_doc_tec WHERE id='${id.replace(/'/g, "''")}' LIMIT 1`)
            const currentVersion = currentRows?.[0]?.version || '1.0.0'
            const newVersion = bumpVersion(currentVersion)
            versionClause = `, version='${newVersion}' `
        }

        await dbQuery(`
            UPDATE public.plantillas_doc_tec SET
                ${elementsClause}
                updated_at=now()
                ${nameClause} 
                ${widthClause}
                ${heightClause}
                ${orientationClause}
                ${formatsClause} 
                ${filenameClause} 
                ${sourceClause}
                ${templateFontClause}
                ${brandScopeClause}
                ${data.brand_scope === 'firplak' ? forcePlcNullClause : plcClause}
                ${versionClause}
            WHERE id='${id}'
        `)

        revalidatePath('/templates')
        revalidatePath('/templates/builder')
        return { success: true }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

function getPreviewBrandClause(
    dataSource: string,
    brandScope: 'firplak' | 'private_label' = 'firplak',
    privateLabelClientName?: string | null
) {
    if (dataSource !== 'core_firplak') return ''

    if (brandScope === 'private_label') {
        const clientName = String(privateLabelClientName || '').trim()
        if (!clientName) return ` AND 1 = 0 `
        return ` AND UPPER(BTRIM(COALESCE(resolved_private_label_client_name, ''))) = UPPER('${clientName.replace(/'/g, "''")}') `
    }

    return ` AND NULLIF(BTRIM(COALESCE(resolved_private_label_client_name, '')), '') IS NULL `
}

export async function getPreviewProduct(
    dataSource: string = 'core_firplak',
    brandScope: 'firplak' | 'private_label' = 'firplak',
    privateLabelClientName?: string | null
) {
    await assertAdminAccess()

    if (dataSource && dataSource !== 'core_firplak' && dataSource !== 'custom_datasets') {
        try {
            const rows = await dbQuery(`
                SELECT data_json
                FROM public.custom_dataset_rows
                WHERE dataset_id = '${dataSource.replace(/'/g, "''")}'
                LIMIT 10
            `)
            if (rows && rows.length > 0) {
                const parsed = typeof rows[0].data_json === 'string' ? JSON.parse(rows[0].data_json) : rows[0].data_json
                return { ...parsed }
            }
        } catch (e) {
            console.error("Error fetching preview for custom dataset", e)
        }
        return { error: 'Sin datos' }
    }

    try {
        const brandClause = getPreviewBrandClause(dataSource, brandScope, privateLabelClientName)
        const rows = await dbQuery(`
            SELECT *
            FROM public.v_ui_generate_list
            WHERE final_complete_name_es IS NOT NULL
              AND status != 'INACTIVO'
              ${brandClause}
            LIMIT 50
        `)

        if (!rows || rows.length === 0) {
            return {
                code: 'MOCK-1234',
                final_name_es: 'Mueble de Baño con Espejo y Lavamanos Blanco Premium',
                barcode_text: '7701234567890',
                color_code: 'BLAN'
            }
        }

        const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
        const products = rows.map((row: any) => mapRowToComposedProduct(row))

        let longest = products[0]
        for (const p of products) {
            if (p.final_name_es && longest.final_name_es && p.final_name_es.length > longest.final_name_es.length) {
                longest = p
            }
        }

        return {
            ...longest,
            name_color_sap: longest.color_name || null,

            color: longest.color_name || longest.color_code || 'Sin Color'
        }
    } catch {
        return {
            code: 'MOCK-1234',
            final_name_es: 'Error cargando datos reales - Mueble de Prueba Largo',
            barcode_text: 'ERROR123',
            color_code: 'ERR',
            color_name: 'Rojo Error',
            color: 'Rojo Error'
        }
    }
}

/**
 * Returns a random active product, optionally excluding the product currently in preview
 * to avoid showing the same one twice in a row.
 */
export async function getRandomPreviewProduct(
    excludeCode?: string,
    dataSource: string = 'core_firplak',
    brandScope: 'firplak' | 'private_label' = 'firplak',
    privateLabelClientName?: string | null
) {
    await assertAdminAccess()

    if (dataSource && dataSource !== 'core_firplak' && dataSource !== 'custom_datasets') {
        try {
            const rows = await dbQuery(`
                SELECT data_json
                FROM public.custom_dataset_rows
                WHERE dataset_id = '${dataSource.replace(/'/g, "''")}'
                ORDER BY RANDOM()
                LIMIT 1
            `)
            if (rows && rows.length > 0) {
                const parsed = typeof rows[0].data_json === 'string' ? JSON.parse(rows[0].data_json) : rows[0].data_json
                return { ...parsed }
            }
        } catch (e) {
            console.error("Error fetching random preview for custom dataset", e)
        }
        return null
    }

    try {
        const brandClause = getPreviewBrandClause(dataSource, brandScope, privateLabelClientName)
        const excludeClause = excludeCode
            ? `AND sku_complete != '${excludeCode.replace(/'/g, "''")}'`
            : ''

        const rows = await dbQuery(`
            SELECT *
            FROM public.v_ui_generate_list
            WHERE final_complete_name_es IS NOT NULL
              AND status != 'INACTIVO'
              ${brandClause}
            ${excludeClause}
            ORDER BY RANDOM()
            LIMIT 1
        `)

        const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
        let p = rows && rows.length > 0 ? mapRowToComposedProduct(rows[0]) : undefined

        if (!p) {
            // Fallback: retry without the exclusion (edge case: only 1 product in DB)
            const fallbackRows = await dbQuery(`
                SELECT *
                FROM public.v_ui_generate_list
                WHERE final_complete_name_es IS NOT NULL
                  AND status != 'INACTIVO'
                  ${brandClause}
                ORDER BY RANDOM()
                LIMIT 1
            `)
            p = fallbackRows && fallbackRows.length > 0 ? mapRowToComposedProduct(fallbackRows[0]) : undefined
        }

        if (!p) return null

        return {
            ...p,
            name_color_sap: p.color_name || null,
            color: p.color_name || p.color_code || 'Sin Color'
        }
    } catch {
        return null
    }
}

export async function deleteTemplate(id: string) {
    await assertAdminAccess()

    try {
        await dbQuery(`DELETE FROM public.plantillas_doc_tec WHERE id='${id}'`)
        revalidatePath('/templates')
        return { success: true }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function getTemplatesAction() {
    await assertAdminAccess()

    try {
        const rows = await dbQuery(`SELECT * FROM public.plantillas_doc_tec WHERE active = true ORDER BY name ASC`)
        return rows || []
    } catch (e) {
        console.error("Error fetching templates:", e)
        return []
    }
}

export async function getDatasetModeTemplatesAction(): Promise<{ id: string; name: string; elements_json: string; data_source: string }[]> {
    await assertAdminAccess()

    try {
        const rows = await dbQuery(`
            SELECT id, name, elements_json, data_source
            FROM public.plantillas_doc_tec
            WHERE active = true
            ORDER BY name ASC
        `)
        return (rows || []).map((r: any) => ({
            id: String(r.id),
            name: String(r.name || ''),
            elements_json: String(r.elements_json || '[]'),
            data_source: String(r.data_source || 'core_firplak'),
        }))
    } catch {
        return []
    }
}

export async function getTemplateLinkedDatasetsAction(templateId: string): Promise<{ id: string; name: string; schema_json: any; created_at: string }[]> {
    await assertAdminAccess()

    try {
        const tid = String(templateId || '').trim()
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tid)) return []

        const rows = await dbQuery(`
            SELECT d.id, d.name, d.schema_json, d.created_at
            FROM public.template_dataset_links l
            JOIN public.custom_datasets d ON d.id = l.dataset_id
            WHERE l.template_id = '${tid.replace(/'/g, "''")}'
            ORDER BY d.created_at DESC
        `)

        return (rows || []).map((r: any) => ({
            id: String(r.id),
            name: String(r.name || ''),
            schema_json: r.schema_json,
            created_at: String(r.created_at || ''),
        }))
    } catch {
        return []
    }
}

/**
 * Validates the length of generated filenames across all products in the database.
 */
export async function validateExportFilenameLength(pattern: string, dataSource: string = 'core_firplak') {
    await assertAdminAccess()

    try {
        let products: any[] = []

        if (dataSource && dataSource !== 'core_firplak' && dataSource !== 'custom_datasets') {
            const rows = await dbQuery(`
                SELECT data_json FROM public.custom_dataset_rows 
                WHERE dataset_id = '${dataSource.replace(/'/g, "''")}'
            `)
            products = rows.map((r: any) => typeof r.data_json === 'string' ? JSON.parse(r.data_json) : r.data_json)
        } else {
            const rows = await dbQuery(`
                SELECT *
                FROM public.v_ui_generate_list
                WHERE status != 'INACTIVO'
            `)
            const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
            products = rows.map((row: any) => mapRowToComposedProduct(row))
        }

        if (!products || products.length === 0) return { success: true, count: 0 }

        const { enrichProductDataWithIcons } = await import('@/lib/engine/productUtils')
        const { hydrateText } = await import('@/lib/export/exportUtils')
        const failures: { code: string, length: number, result: string }[] = []

        for (const p of products) {
            // Enriquecer datos usando la lógica oficial
            const context = enrichProductDataWithIcons(p, {})

            // Hydrate pattern using the official engine
            const hydrated = hydrateText(pattern, context)

            if (hydrated.length > 130) {
                failures.push({
                    code: p.code || 'N/A',
                    length: hydrated.length,
                    result: hydrated
                })
            }
        }

        if (failures.length > 0) {
            return { 
                success: false, 
                error: `Reestructurar nombre, ya que en ${failures.length} registros excede los 130 caracteres.`,
                failures: failures.slice(0, 5) // Show top 5 for info
            }
        }

        return { success: true, count: products.length }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}
