'use client'

import { useState, useCallback, useMemo } from 'react'
import { Download, Loader2, CheckCircle2, XCircle, Clock, Package, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ValidationWarnings, getMissingFields, getTemplateRequiredFields, fieldLabel } from './ValidationWarnings'
import type { TemplateOption } from './TemplatePicker'
import type { GenerateProduct } from './GenerateProductTable'
import { resolveAssetsAction } from '@/app/generate/actions'
import { hydrateTemplateElements } from '@/lib/export/exportUtils'
import { enrichProductData } from '@/lib/engine/productUtils'
import { PIXELS_PER_MM } from '@/lib/constants'

type ExportStatus = 'pending' | 'exporting' | 'done' | 'error'

interface ProductExportItem {
    product: GenerateProduct
    status: ExportStatus
    error?: string
}

interface BulkExportPanelProps {
    selectedProducts: GenerateProduct[]
    template: TemplateOption | null
    onClose: () => void
}

async function exportOneProduct(
    product: GenerateProduct, 
    template: TemplateOption, 
    format: 'pdf' | 'jpg'
): Promise<void> {
    let elements: any[] = []
    try {
        elements = JSON.parse(template.elements_json || '[]')
    } catch { elements = [] }

    // 1. Identificar activos a resolver (UUIDs en campos de imagen)
    const assetIds = elements
        .filter(el => (el.type === 'image' || el.type === 'dynamic_image') && el.content && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(el.content))
        .map(el => el.content)
    
    // 2. Resolver assets mediante acción de servidor
    const assetMap = await resolveAssetsAction(assetIds)

    // 3. Hidratar usando la función maestra (R6)
    // hydrateTemplateElements ya se encarga de resolver variables, iconos y assets
    const hydrated = await hydrateTemplateElements(elements, product, assetMap)

    // 5. Generar Payload con utilidad centralizada
    const widthPx = Math.round((template.width_mm || 200) * PIXELS_PER_MM)
    const heightPx = Math.round((template.height_mm || 100) * PIXELS_PER_MM)

    const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            elements: hydrated, 
            format, 
            width: widthPx, 
            height: heightPx 
        }),
    })

    if (!response.ok) throw new Error(`Error exportando ${product.code}`)

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${product.code}_${template.name.replace(/\s+/g, '_')}.${format}`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
}

export function BulkExportPanel({ selectedProducts, template, onClose }: BulkExportPanelProps) {
    const [items, setItems] = useState<ProductExportItem[]>(
        selectedProducts.map(p => ({ product: p, status: 'pending' }))
    )
    const [isRunning, setIsRunning] = useState(false)
    const [started, setStarted] = useState(false)
    const [warningsConfirmed, setWarningsConfirmed] = useState(false)
    
    // Formatos permitidos por la plantilla
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

    const startExport = async () => {
        if (!template) return
        setIsRunning(true)
        setStarted(true)

        for (const item of items) {
            if (item.status !== 'pending') continue
            updateItem(item.product.id, 'exporting')
            try {
                await exportOneProduct(item.product, template, selectedFormat)
                updateItem(item.product.id, 'done')
            } catch (err: any) {
                updateItem(item.product.id, 'error', err?.message || 'Error desconocido')
            }
        }

        setIsRunning(false)
        toast.success(`Exportación completada: ${done + 1} archivo(s) descargado(s)`)
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

            {/* Acciones — ancla fija al fondo */}
            <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                {!started ? (
                    <>
                        <div className="flex flex-col gap-2 flex-1">
                            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg w-full">
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
                            <Button
                                onClick={startExport}
                                disabled={!template || isRunning || !allowedFormats.includes(selectedFormat)}
                                className={`w-full ${
                                    !allowedFormats.includes(selectedFormat)
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100'
                                }`}
                            >
                                <Download className="w-4 h-4 mr-2" />
                                {!allowedFormats.includes(selectedFormat) 
                                    ? `Formato ${selectedFormat.toUpperCase()} no permitido`
                                    : `Exportar ${selectedFormat.toUpperCase()} (${total})`
                                }
                            </Button>
                        </div>
                        <Button variant="outline" onClick={onClose} className="w-24 self-end">
                            Cancelar
                        </Button>
                    </>
                ) : (
                    <Button variant="outline" onClick={onClose} className="flex-1">
                        {isRunning ? 'Exportando...' : 'Cerrar'}
                    </Button>
                )}
            </div>
        </div>
    )
}
