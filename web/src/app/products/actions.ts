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

export async function deleteProducts(ids: string[]) {
    if (!ids || ids.length === 0) return
    const idList = ids.map(id => `'${id}'`).join(',')
    await dbQuery(`DELETE FROM public.products WHERE id IN (${idList})`)
}

export async function translateMissingProducts() {
    try {
        const products = await dbQuery(`
            SELECT 
                id, 
                final_name_es, 
                use_destination, 
                width_cm, 
                rh_flag, 
                icon_soft_close, 
                edge_2mm_flag,
                line as model
            FROM public.products 
            WHERE final_name_en IS NULL 
            AND final_name_es IS NOT NULL 
            LIMIT 20
        `)

        if (!products || products.length === 0) return { success: true, count: 0, message: "No hay productos pendientes de traducir." }

        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '' })

        const promptTemplate = `
You are NOT a translator.
You are a Firplak SAP product naming expert for the US market.
Your job is to REBUILD product names in professional commercial English, not translate word by word.

---
CONTEXT
Products belong to categories such as:
- bathroom vanities
- kitchen cabinets
- laundry units
- sinks and lavatories
The output must match real SAP naming conventions used in manufacturing and export.

---
INPUT
You will receive structured product data including:
- final_name_es (Spanish structured name)
- use_destination
- width_cm
- attributes (RH, soft close, etc.)

---
CRITICAL RULES
1. DO NOT translate literally
2. DO NOT invent names
3. DO NOT use generic words like:
   - "furniture"
   - "product"
   - "washbasin furniture"

---
FIRPLAK CORE RULES (MANDATORY)
- "LVM" MUST be translated as "LAV"
- Model names (SIENA, OSLO, VALDEZ) must NEVER be translated
- Output must be ALL CAPS
- NO hyphens ("-")
- Color or finish must be at the END if present
- Use real US industry terminology only

---
DIMENSIONS (VERY IMPORTANT)
- Convert ALL dimensions from cm to inches (1 in = 2.54 cm)
- Use commercial rounding
- Format: 31IN, 25IN, 37IN
- Handle dual dimensions strictly if present in Spanish name (e.g., 79X48 -> 31INX19IN)
- STRICT FORMAT: No spaces in dimension blocks (e.g., "31IN" is OK, "31 IN" is WRONG)
- NEVER output cm

---
HANDLES
- "CON MANIJAS" -> WITH HANDLES
- "SIN MANIJAS" -> WITHOUT HANDLES
- If not specified -> DO NOT assume

---
PRODUCT LOGIC (VERY IMPORTANT)
DO NOT force all products into "VANITY CABINET"
Decide correctly based on context:
- Bathroom with sink -> VANITY or LAV
- Upper cabinet -> WALL CABINET
- Lower cabinet -> BASE CABINET
- Pantry -> PANTRY CABINET
- Laundry -> LAUNDRY CABINET
- Sink base -> SINK BASE CABINET

---
STRUCTURE
Build names using this logic:
[MODEL] + [PRODUCT TYPE] + [SIZE IN INCHES] + [KEY FEATURES]

Keep it clean, commercial, and realistic.

---
OUTPUT FORMAT (STRICT JSON)
Return ONLY a JSON object:
{
  "product_id": "ENGLISH NAME"
}
`
        const prompt = promptTemplate + "\n\nTranslate these products:\n" + JSON.stringify(products, null, 2)

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        })

        const text = response.text
        if (!text) throw new Error("No response from AI")
        const translations = JSON.parse(text)

        let updatedCount = 0
        let failedCount = 0

        for (const [id, en_name] of Object.entries(translations)) {
            const originalProduct = products.find((p: any) => p.id === id)
            if (!originalProduct) continue;

            const nameStr = String(en_name).trim().toUpperCase()
            let failedRule = ""

            // 1. FORMAT VALIDATION
            const forbiddenTerms = ['FURNITURE', 'PRODUCT', 'WASHBASIN FURNITURE']
            const hasForbidden = forbiddenTerms.some(term => nameStr.includes(term))
            const hasCM = nameStr.includes('CM')
            const hasHyphen = nameStr.includes('-')
            
            // 2. SEMANTIC VALIDATION
            const modelName = String(originalProduct.model || '').toUpperCase()
            const hasModel = modelName ? nameStr.includes(modelName) : true
            
            // LVM -> LAV consistency check (Mandatory)
            const needsLav = originalProduct.final_name_es?.toUpperCase().includes('LVM')
            const hasLav = nameStr.includes('LAV')
            
            // Dimensions format strict check: XXIN or XXINXYYIN (no spaces)
            const dimRegex = /\b\d+IN\b|\b\d+INX\d+IN\b/
            const hasValidDimFormat = dimRegex.test(nameStr)
            
            // Dimension Parity check
            const esDims = originalProduct.final_name_es?.match(/\d+X\d+|\b\d{2,}\b/g) || []
            const enDims = nameStr.match(/(\d+)IN/g) || []
            // If Spanish has "79X48", esDims might be ["79X48"] or ["79", "48"]. 
            // Let's count individual numbers in ES name vs IN blocks in EN name.
            const esNumCount = (originalProduct.final_name_es?.match(/\d+/g) || []).filter((n: string) => n.length >= 2).length
            const enInCount = enDims.length
            const dimParityFail = esNumCount > 0 && enInCount < esNumCount

            // Mandatory Elements Check
            const typeKeywords = ['CABINET', 'VANITY', 'LAV', 'BASE', 'WALL', 'PANTRY', 'LAUNDRY', 'SINK']
            const hasType = typeKeywords.some(tk => nameStr.includes(tk))
            const hasInBlock = nameStr.includes('IN')

            // Consistency
            const useDest = String(originalProduct.use_destination || '').toUpperCase()
            let typeConsistent = true
            if (useDest.includes('COCINA') && nameStr.includes('VANITY')) typeConsistent = false
            if (useDest.includes('LAVAMANO') && !nameStr.includes('VANITY') && !nameStr.includes('LAV')) typeConsistent = false

            // Define specific failure reasons
            if (hasForbidden) failedRule = "forbidden_terms"
            else if (hasCM) failedRule = "contains_cm"
            else if (hasHyphen) failedRule = "contains_hyphen"
            else if (!hasModel) failedRule = "missing_model"
            else if (!hasType) failedRule = "missing_product_type"
            else if (!hasInBlock) failedRule = "missing_dimension"
            else if (!hasValidDimFormat) failedRule = "invalid_dimension_format"
            else if (dimParityFail) failedRule = "dimension_parity_fail"
            else if (needsLav && !hasLav) failedRule = "missing_lav"
            else if (!typeConsistent) failedRule = "type_consistency_fail"

            if (failedRule) {
                console.error(`Automated Validation Failed for Product ${id}: "${nameStr}"`)
                console.error({ product_id: id, generated_name: nameStr, failed_rule: failedRule })
                
                // Mark as auto_failed
                await dbQuery(`UPDATE public.products SET validation_status='auto_failed', updated_at=now() WHERE id='${id}'`)
                failedCount++
                continue
            }

            await dbQuery(`UPDATE public.products SET final_name_en='${nameStr.replace(/'/g, "''")}', validation_status='ready', updated_at=now() WHERE id='${id}'`)
            updatedCount++
        }

        return { 
            success: true, 
            count: updatedCount, 
            failedCount,
            message: `Procesados: ${updatedCount} exitosos, ${failedCount} fallidos automáticamente.` 
        }
    } catch (e: any) {
        console.error("Translation Error:", e)
        return { success: false, error: e.message }
    }
}
