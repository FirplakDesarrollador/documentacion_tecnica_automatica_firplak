export type ExportBrowserMode = 'local' | 'vercel'
export interface ExportBrowser {
    newPage(): Promise<{
        setViewport: (...args: any[]) => Promise<void>
        setExtraHTTPHeaders: (...args: any[]) => Promise<void>
        evaluateOnNewDocument: (...args: any[]) => Promise<void>
        evaluate: (...args: any[]) => Promise<any>
        goto: (...args: any[]) => Promise<unknown>
        url: () => string
        title: () => Promise<string>
        waitForFunction: (...args: any[]) => Promise<unknown>
        evaluateHandle: (...args: any[]) => Promise<unknown>
        pdf: (...args: any[]) => Promise<Uint8Array>
        screenshot: (...args: any[]) => Promise<Uint8Array>
    }>
    close(): Promise<void>
}

const LOCAL_BROWSER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-extensions',
    '--disable-infobars',
]

function dedupeArgs(args: string[]): string[] {
    return Array.from(new Set(args))
}

export function resolveExportBrowserMode(): ExportBrowserMode {
    const configuredMode = process.env.EXPORT_BROWSER?.trim()

    if (!configuredMode) {
        return process.env.VERCEL === '1' ? 'vercel' : 'local'
    }

    if (configuredMode === 'local' || configuredMode === 'vercel') {
        return configuredMode
    }

    throw new Error(
        `Invalid EXPORT_BROWSER value "${configuredMode}". Valid values are "local" or "vercel".`
    )
}

export async function launchBrowser(): Promise<ExportBrowser> {
    const mode = resolveExportBrowserMode()
    const forcedMode = process.env.EXPORT_BROWSER?.trim()

    if (mode === 'local') {
        const puppeteer = await import('puppeteer')

        return await puppeteer.default.launch({
            headless: true,
            args: LOCAL_BROWSER_ARGS,
        }) as unknown as ExportBrowser
    }

    try {
        const [{ default: puppeteerCore }, { default: chromium }] = await Promise.all([
            import('puppeteer-core'),
            import('@sparticuz/chromium'),
        ])

        const mergedArgs = dedupeArgs([...chromium.args, ...LOCAL_BROWSER_ARGS])

        return await puppeteerCore.launch({
            args: puppeteerCore.defaultArgs({ args: mergedArgs, headless: 'shell' }),
            executablePath: await chromium.executablePath(),
            headless: 'shell',
        }) as unknown as ExportBrowser
    } catch (error) {
        if (forcedMode === 'vercel') {
            const detail = error instanceof Error ? error.message : String(error)

            throw new Error(
                `Could not start serverless Chromium with EXPORT_BROWSER=vercel. ` +
                `This path should be tested in Vercel, WSL, Linux, or another compatible environment. ` +
                `Original error: ${detail}`
            )
        }

        throw error
    }
}
