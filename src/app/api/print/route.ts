import { NextResponse } from 'next/server'
import { launchBrowser } from '@/lib/export/launchBrowser'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
    let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null

    try {
        const {
            productId,
            isExternalSource = false,
            elements,
            format = 'pdf',
            width = 800,
            height = 400,
            templateFontFamily,
            copies = 1,
        } = await req.json()

        if (!elements) {
            return NextResponse.json({ error: 'Faltan elementos de la plantilla' }, { status: 400 })
        }

        const invalidRequiredBarcodes = Array.isArray(elements)
            ? elements.filter((el: Record<string, unknown>) => el?.type === 'barcode' && el?.required === true && !!el?.barcodeError)
            : []

        if (invalidRequiredBarcodes.length > 0) {
            return NextResponse.json({
                error: 'Datos de código de barras inválidos',
                details: invalidRequiredBarcodes.map((el: Record<string, unknown>) => ({
                    dataField: el?.dataField as string | null || null,
                    message: (el?.barcodeError as string) || 'Código de barras inválido',
                })),
            }, { status: 409 })
        }

        if (productId) {
            const { composeProductById } = await import('@/lib/engine/product_composer')
            const exportProduct = await composeProductById(productId)
            if (exportProduct) {
                if (exportProduct.is_exportable === false) {
                    return NextResponse.json({
                        error: 'Producto inactivo para exportación',
                        inactive_reasons: exportProduct.inactive_reasons,
                    }, { status: 409 })
                }
            } else if (!isExternalSource) {
                return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
            }
        }

        browser = await launchBrowser()
        const page = await browser.newPage()
        await page.setViewport({ width, height, deviceScaleFactor: 2 })

        const requestUrl = new URL(req.url)
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
        const targetUrl = `${baseUrl}/export-render`
        const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

        await page.evaluateOnNewDocument((payload: string) => {
            window.localStorage.setItem('__EXPORT_DATA__', payload)
        }, JSON.stringify({ elements, width, height, templateFontFamily }))

        if (bypassSecret) {
            await page.setExtraHTTPHeaders({
                'x-vercel-protection-bypass': bypassSecret,
            })
        }

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

        try {
            await page.waitForFunction('window.__DOCUMENT_RENDER_READY__ === true', { timeout: 15000 })
        } catch (e) {
            console.warn('Timeout esperando __DOCUMENT_RENDER_READY__, procediendo de todos modos', e)
        }

        await page.evaluateHandle('document.fonts.ready')

        let resultBuffer: Buffer | Uint8Array
        let contentType = ''

        if (format === 'pdf') {
            resultBuffer = await page.pdf({
                width: `${width}px`,
                height: `${height}px`,
                printBackground: true,
                pageRanges: '1',
            })
            contentType = 'application/pdf'
        } else if (format === 'jpg') {
            resultBuffer = await page.screenshot({ type: 'jpeg', quality: 100, fullPage: true }) as Buffer
            contentType = 'image/jpeg'
        } else {
            return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 })
        }

        return new NextResponse(resultBuffer as unknown as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="documento-impresion.${format}"`,
                'X-Print-Copies': String(copies),
            },
        })
    } catch (error) {
        console.error('Print Error:', error)
        return NextResponse.json({ error: 'Error al generar documento para impresión' }, { status: 500 })
    } finally {
        if (browser) {
            await browser.close()
        }
    }
}
