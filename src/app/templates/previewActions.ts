'use server'

import { dbQuery } from '@/lib/supabase'
import {
    listCatalogTargetContexts,
    resolveCatalogTargetContext,
    type CatalogTargetContext,
} from '@/lib/templates/catalogScopeServer'
import {
    isCatalogScope,
    type CatalogScope,
    type CatalogTarget,
    type TemplateBrandScope,
} from '@/lib/templates/catalogScope'
import { assertPermission } from '@/utils/auth/access'

export type TemplatePreviewTargetOption = {
    scope: CatalogScope
    id: string
    code: string
    name: string
    detail?: string
}

export type TemplatePreviewProductOption = {
    skuComplete: string
    name: string
    colorName: string | null
}

export type TemplatePreviewTargetContext = CatalogTargetContext & {
    name_color_sap: string | null
    color: string
}

const SEARCH_MINIMUM_LENGTH = 1

function normalizePreviewTarget(target: unknown): CatalogTarget | null {
    if (!target || typeof target !== 'object') return null
    const candidate = target as Partial<CatalogTarget>
    const id = getText(candidate.id)
    return isCatalogScope(candidate.scope) && id ? { scope: candidate.scope, id } : null
}

function getTargetColumn(scope: CatalogScope) {
    switch (scope) {
        case 'family': return 'family_code'
        case 'reference': return 'reference_id'
        case 'version': return 'version_id'
        case 'sku': return 'id'
    }
}

function getText(value: unknown) {
    const text = String(value ?? '').trim()
    return text || null
}

function getPreviewDetail(context: CatalogTargetContext) {
    const familyCode = getText(context.family_code)
    const referenceCode = getText(context.reference_code)

    if (context.catalog_scope === 'family') return getText(context.product_type) || undefined
    if (context.catalog_scope === 'reference') return familyCode || undefined
    if (context.catalog_scope === 'version') {
        return [referenceCode, getText(context.sku_base)].filter(Boolean).join(' · ') || undefined
    }

    return [getText(context.color_name), referenceCode].filter(Boolean).join(' · ') || undefined
}

function toPreviewOption(context: CatalogTargetContext): TemplatePreviewTargetOption {
    return {
        scope: context.catalog_scope,
        id: context.catalog_target_id,
        code: context.code,
        name: getText(context.final_name_es) || context.code,
        detail: getPreviewDetail(context),
    }
}

function withPreviewAliases(context: CatalogTargetContext): TemplatePreviewTargetContext {
    const colorName = getText(context.color_name)
    const colorCode = getText(context.color_code)

    return {
        ...context,
        name_color_sap: colorName,
        color: colorName || colorCode || 'Sin Color',
    }
}

function getTemplateBrandScope(brandScope: TemplateBrandScope | null | undefined): TemplateBrandScope {
    return brandScope === 'private_label' ? 'private_label' : 'firplak'
}

async function assertTemplateAccess() {
    await assertPermission('module:templates')
}

async function isPreviewTargetAvailable(
    target: CatalogTarget,
    brandScope: TemplateBrandScope,
    privateLabelClientName?: string | null,
) {
    const targetColumn = getTargetColumn(target.scope)
    const clientName = getText(privateLabelClientName)
    const params: string[] = [target.id]
    let brandClause = "NULLIF(BTRIM(COALESCE(available_sku.resolved_private_label_client_name, '')), '') IS NULL"

    if (brandScope === 'private_label') {
        if (!clientName) return false
        params.push(clientName)
        brandClause = "UPPER(BTRIM(COALESCE(available_sku.resolved_private_label_client_name, ''))) = UPPER($2)"
    }

    const rows = await dbQuery(`
        SELECT 1
        FROM public.v_ui_generate_list available_sku
        WHERE available_sku.${targetColumn} = $1
          AND COALESCE(available_sku.is_exportable, true) = true
          AND ${brandClause}
        LIMIT 1
    `, params)

    return rows.length > 0
}

export async function searchTemplatePreviewTargets(
    scope: CatalogScope,
    search: string,
    brandScope: TemplateBrandScope = 'firplak',
    privateLabelClientName?: string | null,
): Promise<TemplatePreviewTargetOption[]> {
    await assertTemplateAccess()

    if (!isCatalogScope(scope)) return []
    const query = search.trim()
    if (query.length < SEARCH_MINIMUM_LENGTH) return []

    const result = await listCatalogTargetContexts({
        scope,
        search: query,
        brandScope: getTemplateBrandScope(brandScope),
        privateLabelClientName,
    })

    return result.targets.map(toPreviewOption)
}

export async function getTemplatePreviewTarget(
    target: CatalogTarget,
    brandScope: TemplateBrandScope = 'firplak',
    privateLabelClientName?: string | null,
): Promise<TemplatePreviewTargetContext | null> {
    await assertTemplateAccess()

    const normalizedTarget = normalizePreviewTarget(target)
    if (!normalizedTarget) return null

    const context = await resolveCatalogTargetContext(normalizedTarget)
    if (!context || !context.is_exportable) return null

    const normalizedBrandScope = getTemplateBrandScope(brandScope)
    const isAvailable = await isPreviewTargetAvailable(normalizedTarget, normalizedBrandScope, privateLabelClientName)
    return isAvailable ? withPreviewAliases(context) : null
}

export async function getTemplatePreviewBase(
    scope: CatalogScope,
    brandScope: TemplateBrandScope = 'firplak',
    privateLabelClientName?: string | null,
): Promise<TemplatePreviewTargetContext | null> {
    await assertTemplateAccess()

    if (!isCatalogScope(scope)) return null
    const result = await listCatalogTargetContexts({
        scope,
        brandScope: getTemplateBrandScope(brandScope),
        privateLabelClientName,
        sort: 'name_length',
        limit: 1,
    })

    return result.targets[0] ? withPreviewAliases(result.targets[0]) : null
}

export async function getRandomTemplatePreviewTarget(
    scope: CatalogScope,
    excludeId?: string | null,
    brandScope: TemplateBrandScope = 'firplak',
    privateLabelClientName?: string | null,
): Promise<TemplatePreviewTargetContext | null> {
    await assertTemplateAccess()

    if (!isCatalogScope(scope)) return null
    const filters = {
        scope,
        brandScope: getTemplateBrandScope(brandScope),
        privateLabelClientName,
    }
    const firstPage = await listCatalogTargetContexts({ ...filters, limit: 1 })
    if (firstPage.totalCount === 0) return null

    const attempts = Math.min(4, firstPage.totalCount)
    let fallback: CatalogTargetContext | null = null

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const offset = Math.floor(Math.random() * firstPage.totalCount)
        const page = await listCatalogTargetContexts({ ...filters, limit: 1, offset })
        const candidate = page.targets[0]
        if (!candidate) continue
        fallback = candidate
        if (candidate.catalog_target_id !== excludeId) return withPreviewAliases(candidate)
    }

    return fallback ? withPreviewAliases(fallback) : null
}

/**
 * Transitional SKU-only adapter kept while the builder moves to the typed
 * catalog-target selector.
 */
export async function searchTemplatePreviewProducts(
    search: string,
    brandScope: TemplateBrandScope = 'firplak',
    privateLabelClientName?: string | null,
): Promise<TemplatePreviewProductOption[]> {
    const targets = await searchTemplatePreviewTargets('sku', search, brandScope, privateLabelClientName)
    return targets.map((target) => ({
        skuComplete: target.code,
        name: target.name,
        colorName: target.detail?.split(' · ')[0] || null,
    }))
}

/**
 * Transitional SKU-only adapter kept while the builder moves to the typed
 * catalog-target selector.
 */
export async function getPreviewProductBySku(
    skuComplete: string,
    brandScope: TemplateBrandScope = 'firplak',
    privateLabelClientName?: string | null,
) {
    const code = skuComplete.trim()
    if (!code) return null

    const targets = await searchTemplatePreviewTargets('sku', code, brandScope, privateLabelClientName)
    const exact = targets.find((target) => target.code.localeCompare(code, undefined, { sensitivity: 'accent' }) === 0)
    return exact
        ? getTemplatePreviewTarget({ scope: 'sku', id: exact.id }, brandScope, privateLabelClientName)
        : null
}
