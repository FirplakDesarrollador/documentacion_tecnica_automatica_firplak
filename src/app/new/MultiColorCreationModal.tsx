"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, X, PaintBucket, AlertCircle } from "lucide-react"
import { batchCreateColorVariantsAction } from "./actions"
import { toast } from "sonner"

interface ProductInput {
    code: string
    color_code: string
    color_name: string
    product_type?: string
    rh?: string
    sap_description?: string
    [key: string]: unknown
}

interface MultiColorCreationModalProps {
    isOpen: boolean
    originalProduct: ProductInput
    availableColors: {code: string, name: string}[]
    onComplete: (createdProducts: ProductInput[]) => void
    onSkip: () => void
}

export function MultiColorCreationModal({ isOpen, originalProduct, availableColors, onComplete, onSkip }: MultiColorCreationModalProps) {
    const [step, setStep] = useState<1 | 2>(1)
    const [selectedColors, setSelectedColors] = useState<{code: string, name: string, isNew: boolean}[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [isCreatingNew, setIsCreatingNew] = useState(false)
    const [newColorCode, setNewColorCode] = useState('')
    const [newColorName, setNewColorName] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [results, setResults] = useState<{ success: boolean; code_color?: string; color_code: string; color_name: string; sku?: string; error?: string; product?: unknown }[] | null>(null)

    if (!originalProduct) return null

    const handleAddColor = (color: {code: string, name: string}, isNew = false) => {
        if (color.code === originalProduct.color_code || selectedColors.some(c => c.code === color.code)) {
            toast.error("El color ya está en la lista o es el color original.")
            return
        }
        setSelectedColors(prev => [...prev, { ...color, isNew }])
        setSearchQuery('')
        setIsCreatingNew(false)
        setNewColorCode('')
        setNewColorName('')
    }

    const handleRemoveColor = (code: string) => {
        setSelectedColors(prev => prev.filter(c => c.code !== code))
    }

    const handleCreateVariants = async () => {
        if (selectedColors.length === 0) return
        setIsProcessing(true)
        try {
            const res = await batchCreateColorVariantsAction(originalProduct, selectedColors)
            setResults(res.results)
        } catch (e: unknown) {
            toast.error("Error al procesar: " + (e instanceof Error ? e.message : String(e)))
        } finally {
            setIsProcessing(false)
        }
    }

    const filteredColors = availableColors.filter(c => 
        (c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.code.includes(searchQuery)) &&
        c.code !== originalProduct.color_code && 
        !selectedColors.some(sc => sc.code === c.code)
    ).slice(0, 5)

    const finishProcess = () => {
        const successfulProducts = results 
            ? results.filter(r => r.success).map(r => r.product)
            : []
        onComplete([originalProduct, ...successfulProducts as ProductInput[]])
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open && !isProcessing) {
                if (results) finishProcess()
                else onSkip()
            }
        }}>
            <DialogContent className="sm:max-w-[600px] border-none shadow-2xl overflow-hidden p-0 bg-slate-50">
                {step === 1 && (
                    <div className="p-8">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="h-16 w-16 bg-indigo-100 rounded-full flex items-center justify-center mb-2">
                                <PaintBucket className="h-8 w-8 text-indigo-600" />
                            </div>
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-bold text-slate-900">¿Desea crearlo en otros colores?</DialogTitle>
                                <DialogDescription className="text-slate-500 text-base mt-2">
                                    El producto <b>{originalProduct.code}</b> ({originalProduct.color_name}) se guardó exitosamente.<br/>
                                    Puede crear versiones idénticas en otros colores sin tener que llenar el formulario de nuevo.
                                </DialogDescription>
                            </DialogHeader>
                            
                            <div className="py-6 w-full">
                                <div className="grid grid-cols-2 gap-4">
                                    <Button 
                                        variant="outline" 
                                        onClick={onSkip}
                                        className="h-12 border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                                    >
                                        No, solo este color
                                    </Button>
                                    <Button 
                                        onClick={() => setStep(2)}
                                        className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md font-semibold"
                                    >
                                        Sí, agregar más colores
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && !results && (
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <PaintBucket className="h-5 w-5 text-indigo-600" />
                                Selector Multi-Color
                            </DialogTitle>
                            <DialogDescription>
                                Agregue todos los colores adicionales para <b>{originalProduct.code.slice(0, -4)}XXXX</b>
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            {/* Selected Colors Chips */}
                            {selectedColors.length > 0 && (
                                <div className="flex flex-wrap gap-2 p-4 bg-white border border-slate-200 rounded-xl">
                                    {selectedColors.map(c => (
                                        <div key={c.code} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-full text-sm font-semibold">
                                            <span>{c.code} - {c.name}</span>
                                            <button onClick={() => handleRemoveColor(c.code)} className="hover:text-indigo-900 focus:outline-none">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add Color Area */}
                            <div className="space-y-3">
                                {!isCreatingNew ? (
                                    <>
                                        <div className="relative">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Buscar color existente</Label>
                                            <Input 
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                placeholder="Buscar por nombre o código..."
                                                className="mt-1"
                                            />
                                        </div>
                                        {searchQuery && filteredColors.length > 0 && (
                                            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                                {filteredColors.map(c => (
                                                    <button 
                                                        key={c.code}
                                                        onClick={() => handleAddColor(c)}
                                                        className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 border-b last:border-0"
                                                    >
                                                        {c.code} - {c.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {searchQuery && filteredColors.length === 0 && (
                                            <div className="text-sm text-slate-500 italic mt-2">
                                                No se encontraron colores.
                                            </div>
                                        )}
                                        <Button 
                                            variant="ghost" 
                                            onClick={() => setIsCreatingNew(true)}
                                            className="w-full mt-2 border border-dashed border-slate-300 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
                                        >
                                            <Plus className="w-4 h-4 mr-2" />
                                            Crear color nuevo que no está en la lista
                                        </Button>
                                    </>
                                ) : (
                                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="text-sm font-bold text-indigo-900">Crear Nuevo Color</h4>
                                            <button onClick={() => setIsCreatingNew(false)} className="text-indigo-500 hover:text-indigo-700">
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="col-span-1">
                                                <Label className="text-xs font-bold text-indigo-700 uppercase">Código (4 dígitos)</Label>
                                                <Input 
                                                    value={newColorCode}
                                                    onChange={e => setNewColorCode(e.target.value)}
                                                    placeholder="Ej: 0434"
                                                    maxLength={4}
                                                    className="mt-1"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <Label className="text-xs font-bold text-indigo-700 uppercase">Nombre</Label>
                                                <Input 
                                                    value={newColorName}
                                                    onChange={e => setNewColorName(e.target.value.toUpperCase())}
                                                    placeholder="Ej: ROBLE"
                                                    className="mt-1 uppercase"
                                                />
                                            </div>
                                        </div>
                                        <Button 
                                            onClick={() => {
                                                if (!newColorCode || newColorCode.length !== 4 || !/^\d+$/.test(newColorCode)) {
                                                    toast.error("El código debe tener exactamente 4 dígitos numéricos.")
                                                    return
                                                }
                                                if (!newColorName) {
                                                    toast.error("El nombre es requerido.")
                                                    return
                                                }
                                                handleAddColor({ code: newColorCode, name: newColorName }, true)
                                            }}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                                        >
                                            Agregar a la lista
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <DialogFooter className="mt-8 gap-3">
                            <Button 
                                variant="outline" 
                                onClick={onSkip}
                                disabled={isProcessing}
                            >
                                Cancelar y omitir
                            </Button>
                            <Button 
                                onClick={handleCreateVariants}
                                disabled={isProcessing || selectedColors.length === 0}
                                className="min-w-[140px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                            >
                                {isProcessing ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando...</>
                                ) : (
                                    `Crear ${selectedColors.length} variantes`
                                )}
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 2 && results && (
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-xl font-bold text-slate-900">Resultados de Creación</DialogTitle>
                            <DialogDescription>
                                Resumen de las variantes de color procesadas.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                            {results.map((r, i) => (
                                <div key={i} className={`p-3 rounded-lg border flex items-start gap-3 ${r.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                    <div className="mt-0.5">
                                        {r.success ? <AlertCircle className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
                                    </div>
                                    <div>
                                        <p className={`text-sm font-bold ${r.success ? 'text-emerald-900' : 'text-red-900'}`}>{r.code_color || r.color_code} - {r.color_name}</p>
                                        <p className={`text-xs ${r.success ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {r.success ? `SKU Creado: ${r.sku}` : `Error: ${r.error}`}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <DialogFooter className="mt-8">
                            <Button 
                                onClick={finishProcess}
                                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold"
                            >
                                Continuar
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
