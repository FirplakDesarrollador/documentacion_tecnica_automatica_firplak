'use server'

import { dbQuery, supabaseServer } from '@/lib/supabase'
import { Product } from '@prisma/client'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { resetGlossaryCache, translateProductToEnglish } from '@/lib/engine/translator'
import { parseProductCode } from '@/lib/engine/codeParser'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { GoogleGenAI } from '@google/genai'

function normalizeCanto(val: any) {
    if (val === null || val === undefined || val === '' || val === 'false') return 'CANTO 2 MM'
    const clean = String(val).toUpperCase().replace(/\s+/g, '')
    if (clean === 'CANTO0.45MM') return 'CANTO 0.45 MM'
    if (clean === 'CANTO1.5MM') return 'CANTO 1.5 MM'
    if (clean === 'CANTO2MM') return 'CANTO 2 MM'
    return String(val)
}

function normalizeCarb2(val: any) {
    if (val === null || val === undefined || val === '' || val === 'false') return 'NA'
    const clean = String(val).trim().toUpperCase()
    if (clean === 'SI' || clean === 'SÍ' || clean === 'YES' || clean === 'TRUE') return 'CARB2'
    if (clean === 'CARB 2') return 'CARB2'
    return clean
}

function formatPGArray(arr: string[] | null | undefined) {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return "'{}'"
    // PostgreSQL array syntax: '{val1,val2}'
    const escaped = arr.map(v => v.trim().replace(/'/g, "''").replace(/"/g, '\\"'))
    return `'{${escaped.join(',')}}'`
}

export async function parseProductCodeAction(code: string, sapDesc: string, rhFlag: boolean) {
    return await parseProductCode(code, sapDesc, rhFlag)
}

export async function translateAction(nameEs: string, ctx?: any, force: boolean = false) {
    if (ctx) {
        // Fallback to 'MUEBLE' if product_type is missing or empty
        const targetEntity = ctx.product_type && ctx.product_type.trim() !== '' ? ctx.product_type : 'MUEBLE'
        // Keep EN aligned with the variables actually used by ES naming rules
        const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`) || []
        const evalResult = evaluateProductRules(ctx as any, rules)
        return await translateProductToEnglish(
            { ...evalResult.transformedProduct, final_name_es: nameEs } as any,
            targetEntity,
            evalResult.activeVariableIds,
            force
        )
    }
    return { translatedName: '', missingTerms: [], isValid: false, errorReason: 'Motor adaptativo requiere el objeto producto completo.', warnings: [], fieldTranslations: {} }
}

/**
 * Resolves the English label for a given zone_home value using the Supabase glossary.
 * Client components (TemplateCanvas, PostSaveExportModal) should call this before
 * calling enrichProductDataWithIcons so that zone_home_en is correctly populated.
 * Returns null if no translation is found (productUtils will use its built-in fallback map).
 */
export async function resolveZoneHomeEnAction(zoneEs: string | null | undefined): Promise<string | null> {
    if (!zoneEs) return null
    const key = zoneEs.trim().toUpperCase()
    try {
        const rows = await dbQuery(
            `SELECT term_en FROM public.glossary 
             WHERE term_es = '${key.replace(/'/g, "''")}' 
               AND active = true 
             LIMIT 1`
        )
        return (rows && rows.length > 0) ? (rows[0].term_en as string) : null
    } catch {
        return null
    }
}

/**
 * Re-fetches the fully composed product context from the DB/view (`v_ui_generate_list`).
 * Use this after create/update before export so fields like `sku_base` match the export module pipeline.
 */
export async function composeProductByIdAction(id: string) {
    if (!id) return null
    const { composeProductById } = await import('@/lib/engine/product_composer')
    return await composeProductById(id)
}

export async function checkFamilyExists(code: string) {
    if (!code) return true
    const parsed = await parseProductCode(code, '', false)
    if (!parsed.familia_code) return true

    const rows = await dbQuery(`SELECT family_code FROM public.families WHERE family_code = '${parsed.familia_code.replace(/'/g, "''")}' LIMIT 1`)
    return rows && rows.length > 0
}

export async function checkFamilyExistsAction(code: string) {
    return await checkFamilyExists(code);
}

export async function upsertFamilyAction(data: any) {
    if (!data.code) throw new Error("Family code is required")
    
    const query = `
        INSERT INTO public.families (
            family_code, family_name, product_type, use_destination, zone_home, 
            allowed_lines, rh_default, assembled_default, manufacturing_process
        )
        VALUES (
            '${data.code.replace(/'/g, "''")}', 
            ${data.name ? `'${data.name.replace(/'/g, "''")}'` : 'NULL'}, 
            ${data.product_type ? `'${data.product_type}'` : 'NULL'}, 
            ${data.use_destination ? `'${data.use_destination}'` : 'NULL'}, 
            ${data.zone_home ? `'${data.zone_home}'` : 'NULL'},
            ${formatPGArray(data.allowed_lines)},
            ${data.rh_default ? 'true' : 'false'},
            ${data.assembled_default ? 'true' : 'false'},
            ${data.manufacturing_process ? `'${data.manufacturing_process}'` : "'FABRICADO'"}
        )
        ON CONFLICT (family_code) DO UPDATE SET
            family_name = EXCLUDED.family_name,
            product_type = EXCLUDED.product_type,
            use_destination = EXCLUDED.use_destination,
            zone_home = EXCLUDED.zone_home,
            allowed_lines = EXCLUDED.allowed_lines,
            rh_default = EXCLUDED.rh_default,
            assembled_default = EXCLUDED.assembled_default,
            manufacturing_process = EXCLUDED.manufacturing_process,
            updated_at = now()
        RETURNING *
    `
    const rows = await dbQuery(query)
    revalidatePath('/families')
    return rows ? rows[0] : null
}

export async function upsertColorAction(code: string, name: string) {
    if (!code || !name) throw new Error("Color code and name are required")
    
    // El code_4dig siempre tiene 4 dígitos (ej: 0434)
    // El code_short es el valor numérico sin ceros a la izquierda (ej: 434)
    const code4dig = code.padStart(4, '0')
    const codeShort = parseInt(code, 10).toString()

    const query = `
        INSERT INTO public.colors (code_4dig, code_short, name_color_sap)
        VALUES ('${code4dig.replace(/'/g, "''")}', '${codeShort.replace(/'/g, "''")}', '${name.replace(/'/g, "''")}')
        ON CONFLICT (code_4dig) DO UPDATE SET
            name_color_sap = EXCLUDED.name_color_sap,
            code_short = EXCLUDED.code_short
        RETURNING *
    `
    const rows = await dbQuery(query)
    return rows ? rows[0] : null
}

function buildCreateProductV6Payload(data: any, parsed: any, isPrivate: boolean, clientId: string, clientName: string, sap_description_recommended: string, final_name_es: string, final_name_en: string) {
    const normalizedPrivateName = (clientName && String(clientName).trim() !== '' && String(clientName).toUpperCase() !== 'NA')
        ? String(clientName).trim()
        : null

    const payload: any = {
        reference: {
            reference_code: parsed.ref_code,
            family_code: parsed.familia_code,
            product_name: data.product_name || null,
            designation: data.designation || null,
            line: data.line || parsed.line || null,
            commercial_measure: data.commercial_measure || null,
            special_label: data.special_label || parsed.special_label || 'NA',
            width_cm: data.width_cm ? parseFloat(data.width_cm) : null,
            depth_cm: data.depth_cm ? parseFloat(data.depth_cm) : null,
            height_cm: data.height_cm ? parseFloat(data.height_cm) : null,
            weight_kg: data.weight_kg ? parseFloat(data.weight_kg) : null,
            stacking_max: data.stacking_max ? parseInt(data.stacking_max) : null,
            isometric_path: data.isometric_path || null,
            isometric_asset_id: data.isometric_asset_id || null,
            ref_attrs: {
                carb2: normalizeCarb2(data.carb2 || parsed.carb2 || 'NA'),
                bisagras: data.bisagras || parsed.bisagras || 'NA',
                canto_puertas: normalizeCanto(data.canto_puertas),
                accessory_text: data.accessory_text || null,
                rh: data.rh || parsed.rh || 'NA',
                assembled_flag: data.assembled_flag || parsed.assembled_flag ? true : false,
                product_type: data.product_type || parsed.product_type || null
            }
        },
        version: {
            version_code: parsed.version_code,
            sku_base: parsed.sku_base,
            validation_status: final_name_es && final_name_en ? 'ready' : 'needs_review',
            final_base_name_es: final_name_es,
            final_base_name_en: final_name_en,
            version_attrs: (isPrivate && normalizedPrivateName)
                ? { private_label_client_name: normalizedPrivateName }
                : {}
        },
        sku: {
            sku_complete: data.code,
            color_code: data.color_code || parsed.color_code,
            status: data.status || 'ACTIVO',
            sap_description_original: data.sap_description || null,
            sap_description_recommended: sap_description_recommended,
            final_complete_name_es: final_name_es,
            final_complete_name_en: final_name_en,
            barcode_text: data.barcode_text || parsed.barcode_text || null,
            barcode_path: null,
            sku_attrs: {
                door_color_text: data.door_color_text || 'NA'
            }
        }
    }

    if (data._newFamily && parsed.familia_code) {
        payload.family = {
            family_code: parsed.familia_code,
            family_name: data._newFamily.name || parsed.familia_code,
            product_type: data._newFamily.product_type || null,
            use_destination: data._newFamily.use_destination || null,
            zone_home: data._newFamily.zone_home || null,
            manufacturing_process: data._newFamily.manufacturing_process || 'FABRICADO',
            assembled_default: data._newFamily.assembled_default ? true : false,
            rh_default: data._newFamily.rh_default ? true : false,
            allowed_lines: data._newFamily.allowed_lines || []
        }
    }

    if (!payload.reference.family_code) throw new Error("reference.family_code is missing")
    if (!payload.reference.reference_code) throw new Error("reference.reference_code is missing")
    if (!payload.version.version_code) throw new Error("version.version_code is missing")
    if (!payload.sku.sku_complete) throw new Error("sku.sku_complete is missing")
    if (!payload.sku.color_code) throw new Error("sku.color_code is missing")

    return payload;
}
export async function createProductAction(data: any) {
    if (!data.code) throw new Error('Code is required')

    const parsed = await parseProductCode(data.code, data.sap_description, data.rh_flag)

    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`) || []

    const workingProduct = {
        code: data.code,
        sap_description: data.sap_description,
        product_type: data.product_type || parsed.product_type,
        product_name: data.product_name,
        color_code: data.color_code || parsed.color_code,
        rh_flag: data.rh === 'RH' || parsed.rh === 'RH',
        rh: data.rh || parsed.rh || 'NA',
        assembled_flag: data.assembled_flag || parsed.assembled_flag,
        canto_puertas: normalizeCanto(data.canto_puertas),
        carb2: normalizeCarb2(data.carb2 || parsed.carb2 || 'NA'),
        line: data.line,
        use_destination: data.use_destination || parsed.use_destination,
        zone_home: data.zone_home || parsed.zone_home,
        commercial_measure: data.commercial_measure,
        accessory_text: data.accessory_text,
        designation: data.designation,
        bisagras: data.bisagras || parsed.bisagras || 'NA',
        special_label: data.special_label || parsed.special_label || 'NA',
        door_color_text: data.door_color_text || 'NA'
    }

    const evalResult = evaluateProductRules(workingProduct as any, rules)
    const final_name_es = evalResult.finalNameEs
    const sap_description_recommended = final_name_es.toUpperCase().substring(0, 40)

    const translateResult = await translateProductToEnglish(
        { ...evalResult.transformedProduct, final_name_es } as any,
        workingProduct.product_type || 'MUEBLE',
        evalResult.activeVariableIds
    )
    const final_name_en = translateResult.isValid ? translateResult.translatedName : ''
    if (data._newGlossaryTerms && Array.isArray(data._newGlossaryTerms)) {
        for (const term of data._newGlossaryTerms) {
            if (!term.es || !term.en) continue
            await dbQuery(`
                INSERT INTO public.glossary (term_es, term_en, active, priority, category)
                VALUES (
                    '${term.es.trim().replace(/'/g, "''")}', 
                    '${term.en.trim().replace(/'/g, "''")}', 
                    true, 
                    ${term.category === 'RESOLVED_TYPE' ? 20 : 10},
                    '${(term.category || 'TECHNICAL_TERM').toUpperCase()}'
                )
                ON CONFLICT (term_es) DO UPDATE SET 
                    term_en = EXCLUDED.term_en,
                    category = EXCLUDED.category
            `)
        }
    }

    // Private label is derived from the presence of a client name (no flag)
    const clientNameRaw = data.private_label_client_name ? String(data.private_label_client_name).trim() : ''
    const isPrivate = clientNameRaw !== '' && clientNameRaw.toUpperCase() !== 'NA'
    const clientName = isPrivate ? clientNameRaw : 'NA'
    const clientId = ''

    // Store client metadata whenever we have a valid private-label client name
    // (logo association is optional and does not affect private-label logic).
    if (isPrivate) {
        try {
            await createClientAction(clientNameRaw, data.private_label_logo_id ? String(data.private_label_logo_id) : undefined)
        } catch {
            // Non-blocking; private label still works without storing logo metadata
        }
    }

    const payload = buildCreateProductV6Payload(data, parsed, isPrivate, clientId, clientName, sap_description_recommended, final_name_es, final_name_en)

    if (data._newColor && (data.color_code || parsed.color_code)) {
        const cCode = data.color_code || parsed.color_code
        await upsertColorAction(cCode, data._newColor.name)
    }

    const { data: result, error } = await (supabaseServer as any).rpc('create_product_v6_transaction', { payload })
    if (error) throw new Error(`Transaction failed: ${error.message}`)

    // Propagar Isométrico
    if (data.isometric_path && parsed.familia_code && parsed.ref_code) {
        await dbQuery(`
            UPDATE public.product_references 
            SET isometric_path = '${String(data.isometric_path).replace(/'/g, "''")}', 
                isometric_asset_id = '${String(data.isometric_asset_id || '').replace(/'/g, "''")}',
                updated_at = NOW()
            WHERE family_code = '${parsed.familia_code.replace(/'/g, "''")}' 
              AND reference_code = '${parsed.ref_code.replace(/'/g, "''")}'
        `)
    }

    return { ...data, final_name_es, final_name_en, id: result?.sku_id }
}

export async function updateProductAction(id: string, data: any) {
    if (!id) throw new Error("Product ID is required")
    if (!data.code) throw new Error("Product code is required")

    const parsed = await parseProductCode(data.code, data.sap_description, data.rh_flag)
    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`) || []
    
    // Evaluate rules for the updated state
    const workingProduct = {
        ...data,
        rh_flag: data.rh === 'RH' || parsed.rh === 'RH',
        rh: data.rh || parsed.rh || 'NA'
    }
    const evalResult = evaluateProductRules(workingProduct as any, rules)
    const final_name_es = evalResult.finalNameEs
    const translateResult = await translateProductToEnglish(
        { ...evalResult.transformedProduct, final_name_es } as any,
        workingProduct.product_type || 'MUEBLE',
        evalResult.activeVariableIds
    )
    const final_name_en = translateResult.isValid ? translateResult.translatedName : ''

    // Prepare V6 payload
    const clientNameRaw = data.private_label_client_name ? String(data.private_label_client_name).trim() : ''
    const isPrivate = clientNameRaw !== '' && clientNameRaw.toUpperCase() !== 'NA'

    // Store client metadata whenever we have a valid private-label client name
    // (logo association is optional and does not affect private-label logic).
    if (isPrivate) {
        try {
            await createClientAction(clientNameRaw, data.private_label_logo_id ? String(data.private_label_logo_id) : undefined)
        } catch {
            // Non-blocking
        }
    }

    const payload = buildCreateProductV6Payload(
        data,
        parsed,
        isPrivate,
        '',
        clientNameRaw,
        final_name_es.toUpperCase().substring(0, 40),
        final_name_es,
        final_name_en
    )

    // Handle new color if provided
    if (data._newColor && (data.color_code || parsed.color_code)) {
        const cCode = data.color_code || parsed.color_code
        await upsertColorAction(cCode, data._newColor.name)
    }

    // Execute transactional update
    await dbQuery(`SELECT public.update_product_v6_transaction($1, $2)`, [id, JSON.stringify(payload)])

    revalidatePath('/products')
    revalidatePath(`/products/${id}`)
    
    // Return updated record for UI confirmation
    const rows = await dbQuery(`
        SELECT p.*, COALESCE(p.resolved_color_name, p.name_color_sap) as color_name 
        FROM public.v_ui_generate_list p
        WHERE p.id = $1
    `, [id])
    return rows?.[0] || null
}



export async function updateFamilyAction(code: string, data: any) {
    if (!code) throw new Error("Family code is required")
    await dbQuery(`
        UPDATE public.families SET
            family_name=${data.name ? `'${data.name.replace(/'/g, "''")}'` : 'NULL'},
            product_type=${data.product_type ? `'${data.product_type}'` : 'NULL'},
            use_destination=${data.use_destination ? `'${data.use_destination}'` : 'NULL'},
            zone_home=${data.zone_home ? `'${data.zone_home}'` : 'NULL'},
            allowed_lines=${formatPGArray(data.allowed_lines)},
            rh_default=${data.rh_default ? 'true' : 'false'},
            assembled_default=${data.assembled_default ? 'true' : 'false'},
            manufacturing_process=${data.manufacturing_process ? `'${data.manufacturing_process}'` : "'FABRICADO'"},
            updated_at=now()
        WHERE family_code='${code.replace(/'/g, "''")}'
    `)
    revalidatePath('/families')
    redirect('/families')
}

export async function deleteFamilyAction(code: string) {
    if (!code) throw new Error("Family code is required")
    await dbQuery(`DELETE FROM public.families WHERE family_code='${code.replace(/'/g, "''")}'`)
    revalidatePath('/families')
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
            SELECT *
            FROM public.v_ui_generate_list 
            WHERE final_complete_name_es IS NOT NULL 
        `
        
        if (ids && ids.length > 0) {
            const idList = ids.map(id => `'${id}'`).join(',')
            query += ` AND id IN (${idList})`
        }

        const rows = await dbQuery(query)
        if (!rows || rows.length === 0) return { success: true, count: 0, message: "No se encontraron productos para procesar." }

        const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
        const allProducts = rows.map((row: any) => mapRowToComposedProduct(row))

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

        const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`) || []

        for (const product of toTranslate) {
            const evalResult = evaluateProductRules(product as any, rules)
            const result = await translateProductToEnglish(
                { ...evalResult.transformedProduct, final_name_es: evalResult.finalNameEs } as any,
                product.product_type || 'MUEBLE',
                evalResult.activeVariableIds
            )
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
                WITH sku AS (
                    SELECT version_id FROM public.product_skus WHERE id = '${product.id}'
                ),
                upd_version AS (
                    UPDATE public.product_versions v
                    SET final_base_name_en = '${safeTranslated}',
                        validation_status = '${status}',
                        updated_at = now()
                    FROM sku
                    WHERE v.id = sku.version_id
                )
                UPDATE public.product_skus
                SET final_complete_name_en = '${safeTranslated}',
                    updated_at = now()
                WHERE id = '${product.id}'
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
        FROM public.product_references 
        WHERE line IS NOT NULL 
          AND line != '' 
          AND line NOT IN (SELECT name_color_sap FROM public.colors)
        ORDER BY line ASC
    `) || []
    
    const designations = await dbQuery(`SELECT DISTINCT designation FROM public.product_references WHERE designation IS NOT NULL AND designation != '' ORDER BY designation ASC`) || []
    const productTypes = await dbQuery(`SELECT DISTINCT product_type FROM public.families WHERE product_type IS NOT NULL AND product_type != '' ORDER BY product_type ASC`) || []
    const useDestinations = await dbQuery(`SELECT DISTINCT use_destination FROM public.families WHERE use_destination IS NOT NULL AND use_destination != '' ORDER BY use_destination ASC`) || []
    
    // Nuevas variables unicas
    const productNames = await dbQuery(`SELECT DISTINCT product_name as product_name FROM public.product_references WHERE product_name IS NOT NULL AND product_name != '' ORDER BY product_name ASC`) || []
    const commercialMeasures = await dbQuery(`SELECT DISTINCT commercial_measure FROM public.product_references WHERE commercial_measure IS NOT NULL AND commercial_measure != '' ORDER BY commercial_measure ASC`) || []
    const accessoryTexts = await dbQuery(`SELECT DISTINCT ref_attrs->>'accessory_text' as accessory_text FROM public.product_references WHERE ref_attrs->>'accessory_text' IS NOT NULL AND ref_attrs->>'accessory_text' != '' ORDER BY ref_attrs->>'accessory_text' ASC`) || []
    const bisagrasValues = await dbQuery(`SELECT DISTINCT ref_attrs->>'bisagras' as bisagras FROM public.product_references WHERE ref_attrs->>'bisagras' IS NOT NULL AND ref_attrs->>'bisagras' != '' ORDER BY ref_attrs->>'bisagras' ASC`) || []
    const carb2Values = await dbQuery(`SELECT DISTINCT ref_attrs->>'carb2' as carb2 FROM public.product_references WHERE ref_attrs->>'carb2' IS NOT NULL AND ref_attrs->>'carb2' != '' ORDER BY ref_attrs->>'carb2' ASC`) || []
    const specialLabels = await dbQuery(`SELECT DISTINCT special_label FROM public.product_references WHERE special_label IS NOT NULL AND special_label != '' ORDER BY special_label ASC`) || []
    const zoneHomes = await dbQuery(`SELECT DISTINCT zone_home FROM public.families WHERE zone_home IS NOT NULL AND zone_home != '' ORDER BY zone_home ASC`) || []
    const rhValues = await dbQuery(`SELECT DISTINCT ref_attrs->>'rh' as rh FROM public.product_references WHERE ref_attrs->>'rh' IS NOT NULL AND ref_attrs->>'rh' != '' ORDER BY ref_attrs->>'rh' ASC`) || []
    const cantoValues = await dbQuery(`SELECT DISTINCT ref_attrs->>'canto_puertas' as canto_puertas FROM public.product_references WHERE ref_attrs->>'canto_puertas' IS NOT NULL AND ref_attrs->>'canto_puertas' != '' ORDER BY ref_attrs->>'canto_puertas' ASC`) || []
    
    const colors = await dbQuery(`SELECT code_4dig as code_color, name_color_sap FROM public.colors ORDER BY code_4dig ASC`) || []

    return {
        lines: lines.map((r: any) => r.line),
        designations: designations.map((r: any) => r.designation),
        productTypes: productTypes.map((r: any) => r.product_type),
        useDestinations: useDestinations.map((r: any) => r.use_destination),
        productNames: productNames.map((r: any) => r.product_name),
        commercialMeasures: commercialMeasures.map((r: any) => r.commercial_measure),
        accessoryTexts: accessoryTexts.map((r: any) => r.accessory_text),
        bisagras: ['NA', ...bisagrasValues.map((r: any) => r.bisagras).filter((v: string) => v !== 'NA')],
        carb2: ['NA', ...carb2Values.map((r: any) => r.carb2).filter((v: string) => v !== 'NA')],
        specialLabels: ['NA', ...specialLabels.map((r: any) => r.special_label).filter((v: string) => v !== 'NA')],
        zoneHomes: zoneHomes.map((r: any) => r.zone_home),
        rh: ['NA', ...rhValues.map((r: any) => r.rh).filter((v: string) => v !== 'NA')],
        cantoPuertas: ['NA', ...cantoValues.map((r: any) => r.canto_puertas).filter((v: string) => v !== 'NA')],
        colors: colors.map((r: any) => ({ code: r.code_color, name: r.name_color_sap }))
    }
}

export async function checkProductExistsAction(code?: string, sapDesc?: string) {
    if (!code && !sapDesc) return null

    let codeSafe = code ? String(code).trim().replace(/'/g, "''") : ""
    let sapDescSafe = sapDesc ? String(sapDesc).trim().replace(/'/g, "''") : ""

    let conditions = []
    if (codeSafe) conditions.push(`sku_complete = '${codeSafe}'`)
    if (sapDescSafe) conditions.push(`sap_description_original = '${sapDescSafe}'`)

    if (conditions.length === 0) return null

    const res = await dbQuery(`
        SELECT id, sku_complete as code, sap_description_original as sap_description 
        FROM public.product_skus 
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
    
    const defaults = ["CHILEMAT", "D-ACQUA", "PROMART", "FERMETAL"].map(n => ({ id: n, name: n, logo_id: null }))
    
    const combined = [
        ...fromClients, 
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

    const nameNorm = String(name).trim().toUpperCase()
    if (!nameNorm || nameNorm === 'NA') throw new Error("Nombre del cliente requerido")

    // Check if client exists (case-insensitive)
    const existing = await dbQuery(
        `SELECT id, name, logo_asset_id FROM public.clients WHERE UPPER(name) = $1 LIMIT 1`,
        [nameNorm]
    )
    if (existing && existing.length > 0) {
        const row = existing[0]
        // If a logo was provided and we don't have one stored yet, store it (best-effort)
        if (logoAssetId && !row.logo_asset_id) {
            try {
                await dbQuery(`UPDATE public.clients SET logo_asset_id = $1 WHERE id = $2`, [logoAssetId, row.id])
            } catch {
                // ignore
            }
        }
        return row
    }

    const res = await dbQuery(`
        INSERT INTO public.clients (id, name, logo_asset_id, created_at)
        VALUES (gen_random_uuid(), $1, $2, now())
        RETURNING id, name
    `, [nameNorm, logoAssetId || null])
    
    if (!res || res.length === 0) throw new Error("No se pudo crear el cliente")
    return res[0]
}
export async function saveGlossaryTermsAction(terms: { term_es: string, term_en: string, category: string, priority: number }[]) {
    if (!terms || terms.length === 0) return { success: true }
    
    try {
        const normalizeGlossaryInput = (t: { term_es: string, term_en: string, category: string, priority: number }) => {
            const rawEs = String(t.term_es || '').trim().toUpperCase()
            const rawEn = String(t.term_en || '').trim().toUpperCase()
            let category = String(t.category || 'TECHNICAL_TERM').trim().toUpperCase()
            let termEs = rawEs

            const resolvedTypePrefix = 'RESOLVED_TYPE_MISSING:'
            if (termEs.startsWith(resolvedTypePrefix)) {
                termEs = termEs.slice(resolvedTypePrefix.length).trim()
                category = 'RESOLVED_TYPE'
            }

            return { termEs, termEn: rawEn, category, priority: t.priority }
        }

        for (const t of terms) {
            const n = normalizeGlossaryInput(t)
            await dbQuery(`
                INSERT INTO public.glossary (term_es, term_en, category, priority, active)
                VALUES ('${n.termEs.replace(/'/g, "''")}', '${n.termEn.replace(/'/g, "''")}', '${n.category.replace(/'/g, "''")}', ${n.priority}, true)
                ON CONFLICT (term_es) DO UPDATE 
                SET term_en = EXCLUDED.term_en,
                    category = EXCLUDED.category,
                    priority = EXCLUDED.priority;
            `)
        }
        resetGlossaryCache()
        revalidatePath('/products/glossary')
        revalidatePath('/pending')
        revalidatePath('/')
        return { success: true, message: `Se guardaron ${terms.length} términos correctamente.` }
    } catch (error: any) {
        console.error("Error saving glossary terms:", error)
        return { success: false, message: `Error al guardar términos: ${error.message}` }
    }
}

export async function getDiagnosticInfoAction() {
    const hasToken = !!process.env.SUPABASE_ACCESS_TOKEN;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    let rulesCount = 0;
    let error = null;
    try {
        const res = await dbQuery(`SELECT count(*) as count FROM public.rules WHERE enabled = true`);
        rulesCount = res?.[0]?.count || 0;
    } catch (e: any) {
        error = e.message;
    }
    return { 
        hasToken, 
        hasServiceKey,
        rulesCount, 
        error, 
        envKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE')) 
    };
}


export async function executeMassImportAction(payload: any[]) {
    try {
        const query = `SELECT bulk_import_products('${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb)`;
        const res = await dbQuery(query);
        return { success: true, data: res };
    } catch (error: any) {
        console.error('Error in executeMassImportAction:', error);
        return { success: false, error: error.message };
    }
}

export async function batchCreateColorVariantsAction(
    originalProduct: any,
    colors: { code: string, name: string, isNew: boolean }[]
) {
    const results = []
    
    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`) || []
    
    for (const color of colors) {
        try {
            if (color.isNew) {
                await upsertColorAction(color.code, color.name)
            }
            
            const skuParts = originalProduct.code.split('-')
            skuParts[skuParts.length - 1] = color.code.padStart(4, '0')
            const newSkuCode = skuParts.join('-')
            
            const exists = await checkProductExistsAction(newSkuCode)
            if (exists) {
                results.push({ color_code: color.code, color_name: color.name, sku: newSkuCode, success: false, error: 'SKU ya existe en el catálogo.' })
                continue
            }
            
            const originalColorName = originalProduct.color_name || ''
            let newSapDesc = originalProduct.sap_description || ''
            if (originalColorName && newSapDesc) {
                newSapDesc = newSapDesc.replace(new RegExp(originalColorName, 'gi'), color.name)
            } else {
                newSapDesc = newSapDesc + ' ' + color.name
            }

            const workingProduct = {
                ...originalProduct,
                code: newSkuCode,
                color_code: color.code,
                color_name: color.name,
                sap_description: newSapDesc.trim().toUpperCase()
            }
            
            const parsed = await parseProductCode(newSkuCode, workingProduct.sap_description, workingProduct.rh === 'RH')
            const evalResult = evaluateProductRules(workingProduct as any, rules)
            const final_name_es = evalResult.finalNameEs
            const sap_description_recommended = final_name_es.toUpperCase().substring(0, 40)
            
            const translateResult = await translateProductToEnglish(
                { ...evalResult.transformedProduct, final_name_es } as any,
                workingProduct.product_type || 'MUEBLE',
                evalResult.activeVariableIds
            )
            const final_name_en = translateResult.isValid ? translateResult.translatedName : ''
            
            const clientNameRaw = originalProduct.private_label_client_name ? String(originalProduct.private_label_client_name).trim() : ''
            const isPrivate = clientNameRaw !== '' && clientNameRaw.toUpperCase() !== 'NA'
            
            const payload = buildCreateProductV6Payload(
                workingProduct, 
                parsed, 
                isPrivate, 
                '', 
                clientNameRaw, 
                sap_description_recommended, 
                final_name_es, 
                final_name_en
            )
            
            payload.sku.barcode_text = null
            
            const { data: result, error } = await (supabaseServer as any).rpc('create_product_v6_transaction', { payload })
            if (error) throw new Error(`Transaction failed: ${error.message}`)
            
            results.push({ 
                color_code: color.code, 
                color_name: color.name, 
                sku: newSkuCode, 
                success: true,
                product: { ...workingProduct, final_name_es, final_name_en, id: result?.sku_id }
            })
            
        } catch (error: any) {
            results.push({ color_code: color.code, color_name: color.name, sku: '', success: false, error: error.message })
        }
    }
    
    return { results }
}

