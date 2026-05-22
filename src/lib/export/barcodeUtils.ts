import JsBarcode from 'jsbarcode'
import { PIXELS_PER_MM } from '@/lib/constants'

export type BarcodeFormat = 'ean13' | 'code128'

export type BarcodeErrorCode = 'missing' | 'invalid' | 'render_error' | 'dom_unavailable'

export interface BarcodeResult {
    ok: boolean
    normalizedValue: string
    svgMarkup: string | null
    errorCode: BarcodeErrorCode | null
    errorMessage: string | null
}

export interface BarcodeRenderOptions {
    width?: number
    height?: number
    xDimensionMm?: number
    barHeightMm?: number
    quietZoneX?: number
    displayValue?: boolean
}

const EAN13_SAMPLE = '7701234567890'
const CODE128_SAMPLE = 'VCOC01-0199-KND-0321'

export function resolveBarcodeFormat(input?: { barcodeFormat?: string | null; dataField?: string | null } | null): BarcodeFormat {
    const rawFormat = String(input?.barcodeFormat || '').trim().toLowerCase()
    if (rawFormat === 'ean13' || rawFormat === 'code128') return rawFormat
    if (String(input?.dataField || '').trim() === 'code') return 'code128'
    return 'ean13'
}

export function getBarcodeSampleValue(format: BarcodeFormat): string {
    return format === 'code128' ? CODE128_SAMPLE : EAN13_SAMPLE
}

function computeEan13Checksum(digits12: string): string {
    const sum = digits12
        .split('')
        .reduce((acc, digit, index) => acc + (Number(digit) * (index % 2 === 0 ? 1 : 3)), 0)
    return String((10 - (sum % 10)) % 10)
}

function normalizeValue(rawValue: unknown): string {
    return String(rawValue ?? '').trim()
}

export function validateBarcodeValue(rawValue: unknown, format: BarcodeFormat): Omit<BarcodeResult, 'svgMarkup'> {
    const trimmed = normalizeValue(rawValue)
    if (!trimmed) {
        return {
            ok: false,
            normalizedValue: '',
            errorCode: 'missing',
            errorMessage: format === 'code128'
                ? 'El valor para Code128 esta vacio.'
                : 'El codigo EAN esta vacio.'
        }
    }

    if (format === 'code128') {
        return {
            ok: true,
            normalizedValue: trimmed,
            errorCode: null,
            errorMessage: null,
        }
    }

    const digits = trimmed.replace(/[\s-]+/g, '')
    if (!/^\d{12,13}$/.test(digits)) {
        return {
            ok: false,
            normalizedValue: digits,
            errorCode: 'invalid',
            errorMessage: 'El codigo EAN debe tener 12 o 13 digitos numericos.'
        }
    }

    if (digits.length === 12) {
        return {
            ok: true,
            normalizedValue: `${digits}${computeEan13Checksum(digits)}`,
            errorCode: null,
            errorMessage: null,
        }
    }

    const expectedChecksum = computeEan13Checksum(digits.slice(0, 12))
    if (digits[12] !== expectedChecksum) {
        return {
            ok: false,
            normalizedValue: digits,
            errorCode: 'invalid',
            errorMessage: 'El codigo EAN-13 tiene un digito verificador invalido.'
        }
    }

    return {
        ok: true,
        normalizedValue: digits,
        errorCode: null,
        errorMessage: null,
    }
}

export function buildBarcode(rawValue: unknown, formatInput?: BarcodeFormat | string | null, options: BarcodeRenderOptions = {}): BarcodeResult {
    const format = formatInput === 'code128' ? 'code128' : 'ean13'
    const validation = validateBarcodeValue(rawValue, format)

    if (!validation.ok) {
        return {
            ...validation,
            svgMarkup: null,
        }
    }

    if (typeof document === 'undefined') {
        return {
            ...validation,
            ok: false,
            svgMarkup: null,
            errorCode: 'dom_unavailable',
            errorMessage: 'No hay DOM disponible para generar el SVG del barcode.',
        }
    }

    try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        const xMmRaw = typeof options.xDimensionMm === 'number' ? options.xDimensionMm : 0.33
        const xMm = xMmRaw > 0 ? xMmRaw : 0.33
        const xPx = Math.max(1, xMm * PIXELS_PER_MM)

        const barHeightMmRaw = typeof options.barHeightMm === 'number' ? options.barHeightMm : 20
        const barHeightMm = barHeightMmRaw > 0 ? barHeightMmRaw : 20
        const barHeightPx = Math.max(10, barHeightMm * PIXELS_PER_MM)

        const quietZoneXRaw = typeof options.quietZoneX === 'number' ? options.quietZoneX : 10
        const quietZoneX = quietZoneXRaw >= 0 ? quietZoneXRaw : 10
        const quietZonePx = Math.max(0, quietZoneX * xPx)

        JsBarcode(svg, validation.normalizedValue, {
            format: format === 'ean13' ? 'EAN13' : 'CODE128',
            displayValue: options.displayValue !== false,
            margin: quietZonePx,
            width: xPx,
            height: barHeightPx,
            fontSize: 12,
            textMargin: 2,
            background: 'transparent',
            lineColor: '#111827',
        })

        // Ensure proportional scaling when the container box is resized.
        // JsBarcode writes explicit width/height but not viewBox; preserveAspectRatio only works with a viewBox.
        const w = parseFloat(svg.getAttribute('width') || '0') || (options.width || 0)
        const h = parseFloat(svg.getAttribute('height') || '0') || (options.height || 0)
        if (w > 0 && h > 0) {
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
        }
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        svg.setAttribute('width', '100%')
        svg.setAttribute('height', '100%')

        return {
            ...validation,
            svgMarkup: svg.outerHTML,
        }
    } catch (error) {
        return {
            ok: false,
            normalizedValue: validation.normalizedValue,
            svgMarkup: null,
            errorCode: 'render_error',
            errorMessage: error instanceof Error ? error.message : 'No se pudo renderizar el barcode.',
        }
    }
}
