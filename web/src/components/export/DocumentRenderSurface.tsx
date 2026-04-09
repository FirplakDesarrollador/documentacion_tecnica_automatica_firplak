'use client'

import React from 'react'

const PIXELS_PER_MM = 4

function AutoScalingText({ el }: { el: any }) {
    const textRef = React.useRef<HTMLDivElement>(null)
    const [adjustedFontSize, setAdjustedFontSize] = React.useState(el.fontSize || 12)
    const [isScaling, setIsScaling] = React.useState(true)

    React.useEffect(() => {
        const check = () => {
            if (!textRef.current) {
                setIsScaling(false)
                return
            }
            const container = textRef.current.parentElement
            if (!container) {
                setIsScaling(false)
                return
            }

            // Comprobación de desbordamiento con tolerancia
            const hasOverflow = (textRef.current.scrollHeight > container.clientHeight + 4) || 
                               (textRef.current.scrollWidth > container.clientWidth + 4)
            
            if (hasOverflow && adjustedFontSize > 5) {
                setAdjustedFontSize(prev => Math.max(5, prev - 0.5))
                setIsScaling(true)
            } else {
                setIsScaling(false)
            }
        }
        
        // Pequeño delay para asegurar que el DOM esté listo
        const timer = setTimeout(() => {
            requestAnimationFrame(check)
        }, 50)
        return () => clearTimeout(timer)
    }, [adjustedFontSize, el.content])

    const vAlign = el.verticalAlign === 'top' ? 'flex-start' : el.verticalAlign === 'bottom' ? 'flex-end' : 'center'

    return (
        <div 
            className="w-full h-full flex flex-col pointer-events-none overflow-hidden"
            style={{ justifyContent: vAlign }}
            data-scaling={isScaling ? "true" : "false"}
        >
            <div 
                ref={textRef}
                style={{
                    textAlign: el.textAlign || 'left',
                    width: '100%',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                    padding: '0 2px',
                    fontSize: `${adjustedFontSize}pt`,
                    lineHeight: el.lineHeight || 1.2,
                    letterSpacing: el.letterSpacing ? `${el.letterSpacing}em` : undefined
                }}
            >
                {el.content && (typeof el.content === 'string' && (el.content.includes('<') || el.content.includes('&nbsp;'))) ? (
                    <div dangerouslySetInnerHTML={{ __html: el.content }} />
                ) : (
                    el.content
                )}
            </div>
        </div>
    )
}

function AutoScalingIconContent({ el }: { el: any }) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [adjustedCaptionFontSize, setAdjustedCaptionFontSize] = React.useState(el.captionFontSize || 6.5)
    const [isScaling, setIsScaling] = React.useState(true)

    React.useEffect(() => {
        const check = () => {
            if (!containerRef.current) {
                setIsScaling(false)
                return
            }
            // Comprobación de desbordamiento
            const hasOverflow = (containerRef.current.scrollHeight > containerRef.current.clientHeight + 4) || 
                               (containerRef.current.scrollWidth > containerRef.current.clientWidth + 4)
            
            if (hasOverflow && adjustedCaptionFontSize > 4) {
                setAdjustedCaptionFontSize(prev => Math.max(4, prev - 0.5))
                setIsScaling(true)
            } else {
                setIsScaling(false)
            }
        }
        
        const timer = setTimeout(() => requestAnimationFrame(check), 50)
        return () => clearTimeout(timer)
    }, [adjustedCaptionFontSize, el.caption])

    const sizePx = (el.iconSizeMM || 15) * PIXELS_PER_MM
    const gapPx = (el.captionGapMM ?? 2) * PIXELS_PER_MM
    const vAlign = el.verticalAlign === 'top' ? 'flex-start' : el.verticalAlign === 'middle' ? 'center' : 'flex-end'

    return (
        <div 
            ref={containerRef}
            className="w-full h-full flex flex-col pointer-events-none p-1 overflow-hidden"
            style={{ alignItems: 'center', justifyContent: vAlign }}
            data-scaling={isScaling ? "true" : "false"}
        >
            <img 
                src={el.resolvedSrc} 
                alt="icon" 
                style={{ 
                    width: `${sizePx}px`, 
                    height: `${sizePx}px`, 
                    objectFit: 'contain' 
                }} 
            />
            {el.caption && (
                <div 
                    style={{ 
                        marginTop: `${gapPx}px`,
                        fontSize: `${adjustedCaptionFontSize}pt`,
                        textAlign: el.captionTextAlign || 'center',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        width: '100%'
                    }}
                >
                    <span dangerouslySetInnerHTML={{ __html: el.caption }} />
                </div>
            )}
        </div>
    )
}

export default function DocumentRenderSurface({ 
    elements, 
    width, 
    height 
}: { 
    elements: any[], 
    width: number, 
    height: number 
}) {
    const rootElements = elements.filter(el => !el.groupId)

    const renderElementInner = (el: any) => {
        if (el.type === 'barcode') {
            return (
                <div className="w-full h-full bg-slate-800 pointer-events-none text-white flex items-center justify-center opacity-70 overflow-hidden" style={{ fontSize: '6pt' }}>
                    ||| BARCODE {el.content ? `(${el.content})` : ''} |||
                </div>
            )
        }

        if (el.type === 'dashed_line') {
            return (
                <div
                    className="w-full h-full"
                    style={{
                        borderBottomStyle: el.borderStyle || 'solid',
                        borderBottomWidth: el.borderWidth || 2,
                        borderColor: el.color || '#334155',
                        height: 0,
                        alignSelf: 'center'
                    }}
                />
            )
        }

        if (el.type === 'image') {
            const src = el.resolvedSrc
            if (src && !src.includes('undefined') && src !== 'null') {
                return (
                    <div className="w-full h-full flex flex-col pointer-events-none p-1" style={{ alignItems: 'center', justifyContent: 'center' }}>
                        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                )
            }
            return <div className="w-full h-full pointer-events-none" />
        }

        if (el.type === 'dynamic_image') {
            if (!el.resolvedSrc) {
                return <div className="w-full h-full pointer-events-none" />
            }
            return <AutoScalingIconContent el={el} />
        }

        // text and dynamic_text
        if (el.type === 'text' || el.type === 'dynamic_text') {
            return <AutoScalingText el={el} />
        }

        return null
    }

    const renderElement = (el: any) => {
        const isText = el.type === 'text' || el.type === 'dynamic_text'
        const style: React.CSSProperties = {
            position: 'absolute',
            left: `${el.x}px`,
            top: `${el.y}px`,
            width: `${el.width}px`,
            height: `${el.height}px`,
            fontSize: isText ? undefined : `${el.fontSize || 14}pt`, // AutoScalingText maneja su propia fuente
            fontWeight: el.fontWeight || 'normal',
            fontStyle: el.fontStyle || 'normal',
            fontFamily: el.fontFamily === 'Montserrat' ? 'var(--font-montserrat), sans-serif' : 'inherit',
            color: el.color || '#000000',
            backgroundColor: el.type === 'icon_group' ? 'transparent' : (el.backgroundColor || 'transparent'),
            textTransform: (el.textTransform as any) || 'none',
            overflow: 'hidden'
        }

        return (
            <div key={el.id} style={style}>
                {el.type === 'icon_group' ? (
                    <div 
                        className="w-full h-full flex overflow-hidden pointer-events-none p-1"
                        style={{
                            gap: `${el.groupGapMM ?? 2}mm`,
                            justifyContent: el.groupAlign || 'flex-start',
                            flexWrap: el.groupWrap ? 'wrap' : 'nowrap',
                            alignItems: 'center'
                        }}
                    >
                        {elements.filter(child => child.groupId === el.id).map(child => {
                            if (!child.resolvedSrc && child.type === 'dynamic_image') return null;
                            return (
                                <div 
                                    key={child.id}
                                    className="relative flex items-center justify-center shrink-0"
                                    style={{ width: `${child.width}px`, height: `${child.height}px` }}
                                >
                                    {renderElementInner(child)}
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    renderElementInner(el)
                )}
            </div>
        )
    }

    return (
        <div 
            id="label-canvas"
            data-export-canvas="true"
            style={{
                position: 'relative',
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                overflow: 'hidden'
            }}
        >
            {rootElements.map(el => renderElement(el))}
        </div>
    )
}
