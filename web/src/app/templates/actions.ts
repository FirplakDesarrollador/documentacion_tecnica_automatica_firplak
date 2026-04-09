"use server"

import { dbQuery } from "@/lib/supabase"
import { revalidatePath } from "next/cache"

export async function createTemplate(data: {
    name: string
    width_mm: number
    height_mm: number
}) {
    try {
        const orientation = data.width_mm >= data.height_mm ? 'horizontal' : 'vertical'

        const rows = await dbQuery(`
            INSERT INTO public.plantillas_doc_tec (name, width_mm, height_mm, orientation, document_type, elements_json, active)
            VALUES ('${data.name.replace(/'/g, "''")}', ${data.width_mm}, ${data.height_mm}, '${orientation}', 'label', '[]', true)
            RETURNING id
        `)

        revalidatePath('/templates')
        return { success: true, id: rows?.[0]?.id }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function updateTemplate(id: string, data: {
    elements_json: string
    name?: string
    export_formats?: string
}) {
    try {
        const nameClause = data.name ? `, name='${data.name.replace(/'/g, "''")}' ` : ''
        const formatsClause = data.export_formats ? `, export_formats='${data.export_formats.replace(/'/g, "''")}' ` : ''
        await dbQuery(`
            UPDATE public.plantillas_doc_tec SET
                elements_json='${data.elements_json.replace(/'/g, "''")}' ${nameClause} ${formatsClause},
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

export async function getPreviewProduct() {
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
export async function getRandomPreviewProduct(excludeCode?: string) {
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
