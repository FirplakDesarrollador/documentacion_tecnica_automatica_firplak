'use server'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { dbQuery, supabaseServer } from '@/lib/supabase'
import { resetGlossaryCache } from '@/lib/engine/translator'
import { computeNameWithNamingComponents } from '@/lib/engine/namingComponentsEngine'
import { parseProductCode } from '@/lib/engine/codeParser'
import {
    markNamingStaleForColor,
    markNamingStaleForFamilies,
    markNamingStaleForGlossaryTerms,
    processNamingJobsInline,
} from '@/lib/engine/namingQueue'
import { upsertVersionAction } from '@/app/rules/versions/actions'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function normalizeCanto(val: unknown) {
    if (val === null || val === undefined || val === '' || val === 'false') return 'CANTO 2 MM'
    const clean = String(val).toUpperCase().replace(/\s+/g, '')
    if (clean === 'CANTO0.45MM') return 'CANTO 0.45 MM'
    if (clean === 'CANTO1.5MM') return 'CANTO 1.5 MM'
    if (clean === 'CANTO2MM') return 'CANTO 2 MM'
    return String(val)
}

function normalizeCarb2(val: unknown) {
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

async function computeProductNameByNamingType(product: any, namingType: string) {
    const result = await computeNameWithNamingComponents(product as any, namingType)

    return {
        final_name_es: result.finalNameEs,
        final_name_en: result.storableFinalNameEn,
        evalResult: result.evaluation,
        translateResult: result.translation,
    }
}

export async function parseProductCodeAction(code: string, sapDesc: string, rhFlag: boolean) {
    return await parseProductCode(code, sapDesc, rhFlag)
}

export async function translateAction(nameEs: string, ctx?: any, force: boolean = false) {
    if (ctx) {
        const result = await computeNameWithNamingComponents({ ...ctx, final_name_es: nameEs } as any, 'final_complete_name', force)
        return result.translation
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

export async function checkVersionExistsAction(versionCode: string) {
    if (!versionCode) return true
    const rows = await dbQuery(`SELECT version_code FROM public.global_version_rules WHERE version_code = '${versionCode.replace(/'/g, "''")}' LIMIT 1`)
    return rows && rows.length > 0
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
    await markNamingStaleForFamilies([data.code], null, 'family_upsert')
    await processNamingJobsInline()
    revalidatePath('/configuration/families')
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
    await markNamingStaleForColor(code4dig, null, 'color_upsert')
    await processNamingJobsInline()
    return rows ? rows[0] : null
}

function buildCreateProductV6Payload(
    data: any,
    parsed: any,
    isPrivate: boolean,
    clientName: string | null,
    sap_description_recommended_es: string,
    sap_description_recommended_en: string,
    final_base_name_es: string,
    final_base_name_en: string,
    final_complete_name_es: string,
    final_complete_name_en: string,
    existingRefAttrs: Record<string, any> = {}
) {
    const normalizedPrivateName = (clientName && String(clientName).trim() !== '' && String(clientName).toUpperCase() !== 'NA')
        ? String(clientName).trim()
        : null

    // ref_attrs = verdad de la referencia (solo del form + existente, SIN overrides de versión)
    const refAttrs: Record<string, any> = {
        carb2: data.carb2 ? normalizeCarb2(data.carb2) : (existingRefAttrs.carb2 || 'NA'),
        bisagras: data.bisagras || (existingRefAttrs.bisagras || 'NA'),
        canto_puertas: data.canto_puertas ? normalizeCanto(data.canto_puertas) : (existingRefAttrs.canto_puertas || 'NA'),
        accessory_text: (data.accessory_text !== undefined && data.accessory_text !== '')
            ? data.accessory_text : (existingRefAttrs.accessory_text || null),
        rh: data.rh || (existingRefAttrs.rh || 'NA'),
        assembled_flag: data.assembled_flag !== undefined
            ? !!data.assembled_flag : (existingRefAttrs.assembled_flag || false),
        product_type: data.product_type || (existingRefAttrs.product_type || null),
        door_color_text: data.door_color_text || (existingRefAttrs.door_color_text || 'NA'),
    }

    // version_attrs = overrides del version-code (MRH) + GVR + marca propia
    const versionAttrs: Record<string, any> = {};
    if (isPrivate && normalizedPrivateName) {
        versionAttrs.private_label_client_name = normalizedPrivateName;
    }
    if (parsed._version_overrides) {
        Object.assign(versionAttrs, parsed._version_overrides);
    }

     
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
            ref_attrs: refAttrs
        },
        version: {
            version_code: parsed.version_code,
            sku_base: parsed.sku_base,
            validation_status: final_base_name_es && final_base_name_en && final_complete_name_es && final_complete_name_en ? 'ready' : 'needs_review',
            final_base_name_es,
            final_base_name_en,
            version_attrs: versionAttrs
        },
        sku: {
            sku_complete: data.code,
            color_code: data.color_code || parsed.color_code,
            status: data.status || 'ACTIVO',
            sap_description_original: data.sap_description || null,
            sap_description_recommended_es,
            sap_description_recommended_en,
            final_complete_name_es,
            final_complete_name_en,
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

    // Apply version overrides (MRH, GVR) so naming rules use the version-detected values
    if (parsed._version_overrides && Object.keys(parsed._version_overrides).length > 0) {
        Object.assign(workingProduct, parsed._version_overrides);
        workingProduct.rh_flag = workingProduct.rh === 'RH';
    }

    const baseName = await computeProductNameByNamingType(workingProduct, 'final_base_name')
    const completeName = await computeProductNameByNamingType(workingProduct, 'final_complete_name')
    const sapName = await computeProductNameByNamingType(workingProduct, 'sap_description_recommended')
    const sap_description_recommended_es = sapName.final_name_es || completeName.final_name_es
    const sap_description_recommended_en = sapName.final_name_en || completeName.final_name_en
    const final_name_es = completeName.final_name_es
    const final_name_en = completeName.final_name_en
    let insertedGlossaryTerms = false
    const glossaryTermsForStale: { termEs: string; category?: string | null }[] = []
    if (data._newGlossaryTerms && Array.isArray(data._newGlossaryTerms)) {
        for (const term of data._newGlossaryTerms) {
            if (!term.es || !term.en) continue
            insertedGlossaryTerms = true
            glossaryTermsForStale.push({
                termEs: term.es,
                category: term.category || 'TECHNICAL_TERM',
            })
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
    const clientName = isPrivate ? clientNameRaw : null

    // Store client metadata whenever we have a valid private-label client name
    // (logo association is optional and does not affect private-label logic).
    if (isPrivate) {
        try {
            await createClientAction(clientNameRaw, data.private_label_logo_id ? String(data.private_label_logo_id) : undefined)
        } catch {
            // Non-blocking; private label still works without storing logo metadata
        }
    }

    // Consultar ref_attrs existente para preservar la verdad de la referencia
    let existingRefAttrs: Record<string, any> = {};
    if (parsed.familia_code && parsed.ref_code) {
        try {
            const refRows = await dbQuery(
                `SELECT ref_attrs FROM public.product_references 
                 WHERE family_code = $1 AND reference_code = $2 LIMIT 1`,
                [parsed.familia_code, parsed.ref_code]
            );
            if (refRows && refRows.length > 0) {
                const raw = refRows[0].ref_attrs;
                existingRefAttrs = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
            }
        } catch (e) {
            console.error('createProductAction: error querying existing ref_attrs', e);
        }
    }

    const payload = buildCreateProductV6Payload(
        data,
        parsed,
        isPrivate,
        clientName,
        sap_description_recommended_es,
        sap_description_recommended_en,
        baseName.final_name_es,
        baseName.final_name_en,
        completeName.final_name_es,
        completeName.final_name_en,
        existingRefAttrs
    )

    if (data._newColor && (data.color_code || parsed.color_code)) {
        const cCode = data.color_code || parsed.color_code
        await upsertColorAction(cCode, data._newColor.name)
    }

    if (data._newVersion) {
        await upsertVersionAction({
            version_code: data._newVersion.version_code,
            version_description: data._newVersion.version_description,
            automatic_version_rules: data._newVersion.automatic_version_rules || {},
            product_types: data._newVersion.product_types || [],
            status: 'ACTIVO',
            isNew: true
        })
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

    if (insertedGlossaryTerms) {
        resetGlossaryCache()
        await markNamingStaleForGlossaryTerms(glossaryTermsForStale, 'product_create_glossary_terms')
        await processNamingJobsInline()
    }

    return { ...data, final_name_es, final_name_en, id: result?.sku_id }
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
    await markNamingStaleForFamilies([code], null, 'family_update')
    await processNamingJobsInline()
    revalidatePath('/configuration/families')
    redirect('/families')
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
        const totalMissingTerms: string[] = []
        const updatedProducts: { id: string, final_name_en: string }[] = []

        for (const product of toTranslate) {
            const baseResult = await computeNameWithNamingComponents(product as any, 'final_base_name')
            const completeResult = await computeNameWithNamingComponents(product as any, 'final_complete_name')
            const translatedName = completeResult.finalNameEn
            const missingTerms = [...new Set([...baseResult.missingTerms, ...completeResult.missingTerms])]
            const isValid = baseResult.isValid && completeResult.isValid

            if (missingTerms.length > 0) {
                totalMissingTerms.push(...missingTerms)
            }

            // Block update if there are critical missing terms with translate strategy
            if (!isValid && missingTerms.length > 0) {
                updatedProducts.push({ id: product.id, final_name_en: '' })
                updatedCount++
                continue
            }

            const status = isValid ? 'ready' : 'needs_review'
            const safeBaseTranslated = baseResult.storableFinalNameEn.replace(/'/g, "''")
            const safeCompleteTranslated = completeResult.storableFinalNameEn.replace(/'/g, "''")

            await dbQuery(`
                WITH sku AS (
                    SELECT version_id FROM public.product_skus WHERE id = '${product.id}'
                ),
                upd_version AS (
                    UPDATE public.product_versions v
                    SET final_base_name_en = '${safeBaseTranslated}',
                        validation_status = '${status}',
                        updated_at = now()
                    FROM sku
                    WHERE v.id = sku.version_id
                )
                UPDATE public.product_skus
                SET final_complete_name_en = '${safeCompleteTranslated}',
                    updated_at = now()
                WHERE id = '${product.id}'
            `)

            updatedCount++
            updatedProducts.push({ id: product.id, final_name_en: completeResult.storableFinalNameEn || translatedName })
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

    } catch (error) {
        console.error("Translation Action Error:", error)
        return { 
            success: false, 
            message: `Error en el motor de traducción: ${(error as Error).message || 'Error desconocido'}` 
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
    
    const doorColorTextValues = await dbQuery(`SELECT DISTINCT ref_attrs->>'door_color_text' as door_color_text FROM public.product_references WHERE ref_attrs->>'door_color_text' IS NOT NULL AND ref_attrs->>'door_color_text' != '' ORDER BY ref_attrs->>'door_color_text' ASC`) || []
    
    const versionLabelValues = await dbQuery(`SELECT DISTINCT version_label FROM public.product_versions WHERE version_label IS NOT NULL AND version_label != '' ORDER BY version_label ASC`) || []
    
    const colors = await dbQuery(`SELECT code_4dig as code_color, name_color_sap FROM public.colors ORDER BY code_4dig ASC`) || []

    return {
        lines: lines.map((r: Record<string, unknown>) => r.line as string),
        designations: designations.map((r: Record<string, unknown>) => r.designation as string),
        productTypes: productTypes.map((r: Record<string, unknown>) => r.product_type as string),
        useDestinations: useDestinations.map((r: Record<string, unknown>) => r.use_destination as string),
        productNames: productNames.map((r: Record<string, unknown>) => r.product_name as string),
        commercialMeasures: commercialMeasures.map((r: Record<string, unknown>) => r.commercial_measure as string),
        accessoryTexts: accessoryTexts.map((r: Record<string, unknown>) => r.accessory_text as string),
        bisagras: ['NA', ...bisagrasValues.map((r: Record<string, unknown>) => r.bisagras as string).filter((v: string) => v !== 'NA')],
        carb2: ['NA', ...carb2Values.map((r: Record<string, unknown>) => r.carb2 as string).filter((v: string) => v !== 'NA')],
        specialLabels: ['NA', ...specialLabels.map((r: Record<string, unknown>) => r.special_label as string).filter((v: string) => v !== 'NA')],
        zoneHomes: zoneHomes.map((r: Record<string, unknown>) => r.zone_home as string),
        rh: ['NA', ...rhValues.map((r: Record<string, unknown>) => r.rh as string).filter((v: string) => v !== 'NA')],
        cantoPuertas: ['NA', ...cantoValues.map((r: Record<string, unknown>) => r.canto_puertas as string).filter((v: string) => v !== 'NA')],
        doorColorTexts: ['NA', ...doorColorTextValues.map((r: Record<string, unknown>) => r.door_color_text as string).filter((v: string) => v !== 'NA')],
        versionLabels: ['NA', ...versionLabelValues.map((r: Record<string, unknown>) => r.version_label as string).filter((v: string) => v !== 'NA')],
        colors: colors.map((r: Record<string, unknown>) => ({ code: r.code_color as string, name: r.name_color_sap as string }))
    }
}

export async function checkProductExistsAction(code?: string, sapDesc?: string) {
    if (!code && !sapDesc) return null

    const codeSafe = code ? String(code).trim().replace(/'/g, "''") : ""
    const sapDescSafe = sapDesc ? String(sapDesc).trim().replace(/'/g, "''") : ""

    const conditions = []
    if (codeSafe) conditions.push(`sku_complete = '${codeSafe}'`)
    if (sapDescSafe) conditions.push(`sap_description_original = '${sapDescSafe}'`)

    if (conditions.length === 0) return null

    const res = await dbQuery(`
        SELECT sku_complete as code, sap_description_original as sap_description 
        FROM public.product_skus 
        WHERE ${conditions.join(' OR ')}
        LIMIT 1
    `)

    if (!res || res.length === 0) return null

    const match = res[0]
    const normalizedCode = code ? String(code).trim().toUpperCase() : ""
    const normalizedSapDesc = sapDesc ? String(sapDesc).trim().toUpperCase() : ""
    const matchedCode = match.code ? String(match.code).trim().toUpperCase() === normalizedCode : false
    const matchedSapDescription = match.sap_description ? String(match.sap_description).trim().toUpperCase() === normalizedSapDesc : false

    return {
        ...match,
        matchType: matchedCode && matchedSapDescription
            ? 'both'
            : matchedCode
                ? 'code'
                : matchedSapDescription
                    ? 'sap_description'
                    : 'unknown'
    }
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

        const glossaryTermsForStale: { termEs: string; category?: string | null }[] = []

        for (const t of terms) {
            const n = normalizeGlossaryInput(t)
            glossaryTermsForStale.push({ termEs: n.termEs, category: n.category })
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
        await markNamingStaleForGlossaryTerms(glossaryTermsForStale, 'glossary_update')
        await processNamingJobsInline()
        revalidatePath('/configuration/glossary')
        revalidatePath('/pending')
        revalidatePath('/')
        return { success: true, message: `Se guardaron ${terms.length} términos correctamente.` }
    } catch (error) {
        console.error("Error saving glossary terms:", error)
        return { success: false, message: `Error al guardar términos: ${(error as Error).message}` }
    }
}

export async function getDiagnosticInfoAction() {
    const hasToken = !!process.env.SUPABASE_ACCESS_TOKEN;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    let rulesCount = 0;
    let error = null;
    try {
        const res = await dbQuery(`SELECT count(*) as count FROM public.naming_components`);
        rulesCount = res?.[0]?.count || 0;
    } catch (e) {
        error = (e as Error).message;
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
    } catch (error) {
        console.error('Error in executeMassImportAction:', error);
        return { success: false, error: (error as Error).message };
    }
}

export async function batchCreateColorVariantsAction(
    originalProduct: any,
    colors: { code: string, name: string, isNew: boolean }[]
) {
    const results = []
    
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
            if (parsed._version_overrides && Object.keys(parsed._version_overrides).length > 0) {
                Object.assign(workingProduct, parsed._version_overrides);
                workingProduct.rh_flag = workingProduct.rh === 'RH';
            }
            const baseName = await computeProductNameByNamingType(workingProduct, 'final_base_name')
            const completeName = await computeProductNameByNamingType(workingProduct, 'final_complete_name')
            const sapName = await computeProductNameByNamingType(workingProduct, 'sap_description_recommended')
            const sap_description_recommended_es = sapName.final_name_es || completeName.final_name_es
            const sap_description_recommended_en = sapName.final_name_en || completeName.final_name_en
            const final_name_es = completeName.final_name_es
            const final_name_en = completeName.final_name_en
            
            const clientNameRaw = originalProduct.private_label_client_name ? String(originalProduct.private_label_client_name).trim() : ''
            const isPrivate = clientNameRaw !== '' && clientNameRaw.toUpperCase() !== 'NA'
            
            let batchExistingRefAttrs: Record<string, any> = {};
            if (parsed.familia_code && parsed.ref_code) {
                try {
                    const refRows = await dbQuery(
                        `SELECT ref_attrs FROM public.product_references 
                         WHERE family_code = $1 AND reference_code = $2 LIMIT 1`,
                        [parsed.familia_code, parsed.ref_code]
                    );
                    if (refRows && refRows.length > 0) {
                        const raw = refRows[0].ref_attrs;
                        batchExistingRefAttrs = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
                    }
                } catch (e) {
                    console.error('batchCreateColorVariantsAction: error querying existing ref_attrs', e);
                }
            }

            const payload = buildCreateProductV6Payload(
                workingProduct, 
                parsed, 
                isPrivate, 
                isPrivate ? clientNameRaw : null, 
                sap_description_recommended_es,
                sap_description_recommended_en,
                baseName.final_name_es,
                baseName.final_name_en,
                completeName.final_name_es,
                completeName.final_name_en,
                batchExistingRefAttrs
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
            
        } catch (error) {
            results.push({ color_code: color.code, color_name: color.name, sku: '', success: false, error: (error as Error).message })
        }
    }
    
    return { results }
}

