'use client'

import { useState, useMemo } from 'react'
import { Download, Loader2, LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { TemplatePicker, type TemplateOption } from '@/components/generate/TemplatePicker'
import { ValidationWarnings, getMissingFields, getTemplateRequiredFields } from '@/components/generate/ValidationWarnings'

const MM_TO_PX = 3.7795

interface PreviewClientProps {
    product: Record<string, any>
    templates: TemplateOption[]
    initialTemplateId: string | null
    engineResult: {
        finalNameEs: string
        activeIcons: string[]
        trace: { passed: boolean; condition: string; actionTaken?: string; payload?: string }[]
    }
}

export function PreviewClient({ product, templates, initialTemplateId, engineResult }: PreviewClientProps) {
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
        initialTemplateId ?? templates[0]?.id ?? null
    )
    const [isExporting, setIsExporting] = useState(false)
    const [exportFormat, setExportFormat] = useState<'pdf' | 'png'>('pdf')

    const selectedTemplate = useMemo(
        () => templates.find(t => t.id === selectedTemplateId) ?? null,
        [templates, selectedTemplateId]
    )

    const elements = useMemo(() => {
        if (!selectedTemplate) return []
        try {
            return JSON.parse(selectedTemplate.elements_json || '[]')
        } catch {
            return []
        }
    }, [selectedTemplate])

    const hydrate = (text: string) => {
        if (!text) return ''
        return text.replace(/{([^}]+)}/g, (_, field) => {
            if (field === 'final_name_es') return engineResult.finalNameEs || product['final_name_es'] || ''
            return String(product[field] ?? '')
        })
    }

    const hydratedElements = useMemo(() => elements.map((el: any) => {
        let content = el.content || ''
        if (el.dataField) {
            if (el.dataField === 'final_name_es') {
                content = engineResult.finalNameEs || product['final_name_es'] || 'N/A'
            } else {
                content = String(product[el.dataField] ?? '')
            }
        }
        // También hidratar variables dentro del contenido estático
        content = hydrate(content)
        return { ...el, content }
    }), [elements, product, engineResult])

    const requiredFields = useMemo(
        () => selectedTemplate ? getTemplateRequiredFields(selectedTemplate.elements_json) : [],
        [selectedTemplate]
    )

    const missingFields = useMemo(
        () => getMissingFields(product, requiredFields),
        [product, requiredFields]
    )

    const warnings = missingFields.length > 0
        ? [{ productCode: product.code, productName: product.final_name_es || '', missingFields }]
        : []

    const canvasW = selectedTemplate ? Math.round(selectedTemplate.width_mm * MM_TO_PX) : 756
    const canvasH = selectedTemplate ? Math.round(selectedTemplate.height_mm * MM_TO_PX) : 378

    const handleExport = async (format: 'pdf' | 'png') => {
        if (!selectedTemplate) return
        setIsExporting(true)

        try {
            const htmlElements = hydratedElements.map((el: any) => {
                const style = `left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;font-size:${el.fontSize || 14}px;font-weight:${el.fontWeight || 'normal'};text-align:${el.textAlign || 'left'};`
                if (el.type === 'barcode') return `<div class="el" style="${style}background:#1e293b;color:white;display:flex;align-items:center;justify-content:center;">|||| ${product.code} ||||</div>`
                if (el.type === 'image') return `<div class="el" style="${style}color:#aaa;display:flex;align-items:center;justify-content:center;">[${el.content || 'IMG'}]</div>`
                return `<div class="el" style="${style}">${el.content}</div>`
            }).join('')

            const html = `<!DOCTYPE html><html><head><style>body{margin:0;padding:0;font-family:sans-serif;}.canvas{position:relative;width:${canvasW}px;height:${canvasH}px;background:white;overflow:hidden;}.el{position:absolute;box-sizing:border-box;}</style></head><body><div class="canvas">${htmlElements}</div></body></html>`

            const res = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html, format, width: canvasW, height: canvasH }),
            })

            if (!res.ok) throw new Error('Error al exportar')

            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${product.code}_${selectedTemplate.name.replace(/\s+/g, '_')}.${format}`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
            toast.success(`${format.toUpperCase()} exportado correctamente`)
        } catch (e) {
            console.error(e)
            toast.error('Error al exportar el documento')
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Preview Canvas */}
            <div className="lg:col-span-2 flex flex-col gap-4">
                {/* Template selector in preview */}
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-slate-500 font-medium">Plantilla:</span>
                    <TemplatePicker
                        templates={templates}
                        selectedTemplateId={selectedTemplateId}
                        onSelect={setSelectedTemplateId}
                    />
                    {selectedTemplate && (
                        <span className="text-xs text-slate-400">
                            {selectedTemplate.width_mm}×{selectedTemplate.height_mm}mm · {selectedTemplate.orientation}
                        </span>
                    )}
                </div>

                {/* Canvas */}
                {selectedTemplate ? (
                    <div className="bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center p-6 min-h-[420px] overflow-auto">
                        <div
                            id="label-canvas"
                            className="bg-white shadow-xl relative border border-slate-200 shrink-0"
                            style={{
                                width: canvasW,
                                height: canvasH,
                                transform: canvasW > 700 ? `scale(${Math.min(680 / canvasW, 1)})` : 'scale(1)',
                                transformOrigin: 'center top',
                            }}
                        >
                            {hydratedElements.map((el: any) => (
                                <div
                                    key={el.id}
                                    className="absolute overflow-hidden"
                                    style={{
                                        left: el.x,
                                        top: el.y,
                                        width: el.width,
                                        height: el.height,
                                        fontSize: el.fontSize,
                                        fontWeight: el.fontWeight as any,
                                        textAlign: el.textAlign as any,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: el.textAlign === 'right' ? 'flex-end' : el.textAlign === 'center' ? 'center' : 'flex-start',
                                        boxSizing: 'border-box',
                                        color: el.color || '#000',
                                        backgroundColor: el.backgroundColor || 'transparent',
                                        fontFamily: el.fontFamily || 'inherit',
                                    }}
                                >
                                    {el.type === 'barcode' && (
                                        <div className="w-full h-full bg-slate-800 text-white text-xs flex items-center justify-center font-mono">
                                            |||| {product.code} ||||
                                        </div>
                                    )}
                                    {el.type === 'image' && (
                                        el.content?.startsWith('http') || el.dataField === 'isometric_path' ? (
                                            <img 
                                                src={el.content || product.isometric_path} 
                                                alt="asset" 
                                                className="max-w-full max-h-full object-contain" 
                                            />
                                        ) : (
                                            <span className="text-slate-400 text-xs text-center px-2">[{el.content || 'Imagen'}]</span>
                                        )
                                    )}
                                    {(el.type === 'dynamic_text' || el.type === 'text') && (
                                        <div 
                                            className="w-full break-words"
                                            dangerouslySetInnerHTML={{ __html: el.content }}
                                        />
                                    )}
                                </div>
                            ))}

                            {/* Overlay si no hay elementos */}
                            {hydratedElements.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                                    <div className="text-center">
                                        <LayoutTemplate className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                        <p>La plantilla no tiene elementos configurados</p>
                                        <a href={`/templates/builder?id=${selectedTemplate.id}`} className="text-indigo-500 underline text-xs mt-1 block">
                                            Editar plantilla →
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center p-6 min-h-[420px]">
                        <div className="text-center text-slate-400">
                            <LayoutTemplate className="w-10 h-10 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No hay plantillas activas disponibles.</p>
                            <a href="/templates" className="text-indigo-500 underline text-xs mt-1 block">
                                Ir a Plantillas →
                            </a>
                        </div>
                    </div>
                )}
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-4">
                {/* Advertencias */}
                {warnings.length > 0 ? (
                    <ValidationWarnings warnings={warnings} />
                ) : selectedTemplate && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                        <span className="text-base">✓</span>
                        <span className="font-medium">Producto completo para esta plantilla</span>
                    </div>
                )}

                {/* Datos del producto */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                    <h3 className="font-semibold text-slate-800 text-sm">Datos del Producto</h3>
                    <div className="flex flex-col gap-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-500">Código:</span><span className="font-mono font-semibold">{product.code}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Familia:</span><span>{product.familia_code || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Medida:</span><span>{product.commercial_measure || '—'}</span></div>
                        <div className="flex justify-between gap-2">
                            <span className="text-slate-500">Estado:</span>
                            <Badge variant={product.validation_status === 'ready' ? 'default' : product.validation_status === 'needs_review' ? 'destructive' : 'secondary'} className="text-xs">
                                {product.validation_status === 'ready' ? 'Listo' : product.validation_status === 'needs_review' ? 'Revisar' : 'Incompleto'}
                            </Badge>
                        </div>
                        <div className="flex justify-between"><span className="text-slate-500">Nombre derivado:</span><span className="text-right max-w-[160px]">{engineResult.finalNameEs || '—'}</span></div>
                    </div>
                </div>

                {/* Exportar */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                    <h3 className="font-semibold text-slate-800 text-sm">Exportar</h3>
                    <div className="flex flex-col gap-2">
                        <Button
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => handleExport('pdf')}
                            disabled={!selectedTemplate || isExporting}
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            PDF
                        </Button>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleExport('png')}
                            disabled={!selectedTemplate || isExporting}
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            PNG
                        </Button>
                    </div>
                    {!selectedTemplate && (
                        <p className="text-xs text-amber-600">Selecciona una plantilla para exportar</p>
                    )}
                </div>
            </div>
        </div>
    )
}
