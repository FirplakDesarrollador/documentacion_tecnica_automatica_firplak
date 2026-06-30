import QRCode from 'qrcode'

export type QrCodeBuildResult = {
    svgMarkup: string | null
    errorMessage: string | null
    normalizedValue: string
}

export async function buildQrCodeSvg(value: unknown, width?: number | string, margin = 4): Promise<QrCodeBuildResult> {
    const normalizedValue = String(value ?? '').trim()
    if (!normalizedValue) {
        return {
            svgMarkup: null,
            errorMessage: 'QR sin enlace',
            normalizedValue: '',
        }
    }

    const size = Math.max(48, Math.round(Number(width) || 128))

    try {
        const svgMarkup = await QRCode.toString(normalizedValue, {
            type: 'svg',
            errorCorrectionLevel: 'M',
            margin,
            width: size,
            color: {
                dark: '#000000',
                light: '#FFFFFF',
            },
        })

        return {
            svgMarkup,
            errorMessage: null,
            normalizedValue,
        }
    } catch (error) {
        return {
            svgMarkup: null,
            errorMessage: error instanceof Error ? error.message : 'No se pudo renderizar el QR.',
            normalizedValue,
        }
    }
}
