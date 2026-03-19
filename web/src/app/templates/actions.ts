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
            INSERT INTO public.templates (name, width_mm, height_mm, orientation, document_type, elements_json, active)
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
}) {
    try {
        const nameClause = data.name ? `, name='${data.name.replace(/'/g, "''")}' ` : ''
        await dbQuery(`
            UPDATE public.templates SET
                elements_json='${data.elements_json.replace(/'/g, "''")}' ${nameClause},
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
            SELECT p.*, c.name_color_sap
            FROM public.products p
            LEFT JOIN public.colors c ON p.color_code = c.code_4dig
            WHERE p.final_name_es IS NOT NULL
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
            color: longest.name_color_sap || longest.color_code || 'Sin Color'
        }
    } catch (e) {
        return {
            code: 'MOCK-1234',
            final_name_es: 'Error cargando datos reales - Mueble de Prueba Largo',
            barcode_text: 'ERROR123',
            color_code: 'ERR',
            color: 'Rojo Error'
        }
    }
}

export async function deleteTemplate(id: string) {
    try {
        await dbQuery(`DELETE FROM public.templates WHERE id='${id}'`)
        revalidatePath('/templates')
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}
