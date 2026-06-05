'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
    Printer,
    Search,
    X,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Settings2,
    ChevronDown,
    ChevronUp,
    FileText,
    Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

import { TemplatePicker, type TemplateOption } from '@/components/generate/TemplatePicker'
import { GenerateProductTable, type GenerateProduct } from '@/components/generate/GenerateProductTable'
import { getTemplateRequiredFields, getTemplateValidationIssues } from '@/components/generate/ValidationWarnings'
import { hydrateTemplateElements } from '@/lib/export/exportUtils'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import type { ProductPayload } from '@/lib/engine/translator'
import { PIXELS_PER_MM } from '@/lib/constants'
import { getFilteredProducts, resolvePrintAssetsAction, resolveZoneHomeEnForPrintAction } from '@/app/print/actions'
import { defaultPrintSettings, normalizePrintColorMode, PRINT_SETTINGS_KEY } from '@/lib/printSettings'

interface PrintClientProps {
    templates: TemplateOption[]
    rules: Record<string, unknown>[]
}

type PrintStatus = 'pending' | 'printing' | 'done' | 'error'

interface PrintItem {
    product: GenerateProduct
    status: PrintStatus
    error?: string
}

const PRINTER_CONFIG_KEY = 'samiGen-printer-config'
const PRINT_AGENT_DOWNLOAD_URL = '/downloads/samigen-print-agent-setup.exe'

type PrintFormat = 'pdf' | 'jpg'

interface PrinterConfig {
    agentUrl: string
    printerName: string
}

const defaultPrinterConfig: PrinterConfig = {
    agentUrl: 'http://127.0.0.1:3344',
    printerName: '3nStar LTT334',
}

function getSavedPrintColorMode() {
    if (typeof window === 'undefined') return defaultPrintSettings.colorMode
    const saved = window.localStorage.getItem(PRINT_SETTINGS_KEY)
    if (!saved) return defaultPrintSettings.colorMode

    try {
        return normalizePrintColorMode(JSON.parse(saved)?.colorMode)
    } catch {
        return defaultPrintSettings.colorMode
    }
}

export function PrintClient({ templates, rules }: PrintClientProps) {
    const [textFilter, setTextFilter] = useState('')
    const [products, setProducts] = useState<GenerateProduct[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(templates[0]?.id ?? null)
    const [printFormat, setPrintFormat] = useState<PrintFormat>('pdf')
    const [copies, setCopies] = useState(1)
    const [showPrinterConfig, setShowPrinterConfig] = useState(false)
    const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(PRINTER_CONFIG_KEY)
            if (saved) {
                try { return JSON.parse(saved) } catch { /* ignore */ }
            }
        }
        return defaultPrinterConfig
    })

    const [printItems, setPrintItems] = useState<PrintItem[]>([])
    const [isPrinting, setIsPrinting] = useState(false)
    const [showPrintDialog, setShowPrintDialog] = useState(false)
    const [agentOnline, setAgentOnline] = useState<boolean | null>(null)
    const [agentPrinters, setAgentPrinters] = useState<string[]>([])
    const [printerDetected, setPrinterDetected] = useState<boolean>(false)

    useEffect(() => {
        localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(printerConfig))
    }, [printerConfig])

    const checkAgent = useCallback(async () => {
        try {
            const res = await fetch(`${printerConfig.agentUrl}/health`, { signal: AbortSignal.timeout(3000) })
            if (res.ok) {
                const data = await res.json()
                setAgentOnline(true)
                setAgentPrinters(data.printers || [])
                setPrinterDetected(data.printerDetected === true)
            } else {
                setAgentOnline(false)
                setPrinterDetected(false)
            }
        } catch {
            setAgentOnline(false)
            setAgentPrinters([])
            setPrinterDetected(false)
        }
    }, [printerConfig.agentUrl])

    useEffect(() => {
        checkAgent()
        const interval = setInterval(checkAgent, 10000)
        return () => clearInterval(interval)
    }, [checkAgent])

    const selectedTemplate = useMemo(
        () => templates.find(t => t.id === selectedTemplateId) ?? null,
        [templates, selectedTemplateId]
    )

    const requiredFields = useMemo(
        () => selectedTemplate ? getTemplateRequiredFields(selectedTemplate.elements_json) : [],
        [selectedTemplate]
    )

    const validProducts = useMemo(() => {
        if (!selectedTemplate || requiredFields.length === 0) return products
        return products.filter(p => getTemplateValidationIssues(p, requiredFields).length === 0)
    }, [products, selectedTemplate, requiredFields])

    const selectedProducts = useMemo(
        () => validProducts.filter(p => selectedIds.includes(p.id)),
        [validProducts, selectedIds]
    )

    const warnings = useMemo(() =>
        selectedProducts.map(p => ({
            productCode: p.code,
            productName: p.final_name_es || '',
            issues: getTemplateValidationIssues(p, requiredFields),
        })),
        [selectedProducts, requiredFields]
    )

    const hasWarnings = warnings.some(w => w.issues.length > 0)

    const allowedFormats = useMemo(() => {
        if (!selectedTemplate?.export_formats) return ['pdf', 'jpg']
        return selectedTemplate.export_formats.split(',').map((f: string) => f.trim().toLowerCase())
    }, [selectedTemplate])

    useEffect(() => {
        if (allowedFormats.length > 0 && !allowedFormats.includes(printFormat)) {
            setPrintFormat(allowedFormats[0] as PrintFormat)
        }
    }, [allowedFormats, printFormat])

    const [hasSearched, setHasSearched] = useState(false)

    const filteredOutCount = products.length - validProducts.length

    useEffect(() => {
        setSelectedIds([])
    }, [selectedTemplateId])

    const handleSearch = useCallback(async () => {
        setLoading(true)
        setHasSearched(true)
        try {
            const result = await getFilteredProducts(textFilter || null, 1, 500)
            setProducts(result.products as unknown as GenerateProduct[])
            setSelectedIds([])
        } catch (err: unknown) {
            toast.error('Error al cargar productos: ' + ((err as Error)?.message || 'Error desconocido'))
        } finally {
            setLoading(false)
        }
    }, [textFilter])

    const handlePrintProduct = async (product: GenerateProduct): Promise<boolean> => {
        if (!selectedTemplate) return false

        const elements: Record<string, unknown>[] = (() => {
            try { return JSON.parse(selectedTemplate.elements_json || '[]') }
            catch { return [] }
        })()

        const isUuid = (v: unknown): v is string =>
            typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

        const assetIds = elements
            .filter((el) =>
                (el.type === 'image' || el.type === 'dynamic_image') &&
                typeof el.content === 'string' &&
                isUuid(el.content)
            )
            .map((el) => el.content as string)

        const assetMap = await resolvePrintAssetsAction(assetIds)
        const engineResult = evaluateProductRules(product as unknown as Parameters<typeof evaluateProductRules>[0], rules as unknown as Parameters<typeof evaluateProductRules>[1])
        const finalNameEs = engineResult.finalNameEs || product.final_name_es || ''

        const { translateProductToEnglish } = await import('@/lib/engine/translator')
        const productType = (product.product_type || 'MUEBLE').toUpperCase()
        const translationResult = await translateProductToEnglish(product as unknown as ProductPayload, productType, engineResult.activeVariableIds)
        const finalNameEn = translationResult.translatedName || product.final_name_en || ''

        const zoneEn = await resolveZoneHomeEnForPrintAction(product.zone_home as string | null | undefined)
        const updatedProduct = {
            ...product,
            final_name_es: finalNameEs,
            final_name_en: finalNameEn,
            zone_home_en: zoneEn || undefined,
        }

        const hydrated = await hydrateTemplateElements(elements, updatedProduct, assetMap)
        const widthPx = Math.round((selectedTemplate.width_mm || 200) * PIXELS_PER_MM)
        const heightPx = Math.round((selectedTemplate.height_mm || 100) * PIXELS_PER_MM)

        if (printerConfig.agentUrl) {
            const imageResponse = await fetch('/api/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: product.id,
                    isExternalSource: product.is_external === true,
                    format: 'jpg',
                    elements: hydrated,
                    width: widthPx,
                    height: heightPx,
                    templateFontFamily: selectedTemplate.template_font_family,
                    copies,
                }),
            })

            if (!imageResponse.ok) {
                const payload = await imageResponse.json().catch(() => null)
                throw new Error(payload?.error || `Error al generar imagen para ${product.code}`)
            }

            const blob = await imageResponse.blob()
            if (!blob || blob.size <= 0) {
                throw new Error(`Imagen vacía para ${product.code}`)
            }

            const formData = new FormData()
            formData.append('file', new File([blob], `${product.code || 'etiqueta'}.jpg`, { type: 'image/jpeg' }))
            formData.append('copies', String(copies))
            formData.append('colorMode', getSavedPrintColorMode())

            const agentResponse = await fetch(`${printerConfig.agentUrl}/print`, {
                method: 'POST',
                body: formData,
            })

            if (!agentResponse.ok) {
                const payload = await agentResponse.json().catch(() => null)
                throw new Error(payload?.error || 'Error al enviar a la impresora local')
            }
            return true
        }

        const response = await fetch('/api/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productId: product.id,
                isExternalSource: product.is_external === true,
                format: printFormat,
                elements: hydrated,
                width: widthPx,
                height: heightPx,
                templateFontFamily: selectedTemplate.template_font_family,
                copies,
            }),
        })

        if (!response.ok) {
            const payload = await response.json().catch(() => null)
            throw new Error(payload?.error || `Error al generar documento para ${product.code}`)
        }

        const blob = await response.blob()
        if (!blob || blob.size <= 0) {
            throw new Error(`Documento vacío para ${product.code}`)
        }

        return true
    }

    const startPrinting = async () => {
        if (!selectedTemplate || selectedProducts.length === 0) return

        setIsPrinting(true)
        setShowPrintDialog(true)

        const items: PrintItem[] = selectedProducts.map(p => ({ product: p, status: 'pending' }))
        setPrintItems(items)

        let done = 0
        let errors = 0

        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            setPrintItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'printing' } : p))

            try {
                await handlePrintProduct(item.product)
                setPrintItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p))
                done++
            } catch (err: unknown) {
                setPrintItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: (err as Error)?.message } : p))
                errors++
            }
        }

        setIsPrinting(false)
        const baseMsg = `${done} documento(s) enviado(s) a impresión`
        toast.success(errors > 0 ? `${baseMsg}, ${errors} error(es)` : baseMsg)
    }

    const statusIcon = (status: PrintStatus) => {
        if (status === 'pending') return <Clock className="w-4 h-4 text-slate-300 shrink-0" />
        if (status === 'printing') return <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
        if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        return <XCircle className="w-4 h-4 text-red-400 shrink-0" />
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Template picker at the top */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                    <span className="text-sm font-semibold text-slate-700">Plantilla:</span>
                    <TemplatePicker
                        templates={templates}
                        selectedTemplateId={selectedTemplateId}
                        onSelect={setSelectedTemplateId}
                    />
                </div>
                {selectedTemplate && (
                    <span className="text-xs text-slate-400">
                        {selectedTemplate.width_mm}&times;{selectedTemplate.height_mm}mm &middot; {selectedTemplate.orientation}
                    </span>
                )}
            </div>

            {!selectedTemplate && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                    No hay plantillas activas. Crea una desde <a href="/templates" className="underline">Plantillas</a>.
                </div>
            )}

            {/* Single text search */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-lg">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <Input
                            type="text"
                            placeholder="Buscar por código, nombre, color..."
                            value={textFilter}
                            onChange={(e) => setTextFilter(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                            className="pl-9 pr-8 h-10 w-full"
                        />
                        {textFilter && (
                            <button
                                onClick={() => setTextFilter('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <Button onClick={handleSearch} disabled={loading} className="shrink-0">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                        Buscar
                    </Button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                    Busca en código, nombre, color, referencia, medida comercial
                </p>
            </div>

            {/* Printer settings */}
            {selectedTemplate && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500">Formato:</span>
                            <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                {allowedFormats.map((fmt) => (
                                    <button
                                        key={fmt}
                                        onClick={() => setPrintFormat(fmt as PrintFormat)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                                            printFormat === fmt ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        {fmt.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500">Copias:</span>
                            <Input
                                type="number"
                                min={1}
                                max={999}
                                value={copies}
                                onChange={(e) => setCopies(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
                                className="w-20 h-9 text-center"
                            />
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPrinterConfig(!showPrinterConfig)}
                            className="text-slate-500 ml-auto"
                        >
                            <Settings2 className="w-4 h-4 mr-1" />
                            Conexi&oacute;n
                            {showPrinterConfig ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                        </Button>
                    </div>

                    {showPrinterConfig && (
                        <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        Agente local de impresi&oacute;n
                                    </label>
                                    <div className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-600">
                                        USB directo con agente local
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        URL del agente
                                    </label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={printerConfig.agentUrl}
                                            onChange={(e) => setPrinterConfig(prev => ({ ...prev, agentUrl: e.target.value }))}
                                            placeholder="http://127.0.0.1:3344"
                                            className="text-sm font-mono flex-1"
                                        />
                                        <Button variant="outline" size="sm" onClick={checkAgent}>
                                            Probar
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Agent status */}
                            <div className={`rounded-xl px-4 py-3 text-sm border ${
                                agentOnline === true
                                    ? 'bg-green-50 border-green-200 text-green-700'
                                    : agentOnline === false
                                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}>
                                    {agentOnline === true ? (
                                        printerDetected ? (
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                                <span>Impresora lista</span>
                                                {agentPrinters.length > 0 && (
                                                    <span className="text-xs text-green-600">
                                                        ({agentPrinters.join(', ')})
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                                    <span><strong>Conectar impresora</strong></span>
                                                </div>
                                                <p className="text-xs text-amber-600 mt-1">
                                                    El agente est&aacute; corriendo pero no detecta la impresora USB.
                                                    Verifica que la 3nStar (4BARCODE 4B-2054TG) est&eacute; conectada y encendida.
                                                </p>
                                            </div>
                                        )
                                    ) : agentOnline === false ? (
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                                <span><strong>Agente no instalado o no iniciado</strong></span>
                                            </div>
                                            <p className="text-xs text-amber-600 mt-1">
                                                Esta PC necesita el agente local para enviar etiquetas a la impresora USB.
                                            </p>
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                <a
                                                    href={PRINT_AGENT_DOWNLOAD_URL}
                                                    download
                                                    className="inline-flex h-8 items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-700 shadow-xs transition-colors hover:bg-amber-100"
                                                >
                                                    <Download className="w-3.5 h-3.5 mr-1" />
                                                    Descargar agente de impresi&oacute;n
                                                </a>
                                                <Button variant="ghost" size="sm" onClick={checkAgent} className="h-8 text-amber-700 hover:bg-amber-100">
                                                    Probar de nuevo
                                                </Button>
                                            </div>
                                            <ol className="text-xs text-amber-600 mt-3 ml-4 list-decimal space-y-1">
                                                <li>Descarga e instala el agente en esta PC.</li>
                                                <li>Conecta y enciende la impresora 3nStar/4BARCODE.</li>
                                                <li>Vuelve a esta pantalla y presiona <strong>Probar</strong>.</li>
                                            </ol>
                                        </div>
                                    ) : (
                                        <span>Verificando conexi&oacute;n...</span>
                                    )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Product table — only after search */}
            {!hasSearched ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                    <Search className="w-12 h-12 mb-3 text-slate-300" />
                    <p className="text-lg font-medium">Selecciona filtros y presiona <strong>Buscar</strong></p>
                    <p className="text-sm">para ver los productos disponibles</p>
                </div>
            ) : loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
            ) : validProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                    <X className="w-12 h-12 mb-3 text-slate-300" />
                    <p className="text-lg font-medium">Sin resultados</p>
                    <p className="text-sm">{products.length > 0 ? `${products.length} producto(s) incompleto(s) para esta plantilla` : 'Prueba con otros filtros o término de búsqueda'}</p>
                </div>
            ) : (
                <>
                {filteredOutCount > 0 && (
                    <p className="text-xs text-amber-600 -mt-3">
                        {filteredOutCount} producto(s) oculto(s) por no cumplir con la plantilla
                    </p>
                )}
                <div className="overflow-x-auto [&_table]:w-full [&_table]:table-fixed [&_th:nth-child(1)]:w-10 [&_td:nth-child(1)]:w-10 [&_th:nth-child(2)]:w-36 [&_td:nth-child(2)]:w-36 [&_td:nth-child(2)]:whitespace-normal [&_td:nth-child(2)]:break-all [&_td:nth-child(2)]:overflow-hidden [&_th:nth-child(3)]:w-auto [&_td:nth-child(3)]:whitespace-normal [&_td:nth-child(3)]:break-words [&_td:nth-child(3)]:min-w-0 [&_th:nth-child(4)]:w-32 [&_td:nth-child(4)]:w-32 [&_td:nth-child(4)]:break-words">
                <GenerateProductTable
                    products={validProducts}
                    onSelectionChange={setSelectedIds}
                    selectedIds={selectedIds}
                    hideActions
                />
                </div>
                </>
            )}

            {/* Sticky footer with print button */}
            {selectedIds.length > 0 && selectedTemplate && (
                <div className="sticky bottom-4 z-20">
                    <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl shadow-xl px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                                {selectedIds.length}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-800">
                                    {selectedIds.length} producto{selectedIds.length > 1 ? 's' : ''} seleccionado{selectedIds.length > 1 ? 's' : ''}
                                    {' \u00b7 '}
                                    {copies} copia{copies > 1 ? 's' : ''} c/u
                                    {' \u00b7 '}
                                    {printFormat.toUpperCase()}
                                </p>
                                {hasWarnings ? (
                                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                        <XCircle className="w-3 h-3" />
                                        {warnings.filter(w => w.issues.length > 0).length} con datos incompletos
                                    </p>
                                ) : (
                                    <p className="text-xs text-green-600 mt-0.5">Listo para imprimir</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedIds([])}
                                className="text-slate-500 hover:text-slate-700"
                            >
                                <X className="w-4 h-4 mr-1" />
                                Limpiar
                            </Button>
                            <Button
                                onClick={startPrinting}
                                disabled={
                                    isPrinting ||
                                    selectedProducts.length === 0 ||
                                    (agentOnline === true && !printerDetected)
                                }
                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                title={
                                    agentOnline === true && !printerDetected
                                        ? 'Conecta la impresora USB para imprimir'
                                        : undefined
                                }
                            >
                                <Printer className="w-4 h-4 mr-2" />
                                Imprimir ({selectedIds.length})
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Print progress dialog */}
            <Dialog open={showPrintDialog} onOpenChange={(open) => { if (!isPrinting) setShowPrintDialog(open) }}>
                <DialogContent className="max-w-lg rounded-2xl max-h-[80vh] flex flex-col overflow-hidden">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Printer className="w-5 h-5 text-indigo-500" />
                            Enviando a impresi&oacute;n
                            {isPrinting && <Loader2 className="w-4 h-4 animate-spin text-indigo-500 ml-1" />}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-slate-50">
                        {printItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <Printer className="w-12 h-12 mb-3 opacity-30" />
                                <p className="text-sm">Preparando documentos...</p>
                            </div>
                        ) : (
                            printItems.map((item) => (
                                <div key={item.product.id} className={`flex items-center gap-3 px-4 py-3 ${
                                    item.status === 'printing' ? 'bg-indigo-50/50' :
                                    item.status === 'done' ? 'bg-green-50/30' :
                                    item.status === 'error' ? 'bg-red-50/30' : ''
                                }`}>
                                    {statusIcon(item.status)}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-mono text-sm font-semibold text-slate-800 truncate">
                                            {item.product.code}
                                        </p>
                                        {item.product.final_name_es && (
                                            <p className="text-xs text-slate-400 truncate">{item.product.final_name_es}</p>
                                        )}
                                        {item.error && (
                                            <p className="text-xs text-red-500 mt-0.5">{item.error}</p>
                                        )}
                                    </div>
                                    <Badge variant={
                                        item.status === 'done' ? 'default' :
                                        item.status === 'error' ? 'destructive' :
                                        item.status === 'printing' ? 'secondary' : 'outline'
                                    } className="text-[10px]">
                                        {item.status === 'done' ? 'Enviado' :
                                         item.status === 'error' ? 'Error' :
                                         item.status === 'printing' ? 'Imprimiendo...' : 'Pendiente'}
                                    </Badge>
                                </div>
                            ))
                        )}
                    </div>
                    {!isPrinting && (
                        <div className="flex justify-end pt-3 border-t border-slate-100">
                            <Button onClick={() => setShowPrintDialog(false)} variant="outline">
                                Cerrar
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
