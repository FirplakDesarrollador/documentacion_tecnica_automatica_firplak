'use server'

import { dbQuery } from '@/lib/supabase'
import { Product } from '@prisma/client'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { translateProductToEnglish } from '@/lib/engine/translator'
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
        return await translateProductToEnglish(ctx, targetEntity, undefined, force)
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

export async function checkFamilyExists(code: string) {
    if (!code) return true
    const parsed = await parseProductCode(code, '', false)
    if (!parsed.familia_code) return true

    const rows = await dbQuery(`SELECT code FROM public.familias WHERE code = '${parsed.familia_code.replace(/'/g, "''")}' LIMIT 1`)
    return rows && rows.length > 0
}

export async function checkFamilyExistsAction(code: string) {
    return await checkFamilyExists(code);
}

export async function upsertFamilyAction(data: any) {
    if (!data.code) throw new Error("Family code is required")
    
    const query = `
        INSERT INTO public.familias (
            code, name, product_type, use_destination, zone_home, 
            allowed_lines, rh_default, assembled_default
        )
        VALUES (
            '${data.code.replace(/'/g, "''")}', 
            ${data.name ? `'${data.name.replace(/'/g, "''")}'` : 'NULL'}, 
            ${data.product_type ? `'${data.product_type}'` : 'NULL'}, 
            ${data.use_destination ? `'${data.use_destination}'` : 'NULL'}, 
            ${data.zone_home ? `'${data.zone_home}'` : 'NULL'},
            ${formatPGArray(data.allowed_lines)},
            ${data.rh_default ? 'true' : 'false'},
            ${data.assembled_default ? 'true' : 'false'}
        )
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            product_type = EXCLUDED.product_type,
            use_destination = EXCLUDED.use_destination,
            zone_home = EXCLUDED.zone_home,
            allowed_lines = EXCLUDED.allowed_lines,
            rh_default = EXCLUDED.rh_default,
            assembled_default = EXCLUDED.assembled_default,
            updated_at = now()
        RETURNING *
    `
    const rows = await dbQuery(query)
    revalidatePath('/families')
    return rows ? rows[0] : null
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

    // New Glossary Terms (Adaptive Learning)
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

    // Lógica de redondeo especial: <= 0.5 hacia abajo, >= 0.6 hacia arriba
    function roundToOneDecimal(val: number | string | null) {
        if (val === null || val === undefined || val === '') return 'NULL'
        const num = parseFloat(String(val))
        if (isNaN(num)) return 'NULL'
        return (Math.floor(num * 10 + 0.4) / 10).toFixed(1)
    }

    // Conversiones con redondeo especial
    const w_in = data.width_cm ? roundToOneDecimal(parseFloat(data.width_cm) / 2.54) : 'NULL'
    const d_in = data.depth_cm ? roundToOneDecimal(parseFloat(data.depth_cm) / 2.54) : 'NULL'
    const h_in = data.height_cm ? roundToOneDecimal(parseFloat(data.height_cm) / 2.54) : 'NULL'
    const w_lb = data.weight_kg ? roundToOneDecimal(parseFloat(data.weight_kg) * 2.20462) : 'NULL'

    // Normalización de Marca Propia
    const isPrivate = !!data.private_label_flag
    const clientName = isPrivate ? (data.private_label_client_name || 'NA') : 'NA'

    const result = await dbQuery(`
        INSERT INTO public.cabinet_products (
            code, sap_description, product_type, cabinet_name, color_code, rh_flag, rh,
            assembled_flag, canto_puertas, carb2, line, use_destination, zone_home, 
            commercial_measure, accessory_text, designation, width_cm, depth_cm, height_cm, weight_kg, 
            width_in, depth_in, height_in, weight_lb,
            stacking_max, familia_code, ref_code, version_code, sku_base, sku_servicios_ref,
            final_name_es, final_name_en, status, validation_status,
            private_label_flag, private_label_client_name, private_label_client_id,
            bisagras, special_label, barcode_text, isometric_path, isometric_asset_id, door_color_text
        ) VALUES (
            ${esc(data.code)}, ${esc(data.sap_description)}, ${esc(data.product_type || parsed.product_type)}, 
            ${esc(data.cabinet_name)}, ${esc(data.color_code || parsed.color_code)}, ${data.rh === 'RH' || parsed.rh === 'RH' ? 'true' : 'false'}, ${esc(data.rh || parsed.rh || 'NA')},
            ${data.assembled_flag || parsed.assembled_flag ? 'true' : 'false'}, ${esc(normalizeCanto(data.canto_puertas))}, 
            ${esc(data.carb2 || parsed.carb2 || 'NA')},
            ${esc(data.line)}, ${esc(data.use_destination || parsed.use_destination)}, ${esc(data.zone_home || parsed.zone_home)}, 
            ${esc(data.commercial_measure)}, ${esc(data.accessory_text)}, ${esc(data.designation)}, 
            ${data.width_cm ? parseFloat(data.width_cm) : 'NULL'}, ${data.depth_cm ? parseFloat(data.depth_cm) : 'NULL'}, 
            ${data.height_cm ? parseFloat(data.height_cm) : 'NULL'}, ${data.weight_kg ? parseFloat(data.weight_kg) : 'NULL'},
            ${w_in}, ${d_in}, ${h_in}, ${w_lb},
            ${data.stacking_max ? parseInt(data.stacking_max) : 'NULL'}, ${esc(parsed.familia_code)}, ${esc(parsed.ref_code)}, 
            ${esc(parsed.version_code)}, ${esc(parsed.sku_base)}, ${esc(data.code)},
            ${esc(data.final_name_es)}, ${esc(data.final_name_en)}, ${esc(data.status || 'ACTIVO')}, 'ready',
            ${isPrivate ? 'true' : 'false'}, ${esc(clientName)}, ${esc(clientId)},
            ${esc(data.bisagras || parsed.bisagras || 'NA')}, ${esc(data.special_label || parsed.special_label || 'NA')},
            ${esc(data.barcode_text || parsed.barcode_text)}, ${esc(data.isometric_path || parsed.isometric_path)},
            ${esc(data.isometric_asset_id)}, ${esc(data.door_color_text || 'NA')}
        )
        ON CONFLICT (code) DO UPDATE SET updated_at = now()
        RETURNING *
    `)

    // Propagación de Isométrico a la misma familia y referencia
    if (data.isometric_path && parsed.familia_code && parsed.ref_code) {
        await dbQuery(`
            UPDATE public.cabinet_products 
            SET isometric_path = ${esc(data.isometric_path)}, 
                isometric_asset_id = ${esc(data.isometric_asset_id)}
            WHERE familia_code = ${esc(parsed.familia_code)} 
              AND ref_code = ${esc(parsed.ref_code)}
        `)
    }

    if (result && result.length > 0) {
        const rows = await dbQuery(`
            SELECT p.*, c.name_color_sap as color_name
            FROM public.cabinet_products p
            LEFT JOIN public.colors c ON p.color_code = c.code_4dig
            WHERE p.id = '${result[0].id}'
        `);
        return rows?.[0] || result[0];
    }
    return null;
}

export async function updateProductAction(id: string, data: any) {
    if (!data.code) throw new Error('Code is required')
    const parsed = await parseProductCode(data.code, data.sap_description, data.rh_flag)
    
    // New Glossary Terms (Adaptive Learning) - Same as Create
    if (data._newGlossaryTerms && Array.isArray(data._newGlossaryTerms)) {
        for (const term of data._newGlossaryTerms) {
            if (!term.es || !term.en) continue
            await dbQuery(`
                INSERT INTO public.glossary (term_es, term_en, active, priority, category)
                VALUES (
                    '${term.es.toUpperCase().trim().replace(/'/g, "''")}', 
                    '${term.en.toUpperCase().trim().replace(/'/g, "''")}', 
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

    function esc(v: any) {
        if (v === null || v === undefined) return 'NULL'
        if (typeof v === 'boolean') return v ? 'true' : 'false'
        if (typeof v === 'number') return String(v)
        return `'${String(v).replace(/'/g, "''")}'`
    }

    // Lógica de redondeo especial: <= 0.5 hacia abajo, >= 0.6 hacia arriba
    function roundToOneDecimal(val: number | string | null) {
        if (val === null || val === undefined || val === '') return 'NULL'
        const num = parseFloat(String(val))
        if (isNaN(num)) return 'NULL'
        return (Math.floor(num * 10 + 0.4) / 10).toFixed(1)
    }

    // Conversiones con redondeo especial
    const w_in = data.width_cm ? roundToOneDecimal(parseFloat(data.width_cm) / 2.54) : 'NULL'
    const d_in = data.depth_cm ? roundToOneDecimal(parseFloat(data.depth_cm) / 2.54) : 'NULL'
    const h_in = data.height_cm ? roundToOneDecimal(parseFloat(data.height_cm) / 2.54) : 'NULL'
    const w_lb = data.weight_kg ? roundToOneDecimal(parseFloat(data.weight_kg) * 2.20462) : 'NULL'

    // Normalización de Marca Propia
    const isPrivate = !!data.private_label_flag
    const clientName = isPrivate ? (data.private_label_client_name || 'NA') : 'NA'

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

    const result = await dbQuery(`
        UPDATE public.cabinet_products SET
            code=${esc(data.code)}, sap_description=${esc(data.sap_description)}, product_type=${esc(data.product_type || parsed.product_type)},
            cabinet_name=${esc(data.cabinet_name)}, color_code=${esc(data.color_code || parsed.color_code)},
            rh_flag=${data.rh === 'RH' || parsed.rh === 'RH' ? 'true' : 'false'}, rh=${esc(data.rh || parsed.rh || 'NA')}, assembled_flag=${data.assembled_flag ? 'true' : 'false'},
            canto_puertas=${esc(normalizeCanto(data.canto_puertas))}, carb2=${esc(data.carb2)}, line=${esc(data.line || parsed.line)},
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
            private_label_flag=${isPrivate ? 'true' : 'false'},
            private_label_client_name=${esc(clientName)},
            private_label_client_id=${esc(data.private_label_client_id)},
            isometric_path=${esc(data.isometric_path)},
            isometric_asset_id=${esc(data.isometric_asset_id)},
            door_color_text=${esc(data.door_color_text || 'NA')},
            validation_status='ready',
            updated_at=now()
        WHERE id='${id}'
        RETURNING *
    `)

    // Propagación de Isométrico a la misma familia y referencia
    if (data.isometric_path && parsed.familia_code && parsed.ref_code) {
        await dbQuery(`
            UPDATE public.cabinet_products 
            SET isometric_path = ${esc(data.isometric_path)}, 
                isometric_asset_id = ${esc(data.isometric_asset_id)}
            WHERE familia_code = ${esc(parsed.familia_code)} 
              AND ref_code = ${esc(parsed.ref_code)}
        `)
    }

    if (result && result.length > 0) {
        const rows = await dbQuery(`
            SELECT p.*, c.name_color_sap as color_name
            FROM public.cabinet_products p
            LEFT JOIN public.colors c ON p.color_code = c.code_4dig
            WHERE p.id = '${result[0].id}'
        `);
        return rows?.[0] || result[0];
    }
    return null;
}

export async function massUpdateProducts(ids: string[], updateData: any) {
    if (!ids || ids.length === 0) return

    const setClauses: string[] = []
    if (updateData.canto_puertas !== undefined) setClauses.push(`canto_puertas='${String(normalizeCanto(updateData.canto_puertas)).replace(/'/g, "''")}'`)
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
            allowed_lines=${formatPGArray(data.allowed_lines)},
            rh_default=${data.rh_default ? 'true' : 'false'},
            assembled_default=${data.assembled_default ? 'true' : 'false'},
            updated_at=now()
        WHERE code='${code.replace(/'/g, "''")}'
    `)
    revalidatePath('/families')
    redirect('/families')
}

export async function deleteFamilyAction(code: string) {
    if (!code) throw new Error("Family code is required")
    await dbQuery(`DELETE FROM public.familias WHERE code='${code.replace(/'/g, "''")}'`)
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
            SELECT 
                id, code, product_type, designation, cabinet_name, line,
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
    const cabinetNames = await dbQuery(`SELECT DISTINCT cabinet_name FROM public.cabinet_products WHERE cabinet_name IS NOT NULL AND cabinet_name != '' ORDER BY cabinet_name ASC`) || []
    const commercialMeasures = await dbQuery(`SELECT DISTINCT commercial_measure FROM public.cabinet_products WHERE commercial_measure IS NOT NULL AND commercial_measure != '' ORDER BY commercial_measure ASC`) || []
    const accessoryTexts = await dbQuery(`SELECT DISTINCT accessory_text FROM public.cabinet_products WHERE accessory_text IS NOT NULL AND accessory_text != '' ORDER BY accessory_text ASC`) || []
    const bisagrasValues = await dbQuery(`SELECT DISTINCT bisagras FROM public.cabinet_products WHERE bisagras IS NOT NULL AND bisagras != '' ORDER BY bisagras ASC`) || []
    const carb2Values = await dbQuery(`SELECT DISTINCT carb2 FROM public.cabinet_products WHERE carb2 IS NOT NULL AND carb2 != '' ORDER BY carb2 ASC`) || []
    const specialLabels = await dbQuery(`SELECT DISTINCT special_label FROM public.cabinet_products WHERE special_label IS NOT NULL AND special_label != '' ORDER BY special_label ASC`) || []
    const zoneHomes = await dbQuery(`SELECT DISTINCT zone_home FROM public.cabinet_products WHERE zone_home IS NOT NULL AND zone_home != '' ORDER BY zone_home ASC`) || []
    const rhValues = await dbQuery(`SELECT DISTINCT rh FROM public.cabinet_products WHERE rh IS NOT NULL AND rh != '' ORDER BY rh ASC`) || []
    const cantoValues = await dbQuery(`SELECT DISTINCT canto_puertas FROM public.cabinet_products WHERE canto_puertas IS NOT NULL AND canto_puertas != '' ORDER BY canto_puertas ASC`) || []
    
    const colors = await dbQuery(`SELECT code_4dig as code_color, name_color_sap FROM public.colors ORDER BY code_4dig ASC`) || []

    return {
        lines: lines.map((r: any) => r.line),
        designations: designations.map((r: any) => r.designation),
        productTypes: productTypes.map((r: any) => r.product_type),
        useDestinations: useDestinations.map((r: any) => r.use_destination),
        cabinetNames: cabinetNames.map((r: any) => r.cabinet_name),
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
                VALUES ('${t.term_es.replace(/'/g, "''")}', '${t.term_en.replace(/'/g, "''")}', '${t.category}', ${t.priority}, true)
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
