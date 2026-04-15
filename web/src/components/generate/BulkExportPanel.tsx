'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { 
    Download, 
    Loader2, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Package, 
    AlertTriangle, 
    StopCircle, 
    FolderRoot, 
    FolderCheck, 
    Trash2 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ValidationWarnings, getMissingFields, getTemplateRequiredFields } from './ValidationWarnings'
import type { TemplateOption } from './TemplatePicker'
import type { GenerateProduct } from './GenerateProductTable'
import { resolveAssetsAction } from '@/app/generate/actions'
import { hydrateTemplateElements, hydrateText } from '@/lib/export/exportUtils'
import { enrichProductDataWithIcons } from '@/lib/engine/productUtils'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { PIXELS_PER_MM } from '@/lib/constants'
import { resolveZoneHomeEnAction } from '@/app/products/actions'

type ExportStatus = 'pending' | 'exporting' | 'done' | 'error'

interface ProductExportItem {
    product: GenerateProduct
    status: ExportStatus
    error?: string
}

interface BulkExportPanelProps {
    selectedProducts: GenerateProduct[]
    template: TemplateOption | null
    rules: any[]
    onClose: () => void
}

function sanitizeFilename(name: string): string {
    // Eliminar caracteres prohibidos en sistemas de archivos (\ / : * ? " < > |)
    // Especialmente el '/' que estaba causando el error del usuario
    return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}

async function exportOneProduct(
    product: GenerateProduct, 
    template: TemplateOption, 
    format: 'pdf' | 'jpg',
    rules: any[],
    directoryHandle: any | null = null
): Promise<void> {
    let elements: any[] = []
    try {
        elements = JSON.parse(template.elements_json || '[]')
    } catch { elements = [] }

    // 1. Identificar activos a resolver
    const assetIds = elements
        .filter(el => (el.type === 'image' || el.type === 'dynamic_image') && el.content && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(el.content))
        .map(el => el.content)
    
    // 2. Resolver assets
    const assetMap = await resolveAssetsAction(assetIds)

    // 3. Hidratar
    const hydrated = await hydrateTemplateElements(elements, product, assetMap)

    // 4. Preparar nombre y contexto
    const engineResult = evaluateProductRules(product as any, rules)
    const final_name_es = engineResult.finalNameEs || product.final_name_es || ''
    const zoneEn = await resolveZoneHomeEnAction(product.zone_home)
    const contextWithDerivedName = { ...product, final_name_es, zone_home_en: zoneEn || undefined }
    const enriched = enrichProductDataWithIcons(contextWithDerivedName, assetMap)
    
    // Obtenemos el nombre base y lo sanitizamos para evitar errores de sistema de archivos
    const rawDownloadName = hydrateText((template as any).export_filename_format || '{sku_base}_{final_name_es}', enriched)
    const downloadName = sanitizeFilename(rawDownloadName)
    const fileName = `${downloadName}.${format}`

    // 5. Payload para el API
    const widthPx = Math.round((template.width_mm || 200) * PIXELS_PER_MM)
    const heightPx = Math.round((template.height_mm || 100) * PIXELS_PER_MM)

    const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            elements: hydrated, 
            format, 
            width: widthPx, 
            height: heightPx,
            filename: downloadName
        }),
    })

    if (!response.ok) throw new Error(`Error exportando ${product.code}`)

    const blob = await response.blob()

    // 6. Guardar: En Carpeta o mediante Descarga Navegador
    if (directoryHandle) {
        try {
            const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true })
            const writable = await fileHandle.createWritable()
            await writable.write(blob)
            await writable.close()
        } catch (err) {
            console.error("Error guardando en carpeta seleccionada", err)
            throw new Error(`Permiso denegado o error al guardar archivo: ${fileName}`)
        }
    } else {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
    }
}

export function BulkExportPanel({ selectedProducts, template, rules, onClose }: BulkExportPanelProps) {
    const [items, setItems] = useState<ProductExportItem[]>(
        selectedProducts.map(p => ({ product: p, status: 'pending' }))
    )
    const [isRunning, setIsRunning] = useState(false)
    const [started, setStarted] = useState(false)
    const [directoryHandle, setDirectoryHandle] = useState<any | null>(null)
    const [directoryName, setDirectoryName] = useState<string | null>(null)
    const isCancelledRef = useRef(false)
    
    // Formatos permitidos
    const allowedFormats = useMemo(() => {
        if (!template?.export_formats) return ['pdf', 'jpg']
        return template.export_formats.split(',').map((f: string) => f.trim().toLowerCase())
    }, [template])

    const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'jpg'>(
        allowedFormats.length > 0 ? (allowedFormats[0] as any) : 'pdf'
    )

    const requiredFields = useMemo(
        () => template ? getTemplateRequiredFields(template.elements_json) : [],
        [template]
    )

    const warnings = useMemo(() =>
        selectedProducts.map(p => ({
            productCode: p.code,
            productName: p.final_name_es || '',
            missingFields: getMissingFields(p, requiredFields),
        })),
        [selectedProducts, requiredFields]
    )

    const hasWarnings = warnings.some(w => w.missingFields.length > 0)

    const done = items.filter(i => i.status === 'done').length
    const errors = items.filter(i => i.status === 'error').length
    const total = items.length
    const progress = Math.round(((done + errors) / total) * 100)
    const estimatedSeconds = Math.round(total * 2)

    const updateItem = useCallback((id: string, status: ExportStatus, error?: string) => {
        setItems(prev => prev.map(item =>
            item.product.id === id ? { ...item, status, error } : item
        ))
    }, [])

    const handlePickDirectory = async () => {
        try {
            const handle = await (window as any).showDirectoryPicker({
                mode: 'readwrite'
            })
            setDirectoryHandle(handle)
            setDirectoryName(handle.name)
            toast.success(`Carpeta seleccionada: ${handle.name}`)
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                toast.error("Error al seleccionar carpeta")
                console.error(err)
            }
        }
    }

    const startExport = async () => {
        if (!template) return
        setIsRunning(true)
        setStarted(true)
        isCancelledRef.current = false

        for (const item of items) {
            if (isCancelledRef.current) break
            if (item.status !== 'pending') continue

            updateItem(item.product.id, 'exporting')
            try {
                await exportOneProduct(item.product, template, selectedFormat, rules, directoryHandle)
                updateItem(item.product.id, 'done')
            } catch (err: any) {
                updateItem(item.product.id, 'error', err?.message || 'Error desconocido')
            }
        }

        const wasCancelled = isCancelledRef.current
        setIsRunning(false)
        if (wasCancelled) {
            toast.error('Exportación detenida por el usuario')
        } else {
            toast.success(`Exportación completada: ${items.filter(i => i.status === 'done').length} archivo(s) guardado(s)`)
        }
    }

    const cancelExport = () => {
        isCancelledRef.current = true
        setIsRunning(false)
    }

    const statusIcon = (status: ExportStatus) => {
        if (status === 'pending') return <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
        if (status === 'exporting') return <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
        if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        return <XCircle className="w-4 h-4 text-red-400 shrink-0" />
    }

    return (
        <div className="flex flex-col gap-5">
            {/* Header info */}
            <div className="flex items-center gap-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                    <p className="font-semibold text-slate-800">{total} producto(s) seleccionado(s)</p>
                    <p className="text-sm text-slate-500">
                        Plantilla: <span className="font-medium text-indigo-600">{template?.name || 'Sin plantilla'}</span>
                        {!started && (
                            <span className="ml-2 text-slate-400">
                                · Est. <Clock className="w-3 h-3 inline" /> ~{estimatedSeconds}s
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {/* Advertencias (informativas, no bloquean) */}
            {hasWarnings && (
                <ValidationWarnings warnings={warnings} />
            )}

            {/* Progreso */}
            {started && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{done + errors} / {total} completados</span>
                        <Badge variant={isRunning ? 'secondary' : errors === 0 ? 'default' : 'destructive'} className="text-xs">
                            {isRunning ? 'Exportando...' : errors === 0 ? 'Completado' : `${errors} error(es)`}
                        </Badge>
                    </div>
                    <Progress value={progress} className="h-2" />
                </div>
            )}

            {/* Lista de productos — scroll independiente */}
            <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50 max-h-60 overflow-y-auto">
                {items.map(item => (
                    <div key={item.product.id} className={`flex items-center gap-3 px-4 py-3 ${item.status === 'exporting' ? 'bg-indigo-50/50' : item.status === 'done' ? 'bg-green-50/30' : item.status === 'error' ? 'bg-red-50/30' : ''}`}>
                        {statusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                            <p className="font-mono text-sm font-semibold text-slate-800 truncate">{item.product.code}</p>
                            {item.product.final_name_es && (
                                <p className="text-xs text-slate-400 truncate">{item.product.final_name_es}</p>
                            )}
                            {item.error && (
                                <p className="text-xs text-red-500 mt-0.5">{item.error}</p>
                            )}
                        </div>
                        {warnings.find(w => w.productCode === item.product.code)?.missingFields.length ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : null}
                    </div>
                ))}
            </div>

            {/* Destino y Formato */}
            {!started && (
                <div className="flex flex-col gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                            Destino de exportación
                        </label>
                        {!directoryHandle ? (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handlePickDirectory}
                                className="w-full bg-white border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-all border-dashed"
                            >
                                <FolderRoot className="w-4 h-4 mr-2" />
                                Elegir carpeta de destino (Opcional)
                            </Button>
                        ) : (
                            <div className="flex items-center gap-2 w-full">
                                <div className="flex-1 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2 truncate">
                                        <FolderCheck className="w-4 h-4 text-indigo-500 shrink-0" />
                                        <span className="text-sm font-medium text-indigo-700 truncate">
                                            {directoryName}
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => { setDirectoryHandle(null); setDirectoryName(null); }}
                                        className="h-8 w-8 text-slate-400 hover:text-red-500"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                        <p className="text-[10px] text-slate-400 ml-1 italic leading-tight">
                            * Si no eliges carpeta, los archivos se descargarán por defecto en "Descargas".
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                            Formato de archivo
                        </label>
                        <div className="flex items-center gap-2 p-1 bg-slate-200/50 rounded-lg w-full">
                            {allowedFormats.map(f => (
                                <button
                                    key={f}
                                    onClick={() => setSelectedFormat(f as any)}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${selectedFormat === f ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {f.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Acciones — ancla fija al fondo */}
            <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                {!started ? (
                    <>
                        <Button
                            onClick={startExport}
                            disabled={!template || isRunning || !allowedFormats.includes(selectedFormat)}
                            className={`flex-1 ${
                                !allowedFormats.includes(selectedFormat)
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100'
                            }`}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            {!allowedFormats.includes(selectedFormat) 
                                ? `Formato ${selectedFormat.toUpperCase()} no permitido`
                                : `Iniciar Exportación (${total})`
                            }
                        </Button>
                        <Button variant="outline" onClick={onClose} className="w-24">
                            Cerrar
                        </Button>
                    </>
                ) : (
                    <div className="flex items-center gap-2 w-full">
                        {isRunning && (
                            <Button 
                                variant="destructive" 
                                onClick={cancelExport} 
                                className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 border-none shadow-none font-bold"
                            >
                                <StopCircle className="w-4 h-4 mr-2" />
                                Detener Exportación
                            </Button>
                        )}
                        <Button variant="outline" onClick={onClose} className={isRunning ? 'w-24' : 'flex-1'}>
                            {isRunning ? 'Esperar' : 'Cerrar'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
