"use server"

import { dbQuery } from "@/lib/supabase"
import { revalidatePath } from "next/cache"

export async function createTemplate(data: {
    name: string
    width_mm: number
    height_mm: number
    data_source: string
}) {
    try {
        const orientation = data.width_mm >= data.height_mm ? 'horizontal' : 'vertical'

        const rows = await dbQuery(`
            INSERT INTO public.plantillas_doc_tec (name, width_mm, height_mm, orientation, document_type, elements_json, active, data_source)
            VALUES ('${data.name.replace(/'/g, "''")}', ${data.width_mm}, ${data.height_mm}, '${orientation}', 'label', '[]', true, '${data.data_source.replace(/'/g, "''")}')
            RETURNING id
        `)

        revalidatePath('/templates')
        return { success: true, id: rows?.[0]?.id }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function duplicateTemplate(id: string, newName: string, dataSource: string) {
    try {
        const rows = await dbQuery(`SELECT * FROM public.plantillas_doc_tec WHERE id = '${id}' LIMIT 1`)
        if (!rows || rows.length === 0) return { success: false, error: 'Plantilla original no encontrada' }

        const original = rows[0]
        
        // Escape elements_json safely. Original is already a stringified JSON.
        const safeJson = original.elements_json ? original.elements_json.replace(/'/g, "''") : '[]'

        const inserted = await dbQuery(`
            INSERT INTO public.plantillas_doc_tec (
                name, width_mm, height_mm, orientation, document_type, elements_json, active, data_source, export_formats, export_filename_format
            )
            VALUES (
                '${newName.replace(/'/g, "''")}', 
                ${original.width_mm}, 
                ${original.height_mm}, 
                '${original.orientation}', 
                '${original.document_type}', 
                '${safeJson}', 
                true, 
                '${dataSource.replace(/'/g, "''")}',
                ${original.export_formats ? `'${original.export_formats.replace(/'/g, "''")}'` : 'NULL'},
                ${original.export_filename_format ? `'${original.export_filename_format.replace(/'/g, "''")}'` : 'NULL'}
            )
            RETURNING id
        `)

        revalidatePath('/templates')
        return { success: true, id: inserted?.[0]?.id }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function updateTemplate(id: string, data: {
    elements_json: string
    name?: string
    export_formats?: string
    export_filename_format?: string
    data_source?: string
}) {
    try {
        const nameClause = data.name ? `, name='${data.name.replace(/'/g, "''")}' ` : ''
        const formatsClause = data.export_formats ? `, export_formats='${data.export_formats.replace(/'/g, "''")}' ` : ''
        const filenameClause = data.export_filename_format ? `, export_filename_format='${data.export_filename_format.replace(/'/g, "''")}' ` : ''
        const sourceClause = data.data_source ? `, data_source='${data.data_source.replace(/'/g, "''")}' ` : ''
        
        await dbQuery(`
            UPDATE public.plantillas_doc_tec SET
                elements_json='${data.elements_json.replace(/'/g, "''")}' 
                ${nameClause} 
                ${formatsClause} 
                ${filenameClause} 
                ${sourceClause},
                updated_at=now()
            WHERE id='${id}'
        `)

        revalidatePath('/templates')
        revalidatePath('/templates/builder')
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function getPreviewProduct(dataSource: string = 'core_firplak') {
    if (dataSource && dataSource !== 'core_firplak') {
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
        const products = await dbQuery(`
            SELECT p.*, c.name_color_sap as color_name
            FROM public.cabinet_products p
            LEFT JOIN public.colors c ON p.color_code = c.code_4dig
            WHERE p.final_name_es IS NOT NULL
              AND p.status != 'INACTIVO'
            ORDER BY p.updated_at DESC
            LIMIT 50
        `)

        if (!products || products.length === 0) {
            return {
                code: 'MOCK-1234',
                final_name_es: 'Mueble de Baño con Espejo y Lavamanos Blanco Premium',
                barcode_text: '7701234567890',
                color_code: 'BLAN'
            }
        }

        let longest = products[0]
        for (const p of products) {
            if (p.final_name_es && longest.final_name_es && p.final_name_es.length > longest.final_name_es.length) {
                longest = p
            }
        }

        return {
            ...longest,
            name_color_sap: longest.color_name || null,
            color_name: longest.color_name || null,
            color_code: longest.color_code || null,
            color: longest.color_name || longest.color_code || 'Sin Color'
        }
    } catch (e) {
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
export async function getRandomPreviewProduct(excludeCode?: string, dataSource: string = 'core_firplak') {
    if (dataSource && dataSource !== 'core_firplak') {
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
        const excludeClause = excludeCode
            ? `AND p.code != '${excludeCode.replace(/'/g, "''")}'`
            : ''

        const products = await dbQuery(`
            SELECT p.*, c.name_color_sap as color_name
            FROM public.cabinet_products p
            LEFT JOIN public.colors c ON p.color_code = c.code_4dig
            WHERE p.final_name_es IS NOT NULL
              AND p.status != 'INACTIVO'
            ${excludeClause}
            ORDER BY RANDOM()
            LIMIT 1
        `)

        let p = products?.[0]

        if (!p) {
            // Fallback: retry without the exclusion (edge case: only 1 product in DB)
            const fallback = await dbQuery(`
                SELECT p.*, c.name_color_sap as color_name
                FROM public.cabinet_products p
                LEFT JOIN public.colors c ON p.color_code = c.code_4dig
                WHERE p.final_name_es IS NOT NULL
                  AND p.status != 'INACTIVO'
                ORDER BY RANDOM()
                LIMIT 1
            `)
            if (!fallback || fallback.length === 0) return null
            p = fallback[0]
        }

        return { 
            ...p, 
            name_color_sap: p.color_name || null,
            color_name: p.color_name || null,
            color_code: p.color_code || null,
            color: p.color_name || p.color_code || 'Sin Color' 
        }
    } catch (e) {
        return null
    }
}

export async function deleteTemplate(id: string) {
    try {
        await dbQuery(`DELETE FROM public.plantillas_doc_tec WHERE id='${id}'`)
        revalidatePath('/templates')
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function getTemplatesAction() {
    try {
        const rows = await dbQuery(`SELECT * FROM public.plantillas_doc_tec WHERE active = true ORDER BY name ASC`)
        return rows || []
    } catch (e) {
        console.error("Error fetching templates:", e)
        return []
    }
}

/**
 * Validates the length of generated filenames across all products in the database.
 */
export async function validateExportFilenameLength(pattern: string, dataSource: string = 'core_firplak') {
    try {
        let products: any[] = []

        if (dataSource && dataSource !== 'core_firplak') {
            const rows = await dbQuery(`
                SELECT data_json FROM public.custom_dataset_rows 
                WHERE dataset_id = '${dataSource.replace(/'/g, "''")}'
            `)
            products = rows.map(r => typeof r.data_json === 'string' ? JSON.parse(r.data_json) : r.data_json)
        } else {
            products = await dbQuery(`
                SELECT p.*, c.name_color_sap as color_name
                FROM public.cabinet_products p
                LEFT JOIN public.colors c ON p.color_code = c.code_4dig
                WHERE p.status != 'INACTIVO'
            `)
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
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}
