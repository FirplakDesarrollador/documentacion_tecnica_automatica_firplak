'use server'

import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { parseProductCode } from '@/lib/engine/codeParser'
import { GoogleGenAI } from '@google/genai'

export async function checkFamilyExists(code: string) {
    if (!code) return true // assume ok if empty to avoid early errors
    const parsed = await parseProductCode(code, '', false)
    if (!parsed.familia_code) return true

    const familia = await prisma.familia.findUnique({
        where: { code: parsed.familia_code }
    })
    return !!familia
}

export async function createFamilyAction(data: any) {
    if (!data.code) throw new Error("Family code is required")
    await prisma.familia.create({
        data: {
            code: data.code,
            name: data.name || null,
            product_type: data.product_type || null,
            use_destination: data.use_destination || null,
        }
    })
    redirect('/products')
}

export async function createProductAction(data: any) {
    if (!data.code) {
        throw new Error('Code is required')
    }

    const parsed = await parseProductCode(data.code, data.sap_description, data.rh_flag)

    // Check if we need to create a new family
    if (data._newFamily && parsed.familia_code) {
        const exists = await prisma.familia.findUnique({
            where: { code: parsed.familia_code }
        })
        if (!exists) {
            await prisma.familia.create({
                data: {
                    code: parsed.familia_code,
                    name: data._newFamily.name || parsed.familia_code,
                    product_type: data._newFamily.product_type || data.product_type || null,
                    use_destination: data._newFamily.use_destination || data.use_destination || null,
                    // Note: zone_text is not in Family schema directly in this snippet, but we can set others
                }
            })
        }
    }

    await prisma.product.create({
        data: {
            code: data.code,
            sap_description: data.sap_description || null,
            product_type: data.product_type || parsed.product_type || null,
            furniture_name: data.furniture_name || null,
            color_code: data.color_code || parsed.color_code || null,
            rh_flag: parsed.rh_flag,
            assembled_flag: data.assembled_flag || parsed.assembled_flag,
            edge_2mm_flag: data.edge_2mm_flag || false,
            line: data.line || null,
            use_destination: data.use_destination || parsed.use_destination || null,
            commercial_measure: data.commercial_measure || null,
            accessory_text: data.accessory_text || null,
            designation: data.designation || null,

            // Dimensiones
            width_cm: data.width_cm ? parseFloat(data.width_cm) : null,
            depth_cm: data.depth_cm ? parseFloat(data.depth_cm) : null,
            height_cm: data.height_cm ? parseFloat(data.height_cm) : null,
            weight_kg: data.weight_kg ? parseFloat(data.weight_kg) : null,
            stacking_max: data.stacking_max ? parseInt(data.stacking_max) : null,

            // Campos derivados del código
            familia_code: parsed.familia_code,
            ref_code: parsed.ref_code,
            version_code: parsed.version_code,
        },
    })

    redirect('/products')
}

export async function updateProductAction(id: string, data: any) {
    if (!data.code) throw new Error('Code is required')

    const parsed = await parseProductCode(data.code, data.sap_description, data.rh_flag)

    await prisma.product.update({
        where: { id },
        data: {
            code: data.code,
            sap_description: data.sap_description || null,
            product_type: data.product_type || null,
            furniture_name: data.furniture_name || null,
            color_code: data.color_code || null,
            rh_flag: data.rh_flag || false,
            assembled_flag: data.assembled_flag || false,
            edge_2mm_flag: data.edge_2mm_flag || false,
            line: data.line || null,
            use_destination: data.use_destination || null,
            commercial_measure: data.commercial_measure || null,
            accessory_text: data.accessory_text || null,
            designation: data.designation || null,

            // Campos derivados del código por si cambió el código
            familia_code: parsed.familia_code,
            ref_code: parsed.ref_code,
            version_code: parsed.version_code,
        },
    })

    redirect('/products')
}

export async function massUpdateProducts(ids: string[], updateData: any) {
    if (!ids || ids.length === 0) return

    // Limit fields that can be updated massively and protect others
    const safeData: any = {}
    if (updateData.edge_2mm_flag !== undefined) safeData.edge_2mm_flag = updateData.edge_2mm_flag
    if (updateData.rh_flag !== undefined) safeData.rh_flag = updateData.rh_flag
    if (updateData.assembled_flag !== undefined) safeData.assembled_flag = updateData.assembled_flag
    if (updateData.commercial_measure !== undefined) safeData.commercial_measure = updateData.commercial_measure
    if (updateData.accessory_text !== undefined) safeData.accessory_text = updateData.accessory_text
    if (updateData.validation_status !== undefined) safeData.validation_status = updateData.validation_status

    if (Object.keys(safeData).length > 0) {
        await prisma.product.updateMany({
            where: { id: { in: ids } },
            data: safeData
        })
    }
}

export async function translateMissingProducts() {
    try {
        const products = await prisma.product.findMany({
            where: { final_name_en: null, final_name_es: { not: null } },
            take: 20
        })

        if (products.length === 0) return { success: true, count: 0, message: "No hay productos pendientes de traducir." }

        // Inicializamos con la variable de entorno por defecto
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '' });

        const promptTemplate = `
English product names must not be literal translations of Spanish names.
Instead, generate standardized North American cabinetry product names using the structure:
[MODEL NAME] [PRODUCT TYPE] [SIZE] [KEY FEATURES]

Use a controlled vocabulary dictionary for translating product attributes such as:
- MOISTURE RESISTANT
- SOFT CLOSE HINGES
- FULL EXTENSION DRAWER SLIDES
- 2MM EDGE BAND
- READY TO ASSEMBLE
- PREASSEMBLED CABINET

Map product use_destination to product types:
LAVAMANOS -> VANITY CABINET
LAVARROPAS -> LAUNDRY CABINET
COCINA -> KITCHEN BASE CABINET
LAVAPLATOS -> SINK BASE CABINET
OTRO -> CABINET

Avoid literal words such as "FURNITURE", "FOR WASHBASIN", or "PRODUCT".
Keep product names concise and commercially natural for the North American cabinetry market.

Respond with ONLY a JSON object mapping the product IDs to their generated English names.
Example Output:
{
  "product-id-123": "MFL KITCHEN BASE CABINET 60CM SOFT CLOSE HINGES",
  "product-id-456": "LOMBARDIA VANITY CABINET MOISTURE RESISTANT"
}

Translate these products:
`;

        const productsData = products.map((p: any) => ({
            id: p.id,
            final_name_es: p.final_name_es,
            use_destination: p.use_destination,
            width_cm: p.width_cm,
            rh_flag: p.rh_flag,
            icon_soft_close: p.icon_soft_close,
            edge_2mm_flag: p.edge_2mm_flag
        }))

        const prompt = promptTemplate + JSON.stringify(productsData, null, 2)

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        const text = response.text;
        if (!text) throw new Error("No response from AI");
        const translations = JSON.parse(text);

        let updatedCount = 0;
        for (const [id, en_name] of Object.entries(translations)) {
            await prisma.product.update({
                where: { id },
                data: { final_name_en: en_name as string }
            })
            updatedCount++;
        }

        return { success: true, count: updatedCount, message: `Traducidos exitosamente ${updatedCount} productos.` }
    } catch (e: any) {
        console.error("Translation Error:", e);
        return { success: false, error: e.message }
    }
}
