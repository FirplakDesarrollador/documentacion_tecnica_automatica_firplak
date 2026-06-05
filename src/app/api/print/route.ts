import { NextResponse } from 'next/server'

import { launchBrowser } from '@/lib/export/launchBrowser'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_FORMATS = new Set(['pdf', 'jpg'])

type TemplateElement = Record<string, unknown> & {
    type?: string
    required?: boolean
    barcodeError?: string
    dataField?: string
}

type PrintPayload = {
    productId: string | null
    isExternalSource: boolean
    elements: TemplateElement[]
    format: 'pdf' | 'jpg'
    width: number
    height: number
    templateFontFamily: string | null
    copies: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePrintPayload(raw: unknown): { value: PrintPayload | null; error: string | null } {
    if (!isPlainObject(raw)) {
        return { value: null, error: 'Payload invalido' }
    }

    const productId = raw.productId == null ? null : String(raw.productId).trim()
    const isExternalSource = raw.isExternalSource === true
    const format = String(raw.format ?? 'pdf').trim().toLowerCase()
    const width = Number(raw.width ?? 800)
    const height = Number(raw.height ?? 400)
    const copies = Number(raw.copies ?? 1)
    const templateFontFamily = raw.templateFontFamily == null ? null : String(raw.templateFontFamily).trim()
    const elements = Array.isArray(raw.elements)
        ? raw.elements.filter((item): item is TemplateElement => isPlainObject(item))
        : null

    if (!elements || elements.length === 0) {
        return { value: null, error: 'Faltan elementos de la plantilla' }
    }

    if (elements.length > 500) {
        return { value: null, error: 'La plantilla supera el maximo de elementos permitido' }
    }

    if (productId && !UUID_RE.test(productId)) {
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
            productId,
            isExternalSource,
            elements,
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

        if (guard.access?.role === 'production' && payload.isExternalSource) {
            return NextResponse.json({ error: 'External source printing is not allowed for production' }, { status: 403 })
        }

        const invalidRequiredBarcodes = payload.elements.filter((element) =>
            element.type === 'barcode' && element.required === true && Boolean(element.barcodeError)
        )

        if (invalidRequiredBarcodes.length > 0) {
            return NextResponse.json({
                error: 'Datos de codigo de barras invalidos',
                details: invalidRequiredBarcodes.map((element) => ({
                    dataField: (element.dataField as string | undefined) || null,
                    message: (element.barcodeError as string | undefined) || 'Codigo de barras invalido',
                })),
            }, { status: 409 })
        }

        if (payload.productId) {
            const { composeProductById } = await import('@/lib/engine/product_composer')
            const exportProduct = await composeProductById(payload.productId)
            if (exportProduct) {
                if (exportProduct.is_exportable === false) {
                    return NextResponse.json({
                        error: 'Producto inactivo para exportacion',
                        inactive_reasons: exportProduct.inactive_reasons,
                    }, { status: 409 })
                }
            } else if (!payload.isExternalSource) {
                return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
            }
        }

        browser = await launchBrowser()
        const page = await browser.newPage()
        await page.setViewport({ width: payload.width, height: payload.height, deviceScaleFactor: 2 })

        const requestUrl = new URL(req.url)
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
        const targetUrl = `${baseUrl}/export-render`
        const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

        await page.evaluateOnNewDocument((injectedPayload: string) => {
            window.localStorage.setItem('__EXPORT_DATA__', injectedPayload)
        }, JSON.stringify({
            elements: payload.elements,
            width: payload.width,
            height: payload.height,
            templateFontFamily: payload.templateFontFamily,
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
