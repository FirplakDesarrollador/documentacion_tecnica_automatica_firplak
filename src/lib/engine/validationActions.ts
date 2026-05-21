import { dbQuery } from '@/lib/supabase'
import { TemplateElement, type TemplateElementType } from '@/components/templates/TemplateCanvas'
import { unstable_cache } from 'next/cache'
import { evaluateProductRules } from './ruleEvaluator'
import { translateProductToEnglish, type ProductPayload } from './translator'

export type PendingSeverity = 'critical' | 'warning'
export type PendingReasonCode =
    | 'MISSING_TEMPLATE_FIELD'
    | 'MISSING_ISOMETRIC'
    | 'MISSING_NAMING_INPUT'
    | 'EN_TRANSLATION_BLOCKED'

export interface PendingReason {
    code: PendingReasonCode
    severity: PendingSeverity
    message: string
    fields?: string[]
}

export interface PendingDetail {
    productId: string
    productCode: string
    productName: string
    severity: PendingSeverity
    reasons: PendingReason[]
}

export interface PendingSummary {
    totalEvaluated: number
    pendingCount: number
    pendingCriticalCount: number
    details: PendingDetail[]
}

function isInactiveOrNotExportable(product: any) {
    return product?.is_exportable === false || product?.effective_status === 'INACTIVO'
}

function isNullishOrEmpty(value: any) {
    return value === null || value === undefined || value === ''
}

function isPlaceholderValue(value: any) {
    if (value === null || value === undefined) return true
    if (typeof value === 'boolean') return false
    const str = String(value).trim().toUpperCase()
    return str === '' || str === 'NA' || str === 'N/A' || str === '-'
}

function extractRequiredTemplateFields(requiredElements: TemplateElement[]) {
    const requiredDataFields = new Set<string>()

    requiredElements.forEach((el: any) => {
        if (!el?.required) return

        const t = el.type as TemplateElementType
        if ((t === 'dynamic_text' || t === 'barcode' || t === 'dynamic_image') && el.dataField) {
            requiredDataFields.add(String(el.dataField))
        }

        const contentLower = String(el.content || '').trim().toLowerCase()
        const isIsometricLabel =
            contentLower === 'isométrico' ||
            contentLower === 'isomã©trico' || // legacy mojibake seen in some files
            contentLower.startsWith('isom')

        if (t === 'image' && isIsometricLabel) {
            requiredDataFields.add('isometric')
        }
    })

    return requiredDataFields
}

function resolveTemplateFieldValue(product: any, field: string) {
    if (field === 'isometric') {
        return product?.isometric_asset_id || product?.isometric_path
    }
    return product?.[field]
}

const CRITICAL_NAMING_INPUT_FIELDS = new Set([
    'product_type',
    'product_name',
    'designation',
    'line',
    'commercial_measure',
    'use_destination',
    'zone_home',
    'version_label',
])

const OPTIONAL_NAMING_INPUT_FIELDS = new Set([
    'special_label',
    'accessory_text',
    'canto_puertas',
    'door_color_text',
    'rh',
    'carb2',
    'armado_con_lvm',
    'private_label_client_name',
    'color_name',
])

function buildNamingInputReasons(product: any, activeVariableIds: string[]): PendingReason[] {
    const reasons: PendingReason[] = []

    const active = new Set((activeVariableIds || []).map(v => String(v).trim()).filter(Boolean))
    const allInputs = new Set<string>([...CRITICAL_NAMING_INPUT_FIELDS, ...OPTIONAL_NAMING_INPUT_FIELDS])

    for (const field of allInputs) {
        if (active.size > 0 && !active.has(field)) continue

        const value = product?.[field]

        if (CRITICAL_NAMING_INPUT_FIELDS.has(field)) {
            if (isPlaceholderValue(value)) {
                reasons.push({
                    code: 'MISSING_NAMING_INPUT',
                    severity: 'critical',
                    message: `Falta o es placeholder en campo crítico: ${field}.`,
                    fields: [field],
                })
            }
        } else {
            // Optional: NULL/empty is pending (warning), but 'NA' is considered valid.
            if (isNullishOrEmpty(value)) {
                reasons.push({
                    code: 'MISSING_NAMING_INPUT',
                    severity: 'warning',
                    message: `Campo opcional vacío: ${field} (poner 'NA' o un valor real).`,
                    fields: [field],
                })
            }
        }
    }

    return reasons
}

async function validateProductPending(params: {
    product: any
    rules: any[]
    requiredTemplateFields: Set<string>
}): Promise<{ reasons: PendingReason[]; severity: PendingSeverity | null }> {
    const { product, rules, requiredTemplateFields } = params

    if (isInactiveOrNotExportable(product)) {
        return { reasons: [], severity: null }
    }

    const reasons: PendingReason[] = []

    // A) Template required fields
    const missingTemplateFields: string[] = []
    requiredTemplateFields.forEach(field => {
        const value = resolveTemplateFieldValue(product, field)
        if (field === 'isometric') {
            if (isPlaceholderValue(value)) missingTemplateFields.push(field)
        } else {
            if (isNullishOrEmpty(value)) missingTemplateFields.push(field)
        }
    })

    if (missingTemplateFields.length > 0) {
        const hasIsometric = missingTemplateFields.includes('isometric')
        if (hasIsometric) {
            reasons.push({
                code: 'MISSING_ISOMETRIC',
                severity: 'critical',
                message: 'Falta isométrico (requerido por plantillas activas).',
                fields: ['isometric'],
            })
        }

        const other = missingTemplateFields.filter(f => f !== 'isometric')
        if (other.length > 0) {
            reasons.push({
                code: 'MISSING_TEMPLATE_FIELD',
                severity: 'critical',
                message: `Faltan campos requeridos por plantillas activas: ${other.join(', ')}.`,
                fields: other,
            })
        }
    }

    // B) Rules / naming inputs (activeVariableIds)
    const ruleEval = evaluateProductRules(product as any, rules as any)
    reasons.push(...buildNamingInputReasons(product, ruleEval.activeVariableIds))

    // C) English translation health
    const translation = await translateProductToEnglish(
        ({ ...(ruleEval.transformedProduct as any), final_name_es: ruleEval.finalNameEs } as any) as ProductPayload,
        product?.product_type || 'MUEBLE',
        ruleEval.activeVariableIds
    )

    if (!translation.isValid) {
        const parts: string[] = []
        if (translation.errorReason) parts.push(translation.errorReason)
        if (translation.missingTerms?.length) parts.push(`Missing terms: ${translation.missingTerms.join(', ')}`)

        reasons.push({
            code: 'EN_TRANSLATION_BLOCKED',
            severity: 'critical',
            message: parts.join(' | ') || 'Traducción EN inválida.',
        })
    }

    const severity: PendingSeverity | null = reasons.some(r => r.severity === 'critical')
        ? 'critical'
        : reasons.length > 0
            ? 'warning'
            : null

    return { reasons, severity }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>) {
    const results: R[] = new Array(items.length)
    let nextIndex = 0

    const workers = new Array(Math.max(1, concurrency)).fill(null).map(async () => {
        while (true) {
            const idx = nextIndex
            nextIndex++
            if (idx >= items.length) return
            results[idx] = await fn(items[idx], idx)
        }
    })

    await Promise.all(workers)
    return results
}

/**
 * Executes a full “Pendientes” sweep of the active product catalog.
 * This is the single source of truth for the Pending KPI + report.
 */
export async function getPendingSummary(): Promise<PendingSummary> {
    const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')

    const rows =
        (await dbQuery(`
            SELECT *
            FROM public.v_ui_generate_list
            WHERE COALESCE(is_exportable, true) = true
            ORDER BY sku_complete ASC
        `)) || []

    const products = rows.map((row: any) => mapRowToComposedProduct(row))
    const rules = (await dbQuery(`SELECT * FROM public.rules WHERE enabled = true`)) || []

    const activeTemplates =
        (await dbQuery(`
            SELECT id, elements_json
            FROM public.plantillas_doc_tec
            WHERE active = true
        `)) || []

    const allElements: TemplateElement[] = []
    activeTemplates.forEach((t: any) => {
        try {
            const els = JSON.parse(t.elements_json || '[]')
            allElements.push(...els)
        } catch (e) {
            console.error(`Error parsing elements for template ${t.id}:`, e)
        }
    })

    const requiredTemplateFields = extractRequiredTemplateFields(allElements)

    const evaluatedProducts = products.filter((p: any) => !isInactiveOrNotExportable(p))

    const perProduct = await mapWithConcurrency(evaluatedProducts, 25, async (product: any) => {
        const { reasons, severity } = await validateProductPending({ product, rules, requiredTemplateFields })
        return { product, reasons, severity }
    })

    const details: PendingDetail[] = []
    let pendingCount = 0
    let pendingCriticalCount = 0

    for (const r of perProduct) {
        if (!r.severity) continue
        pendingCount++
        if (r.severity === 'critical') pendingCriticalCount++

        details.push({
            productId: r.product.id,
            productCode: r.product.code,
            productName: r.product.final_name_es || 'Sin nombre',
            severity: r.severity,
            reasons: r.reasons,
        })
    }

    return {
        totalEvaluated: evaluatedProducts.length,
        pendingCount,
        pendingCriticalCount,
        details,
    }
}

// Cached variant for production (Vercel). Use revalidateTag('validation-sweep') after mutations.
export const getPendingSummaryCached = unstable_cache(
    async () => getPendingSummary(),
    ['pending-summary'],
    { tags: ['validation-sweep'] }
)

// Backward-compatible exports (deprecated): keep until callers are migrated.
export type ExceptionSummary = {
    totalActiveProducts: number
    exceptionsCount: number
    incompleteProductsCount: number
    details: {
        productId: string
        productCode: string
        productName: string
        issues: {
            isValid: boolean
            missingFields: string[]
            failedRules: string[]
            warnings: string[]
        }
    }[]
}

export async function getFullValidationSweep(): Promise<ExceptionSummary> {
    const pending = await getPendingSummary()

    return {
        totalActiveProducts: pending.totalEvaluated,
        exceptionsCount: pending.pendingCount,
        incompleteProductsCount: pending.pendingCriticalCount,
        details: pending.details.map(d => ({
            productId: d.productId,
            productCode: d.productCode,
            productName: d.productName,
            issues: {
                isValid: d.severity !== 'critical',
                missingFields: d.reasons.flatMap(r => r.fields || []),
                failedRules: [],
                warnings: d.reasons.filter(r => r.severity === 'warning').map(r => r.message),
            },
        })),
    }
}

export const getFullValidationSweepCached = unstable_cache(
    async () => getFullValidationSweep(),
    ['full-validation-sweep'],
    { tags: ['validation-sweep'] }
)

/**
 * Persists the validation status to the database for all active products.
 * Use this to keep the 'validation_status' column in sync with current rules and templates.
 */
export async function syncValidationStatus(): Promise<{ updated: number }> {
    const sweep = await getPendingSummary()
    
    // We update in batches or individual queries since Supabase RPC/Bulk update is safer for this
    let updated = 0
    
    // 1. Reset all products to 'ready' first (optimistic) then mark exceptions
    // Or better, iterate through sweep results
    
    // Get all product IDs to handle 'ready' state
    const allSkus = await dbQuery(`
        SELECT id, version_id
        FROM public.v_ui_generate_list
        WHERE COALESCE(is_exportable, true) = true
    `) || []
    
    // Create a map of exceptions for fast lookup
    const pendingMap = new Map(sweep.details.map(d => [d.productId, d.severity]))
    
    for (const p of allSkus) {
        const severity = pendingMap.get(p.id)
        let newStatus = 'ready'
        
        if (severity) {
            newStatus = severity === 'critical' ? 'incomplete' : 'needs_review'
        }
        
        await dbQuery(`
            UPDATE public.product_versions 
            SET validation_status = '${newStatus}', updated_at = now()
            WHERE id = '${p.version_id}'
        `)
        updated++
    }

    return { updated }
}
