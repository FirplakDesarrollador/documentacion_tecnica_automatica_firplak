import { NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

export async function POST(req: Request) {
    try {
        const { html, format = 'pdf', width = 800, height = 400 } = await req.json()

        if (!html) {
            return NextResponse.json({ error: 'Missing HTML content' }, { status: 400 })
        }

        // Launch headless browser
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        })

        const page = await browser.newPage()

        // Set viewport to the requested label size
        await page.setViewport({ width, height, deviceScaleFactor: 2 })

        // Set the HTML content
        await page.setContent(html, { waitUntil: 'networkidle0' })

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

        // Return the generated file
        return new NextResponse(resultBuffer as unknown as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="export.${format}"`
            }
        })

    } catch (error) {
        console.error('Export Error:', error)
        return NextResponse.json({ error: 'Failed to generate document export' }, { status: 500 })
    }
}
