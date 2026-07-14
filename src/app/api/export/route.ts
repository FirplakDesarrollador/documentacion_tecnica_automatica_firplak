import { NextResponse } from 'next/server'
import { launchBrowser, resolveExportBrowserMode } from '@/lib/export/launchBrowser'
import { isCatalogScope, type CatalogTarget } from '@/lib/templates/catalogScope'
import {
    getActiveTemplateCatalogSource,
    getPersistedTemplateRenderSettings,
    resolveTemplateCatalogTarget,
    type PersistedTemplateRenderSettings,
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
const CORE_FIRPLAK_SOURCE = 'core_firplak'

type ExportPayload = {
    templateId: string | null
    productId: string | null
    catalogTarget: CatalogTarget | null
    isExternalSource: boolean
    elements: unknown
    runtimeValues: TemplateRenderRuntimeValues | null
    format: string
    width: number
    height: number
    templateFontFamily: string | null
    filename: string | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getClientElements(value: unknown): ServerTemplateElement[] {
    return Array.isArray(value)
        ? value.filter((element): element is ServerTemplateElement => isPlainObject(element))
        : []
}

function parseCatalogTarget(value: unknown): { value: CatalogTarget | null; error: string | null } {
    if (value === null || value === undefined) return { value: null, error: null }
    if (!isPlainObject(value)) return { value: null, error: 'Invalid catalog target' }

    const scope = value.scope
    const id = value.id == null ? '' : String(value.id).trim()
    if (!isCatalogScope(scope) || !id || id.length > 200) {
        return { value: null, error: 'Invalid catalog target' }
    }

    return { value: { scope, id }, error: null }
}

function catalogTargetErrorStatus(error: string): number {
    if (error.includes('no encontrada') || error.includes('no existe')) return 404
    if (error.includes('marca')) return 403
    if (error.includes('inactiva')) return 409
    return 400
}

function parseExportPayload(raw: unknown): { value: ExportPayload | null; error: string | null } {
    if (!isPlainObject(raw)) return { value: null, error: 'Invalid export payload' }

    const templateId = raw.templateId == null ? null : String(raw.templateId).trim()
    const productId = raw.productId == null ? null : String(raw.productId).trim()
    const catalogTargetResult = parseCatalogTarget(raw.catalogTarget ?? raw.target)
    const runtimeValues = parseTemplateRenderRuntimeValues(raw.runtimeValues)

    if (templateId && !UUID_RE.test(templateId)) {
        return { value: null, error: 'Invalid templateId' }
    }
    if (catalogTargetResult.error) {
        return { value: null, error: catalogTargetResult.error }
    }
    if (runtimeValues === null) {
        return { value: null, error: 'Invalid runtime values' }
    }
    if (productId && productId.length > 200) {
        return { value: null, error: 'Invalid productId' }
    }
    if (productId && !catalogTargetResult.value && !UUID_RE.test(productId)) {
        return { value: null, error: 'Invalid productId' }
    }
    if (catalogTargetResult.value && !templateId) {
        return { value: null, error: 'templateId is required for a catalog target' }
    }

    return {
        value: {
            templateId,
            productId,
            catalogTarget: catalogTargetResult.value,
            isExternalSource: raw.isExternalSource === true,
            elements: raw.elements,
            runtimeValues,
            format: String(raw.format ?? 'pdf').trim().toLowerCase(),
            width: Number(raw.width ?? 800),
            height: Number(raw.height ?? 400),
            templateFontFamily: raw.templateFontFamily == null ? null : String(raw.templateFontFamily).trim(),
            filename: raw.filename == null ? null : String(raw.filename).trim(),
        },
        error: null,
    }
}

type ExportRenderResolution = {
    elements: ServerTemplateElement[] | null
    error: string | null
    status: number | null
    renderSettings?: PersistedTemplateRenderSettings
}

function resolveClientExportElements(value: unknown): ExportRenderResolution {
    const clientElements = getClientElements(value)
    return {
        elements: clientElements.length > 0 ? clientElements : null,
        error: clientElements.length > 0 ? null : 'Missing template elements payload',
        status: clientElements.length > 0 ? null : 400,
    }
}

async function resolveExportRenderElements(payload: ExportPayload): Promise<ExportRenderResolution> {
    if (!payload.templateId) {
        return resolveClientExportElements(payload.elements)
    }

    const template = await getActiveTemplateCatalogSource(payload.templateId)
    if (!template) {
        return { elements: null, error: 'Template not found or inactive', status: 404 }
    }

    const dataSource = String(template.data_source || CORE_FIRPLAK_SOURCE).trim()
    if (dataSource !== CORE_FIRPLAK_SOURCE) {
        return resolveClientExportElements(payload.elements)
    }

    const legacySkuTarget = payload.productId && UUID_RE.test(payload.productId)
        ? { scope: 'sku' as const, id: payload.productId }
        : null
    const catalogTarget = payload.catalogTarget ?? legacySkuTarget
    if (!catalogTarget) {
        return { elements: null, error: 'Catalog target is required for Core template export', status: 400 }
    }

    const resolvedTarget = await resolveTemplateCatalogTarget(payload.templateId, catalogTarget)
    if (resolvedTarget.error || !resolvedTarget.context || !resolvedTarget.template) {
        const error = resolvedTarget.error || 'No fue posible resolver el objetivo de catálogo'
        return { elements: null, error, status: catalogTargetErrorStatus(error) }
    }

    const renderSettings = getPersistedTemplateRenderSettings(resolvedTarget.template)
    if (!renderSettings) {
        return {
            elements: null,
            error: 'La plantilla Core no tiene dimensiones válidas para exportar',
            status: 409,
        }
    }

    try {
        return {
            elements: await hydrateCoreTemplateForServerRender({
                elementsJson: resolvedTarget.template.elements_json,
                context: resolvedTarget.context,
                runtimeValues: payload.runtimeValues ?? undefined,
            }),
            error: null,
            status: null,
            renderSettings,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No fue posible preparar la plantilla para exportar'
        return { elements: null, error: message, status: 409 }
    }
}

export async function POST(req: Request) {
    const guard = await apiGuard('module:generate')
    if (guard.response) {
        return guard.response
    }

    let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null

    try {
        const rawBody = await req.json().catch(() => null)
        const parsed = parseExportPayload(rawBody)
        if (!parsed.value) {
            return NextResponse.json({ error: parsed.error || 'Invalid export payload' }, { status: 400 })
        }

        const payload = parsed.value
        const {
            productId,
            isExternalSource,
            format,
            width,
            height,
            templateFontFamily,
            filename,
        } = payload

        const templateRender = await resolveExportRenderElements(payload)
        if (!templateRender.elements) {
            return NextResponse.json(
                { error: templateRender.error || 'No fue posible preparar la plantilla para exportar' },
                { status: templateRender.status || 400 },
            )
        }

        const renderWidth = templateRender.renderSettings?.widthPx ?? width
        const renderHeight = templateRender.renderSettings?.heightPx ?? height
        const renderTemplateFontFamily = templateRender.renderSettings?.templateFontFamily ?? templateFontFamily

        const invalidRequiredBarcodes = findRequiredBarcodeErrors(templateRender.elements)
        if (invalidRequiredBarcodes.length > 0) {
            return NextResponse.json({
                error: 'Invalid required barcode data',
                details: invalidRequiredBarcodes,
            }, { status: 409 })
        }

        if (productId && !payload.templateId) {
            const { composeProductById } = await import('@/lib/engine/product_composer')
            const exportProduct = await composeProductById(productId)

            if (exportProduct) {
                if (exportProduct.is_exportable === false) {
                    return NextResponse.json({
                        error: 'Product is inactive for export',
                        inactive_reasons: exportProduct.inactive_reasons,
                    }, { status: 409 })
                }
            } else if (!isExternalSource) {
                return NextResponse.json({ error: 'Product not found for export validation' }, { status: 404 })
            }
        }

        const browserMode = resolveExportBrowserMode()
        const forcedBrowserMode = process.env.EXPORT_BROWSER?.trim() || 'auto'

        console.info('[export] Starting browser launch', {
            browserMode,
            forcedBrowserMode,
            format,
            width: renderWidth,
            height: renderHeight,
        })

        browser = await launchBrowser()

        const page = await browser.newPage()

        // Set viewport to the requested label size (Escala 4x para impresión ultra nítida)
        await page.setViewport({ width: renderWidth, height: renderHeight, deviceScaleFactor: 4 })

        // Determinar URL base (local o producción)
        const requestUrl = new URL(req.url)
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
        const targetUrl = `${baseUrl}/export-render`
        const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        const hasBypassSecret = Boolean(bypassSecret)

        console.info('[export] Resolved internal render target', {
            hasBypassSecret,
            targetUrl,
        })

        // Inyectar datos en el localStorage antes de cargar la página
        await page.evaluateOnNewDocument((payload: string) => {
            window.localStorage.setItem('__EXPORT_DATA__', payload);
        }, JSON.stringify({
            elements: templateRender.elements,
            width: renderWidth,
            height: renderHeight,
            templateFontFamily: renderTemplateFontFamily,
        }));

        if (bypassSecret) {
            await page.setExtraHTTPHeaders({
                'x-vercel-protection-bypass': bypassSecret,
            })
        }

        console.info('[export] Vercel protection bypass header state', {
            appliedBypassHeader: hasBypassSecret,
        })

        // Navegar al renderer único de React
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

        const finalUrl = page.url()
        const pageTitle = await page.title()
        const finalUrlLower = finalUrl.toLowerCase()
        const pageTitleLower = pageTitle.toLowerCase()
        const pageText = String(await page.evaluate(() => document.body?.innerText || '')).toLowerCase()
        const looksProtected =
            pageTitleLower.includes('log in to vercel') ||
            pageTitleLower.includes('login to vercel') ||
            finalUrlLower.includes('/login') ||
            finalUrlLower.includes('/auth') ||
            finalUrlLower.includes('/protection') ||
            finalUrlLower.includes('/sso') ||
            pageText.includes('log in to vercel') ||
            pageText.includes('deployment protection')

        if (looksProtected) {
            console.warn('Puppeteer parece estar capturando pantalla de protección, no el render de etiqueta', {
                finalUrl,
                pageTitle,
            })
        }

        // Esperar semáforo estricto de finalización gráfica
        try {
            await page.waitForFunction('window.__DOCUMENT_RENDER_READY__ === true', { timeout: 15000 })
        } catch (e) {
            console.warn('Timeout esperando __DOCUMENT_RENDER_READY__, procediendo de todos modos', e)
        }

        // Asegurar que las fuentes (Google Fonts) se hayan cargado antes de la captura
        await page.evaluateHandle('document.fonts.ready')

        let resultBuffer: Buffer | Uint8Array
        let contentType = ''

        if (format === 'pdf') {
            resultBuffer = await page.pdf({
                width: `${width}px`,
                height: `${height}px`,
                printBackground: true,
                pageRanges: '1'
            })
            contentType = 'application/pdf'
        } else if (format === 'png') {
            resultBuffer = await page.screenshot({ type: 'png', fullPage: true }) as Buffer
            contentType = 'image/png'
        } else if (format === 'jpg') {
            resultBuffer = await page.screenshot({ type: 'jpeg', quality: 100, fullPage: true }) as Buffer
            contentType = 'image/jpeg'
        } else {
            return NextResponse.json({ error: 'Invalid format requested' }, { status: 400 })
        }

        const downloadName = filename ? (filename.endsWith(`.${format}`) ? filename : `${filename}.${format}`) : `export.${format}`

        return new NextResponse(resultBuffer as unknown as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${downloadName}"`
            }
        })
    } catch (error) {
        console.error('Export Error:', error)
        return NextResponse.json({ error: 'Failed to generate document export' }, { status: 500 })
    } finally {
        if (browser) {
            await browser.close()
        }
    }
}
