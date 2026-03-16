"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function createTemplate(data: {
    name: string
    width_mm: number
    height_mm: number
}) {
    try {
        const orientation = data.width_mm >= data.height_mm ? 'horizontal' : 'vertical'

        const template = await prisma.template.create({
            data: {
                name: data.name,
                width_mm: data.width_mm,
                height_mm: data.height_mm,
                orientation,
                document_type: 'label',
                elements_json: JSON.stringify([]),
                active: true,
            }
        })

        revalidatePath('/templates')
        return { success: true, id: template.id }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function updateTemplate(id: string, data: {
    elements_json: string
    name?: string
}) {
    try {
        await prisma.template.update({
            where: { id },
            data: {
                elements_json: data.elements_json,
                ...(data.name ? { name: data.name } : {})
            }
        })

        revalidatePath('/templates')
        revalidatePath(`/templates/builder`)
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function getPreviewProduct() {
    try {
        const products = await prisma.product.findMany({
            where: { final_name_es: { not: null } },
            include: { color: true },
            orderBy: { updatedAt: 'desc' },
            take: 50
        });

        if (products.length === 0) {
            // Mock data if database is completely empty
            return {
                code: 'MOCK-1234',
                final_name_es: 'Mueble de Baño con Espejo y Lavamanos Blanco Premium',
                barcode_text: '7701234567890',
                color_code: 'BLAN'
            }
        }

        // Find longest product name for maximum overflow test validation
        let longest = products[0];
        for (const p of products) {
            if (p.final_name_es && longest.final_name_es && p.final_name_es.length > longest.final_name_es.length) {
                longest = p;
            }
        }

        return {
            ...longest,
            color: longest.color?.name_color_sap || longest.color_code || 'Sin Color'
        };
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
        await prisma.template.delete({
            where: { id }
        })
        revalidatePath('/templates')
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}
