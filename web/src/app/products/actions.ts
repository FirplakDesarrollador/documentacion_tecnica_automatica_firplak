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
        INSERT INTO public.familias (code, name, product_type, use_destination, zone_home)
        VALUES ('${data.code}', ${data.name ? `'${data.name.replace(/'/g, "''")}'` : 'NULL'}, ${data.product_type ? `'${data.product_type}'` : 'NULL'}, ${data.use_destination ? `'${data.use_destination}'` : 'NULL'}, ${data.zone_home ? `'${data.zone_home}'` : 'NULL'})
        ON CONFLICT (code) DO NOTHING
    `)
    redirect('/families')
}

export async function createProductAction(data: any) {
    if (!data.code) throw new Error('Code is required')

    const parsed = await parseProductCode(data.code, data.sap_description, data.rh_flag)

    if (data._newFamily && parsed.familia_code) {
        const existing = await dbQuery(`SELECT code FROM public.familias WHERE code = '${parsed.familia_code.replace(/'/g, "''")}' LIMIT 1`)
        if (!existing || existing.length === 0) {
            await dbQuery(`
                INSERT INTO public.familias (code, name, product_type, use_destination, zone_home)
                VALUES ('${parsed.familia_code}', '${(data._newFamily.name || parsed.familia_code).replace(/'/g, "''")}', ${data._newFamily.product_type ? `'${data._newFamily.product_type}'` : 'NULL'}, ${data._newFamily.use_destination ? `'${data._newFamily.use_destination}'` : 'NULL'}, ${data._newFamily.zone_home ? `'${data._newFamily.zone_home}'` : 'NULL'})
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
        INSERT INTO public.products (code, sap_description, product_type, furniture_name, color_code, rh_flag, assembled_flag, edge_2mm_flag, line, use_destination, zone_home, commercial_measure, accessory_text, designation, width_cm, depth_cm, height_cm, weight_kg, stacking_max, familia_code, ref_code, version_code, sku_base, sku_servicios_ref)
        VALUES (${esc(data.code)}, ${esc(data.sap_description)}, ${esc(data.product_type || parsed.product_type)}, ${esc(data.furniture_name)}, ${esc(data.color_code || parsed.color_code)}, ${data.rh_flag || parsed.rh_flag ? 'true' : 'false'}, ${data.assembled_flag || parsed.assembled_flag ? 'true' : 'false'}, ${data.edge_2mm_flag ? 'true' : 'false'}, ${esc(data.line)}, ${esc(data.use_destination || parsed.use_destination)}, ${esc(data.zone_home || parsed.zone_home)}, ${esc(data.commercial_measure)}, ${esc(data.accessory_text)}, ${esc(data.designation)}, ${data.width_cm ? parseFloat(data.width_cm) : 'NULL'}, ${data.depth_cm ? parseFloat(data.depth_cm) : 'NULL'}, ${data.height_cm ? parseFloat(data.height_cm) : 'NULL'}, ${data.weight_kg ? parseFloat(data.weight_kg) : 'NULL'}, ${data.stacking_max ? parseInt(data.stacking_max) : 'NULL'}, ${esc(parsed.familia_code)}, ${esc(parsed.ref_code)}, ${esc(parsed.version_code)}, ${esc(parsed.sku_base)}, ${esc(data.code)})
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
            use_destination=${esc(data.use_destination)}, zone_home=${esc(data.zone_home)}, commercial_measure=${esc(data.commercial_measure)},
            accessory_text=${esc(data.accessory_text)}, designation=${esc(data.designation)},
            familia_code=${esc(parsed.familia_code)}, ref_code=${esc(parsed.ref_code)},
            version_code=${esc(parsed.version_code)}, sku_base=${esc(parsed.sku_base)}, updated_at=now()
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
    if (updateData.zone_home !== undefined) setClauses.push(`zone_home='${String(updateData.zone_home).replace(/'/g, "''")}'`)

    if (setClauses.length === 0) return

    const idList = ids.map(id => `'${id}'`).join(',')
    await dbQuery(`UPDATE public.products SET ${setClauses.join(', ')}, updated_at=now() WHERE id IN (${idList})`)
}

export async function deleteProducts(ids: string[]) {
    if (!ids || ids.length === 0) return
    const idList = ids.map(id => `'${id}'`).join(',')
    await dbQuery(`DELETE FROM public.products WHERE id IN (${idList})`)
}

export async function updateFamilyAction(code: string, data: any) {
    if (!code) throw new Error("Family code is required")
    await dbQuery(`
        UPDATE public.familias SET
            name=${data.name ? `'${data.name.replace(/'/g, "''")}'` : 'NULL'},
            product_type=${data.product_type ? `'${data.product_type}'` : 'NULL'},
            use_destination=${data.use_destination ? `'${data.use_destination}'` : 'NULL'},
            zone_home=${data.zone_home ? `'${data.zone_home}'` : 'NULL'},
            updated_at=now()
        WHERE code='${code.replace(/'/g, "''")}'
    `)
    redirect('/families')
}

/**
 * Validates a generated English name against Firplak SAP rules.
 * Returns the failed rule name if invalid, or null if valid.
 */
function validateEnglishName(nameStr: string, originalProduct: any): string | null {
    const forbiddenTerms = ['FURNITURE', 'PRODUCT', 'WASHBASIN FURNITURE']
    const hasForbidden = forbiddenTerms.some(term => nameStr.includes(term))
    const hasCM = nameStr.includes('CM')
    const hasHyphen = nameStr.includes('-')
    
    const modelName = String(originalProduct.model || '').toUpperCase()
    const hasModel = modelName ? nameStr.includes(modelName) : true
    
    // LVM -> LAV consistency check (Mandatory)
    const needsLav = originalProduct.final_name_es?.toUpperCase().includes('LVM')
    const hasLav = nameStr.includes('LAV')
    
    // Dimensions format strict check: XXIN or XXINXYYIN (no spaces)
    const dimRegex = /\b\d+IN\b|\b\d+INX\d+IN\b/
    const hasValidDimFormat = dimRegex.test(nameStr)
    
    // Dimension Parity check
    const esNumCount = (originalProduct.final_name_es?.match(/\d+/g) || []).filter((n: string) => n.length >= 2).length
    const enInCount = (nameStr.match(/(\d+)IN/g) || []).length
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

    if (hasForbidden) return "forbidden_terms"
    if (hasCM) return "contains_cm"
    if (hasHyphen) return "contains_hyphen"
    if (!hasModel) return "missing_model"
    if (!hasType) return "missing_product_type"
    if (!hasInBlock) return "missing_dimension"
    if (!hasValidDimFormat) return "invalid_dimension_format"
    if (dimParityFail) return "dimension_parity_fail"
    if (needsLav && !hasLav) return "missing_lav"
    if (!typeConsistent) return "type_consistency_fail"

    return null
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

import { translateSpanishToEnglish } from '@/lib/engine/translator'

export async function translateProductsAction(ids?: string[], mode: 'missing' | 'repair' | 'all' = 'missing') {
    try {
        let query = `
            SELECT 
                id, 
                final_name_es, 
                final_name_en,
                use_destination, 
                width_cm, 
                rh_flag, 
                icon_soft_close, 
                edge_2mm_flag,
                line as model,
                validation_status
            FROM public.products 
            WHERE final_name_es IS NOT NULL 
        `
        
        if (ids && ids.length > 0) {
            const idList = ids.map(id => `'${id}'`).join(',')
            query += ` AND id IN (${idList})`
        }

        const allProducts = await dbQuery(query)
        if (!allProducts || allProducts.length === 0) return { success: true, count: 0, message: "No se encontraron productos para procesar." }

        // Filter products based on mode
        const toTranslate = allProducts.filter((p: any) => {
            if (mode === 'all') return true
            if (mode === 'missing' && (!p.final_name_en || p.validation_status === 'auto_failed' || p.final_name_en.includes('Pendiente'))) return true
            if (mode === 'repair') return true // For glossary engine, repair always re-runs
            return false
        })

        if (toTranslate.length === 0) return { success: true, count: 0, message: "No hay productos que requieran traducción en este modo." }

        let updatedCount = 0
        let totalMissingTerms: string[] = []
        const updatedProducts: { id: string, final_name_en: string }[] = []

        for (const product of toTranslate) {
            const { translatedName, missingTerms } = await translateSpanishToEnglish(product.final_name_es || '')
            
            if (missingTerms.length > 0) {
                totalMissingTerms.push(...missingTerms)
            }

            // If we have missing terms, we mark it but still update if possible, or mark as incomplete
            const status = missingTerms.length > 0 ? 'needs_review' : 'ready'
            
            await dbQuery(`
                UPDATE public.products 
                SET final_name_en='${translatedName.replace(/'/g, "''")}', 
                    validation_status='${status}', 
                    updated_at=now() 
                WHERE id='${product.id}'
            `)
            
            updatedCount++
            updatedProducts.push({ id: product.id, final_name_en: translatedName })
        }

        const uniqueMissing = Array.from(new Set(totalMissingTerms))

        return { 
            success: true, 
            count: updatedCount, 
            updatedProducts,
            missingTerms: uniqueMissing,
            message: uniqueMissing.length > 0 
                ? `Proceso completado con ${uniqueMissing.length} términos faltantes en el glosario.` 
                : `Se tradujeron ${updatedCount} productos correctamente.`
        }

    } catch (error: any) {
        console.error("Translation Action Error:", error)
        return { 
            success: false, 
            message: `Error en el motor de traducción: ${error.message || 'Error desconocido'}` 
        }
    }
}


export async function translateMissingProducts() {
    return translateProductsAction(undefined, 'missing')
}
