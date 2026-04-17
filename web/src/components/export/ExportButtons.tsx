'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import { TemplateElement } from '@/components/templates/TemplateCanvas'
import { toast } from 'sonner'

// We omit the direct Prisma Product import to avoid Client Component issues with Prisma
// Instead we expect a generic product shape with a code
interface ExpectedProduct {
    code: string
    [key: string]: any
}

interface ExportButtonsProps {
    elements: TemplateElement[]
    product: ExpectedProduct
}

export function ExportButtons({ elements, product }: ExportButtonsProps) {
    const [isExporting, setIsExporting] = useState<string | null>(null)

    const handleExport = async (format: 'pdf' | 'png' | 'jpg') => {
        // --- Validation for Required Fields ---
        const missingFields: string[] = []
        
        elements.forEach(el => {
            if (!el.required) return
            
            if (el.type === 'dynamic_text' && el.dataField) {
                const val = product[el.dataField]
                if (!val || String(val).trim() === '') {
                    missingFields.push(el.dataField)
                }
            } else if (el.type === 'text' && el.content) {
                // Check if internal variables are missing
                const matches = el.content.match(/\{[^}]+\}/g)
                if (matches) {
                    matches.forEach(match => {
                        const varName = match.slice(1, -1)
                        const val = product[varName]
                        if (!val || String(val).trim() === '') {
                            missingFields.push(varName)
                        }
                    })
                } else if (!el.content || el.content.trim() === '') {
                    missingFields.push('Texto Fijo')
                }
            } else if (el.type === 'image') {
                if (!el.content || el.content === '') {
                    missingFields.push('Imagen/Recurso')
                }
            }
        })

        if (missingFields.length > 0) {
            toast.error(`Exportación bloqueada: Faltan datos obligatorios (${[...new Set(missingFields)].join(', ')})`, {
                duration: 6000
            })
            return
        }
        // --------------------------------------

        setIsExporting(format)

        try {
            // Build a completely styled raw HTML string for Puppeteer
            const htmlElements = elements.map(el => {
                const style = `left: ${el.x}px; top: ${el.y}px; width: ${el.width}px; height: ${el.height}px; font-size: ${el.fontSize || 16}px; font-weight: ${el.fontWeight || 'normal'}; text-align: ${el.textAlign || 'center'};`

                if (el.type === 'image') return `<div class="element text-gray-400" style="${style}">[FIRPLAK LOGO]</div>`
                if (el.type === 'barcode') return `<div class="element" style="${style} background: #1e293b; color: white;">|||| ${product.code} ||||</div>`

                return `<div class="element" style="${style}">${el.content}</div>`
            }).join('')

            const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { margin: 0; padding: 0; font-family: sans-serif; }
            .canvas {
              position: relative;
              width: 800px;
              height: 400px;
              background: white;
              overflow: hidden;
            }
            .element {
              position: absolute;
              display: flex;
              align-items: center;
              justify-content: center;
              box-sizing: border-box;
            }
          </style>
        </head>
        <body>
          <div class="canvas">
             ${htmlElements}
          </div>
        </body>
        </html>
      `

            const response = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html: htmlContent, format, width: 800, height: 400 }),
            })

            if (!response.ok) throw new Error('Export failed')

            // Create a blob and download
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${product.code}_label.${format}`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            toast.success(`Exported ${format.toUpperCase()} successfully`)
        } catch (error) {
            console.error(error)
            toast.error('Failed to export document')
        } finally {
            setIsExporting(null)
        }
    }

    return (
        <>
            <Button
                variant="outline"
                className="flex gap-2 w-full justify-start"
                onClick={() => handleExport('pdf')}
                disabled={!!isExporting}
            >
                {isExporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                PDF Document
            </Button>
            <Button
                variant="outline"
                className="flex gap-2 w-full justify-start"
                onClick={() => handleExport('png')}
                disabled={!!isExporting}
            >
                {isExporting === 'png' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                PNG Image
            </Button>
            <Button
                variant="outline"
                className="flex gap-2 w-full justify-start col-span-2"
                onClick={() => handleExport('jpg')}
                disabled={!!isExporting}
            >
                {isExporting === 'jpg' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                JPG (Zebra Printer)
            </Button>
        </>
    )
}
