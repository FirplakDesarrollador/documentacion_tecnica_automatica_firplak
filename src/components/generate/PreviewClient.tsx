'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Download, Loader2, LayoutTemplate, AlertTriangle, XCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { TemplatePicker, type TemplateOption } from '@/components/generate/TemplatePicker'
import { ValidationWarnings, getTemplateRequiredFields, getTemplateValidationIssues } from '@/components/generate/ValidationWarnings'
import { resolveAssetsAction } from '@/app/generate/actions'
import { resolvePublicDocumentUrlsForProductAction } from '@/app/templates/actions'
import { hydrateTemplateElements, hydrateText } from '@/lib/export/exportUtils'
import { enrichProductDataWithIcons } from '@/lib/engine/productUtils'
import { PIXELS_PER_MM } from '@/lib/constants'
import DocumentRenderSurface from '@/components/export/DocumentRenderSurface'
import { resolveZoneHomeEnAction } from '@/app/configuration/glossary/actions'
import { attachDocumentQrUrls, collectRelatedDocumentQrSlots } from '@/lib/templates/documentQrFields'
import {
    appendLabelBoxSuffix,
    expandLabelBoxProducts,
    filenameFormatUsesLabelBoxVariable,
} from '@/lib/engine/labelParts'

interface PreviewClientProps {
    product: Record<string, unknown>
    templates: TemplateOption[]
    initialTemplateId: string | null
    engineResult: {
        finalNameEs: string
        finalNameEn?: string
        activeIcons: string[]
        trace: { passed: boolean; condition: string; actionTaken?: string; payload?: string }[]
    }
}

type ExportFormat = 'pdf' | 'jpg'

type PreviewProduct = Record<string, unknown> & {
    code?: string
    commercial_measure?: string | null
    familia_code?: string | null
    final_name_en?: string
    final_name_es?: string
    id?: string
    inactive_reasons?: string[]
    is_exportable?: boolean
    is_external?: boolean
    zone_home?: string | null
}

type TemplateElement = Record<string, unknown> & {
    content?: string
    dataField?: string
    documentQrMode?: string | null
    documentSlot?: string | null
    name?: string
    type?: string
}

type HydratedPreviewElement = TemplateElement & {
    resolvedSrc?: string
}

type HydratedPreviewItem = {
    product: PreviewProduct
    elements: HydratedPreviewElement[]
}

type PreflightReport = {
    criticalErrors: string[]
    missingAssets: string[]
    missingVariables: string[]
}

const DEFAULT_EXPORT_FORMATS: ExportFormat[] = ['pdf', 'jpg']
const DYNAMIC_ICON_KEYS = ['icon_rh', 'icon_canto', 'icon_bisagras', 'icon_riel', 'icon_group', 'icon_logo'] as const

function isExportFormat(value: string): value is ExportFormat {
    return value === 'pdf' || value === 'jpg'
}

function getAllowedExportFormats(template: TemplateOption | null): ExportFormat[] {
    if (!template?.export_formats) return DEFAULT_EXPORT_FORMATS

    const formats = template.export_formats
        .split(',')
        .map(format => format.trim().toLowerCase())
        .filter(isExportFormat)

    return formats.length > 0 ? formats : DEFAULT_EXPORT_FORMATS
}

function sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
}

function parseTemplateElements(elementsJson: string): TemplateElement[] {
    try {
        const parsed = JSON.parse(elementsJson)
        return Array.isArray(parsed) ? parsed as TemplateElement[] : []
    } catch {
        return []
    }
}

function normalizeHydratedElements(elements: Record<string, unknown>[]): HydratedPreviewElement[] {
    return elements.map((element) => {
        const resolvedSrc = typeof element.resolvedSrc === 'string' ? element.resolvedSrc : undefined
        return {
            ...(element as TemplateElement),
            resolvedSrc,
        }
    })
}

async function attachResolvedDocumentQrUrls(product: PreviewProduct, elements: TemplateElement[]): Promise<PreviewProduct> {
    const slots = collectRelatedDocumentQrSlots(elements)
    if (slots.length === 0) return product

    try {
        const urls = await resolvePublicDocumentUrlsForProductAction(product, slots)
        return attachDocumentQrUrls(product, urls) as PreviewProduct
    } catch {
        return product
    }
}

export function PreviewClient({ product: rawProduct, templates, initialTemplateId, engineResult }: PreviewClientProps) {
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
        initialTemplateId ?? templates[0]?.id ?? null
    )
    const [isExporting, setIsExporting] = useState(false)
    const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf')
    const [assetMap, setAssetMap] = useState<Record<string, string>>({})
    const [hydratedPreviewItems, setHydratedPreviewItems] = useState<HydratedPreviewItem[]>([])

    const product = useMemo<PreviewProduct>(() => {
        const base = rawProduct as PreviewProduct
        return {
            ...base,
            final_name_es: engineResult.finalNameEs || base.final_name_es,
            final_name_en: engineResult.finalNameEn || base.final_name_en,
        }
    }, [rawProduct, engineResult])

    const selectedTemplate = useMemo(
        () => templates.find(template => template.id === selectedTemplateId) ?? null,
        [templates, selectedTemplateId]
    )

    const previewProducts = useMemo(
        () => expandLabelBoxProducts(product) as PreviewProduct[],
        [product]
    )

    const elements = useMemo(
        () => selectedTemplate ? parseTemplateElements(selectedTemplate.elements_json || '[]') : [],
        [selectedTemplate]
    )

    const allowedExportFormats = useMemo(
        () => getAllowedExportFormats(selectedTemplate),
        [selectedTemplate]
    )

    const effectiveExportFormat = useMemo<ExportFormat>(
        () => allowedExportFormats.includes(exportFormat) ? exportFormat : allowedExportFormats[0] ?? 'pdf',
        [allowedExportFormats, exportFormat]
    )

    const containerRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)

    useEffect(() => {
        if (!containerRef.current || !selectedTemplate) return

        const updateScale = () => {
            const containerWidth = containerRef.current?.clientWidth || 0
            const canvasWidth = selectedTemplate.width_mm * PIXELS_PER_MM

            if (canvasWidth > 0 && containerWidth > 0) {
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

    useEffect(() => {
        let cancelled = false

        const process = async () => {
            if (elements.length === 0) {
                if (!cancelled) {
                    setAssetMap({})
                    setHydratedPreviewItems([])
                }
                return
            }

            const assetIds = elements
                .filter((element) =>
                    (element.type === 'image' || element.type === 'dynamic_image') &&
                    element.content &&
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(element.content))
                )
                .map((element) => element.content)
                .filter((content): content is string => typeof content === 'string')

            const mapping = await resolveAssetsAction(assetIds)
            const nextHydratedItems = await Promise.all(previewProducts.map(async (previewProduct) => {
                const productWithDocumentQr = await attachResolvedDocumentQrUrls(previewProduct, elements)
                const hydrated = await hydrateTemplateElements(elements, productWithDocumentQr, mapping)
                return {
                    product: previewProduct,
                    elements: normalizeHydratedElements(hydrated),
                }
            }))

            if (cancelled) return

            setAssetMap(mapping)
            setHydratedPreviewItems(nextHydratedItems)
        }

        void process()

        return () => {
            cancelled = true
        }
    }, [elements, previewProducts])

    const preflightReport = useMemo<PreflightReport>(() => {
        const elementsForPreflight = hydratedPreviewItems.flatMap(item => item.elements)
        if (elementsForPreflight.length === 0) {
            return {
                missingVariables: [],
                missingAssets: [],
                criticalErrors: [],
            }
        }

        const missingVariables: string[] = []
        const missingAssets: string[] = []
        const criticalErrors: string[] = []

        elementsForPreflight.forEach((element) => {
            if ((element.type === 'text' || element.type === 'dynamic_text') && element.content) {
                const matches = element.content.match(/{[^{}]+}/g)
                if (matches) {
                    matches.forEach(match => missingVariables.push(match))
                }
            }

            if (element.type === 'image' || element.type === 'dynamic_image') {
                const iconKey = DYNAMIC_ICON_KEYS.find(
                    key => element.name?.includes(key) || element.dataField?.includes(key)
                )

                if (!element.resolvedSrc || element.resolvedSrc.includes('placeholder')) {
                    if (iconKey) {
                        const hasProductValue = product[iconKey]
                        if (hasProductValue) {
                            missingAssets.push(`${element.name || iconKey} (Falla de resolución)`)
                        }
                    } else {
                        missingAssets.push(element.name || element.dataField || 'Imagen')
                    }
                }
            }
        })

        if (!allowedExportFormats.includes(effectiveExportFormat)) {
            criticalErrors.push(`Formato ${effectiveExportFormat.toUpperCase()} no permitido para esta plantilla`)
        }

        return {
            missingVariables: Array.from(new Set(missingVariables)),
            missingAssets: Array.from(new Set(missingAssets)),
            criticalErrors,
        }
    }, [allowedExportFormats, effectiveExportFormat, hydratedPreviewItems, product])

    const requiredFields = useMemo(
        () => selectedTemplate ? getTemplateRequiredFields(selectedTemplate.elements_json) : [],
        [selectedTemplate]
    )

    const validationIssues = useMemo(
        () => getTemplateValidationIssues(product, requiredFields),
        [product, requiredFields]
    )

    const warnings = validationIssues.length > 0
        ? [{ productCode: product.code || '', productName: product.final_name_es || '', issues: validationIssues }]
        : []

    const canvasW = selectedTemplate ? Math.round(selectedTemplate.width_mm * PIXELS_PER_MM) : 0
    const canvasH = selectedTemplate ? Math.round(selectedTemplate.height_mm * PIXELS_PER_MM) : 0

    const handleExport = async () => {
        if (!selectedTemplate) return

        if (product.is_exportable === false) {
            toast.error(
                product.inactive_reasons?.length
                    ? `Producto inactivo: ${product.inactive_reasons.join(', ')}`
                    : 'Producto inactivo para exportacion'
            )
            return
        }

        setIsExporting(true)

        try {
            if (!allowedExportFormats.includes(effectiveExportFormat)) {
                toast.error(`El formato ${effectiveExportFormat.toUpperCase()} no está permitido para esta plantilla`)
                return
            }

            const widthPx = Math.round((selectedTemplate.width_mm || 200) * PIXELS_PER_MM)
            const heightPx = Math.round((selectedTemplate.height_mm || 100) * PIXELS_PER_MM)
            const filenameFormat = selectedTemplate.export_filename_format || '{sku_base}_{final_name_es}'
            const hasLabelBoxFilenameVariable = filenameFormatUsesLabelBoxVariable(filenameFormat)
            let exportedCount = 0

            for (const previewProduct of previewProducts) {
                const productWithDocumentQr = await attachResolvedDocumentQrUrls(previewProduct, elements)
                const hydrated = await hydrateTemplateElements(elements, productWithDocumentQr, assetMap)
                const zoneEn = await resolveZoneHomeEnAction(previewProduct.zone_home)
                const productWithZone = zoneEn ? { ...previewProduct, zone_home_en: zoneEn } : previewProduct
                const enrichedProduct = enrichProductDataWithIcons(productWithZone, assetMap)
                const rawDownloadName = hydrateText(filenameFormat, enrichedProduct)
                const downloadName = sanitizeFilename(
                    hasLabelBoxFilenameVariable ? rawDownloadName : appendLabelBoxSuffix(rawDownloadName, previewProduct)
                )

                const response = await fetch('/api/export', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        productId: previewProduct.id,
                        isExternalSource: previewProduct.is_external === true,
                        elements: hydrated,
                        format: effectiveExportFormat,
                        width: widthPx,
                        height: heightPx,
                        templateFontFamily: selectedTemplate.template_font_family,
                        filename: downloadName,
                    }),
                })

                if (!response.ok) throw new Error('Error en la generación del archivo')

                const blob = await response.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${downloadName}.${effectiveExportFormat}`
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
                document.body.removeChild(a)
                exportedCount += 1
            }

            toast.success(exportedCount > 1 ? `${exportedCount} archivos exportados correctamente` : 'Archivo exportado correctamente')
        } catch (error) {
            console.error(error)
            toast.error('Hubo un error al exportar el archivo')
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-4">
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

                {selectedTemplate ? (
                    <div
                        ref={containerRef}
                        className="bg-slate-100 border border-slate-200 rounded-xl flex items-start justify-center p-4 min-h-[420px] overflow-auto"
                    >
                        <div className="flex flex-col items-center gap-4">
                            {hydratedPreviewItems.map((item, index) => (
                                <div key={`${String(item.product.id || product.id)}-${String(item.product.partes_file_suffix || index)}`} className="flex flex-col items-start gap-2">
                                    {item.product.partes_texto ? (
                                        <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
                                            {String(item.product.partes_texto)}
                                        </span>
                                    ) : null}
                                    <div
                                        id={index === 0 ? 'label-canvas' : `label-canvas-${index + 1}`}
                                        className="bg-white shadow-xl relative border border-slate-200 shrink-0"
                                        style={{
                                            width: canvasW,
                                            height: canvasH,
                                            transform: `scale(${scale})`,
                                            transformOrigin: 'center top',
                                            transition: 'transform 0.2s ease-out',
                                        }}
                                    >
                                        <DocumentRenderSurface
                                            elements={item.elements}
                                            width={canvasW}
                                            height={canvasH}
                                            templateFontFamily={selectedTemplate.template_font_family}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center p-6 min-h-[420px]">
                        <div className="text-center text-slate-400">
                            <LayoutTemplate className="w-10 h-10 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No hay plantillas activas disponibles.</p>
                            <Link href="/templates" className="text-indigo-500 underline text-xs mt-1 block">
                                Ir a Plantillas →
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-4">
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
                            {preflightReport.criticalErrors.map((errorMessage, index) => (
                                <div key={index} className="flex gap-2 text-red-600 text-xs font-bold bg-red-50 p-2 rounded-lg border border-red-100 italic">
                                    <XCircle className="w-4 h-4 shrink-0" />
                                    <span>CRÍTICO: {errorMessage}</span>
                                </div>
                            ))}
                            {preflightReport.missingVariables.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Variables no resueltas</span>
                                    <div className="flex flex-wrap gap-1">
                                        {preflightReport.missingVariables.map(variable => (
                                            <span key={variable} className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded font-mono border border-amber-200">{variable}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {preflightReport.missingAssets.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Recursos faltantes</span>
                                    <div className="flex flex-wrap gap-1">
                                        {preflightReport.missingAssets.map(asset => (
                                            <span key={asset} className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded border border-slate-200 font-medium italic">{asset}</span>
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

                {warnings.length > 0 ? (
                    <ValidationWarnings warnings={warnings} />
                ) : selectedTemplate && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                        <span className="text-base">✓</span>
                        <span className="font-medium">Producto completo para esta plantilla</span>
                    </div>
                )}

                {product.is_exportable === false && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                        <p className="font-semibold">Producto inactivo para exportacion.</p>
                        {product.inactive_reasons?.length ? (
                            <p className="mt-1 text-xs">{product.inactive_reasons.join(', ')}</p>
                        ) : null}
                    </div>
                )}

                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                    <h3 className="font-semibold text-slate-800 text-sm">Datos del Producto</h3>
                    <div className="flex flex-col gap-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-500">Código:</span><span className="font-mono font-semibold">{product.code}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Familia:</span><span>{product.familia_code || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Medida:</span><span>{product.commercial_measure || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Nombre derivado:</span><span className="text-right max-w-[160px]">{engineResult.finalNameEs || '—'}</span></div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                    <h3 className="font-semibold text-slate-800 text-sm">Exportar</h3>

                    {selectedTemplate && (
                        <div className="flex flex-col gap-3">
                            <div className="flex bg-slate-100 p-1 rounded-lg w-full">
                                {allowedExportFormats.map((format) => (
                                    <button
                                        key={format}
                                        onClick={() => setExportFormat(format)}
                                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${effectiveExportFormat === format ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {format.toUpperCase()}
                                    </button>
                                ))}
                            </div>

                            <Button
                                className={`w-full h-12 text-sm font-bold transition-all duration-300 ${
                                    (preflightReport.criticalErrors.length > 0 || validationIssues.length > 0 || product.is_exportable === false)
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                        : (preflightReport.missingVariables.length > 0 || preflightReport.missingAssets.length > 0)
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200'
                                }`}
                                onClick={handleExport}
                                disabled={isExporting || preflightReport.criticalErrors.length > 0 || validationIssues.length > 0 || product.is_exportable === false}
                            >
                                {isExporting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        <span>Generando {effectiveExportFormat.toUpperCase()}...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download className="mr-2 h-4 w-4" />
                                        <span>
                                            {(preflightReport.criticalErrors.length > 0 || validationIssues.length > 0 || product.is_exportable === false)
                                                ? 'Exportación Bloqueada'
                                                : (preflightReport.missingVariables.length > 0 || preflightReport.missingAssets.length > 0)
                                                    ? `Exportar con Avisos (${effectiveExportFormat.toUpperCase()})`
                                                    : `Descargar ${effectiveExportFormat.toUpperCase()}`
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
