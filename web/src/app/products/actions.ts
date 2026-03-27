'use server'

import { dbQuery } from '@/lib/supabase'
import { Product } from '@prisma/client'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { translateProductToEnglish } from '@/lib/engine/translator'
import { parseProductCode } from '@/lib/engine/codeParser'
import { redirect } from 'next/navigation'
import { GoogleGenAI } from '@google/genai'

export async function parseProductCodeAction(code: string, sapDesc: string, rhFlag: boolean) {
    return await parseProductCode(code, sapDesc, rhFlag)
}

export async function translateAction(nameEs: string, ctx?: any) {
    if (ctx && ctx.product_type) {
        return await translateProductToEnglish(ctx, ctx.product_type || 'MUEBLE')
    }
    return { translatedName: '', missingTerms: [], isValid: false, errorReason: 'Motor adaptativo requiere el objeto producto completo.', warnings: [] }
}

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

    // Logic for Private Label Client
    let clientId = data.private_label_client_id
    if (data.private_label_flag && (!clientId || clientId === '__NEW__') && data.private_label_client_name) {
        // Create new client if it's private label and we only have a name
        const newClient = await createClientAction(data.private_label_client_name, data.private_label_logo_id)
        clientId = newClient.id
    }

    function esc(v: any) {
        if (v === null || v === undefined || v === '') return 'NULL'
        if (typeof v === 'boolean') return v ? 'true' : 'false'
        if (typeof v === 'number') return String(v)
        return `'${String(v).replace(/'/g, "''")}'`
    }

    // Conversions
    const w_in = data.width_cm ? (parseFloat(data.width_cm) / 2.54).toFixed(2) : 'NULL'
    const d_in = data.depth_cm ? (parseFloat(data.depth_cm) / 2.54).toFixed(2) : 'NULL'
    const h_in = data.height_cm ? (parseFloat(data.height_cm) / 2.54).toFixed(2) : 'NULL'
    const w_lb = data.weight_kg ? (parseFloat(data.weight_kg) * 2.20462).toFixed(2) : 'NULL'

    await dbQuery(`
        INSERT INTO public.cabinet_products (
            code, sap_description, product_type, furniture_name, color_code, rh_flag, rh,
            assembled_flag, canto_puertas, carb2, line, use_destination, zone_home, 
            commercial_measure, accessory_text, designation, width_cm, depth_cm, height_cm, weight_kg, 
            width_in, depth_in, height_in, weight_lb,
            stacking_max, familia_code, ref_code, version_code, sku_base, sku_servicios_ref,
            final_name_es, final_name_en, status,
            private_label_flag, private_label_client_name, private_label_client_id
        ) VALUES (
            ${esc(data.code)}, ${esc(data.sap_description)}, ${esc(data.product_type || parsed.product_type)}, 
            ${esc(data.furniture_name)}, ${esc(data.color_code || parsed.color_code)}, ${data.rh === 'RH' || parsed.rh === 'RH' ? 'true' : 'false'}, ${esc(data.rh || parsed.rh || 'NA')},
            ${data.assembled_flag || parsed.assembled_flag ? 'true' : 'false'}, ${esc(data.canto_puertas || 'CANTO 2 MM')}, 
            ${esc(data.carb2 || 'NA')},
            ${esc(data.line)}, ${esc(data.use_destination || parsed.use_destination)}, ${esc(data.zone_home || parsed.zone_home)}, 
            ${esc(data.commercial_measure)}, ${esc(data.accessory_text)}, ${esc(data.designation)}, 
            ${data.width_cm ? parseFloat(data.width_cm) : 'NULL'}, ${data.depth_cm ? parseFloat(data.depth_cm) : 'NULL'}, 
            ${data.height_cm ? parseFloat(data.height_cm) : 'NULL'}, ${data.weight_kg ? parseFloat(data.weight_kg) : 'NULL'},
            ${w_in}, ${d_in}, ${h_in}, ${w_lb},
            ${data.stacking_max ? parseInt(data.stacking_max) : 'NULL'}, ${esc(parsed.familia_code)}, ${esc(parsed.ref_code)}, 
            ${esc(parsed.version_code)}, ${esc(parsed.sku_base)}, ${esc(data.code)},
            ${esc(data.final_name_es)}, ${esc(data.final_name_en)}, ${esc(data.status || 'ACTIVO')},
            ${data.private_label_flag ? 'true' : 'false'}, ${esc(data.private_label_client_name)}, ${esc(clientId)}
        )
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

    // Conversions
    const w_in = data.width_cm ? (parseFloat(data.width_cm) / 2.54).toFixed(2) : 'NULL'
    const d_in = data.depth_cm ? (parseFloat(data.depth_cm) / 2.54).toFixed(2) : 'NULL'
    const h_in = data.height_cm ? (parseFloat(data.height_cm) / 2.54).toFixed(2) : 'NULL'
    const w_lb = data.weight_kg ? (parseFloat(data.weight_kg) * 2.20462).toFixed(2) : 'NULL'

    // Lógica de ID automático y Flag en UPDATE
    if (data.private_label_client_name && data.private_label_client_name !== 'NA') {
        data.private_label_flag = true;
        if (data.private_label_client_name === 'CHILEMAT') data.private_label_client_id = 'CL-CH01';
        else if (data.private_label_client_name === 'D-ACQUA') data.private_label_client_id = 'CL-DA01';
        else if (data.private_label_client_name === 'PROMART') data.private_label_client_id = 'CL-PR01';
        else if (data.private_label_client_name === 'FERMETAL') data.private_label_client_id = 'CL-FE01';
    } else if (data.private_label_client_name === 'NA') {
        data.private_label_flag = false;
        data.private_label_client_id = null;
    }

    await dbQuery(`
        UPDATE public.cabinet_products SET
            code=${esc(data.code)}, sap_description=${esc(data.sap_description)}, product_type=${esc(data.product_type || parsed.product_type)},
            furniture_name=${esc(data.furniture_name)}, color_code=${esc(data.color_code || parsed.color_code)},
            rh_flag=${data.rh === 'RH' || parsed.rh === 'RH' ? 'true' : 'false'}, rh=${esc(data.rh || parsed.rh || 'NA')}, assembled_flag=${data.assembled_flag ? 'true' : 'false'},
            canto_puertas=${esc(data.canto_puertas)}, carb2=${esc(data.carb2)}, line=${esc(data.line || parsed.line)},
            use_destination=${esc(data.use_destination)}, zone_home=${esc(data.zone_home || parsed.zone_home)}, commercial_measure=${esc(data.commercial_measure)},
            accessory_text=${esc(data.accessory_text)}, designation=${esc(data.designation)},
            width_cm=${data.width_cm ? parseFloat(data.width_cm) : 'NULL'}, depth_cm=${data.depth_cm ? parseFloat(data.depth_cm) : 'NULL'}, 
            height_cm=${data.height_cm ? parseFloat(data.height_cm) : 'NULL'}, weight_kg=${data.weight_kg ? parseFloat(data.weight_kg) : 'NULL'},
            width_in=${w_in}, depth_in=${d_in}, height_in=${h_in}, weight_lb=${w_lb},
            stacking_max=${data.stacking_max ? parseInt(data.stacking_max) : 'NULL'},
            familia_code=${esc(parsed.familia_code)}, ref_code=${esc(parsed.ref_code)},
            version_code=${esc(parsed.version_code)}, sku_base=${esc(parsed.sku_base)},
            final_name_es=${esc(data.final_name_es)}, final_name_en=${esc(data.final_name_en)},
            status=${esc(data.status || 'ACTIVO')},
            special_label=${esc(data.special_label || 'NA')},
            private_label_flag=${data.private_label_flag ? 'true' : 'false'},
            private_label_client_name=${esc(data.private_label_client_name || 'NA')},
            private_label_client_id=${esc(data.private_label_client_id)},
            updated_at=now()
        WHERE id='${id}'
    `)

    redirect('/products')
}

export async function massUpdateProducts(ids: string[], updateData: any) {
    if (!ids || ids.length === 0) return

    const setClauses: string[] = []
    if (updateData.canto_puertas !== undefined) setClauses.push(`canto_puertas='${String(updateData.canto_puertas).replace(/'/g, "''")}'`)
    if (updateData.carb2 !== undefined) setClauses.push(`carb2='${String(updateData.carb2).replace(/'/g, "''")}'`)
    if (updateData.rh !== undefined) {
        setClauses.push(`rh='${String(updateData.rh).replace(/'/g, "''")}'`)
        setClauses.push(`rh_flag=${updateData.rh === 'RH' ? 'true' : 'false'}`)
    }
    if (updateData.assembled_flag !== undefined) setClauses.push(`assembled_flag=${updateData.assembled_flag ? 'true' : 'false'}`)
    if (updateData.commercial_measure !== undefined) setClauses.push(`commercial_measure='${String(updateData.commercial_measure).replace(/'/g, "''")}'`)
    if (updateData.accessory_text !== undefined) setClauses.push(`accessory_text='${String(updateData.accessory_text).replace(/'/g, "''")}'`)
    if (updateData.validation_status !== undefined) setClauses.push(`validation_status='${updateData.validation_status}'`)
    if (updateData.zone_home !== undefined) setClauses.push(`zone_home='${String(updateData.zone_home).replace(/'/g, "''")}'`)
    if (updateData.designation !== undefined) setClauses.push(`designation='${String(updateData.designation).replace(/'/g, "''")}'`)
    if (updateData.status !== undefined) setClauses.push(`status='${String(updateData.status).replace(/'/g, "''")}'`)
    if (updateData.special_label !== undefined) setClauses.push(`special_label='${String(updateData.special_label).replace(/'/g, "''")}'`)

    if (setClauses.length === 0) return

    const idList = ids.map(id => `'${id}'`).join(',')
    await dbQuery(`UPDATE public.cabinet_products SET ${setClauses.join(', ')}, updated_at=now() WHERE id IN (${idList})`)
}

export async function deleteProducts(ids: string[]) {
    if (!ids || ids.length === 0) return
    const idList = ids.map(id => `'${id}'`).join(',')
    await dbQuery(`DELETE FROM public.cabinet_products WHERE id IN (${idList})`)
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

export async function translateProductsAction(ids?: string[], mode: 'missing' | 'repair' | 'all' = 'missing') {
    try {
        let query = `
            SELECT 
                id, code, product_type, designation, furniture_name, line,
                use_destination, commercial_measure, accessory_text, canto_puertas,
                door_color_text, rh, carb2, assembled_flag, special_label,
                private_label_client_name, armado_con_lvm,
                final_name_es, final_name_en, validation_status
            FROM public.cabinet_products 
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
            const result = await translateProductToEnglish(product, product.product_type || 'MUEBLE')
            const { translatedName, missingTerms, isValid } = result

            if (missingTerms.length > 0) {
                totalMissingTerms.push(...missingTerms)
            }

            // Block update if there are critical missing terms with translate strategy
            if (!isValid && missingTerms.length > 0) {
                updatedProducts.push({ id: product.id, final_name_en: '' })
                updatedCount++
                continue
            }

            const status = missingTerms.length > 0 ? 'needs_review' : 'ready'
            const safeTranslated = translatedName.replace(/'/g, "''")

            await dbQuery(`
                UPDATE public.cabinet_products 
                SET final_name_en='${safeTranslated}', 
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

export async function getUniquePropertiesAction() {
    const lines = await dbQuery(`
        SELECT DISTINCT line 
        FROM public.cabinet_products 
        WHERE line IS NOT NULL 
          AND line != '' 
          AND line NOT IN (SELECT name_color_sap FROM public.colors)
        ORDER BY line ASC
    `) || []
    
    const designations = await dbQuery(`SELECT DISTINCT designation FROM public.cabinet_products WHERE designation IS NOT NULL AND designation != '' ORDER BY designation ASC`) || []
    const productTypes = await dbQuery(`SELECT DISTINCT product_type FROM public.cabinet_products WHERE product_type IS NOT NULL AND product_type != '' ORDER BY product_type ASC`) || []
    const useDestinations = await dbQuery(`SELECT DISTINCT use_destination FROM public.cabinet_products WHERE use_destination IS NOT NULL AND use_destination != '' ORDER BY use_destination ASC`) || []
    
    // Nuevas variables unicas
    const furnitureNames = await dbQuery(`SELECT DISTINCT furniture_name FROM public.cabinet_products WHERE furniture_name IS NOT NULL AND furniture_name != '' ORDER BY furniture_name ASC`) || []
    const commercialMeasures = await dbQuery(`SELECT DISTINCT commercial_measure FROM public.cabinet_products WHERE commercial_measure IS NOT NULL AND commercial_measure != '' ORDER BY commercial_measure ASC`) || []
    const accessoryTexts = await dbQuery(`SELECT DISTINCT accessory_text FROM public.cabinet_products WHERE accessory_text IS NOT NULL AND accessory_text != '' ORDER BY accessory_text ASC`) || []
    const colors = await dbQuery(`SELECT code_4dig as code_color, name_color_sap FROM public.colors ORDER BY code_4dig ASC`) || []

    return {
        lines: lines.map((r: any) => r.line),
        designations: designations.map((r: any) => r.designation),
        productTypes: productTypes.map((r: any) => r.product_type),
        useDestinations: useDestinations.map((r: any) => r.use_destination),
        furnitureNames: furnitureNames.map((r: any) => r.furniture_name),
        commercialMeasures: commercialMeasures.map((r: any) => r.commercial_measure),
        accessoryTexts: accessoryTexts.map((r: any) => r.accessory_text),
        colors: colors.map((r: any) => ({ code: r.code_color, name: r.name_color_sap }))
    }
}

export async function checkProductExistsAction(code?: string, sapDesc?: string) {
    if (!code && !sapDesc) return null

    let codeSafe = code ? String(code).trim().replace(/'/g, "''") : ""
    let sapDescSafe = sapDesc ? String(sapDesc).trim().replace(/'/g, "''") : ""

    let conditions = []
    if (codeSafe) conditions.push(`code = '${codeSafe}'`)
    if (sapDescSafe) conditions.push(`sap_description = '${sapDescSafe}'`)

    if (conditions.length === 0) return null

    const res = await dbQuery(`
        SELECT id, code, sap_description 
        FROM public.cabinet_products 
        WHERE ${conditions.join(' OR ')}
        LIMIT 1
    `)

    return res && res.length > 0 ? res[0] : null
}

export async function getClientsAction() {
    let fromClients: any[] = []
    try {
        fromClients = await dbQuery(`SELECT id, name, logo_asset_id FROM public.clients ORDER BY name ASC`) || []
    } catch (e) {
        console.error("Error fetching from public.clients:", e)
    }
    
    let fromProducts: any[] = []
    try {
        fromProducts = await dbQuery(`
            SELECT DISTINCT private_label_client_name as name 
            FROM public.cabinet_products 
            WHERE private_label_client_name IS NOT NULL 
              AND private_label_client_name != '' 
              AND private_label_client_name != 'NA'
        `) || []
    } catch (e) {
        console.error("Error fetching from products:", e)
    }
    
    const defaults = ["CHILEMAT", "D-ACQUA", "PROMART", "FERMETAL"].map(n => ({ id: n, name: n, logo_id: null }))
    
    const combined = [
        ...fromClients, 
        ...(fromProducts || []).map((p: any) => ({ id: p.name, name: p.name, logo_asset_id: null })),
        ...defaults
    ]
    
    const unique = combined.reduce((acc: any[], curr) => {
        if (!curr || !curr.name) return acc
        const found = acc.find(x => x.name.toUpperCase() === curr.name.toUpperCase())
        if (!found) {
            acc.push(curr)
        } else if (typeof found.id === 'string' && !found.id.includes('-') && typeof curr.id === 'string' && curr.id.includes('-')) {
            const idx = acc.indexOf(found)
            acc[idx] = curr
        }
        return acc
    }, [])
    
    return unique.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
}

export async function createClientAction(name: string, logoAssetId?: string) {
    if (!name) throw new Error("Nombre del cliente requerido")
    
    // Check if client exists
    const existing = await dbQuery(`SELECT id FROM public.clients WHERE name = '${name.replace(/'/g, "''")}' LIMIT 1`)
    if (existing && existing.length > 0) return existing[0]

    const res = await dbQuery(`
        INSERT INTO public.clients (id, name, logo_asset_id, created_at)
        VALUES (gen_random_uuid(), '${name.replace(/'/g, "''")}', ${logoAssetId ? `'${logoAssetId}'` : 'NULL'}, now())
        RETURNING id, name
    `)
    
    if (!res || res.length === 0) throw new Error("No se pudo crear el cliente")
    return res[0]
}
export async function saveGlossaryTermsAction(terms: { term_es: string, term_en: string, category: string, priority: number }[]) {
    if (!terms || terms.length === 0) return { success: true }
    
    try {
        for (const t of terms) {
            await dbQuery(`
                INSERT INTO public.glossary (term_es, term_en, category, priority, active)
                VALUES ('${t.term_es.toUpperCase().replace(/'/g, "''")}', '${t.term_en.toUpperCase().replace(/'/g, "''")}', '${t.category}', ${t.priority}, true)
                ON CONFLICT (term_es) DO UPDATE 
                SET term_en = EXCLUDED.term_en,
                    category = EXCLUDED.category,
                    priority = EXCLUDED.priority;
            `)
        }
        return { success: true, message: `Se guardaron ${terms.length} términos correctamente.` }
    } catch (error: any) {
        console.error("Error saving glossary terms:", error)
        return { success: false, message: `Error al guardar términos: ${error.message}` }
    }
}
