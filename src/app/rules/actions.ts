'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath, revalidateTag } from 'next/cache'
import { recomputeMasterNamesByProductType, resetMasterNamingModelCache } from '@/lib/engine/masterNaming'
import {
    markNamingStaleForProductType,
    markNamingStaleForGlossaryTerms,
    processNamingJobsInline,
} from '@/lib/engine/namingQueue'
import { resetGlossaryCache, resetTranslatorConfigCache } from '@/lib/engine/translator'
import {
    DEFAULT_NAMING_TYPE,
    componentsFromRulesAndEnConfig,
    componentsToEnConfig,
    componentsToRules,
    componentsToTranslatorConfig,
    loadAllRulesForNamingType,
    loadNamingComponents,
    loadNamingComponentsByProductType,
    replaceNamingComponents,
    type NamingComponent,
} from '@/lib/engine/namingComponents'
import {
    BASE_NAMING_VARIABLE_FIELDS,
    humanizeNamingVariableKey,
    isAllowedDynamicNamingKey,
    mergeNamingVariableFields,
    normalizeNamingVariableKey,
    type NamingVariableField,
    type NamingVariableSource,
} from '@/lib/engine/namingVariableCatalog'

function esc(v: unknown) {
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

function parseProductTypesValue(value: unknown): string[] {
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
    const componentRows = await dbQuery(`
        SELECT DISTINCT product_type
        FROM public.naming_components
        WHERE product_type IS NOT NULL
          AND btrim(product_type) <> ''
        ORDER BY product_type ASC
    `) || []
    const fromComponents = parseProductTypesValue(componentRows.map((r: any) => r.product_type))
    if (fromComponents.length > 0) return fromComponents

    const settingRow = await dbQuery(`
        SELECT value
        FROM public.app_settings
        WHERE key = '${NAMING_MODELS_KEY}'
        LIMIT 1
    `) || []

    const fromSetting = parseProductTypesValue(settingRow?.[0]?.value)
    if (fromSetting.length > 0) return fromSetting

    return []
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
        return await loadAllRulesForNamingType(DEFAULT_NAMING_TYPE)
    } catch (error) {
        console.error("getRulesAction error:", error instanceof Error ? error.message : String(error))
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
    void rule_type
    void action_type
    void enabled
    void notes

    const productType = normalizeProductType(target_value || target_entity || 'MUEBLE')
    const componentKey = String(action_payload || '').match(/\{([A-Za-z_][A-Za-z0-9_]*)\}/)?.[1]
        || String(condition_expression || '').match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]
        || `component_${priority || 0}`

    if (id) {
        await dbQuery(`
            UPDATE public.naming_components SET
                product_type=${esc(productType)},
                component_key=${esc(componentKey)},
                condition_expression=${esc(condition_expression)},
                payload_es=${esc(action_payload)},
                order_es=${priority || 0},
                updated_at=now()
            WHERE id='${id}'
        `)
    } else {
        await dbQuery(`
            INSERT INTO public.naming_components (
                naming_type, product_type, component_key, condition_expression, payload_es, order_es, behavior_en, updated_at
            )
            VALUES (
                ${esc(DEFAULT_NAMING_TYPE)},
                ${esc(productType)},
                ${esc(componentKey)},
                ${esc(condition_expression || 'true')},
                ${esc(action_payload)},
                ${priority || 0},
                'preserve',
                now()
            )
        `)
    }

    resetMasterNamingModelCache()
    resetTranslatorConfigCache()
    await markNamingStaleForProductType(productType, DEFAULT_NAMING_TYPE, 'naming_rule_upsert')
    await processNamingJobsInline()
    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
}

export async function deleteRuleAction(id: string) {
    if (!id) return
    const rows = await dbQuery(`
        SELECT product_type, naming_type
        FROM public.naming_components
        WHERE id = '${id.replace(/'/g, "''")}'
        LIMIT 1
    `) || []
    await dbQuery(`DELETE FROM public.naming_components WHERE id = '${id}'`)
    resetMasterNamingModelCache()
    resetTranslatorConfigCache()
    const deleted = rows[0]
    if (deleted?.product_type) {
        await markNamingStaleForProductType(
            deleted.product_type,
            deleted.naming_type || DEFAULT_NAMING_TYPE,
            'naming_rule_delete'
        )
        await processNamingJobsInline()
    }
    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
}

export async function revalidateRulesAndProductsAction() {
    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
}

export async function previewNamingRulesAction(productType: string, pendingRules: any[]) {
    return previewNamingComponentsAction(productType, DEFAULT_NAMING_TYPE, pendingRules)
}

export async function previewNamingComponentsAction(
    productType: string,
    namingType: string,
    pendingRules: any[],
    pendingEnConfig?: any[]
) {
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
    const components = pendingEnConfig
        ? componentsFromRulesAndEnConfig(productType, namingType, rulesForEval, pendingEnConfig)
        : await loadNamingComponents(productType, namingType)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enConfigOverride = components.length > 0 ? componentsToTranslatorConfig(components as any) : undefined

    return await Promise.all(products.map(async (p: any) => {
        const resultEs = evaluateProductRules(p as any, rulesForEval as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultEn = await translateProductToEnglish(p as any, productType, resultEs.activeVariableIds, false, enConfigOverride as any)

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
    return getNamingComponentsEnConfigAction(targetEntity, DEFAULT_NAMING_TYPE)
}

export async function getNamingComponentsEnConfigAction(targetEntity: string, namingType: string) {
    try {
        const components = await loadNamingComponents(targetEntity, namingType)
        return componentsToEnConfig(components)
    } catch (error) {
        console.error("getNamingComponentsEnConfigAction error:", error instanceof Error ? error.message : String(error))
        return []
    }
}

export async function saveEnConfigAction(targetEntity: string, variable_id: string, patch: {
    order_index?: number
    emit?: boolean
    behavior?: string
    behavior_en?: string
    fallback_strategy?: string
    drop_if_resolved?: boolean
}, namingType: string = DEFAULT_NAMING_TYPE) {
    const current = await loadNamingComponents(targetEntity, namingType)
    const enConfig = componentsToEnConfig(current)
    const existing = enConfig.find((cfg: any) => cfg.variable_id === variable_id)
    const nextConfig = existing
        ? enConfig.map((cfg: any) => cfg.variable_id === variable_id ? { ...cfg, ...patch } : cfg)
        : [...enConfig, { variable_id, order_index: patch.order_index ?? enConfig.length * 10, behavior_en: patch.behavior_en ?? 'preserve', emit: patch.emit ?? true, behavior: patch.behavior ?? 'preserve', fallback_strategy: patch.fallback_strategy ?? 'preserve', drop_if_resolved: patch.drop_if_resolved ?? false }]
    const rules = componentsToRules(current, targetEntity)
    const nextComponents = componentsFromRulesAndEnConfig(targetEntity, namingType, rules, nextConfig)
    await replaceNamingComponents(targetEntity, namingType, nextComponents)
    resetMasterNamingModelCache()
    resetTranslatorConfigCache()
    await markNamingStaleForProductType(targetEntity, namingType, 'naming_en_config_save')
    await processNamingJobsInline()

    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
}

export async function saveFullConfigAction(productType: string, esRules: any[], deletedEsIds: string[], enConfig: any[]) {
    return saveNamingComponentsFullConfigAction(productType, DEFAULT_NAMING_TYPE, esRules, deletedEsIds, enConfig)
}

export async function saveNamingComponentsFullConfigAction(productType: string, namingType: string, esRules: any[], deletedEsIds: string[], enConfig: any[]) {
    void deletedEsIds
    const indexedRules = esRules.map((rule, index) => ({
        ...rule,
        priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : index * 10,
        target_entity: productType,
        target_value: productType,
        rule_type: 'name_component',
        action_type: 'append_text',
        enabled: true,
    }))

    const components = componentsFromRulesAndEnConfig(productType, namingType, indexedRules, enConfig)
    await replaceNamingComponents(productType, namingType, components)
    resetMasterNamingModelCache()
    resetTranslatorConfigCache()
    const jobId = await markNamingStaleForProductType(productType, namingType, 'naming_full_config_save')

    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePendingSweepEverywhere()
    return { success: true, jobId }
}

export async function getNamingComponentsAction(productType?: string) {
    if (productType) return loadNamingComponentsByProductType(productType)
    const rows = await dbQuery(`
        SELECT *
        FROM public.naming_components
        ORDER BY product_type ASC, naming_type ASC, COALESCE(order_es, order_en, 999999), component_key ASC
    `) || []
    return rows as NamingComponent[]
}

export async function getNamingVariableCatalogAction(productType?: string): Promise<NamingVariableField[]> {
    const normalizedType = productType ? normalizeProductType(productType) : ''
    const safeType = normalizedType.replace(/'/g, "''")
    const familyFilter = safeType ? `WHERE upper(btrim(product_type)) = '${safeType}'` : ''
    const dynamicRows = await dbQuery(`
        WITH selected_families AS (
            SELECT family_code, ref_attrs_schema
            FROM public.families
            ${familyFilter}
        )
        SELECT DISTINCT key, source
        FROM (
            SELECT jsonb_object_keys(COALESCE(sf.ref_attrs_schema, '{}'::jsonb)) AS key, 'ref_attrs' AS source
            FROM selected_families sf

            UNION

            SELECT jsonb_object_keys(COALESCE(r.ref_attrs, '{}'::jsonb)) AS key, 'ref_attrs' AS source
            FROM public.product_references r
            INNER JOIN selected_families sf ON sf.family_code = r.family_code

            UNION

            SELECT jsonb_object_keys(COALESCE(v.version_attrs, '{}'::jsonb)) AS key, 'version_attrs' AS source
            FROM public.product_versions v
            INNER JOIN public.product_references r ON r.id = v.reference_id
            INNER JOIN selected_families sf ON sf.family_code = r.family_code

            UNION

            SELECT jsonb_object_keys(COALESCE(s.sku_attrs, '{}'::jsonb)) AS key, 'sku_attrs' AS source
            FROM public.product_skus s
            INNER JOIN public.product_versions v ON v.id = s.version_id
            INNER JOIN public.product_references r ON r.id = v.reference_id
            INNER JOIN selected_families sf ON sf.family_code = r.family_code
        ) discovered
        WHERE key IS NOT NULL AND btrim(key) <> ''
        ORDER BY source ASC, key ASC
    `) || []

    const dynamicFields: NamingVariableField[] = dynamicRows
        .map((row: { key?: string; source?: string }) => {
            const field = normalizeNamingVariableKey(row.key || '')
            if (!isAllowedDynamicNamingKey(field)) return null
            const source = ['ref_attrs', 'version_attrs', 'sku_attrs'].includes(row.source || '')
                ? row.source as NamingVariableSource
                : 'ref_attrs'
            return {
                field,
                label: humanizeNamingVariableKey(field),
                type: field.endsWith('_flag') ? 'boolean' : 'text',
                source,
            } satisfies NamingVariableField
        })
        .filter(Boolean) as NamingVariableField[]

    return mergeNamingVariableFields([
        ...BASE_NAMING_VARIABLE_FIELDS,
        ...dynamicFields,
    ])
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

    resetGlossaryCache()
    await markNamingStaleForGlossaryTerms(
        terms.map(term => ({ termEs: term.es, category: 'TECHNICAL' })),
        'glossary_update'
    )
    await processNamingJobsInline()
    revalidatePath('/rules')
    revalidatePath('/configuration')
    revalidatePath('/configuration/glossary')
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

    await dbQuery(`DELETE FROM public.naming_components WHERE product_type = ${esc(productType)}`)
    resetMasterNamingModelCache()
    resetTranslatorConfigCache()
    await markNamingStaleForProductType(productType, null, 'naming_model_delete')
    await processNamingJobsInline()

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
    clientEnConfig?: any[],
    namingType?: string
) {
    void clientEsRules
    void clientEnConfig

    const recomputed = await recomputeMasterNamesByProductType(productType, offset, limit, namingType)
    return recomputed.products.map(product => ({
        code: product.code,
        status: 'ACTIVO',
        name_es: product.final_name_es,
        name_en: product.final_name_en,
    }))
}
