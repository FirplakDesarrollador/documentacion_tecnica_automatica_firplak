'use client'

import React from 'react'
import { buildQrCodeSvg } from '@/lib/export/qrCodeUtils'

type QrCodeLikeElement = {
    width?: number
    height?: number
    qrSvg?: string | null
    qrValue?: string | null
    qrError?: string | null
    qrHidden?: boolean | null
}

interface QrCodeElementProps {
    el: QrCodeLikeElement
    rawValue?: unknown
    sampleWhenEmpty?: boolean
    className?: string
}

export default function QrCodeElement({
    el,
    rawValue,
    sampleWhenEmpty = false,
    className = '',
}: QrCodeElementProps) {
    const [computed, setComputed] = React.useState<{
        svgMarkup: string | null
        errorMessage: string | null
        normalizedValue: string
    }>({
        svgMarkup: el.qrSvg || null,
        errorMessage: el.qrError || null,
        normalizedValue: el.qrValue || '',
    })

    React.useEffect(() => {
        let cancelled = false

        async function renderQr() {
            if (el.qrHidden) {
                setComputed({ svgMarkup: null, errorMessage: null, normalizedValue: '' })
                return
            }

            if (el.qrSvg || el.qrError) {
                setComputed({
                    svgMarkup: el.qrSvg || null,
                    errorMessage: el.qrError || null,
                    normalizedValue: el.qrValue || '',
                })
                return
            }

            const value = rawValue ?? el.qrValue ?? (sampleWhenEmpty ? 'https://doc.firplak.com/ins/ejemplo' : '')
            const result = await buildQrCodeSvg(value, Math.min(Number(el.width) || 128, Number(el.height) || 128))
            if (!cancelled) {
                setComputed(result)
            }
        }

        void renderQr()

        return () => {
            cancelled = true
        }
    }, [el.height, el.qrError, el.qrHidden, el.qrSvg, el.qrValue, el.width, rawValue, sampleWhenEmpty])

    if (el.qrHidden) {
        return <div className={`w-full h-full pointer-events-none ${className}`} />
    }

    if (!computed.svgMarkup) {
        return (
            <div className={`w-full h-full border border-amber-300 bg-amber-50 text-amber-700 flex items-center justify-center text-[10px] font-semibold text-center px-2 ${className}`}>
                {computed.errorMessage || 'QR sin documento'}
            </div>
        )
    }

    return (
        <div
            className={`w-full h-full pointer-events-none bg-white flex items-center justify-center overflow-hidden ${className}`}
            title={computed.normalizedValue || undefined}
        >
            <div
                className="w-full h-full flex items-center justify-center bg-white [&_svg]:block [&_svg]:h-full [&_svg]:w-full [&_svg]:max-h-full [&_svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: computed.svgMarkup }}
            />
        </div>
    )
}
