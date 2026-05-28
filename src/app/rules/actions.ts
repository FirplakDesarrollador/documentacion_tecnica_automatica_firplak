'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath, revalidateTag } from 'next/cache'
import { recomputeMasterNamesByProductType } from '@/lib/engine/masterNaming'

function esc(v: any) {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (typeof v === 'number') return String(v)
    return `'${String(v).replace(/'/g, "''")}'`
}

function revalidatePendingSweepEverywhere() {
    revalidateTag('validation-sweep', { expire: 0 })
    revalidatePath('/pending')
    revalidatePath('/')
}

const NAMING_MODELS_KEY = 'naming_models_enabled_types'

function normalizeProductType(raw: string) {
    return String(raw || '').trim().toUpperCase()
}

function parseProductTypesValue(value: any): string[] {
    if (!value) return []
    const src = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? (() => {
                try {
                    const parsed = JSON.parse(value)
                    return Array.isArray(parsed) ? parsed : []
                } catch {
                    return []
                }
            })()
            : []

    const dedup = new Set<string>()
    for (const item of src) {
        const normalized = normalizeProductType(String(item || ''))
        if (normalized) dedup.add(normalized)
    }
    return Array.from(dedup).sort((a, b) => a.localeCompare(b))
}

async function getFamiliesProductTypes(): Promise<string[]> {
    const rows = await dbQuery(`
        SELECT DISTINCT product_type
        FROM public.families
        WHERE product_type IS NOT NULL
          AND btrim(product_type) <> ''
        ORDER BY product_type ASC
    `) || []

    const dedup = new Set<string>()
    for (const row of rows) {
        const normalized = normalizeProductType(row.product_type)
        if (normalized) dedup.add(normalized)
    }
    return Array.from(dedup).sort((a, b) => a.localeCompare(b))
}

async function resolveNamingModelTypesFromStorage(): Promise<string[]> {
    const settingRow = await dbQuery(`
        SELECT value
        FROM public.app_settings
        WHERE key = '${NAMING_MODELS_KEY}'
        LIMIT 1
    `) || []

    const fromSetting = parseProductTypesValue(settingRow?.[0]?.value)
    if (fromSetting.length > 0) return fromSetting

    const rows = await dbQuery(`
        SELECT DISTINCT target_value
        FROM public.rules
        WHERE rule_type = 'name_component'
          AND target_value IS NOT NULL
          AND btrim(target_value) <> ''
        ORDER BY target_value ASC
    `) || []

    const fromRules = parseProductTypesValue(rows.map((r: any) => r.target_value))
    if (fromRules.length > 0) {
        await dbQuery(`
            INSERT INTO public.app_settings (key, value, updated_at)
            VALUES ('${NAMING_MODELS_KEY}', to_jsonb(${esc(JSON.stringify(fromRules))}::json), now())
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value,
                updated_at = now()
        `)
    }

    return fromRules
}

async function saveNamingModelTypesToStorage(types: string[]) {
    const normalized = parseProductTypesValue(types)
    await dbQuery(`
        INSERT INTO public.app_settings (key, value, updated_at)
        VALUES ('${NAMING_MODELS_KEY}', to_jsonb(${esc(JSON.stringify(normalized))}::json), now())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = now()
    `)
}

export async function getRulesAction() {
    try {
        const data = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`)
        return data || []
    } catch (error: any) {
        console.error("getRulesAction error:", error.message)
        return []
    }
}

export async function getColorByNameAction(code4Dig: string) {
    if (!code4Dig) return null
    const rows = await dbQuery(`SELECT name_color_sap FROM public.colors WHERE code_4dig = '${code4Dig.replace(/'/g, "''")}' LIMIT 1`)
    return rows && rows.length > 0 ? rows[0].name_color_sap : null
}

export async function upsertRuleAction(data: any) {
    const { id, rule_type, target_entity, condition_expression, action_type, action_payload, priority, enabled, notes, target_value } = data

    if (id) {
        await dbQuery(`
            UPDATE public.rules SET
                rule_type=${esc(rule_type)},
                target_entity=${esc(target_entity)},
                condition_expression=${esc(condition_expression)},
                action_type=${esc(action_type)},
                action_payload=${esc(action_payload)},
                priority=${priority || 0},
                enabled=${enabled ? 'true' : 'false'},
                notes=${esc(notes)},
                target_value=${esc(target_value)},
                updated_at=now()
            WHERE id='${id}'
        `)
    } else {
        await dbQuery(`
            INSERT INTO public.rules (rule_type, target_entity, condition_expression, action_type, action_payload, priority, enabled, notes, target_value)
            VALUES (${esc(rule_type)}, ${esc(target_entity)}, ${esc(condition_expression)}, ${esc(action_type)}, ${esc(action_payload)}, ${priority || 0}, ${enabled ? 'true' : 'false'}, ${esc(notes)}, ${esc(target_value)})
        `)
    }

    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
}

export async function deleteRuleAction(id: string) {
    if (!id) return
    await dbQuery(`DELETE FROM public.rules WHERE id = '${id}'`)
    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
}

export async function revalidateRulesAndProductsAction() {
    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePath('/products')
    revalidatePendingSweepEverywhere()
}

export async function previewNamingRulesAction(productType: string, pendingRules: any[]) {
    const safeType = productType.replace(/'/g, "''")
    const rows = await dbQuery(`
        SELECT *
        FROM public.v_ui_generate_list
        WHERE product_type = '${safeType}'
          AND product_name IS NOT NULL
          AND status = 'ACTIVO'
        ORDER BY random()
        LIMIT 5
    `) || []

    if (rows.length === 0) return []

    const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
    const products = rows.map((row: any) => mapRowToComposedProduct(row))

    const { evaluateProductRules } = await import('@/lib/engine/ruleEvaluator')
    const { translateProductToEnglish } = await import('@/lib/engine/translator')

    const rulesForEval = pendingRules.map((r: any, idx: number) => ({
        id: r.id || `temp-${idx}`,
        rule_type: r.rule_type,
        target_entity: r.target_entity || productType,
        condition_expression: r.condition_expression,
        action_type: r.action_type,
        action_payload: r.action_payload,
        priority: r.priority ?? idx * 10,
        enabled: r.enabled ?? true,
        notes: r.notes || null,
        target_value: r.target_value || productType,
    }))

    return await Promise.all(products.map(async (p: any) => {
        const resultEs = evaluateProductRules(p as any, rulesForEval as any)
        const resultEn = await translateProductToEnglish(p as any, productType, resultEs.activeVariableIds)

        return {
            id: p.id,
            code: p.code,
            currentName: p.final_name_es || '',
            sapDescription: p.sap_description || '',
            previewName: resultEs.finalNameEs,
            previewNameEn: resultEn.translatedName,
            isValidEn: resultEn.isValid,
            errorEn: resultEn.errorReason,
            missingTerms: resultEn.missingTerms,
            productData: p,
        }
    }))
}

export async function getProductsCountByFamilyAction(productType: string) {
    const safeType = productType.replace(/'/g, "''")
    const result = await dbQuery(`
        SELECT COUNT(id) as exact_count
        FROM public.v_ui_generate_list
        WHERE product_type = '${safeType}'
          AND product_name IS NOT NULL
    `)

    if (!result || result.length === 0) {
        return 0
    }
    return parseInt(result[0].exact_count, 10) || 0
}

export async function applyNamesToProductTypeBatchAction(productType: string, offset: number, limit: number) {
    const recomputed = await recomputeMasterNamesByProductType(productType, offset, limit)

    return recomputed.products.map((product) => ({
        code: product.code,
        newName: product.final_name_es,
        oldName: product.previous_final_name_es || '',
        status: 'ACTIVO',
    }))
}

export async function getEnConfigAction(targetEntity: string) {
    try {
        const safe = targetEntity.replace(/'/g, "''")
        const data = await dbQuery(`
            SELECT variable_id, order_index, emit, behavior, drop_if_resolved, resolved_by, fallback_strategy, group_key, notes
            FROM public.naming_config_en
            WHERE target_entity = '${safe}'
            ORDER BY order_index ASC
        `)
        return data || []
    } catch (error: any) {
        console.error("getEnConfigAction error:", error.message)
        return []
    }
}

export async function saveEnConfigAction(targetEntity: string, variable_id: string, patch: {
    order_index?: number
    emit?: boolean
    behavior?: string
    fallback_strategy?: string
    drop_if_resolved?: boolean
}) {
    const safe = targetEntity.replace(/'/g, "''")
    const safeVar = variable_id.replace(/'/g, "''")

    const existing = await dbQuery(`
        SELECT id FROM public.naming_config_en
        WHERE target_entity = '${safe}' AND variable_id = '${safeVar}'
        LIMIT 1
    `)

    if (existing && existing.length > 0) {
        const sets: string[] = [`updated_at = now()`]
        if (patch.order_index !== undefined) sets.push(`order_index = ${patch.order_index}`)
        if (patch.emit !== undefined) sets.push(`emit = ${patch.emit}`)
        if (patch.behavior !== undefined) sets.push(`behavior = '${patch.behavior.replace(/'/g, "''")}'`)
        if (patch.fallback_strategy !== undefined) sets.push(`fallback_strategy = '${patch.fallback_strategy.replace(/'/g, "''")}'`)
        if (patch.drop_if_resolved !== undefined) sets.push(`drop_if_resolved = ${patch.drop_if_resolved}`)

        await dbQuery(`UPDATE public.naming_config_en SET ${sets.join(', ')} WHERE target_entity = '${safe}' AND variable_id = '${safeVar}'`)
    } else {
        const order_index = patch.order_index !== undefined ? patch.order_index : 0
        const emit = patch.emit !== undefined ? patch.emit : true
        const behavior = patch.behavior !== undefined ? patch.behavior : 'preserve'
        const fallback_strategy = patch.fallback_strategy !== undefined ? patch.fallback_strategy : 'preserve'
        const drop_if_resolved = patch.drop_if_resolved !== undefined ? patch.drop_if_resolved : false
        const notes = `Variable creada desde ES`

        await dbQuery(`
            INSERT INTO public.naming_config_en (
                target_entity, variable_id, order_index, emit, behavior, fallback_strategy, drop_if_resolved, notes, created_at, updated_at
            ) VALUES (
                '${safe}', '${safeVar}', ${order_index}, ${emit}, '${behavior.replace(/'/g, "''")}', '${fallback_strategy.replace(/'/g, "''")}', ${drop_if_resolved}, '${notes}', now(), now()
            )
        `)
    }

    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
}

export async function saveFullConfigAction(productType: string, esRules: any[], deletedEsIds: string[], enConfig: any[]) {
    for (const id of deletedEsIds) {
        if (id) await deleteRuleAction(id)
    }

    for (const rule of esRules) {
        await upsertRuleAction(rule)
    }

    const safeType = productType.replace(/'/g, "''")
    for (const cfg of enConfig) {
        await saveEnConfigAction(safeType, cfg.variable_id, {
            order_index: cfg.order_index,
            emit: cfg.emit,
            behavior: cfg.behavior,
            fallback_strategy: cfg.fallback_strategy,
            drop_if_resolved: cfg.drop_if_resolved
        })
    }

    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
    return { success: true }
}

export async function saveGlossaryTermsAction(terms: { es: string, en: string }[]) {
    if (terms.length === 0) return { success: true }

    for (const term of terms) {
        const safeEs = term.es.replace(/'/g, "''")
        const safeEn = term.en.replace(/'/g, "''")

        await dbQuery(`
            INSERT INTO public.glossary (term_es, term_en, category)
            VALUES ('${safeEs}', '${safeEn}', 'TECHNICAL')
            ON CONFLICT (term_es) DO UPDATE SET term_en = '${safeEn}'
        `)
    }

    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePath('/products/glossary')
    revalidatePendingSweepEverywhere()
    return { success: true }
}

export async function saveMassImportSettingsAction(input: { executeEnabled: boolean; safeMaxRows: number }) {
    const executeEnabled = !!input.executeEnabled
    const safeMaxRows = Number(input.safeMaxRows)
    if (!Number.isFinite(safeMaxRows) || safeMaxRows <= 0) throw new Error('safeMaxRows debe ser un número mayor a 0')

    await dbQuery(`
        INSERT INTO public.app_settings (key, value, updated_at)
        VALUES
            ('mass_import_execute_enabled', to_jsonb(${executeEnabled ? 'true' : 'false'}), now()),
            ('mass_import_safe_max_rows', to_jsonb(${safeMaxRows}), now())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = now()
    `)

    revalidatePath('/rules')
    revalidatePath('/configuration')
}

export async function getNamingModelStatusAction() {
    const [familyTypes, modelTypes] = await Promise.all([
        getFamiliesProductTypes(),
        resolveNamingModelTypesFromStorage(),
    ])

    const familySet = new Set(familyTypes)
    const modelSet = new Set(modelTypes)

    const orphanFamilyTypes = familyTypes.filter(type => !modelSet.has(type))
    const orphanModelTypes = modelTypes.filter(type => !familySet.has(type))

    return {
        familyTypes,
        modelTypes,
        orphanFamilyTypes,
        orphanModelTypes,
    }
}

export async function addNamingModelAction(rawProductType: string) {
    const productType = normalizeProductType(rawProductType)
    if (!productType) throw new Error('Debes seleccionar un tipo de producto válido')

    const [familyTypes, modelTypes] = await Promise.all([
        getFamiliesProductTypes(),
        resolveNamingModelTypesFromStorage(),
    ])

    if (!familyTypes.includes(productType)) {
        throw new Error('Ese tipo de producto no existe en familias activas')
    }
    if (modelTypes.includes(productType)) {
        throw new Error('Ese modelo de nomenclatura ya existe')
    }

    await saveNamingModelTypesToStorage([...modelTypes, productType])
    revalidatePath('/configuration')
    return { success: true }
}

export async function deleteNamingModelAction(rawProductType: string) {
    const productType = normalizeProductType(rawProductType)
    if (!productType) throw new Error('Tipo de producto inválido')

    const [familyTypes, modelTypes] = await Promise.all([
        getFamiliesProductTypes(),
        resolveNamingModelTypesFromStorage(),
    ])

    if (familyTypes.includes(productType)) {
        throw new Error('No se puede eliminar: aún existen familias usando este product_type')
    }

    await saveNamingModelTypesToStorage(modelTypes.filter(type => type !== productType))

    await dbQuery(`DELETE FROM public.rules WHERE target_value = ${esc(productType)}`)
    await dbQuery(`DELETE FROM public.naming_config_en WHERE target_entity = ${esc(productType)}`)

    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
    return { success: true }
}

export async function applyFullBulkNamingUpdateBatchAction(
    productType: string,
    offset: number,
    limit: number,
    clientEsRules?: any[],
    clientEnConfig?: any[]
) {
    void clientEsRules
    void clientEnConfig

    const recomputed = await recomputeMasterNamesByProductType(productType, offset, limit)
    return recomputed.products.map(product => ({
        code: product.code,
        status: 'ACTIVO',
        name_es: product.final_name_es,
        name_en: product.final_name_en,
    }))
}
