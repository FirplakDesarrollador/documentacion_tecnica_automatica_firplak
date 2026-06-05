'use client'

import * as React from "react"
import Image from 'next/image'
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
import { Badge } from "@/components/ui/badge"
import { MultiSelectSearchField } from "@/components/ui-custom/MultiSelectSearchField"
import { Box, Image as ImageIcon, Loader2, CheckCircle2, Search } from "lucide-react"
import { 
    getFamiliesAction, 
    getReferencesByFamilyAction, 
    getMeasuresByFamilyAndRefAction,
    getVersionsByFamilyAndRefAction,
    getAssetsByTypeAction,
    associateIsometricAction,
    deleteAssetAction
} from "@/app/assets/actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Option {
    value: string
    label: string
    meta?: {
        designation?: string
        product_name?: string
        commercial_measure?: string
        accessory_text?: string
    }
}

interface AssetItem {
    id: string
    name: string
    file_path: string
    relation_count: number
    type?: string
}

interface Props {
    /** 'select' = solo elegir asset (productos nuevos), 'associate' = buscar refs en BD y asociar (default) */
    mode?: 'select' | 'associate'
    initialFamilies?: string[]
    initialReferences?: string[]
    initialMeasures?: string[]
    initialVersions?: string[]
    onAssociationComplete?: (asset: AssetItem | undefined) => void
    trigger?: React.ReactElement
}

const EMPTY_ARRAY: string[] = []

export function IsometricAssociationDialog({ 
    mode = 'associate',
    initialFamilies = EMPTY_ARRAY, 
    initialReferences = EMPTY_ARRAY, 
    initialMeasures = EMPTY_ARRAY,
    initialVersions = EMPTY_ARRAY,
    onAssociationComplete,
    trigger
}: Props) {
    const isSelectOnly = mode === 'select'
    const [open, setOpen] = React.useState(false)
    const [, setLoading] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)
    const skipCleanupRef = React.useRef(false)

    // Data options
    const [families, setFamilies] = React.useState<Option[]>([])
    const [references, setReferences] = React.useState<Option[]>([])
    const [, setMeasures] = React.useState<Option[]>([])
    const [versions, setVersions] = React.useState<Option[]>([])
    const [assets, setAssets] = React.useState<AssetItem[]>([])

    // Selection state
    const [selectedFamilies, setSelectedFamilies] = React.useState<string[]>([])
    const [selectedReferences, setSelectedReferences] = React.useState<string[]>([])
    const [selectedMeasures, setSelectedMeasures] = React.useState<string[]>([])
    const [selectedVersions, setSelectedVersions] = React.useState<string[]>([])
    const [selectedAssetId, setSelectedAssetId] = React.useState<string>("")
    const [searchQuery, setSearchQuery] = React.useState("")

    const [blockingDiffFields, setBlockingDiffFields] = React.useState<string[]>([])
    const [confirmBlockingDiffs, setConfirmBlockingDiffs] = React.useState(false)

    const loadInitialData = async () => {
        setLoading(true)
        try {
            const [fams, isometrics] = await Promise.all([
                getFamiliesAction(),
                getAssetsByTypeAction('isometric')
            ])
            setFamilies(fams)
            setAssets(isometrics)
        } catch {
            toast.error("Error al cargar datos maestros")
        } finally {
            setLoading(false)
        }
    }

    const [uploadedAssetIds, setUploadedAssetIds] = React.useState<string[]>([])

    React.useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect */
        if (open) {
            skipCleanupRef.current = false
            loadInitialData()
            setSelectedFamilies(initialFamilies)
            setSelectedReferences(initialReferences)
            setSelectedMeasures(initialMeasures)
            setSelectedVersions(initialVersions)
            setUploadedAssetIds([])
        } else {
            // Clean up unassociated uploads
            // Avoid undoing a successful association: deleteAssetAction performs deep cascade cleanup.
            if (uploadedAssetIds.length > 0 && !skipCleanupRef.current) {
                Promise.all(uploadedAssetIds.map(id => deleteAssetAction(id).catch(e => console.error(e))))
            }
            setSelectedFamilies([])
            setSelectedReferences([])
            setSelectedMeasures([])
            setSelectedVersions([])
            setSelectedAssetId("")
            setSearchQuery("")
            setReferences([])
            setMeasures([])
            setVersions([])
            setUploadedAssetIds([])
            setBlockingDiffFields([])
            setConfirmBlockingDiffs(false)
        }
        /* eslint-enable react-hooks/set-state-in-effect */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialFamilies, initialReferences, initialMeasures])

    React.useEffect(() => {
        if (selectedReferences.length === 0) {
            /* eslint-disable react-hooks/set-state-in-effect */
            setBlockingDiffFields([])
            setConfirmBlockingDiffs(false)
            /* eslint-enable react-hooks/set-state-in-effect */
            return
        }

        const normalize = (value: unknown) => {
            const s = String(value ?? '').trim()
            return s === '' || s.toUpperCase() === 'NA' ? 'NA' : s
        }

        const selectedOptions = selectedReferences
            .map(v => references.find(o => o.value === v))
            .filter(Boolean) as Option[]

        const valuesByField = {
            medida: new Set<string>(),
            designacion: new Set<string>(),
            nombre: new Set<string>(),
            accesorio: new Set<string>(),
        }

        for (const opt of selectedOptions) {
            const measureFromValue = (opt.value.split('|||')[2] || '').trim()

            const designation = opt.meta?.designation
            const commercialMeasure = opt.meta?.commercial_measure ?? (measureFromValue || undefined)
            const productName = opt.meta?.product_name
            const accessoryText = opt.meta?.accessory_text

            valuesByField.medida.add(normalize(commercialMeasure))
            valuesByField.designacion.add(normalize(designation))
            valuesByField.nombre.add(normalize(productName))
            valuesByField.accesorio.add(normalize(accessoryText))
        }

        const diffs: string[] = []
        if (valuesByField.medida.size > 1) diffs.push('medida')
        if (valuesByField.nombre.size > 1) diffs.push('nombre')
        if (valuesByField.designacion.size > 1) diffs.push('designacion')
        if (valuesByField.accesorio.size > 1) diffs.push('accesorio')

        setBlockingDiffFields(diffs)
        setConfirmBlockingDiffs(false)
    }, [selectedReferences, references])

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
        const loadMeasuresAndVersions = async () => {
            if (selectedFamilies.length > 0 || selectedReferences.length > 0) {
                const [meas, vers] = await Promise.all([
                    getMeasuresByFamilyAndRefAction(selectedFamilies, selectedReferences),
                    getVersionsByFamilyAndRefAction(selectedFamilies, selectedReferences)
                ])
                setMeasures(meas)
                setVersions(vers)
            } else {
                setMeasures([])
                setSelectedMeasures([])
                setVersions([])
                setSelectedVersions([])
            }
        }
        loadMeasuresAndVersions()
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
            setUploadedAssetIds(prev => [...prev, newAsset.id])
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Error al subir archivo')
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

        // Modo 'select': solo devolver el asset seleccionado, sin tocar la BD
        if (isSelectOnly) {
            const selectedAsset = assets.find(a => a.id === selectedAssetId)
            if (onAssociationComplete && selectedAsset) {
                onAssociationComplete(selectedAsset)
            }
            // Limpiar uploadedAssetIds para que no se borren al cerrar
            skipCleanupRef.current = true
            setUploadedAssetIds([])
            setOpen(false)
            toast.success("Isométrico seleccionado correctamente")
            return
        }

        // Modo 'associate': validar filtros y persistir en BD
        if (selectedFamilies.length === 0) {
            toast.error("Selecciona al menos una familia")
            return
        }
        if (selectedReferences.length === 0) {
            toast.error("Debes seleccionar al menos una referencia específica. No se permite asociar a nivel de familia completa.")
            return
        }
        if (blockingDiffFields.length > 0 && !confirmBlockingDiffs) {
            toast.error("Confirma las diferencias antes de asociar.")
            return
        }

        setSubmitting(true)
        try {
            const result = await associateIsometricAction({
                assetId: selectedAssetId,
                familyCodes: selectedFamilies,
                referenceCodes: selectedReferences,
                measureCodes: selectedMeasures,
                versionCodes: selectedVersions
            })
            const count = result.updatedCount
            toast.success(typeof count === 'number' ? `Isométrico asociado a ${count} registro(s)` : "Isométrico asociado correctamente")
            
            if (onAssociationComplete) {
                const selectedAsset = assets.find(a => a.id === selectedAssetId)
                onAssociationComplete(selectedAsset)
            }

            // Prevent deleteAssetAction cleanup after a successful association (it would undo the link).
            skipCleanupRef.current = true
            setUploadedAssetIds([])
            setOpen(false)
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Error al asociar isométrico")
        } finally {
            setSubmitting(false)
        }
    }

    const filteredAssets = assets.filter(a => {
        if (!searchQuery.trim()) return true
        const keywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean)
        const name = a.name.toLowerCase()
        const path = (a.file_path || '').toLowerCase()
        return keywords.every(kw => name.includes(kw) || path.includes(kw))
    })

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger 
                render={trigger || (
                    <Button variant="outline" className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 shadow-sm transition-all h-10 px-4">
                        <Box className="h-4 w-4" />
                        Asociar isométricos
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
                                    const mockEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>
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
                                Solo archivos SVG. Se guardará automáticamente como tipo &apos;isometric&apos;.
                            </p>
                        </div>

                        {/* Search Filter */}
                        {assets.length > 0 && (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar isométrico..."
                                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                />
                            </div>
                        )}

                        {/* Existing Assets List */}
                        {filteredAssets.length > 0 && (
                            <div className="grid grid-cols-1 gap-2 max-h-[180px] overflow-y-auto pr-1">
                                {filteredAssets.map((asset) => (
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
                                        <div className="relative h-10 w-10 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-slate-200">
                                            {asset.file_path ? (
                                                <Image
                                                    src={asset.file_path}
                                                    alt={`Vista previa del isométrico ${asset.name}`}
                                                    fill
                                                    unoptimized
                                                    sizes="40px"
                                                    className="object-contain"
                                                />
                                            ) : (
                                                <ImageIcon className="h-5 w-5 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-slate-900 truncate uppercase">{asset.name}</p>
                                                {asset.relation_count === 0 && (
                                                    <Badge className="bg-rose-500 text-white border-none text-[8px] h-4 font-bold animate-pulse">HUÉRFANO</Badge>
                                                )}
                                            </div>
                                            <p className="text-[9px] text-slate-400 truncate mt-0.5">{asset.file_path}</p>
                                        </div>
                                        {selectedAssetId === asset.id && <CheckCircle2 className="h-5 w-5 text-indigo-500" />}
                                    </div>
                                ))}
                            </div>
                        )}
                        {assets.length > 0 && filteredAssets.length === 0 && (
                            <div className="text-center py-6 text-sm text-slate-400">
                                No se encontraron isométricos con ese nombre.
                            </div>
                        )}
                    </div>

                    {/* Step 2: Target Selection — solo visible en modo 'associate' */}
                    {!isSelectOnly && (
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
                                <Label className="text-slate-700 font-medium">Ref · Desig · Medida · Nombre · Accesorio · Marca <span className="text-[10px] text-rose-500 font-bold uppercase tracking-tight">(Obligatorio)</span></Label>
                                <MultiSelectSearchField 
                                    options={references}
                                    values={selectedReferences}
                                    onChange={setSelectedReferences}
                                    placeholder="Seleccionar Referencia..."
                                    className="h-11"
                                    emptyMessage="Selecciona familias primero."
                                />
                            </div>
                            <div className={cn("space-y-2 transition-opacity", selectedReferences.length === 0 && "opacity-50 pointer-events-none")}>
                                <Label className="text-slate-700 font-medium">Versión(es) <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">(Opcional: Por defecto aplica a todas)</span></Label>
                                <MultiSelectSearchField 
                                    options={versions}
                                    values={selectedVersions}
                                    onChange={setSelectedVersions}
                                    placeholder="Todas las versiones"
                                    className="h-11"
                                    emptyMessage="Selecciona referencias primero."
                                />
                            </div>
                        </div>
                    </div>
                    )}

                    {isSelectOnly ? (
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <p className="text-xs text-emerald-700 flex items-start gap-2">
                             <span className="font-bold text-emerald-600 block mt-0.5">✅</span>
                             El isométrico seleccionado se vinculará al producto al momento de guardarlo.
                        </p>
                    </div>
                    ) : (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                        <p className="text-xs text-amber-700 flex items-start gap-2">
                             <span className="font-bold text-amber-600 block mt-0.5">⚠️</span>
                             Esta acción actualizará de forma masiva el campo &quot;isometric_path&quot; de todos los productos que coincidan con los filtros seleccionados.
                        </p>
                    </div>
                    )}

                    {!isSelectOnly && blockingDiffFields.length > 0 && (
                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 space-y-3">
                        <p className="text-xs text-rose-800 font-semibold">
                            Cuidado: las referencias seleccionadas tienen diferencias en {blockingDiffFields.join(', ')}.
                        </p>
                        <label className="flex items-start gap-2 text-xs text-rose-800">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={confirmBlockingDiffs}
                                onChange={(e) => setConfirmBlockingDiffs(e.target.checked)}
                            />
                            <span>Entiendo y deseo asociar el mismo isométrico igualmente.</span>
                        </label>
                    </div>
                    )}
                </div>

                <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                    <Button variant="ghost" className="hover:bg-slate-200" onClick={() => setOpen(false)} disabled={submitting || uploading}>
                        Cancelar
                    </Button>
                    <Button 
                        disabled={
                            submitting ||
                            uploading ||
                            !selectedAssetId ||
                            (!isSelectOnly && (selectedFamilies.length === 0 || selectedReferences.length === 0)) ||
                            (!isSelectOnly && blockingDiffFields.length > 0 && !confirmBlockingDiffs)
                        }
                        onClick={handleSubmit}
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-md h-10 px-6 transition-all"
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        {submitting ? "Procesando..." : (isSelectOnly ? "Seleccionar Isométrico" : "Asociar Isométrico")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
