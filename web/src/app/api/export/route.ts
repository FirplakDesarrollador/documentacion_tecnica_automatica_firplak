import { NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

export async function POST(req: Request) {
    try {
        const { elements, format = 'pdf', width = 800, height = 400, filename } = await req.json()

        if (!elements) {
            return NextResponse.json({ error: 'Missing template elements payload' }, { status: 400 })
        }

        // Launch headless browser
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-web-security', 
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-extensions',
                '--disable-infobars'
            ]
        })

        const page = await browser.newPage()

        // Set viewport to the requested label size (Escala 4x para impresión ultra nítida)
        await page.setViewport({ width, height, deviceScaleFactor: 4 })

        // Determinar URL base (local o producción)
        const requestUrl = new URL(req.url)
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
        const targetUrl = `${baseUrl}/export-render`

        // Inyectar datos en el localStorage antes de cargar la página
        await page.evaluateOnNewDocument((payload) => {
            window.localStorage.setItem('__EXPORT_DATA__', payload);
        }, JSON.stringify({ elements, width, height }));

        // Navegar al renderer único de React
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

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
            await browser.close()
            return NextResponse.json({ error: 'Invalid format requested' }, { status: 400 })
        }

        await browser.close()

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
    }
}
