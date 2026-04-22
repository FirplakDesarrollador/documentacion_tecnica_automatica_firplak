"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, Download, CheckCircle2 } from "lucide-react"
import { getTemplatesAction } from "@/app/templates/actions"
import { toast } from "sonner"
import { hydrateTemplateElements, hydrateText } from "@/lib/export/exportUtils"
import { enrichProductDataWithIcons } from "@/lib/engine/productUtils"
import { useRouter } from "next/navigation"
import { resolveAssetsAction } from "@/app/generate/actions"
import { resolveZoneHomeEnAction } from "@/app/products/actions"

interface PostSaveExportModalProps {
    isOpen: boolean
    product: any
    onClose: () => void
}

export function PostSaveExportModal({ isOpen, product, onClose }: PostSaveExportModalProps) {
    const router = useRouter()
    const [step, setStep] = useState<1 | 2>(1)
    const [templates, setTemplates] = useState<any[]>([])
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
    const [exportFormat, setExportFormat] = useState<"pdf" | "jpg">("pdf")
    const [isExporting, setIsExporting] = useState(false)
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)

    useEffect(() => {
        if (isOpen && step === 2 && templates.length === 0) {
            loadTemplates()
        }
    }, [isOpen, step])

    const loadTemplates = async () => {
        setIsLoadingTemplates(true)
        try {
            const data = await getTemplatesAction()
            setTemplates(data)
            if (data.length > 0) {
                setSelectedTemplateId(data[0].id)
                
                // Set default format based on template
                const formats = data[0].export_formats ? data[0].export_formats.split(',').map((f: string) => f.trim().toLowerCase()) : ['pdf', 'jpg']
                setExportFormat(formats.includes('pdf') ? 'pdf' : 'jpg')
            }
        } catch (error) {
            toast.error("Error cargando plantillas")
        } finally {
            setIsLoadingTemplates(false)
        }
    }

    const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
    const allowedFormats = selectedTemplate?.export_formats 
        ? selectedTemplate.export_formats.split(',').map((f: string) => f.trim().toLowerCase()) 
        : ['pdf', 'jpg']

    useEffect(() => {
        if (selectedTemplate && !allowedFormats.includes(exportFormat)) {
            setExportFormat(allowedFormats[0] as any)
        }
    }, [selectedTemplateId])

    const handleExport = async () => {
        if (!selectedTemplate || !product) return

        setIsExporting(true)
        try {
            // 1. Obtener los iconos del sistema y activos específicos (isométrico, logo marca propia)
            const assetsToResolve = []
            if (product.isometric_asset_id) assetsToResolve.push(product.isometric_asset_id)
            if (product.private_label_logo_id) assetsToResolve.push(product.private_label_logo_id)
            
            const assetMap = await resolveAssetsAction(assetsToResolve)

            // 2. Asegurar que los elementos sean un objeto, no un string
            const elements = typeof selectedTemplate.elements_json === 'string' 
                ? JSON.parse(selectedTemplate.elements_json) 
                : selectedTemplate.elements_json

            // 3. Hidratar con el mapa de activos (Crucial para iconos técnicos)
            const hydratedData = await hydrateTemplateElements(elements, product, assetMap)
            
            // 4. Preparar nombre de archivo dinámico
            const zoneEn = await resolveZoneHomeEnAction(product.zone_home)
            const productWithZone = zoneEn ? { ...product, zone_home_en: zoneEn } : product
            const enrichedProduct = enrichProductDataWithIcons(productWithZone, assetMap)
            const downloadName = hydrateText((selectedTemplate as any).export_filename_format || '{sku_base}_{final_name_es}', enrichedProduct)

            const response = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    elements: hydratedData,
                    template: {
                        width_mm: selectedTemplate.width_mm,
                        height_mm: selectedTemplate.height_mm,
                        orientation: selectedTemplate.orientation
                    },
                    format: exportFormat,
                    filename: downloadName
                })
            })

            if (!response.ok) throw new Error('Export failed')

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${downloadName}.${exportFormat}`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            toast.success("Documento exportado correctamente")
            // After successful export, we close and go to products list
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
                                <DialogTitle className="text-2xl font-bold text-slate-900">¡Producto Guardado!</DialogTitle>
                                <DialogDescription className="text-slate-500 text-base mt-2">
                                    El producto <b>{product?.code}</b> ha sido registrado correctamente en la base de datos.
                                </DialogDescription>
                            </DialogHeader>
                            
                            <div className="py-6 w-full">
                                <p className="text-sm font-medium text-slate-700 mb-6">¿Desea exportar un documento sobre este producto ahora?</p>
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
                                Seleccione la plantilla y el formato para la etiqueta de {product?.code}.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="template" className="text-sm font-semibold text-slate-700">Plantilla Disponible</Label>
                                <Select 
                                    value={selectedTemplateId} 
                                    onValueChange={(val) => setSelectedTemplateId(val ?? selectedTemplateId)}
                                    disabled={isLoadingTemplates}
                                >
                                    <SelectTrigger id="template" className="h-12 bg-white border-slate-200">
                                        <SelectValue placeholder="Seleccione una plantilla" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name} ({t.width_mm}x{t.height_mm}mm)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-700">Formato de Archivo</Label>
                                <div className="flex bg-slate-200 p-1.5 rounded-xl w-full">
                                    {['pdf', 'jpg'].map((fmt) => {
                                        const isAllowed = allowedFormats.includes(fmt)
                                        return (
                                            <button
                                                key={fmt}
                                                disabled={!isAllowed}
                                                onClick={() => setExportFormat(fmt as any)}
                                                className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
                                                    exportFormat === fmt 
                                                        ? 'bg-white text-indigo-600 shadow-sm' 
                                                        : isAllowed 
                                                            ? 'text-slate-500 hover:text-slate-700' 
                                                            : 'text-slate-400 opacity-50 cursor-not-allowed'
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
