'use client'

import React from 'react'
import { buildBarcode, getBarcodeSampleValue, resolveBarcodeFormat, type BarcodeFormat } from '@/lib/export/barcodeUtils'

type BarcodeLikeElement = {
    width?: number
    height?: number
    dataField?: string
    barcodeFormat?: BarcodeFormat | string | null
    barcodeXDimensionMm?: number
    barcodeBarHeightMm?: number
    barcodeQuietZoneX?: number
    barcodeOrientation?: 'horizontal' | 'vertical'
    barcodeFormatResolved?: BarcodeFormat
    barcodeValue?: string | null
    barcodeSvg?: string | null
    barcodeError?: string | null
}

interface BarcodeElementProps {
    el: BarcodeLikeElement
    rawValue?: unknown
    sampleWhenEmpty?: boolean
    className?: string
}

export default function BarcodeElement({
    el,
    rawValue,
    sampleWhenEmpty = false,
    className = '',
}: BarcodeElementProps) {
    const format = el.barcodeFormatResolved || resolveBarcodeFormat(el)
    const computed = React.useMemo(() => {
        if (el.barcodeSvg || el.barcodeError) {
            return {
                svgMarkup: el.barcodeSvg || null,
                errorMessage: el.barcodeError || null,
                normalizedValue: el.barcodeValue || '',
            }
        }

        const value = rawValue ?? el.barcodeValue ?? (sampleWhenEmpty ? getBarcodeSampleValue(format) : '')
        const result = buildBarcode(value, format, {
            width: el.width,
            height: el.height,
            xDimensionMm: el.barcodeXDimensionMm,
            barHeightMm: el.barcodeBarHeightMm,
            quietZoneX: el.barcodeQuietZoneX,
        })
        return {
            svgMarkup: result.svgMarkup,
            errorMessage: result.errorMessage,
            normalizedValue: result.normalizedValue,
        }
    }, [el.barcodeSvg, el.barcodeError, el.barcodeValue, el.width, el.height, rawValue, sampleWhenEmpty, format, el.barcodeBarHeightMm, el.barcodeQuietZoneX, el.barcodeXDimensionMm])

    if (!computed.svgMarkup) {
        return (
            <div className={`w-full h-full border border-rose-300 bg-rose-50 text-rose-700 flex items-center justify-center text-[10px] font-semibold text-center px-2 ${className}`}>
                {computed.errorMessage || 'Barcode sin datos'}
            </div>
        )
    }

    const isVertical = el.barcodeOrientation === 'vertical'

    if (isVertical && el.height != null && el.width != null) {
        const h = el.height
        const w = el.width
        return (
            <div
                className={`w-full h-full pointer-events-none overflow-hidden bg-transparent flex items-center justify-center ${className}`}
                title={computed.normalizedValue || undefined}
            >
                <div
                    className="flex items-center justify-center bg-transparent shrink-0"
                    style={{
                        width: `${h}px`,
                        height: `${w}px`,
                        transform: 'rotate(90deg)',
                        transformOrigin: 'center',
                    }}
                    dangerouslySetInnerHTML={{ __html: computed.svgMarkup }}
                />
            </div>
        )
    }

    return (
        <div
            className={`w-full h-full pointer-events-none overflow-hidden bg-transparent flex items-center justify-center ${className}`}
            title={computed.normalizedValue || undefined}
        >
            <div
                className="w-full h-full flex items-center justify-center bg-transparent"
                dangerouslySetInnerHTML={{ __html: computed.svgMarkup }}
            />
        </div>
    )
}
