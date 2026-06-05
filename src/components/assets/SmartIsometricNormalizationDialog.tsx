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
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
    Loader2, 
    CheckCircle2, 
    Layers,
    ChevronRight,
    Trash2,
    Info
} from "lucide-react"
import { 
    getIsometricNormalizationGroupsAction, 
    applyIsometricNormalizationAction,
    IsometricNormalizationGroup
} from "@/app/assets/smart-association-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function SmartIsometricNormalizationDialog() {
    const [open, setOpen] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [processingGroupId, setProcessingGroupId] = React.useState<string | null>(null)
    const [groups, setGroups] = React.useState<IsometricNormalizationGroup[]>([])
    const loadGroups = React.useCallback(async () => {
        setLoading(true)
        try {
            const data = await getIsometricNormalizationGroupsAction()
            setGroups(data)
        } catch {
            toast.error("Error al cargar grupos de duplicados")
        } finally {
            setLoading(false)
        }
    }, [])

    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen) {
            void loadGroups()
        } else {
            setGroups([])
            setLoading(false)
            setProcessingGroupId(null)
        }
        setOpen(nextOpen)
    }

    const handleUnify = async (group: IsometricNormalizationGroup, masterAssetId: string, masterPath: string) => {
        setProcessingGroupId(group.id)
        try {
            const allAssetIds = group.options.map(o => o.assetId)
            await applyIsometricNormalizationAction(group.id, masterAssetId, masterPath, allAssetIds)
            toast.success("Grupo unificado y limpieza completada")
            void loadGroups()
        } catch {
            toast.error("Error al unificar el grupo")
        } finally {
            setProcessingGroupId(null)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger
                className={cn(
                    buttonVariants({ variant: "outline", className: "gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 shadow-sm transition-all h-10 px-4" })
                )}
            >
                <Layers className="h-4 w-4" />
                Unificar Duplicados
            </DialogTrigger>
            <DialogContent className="sm:max-w-[50vw] w-full p-0 bg-white border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="p-6 pb-2 shrink-0">
                    <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Layers className="h-5 w-5 text-indigo-500" />
                        Unificación de Isométricos Duplicados
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Se han encontrado productos idénticos que están usando archivos de isométricos diferentes. Unifícalos para optimizar el catálogo.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 border-y border-slate-100 min-h-[500px] bg-slate-50/30">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <p className="text-sm font-medium">Escaneando duplicados en el catálogo...</p>
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400 p-8 text-center">
                            <CheckCircle2 className="h-10 w-10 text-emerald-500/50" />
                            <div>
                                <p className="text-slate-900 font-semibold">¡Catálogo optimizado!</p>
                                <p className="text-sm">No se encontraron productos idénticos con isométricos diferentes.</p>
                            </div>
                        </div>
                    ) : (
                        groups.map((group) => (
                            <div key={group.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Group Header */}
                                <div className="p-5 border-b border-slate-100 bg-white sticky top-0 z-10 flex items-center justify-between">
                                    <div className="flex flex-col gap-1 max-w-[70%]">
                                        <h3 className="font-bold text-slate-900 leading-tight break-words uppercase">
                                            {group.displayName}
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider bg-slate-50 text-slate-500 border-slate-200">
                                                {group.attributes.family}
                                            </Badge>
                                            <span className="text-[10px] text-slate-400 font-medium">• {group.totalReferences} referencias en este grupo</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                                            <AlertCircle className="h-3 w-3" />
                                            <span className="text-[10px] font-bold uppercase">{group.options.length} versiones distintas</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Options */}
                                <div className="p-5 grid grid-cols-1 gap-4">
                                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                                        <ChevronRight className="h-3 w-3" />
                                        Selecciona el isométrico maestro (el resto se eliminará):
                                    </p>
                                    
                                    <div className="grid grid-cols-1 gap-3">
                                        {group.options.sort((a,b) => b.usageCount - a.usageCount).map((option, idx) => (
                                            <div 
                                                key={option.assetId}
                                                className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all group/opt"
                                            >
                                                <div className="flex items-center gap-4 flex-1">
                                                    <div className="relative w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                                                        <Image
                                                            src={option.path}
                                                            alt="preview"
                                                            fill
                                                            unoptimized
                                                            sizes="64px"
                                                            className="object-contain"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-3 min-w-0 flex-1">
                                                        {option.references.map((ref, rIdx) => (
                                                            <div key={ref.sku} className={cn("flex flex-col gap-1", rIdx > 0 && "pt-2 border-t border-slate-100/50")}>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                                        {ref.sku}
                                                                    </span>
                                                                    {idx === 0 && rIdx === 0 && (
                                                                        <Badge className="bg-emerald-500 text-white border-none text-[8px] h-4 px-1.5 py-0">Recomendado</Badge>
                                                                    )}
                                                                </div>
                                                                <p className={cn(
                                                                    "font-bold uppercase break-words leading-snug",
                                                                    rIdx === 0 ? "text-slate-900 text-sm" : "text-slate-500 text-[11px]"
                                                                )}>
                                                                    {ref.name || "Sin descripción"}
                                                                </p>
                                                            </div>
                                                        ))}
                                                        
                                                        <div className="mt-1 flex items-center gap-2">
                                                            <div className="h-1 w-1 rounded-full bg-slate-300" />
                                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                                                Este archivo sirve a <span className="text-slate-600">{option.usageCount}</span> referencias
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <Button 
                                                    size="sm"
                                                    disabled={processingGroupId === group.id}
                                                    onClick={() => handleUnify(group, option.assetId, option.path)}
                                                    className={cn(
                                                        "font-bold text-xs h-9 px-4 rounded-lg shadow-sm transition-all",
                                                        idx === 0 
                                                            ? "bg-indigo-600 hover:bg-indigo-700 text-white" 
                                                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {processingGroupId === group.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                                    ) : idx === 0 ? (
                                                        <CheckCircle2 className="h-3 w-3 mr-2" />
                                                    ) : (
                                                        <Layers className="h-3 w-3 mr-2" />
                                                    )}
                                                    {idx === 0 ? "Usar este Master" : "Unificar con este"}
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Warning info */}
                                <div className="px-5 py-3 bg-rose-50/50 border-t border-slate-100 flex items-center gap-3">
                                    <Trash2 className="h-3 w-3 text-rose-400" />
                                    <p className="text-[10px] text-rose-500 font-medium italic">
                                        Al unificar, los {group.options.length - 1} isométricos restantes se eliminarán permanentemente del servidor.
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <DialogFooter className="p-6 bg-white shrink-0">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                            <Info className="h-4 w-4 text-slate-400" />
                            <p className="text-[11px] text-slate-500 font-medium max-w-[400px] leading-tight">
                                Esta acción reduce la redundancia. El sistema detecta automáticamente qué archivos ya no son necesarios y los borra físicamente del storage.
                            </p>
                        </div>
                        <Button 
                            variant="ghost" 
                            onClick={() => setOpen(false)} 
                            className="text-slate-400 hover:text-slate-600 font-bold"
                        >
                            Cerrar
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

import { AlertCircle } from "lucide-react"
