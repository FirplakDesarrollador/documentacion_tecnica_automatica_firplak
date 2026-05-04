'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Download, Loader2, LayoutTemplate, AlertTriangle, XCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { TemplatePicker, type TemplateOption } from '@/components/generate/TemplatePicker'
import { ValidationWarnings, getMissingFields, getTemplateRequiredFields } from '@/components/generate/ValidationWarnings'
import { resolveAssetsAction } from '@/app/generate/actions'
import { hydrateTemplateElements, hydrateText } from '@/lib/export/exportUtils'
import { enrichProductDataWithIcons } from '@/lib/engine/productUtils'
import { PIXELS_PER_MM } from '@/lib/constants'
import DocumentRenderSurface from '@/components/export/DocumentRenderSurface'
import { resolveZoneHomeEnAction } from '@/app/products/actions'



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
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
        initialTemplateId ?? templates[0]?.id ?? null
    )
    const [isExporting, setIsExporting] = useState(false)
    const [exportFormat, setExportFormat] = useState<'pdf' | 'jpg'>('pdf')
    const [assetMap, setAssetMap] = useState<Record<string, string>>({})
    const [hydratedElements, setHydratedElements] = useState<any[]>([])
    const [preflightReport, setPreflightReport] = useState<{
        missingVariables: string[],
        missingAssets: string[],
        criticalErrors: string[]
    }>({ missingVariables: [], missingAssets: [], criticalErrors: [] })
    
    // Enriquecer producto base (incluyendo el nombre final del motor de reglas)
    const product = useMemo(() => {
        const base = { ...rawProduct }
        return {
            ...base,
            final_name_es: engineResult.finalNameEs || base.final_name_es
        } as any
    }, [rawProduct, engineResult])

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
    
    // Scale-to-fit logic (Fase 2)
    const containerRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)

    useEffect(() => {
        if (!containerRef.current || !selectedTemplate) return
        
        const updateScale = () => {
            const containerWidth = containerRef.current?.clientWidth || 0
            const canvasWidth = selectedTemplate.width_mm * PIXELS_PER_MM
            
            if (canvasWidth > 0 && containerWidth > 0) {
                // Dejar un pequeño margen de 32px (p-4 en cada lado es p-8 = 32px aprox)
                const newScale = Math.min((containerWidth - 32) / canvasWidth, 1)
                setScale(newScale)
            }
        }

        updateScale()
        const observer = new ResizeObserver(updateScale)
        observer.observe(containerRef.current)
        window.addEventListener('resize', updateScale)
        
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', updateScale)
        }
    }, [selectedTemplate])

    // Cargar assets y luego hidratar elementos
    useEffect(() => {
        const process = async () => {
            if (elements.length === 0) {
                setHydratedElements([])
                return
            }

            // 1. Identificar UUIDs de assets
            const assetIds = elements
                .filter((el: any) => 
                    (el.type === 'image' || el.type === 'dynamic_image') && 
                    el.content && 
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(el.content)
                )
                .map((el: any) => el.content)
            
            const mapping = await resolveAssetsAction(assetIds)
            setAssetMap(mapping)

            // 2. Hidratar usando la función maestra (R6)
            const hydrated = await hydrateTemplateElements(elements, product, mapping)
            setHydratedElements(hydrated)
        }
        process()
    }, [elements, product])

    // Preflight check (Fase 3)
    useEffect(() => {
        if (hydratedElements.length === 0) return

        const missingVars: string[] = []
        const missingAss: string[] = []
        const critical: string[] = []

        hydratedElements.forEach((el: any) => {
            // Check for unresolved variables in text
            if (el.type === 'text' || el.type === 'dynamic_text') {
                const matches = el.content?.match(/{[^{}]+}/g)
                if (matches) {
                    matches.forEach((m: string) => missingVars.push(m))
                }
            }

            // Check for missing assets/images
            if (el.type === 'image' || el.type === 'dynamic_image') {
                const dynamicIconKeys = ['icon_rh', 'icon_canto', 'icon_bisagras', 'icon_riel', 'icon_group', 'icon_logo']
                const iconKey = dynamicIconKeys.find(key => el.name?.includes(key) || el.dataField?.includes(key))
                
                if (!el.resolvedSrc || el.resolvedSrc.includes('placeholder')) {
                    if (iconKey) {
                        // Solo reportar si el producto TIENE un valor para este icono pero falló la resolución
                        const hasProductValue = product?.[iconKey as keyof typeof product]
                        if (hasProductValue) {
                            missingAss.push(`${el.name || iconKey} (Falla de resolución)`)
                        }
                    } else {
                        // Assets estáticos normales
                        const label = el.name || el.dataField || 'Imagen'
                        missingAss.push(label)
                    }
                }
            }
        })

        // Format check
        const allowed = (selectedTemplate?.export_formats ? (selectedTemplate.export_formats as string).split(',').map(f => f.trim().toLowerCase()) : ['pdf', 'jpg'])
        if (!allowed.includes(exportFormat)) {
            critical.push(`Formato ${exportFormat.toUpperCase()} no permitido para esta plantilla`)
        }

        setPreflightReport({
            missingVariables: Array.from(new Set(missingVars)),
            missingAssets: Array.from(new Set(missingAss)),
            criticalErrors: critical
        })
    }, [hydratedElements, exportFormat, selectedTemplate])
    
    // R10: Sincronizar formato de exportación cuando cambia la plantilla
    useEffect(() => {
        if (selectedTemplate) {
            const allowed = (selectedTemplate.export_formats ? (selectedTemplate.export_formats as string).split(',').map(f => f.trim().toLowerCase()) : ['pdf', 'jpg'])
            // Si el formato actual no está permitido por la nueva plantilla, cambiar al primero disponible
            if (!allowed.includes(exportFormat)) {
                setExportFormat(allowed.length > 0 ? (allowed[0] as any) : 'pdf')
            }
        }
    }, [selectedTemplate, exportFormat])

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

    const canvasW = selectedTemplate ? Math.round(selectedTemplate.width_mm * PIXELS_PER_MM) : 0
    const canvasH = selectedTemplate ? Math.round(selectedTemplate.height_mm * PIXELS_PER_MM) : 0

    const handleExport = async () => {
        if (!selectedTemplate) return
        setIsExporting(true)

        try {
            // R4: Validación de formato permitida por la plantilla
            const allowed = (selectedTemplate.export_formats ? (selectedTemplate.export_formats as string).split(',').map((f: string) => f.trim().toLowerCase()) : ['pdf', 'jpg'])
            if (!allowed.includes(exportFormat)) {
                toast.error(`El formato ${exportFormat.toUpperCase()} no está permitido para esta plantilla`)
                return
            }

            // Usar la misma lógica de hidratación que el preview (R6)
            const hydrated = await hydrateTemplateElements(elements, product, assetMap)
            const zoneEn = await resolveZoneHomeEnAction(product.zone_home)
            const productWithZone = zoneEn ? { ...product, zone_home_en: zoneEn } : product
            const enrichedProduct = enrichProductDataWithIcons(productWithZone, assetMap)

            const widthPx = Math.round((selectedTemplate.width_mm || 200) * PIXELS_PER_MM)
            const heightPx = Math.round((selectedTemplate.height_mm || 100) * PIXELS_PER_MM)

            const response = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    elements: hydrated, 
                    format: exportFormat, 
                    width: widthPx, 
                    height: heightPx,
                    filename: hydrateText((selectedTemplate as any).export_filename_format || '{sku_base}_{final_name_es}', enrichedProduct)
                }),
            })

            if (!response.ok) throw new Error('Error en la generación del archivo')

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const downloadName = hydrateText((selectedTemplate as any).export_filename_format || '{sku_base}_{final_name_es}', enrichedProduct)
            a.download = `${downloadName}.${exportFormat}`
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
                    <div 
                        ref={containerRef}
                        className="bg-slate-100 border border-slate-200 rounded-xl flex items-start justify-center p-4 min-h-[420px] overflow-hidden"
                    >
                        <div
                            id="label-canvas"
                            className="bg-white shadow-xl relative border border-slate-200 shrink-0"
                            style={{
                                width: canvasW,
                                height: canvasH,
                                transform: `scale(${scale})`,
                                transformOrigin: 'center top',
                                transition: 'transform 0.2s ease-out'
                            }}
                        >
                            <DocumentRenderSurface elements={hydratedElements} width={canvasW} height={canvasH} />
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
                {/* Preflight Report (Fase 3) */}
                {(preflightReport.missingVariables.length > 0 || preflightReport.missingAssets.length > 0 || preflightReport.criticalErrors.length > 0) && (
                    <div className="bg-white border-2 border-amber-200 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="bg-amber-50 px-4 py-3 border-b border-amber-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                <span className="font-bold text-amber-900 text-xs uppercase tracking-wider">Revision Pre-vuelo</span>
                            </div>
                            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                                {preflightReport.missingVariables.length + preflightReport.missingAssets.length + preflightReport.criticalErrors.length} Avisos
                            </Badge>
                        </div>
                        <div className="p-4 flex flex-col gap-3">
                            {preflightReport.criticalErrors.map((err, i) => (
                                <div key={i} className="flex gap-2 text-red-600 text-xs font-bold bg-red-50 p-2 rounded-lg border border-red-100 italic">
                                    <XCircle className="w-4 h-4 shrink-0" />
                                    <span>CRÍTICO: {err}</span>
                                </div>
                            ))}
                            {preflightReport.missingVariables.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Variables no resueltas</span>
                                    <div className="flex flex-wrap gap-1">
                                        {preflightReport.missingVariables.map(v => (
                                            <span key={v} className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded font-mono border border-amber-200">{v}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {preflightReport.missingAssets.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Recursos faltantes</span>
                                    <div className="flex flex-wrap gap-1">
                                        {preflightReport.missingAssets.map(a => (
                                            <span key={a} className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded border border-slate-200 font-medium italic">{a}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="mt-1 flex items-start gap-1.5 text-[10px] text-amber-600 bg-amber-50/50 p-2 rounded-lg border border-amber-100/50">
                                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>Recomendamos completar estos datos en Supabase antes de exportar para evitar errores en el documento final.</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Advertencias estándar */}
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
                                className={`w-full h-12 text-sm font-bold transition-all duration-300 ${
                                    (preflightReport.criticalErrors.length > 0 || missingFields.length > 0)
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300' 
                                        : (preflightReport.missingVariables.length > 0 || preflightReport.missingAssets.length > 0)
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200'
                                }`}
                                onClick={handleExport}
                                disabled={isExporting || preflightReport.criticalErrors.length > 0 || missingFields.length > 0}
                            >
                                {isExporting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        <span>Generando {exportFormat.toUpperCase()}...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download className="mr-2 h-4 w-4" />
                                        <span>
                                            {(preflightReport.criticalErrors.length > 0 || missingFields.length > 0)
                                                ? 'Exportación Bloqueada'
                                                : (preflightReport.missingVariables.length > 0 || preflightReport.missingAssets.length > 0)
                                                    ? `Exportar con Avisos (${exportFormat.toUpperCase()})`
                                                    : `Descargar ${exportFormat.toUpperCase()}`
                                            }
                                        </span>
                                    </>
                                )}
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
