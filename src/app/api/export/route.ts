import { NextResponse } from 'next/server'
import { launchBrowser, resolveExportBrowserMode } from '@/lib/export/launchBrowser'

export const runtime = 'nodejs'
export const maxDuration = 60

type TemplateElement = {
  type?: string
  required?: boolean
  barcodeError?: string
  dataField?: string
}

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
            filename
        } = await req.json()

        if (!elements) {
            return NextResponse.json({ error: 'Missing template elements payload' }, { status: 400 })
        }

        const invalidRequiredBarcodes = Array.isArray(elements)
            ? elements.filter((el: TemplateElement) => el?.type === 'barcode' && el?.required === true && !!el?.barcodeError)
            : []

        if (invalidRequiredBarcodes.length > 0) {
            return NextResponse.json({
                error: 'Invalid required barcode data',
                details: invalidRequiredBarcodes.map((el: TemplateElement) => ({
                    dataField: el?.dataField || null,
                    message: el?.barcodeError || 'Barcode inválido',
                })),
            }, { status: 409 })
        }

        if (productId) {
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
            width,
            height,
        })

        browser = await launchBrowser()

        const page = await browser.newPage()

        // Set viewport to the requested label size (Escala 4x para impresión ultra nítida)
        await page.setViewport({ width, height, deviceScaleFactor: 4 })

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
        }, JSON.stringify({ elements, width, height, templateFontFamily }));

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

        // Return the generated file
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
