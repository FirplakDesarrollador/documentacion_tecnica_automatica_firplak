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
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "@/components/ui/table"
import { 
    Lightbulb, 
    Loader2, 
    CheckCircle2, 
    CheckSquare,
    Square
} from "lucide-react"
import { 
    getIsometricSuggestionsAction, 
    applySmartAssociationsAction,
    IsometricSuggestion
} from "@/app/assets/smart-association-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function SmartIsometricSuggestionsDialog() {
    const [open, setOpen] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)
    const [suggestions, setSuggestions] = React.useState<IsometricSuggestion[]>([])
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

    const loadSuggestions = React.useCallback(async () => {
        setLoading(true)
        try {
            const data = await getIsometricSuggestionsAction()
            setSuggestions(data)
            // Select all by default if they are very_high or high
            const initialSelected = new Set(
                data.filter(s => s.matchLevel !== 'medium').map(s => s.missingReferenceId)
            )
            setSelectedIds(initialSelected)
        } catch {
            toast.error("Error al cargar sugerencias")
        } finally {
            setLoading(false)
        }
    }, [])

    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen) {
            void loadSuggestions()
        } else {
            setSuggestions([])
            setSelectedIds(new Set())
            setLoading(false)
            setSubmitting(false)
        }
        setOpen(nextOpen)
    }

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === suggestions.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(suggestions.map(s => s.missingReferenceId)))
        }
    }

    const handleApply = async () => {
        if (selectedIds.size === 0) return

        setSubmitting(true)
        try {
            const selectedSuggestions = suggestions.filter(s => selectedIds.has(s.missingReferenceId))
            const payload = selectedSuggestions.map(s => ({
                skuId: s.missingReferenceId,
                assetId: s.suggestedAssetId,
                path: s.suggestedPath
            }))

            const result = await applySmartAssociationsAction(payload)
            toast.success(`Se asociaron correctamente ${result.count} isométricos`)
            setOpen(false)
        } catch {
            toast.error("Error al aplicar asociaciones")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger
                className={cn(
                    buttonVariants({ variant: "outline", className: "gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 shadow-sm transition-all h-10 px-4" })
                )}
            >
                <Lightbulb className="h-4 w-4" />
                Sugerencias Inteligentes
            </DialogTrigger>
            <DialogContent className="sm:max-w-[50vw] w-full p-0 bg-white border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="p-6 pb-2 shrink-0">
                    <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-amber-500" />
                        Sugerencias de Asociación Inteligente
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        El sistema ha detectado productos sin isométrico que son compatibles con otros ya existentes.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-0 border-y border-slate-100 min-h-[500px]">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <p className="text-sm font-medium">Buscando compatibilidades...</p>
                        </div>
                    ) : suggestions.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400 p-8 text-center">
                            <CheckCircle2 className="h-10 w-10 text-emerald-500/50" />
                            <div>
                                <p className="text-slate-900 font-semibold">No hay sugerencias nuevas</p>
                                <p className="text-sm">Todos los productos sin isométrico parecen ser únicos o no tienen un par compatible.</p>
                            </div>
                        </div>
                    ) : (
                        <Table className="table-fixed w-full border-collapse">
                            <TableHeader className="bg-slate-50/50 sticky top-0 z-10 shadow-sm">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[60px] text-center py-4">
                                        <Button variant="ghost" size="icon" onClick={toggleSelectAll} className="h-8 w-8">
                                            {selectedIds.size === suggestions.length ? (
                                                <CheckSquare className="h-5 w-5 text-indigo-600" />
                                            ) : (
                                                <Square className="h-5 w-5 text-slate-400" />
                                            )}
                                        </Button>
                                    </TableHead>
                                    <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500 py-4">
                                        Comparativa de Productos (Objetivo vs Origen)
                                    </TableHead>
                                    <TableHead className="w-[180px] text-center uppercase tracking-wider text-[10px] font-bold text-slate-500 py-4 border-l border-slate-100">
                                        Isométrico
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suggestions.map((s) => (
                                    <TableRow 
                                        key={s.missingReferenceId} 
                                        className={cn(
                                            "transition-colors group",
                                            selectedIds.has(s.missingReferenceId) ? "bg-indigo-50/40 hover:bg-indigo-50/60" : "hover:bg-slate-50/50"
                                        )}
                                    >
                                        <TableCell className="text-center align-top pt-8 w-[60px]">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={() => toggleSelection(s.missingReferenceId)}
                                                className="h-10 w-10"
                                            >
                                                {selectedIds.has(s.missingReferenceId) ? (
                                                    <CheckSquare className="h-6 w-6 text-indigo-600" />
                                                ) : (
                                                    <Square className="h-6 w-6 text-slate-300" />
                                                )}
                                            </Button>
                                        </TableCell>
                                        <TableCell className="py-8 pr-6 align-top">
                                            <div className="flex flex-col gap-6 w-full overflow-hidden">
                                                {/* FALTANTE (OBJETIVO) */}
                                                <div className="relative pl-6 border-l-2 border-slate-200 group-hover:border-indigo-300 transition-colors">
                                                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-slate-300 group-hover:bg-indigo-400" />
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-sans">Producto sin Isométrico (Objetivo)</p>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-900 text-base leading-snug mb-2 uppercase tracking-tight break-words whitespace-normal">
                                                            {s.missingName}
                                                        </span>
                                                        <span className="text-sm text-slate-500 font-mono font-medium bg-slate-100 px-2 py-0.5 rounded self-start border border-slate-200">
                                                            {s.missingCode}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* BADGE COMPATIBILIDAD */}
                                                <div className="flex items-center gap-4 py-1">
                                                    <div className="h-[1px] flex-1 bg-slate-100" />
                                                    <div className="flex-none">
                                                        {s.matchLevel === 'very_high' && (
                                                            <Badge className="bg-emerald-500 text-white border-none text-[10px] px-3 py-1 font-bold uppercase tracking-wider shadow-sm">Muy Alta</Badge>
                                                        )}
                                                        {s.matchLevel === 'high' && (
                                                            <Badge className="bg-blue-500 text-white border-none text-[10px] px-3 py-1 font-bold uppercase tracking-wider shadow-sm">Alta</Badge>
                                                        )}
                                                        {s.matchLevel === 'medium' && (
                                                            <Badge className="bg-amber-500 text-white border-none text-[10px] px-3 py-1 font-bold uppercase tracking-wider shadow-sm">Media</Badge>
                                                        )}
                                                    </div>
                                                    <div className="h-[1px] flex-1 bg-slate-100" />
                                                </div>

                                                {/* SUGERIDO (ORIGEN) */}
                                                <div className="relative pl-6 border-l-2 border-indigo-400 bg-indigo-50/20 p-4 rounded-r-lg">
                                                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-indigo-500" />
                                                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-2 font-sans">Producto con Isométrico (Origen Sugerido)</p>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-indigo-900 text-base leading-snug mb-2 uppercase tracking-tight break-words whitespace-normal">
                                                            {s.suggestedSourceName}
                                                        </span>
                                                        <span className="text-sm text-indigo-700 font-mono font-medium bg-white px-2 py-0.5 rounded self-start border border-indigo-100 shadow-sm">
                                                            {s.suggestedSourceCode}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center align-top pt-8 border-l border-slate-50 bg-slate-50/30 group-hover:bg-slate-50/60 transition-colors w-[180px]">
                                            <div className="flex flex-col items-center gap-4 sticky top-24">
                                                <div className="relative w-24 h-24 rounded-xl bg-white border-2 border-slate-200 overflow-hidden flex items-center justify-center shadow-lg group-hover:border-indigo-400 transition-all">
                                                    <Image
                                                        src={s.suggestedPath}
                                                        alt="preview"
                                                        fill
                                                        unoptimized
                                                        sizes="96px"
                                                        className="object-contain"
                                                    />
                                                </div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Previsualización</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <DialogFooter className="p-6 bg-white border-t border-slate-100 shrink-0">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                            {selectedIds.size > 0 && (
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold text-indigo-600 leading-none">{selectedIds.size}</span>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Seleccionados</span>
                                </div>
                            )}
                            <div className="h-8 w-[1px] bg-slate-100" />
                            <p className="text-[11px] text-slate-500 font-medium max-w-[300px] leading-tight">
                                Verifica que las descripciones coincidan antes de confirmar la asociación masiva.
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <Button 
                                variant="ghost" 
                                onClick={() => setOpen(false)} 
                                disabled={submitting}
                                className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 px-6"
                            >
                                Cancelar
                            </Button>
                            <Button 
                                onClick={handleApply} 
                                disabled={selectedIds.size === 0 || submitting}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-10 h-12 shadow-xl shadow-indigo-200 transition-all active:scale-95 text-base"
                            >
                                {submitting ? (
                                    <Loader2 className="h-5 w-5 animate-spin mr-3" />
                                ) : (
                                    <CheckCircle2 className="h-5 w-5 mr-3" />
                                )}
                                {submitting ? "Asociando..." : "Confirmar Asociación"}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
