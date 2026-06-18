'use server'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { dbQuery, supabaseServer } from '@/lib/supabase'
import { resetGlossaryCache } from '@/lib/engine/translator'
import { computeNameWithNamingComponents } from '@/lib/engine/namingComponentsEngine'
import { parseProductCode } from '@/lib/engine/codeParser'
import {
    markNamingStaleForColor,
    markNamingStaleForGlossaryTerms,
    processNamingJobsInline,
} from '@/lib/engine/namingQueue'
import { upsertVersionAction } from '@/app/rules/versions/actions'
import {
    createClientAction as createClientActionFromConfiguration,
} from '@/app/configuration/clients/actions'
import { assertRole } from '@/utils/auth/access'
import { buildLabelBoxesAttr, buildPackageQuantityLabel } from '@/lib/engine/labelParts'

async function assertAdminAccess() {
    await assertRole('admin')
}

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
    await assertAdminAccess()

    return await parseProductCode(code, sapDesc, rhFlag)
}

export async function translateAction(nameEs: string, ctx?: any, force: boolean = false) {
    await assertAdminAccess()

    if (ctx) {
        const result = await computeNameWithNamingComponents({ ...ctx, final_name_es: nameEs } as any, 'final_complete_name', force)
        return result.translation
    }
    return { translatedName: '', missingTerms: [], isValid: false, errorReason: 'Motor adaptativo requiere el objeto producto completo.', warnings: [], fieldTranslations: {} }
}

/**
 * Re-fetches the fully composed product context from the DB/view (`v_ui_generate_list`).
 * Use this after create/update before export so fields like `sku_base` match the export module pipeline.
 */
export async function composeProductByIdAction(id: string) {
    await assertAdminAccess()

    if (!id) return null
    const { composeProductById } = await import('@/lib/engine/product_composer')
    return await composeProductById(id)
}

export async function upsertColorAction(code: string, name: string) {
    await assertAdminAccess()

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
    const packageBoxCount = Math.max(1, Math.min(20, parseInt(String(data.package_box_count || '1'), 10) || 1))
    const referenceWeightKg = packageBoxCount > 1
        ? buildLabelBoxesAttr(data.label_box_weights_kg || [], packageBoxCount)
        : (data.weight_kg ? parseFloat(data.weight_kg) : null)

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
        q_package: buildPackageQuantityLabel(packageBoxCount),
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
            weight_kg: referenceWeightKg,
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
            version_label: data.version_label || parsed.version_label || null,
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
    await assertAdminAccess()

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
            await createClientActionFromConfiguration({
                name: clientNameRaw,
                logo_asset_id: data.private_label_logo_id ? String(data.private_label_logo_id) : null,
            })
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



export async function getUniquePropertiesAction() {
    await assertAdminAccess()

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
    await assertAdminAccess()

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


export async function batchCreateColorVariantsAction(
    originalProduct: any,
    colors: { code: string, name: string, isNew: boolean }[]
) {
    await assertAdminAccess()

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

