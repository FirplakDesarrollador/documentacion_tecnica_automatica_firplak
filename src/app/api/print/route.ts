import { NextResponse } from 'next/server'

import { launchBrowser } from '@/lib/export/launchBrowser'
import { dbQuery } from '@/lib/supabase'
import { isCatalogScope, type CatalogTarget } from '@/lib/templates/catalogScope'
import {
    getActiveTemplateCatalogSource,
    getPersistedTemplateRenderSettings,
    resolveTemplateCatalogTarget,
    type TemplateCatalogSource,
} from '@/lib/templates/catalogScopeServer'
import {
    findRequiredBarcodeErrors,
    hydrateCoreTemplateForServerRender,
    type ServerTemplateElement,
} from '@/lib/templates/serverTemplateRender'
import {
    parseTemplateRenderRuntimeValues,
    type TemplateRenderRuntimeValues,
} from '@/lib/templates/printRuntimeVariables'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_FORMATS = new Set(['pdf', 'jpg'])
const CORE_FIRPLAK_SOURCE = 'core_firplak'
const GENERIC_DATASETS_SOURCE = 'custom_datasets'

type TemplateElement = Record<string, unknown> & {
    type?: string
    required?: boolean
    barcodeError?: string
    dataField?: string
}

type PrintPayload = {
    templateId: string
    productId: string | null
    catalogTarget: CatalogTarget | null
    isExternalSource: boolean
    elements: TemplateElement[]
    runtimeValues: TemplateRenderRuntimeValues | null
    format: 'pdf' | 'jpg'
    width: number
    height: number
    templateFontFamily: string | null
    copies: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`
}

function normalizeDataSource(value: string | null | undefined): string {
    return String(value || CORE_FIRPLAK_SOURCE).trim()
}

function isExternalDataSource(dataSource: string): boolean {
    return dataSource === GENERIC_DATASETS_SOURCE || UUID_RE.test(dataSource)
}

async function getLinkedDatasetIds(templateId: string): Promise<string[]> {
    const rows = await dbQuery(
        `SELECT dataset_id
         FROM public.template_dataset_links
         WHERE template_id = $1`,
        [templateId]
    ) as { dataset_id: string | null }[]

    return rows
        .map((row) => row.dataset_id)
        .filter((id): id is string => Boolean(id && UUID_RE.test(id)))
}

async function getAllowedDatasetIdsForTemplate(template: Pick<TemplateCatalogSource, 'id' | 'data_source'>): Promise<string[]> {
    const dataSource = normalizeDataSource(template.data_source)
    if (dataSource === GENERIC_DATASETS_SOURCE) {
        return getLinkedDatasetIds(template.id)
    }

    if (UUID_RE.test(dataSource)) {
        return [dataSource]
    }

    return []
}

function parseCatalogTarget(value: unknown): { value: CatalogTarget | null; error: string | null } {
    if (value === null || value === undefined) return { value: null, error: null }
    if (!isPlainObject(value)) return { value: null, error: 'Objetivo de catalogo invalido' }

    const scope = value.scope
    const id = value.id == null ? '' : String(value.id).trim()
    if (!isCatalogScope(scope) || !id || id.length > 200) {
        return { value: null, error: 'Objetivo de catalogo invalido' }
    }

    return { value: { scope, id }, error: null }
}

function catalogTargetErrorStatus(error: string): number {
    if (error.includes('no encontrada') || error.includes('no existe')) return 404
    if (error.includes('marca')) return 403
    if (error.includes('inactiva')) return 409
    return 400
}

async function externalDatasetRowExists(productId: string, datasetIds: string[]): Promise<boolean> {
    if (datasetIds.length === 0) return false

    const datasetList = datasetIds.map(sqlLiteral).join(',')
    const rows = await dbQuery(
        `SELECT id
         FROM public.custom_dataset_rows
         WHERE id = $1
           AND dataset_id IN (${datasetList})
         LIMIT 1`,
        [productId]
    )

    return rows.length > 0
}

function parsePrintPayload(raw: unknown): { value: PrintPayload | null; error: string | null } {
    if (!isPlainObject(raw)) {
        return { value: null, error: 'Payload invalido' }
    }

    const templateId = raw.templateId == null ? '' : String(raw.templateId).trim()
    const productId = raw.productId == null ? null : String(raw.productId).trim()
    const targetResult = parseCatalogTarget(raw.catalogTarget ?? raw.target)
    const runtimeValues = parseTemplateRenderRuntimeValues(raw.runtimeValues)
    const isExternalSource = raw.isExternalSource === true
    const format = String(raw.format ?? 'pdf').trim().toLowerCase()
    const width = Number(raw.width ?? 800)
    const height = Number(raw.height ?? 400)
    const copies = Number(raw.copies ?? 1)
    const templateFontFamily = raw.templateFontFamily == null ? null : String(raw.templateFontFamily).trim()
    const elements = Array.isArray(raw.elements)
        ? raw.elements.filter((item): item is TemplateElement => isPlainObject(item))
        : []

    if (!templateId || !UUID_RE.test(templateId)) {
        return { value: null, error: 'templateId invalido' }
    }

    if (targetResult.error) {
        return { value: null, error: targetResult.error }
    }

    if (runtimeValues === null) {
        return { value: null, error: 'Valores de ejecucion invalidos' }
    }

    if (elements.length > 500) {
        return { value: null, error: 'La plantilla supera el maximo de elementos permitido' }
    }

    if (productId && productId.length > 200) {
        return { value: null, error: 'productId invalido' }
    }

    if (productId && !targetResult.value && !UUID_RE.test(productId)) {
        return { value: null, error: 'productId invalido' }
    }

    if (!ALLOWED_FORMATS.has(format)) {
        return { value: null, error: 'Formato no soportado' }
    }

    if (!Number.isFinite(width) || width < 50 || width > 5000) {
        return { value: null, error: 'Ancho fuera de rango' }
    }

    if (!Number.isFinite(height) || height < 50 || height > 5000) {
        return { value: null, error: 'Alto fuera de rango' }
    }

    if (!Number.isInteger(copies) || copies < 1 || copies > 999) {
        return { value: null, error: 'Cantidad de copias invalida' }
    }

    if (templateFontFamily && templateFontFamily.length > 120) {
        return { value: null, error: 'templateFontFamily invalido' }
    }

    return {
        value: {
            templateId,
            productId,
            catalogTarget: targetResult.value,
            isExternalSource,
            elements,
            runtimeValues,
            format: format as 'pdf' | 'jpg',
            width,
            height,
            templateFontFamily,
            copies,
        },
        error: null,
    }
}

export async function POST(req: Request) {
    const guard = await apiGuard('admin', 'production')
    if (guard.response) {
        return guard.response
    }

    let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null

    try {
        const rawBody = await req.json().catch(() => null)
        const parsed = parsePrintPayload(rawBody)
        if (!parsed.value) {
            return NextResponse.json({ error: parsed.error || 'Payload invalido' }, { status: 400 })
        }

        const payload = parsed.value

        const templateSource = await getActiveTemplateCatalogSource(payload.templateId)
        if (!templateSource) {
            return NextResponse.json({ error: 'Plantilla no encontrada o inactiva' }, { status: 404 })
        }

        const dataSource = normalizeDataSource(templateSource.data_source)
        const templateUsesExternalRows = isExternalDataSource(dataSource)
        let renderElements: ServerTemplateElement[] = payload.elements
        let renderWidth = payload.width
        let renderHeight = payload.height
        let renderTemplateFontFamily = payload.templateFontFamily

        if (templateUsesExternalRows) {
            if (payload.elements.length === 0) {
                return NextResponse.json({ error: 'Faltan elementos de la plantilla' }, { status: 400 })
            }
            if (!payload.productId) {
                return NextResponse.json({ error: 'Registro externo requerido para imprimir' }, { status: 400 })
            }

            const allowedDatasetIds = await getAllowedDatasetIdsForTemplate(templateSource)
            if (allowedDatasetIds.length === 0) {
                return NextResponse.json({
                    error: 'La plantilla no tiene una base de datos asociada para imprimir',
                }, { status: 409 })
            }

            const rowExists = await externalDatasetRowExists(payload.productId, allowedDatasetIds)
            if (!rowExists) {
                return NextResponse.json({
                    error: 'El registro no pertenece a una base de datos asociada a esta plantilla',
                }, { status: 403 })
            }
        } else {
            const legacySkuTarget = payload.productId && UUID_RE.test(payload.productId)
                ? { scope: 'sku' as const, id: payload.productId }
                : null
            const catalogTarget = payload.catalogTarget ?? legacySkuTarget

            if (!catalogTarget) {
                return NextResponse.json({ error: 'Objetivo de catalogo requerido para imprimir' }, { status: 400 })
            }

            const resolvedTarget = await resolveTemplateCatalogTarget(payload.templateId, catalogTarget)
            if (resolvedTarget.error || !resolvedTarget.context || !resolvedTarget.template) {
                const error = resolvedTarget.error || 'No fue posible resolver el objetivo de catálogo'
                return NextResponse.json(
                    { error },
                    { status: catalogTargetErrorStatus(error) }
                )
            }

            const persistedRenderSettings = getPersistedTemplateRenderSettings(resolvedTarget.template)
            if (!persistedRenderSettings) {
                return NextResponse.json(
                    { error: 'La plantilla Core no tiene dimensiones válidas para imprimir' },
                    { status: 409 },
                )
            }
            renderWidth = persistedRenderSettings.widthPx
            renderHeight = persistedRenderSettings.heightPx
            renderTemplateFontFamily = persistedRenderSettings.templateFontFamily

            try {
                renderElements = await hydrateCoreTemplateForServerRender({
                    elementsJson: resolvedTarget.template.elements_json,
                    context: resolvedTarget.context,
                    runtimeValues: payload.runtimeValues ?? undefined,
                    includePrintRuntime: true,
                })
            } catch (error) {
                const message = error instanceof Error ? error.message : 'No fue posible preparar la plantilla para imprimir'
                return NextResponse.json(
                    { error: message },
                    { status: message.includes('OF') ? 400 : 409 },
                )
            }
        }

        const invalidRequiredBarcodes = findRequiredBarcodeErrors(renderElements)
        if (invalidRequiredBarcodes.length > 0) {
            return NextResponse.json({
                error: 'Datos de codigo de barras invalidos',
                details: invalidRequiredBarcodes,
            }, { status: 409 })
        }

        browser = await launchBrowser()
        const page = await browser.newPage()
        await page.setViewport({ width: renderWidth, height: renderHeight, deviceScaleFactor: 2 })

        const requestUrl = new URL(req.url)
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
        const targetUrl = `${baseUrl}/export-render`
        const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

        await page.evaluateOnNewDocument((injectedPayload: string) => {
            window.localStorage.setItem('__EXPORT_DATA__', injectedPayload)
        }, JSON.stringify({
            elements: renderElements,
            width: renderWidth,
            height: renderHeight,
            templateFontFamily: renderTemplateFontFamily,
        }))

        if (bypassSecret) {
            await page.setExtraHTTPHeaders({
                'x-vercel-protection-bypass': bypassSecret,
            })
        }

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

        try {
            await page.waitForFunction('window.__DOCUMENT_RENDER_READY__ === true', { timeout: 15000 })
        } catch (error) {
            console.warn('Timeout esperando __DOCUMENT_RENDER_READY__, procediendo de todos modos', error)
        }

        await page.evaluateHandle('document.fonts.ready')

        let resultBuffer: Buffer | Uint8Array
        let contentType = ''

        if (payload.format === 'pdf') {
            resultBuffer = await page.pdf({
                width: `${payload.width}px`,
                height: `${payload.height}px`,
                printBackground: true,
                pageRanges: '1',
            })
            contentType = 'application/pdf'
        } else {
            resultBuffer = await page.screenshot({ type: 'jpeg', quality: 100, fullPage: true }) as Buffer
            contentType = 'image/jpeg'
        }

        return new NextResponse(resultBuffer as unknown as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="documento-impresion.${payload.format}"`,
                'X-Print-Copies': String(payload.copies),
            },
        })
    } catch (error) {
        console.error('Print Error:', error)
        return NextResponse.json({ error: 'Error al generar documento para impresion' }, { status: 500 })
    } finally {
        if (browser) {
            await browser.close()
        }
    }
}
