'use client'

import React, { useEffect, useState } from 'react'
import DocumentRenderSurface from '@/components/export/DocumentRenderSurface'

export default function ExportRenderPage() {
    const [payload, setPayload] = useState<any>(null)

    useEffect(() => {
        // En cliente, intentamos recuperar la data de localStorage o del window
        // Esto será seteado por Puppeteer antes del render o por un script en route.ts
        try {
            const dataStr = window.localStorage.getItem('__EXPORT_DATA__')
            if (dataStr) {
                setPayload(JSON.parse(dataStr))
            } else {
                // Alternativa: Si viene por query params pero es inseguro para JSONs largos.
                // Usaremos localStorage.
            }
        } catch (e) {
            console.error('Error loading export data', e)
        }
    }, [])

    useEffect(() => {
        if (!payload) return

        // Función que evalúa si el documento terminó de montar sus físicas
        // Función que evalúa si el documento terminó de montar sus físicas y escalado
        const checkReadyStatus = () => {
            const images = Array.from(document.querySelectorAll('img'))
            
            // 1. Promesa para imágenes (iconos, recursos)
            const imagesPromise = Promise.all(images.map(img => {
                if (img.complete) return Promise.resolve()
                return new Promise((resolve) => {
                    img.addEventListener('load', resolve)
                    img.addEventListener('error', resolve) 
                })
            }))

            // 2. Promesa para el auto-escalado de texto
            const scalingPromise = new Promise((resolve) => {
                const checkScaling = () => {
                    const scalingElements = document.querySelectorAll('[data-scaling="true"]')
                    if (scalingElements.length === 0) {
                        resolve(null)
                    } else {
                        setTimeout(checkScaling, 100)
                    }
                }
                checkScaling()

                // Timeout de seguridad de 3 segundos
                setTimeout(() => resolve(null), 3000)
            })

            // 3. Esperar ambas y disparar señal
            Promise.all([imagesPromise, scalingPromise]).then(() => {
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        (window as any).__DOCUMENT_RENDER_READY__ = true
                    }, 200) // Margen extra para repintado final
                })
            })
        }

        checkReadyStatus()
    }, [payload])

    if (!payload) {
        return <div className="p-4 text-slate-400">Esperando datos para renderizar...</div>
    }

    return (
        <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', background: '#fff' }}>
            <DocumentRenderSurface 
                elements={payload.elements} 
                width={payload.width} 
                height={payload.height} 
            />
        </div>
    )
}
