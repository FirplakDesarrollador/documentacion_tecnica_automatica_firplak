'use client'

import { useState, useRef, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
    Edit2, 
    Loader2, 
    Upload, 
    Link2, 
    Unlink, 
    Trash2,
    Info,
    ChevronRight,
    AlertCircle,
    Box,
    Layers
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { 
    updateAssetAction, 
    getAssetRelationshipsAction,
    unlinkReferenceAction,
    unlinkVersionAction,
    unlinkAllAssetRelationshipsAction
} from '@/app/assets/actions'
import { cn } from '@/lib/utils'

interface AssetRow {
    id: string;
    name: string;
    type: string;
    file_path: string;
    relation_count: number;
}

interface ReferenceRow {
    id: string;
    reference_code: string;
    line_name: string;
    product_name: string;
    designation: string;
    commercial_measure: string;
    special_label: string | null;
    accessory_text: string | null;
}

interface VersionRow {
    id: string;
    version_code: string;
    reference_code: string;
    line_name: string;
    product_name: string;
    designation: string;
    commercial_measure: string;
    special_label: string | null;
    accessory_text: string | null;
}

interface Props {
    assetId: string;
    assetName: string;
    assetType?: string;
    isDefault?: boolean;
    onUploadComplete?: (asset: AssetRow) => void;
}

export function EditAssetDialog({ assetId, assetName, assetType, isDefault }: Props) {
    const [name, setName] = useState(assetName)
    const [typeVal, setTypeVal] = useState(assetType || 'icon')
    const [isUpdating, setIsUpdating] = useState(false)
    const [open, setOpen] = useState(false)
    const [showRelationships, setShowRelationships] = useState(false)
    const [relationships, setRelationships] = useState<{ references: ReferenceRow[], versions: VersionRow[] }>({ references: [], versions: [] })
    const [isLoadingRelationships, setIsLoadingRelationships] = useState(false)
    
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const router = useRouter()

    useEffect(() => {
        if (open) {
            /* eslint-disable-next-line react-hooks/set-state-in-effect */
            setTypeVal(assetType || 'icon')
        }
    }, [open, assetType])

    const loadRelationships = async () => {
        setIsLoadingRelationships(true)
        try {
            const data = await getAssetRelationshipsAction(assetId)
            setRelationships(data)
        } catch {
            toast.error("Error al cargar relacionamientos")
        } finally {
            setIsLoadingRelationships(false)
        }
    }

    useEffect(() => {
        if (open && showRelationships) {
            /* eslint-disable-next-line react-hooks/set-state-in-effect */
            loadRelationships()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, showRelationships])

    const handleSave = async () => {
        setIsUpdating(true)
        try {
            let finalPath = ''
            if (selectedFile) {
                const formData = new FormData()
                formData.append('file', selectedFile)
                formData.append('assetId', assetId)

                const uploadRes = await fetch('/api/assets/upload', {
                    method: 'POST',
                    body: formData,
                })
                
                if (!uploadRes.ok) throw new Error('Error al subir el archivo')
                const uploadData = await uploadRes.json()
                finalPath = uploadData.asset?.file_path
            }

            const nameToUpdate = !isDefault && name !== assetName ? name : undefined
            const typeChanged = !isDefault && typeVal !== assetType
            const typeToUpdate = typeChanged ? typeVal : undefined
            
            if (nameToUpdate || finalPath || typeToUpdate) {
                await updateAssetAction(assetId, { name: nameToUpdate, file_path: finalPath, type: typeToUpdate })
                toast.success('Recurso actualizado con éxito')
                setOpen(false)
                router.refresh()
            } else {
                setOpen(false)
            }
        } catch {
            toast.error('Error al actualizar')
        } finally {
            setIsUpdating(false)
        }
    }

    const handleUnlinkRef = async (refId: string) => {
        try {
            await unlinkReferenceAction(refId)
            toast.success("Relación eliminada")
            loadRelationships()
        } catch {
            toast.error("Error al eliminar relación")
        }
    }

    const handleUnlinkVersion = async (vId: string) => {
        try {
            await unlinkVersionAction(vId)
            toast.success("Sobrescritura de versión eliminada")
            loadRelationships()
        } catch {
            toast.error("Error al eliminar relación")
        }
    }

    const handleUnlinkAll = async () => {
        if (!confirm("¿Estás seguro de eliminar TODOS los relacionamientos? El activo quedará huérfano.")) return
        try {
            await unlinkAllAssetRelationshipsAction(assetId)
            toast.success("Todas las relaciones han sido eliminadas")
            loadRelationships()
            router.refresh()
        } catch {
            toast.error("Error al limpiar relaciones")
        }
    }

        return (
            <Dialog open={open} onOpenChange={(v) => {
                setOpen(v)
                if (!v) {
                    setShowRelationships(false)
                    setSelectedFile(null)
                }
            }}>
            <DialogTrigger
                render={
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 lg:px-3 gap-2 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
                    >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span className="font-bold text-[11px] uppercase tracking-wider">Editar</span>
                    </Button>
                }
            />
            <DialogContent className={cn(
                "transition-all duration-300 overflow-hidden p-0 bg-white border-slate-200 shadow-2xl",
                showRelationships ? "sm:max-w-[700px]" : "sm:max-w-[425px]"
            )}>
                <div className="flex flex-col h-full max-h-[90vh]">
                    <DialogHeader className="p-6 pb-4 border-b border-slate-100 shrink-0">
                        <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <div className="p-2 bg-indigo-50 rounded-lg">
                                <Edit2 className="h-4 w-4 text-indigo-600" />
                            </div>
                            Editar Recurso
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 font-medium">
                            {showRelationships ? "Gestiona los productos que utilizan este activo." : "Actualiza la información básica o reemplaza el archivo."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto">
                        {!showRelationships ? (
                            <div className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nombre del Recurso</Label>
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        disabled={isDefault}
                                        className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:ring-indigo-500 transition-all font-medium"
                                    />
                                    {isDefault && (
                                        <p className="text-[10px] text-amber-600 flex items-center gap-1.5 font-medium mt-1">
                                            <Info className="h-3 w-3" />
                                            Los nombres de sistema no pueden ser modificados.
                                        </p>
                                    )}
                                </div>

                                {!isDefault && (
                                <TypeSelector typeVal={typeVal} onChange={setTypeVal} />
                                )}

                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Archivo Multimedia</Label>
                                    <div className="group relative">
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                            className="hidden"
                                            accept="image/png, image/jpeg, image/svg+xml"
                                        />
                                        <Button 
                                            variant="outline" 
                                            className="w-full h-24 border-dashed border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 flex flex-col gap-2 transition-all group-hover:shadow-sm"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <div className="p-2 bg-slate-100 rounded-full group-hover:bg-indigo-100 transition-colors">
                                                <Upload className="h-5 w-5 text-slate-500 group-hover:text-indigo-600" />
                                            </div>
                                            <span className="text-xs font-semibold text-slate-600">
                                                {selectedFile ? selectedFile.name : 'Click para subir nueva versión'}
                                            </span>
                                        </Button>
                                    </div>
                                </div>
                                
                                <div className="pt-4 border-t border-slate-100">
                                    <Button 
                                        variant="ghost" 
                                        onClick={() => setShowRelationships(true)}
                                        className="w-full justify-between h-12 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Link2 className="h-4 w-4" />
                                            <span className="font-bold text-sm">Gestionar Relacionamiento</span>
                                        </div>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-6 animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
                                <div className="flex items-center justify-between">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => setShowRelationships(false)}
                                        className="text-indigo-600 hover:text-indigo-700 font-bold text-xs"
                                    >
                                        ← Volver a edición
                                    </Button>
                                    <Button 
                                        variant="destructive" 
                                        size="sm" 
                                        onClick={handleUnlinkAll}
                                        className="h-8 px-3 font-bold text-[10px] uppercase tracking-wider"
                                    >
                                        <Trash2 className="h-3 w-3 mr-2" />
                                        Desvincular Todo
                                    </Button>
                                </div>

                                {isLoadingRelationships ? (
                                    <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                                        <Loader2 className="h-8 w-8 animate-spin" />
                                        <p className="text-sm font-medium">Buscando productos asociados...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* References List */}
                                        <div className="space-y-3">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                                <Layers className="h-3 w-3" />
                                                Referencias Asociadas ({relationships.references.length})
                                            </h4>
                                            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                                {relationships.references.length === 0 ? (
                                                    <div className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center">
                                                        <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                                        <p className="text-xs text-slate-500 font-medium">No hay referencias asociadas directamente.</p>
                                                    </div>
                                                ) : (
                                                    relationships.references.map((ref) => (
                                                        <div key={ref.id} className="group p-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:shadow-sm transition-all flex flex-col gap-3">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-slate-50 text-slate-600 border-slate-200">
                                                                        {ref.reference_code}
                                                                    </Badge>
                                                                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 text-[9px] font-bold uppercase">
                                                                        {ref.line_name}
                                                                    </Badge>
                                                                </div>
                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    onClick={() => handleUnlinkRef(ref.id)}
                                                                    className="h-8 w-8 text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all rounded-lg opacity-0 group-hover:opacity-100"
                                                                >
                                                                    <Unlink className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                            
                                                            <div className="space-y-1">
                                                                <p className="text-[12px] font-black text-slate-900 uppercase leading-tight">
                                                                    {ref.product_name} {ref.designation}
                                                                </p>
                                                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-tight text-slate-400">
                                                                    <span className="flex items-center gap-1.5">
                                                                        <Box className="h-3 w-3" />
                                                                        {ref.commercial_measure}
                                                                    </span>
                                                                    {ref.special_label && ref.special_label !== 'NA' && (
                                                                        <span className="text-amber-600">
                                                                            • {ref.special_label}
                                                                        </span>
                                                                    )}
                                                                    {ref.accessory_text && ref.accessory_text !== 'NA' && (
                                                                        <span className="text-indigo-500">
                                                                            • {ref.accessory_text}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        {/* Versions Overrides List */}
                                        {relationships.versions.length > 0 && (
                                            <div className="space-y-3">
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                                    <AlertCircle className="h-3 w-3" />
                                                    Sobrescrituras por Versión ({relationships.versions.length})
                                                </h4>
                                                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                                    {relationships.versions.map((ver) => (
                                                        <div key={ver.id} className="group p-4 bg-amber-50/20 border border-amber-100 rounded-xl hover:border-amber-300 hover:shadow-sm transition-all flex flex-col gap-3">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <Badge className="bg-amber-100 text-amber-700 border-none text-[9px] font-bold uppercase tracking-wider">
                                                                        V {ver.version_code}
                                                                    </Badge>
                                                                    <span className="text-[10px] text-amber-600 font-black tracking-tight">{ver.reference_code}</span>
                                                                    <Badge variant="outline" className="text-[8px] font-bold uppercase border-amber-200 text-amber-500">
                                                                        {ver.line_name}
                                                                    </Badge>
                                                                </div>
                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    onClick={() => handleUnlinkVersion(ver.id)}
                                                                    className="h-8 w-8 text-amber-300 hover:text-rose-600 hover:bg-rose-50 transition-all rounded-lg opacity-0 group-hover:opacity-100"
                                                                >
                                                                    <Unlink className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                            
                                                            <div className="space-y-1">
                                                                <p className="text-[12px] font-black text-slate-900 uppercase leading-tight">
                                                                    {ver.product_name} {ver.designation}
                                                                </p>
                                                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-tight text-slate-400">
                                                                    <span className="flex items-center gap-1.5">
                                                                        <Box className="h-3 w-3" />
                                                                        {ver.commercial_measure}
                                                                    </span>
                                                                    {ver.special_label && ver.special_label !== 'NA' && (
                                                                        <span className="text-amber-600">
                                                                            • {ver.special_label}
                                                                        </span>
                                                                    )}
                                                                    {ver.accessory_text && ver.accessory_text !== 'NA' && (
                                                                        <span className="text-indigo-500">
                                                                            • {ver.accessory_text}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="p-6 border-t border-slate-100 bg-slate-50/50 shrink-0">
                        <Button 
                            variant="ghost" 
                            onClick={() => setOpen(false)} 
                            disabled={isUpdating}
                            className="font-bold text-slate-400 hover:text-slate-600"
                        >
                            Cancelar
                        </Button>
                        {!showRelationships && (
                            <Button 
                                onClick={handleSave} 
                                disabled={isUpdating}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-8 shadow-lg shadow-slate-200 h-11"
                            >
                                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar Cambios
                            </Button>
                        )}
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const ASSET_TYPE_OPTIONS = ['isometric', 'icon', 'logo']

function TypeSelector({ typeVal, onChange }: { typeVal: string; onChange: (v: string) => void }) {
    const [isCustom, setIsCustom] = useState(!ASSET_TYPE_OPTIONS.includes(typeVal))

    return (
        <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tipo de Recurso</Label>
            {!isCustom ? (
                <div className="flex gap-2">
                    <select
                        value={typeVal}
                        onChange={(e) => {
                            if (e.target.value === '__custom__') {
                                setIsCustom(true)
                                onChange('')
                            } else {
                                onChange(e.target.value)
                            }
                        }}
                        className="flex-1 h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    >
                        {ASSET_TYPE_OPTIONS.map(t => (
                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                        ))}
                        <option value="__custom__">Otro...</option>
                    </select>
                </div>
            ) : (
                <div className="flex gap-2">
                    <Input
                        value={typeVal}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Escribe el nuevo tipo..."
                        className="flex-1 h-11 bg-slate-50 border-slate-200 focus:bg-white"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => { setIsCustom(false); onChange('icon') }}
                        className="h-11 px-3 text-xs font-bold text-slate-500"
                    >
                        Cancelar
                    </Button>
                </div>
            )}
            <p className="text-[10px] text-slate-400">Si el tipo no está en la lista, selecciona &quot;Otro...&quot; y escríbelo.</p>
        </div>
    )
}
