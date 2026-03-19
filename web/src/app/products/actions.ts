'use server'

import { dbQuery } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { parseProductCode } from '@/lib/engine/codeParser'
import { GoogleGenAI } from '@google/genai'

export async function checkFamilyExists(code: string) {
    if (!code) return true
    const parsed = await parseProductCode(code, '', false)
    if (!parsed.familia_code) return true

    const rows = await dbQuery(`SELECT code FROM public.familias WHERE code = '${parsed.familia_code.replace(/'/g, "''")}' LIMIT 1`)
    return rows && rows.length > 0
}

export async function createFamilyAction(data: any) {
    if (!data.code) throw new Error("Family code is required")
    await dbQuery(`
        INSERT INTO public.familias (code, name, product_type, use_destination)
        VALUES ('${data.code}', ${data.name ? `'${data.name.replace(/'/g, "''")}'` : 'NULL'}, ${data.product_type ? `'${data.product_type}'` : 'NULL'}, ${data.use_destination ? `'${data.use_destination}'` : 'NULL'})
        ON CONFLICT (code) DO NOTHING
    `)
    redirect('/products')
}

export async function createProductAction(data: any) {
    if (!data.code) throw new Error('Code is required')

    const parsed = await parseProductCode(data.code, data.sap_description, data.rh_flag)

    if (data._newFamily && parsed.familia_code) {
        const existing = await dbQuery(`SELECT code FROM public.familias WHERE code = '${parsed.familia_code.replace(/'/g, "''")}' LIMIT 1`)
        if (!existing || existing.length === 0) {
            await dbQuery(`
                INSERT INTO public.familias (code, name, product_type, use_destination)
                VALUES ('${parsed.familia_code}', '${(data._newFamily.name || parsed.familia_code).replace(/'/g, "''")}', ${data._newFamily.product_type ? `'${data._newFamily.product_type}'` : 'NULL'}, ${data._newFamily.use_destination ? `'${data._newFamily.use_destination}'` : 'NULL'})
                ON CONFLICT (code) DO NOTHING
            `)
        }
    }

    function esc(v: any) {
        if (v === null || v === undefined) return 'NULL'
        if (typeof v === 'boolean') return v ? 'true' : 'false'
        if (typeof v === 'number') return String(v)
        return `'${String(v).replace(/'/g, "''")}'`
    }

    await dbQuery(`
        INSERT INTO public.products (code, sap_description, product_type, furniture_name, color_code, rh_flag, assembled_flag, edge_2mm_flag, line, use_destination, commercial_measure, accessory_text, designation, width_cm, depth_cm, height_cm, weight_kg, stacking_max, familia_code, ref_code, version_code, sku_servicios_ref)
        VALUES (${esc(data.code)}, ${esc(data.sap_description)}, ${esc(data.product_type || parsed.product_type)}, ${esc(data.furniture_name)}, ${esc(data.color_code || parsed.color_code)}, ${data.rh_flag || parsed.rh_flag ? 'true' : 'false'}, ${data.assembled_flag || parsed.assembled_flag ? 'true' : 'false'}, ${data.edge_2mm_flag ? 'true' : 'false'}, ${esc(data.line)}, ${esc(data.use_destination || parsed.use_destination)}, ${esc(data.commercial_measure)}, ${esc(data.accessory_text)}, ${esc(data.designation)}, ${data.width_cm ? parseFloat(data.width_cm) : 'NULL'}, ${data.depth_cm ? parseFloat(data.depth_cm) : 'NULL'}, ${data.height_cm ? parseFloat(data.height_cm) : 'NULL'}, ${data.weight_kg ? parseFloat(data.weight_kg) : 'NULL'}, ${data.stacking_max ? parseInt(data.stacking_max) : 'NULL'}, ${esc(parsed.familia_code)}, ${esc(parsed.ref_code)}, ${esc(parsed.version_code)}, ${esc(data.code)})
        ON CONFLICT (code) DO NOTHING
    `)

    redirect('/products')
}

export async function updateProductAction(id: string, data: any) {
    if (!data.code) throw new Error('Code is required')
    const parsed = await parseProductCode(data.code, data.sap_description, data.rh_flag)

    function esc(v: any) {
        if (v === null || v === undefined) return 'NULL'
        if (typeof v === 'boolean') return v ? 'true' : 'false'
        if (typeof v === 'number') return String(v)
        return `'${String(v).replace(/'/g, "''")}'`
    }

    await dbQuery(`
        UPDATE public.products SET
            code=${esc(data.code)}, sap_description=${esc(data.sap_description)}, product_type=${esc(data.product_type)},
            furniture_name=${esc(data.furniture_name)}, color_code=${esc(data.color_code)},
            rh_flag=${data.rh_flag ? 'true' : 'false'}, assembled_flag=${data.assembled_flag ? 'true' : 'false'},
            edge_2mm_flag=${data.edge_2mm_flag ? 'true' : 'false'}, line=${esc(data.line)},
            use_destination=${esc(data.use_destination)}, commercial_measure=${esc(data.commercial_measure)},
            accessory_text=${esc(data.accessory_text)}, designation=${esc(data.designation)},
            familia_code=${esc(parsed.familia_code)}, ref_code=${esc(parsed.ref_code)},
            version_code=${esc(parsed.version_code)}, updated_at=now()
        WHERE id='${id}'
    `)

    redirect('/products')
}

export async function massUpdateProducts(ids: string[], updateData: any) {
    if (!ids || ids.length === 0) return

    const setClauses: string[] = []
    if (updateData.edge_2mm_flag !== undefined) setClauses.push(`edge_2mm_flag=${updateData.edge_2mm_flag ? 'true' : 'false'}`)
    if (updateData.rh_flag !== undefined) setClauses.push(`rh_flag=${updateData.rh_flag ? 'true' : 'false'}`)
    if (updateData.assembled_flag !== undefined) setClauses.push(`assembled_flag=${updateData.assembled_flag ? 'true' : 'false'}`)
    if (updateData.commercial_measure !== undefined) setClauses.push(`commercial_measure='${String(updateData.commercial_measure).replace(/'/g, "''")}'`)
    if (updateData.accessory_text !== undefined) setClauses.push(`accessory_text='${String(updateData.accessory_text).replace(/'/g, "''")}'`)
    if (updateData.validation_status !== undefined) setClauses.push(`validation_status='${updateData.validation_status}'`)

    if (setClauses.length === 0) return

    const idList = ids.map(id => `'${id}'`).join(',')
    await dbQuery(`UPDATE public.products SET ${setClauses.join(', ')}, updated_at=now() WHERE id IN (${idList})`)
}

export async function translateMissingProducts() {
    try {
        const products = await dbQuery(`SELECT id, final_name_es, use_destination, width_cm, rh_flag, icon_soft_close, edge_2mm_flag FROM public.products WHERE final_name_en IS NULL AND final_name_es IS NOT NULL LIMIT 20`)

        if (!products || products.length === 0) return { success: true, count: 0, message: "No hay productos pendientes de traducir." }

        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '' })

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
`
        const prompt = promptTemplate + JSON.stringify(products, null, 2)

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        })

        const text = response.text
        if (!text) throw new Error("No response from AI")
        const translations = JSON.parse(text)

        let updatedCount = 0
        for (const [id, en_name] of Object.entries(translations)) {
            await dbQuery(`UPDATE public.products SET final_name_en='${String(en_name).replace(/'/g, "''")}', updated_at=now() WHERE id='${id}'`)
            updatedCount++
        }

        return { success: true, count: updatedCount, message: `Traducidos exitosamente ${updatedCount} productos.` }
    } catch (e: any) {
        console.error("Translation Error:", e)
        return { success: false, error: e.message }
    }
}
