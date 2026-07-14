"use server"

import { dbQuery } from "@/lib/supabase"
import { revalidatePath } from "next/cache"
import { normalizeTemplateFontFamily } from "@/lib/templates/templateTypography"
import { DEFAULT_MEDIA_GAP_MM, normalizePrintTarget, type PrintTarget } from "@/lib/printLayout"
import { assertPermission } from '@/utils/auth/access'
import {
    BASE_NAMING_VARIABLE_FIELDS,
    isAllowedDynamicNamingKey,
    normalizeNamingVariableKey,
    type NamingVariableSource,
} from '@/lib/engine/namingVariableCatalog'
import {
    extractTemplateScopeBindings,
    formatCatalogScopeValidationIssue,
    getTemplateCatalogScope,
    isCoreCatalogDataSource,
    normalizeCatalogScope,
    validateTemplateScopeBindings,
    type CatalogScope,
} from '@/lib/templates/catalogScope'
import { listCatalogTargetContexts } from '@/lib/templates/catalogScopeServer'
import {
    getPublicDocumentOptions,
    resolvePublicDocumentForProduct,
} from '@/lib/productDocuments'

async function assertAdminAccess() {
    await assertPermission('module:templates')
}

/**
 * Bumps a semver version string (MAJOR.MINOR.PATCH) by incrementing PATCH.
 *   1.0.0 → 1.0.1 → ... → 1.0.9 → 1.1.0 → ... → 1.9.9 → 2.0.0
 */
function bumpVersion(current: unknown): string {
    const v = String(current ?? '1.0.0')
    const parts = v.split('.').map(Number)
    let [major, minor, patch] = parts.length === 3 ? parts : [1, 0, 0]

    patch++
    if (patch > 9) {
        patch = 0
        minor++
        if (minor > 9) {
            minor = 0
            major++
        }
    }

    return `${major}.${minor}.${patch}`
}

function sqlNullableNumber(value: unknown): string {
    const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : 'NULL'
}

function sqlRequiredNumber(value: unknown, fallback: number): string {
    const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : String(fallback)
}

type TemplateRow = Record<string, unknown>

function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
}

function parseDatasetRow(value: unknown): Record<string, unknown> {
    if (typeof value !== 'string') return asRecord(value)

    try {
        return asRecord(JSON.parse(value) as unknown)
    } catch {
        return {}
    }
}

const DYNAMIC_NAMING_SOURCES: ReadonlySet<string> = new Set([
    'ref_attrs',
    'version_attrs',
    'sku_attrs',
])

async function loadTemplateVariableSources(): Promise<Map<string, NamingVariableSource>> {
    const variableSources = new Map<string, NamingVariableSource>(
        BASE_NAMING_VARIABLE_FIELDS.map((field) => [normalizeNamingVariableKey(field.field), field.source]),
    )
    const rows = await dbQuery(`
        SELECT DISTINCT key, source
        FROM (
            SELECT jsonb_object_keys(COALESCE(f.ref_attrs_schema, '{}'::jsonb)) AS key, 'ref_attrs' AS source
            FROM public.families f

            UNION

            SELECT jsonb_object_keys(COALESCE(r.ref_attrs, '{}'::jsonb)) AS key, 'ref_attrs' AS source
            FROM public.product_references r

            UNION

            SELECT jsonb_object_keys(COALESCE(v.version_attrs, '{}'::jsonb)) AS key, 'version_attrs' AS source
            FROM public.product_versions v

            UNION

            SELECT jsonb_object_keys(COALESCE(g.automatic_version_rules, '{}'::jsonb)) AS key, 'version_attrs' AS source
            FROM public.global_version_rules g

            UNION

            SELECT jsonb_object_keys(COALESCE(s.sku_attrs, '{}'::jsonb)) AS key, 'sku_attrs' AS source
            FROM public.product_skus s
        ) discovered
        WHERE key IS NOT NULL AND btrim(key) <> ''
        ORDER BY source ASC, key ASC
    `)

    for (const row of rows || []) {
        const field = normalizeNamingVariableKey(String(row.key || ''))
        const source = String(row.source || '')
        if (!isAllowedDynamicNamingKey(field) || !DYNAMIC_NAMING_SOURCES.has(source)) continue
        if (!variableSources.has(field)) {
            variableSources.set(field, source as NamingVariableSource)
        }
    }

    return variableSources
}

type ScopeValidationResult =
    | { valid: true }
    | { valid: false; error: string }

function parseTemplateElementsForScopeValidation(value: unknown):
    | { valid: true; elements: unknown[] }
    | { valid: false; error: string } {
    if (Array.isArray(value)) return { valid: true, elements: value }
    if (value === null || value === undefined || String(value).trim() === '') {
        return { valid: true, elements: [] }
    }

    if (typeof value !== 'string') {
        return { valid: false, error: 'El diseño de la plantilla debe ser una lista de elementos válida.' }
    }

    try {
        const parsed = JSON.parse(value) as unknown
        if (!Array.isArray(parsed)) {
            return { valid: false, error: 'El diseño de la plantilla debe ser una lista de elementos válida.' }
        }
        return { valid: true, elements: parsed }
    } catch {
        return { valid: false, error: 'El diseño de la plantilla no contiene JSON válido.' }
    }
}

async function validateCoreTemplateScope(
    scope: CatalogScope,
    elementsJson: unknown,
    exportFilenameFormat: unknown,
): Promise<ScopeValidationResult> {
    const parsedElements = parseTemplateElementsForScopeValidation(elementsJson)
    if (!parsedElements.valid) return parsedElements

    const variableSources = await loadTemplateVariableSources()
    const bindings = extractTemplateScopeBindings(
        parsedElements.elements,
        typeof exportFilenameFormat === 'string' ? exportFilenameFormat : null,
    )
    const issues = validateTemplateScopeBindings(scope, bindings, variableSources)

    if (issues.length === 0) return { valid: true }

    const listedIssues = issues
        .slice(0, 5)
        .map(formatCatalogScopeValidationIssue)
        .join(' ')
    const remainingCount = issues.length - 5
    return {
        valid: false,
        error: `El alcance seleccionado no permite guardar la plantilla. ${listedIssues}${
            remainingCount > 0 ? ` Hay ${remainingCount} incompatibilidad(es) adicional(es).` : ''
        }`,
    }
}

export async function createTemplate(data: {
    name: string
    width_mm: number
    height_mm: number
    data_source: string
    template_font_family?: string
    brand_scope?: 'firplak' | 'private_label'
    private_label_client_name?: string | null
    catalog_scope?: CatalogScope | null
    print_target?: PrintTarget
    media_width_mm?: number | null
    media_length_mm?: number | null
    media_gap_mm?: number | null
}) {
    await assertAdminAccess()

    try {
        const orientation = data.width_mm >= data.height_mm ? 'horizontal' : 'vertical'
        const dataSource = String(data.data_source || '').trim() || 'core_firplak'
        const catalogScope = getTemplateCatalogScope(dataSource, data.catalog_scope)
        const brandScope = isCoreCatalogDataSource(dataSource) && data.brand_scope === 'private_label' ? 'private_label' : 'firplak'
        const plc = data.private_label_client_name ? String(data.private_label_client_name).trim() : ''
        const templateFontFamily = normalizeTemplateFontFamily(data.template_font_family)
        const printTarget = normalizePrintTarget(data.print_target)

        if (brandScope === 'private_label' && !plc) {
            return { success: false, error: 'Cliente marca propia requerido' }
        }

        const rows = await dbQuery(`
            INSERT INTO public.plantillas_doc_tec (
                name,
                width_mm,
                height_mm,
                orientation,
                document_type,
                elements_json,
                active,
                version,
                print_target,
                media_width_mm,
                media_length_mm,
                media_gap_mm,
                data_source,
                catalog_scope,
                template_font_family,
                brand_scope,
                private_label_client_name
            )
            VALUES (
                '${data.name.replace(/'/g, "''")}',
                ${data.width_mm},
                ${data.height_mm},
                '${orientation}',
                'label',
                '[]',
                true,
                '1.0.0',
                '${printTarget}',
                ${sqlNullableNumber(data.media_width_mm)},
                ${sqlNullableNumber(data.media_length_mm)},
                ${sqlRequiredNumber(data.media_gap_mm, DEFAULT_MEDIA_GAP_MM)},
                '${dataSource.replace(/'/g, "''")}',
                ${catalogScope ? `'${catalogScope}'` : 'NULL'},
                '${templateFontFamily}',
                '${brandScope}',
                ${brandScope === 'private_label' ? `'${plc.replace(/'/g, "''")}'` : 'NULL'}
            )
            RETURNING id
        `)

        revalidatePath('/templates')
        return { success: true, id: rows?.[0]?.id }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function duplicateTemplate(id: string, newName: string, dataSource: string, width_mm: number, height_mm: number) {
    await assertAdminAccess()

    try {
        const rows = await dbQuery(`SELECT * FROM public.plantillas_doc_tec WHERE id = '${id}' LIMIT 1`)
        if (!rows || rows.length === 0) return { success: false, error: 'Plantilla original no encontrada' }

        const original = rows[0] as TemplateRow
        const destinationDataSource = String(dataSource || '').trim()
        if (!destinationDataSource) return { success: false, error: 'Fuente de datos requerida' }

        const originalDataSource = String(original.data_source || 'core_firplak')
        const catalogScope = getTemplateCatalogScope(
            destinationDataSource,
            isCoreCatalogDataSource(originalDataSource) ? original.catalog_scope : undefined,
        )
        const originalBrandScope = original?.brand_scope === 'private_label' ? 'private_label' : 'firplak'
        const originalPrivateLabelClientName =
            originalBrandScope === 'private_label' && original?.private_label_client_name
                ? String(original.private_label_client_name)
                : null
        const originalTemplateFontFamily = normalizeTemplateFontFamily(
            typeof original.template_font_family === 'string' ? original.template_font_family : undefined,
        )

        // Escape elements_json safely. Original is already a stringified JSON.
        const safeJson = original.elements_json ? String(original.elements_json).replace(/'/g, "''") : '[]'
        const finalWidth = width_mm || Number(original.width_mm) || 1
        const finalHeight = height_mm || Number(original.height_mm) || 1
        const orientation = finalWidth >= finalHeight ? 'horizontal' : 'vertical'

        if (catalogScope) {
            const scopeValidation = await validateCoreTemplateScope(
                catalogScope,
                original.elements_json,
                original.export_filename_format,
            )
            if (!scopeValidation.valid) return { success: false, error: scopeValidation.error }
        }

        const inserted = await dbQuery(`
            INSERT INTO public.plantillas_doc_tec (
                name,
                width_mm,
                height_mm,
                orientation,
                document_type,
                elements_json,
                active,
                version,
                data_source,
                catalog_scope,
                template_font_family,
                export_formats,
                export_filename_format,
                print_target,
                media_width_mm,
                media_length_mm,
                media_gap_mm,
                brand_scope,
                private_label_client_name
            )
            VALUES (
                '${newName.replace(/'/g, "''")}', 
                ${finalWidth}, 
                ${finalHeight}, 
                '${orientation}', 

                '${String(original.document_type || 'label').replace(/'/g, "''")}',
                '${safeJson}', 
                true, 
                '1.0.0',
                '${destinationDataSource.replace(/'/g, "''")}',
                ${catalogScope ? `'${catalogScope}'` : 'NULL'},
                '${originalTemplateFontFamily}',
                ${original.export_formats ? `'${String(original.export_formats).replace(/'/g, "''")}'` : 'NULL'},
                ${original.export_filename_format ? `'${String(original.export_filename_format).replace(/'/g, "''")}'` : 'NULL'},
                '${normalizePrintTarget(original.print_target)}',
                ${sqlNullableNumber(original.media_width_mm)},
                ${sqlNullableNumber(original.media_length_mm)},
                ${sqlRequiredNumber(original.media_gap_mm, DEFAULT_MEDIA_GAP_MM)},
                '${originalBrandScope}',
                ${originalPrivateLabelClientName ? `'${originalPrivateLabelClientName.replace(/'/g, "''")}'` : 'NULL'}
            )
            RETURNING id
        `)

        revalidatePath('/templates')
        return { success: true, id: inserted?.[0]?.id }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function updateTemplate(id: string, data: {
    elements_json?: string
    name?: string
    width_mm?: number
    height_mm?: number
    export_formats?: string
    export_filename_format?: string
    data_source?: string
    catalog_scope?: CatalogScope | null
    template_font_family?: string
    brand_scope?: 'firplak' | 'private_label'
    private_label_client_name?: string | null
    print_target?: PrintTarget
    media_width_mm?: number | null
    media_length_mm?: number | null
    media_gap_mm?: number | null
}) {
    await assertAdminAccess()

    try {
        const templateRows = await dbQuery(`
            SELECT data_source, catalog_scope, elements_json, export_filename_format, version
            FROM public.plantillas_doc_tec
            WHERE id='${id.replace(/'/g, "''")}'
            LIMIT 1
        `)
        if (!templateRows || templateRows.length === 0) {
            return { success: false, error: 'Plantilla no encontrada' }
        }

        const currentTemplate = templateRows[0] as TemplateRow
        const hasDataSourceUpdate = typeof data.data_source === 'string' && data.data_source.trim() !== ''
        const nextDataSource = hasDataSourceUpdate
            ? data.data_source!.trim()
            : String(currentTemplate.data_source || 'core_firplak')
        const hasCatalogScopeUpdate = data.catalog_scope !== undefined
        const nextCatalogScope = getTemplateCatalogScope(
            nextDataSource,
            hasCatalogScopeUpdate ? data.catalog_scope : currentTemplate.catalog_scope,
        )
        const hasElementsUpdate = Boolean(data.elements_json)
        const hasFilenameUpdate = Boolean(data.export_filename_format)

        if (
            nextCatalogScope &&
            (hasElementsUpdate || hasFilenameUpdate || hasDataSourceUpdate || hasCatalogScopeUpdate)
        ) {
            const scopeValidation = await validateCoreTemplateScope(
                nextCatalogScope,
                hasElementsUpdate ? data.elements_json : currentTemplate.elements_json,
                hasFilenameUpdate ? data.export_filename_format : currentTemplate.export_filename_format,
            )
            if (!scopeValidation.valid) return { success: false, error: scopeValidation.error }
        }

        const nameClause = data.name ? `, name='${data.name.replace(/'/g, "''")}' ` : ''
        const formatsClause = data.export_formats ? `, export_formats='${data.export_formats.replace(/'/g, "''")}' ` : ''
        const filenameClause = hasFilenameUpdate ? `, export_filename_format='${data.export_filename_format!.replace(/'/g, "''")}' ` : ''
        const sourceClause = hasDataSourceUpdate ? `, data_source='${nextDataSource.replace(/'/g, "''")}' ` : ''
        const catalogScopeClause =
            hasDataSourceUpdate || hasCatalogScopeUpdate
                ? `, catalog_scope=${nextCatalogScope ? `'${nextCatalogScope}'` : 'NULL'} `
                : ''
        const templateFontClause =
            data.template_font_family !== undefined
                ? `, template_font_family='${normalizeTemplateFontFamily(data.template_font_family)}' `
                : ''
        const widthClause = data.width_mm ? `, width_mm=${data.width_mm} ` : ''
        const heightClause = data.height_mm ? `, height_mm=${data.height_mm} ` : ''
        const brandScopeClause = data.brand_scope ? `, brand_scope='${data.brand_scope}' ` : ''
        const printTargetClause =
            data.print_target !== undefined
                ? `, print_target='${normalizePrintTarget(data.print_target)}' `
                : ''
        const mediaWidthClause =
            data.media_width_mm !== undefined
                ? `, media_width_mm=${sqlNullableNumber(data.media_width_mm)} `
                : ''
        const mediaLengthClause =
            data.media_length_mm !== undefined
                ? `, media_length_mm=${sqlNullableNumber(data.media_length_mm)} `
                : ''
        const mediaGapClause =
            data.media_gap_mm !== undefined
                ? `, media_gap_mm=${sqlRequiredNumber(data.media_gap_mm, DEFAULT_MEDIA_GAP_MM)} `
                : ''

        const plcNormalized =
            data.private_label_client_name !== undefined && data.private_label_client_name !== null
                ? String(data.private_label_client_name).trim()
                : null

        const plcClause =
            data.private_label_client_name !== undefined
                ? (plcNormalized ? `, private_label_client_name='${plcNormalized.replace(/'/g, "''")}' ` : `, private_label_client_name=NULL `)
                : ''
        
        let orientationClause = ''
        if (data.width_mm && data.height_mm) {
            orientationClause = `, orientation='${data.width_mm >= data.height_mm ? 'horizontal' : 'vertical'}'`
        }

        const elementsClause = hasElementsUpdate ? `elements_json='${data.elements_json!.replace(/'/g, "''")}', ` : ''

        // If switching to Firplak scope, force private_label_client_name to NULL to satisfy DB checks.
        const forcePlcNullClause =
            data.brand_scope === 'firplak'
                ? `, private_label_client_name=NULL `
                : ''

        let versionClause = ''
        if (hasElementsUpdate) {
            const currentVersion = currentTemplate.version || '1.0.0'
            const newVersion = bumpVersion(currentVersion)
            versionClause = `, version='${newVersion}' `
        }

        await dbQuery(`
            UPDATE public.plantillas_doc_tec SET
                ${elementsClause}
                updated_at=now()
                ${nameClause} 
                ${widthClause}
                ${heightClause}
                ${orientationClause}
                ${formatsClause} 
                ${filenameClause} 
                ${sourceClause}
                ${catalogScopeClause}
                ${templateFontClause}
                ${printTargetClause}
                ${mediaWidthClause}
                ${mediaLengthClause}
                ${mediaGapClause}
                ${brandScopeClause}
                ${data.brand_scope === 'firplak' ? forcePlcNullClause : plcClause}
                ${versionClause}
            WHERE id='${id.replace(/'/g, "''")}'
        `)

        revalidatePath('/templates')
        revalidatePath('/templates/builder')
        return { success: true }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

function getPreviewBrandClause(
    dataSource: string,
    brandScope: 'firplak' | 'private_label' = 'firplak',
    privateLabelClientName?: string | null
) {
    if (dataSource !== 'core_firplak') return ''

    if (brandScope === 'private_label') {
        const clientName = String(privateLabelClientName || '').trim()
        if (!clientName) return ` AND 1 = 0 `
        return ` AND UPPER(BTRIM(COALESCE(resolved_private_label_client_name, ''))) = UPPER('${clientName.replace(/'/g, "''")}') `
    }

    return ` AND NULLIF(BTRIM(COALESCE(resolved_private_label_client_name, '')), '') IS NULL `
}

export async function getPreviewProduct(
    dataSource: string = 'core_firplak',
    brandScope: 'firplak' | 'private_label' = 'firplak',
    privateLabelClientName?: string | null
) {
    await assertAdminAccess()

    if (dataSource && dataSource !== 'core_firplak' && dataSource !== 'custom_datasets') {
        try {
            const rows = await dbQuery(`
                SELECT data_json
                FROM public.custom_dataset_rows
                WHERE dataset_id = '${dataSource.replace(/'/g, "''")}'
                LIMIT 10
            `)
            if (rows && rows.length > 0) {
                return { ...parseDatasetRow(rows[0].data_json) }
            }
        } catch (e) {
            console.error("Error fetching preview for custom dataset", e)
        }
        return { error: 'Sin datos' }
    }

    try {
        const brandClause = getPreviewBrandClause(dataSource, brandScope, privateLabelClientName)
        const rows = await dbQuery(`
            SELECT *
            FROM public.v_ui_generate_list
            WHERE final_complete_name_es IS NOT NULL
              AND status != 'INACTIVO'
              ${brandClause}
            LIMIT 50
        `)

        if (!rows || rows.length === 0) {
            return {
                code: 'MOCK-1234',
                final_name_es: 'Mueble de Baño con Espejo y Lavamanos Blanco Premium',
                barcode_text: '7701234567890',
                color_code: 'BLAN'
            }
        }

        const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
        type ComposedProductRow = Parameters<typeof mapRowToComposedProduct>[0]
        const products = (rows as TemplateRow[]).map((row) => mapRowToComposedProduct(row as ComposedProductRow))

        let longest = products[0]
        for (const p of products) {
            if (p.final_name_es && longest.final_name_es && p.final_name_es.length > longest.final_name_es.length) {
                longest = p
            }
        }

        return {
            ...longest,
            name_color_sap: longest.color_name || null,

            color: longest.color_name || longest.color_code || 'Sin Color'
        }
    } catch {
        return {
            code: 'MOCK-1234',
            final_name_es: 'Error cargando datos reales - Mueble de Prueba Largo',
            barcode_text: 'ERROR123',
            color_code: 'ERR',
            color_name: 'Rojo Error',
            color: 'Rojo Error'
        }
    }
}

/**
 * Returns a random active product, optionally excluding the product currently in preview
 * to avoid showing the same one twice in a row.
 */
export async function getRandomPreviewProduct(
    excludeCode?: string,
    dataSource: string = 'core_firplak',
    brandScope: 'firplak' | 'private_label' = 'firplak',
    privateLabelClientName?: string | null
) {
    await assertAdminAccess()

    if (dataSource && dataSource !== 'core_firplak' && dataSource !== 'custom_datasets') {
        try {
            const rows = await dbQuery(`
                SELECT data_json
                FROM public.custom_dataset_rows
                WHERE dataset_id = '${dataSource.replace(/'/g, "''")}'
                ORDER BY RANDOM()
                LIMIT 1
            `)
            if (rows && rows.length > 0) {
                return { ...parseDatasetRow(rows[0].data_json) }
            }
        } catch (e) {
            console.error("Error fetching random preview for custom dataset", e)
        }
        return null
    }

    try {
        const brandClause = getPreviewBrandClause(dataSource, brandScope, privateLabelClientName)
        const excludeClause = excludeCode
            ? `AND sku_complete != '${excludeCode.replace(/'/g, "''")}'`
            : ''

        const rows = await dbQuery(`
            SELECT *
            FROM public.v_ui_generate_list
            WHERE final_complete_name_es IS NOT NULL
              AND status != 'INACTIVO'
              ${brandClause}
            ${excludeClause}
            ORDER BY RANDOM()
            LIMIT 1
        `)

        const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
        let p = rows && rows.length > 0 ? mapRowToComposedProduct(rows[0]) : undefined

        if (!p) {
            // Fallback: retry without the exclusion (edge case: only 1 product in DB)
            const fallbackRows = await dbQuery(`
                SELECT *
                FROM public.v_ui_generate_list
                WHERE final_complete_name_es IS NOT NULL
                  AND status != 'INACTIVO'
                  ${brandClause}
                ORDER BY RANDOM()
                LIMIT 1
            `)
            p = fallbackRows && fallbackRows.length > 0 ? mapRowToComposedProduct(fallbackRows[0]) : undefined
        }

        if (!p) return null

        return {
            ...p,
            name_color_sap: p.color_name || null,
            color: p.color_name || p.color_code || 'Sin Color'
        }
    } catch {
        return null
    }
}

export async function deleteTemplate(id: string) {
    await assertAdminAccess()

    try {
        await dbQuery(`DELETE FROM public.plantillas_doc_tec WHERE id='${id}'`)
        revalidatePath('/templates')
        return { success: true }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function getPublicDocumentQrOptionsAction() {
    await assertAdminAccess()
    return await getPublicDocumentOptions()
}

export async function resolvePublicDocumentUrlsForProductAction(
    product: Record<string, unknown>,
    documentSlots: string[]
) {
    await assertAdminAccess()

    const uniqueSlots = Array.from(new Set((documentSlots || []).map((slot) => String(slot || '').trim()).filter(Boolean)))
    const result: Record<string, string | null> = {}

    for (const slot of uniqueSlots) {
        const resolved = await resolvePublicDocumentForProduct(product, slot)
        result[slot] = resolved?.publicUrl || null
    }

    return result
}

export async function getTemplatesAction() {
    await assertAdminAccess()

    try {
        const rows = await dbQuery(`SELECT * FROM public.plantillas_doc_tec WHERE active = true ORDER BY name ASC`)
        return rows || []
    } catch (e) {
        console.error("Error fetching templates:", e)
        return []
    }
}

export async function getDatasetModeTemplatesAction(): Promise<{ id: string; name: string; elements_json: string; data_source: string }[]> {
    await assertAdminAccess()

    try {
        const rows = await dbQuery(`
            SELECT id, name, elements_json, data_source
            FROM public.plantillas_doc_tec
            WHERE active = true
            ORDER BY name ASC
        `)
        return (rows as TemplateRow[]).map((r) => ({
            id: String(r.id),
            name: String(r.name || ''),
            elements_json: String(r.elements_json || '[]'),
            data_source: String(r.data_source || 'core_firplak'),
        }))
    } catch {
        return []
    }
}

export async function getTemplateLinkedDatasetsAction(templateId: string): Promise<{ id: string; name: string; schema_json: unknown; created_at: string }[]> {
    await assertAdminAccess()

    try {
        const tid = String(templateId || '').trim()
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tid)) return []

        const rows = await dbQuery(`
            SELECT d.id, d.name, d.schema_json, d.created_at
            FROM public.template_dataset_links l
            JOIN public.custom_datasets d ON d.id = l.dataset_id
            WHERE l.template_id = '${tid.replace(/'/g, "''")}'
            ORDER BY d.created_at DESC
        `)

        return (rows as TemplateRow[]).map((r) => ({
            id: String(r.id),
            name: String(r.name || ''),
            schema_json: r.schema_json,
            created_at: String(r.created_at || ''),
        }))
    } catch {
        return []
    }
}

/**
 * Validates generated filename length across the active Core catalog scope or external dataset rows.
 */
export async function validateExportFilenameLength(
    pattern: string,
    dataSource: string = 'core_firplak',
    catalogScope?: CatalogScope | null,
    brandScope: 'firplak' | 'private_label' = 'firplak',
    privateLabelClientName?: string | null,
) {
    await assertAdminAccess()

    try {
        let products: Record<string, unknown>[] = []

        if (isCoreCatalogDataSource(dataSource)) {
            const scope = normalizeCatalogScope(catalogScope)
            const pageSize = 500
            let offset = 0

            while (true) {
                const page = await listCatalogTargetContexts({
                    scope,
                    brandScope: brandScope === 'private_label' ? 'private_label' : 'firplak',
                    privateLabelClientName: brandScope === 'private_label' ? privateLabelClientName : null,
                    limit: pageSize,
                    offset,
                })
                products.push(...page.targets)

                if (page.targets.length === 0 || products.length >= page.totalCount) break
                offset += page.targets.length
            }
        } else if (dataSource && dataSource !== 'custom_datasets') {
            const rows = await dbQuery(`
                SELECT data_json FROM public.custom_dataset_rows 
                WHERE dataset_id = '${dataSource.replace(/'/g, "''")}'
            `)
            products = (rows as TemplateRow[]).map((r) => parseDatasetRow(r.data_json))
        } else {
            const rows = await dbQuery(`
                SELECT *
                FROM public.v_ui_generate_list
                WHERE status != 'INACTIVO'
            `)
            const { mapRowToComposedProduct } = await import('@/lib/engine/product_composer')
            type ComposedProductRow = Parameters<typeof mapRowToComposedProduct>[0]
            products = (rows as TemplateRow[]).map((row) => asRecord(mapRowToComposedProduct(row as ComposedProductRow)))
        }

        if (!products || products.length === 0) return { success: true, count: 0 }

        const { enrichProductDataWithIcons } = await import('@/lib/engine/productUtils')
        const { hydrateText } = await import('@/lib/export/exportUtils')
        const failures: { code: string, length: number, result: string }[] = []

        for (const p of products) {
            // Enriquecer datos usando la lógica oficial
            const context = enrichProductDataWithIcons(p, {})

            // Hydrate pattern using the official engine
            const hydrated = hydrateText(pattern, context)

            if (hydrated.length > 130) {
                failures.push({
                    code: String(p.code || 'N/A'),
                    length: hydrated.length,
                    result: hydrated
                })
            }
        }

        if (failures.length > 0) {
            return { 
                success: false, 
                error: `Reestructurar nombre, ya que en ${failures.length} registros excede los 130 caracteres.`,
                failures: failures.slice(0, 5) // Show top 5 for info
            }
        }

        return { success: true, count: products.length }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}
