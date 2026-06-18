import { dbQuery } from '@/lib/supabase'

export const DEFAULT_NAMING_TYPE = 'final_complete_name'

export const NAMING_TYPE_LABELS: Record<string, string> = {
    final_base_name: 'Nombre base final',
    final_complete_name: 'Nombre completo final',
    sap_description_recommended: 'Descripción SAP recomendada',
}

export interface NamingComponent {
    id?: string
    naming_type: string
    product_type: string
    component_key: string
    condition_expression: string
    payload_es: string | null
    order_es: number | null
    order_en: number | null
    behavior_en: 'preserve' | 'translate' | 'translate_if_exists' | 'resolved_type' | string
}

function esc(value: unknown) {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return `'${String(value).replace(/'/g, "''")}'`
}

export function normalizeNamingProductType(value: string) {
    return String(value || '').trim().toUpperCase()
}

const NAMING_COMPONENTS_CACHE_TTL_MS = 60_000

type NamingComponentsCacheEntry = {
    fetchedAt: number
    value?: NamingComponent[]
    promise?: Promise<NamingComponent[]>
}

const namingComponentsCache = new Map<string, NamingComponentsCacheEntry>()

function getNamingComponentsCacheKey(productType: string, namingType: string) {
    return `${normalizeNamingProductType(productType)}::${namingType}`
}

export function resetNamingComponentsCache(productType?: string, namingType?: string) {
    if (!productType && !namingType) {
        namingComponentsCache.clear()
        return
    }

    const normalizedProductType = productType ? normalizeNamingProductType(productType) : null

    for (const key of namingComponentsCache.keys()) {
        const [cachedProductType, cachedNamingType] = key.split('::')
        const productTypeMatches = !normalizedProductType || cachedProductType === normalizedProductType
        const namingTypeMatches = !namingType || cachedNamingType === namingType

        if (productTypeMatches && namingTypeMatches) {
            namingComponentsCache.delete(key)
        }
    }
}

interface LegacyRule {
    id?: string
    component_key?: string
    action_payload?: string
    condition_expression?: string
    priority?: number
}

interface EnConfigItem {
    variable_id: string
    order_index: number
    behavior_en: string
    emit: boolean
    behavior: string
    drop_if_resolved: boolean
    resolved_by: string | null
    fallback_strategy: string
    group_key: string | null
    notes: null
}

function extractComponentKey(rule: LegacyRule, index: number) {
    const explicit = String(rule.component_key || '').trim()
    if (explicit) return explicit

    const payloadMatch = String(rule.action_payload || '').match(/\{([A-Za-z_][A-Za-z0-9_]*)\}/)
    if (payloadMatch?.[1]) return payloadMatch[1]

    const conditionMatch = String(rule.condition_expression || '').match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/)
    if (conditionMatch?.[1] && conditionMatch[1] !== 'true') return conditionMatch[1]

    return `static_${index}`
}

function behaviorEnFromLegacyConfig(cfg: { behavior_en?: string; variable_id?: string; behavior?: string; fallback_strategy?: string } | null | undefined): 'preserve' | 'translate' | 'translate_if_exists' | 'resolved_type' {
    if (!cfg) return 'preserve'
    if (cfg.behavior_en === 'translate' || cfg.behavior_en === 'translate_if_exists' || cfg.behavior_en === 'preserve' || cfg.behavior_en === 'resolved_type') return cfg.behavior_en
    if (cfg.variable_id === 'resolved_type' || cfg.behavior === 'classify_and_resolve') return 'resolved_type'
    if (cfg.fallback_strategy === 'translate' || cfg.behavior === 'translate_and_emit') return 'translate'
    return 'preserve'
}

export function componentsToRules(components: NamingComponent[], productType: string) {
    const fallbackProductType = normalizeNamingProductType(productType)
    return components
        .filter(component => component.payload_es !== null && component.order_es !== null)
        .sort((a, b) => Number(a.order_es ?? 0) - Number(b.order_es ?? 0))
        .map((component, index) => ({
            id: component.id,
            naming_type: component.naming_type,
            component_key: component.component_key,
            rule_type: 'name_component',
            target_entity: normalizeNamingProductType(component.product_type || fallbackProductType),
            condition_expression: component.condition_expression || 'true',
            action_type: 'append_text',
            action_payload: component.payload_es || '',
            priority: Number(component.order_es ?? index * 10),
            enabled: true,
            target_value: normalizeNamingProductType(component.product_type || fallbackProductType),
            notes: null,
        }))
}

export function componentsToEnConfig(components: NamingComponent[]) {
    return components
        .filter(component => component.order_en !== null)
        .sort((a, b) => Number(a.order_en ?? 0) - Number(b.order_en ?? 0))
        .map(component => {
            const rawBehaviorEn = component.behavior_en || 'preserve'
            const behaviorEn = component.component_key === 'resolved_type' && rawBehaviorEn === 'resolved_type'
                ? 'translate'
                : rawBehaviorEn
            const isResolvedTypeInput = behaviorEn === 'resolved_type' && component.component_key !== 'resolved_type'
            const isResolvedTypeOutput = behaviorEn === 'resolved_type' && component.component_key === 'resolved_type'

            return {
                variable_id: component.component_key,
                order_index: Number(component.order_en ?? 0),
                behavior_en: behaviorEn,
                emit: !isResolvedTypeInput,
                behavior: isResolvedTypeInput ? 'classify_and_resolve' : (behaviorEn === 'translate' || behaviorEn === 'translate_if_exists' || isResolvedTypeOutput ? 'translate_and_emit' : 'preserve'),
                drop_if_resolved: false,
                resolved_by: isResolvedTypeInput ? 'resolved_type' : null,
                fallback_strategy: behaviorEn === 'translate' ? 'translate' : (behaviorEn === 'translate_if_exists' ? 'translate_if_exists' : 'preserve'),
                group_key: isResolvedTypeInput || isResolvedTypeOutput ? 'resolved_type' : null,
                notes: null,
            }
        })
}

export function componentsToTranslatorConfig(components: NamingComponent[]) {
    const config: Record<string, EnConfigItem> = {}
    for (const item of componentsToEnConfig(components)) {
        config[item.variable_id] = item
    }
    return config
}

export function componentsFromRulesAndEnConfig(
    productType: string,
    namingType: string,
    rules: LegacyRule[],
    enConfig: EnConfigItem[]
): NamingComponent[] {
    const normalizedType = normalizeNamingProductType(productType)
    const enByVariable = new Map<string, EnConfigItem>()
    for (const cfg of enConfig || []) {
        if (cfg?.variable_id) enByVariable.set(String(cfg.variable_id), cfg)
    }

    const usedEnVariables = new Set<string>()
    const rows: NamingComponent[] = []

    rules.forEach((rule, index) => {
        const componentKey = extractComponentKey(rule, index)
        const cfg = enByVariable.get(componentKey)
        if (cfg) usedEnVariables.add(componentKey)

        rows.push({
            id: rule.id,
            naming_type: namingType,
            product_type: normalizedType,
            component_key: componentKey,
            condition_expression: rule.condition_expression || 'true',
            payload_es: rule.action_payload || '',
            order_es: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : index * 10,
            order_en: cfg && Number.isFinite(Number(cfg.order_index)) ? Number(cfg.order_index) : null,
            behavior_en: behaviorEnFromLegacyConfig(cfg),
        })
    })

    for (const cfg of enConfig || []) {
        const variableId = String(cfg?.variable_id || '').trim()
        if (!variableId || usedEnVariables.has(variableId)) continue

        rows.push({
            naming_type: namingType,
            product_type: normalizedType,
            component_key: variableId,
            condition_expression: 'true',
            payload_es: null,
            order_es: null,
            order_en: Number.isFinite(Number(cfg.order_index)) ? Number(cfg.order_index) : null,
            behavior_en: behaviorEnFromLegacyConfig(cfg),
        })
    }

    return rows
}

export async function loadNamingComponents(productType: string, namingType: string): Promise<NamingComponent[]> {
    const normalizedProductType = normalizeNamingProductType(productType)
    const cacheKey = getNamingComponentsCacheKey(normalizedProductType, namingType)
    const cached = namingComponentsCache.get(cacheKey)
    const now = Date.now()

    if (cached?.value && now - cached.fetchedAt < NAMING_COMPONENTS_CACHE_TTL_MS) {
        return cached.value
    }

    if (cached?.promise) {
        return cached.promise
    }

    const promise = (async () => {
        try {
            const rows = await dbQuery(`
                SELECT *
                FROM public.naming_components
                WHERE product_type = ${esc(normalizedProductType)}
                  AND naming_type = ${esc(namingType)}
                ORDER BY COALESCE(order_es, order_en, 999999), component_key ASC
            `) || []

            const components = rows as NamingComponent[]
            namingComponentsCache.set(cacheKey, { fetchedAt: Date.now(), value: components })
            return components
        } catch (error) {
            if (cached?.value) {
                namingComponentsCache.set(cacheKey, { fetchedAt: cached.fetchedAt, value: cached.value })
            } else {
                namingComponentsCache.delete(cacheKey)
            }
            throw error
        }
    })()

    namingComponentsCache.set(cacheKey, {
        fetchedAt: cached?.fetchedAt ?? now,
        value: cached?.value,
        promise,
    })

    return promise
}

export async function loadNamingComponentsByProductType(productType: string): Promise<NamingComponent[]> {
    const rows = await dbQuery(`
        SELECT *
        FROM public.naming_components
        WHERE product_type = ${esc(normalizeNamingProductType(productType))}
        ORDER BY naming_type ASC, COALESCE(order_es, order_en, 999999), component_key ASC
    `) || []

    return rows as NamingComponent[]
}

export async function loadRulesForNamingType(productType: string, namingType: string) {
    const components = await loadNamingComponents(productType, namingType)
    return componentsToRules(components, normalizeNamingProductType(productType))
}

export async function loadAllRulesForNamingType(namingType: string = DEFAULT_NAMING_TYPE) {
    const rows = await dbQuery(`
        SELECT *
        FROM public.naming_components
        WHERE naming_type = ${esc(namingType)}
          AND payload_es IS NOT NULL
          AND order_es IS NOT NULL
        ORDER BY product_type ASC, order_es ASC, component_key ASC
    `) || []

    return componentsToRules(rows as NamingComponent[], 'MUEBLE')
}

export async function loadTranslatorConfigForNamingType(productType: string, namingType: string) {
    const components = await loadNamingComponents(productType, namingType)
    if (components.length > 0) return componentsToTranslatorConfig(components)
    return null
}

export async function replaceNamingComponents(productType: string, namingType: string, components: NamingComponent[]) {
    const normalizedType = normalizeNamingProductType(productType)
    await dbQuery(`
        DELETE FROM public.naming_components
        WHERE product_type = ${esc(normalizedType)}
          AND naming_type = ${esc(namingType)}
    `)

    for (const component of components) {
        await dbQuery(`
            INSERT INTO public.naming_components (
                naming_type,
                product_type,
                component_key,
                condition_expression,
                payload_es,
                order_es,
                order_en,
                behavior_en,
                updated_at
            ) VALUES (
                ${esc(namingType)},
                ${esc(normalizedType)},
                ${esc(component.component_key)},
                ${esc(component.condition_expression || 'true')},
                ${esc(component.payload_es)},
                ${esc(component.order_es)},
                ${esc(component.order_en)},
                ${esc(component.behavior_en || 'preserve')},
                now()
            )
        `)
    }

    resetNamingComponentsCache(normalizedType, namingType)
}
