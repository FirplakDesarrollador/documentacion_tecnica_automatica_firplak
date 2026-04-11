'use client'

import * as React from "react"
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogTrigger,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { MultiSelectSearchField } from "@/components/ui-custom/MultiSelectSearchField"
import { Box, Image as ImageIcon, Loader2, CheckCircle2 } from "lucide-react"
import { 
    getFamiliesAction, 
    getReferencesByFamilyAction, 
    getMeasuresByFamilyAndRefAction,
    getAssetsByTypeAction,
    associateIsometricAction 
} from "@/app/assets/actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Option {
    value: string
    label: string
}

interface Props {
    initialFamilies?: string[]
    initialReferences?: string[]
    initialMeasures?: string[]
    onAssociationComplete?: (asset: any) => void
    trigger?: React.ReactNode
}

const EMPTY_ARRAY: string[] = []

export function IsometricAssociationDialog({ 
    initialFamilies = EMPTY_ARRAY, 
    initialReferences = EMPTY_ARRAY, 
    initialMeasures = EMPTY_ARRAY,
    onAssociationComplete,
    trigger
}: Props) {
    const [open, setOpen] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)

    // Data options
    const [families, setFamilies] = React.useState<Option[]>([])
    const [references, setReferences] = React.useState<Option[]>([])
    const [measures, setMeasures] = React.useState<Option[]>([])
    const [assets, setAssets] = React.useState<any[]>([])

    // Selection state
    const [selectedFamilies, setSelectedFamilies] = React.useState<string[]>([])
    const [selectedReferences, setSelectedReferences] = React.useState<string[]>([])
    const [selectedMeasures, setSelectedMeasures] = React.useState<string[]>([])
    const [selectedAssetId, setSelectedAssetId] = React.useState<string>("")

    const loadInitialData = async () => {
        setLoading(true)
        try {
            const [fams, isometrics] = await Promise.all([
                getFamiliesAction(),
                getAssetsByTypeAction('isometric')
            ])
            setFamilies(fams)
            setAssets(isometrics)
        } catch (error) {
            toast.error("Error al cargar datos maestros")
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => {
        if (open) {
            loadInitialData()
            // Set initial state from props
            setSelectedFamilies(initialFamilies)
            setSelectedReferences(initialReferences)
            setSelectedMeasures(initialMeasures)
        } else {
            // Reset state on close
            setSelectedFamilies([])
            setSelectedReferences([])
            setSelectedMeasures([])
            setSelectedAssetId("")
            setReferences([])
            setMeasures([])
        }
    }, [open, initialFamilies, initialReferences, initialMeasures])

    // Load references when families change
    React.useEffect(() => {
        const loadRefs = async () => {
            if (selectedFamilies.length > 0) {
                const refs = await getReferencesByFamilyAction(selectedFamilies)
                setReferences(refs)
            } else {
                setReferences([])
                setSelectedReferences([])
            }
        }
        loadRefs()
    }, [selectedFamilies])

    // Load measures when families or references change
    React.useEffect(() => {
        const loadMeasures = async () => {
            if (selectedFamilies.length > 0 || selectedReferences.length > 0) {
                const meas = await getMeasuresByFamilyAndRefAction(selectedFamilies, selectedReferences)
                setMeasures(meas)
            } else {
                setMeasures([])
                setSelectedMeasures([])
            }
        }
        loadMeasures()
    }, [selectedFamilies, selectedReferences])

    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = React.useState(false)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', 'isometric')

            const response = await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData,
            })

            const result = await response.json()
            if (!result.success) throw new Error(result.error)

            toast.success('Archivo subido y listo para asociar')
            const newAsset = result.asset
            setAssets(prev => [newAsset, ...prev])
            setSelectedAssetId(newAsset.id)
        } catch (error: any) {
            toast.error(error.message || 'Error al subir archivo')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleSubmit = async () => {
        if (!selectedAssetId) {
            toast.error("Por favor selecciona o sube un isométrico")
            return
        }
        if (selectedFamilies.length === 0) {
            toast.error("Selecciona al menos una familia")
            return
        }
        if (selectedReferences.length === 0) {
            toast.error("Debes seleccionar al menos una referencia específica. No se permite asociar a nivel de familia completa.")
            return
        }

        setSubmitting(true)
        try {
            await associateIsometricAction({
                assetId: selectedAssetId,
                familyCodes: selectedFamilies,
                referenceCodes: selectedReferences,
                measureCodes: selectedMeasures
            })
            toast.success("Isométrico asociado correctamente")
            
            if (onAssociationComplete) {
                const selectedAsset = assets.find(a => a.id === selectedAssetId)
                onAssociationComplete(selectedAsset)
            }

            setOpen(false)
        } catch (error: any) {
            toast.error(error.message || "Error al asociar isométrico")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger 
                render={trigger || (
                    <Button variant="outline" className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 shadow-sm transition-all h-10 px-4">
                        <Box className="h-4 w-4" />
                        Isométricos
                    </Button>
                )} 
            />
            <DialogContent className="max-w-md sm:max-w-xl p-0 bg-white border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="p-6 pb-2 shrink-0">
                    <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Box className="h-5 w-5 text-indigo-500" />
                        Asociar Isométricos SVG
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Vincula un plano isométrico a múltiples referencias de forma masiva.
                    </DialogDescription>
                </DialogHeader>

                <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Step 1: Select or Upload Asset */}
                    <div className="space-y-4">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">1. SELECCIONAR O SUBIR ISOMÉTRICO (SVG)</Label>
                        
                        {/* Improved Upload Area */}
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                            }}
                            onDrop={async (e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const file = e.dataTransfer.files?.[0]
                                if (file && (file.type === 'image/svg+xml' || file.name.endsWith('.svg'))) {
                                    // Manually construct the change event or call upload directly
                                    const mockEvent = { target: { files: [file] } } as any
                                    handleFileUpload(mockEvent)
                                } else {
                                    toast.error("Por favor suelta un archivo SVG válido")
                                }
                            }}
                            className={cn(
                                "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
                                uploading ? "bg-slate-50 border-slate-200 opacity-50 pointer-events-none" : "hover:bg-indigo-50/30 hover:border-indigo-300 border-slate-200"
                            )}
                        >
                            <input 
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".svg,image/svg+xml"
                                onChange={handleFileUpload}
                            />
                            {uploading ? (
                                <Loader2 className="h-8 w-8 text-indigo-500 mx-auto animate-spin mb-2" />
                            ) : (
                                <ImageIcon className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                            )}
                            <p className="text-sm font-medium text-slate-700">
                                {uploading ? "Subiendo archivo..." : "Haz clic o arrastra para subir un SVG"}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">
                                Solo archivos SVG. Se guardará automáticamente como tipo 'isometric'.
                            </p>
                        </div>

                        {/* Existing Assets List */}
                        {assets.length > 0 && (
                            <div className="grid grid-cols-1 gap-2 max-h-[180px] overflow-y-auto pr-1">
                                {assets.map((asset) => (
                                    <div 
                                        key={asset.id}
                                        onClick={() => setSelectedAssetId(asset.id)}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                                            selectedAssetId === asset.id 
                                                ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/20" 
                                                : "bg-white border-slate-200 hover:border-slate-300"
                                        )}
                                    >
                                        <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                                            {asset.file_path ? (
                                                <img src={asset.file_path} className="max-w-full max-h-full object-contain p-1" />
                                            ) : (
                                                <ImageIcon className="h-5 w-5 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-900 truncate">{asset.name}</p>
                                            <p className="text-[10px] text-slate-500 truncate">{asset.file_path}</p>
                                        </div>
                                        {selectedAssetId === asset.id && <CheckCircle2 className="h-5 w-5 text-indigo-500" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Step 2: Target Selection */}
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">2. SELECCIÓN DE DESTINO PARA ASOCIACIÓN</Label>
                        
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-slate-700 font-medium">Familia(s)</Label>
                                <MultiSelectSearchField 
                                    options={families}
                                    values={selectedFamilies}
                                    onChange={setSelectedFamilies}
                                    placeholder="Seleccionar Familias"
                                    className="h-11"
                                />
                            </div>

                            <div className={cn("space-y-2 transition-opacity", selectedFamilies.length === 0 && "opacity-50 pointer-events-none")}>
                                <Label className="text-slate-700 font-medium">Código · Referencia · Medida <span className="text-[10px] text-rose-500 font-bold uppercase tracking-tight">(Obligatorio)</span></Label>
                                <MultiSelectSearchField 
                                    options={references}
                                    values={selectedReferences}
                                    onChange={setSelectedReferences}
                                    placeholder="Seleccionar Código, Referencia y Medida"
                                    className="h-11"
                                    emptyMessage="Selecciona familias primero."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                        <p className="text-xs text-amber-700 flex items-start gap-2">
                             <span className="font-bold text-amber-600 block mt-0.5">⚠️</span>
                             Esta acción actualizará de forma masiva el campo "isometric_path" de todos los productos que coincidan con los filtros seleccionados.
                        </p>
                    </div>
                </div>

                <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                    <Button variant="ghost" className="hover:bg-slate-200" onClick={() => setOpen(false)} disabled={submitting || uploading}>
                        Cancelar
                    </Button>
                    <Button 
                        disabled={submitting || uploading || !selectedAssetId || selectedFamilies.length === 0 || selectedReferences.length === 0}
                        onClick={handleSubmit}
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-md h-10 px-6 transition-all"
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        {submitting ? "Actualizando..." : "Asociar Isométrico"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
