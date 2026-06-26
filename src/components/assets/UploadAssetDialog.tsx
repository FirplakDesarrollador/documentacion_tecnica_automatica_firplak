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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiSelectSearchField } from "@/components/ui-custom/MultiSelectSearchField"
import { Upload, Loader2, Image as ImageIcon, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import {
    getFamiliesAction,
    getReferencesByFamilyAction,
    getVersionsByFamilyAndRefAction,
    associateIsometricAction
} from "@/app/assets/actions"
import { cn } from "@/lib/utils"

interface Option {
    value: string
    label: string
}

const ASSET_TYPES = [
    'isometric',
    'instruction_pdf',
    'front_view_dimensioned',
    'side_view_dimensioned',
    'top_view_dimensioned',
    'exploded_view',
    'assembly_step',
    'icon',
    'logo',
]

interface Asset {
    id: string
}

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'

interface Props {
    onUploadComplete?: (asset: Asset) => void
    variant?: ButtonVariant
    className?: string
    label?: string
}

export function UploadAssetDialog({ onUploadComplete, variant, className, label }: Props) {
    const router = useRouter()
    const [open, setOpen] = React.useState(false)

    // File
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
    const [uploading, setUploading] = React.useState(false)

    // Metadata
    const [name, setName] = React.useState("")
    const [typeVal, setTypeVal] = React.useState("isometric")
    const [isCustom, setIsCustom] = React.useState(false)

    // Association toggle
    const [associateNow, setAssociateNow] = React.useState(false)

    // Association data
    const [families, setFamilies] = React.useState<Option[]>([])
    const [references, setReferences] = React.useState<Option[]>([])
    const [versions, setVersions] = React.useState<Option[]>([])
    const [selectedFamilies, setSelectedFamilies] = React.useState<string[]>([])
    const [selectedReferences, setSelectedReferences] = React.useState<string[]>([])
    const [selectedVersions, setSelectedVersions] = React.useState<string[]>([])
    const [submitting, setSubmitting] = React.useState(false)

    const resetForm = () => {
        setSelectedFile(null)
        setName("")
        setTypeVal("isometric")
        setIsCustom(false)
        setAssociateNow(false)
        setSelectedFamilies([])
        setSelectedReferences([])
        setSelectedVersions([])
        setReferences([])
        setVersions([])
    }

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen)
        if (nextOpen) {
            resetForm()
            getFamiliesAction().then(setFamilies).catch(() => {})
        }
    }

    // Load references when families change
    React.useEffect(() => {
        if (selectedFamilies.length > 0) {
            getReferencesByFamilyAction(selectedFamilies).then(setReferences).catch(() => {})
        } else {
            /* eslint-disable react-hooks/set-state-in-effect */
            setReferences([])
            setSelectedReferences([])
            /* eslint-enable react-hooks/set-state-in-effect */
        }
    }, [selectedFamilies])

    // Load versions when references change
    React.useEffect(() => {
        if (selectedFamilies.length > 0 || selectedReferences.length > 0) {
            getVersionsByFamilyAndRefAction(selectedFamilies, selectedReferences).then(setVersions).catch(() => {})
        } else {
            /* eslint-disable react-hooks/set-state-in-effect */
            setVersions([])
            setSelectedVersions([])
            /* eslint-enable react-hooks/set-state-in-effect */
        }
    }, [selectedFamilies, selectedReferences])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setSelectedFile(file)
        const ext = file.name.lastIndexOf('.')
        setName(ext > 0 ? file.name.slice(0, ext) : file.name)
    }

    const handleSubmit = async () => {
        if (!selectedFile) {
            toast.error("Selecciona un archivo primero")
            return
        }
        if (!name.trim()) {
            toast.error("El nombre del recurso no puede estar vacío")
            return
        }
        const resolvedType = isCustom ? typeVal.trim() : typeVal
        if (!resolvedType) {
            toast.error("Selecciona o escribe un tipo de recurso")
            return
        }

        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', selectedFile)
            formData.append('type', resolvedType)
            formData.append('name', name.trim())

            const response = await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) throw new Error('Error al subir archivo')
            const result = await response.json()
            if (!result.success) throw new Error(result.error)

            const asset = result.asset

            // Optional association
            if (associateNow && resolvedType === 'isometric' && selectedReferences.length > 0) {
                setSubmitting(true)
                try {
                    await associateIsometricAction({
                        assetId: asset.id,
                        familyCodes: selectedFamilies,
                        referenceCodes: selectedReferences,
                        versionCodes: selectedVersions,
                    })
                    toast.success("Isométrico subido y asociado correctamente")
                } catch (e: unknown) {
                    toast.error(`Archivo subido, pero falló la asociación: ${e instanceof Error ? e.message : String(e)}`)
                } finally {
                    setSubmitting(false)
                }
            } else {
                toast.success("Recurso subido correctamente")
            }

            setOpen(false)
            if (onUploadComplete) {
                onUploadComplete(asset)
            } else {
                router.refresh()
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al subir el recurso')
        } finally {
            setUploading(false)
            setSubmitting(false)
        }
    }

    const isUploading = uploading || submitting

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger
                render={
                    <Button
                        variant={variant || "default"}
                        className={className}
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        {label || 'Adjuntar recurso'}
                    </Button>
                }
            />
            <DialogContent className="max-w-md sm:max-w-xl p-0 bg-white border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="p-6 pb-2 shrink-0">
                    <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Upload className="h-5 w-5 text-indigo-500" />
                        Adjuntar nuevo recurso
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Sube un archivo multimedia, define su tipo y opcionalmente asócialo a productos.
                    </DialogDescription>
                </DialogHeader>

                <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
                    {/* File selector */}
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Archivo</Label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                            onDrop={(e) => {
                                e.preventDefault(); e.stopPropagation()
                                const file = e.dataTransfer.files?.[0]
                                if (file) {
                                    setSelectedFile(file)
                                    const ext = file.name.lastIndexOf('.')
                                    setName(ext > 0 ? file.name.slice(0, ext) : file.name)
                                }
                            }}
                            className={cn(
                                "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
                                selectedFile
                                    ? "bg-indigo-50/30 border-indigo-300"
                                    : "hover:bg-indigo-50/30 hover:border-indigo-300 border-slate-200"
                            )}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="application/pdf, image/png, image/jpeg, image/svg+xml, .pdf"
                                onChange={handleFileSelect}
                            />
                            {selectedFile ? (
                                <div className="flex items-center justify-center gap-3">
                                    <CheckCircle2 className="h-6 w-6 text-indigo-500" />
                                    <p className="text-sm font-medium text-slate-700 truncate">{selectedFile.name}</p>
                                </div>
                            ) : (
                                <>
                                    <ImageIcon className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                                    <p className="text-sm font-medium text-slate-700">Haz clic o arrastra un archivo</p>
                                    <p className="text-[10px] text-slate-500 mt-1">PNG, JPG o SVG</p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                        <Label htmlFor="asset-name" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nombre del recurso</Label>
                        <Input
                            id="asset-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Nombre del recurso..."
                            className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:ring-indigo-500 transition-all font-medium"
                        />
                    </div>

                    {/* Type */}
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tipo de recurso</Label>
                        {!isCustom ? (
                            <select
                                value={typeVal}
                                onChange={(e) => {
                                    if (e.target.value === '__custom__') {
                                        setIsCustom(true)
                                        setTypeVal('')
                                    } else {
                                        setTypeVal(e.target.value)
                                    }
                                }}
                                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            >
                                {ASSET_TYPES.map(t => (
                                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                ))}
                                <option value="__custom__">Otro...</option>
                            </select>
                        ) : (
                            <div className="flex gap-2">
                                <Input
                                    value={typeVal}
                                    onChange={(e) => setTypeVal(e.target.value)}
                                    placeholder="Escribe el nuevo tipo..."
                                    className="flex-1 h-11 bg-slate-50 border-slate-200 focus:bg-white"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => { setIsCustom(false); setTypeVal('isometric') }}
                                    className="h-11 px-3 text-xs font-bold text-slate-500 shrink-0"
                                >
                                    Cancelar
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Association toggle (only for isometric) */}
                    {typeVal === 'isometric' && !isCustom && (
                        <label className="flex items-center gap-3 p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 cursor-pointer hover:bg-indigo-50 transition-all">
                            <input
                                type="checkbox"
                                checked={associateNow}
                                onChange={(e) => setAssociateNow(e.target.checked)}
                                className="h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                                <p className="text-sm font-bold text-indigo-800">Asociar ahora</p>
                                <p className="text-[11px] text-indigo-600">Selecciona familias y referencias para vincular este isométrico inmediatamente.</p>
                            </div>
                        </label>
                    )}

                    {/* Association fields */}
                    {associateNow && typeVal === 'isometric' && !isCustom && (
                        <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selección de destino</p>

                            <div className="space-y-2">
                                <Label className="text-slate-700 font-medium text-sm">Familia(s)</Label>
                                <MultiSelectSearchField
                                    options={families}
                                    values={selectedFamilies}
                                    onChange={setSelectedFamilies}
                                    placeholder="Seleccionar Familias"
                                    className="h-11"
                                />
                            </div>

                            <div className={cn("space-y-2 transition-opacity", selectedFamilies.length === 0 && "opacity-50 pointer-events-none")}>
                                <Label className="text-slate-700 font-medium text-sm">Referencia(s) <span className="text-[10px] text-rose-500 font-bold">(Obligatorio)</span></Label>
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
                                <Label className="text-slate-700 font-medium text-sm">Versión(es) <span className="text-[10px] text-slate-400 font-bold">(Opcional)</span></Label>
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
                    )}
                </div>

                <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={isUploading} className="hover:bg-slate-200">
                        Cancelar
                    </Button>
                    <Button
                        disabled={isUploading || !selectedFile || !name.trim()}
                        onClick={handleSubmit}
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-md h-10 px-6 transition-all"
                    >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                        {uploading ? "Subiendo..." : submitting ? "Asociando..." : "Subir recurso"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
