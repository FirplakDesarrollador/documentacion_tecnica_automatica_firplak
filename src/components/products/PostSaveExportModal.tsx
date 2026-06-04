"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState } from "react"
import { resolveAssetsAction } from "@/app/generate/actions"
import { composeProductByIdAction, resolveZoneHomeEnAction } from "@/app/products/actions"
import { getTemplatesAction } from "@/app/templates/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PIXELS_PER_MM } from "@/lib/constants"
import { hydrateTemplateElements, hydrateText } from "@/lib/export/exportUtils"
import { enrichProductDataWithIcons } from "@/lib/engine/productUtils"
import { CheckCircle2, Download, Loader2 } from "lucide-react"
import { toast } from "sonner"

function sanitizeFilename(name: string): string {
    return String(name || "").replace(/[\\/:*?"<>|]/g, "_").trim()
}

function isUuid(value: unknown): value is string {
    if (!value || typeof value !== "string") return false
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function deriveSkuBase(code: unknown): string {
    const raw = String(code || "").trim()
    if (!raw) return ""
    const parts = raw.split("-").filter(Boolean)
    if (parts.length >= 3) return parts.slice(0, 3).join("-")
    return raw
}

interface PostSaveExportModalProps {
    isOpen: boolean
    product: any
    onClose: () => void
}

function isFirplakCoreTemplate(template: any): boolean {
    if (!template) return false
    const dataSource = String(template.data_source || "").trim()
    const brandScope = String(template.brand_scope || "").trim()
    if (dataSource !== "core_firplak") return false
    // Prefer the default Firplak (non-private-label) templates first.
    return brandScope !== "private_label"
}

function getTemplateDisplayName(template: any): string {
    const rawName = template?.name ? String(template.name).trim() : ""
    if (rawName) return rawName
    const w = template?.width_mm ?? ""
    const h = template?.height_mm ?? ""
    const suffix = w && h ? ` ${w}x${h}mm` : ""
    return `Plantilla${suffix}`.trim()
}

export function PostSaveExportModal({ isOpen, product, onClose }: PostSaveExportModalProps) {
    const [step, setStep] = useState<1 | 2>(1)
    const [templates, setTemplates] = useState<any[]>([])
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
    const [exportFormat, setExportFormat] = useState<"pdf" | "jpg">("pdf")
    const [isExporting, setIsExporting] = useState(false)
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)

    const loadTemplates = async () => {
        setIsLoadingTemplates(true)
        try {
            const data = await getTemplatesAction()
            const sorted = Array.isArray(data)
                ? [...data].sort((a, b) => {
                    const aIsFirplak = isFirplakCoreTemplate(a)
                    const bIsFirplak = isFirplakCoreTemplate(b)
                    if (aIsFirplak && !bIsFirplak) return -1
                    if (!aIsFirplak && bIsFirplak) return 1
                    return 0
                })
                : []
            setTemplates(sorted)
        } catch {
            toast.error("Error al cargar plantillas")
        } finally {
            setIsLoadingTemplates(false)
        }
    }

    useEffect(() => {
        if (isOpen && step === 2 && templates.length === 0) {
            /* eslint-disable-next-line react-hooks/set-state-in-effect */
            loadTemplates()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, step])

    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
    const selectedTemplateLabel = selectedTemplate ? getTemplateDisplayName(selectedTemplate) : ""
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const allowedFormats = selectedTemplate?.export_formats
        ? selectedTemplate.export_formats.split(",").map((f: string) => f.trim().toLowerCase())
        : ["pdf", "jpg"]

    useEffect(() => {
        if (selectedTemplate && !allowedFormats.includes(exportFormat)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setExportFormat(allowedFormats[0] as any)
        }
    }, [selectedTemplateId, selectedTemplate, allowedFormats, exportFormat])

    const isArray = Array.isArray(product)
    const singleProduct = isArray ? product[0] : product
    const productCount = isArray ? product.length : 1

    const handleExport = async () => {
        if (!selectedTemplate || !singleProduct) return

        setIsExporting(true)
        try {
            const elements =
                typeof selectedTemplate.elements_json === "string"
                    ? JSON.parse(selectedTemplate.elements_json)
                    : selectedTemplate.elements_json

            const templateWidthMm = Number(selectedTemplate.width_mm || 200)
            const templateHeightMm = Number(selectedTemplate.height_mm || 100)
            const widthPx = Math.round(templateWidthMm * PIXELS_PER_MM)
            const heightPx = Math.round(templateHeightMm * PIXELS_PER_MM)

            const productsToExport = (isArray ? product : [product]).filter(Boolean)

            for (const currentProduct of productsToExport) {
                const productId = (currentProduct as any)?.id
                let composed = productId ? await composeProductByIdAction(String(productId)) : null
                // Reintento si la vista aún no refleja los datos (race condition)
                if (!composed && productId) {
                    await new Promise(r => setTimeout(r, 500));
                    composed = await composeProductByIdAction(String(productId));
                }
                const exportProduct = composed || (currentProduct as any)

                const assetIdsFromTemplate = (Array.isArray(elements) ? elements : [])
                    .filter((el: any) => (el.type === "image" || el.type === "dynamic_image") && isUuid(el.content))
                    .map((el: any) => el.content as string)

                const extraAssetIds: string[] = []
                if (isUuid((exportProduct as any)?.private_label_logo_id)) extraAssetIds.push((exportProduct as any).private_label_logo_id)
                if (isUuid((exportProduct as any)?.isometric_asset_id)) extraAssetIds.push((exportProduct as any).isometric_asset_id)

                const assetMap = await resolveAssetsAction([...assetIdsFromTemplate, ...extraAssetIds])

                const zoneEn = await resolveZoneHomeEnAction((exportProduct as any).zone_home)
                const sku_base = (exportProduct as any).sku_base || deriveSkuBase((exportProduct as any).code)
                const baseProduct = sku_base ? { ...(exportProduct as any), sku_base } : (exportProduct as any)
                const productWithZone = zoneEn ? { ...baseProduct, zone_home_en: zoneEn } : baseProduct

                const hydratedData = await hydrateTemplateElements(elements, productWithZone, assetMap)

                const enrichedProduct = enrichProductDataWithIcons(productWithZone, assetMap)
                const rawDownloadName = hydrateText(
                    (selectedTemplate as any).export_filename_format || "{sku_base}_{final_name_es}",
                    enrichedProduct
                )
                const downloadName = sanitizeFilename(rawDownloadName) || sanitizeFilename((exportProduct as any).code) || "export"

                const response = await fetch("/api/export", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        productId: (exportProduct as any).id,
                        isExternalSource: (exportProduct as any).is_external === true,
                        elements: hydratedData,
                        format: exportFormat,
                        width: widthPx,
                        height: heightPx,
                        templateFontFamily: (selectedTemplate as any).template_font_family,
                        filename: downloadName,
                    }),
                })

                if (!response.ok) {
                    const payload = await response.json().catch(() => null)
                    const message = payload?.error ? String(payload.error) : "Export failed"
                    throw new Error(message)
                }

                const blob = await response.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `${downloadName}.${exportFormat}`
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
                document.body.removeChild(a)
            }

            toast.success("Documento exportado correctamente")
            onClose()
        } catch (error) {
            console.error("Export Error:", error)
            toast.error("Error al exportar el documento: " + (error as any).message)
        } finally {
            setIsExporting(false)
        }
    }

    const handleJustSave = () => {
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px] border-none shadow-2xl overflow-hidden p-0 bg-slate-50">
                {step === 1 ? (
                    <div className="p-8">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mb-2">
                                <CheckCircle2 className="h-10 w-10 text-green-600" />
                            </div>
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-bold text-slate-900">
                                    {productCount > 1 ? "¡Productos Guardados!" : "¡Producto Guardado!"}
                                </DialogTitle>
                                <DialogDescription className="text-slate-500 text-base mt-2">
                                    {productCount > 1 ? (
                                        <>
                                            Se crearon <b>{productCount} productos</b> correctamente en la base de datos.
                                        </>
                                    ) : (
                                        <>
                                            El producto <b>{singleProduct?.code}</b> ha sido registrado correctamente en la base de datos.
                                        </>
                                    )}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="py-6 w-full">
                                <p className="text-sm font-medium text-slate-700 mb-6">
                                    ¿Desea exportar un documento sobre este producto ahora?
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                    <Button
                                        variant="outline"
                                        onClick={handleJustSave}
                                        className="h-12 border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                                    >
                                        No, solo agregar
                                    </Button>
                                    <Button
                                        onClick={() => setStep(2)}
                                        className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md font-semibold"
                                    >
                                        Sí, deseo exportar
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Download className="h-5 w-5 text-indigo-600" />
                                Configuración de Exportación
                            </DialogTitle>
                            <DialogDescription>
                                Seleccione la plantilla y el formato para la etiqueta de {singleProduct?.code}.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="template" className="text-sm font-semibold text-slate-700">
                                    Plantilla Disponible
                                </Label>
                                <Select
                                    value={selectedTemplateId}
                                    onValueChange={(val) => setSelectedTemplateId(val || "")}
                                    disabled={isLoadingTemplates}
                                >
                                    <SelectTrigger id="template" className="h-12 bg-white border-slate-200">
                                        <SelectValue placeholder="Seleccione una plantilla">
                                            {selectedTemplateLabel || undefined}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {getTemplateDisplayName(t)} ({t.width_mm}x{t.height_mm}mm)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-700">Formato de Archivo</Label>
                                <div className="flex bg-slate-200 p-1.5 rounded-xl w-full">
                                    {["pdf", "jpg"].map((fmt) => {
                                        const isAllowed = allowedFormats.includes(fmt)
                                        return (
                                            <button
                                                key={fmt}
                                                disabled={!isAllowed}
                                                onClick={() => setExportFormat(fmt as any)}
                                                className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
                                                    exportFormat === fmt
                                                        ? "bg-white text-indigo-600 shadow-sm"
                                                        : isAllowed
                                                            ? "text-slate-500 hover:text-slate-700"
                                                            : "text-slate-400 opacity-50 cursor-not-allowed"
                                                }`}
                                            >
                                                {fmt.toUpperCase()}
                                                {!isAllowed && " (No Disp.)"}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="mt-10 gap-3 border-t pt-6 bg-white sm:justify-end -mx-8 px-8 pb-8">
                            <Button
                                variant="ghost"
                                onClick={handleJustSave}
                                className="text-slate-500 hover:text-slate-800 font-medium"
                                disabled={isExporting}
                            >
                                No, me arrepentí
                            </Button>
                            <Button
                                onClick={handleExport}
                                disabled={isExporting || !selectedTemplateId}
                                className="min-w-[140px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11"
                            >
                                {isExporting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Generando...
                                    </>
                                ) : (
                                    <>
                                        <Download className="mr-2 h-4 w-4" />
                                        Exportar
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
