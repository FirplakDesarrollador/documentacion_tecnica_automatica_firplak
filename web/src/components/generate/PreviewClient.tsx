'use client'

import { useState, useMemo, useEffect } from 'react'
import { Download, Loader2, LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { TemplatePicker, type TemplateOption } from '@/components/generate/TemplatePicker'
import { ValidationWarnings, getMissingFields, getTemplateRequiredFields } from '@/components/generate/ValidationWarnings'
import { resolveAssetsAction } from '@/app/generate/actions'
import { generateExportHtml, resolveTemplateAssets } from '@/lib/export/exportUtils'
import { enrichProductData } from '@/lib/engine/productUtils'

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

export function PreviewClient({ product: rawProduct, templates, initialTemplateId, engineResult }: PreviewClientProps) {
    const product = useMemo(() => enrichProductData(rawProduct), [rawProduct])
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
        initialTemplateId ?? templates[0]?.id ?? null
    )
    const [isExporting, setIsExporting] = useState(false)
    const [exportFormat, setExportFormat] = useState<'pdf' | 'jpg'>('pdf')
    const [assetMap, setAssetMap] = useState<Record<string, string>>({})

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

    useEffect(() => {
        const resolveAssets = async () => {
            const assetIds = elements
                .filter((el: any) => el.type === 'image' && el.content && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(el.content))
                .map((el: any) => el.content)
            
            const mapping = await resolveAssetsAction(assetIds)
            setAssetMap(mapping)
        }
        if (elements.length > 0) resolveAssets()
    }, [elements])

    const hydrate = (text: string) => {
        if (!text) return ''
        return text.replace(/{([^}]+)}/g, (_: string, field: string) => {
            if (field === 'final_name_es') return engineResult.finalNameEs || product['final_name_es'] || ''
            if (field === 'color') return product.color_name || product.color_code || ''
            
            if (['icon_rh', 'icon_edge_2mm', 'icon_soft_close', 'icon_full_extension'].includes(field)) {
                const isTrue = product[field] === true || product[field] === 'true'
                if (isTrue) {
                    const sysAssetKey = `sys_${field}`
                    if (assetMap[sysAssetKey]) {
                        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                        const src = assetMap[sysAssetKey].startsWith('http') ? assetMap[sysAssetKey] : `${baseUrl}/storage/v1/object/public/${assetMap[sysAssetKey]}`
                        return `<img src="${src}" style="height: 1.2em; width: auto; vertical-align: middle; display: inline-block; margin: 0 0.1em;" />`
                    }
                }
                return ''
            }

            const val = product[field]
            return (val === null || val === undefined) ? '' : String(val)
        })
    }

    const hydratedElements = useMemo(() => elements.map((el: any) => {
        let content = el.content || ''
        if (el.dataField) {
            if (el.dataField === 'final_name_es') {
                content = engineResult.finalNameEs || product['final_name_es'] || 'N/A'
            } else {
                const val = product[el.dataField]
                content = (val === null || val === undefined) ? '' : String(val)
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

    const handleExport = async () => {
        if (!selectedTemplate) return
        setIsExporting(true)

        try {
            let elements: any[] = []
            try {
                elements = JSON.parse(selectedTemplate.elements_json || '[]')
            } catch { elements = [] }

            // 1. Resolver assets
            const assetIds = elements
                .filter(el => el.type === 'image' && el.content && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(el.content))
                .map(el => el.content)
            
            const assetMap = await resolveAssetsAction(assetIds)
            const enrichedProduct = enrichProductData(product)
            const hydrated = await resolveTemplateAssets(elements, enrichedProduct, assetMap)

            // 2. Reemplazar variables
            hydrated.forEach((el: any) => {
                if (el.type === 'text' || el.type === 'dynamic_text') {
                    const rawContent = el.type === 'dynamic_text' ? `{${el.dataField}}` : (el.content || '')
                    el.content = rawContent.replace(/{([^}]+)}/g, (_: string, field: string) => {
                        if (field === 'color') return enrichedProduct.color_name || enrichedProduct.color_code || ''
                        
                        if (['icon_rh', 'icon_edge_2mm', 'icon_soft_close', 'icon_full_extension'].includes(field)) {
                            const isTrue = enrichedProduct[field] === true || enrichedProduct[field] === 'true'
                            if (isTrue) {
                                const sysAssetKey = `sys_${field}`
                                if (assetMap[sysAssetKey]) {
                                    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                                    const src = assetMap[sysAssetKey].startsWith('http') ? assetMap[sysAssetKey] : `${baseUrl}/storage/v1/object/public/${assetMap[sysAssetKey]}`
                                    return `<img src="${src}" style="height: 1.2em; width: auto; vertical-align: middle; display: inline-block; margin: 0 0.1em;" />`
                                }
                            }
                            return ''
                        }

                        const val = enrichedProduct[field]
                        return (val === null || val === undefined) ? '' : String(val)
                    })
                }
            })

            const widthPx = Math.round((selectedTemplate.width_mm || 200) * MM_TO_PX)
            const heightPx = Math.round((selectedTemplate.height_mm || 100) * MM_TO_PX)

            const html = generateExportHtml(hydrated, enrichedProduct, widthPx, heightPx)

            const response = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    html, 
                    format: exportFormat, 
                    width: widthPx, 
                    height: heightPx 
                }),
            })

            if (!response.ok) throw new Error('Error en la generación del archivo')

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${product.code}_${selectedTemplate.name.replace(/\s+/g, '_')}.${exportFormat}`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
            
            toast.success('Archivo exportado correctamente')
        } catch (error) {
            console.error(error)
            toast.error('Hubo un error al exportar el archivo')
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
                                    {el.type === 'dashed_line' && (
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
                                    )}
                                    {el.type === 'image' && (
                                        (() => {
                                            let src = el.content || ''
                                            if (assetMap[src]) src = assetMap[src]
                                            else if (src === 'logo_empresa' && assetMap['logo_empresa']) src = assetMap['logo_empresa']
                                            else if (src === 'isometrico_placeholder' || src === 'Isométrico' || src === 'Isométrico (Placeholder)') {
                                                src = product.isometric_path || ''
                                            }
                                            else if (el.dataField === 'isometric_path') src = product.isometric_path || ''

                                            if (src && (src.startsWith('http') || src.startsWith('/storage'))) {
                                                const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                                                const absoluteSrc = src.startsWith('http') ? src : `${baseUrl}/storage/v1/object/public/${src}`
                                                return <img src={absoluteSrc} alt="asset" className="max-w-full max-h-full object-contain" />
                                            }

                                            return <span className="text-slate-400 text-xs text-center px-2">[{el.content || 'Imagen'}]</span>
                                        })()
                                    )}
                                    {(el.type === 'dynamic_text' || el.type === 'text') && (
                                        <div 
                                            className="w-full break-words"
                                        >
                                            {el.content ? (
                                                <div dangerouslySetInnerHTML={{ __html: el.content }} />
                                            ) : (
                                                <span className="text-red-500 font-bold text-[10px] bg-red-50 px-1 rounded border border-red-200">[VACIO]</span>
                                            )}
                                        </div>
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
                    
                    {selectedTemplate && (
                        <div className="flex flex-col gap-3">
                            {/* Selector de formato filtrado */}
                            <div className="flex bg-slate-100 p-1 rounded-lg w-full">
                                {(selectedTemplate.export_formats ? (selectedTemplate.export_formats as string).split(',').map((f: string) => f.trim().toLowerCase()) : ['pdf', 'jpg']).map((fmt: string) => (
                                    <button
                                        key={fmt}
                                        onClick={() => setExportFormat(fmt as any)}
                                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${exportFormat === fmt ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {fmt.toUpperCase()}
                                    </button>
                                ))}
                            </div>

                            <Button
                                className={`w-full ${missingFields.length > 0 ? 'bg-slate-400 hover:bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} text-white`}
                                onClick={handleExport}
                                disabled={isExporting || missingFields.length > 0}
                            >
                                {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                {missingFields.length > 0 ? 'Faltan datos requeridos (ej. Isométrico)' : `Descargar ${exportFormat.toUpperCase()}`}
                            </Button>
                        </div>
                    )}

                    {!selectedTemplate && (
                        <p className="text-xs text-amber-600">Selecciona una plantilla para exportar</p>
                    )}
                </div>
            </div>
        </div>
    )
}
