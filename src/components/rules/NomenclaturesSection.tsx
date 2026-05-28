'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Settings2, ArrowRight, Plus, AlertTriangle, Trash2 } from 'lucide-react'
import { NamingRulesManager } from './NamingRulesManager'
import { cn } from '@/lib/utils'
import { addNamingModelAction, deleteNamingModelAction } from '@/app/rules/actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface NomenclaturesSectionProps {
    namingRules: NamingRule[];
    namingModelTypes: string[];
    orphanFamilyTypes: string[];
    orphanModelTypes: string[];
}

interface NamingRule {
    target_value?: string;
    priority?: number;
    condition_expression?: string;
    action_payload?: string;
}

function formatProductTypeLabel(type: string) {
    return type
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase())
}

export function NomenclaturesSection({
    namingRules,
    namingModelTypes,
    orphanFamilyTypes,
    orphanModelTypes,
}: NomenclaturesSectionProps) {
    const [editingType, setEditingType] = useState<string | null>(null)
    const [showAddDialog, setShowAddDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [selectedOrphanType, setSelectedOrphanType] = useState('')
    const [deleteTargetType, setDeleteTargetType] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const router = useRouter()

    // Helper to generate a preview string of the structure
    const generatePreview = (type: string) => {
        const rulesForType = namingRules
            .filter(r => r.target_value === type)
            .sort((a, b) => a.priority - b.priority)
        
        if (rulesForType.length === 0) return <span className="text-slate-400 italic font-mono text-sm">Sin estructura definida</span>

        return (
            <div className="flex flex-wrap gap-1 items-center">
                {rulesForType.map((r, i) => (
                    <div key={i} className="flex items-center gap-1">
                        {r.condition_expression === 'true' ? (
                            <span className="text-orange-600 font-extrabold text-sm select-none break-keep whitespace-nowrap">&quot;{r.action_payload}&quot;</span>
                        ) : (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-bold uppercase tracking-tighter text-[10px] break-keep whitespace-nowrap">
                                {r.action_payload.split('=')[1] || r.action_payload}
                            </Badge>
                        )}
                        {i < rulesForType.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />}
                    </div>
                ))}
            </div>
        )
    }

    const openAddDialog = () => {
        if (orphanFamilyTypes.length === 0) {
            toast.info('No hay product_type huérfanos para crear nuevos modelos')
            return
        }
        setSelectedOrphanType(orphanFamilyTypes[0])
        setShowAddDialog(true)
    }

    const handleCreateModel = async () => {
        if (!selectedOrphanType) return
        setIsSaving(true)
        try {
            await addNamingModelAction(selectedOrphanType)
            toast.success(`Modelo de nomenclatura creado para ${selectedOrphanType}`)
            setShowAddDialog(false)
            router.refresh()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'No fue posible crear el modelo'
            toast.error(message)
        } finally {
            setIsSaving(false)
        }
    }

    const openDeleteDialog = (productType: string) => {
        setDeleteTargetType(productType)
        setShowDeleteDialog(true)
    }

    const handleDeleteModel = async () => {
        if (!deleteTargetType) return
        setIsSaving(true)
        try {
            await deleteNamingModelAction(deleteTargetType)
            toast.success(`Modelo ${deleteTargetType} eliminado`) 
            if (editingType === deleteTargetType) setEditingType(null)
            setShowDeleteDialog(false)
            router.refresh()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'No fue posible eliminar el modelo'
            toast.error(message)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-6 mb-12">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-800">Modelos de Nomenclatura</h2>
                <p className="text-muted-foreground text-sm">
                    Configura las fórmulas exactas para autogenerar los nombres finales de cada familia de producto.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {namingModelTypes.map((productType) => {
                    const isOrphanModel = orphanModelTypes.includes(productType)
                    return (
                    <Card key={productType} className={`border-2 transition-all ${editingType === productType ? 'border-blue-500 shadow-md ring-4 ring-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
                        <CardHeader className="pb-3 bg-slate-50/50">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-1">
                                    <CardTitle className="text-sm font-bold text-slate-900 uppercase tracking-wider">{formatProductTypeLabel(productType)}</CardTitle>
                                    {isOrphanModel && (
                                        <Badge variant="outline" className="w-fit border-amber-300 bg-amber-50 text-amber-700">
                                            Product type sin familias
                                        </Badge>
                                    )}
                                </div>
                                <Button
                                    variant={editingType === productType ? "default" : "secondary"}
                                    size="sm"
                                    onClick={() => setEditingType(editingType === productType ? null : productType)}
                                    className={cn(
                                        "h-8 px-3 text-[11px] font-bold uppercase transition-all shadow-sm",
                                        editingType === productType
                                            ? "bg-indigo-600 hover:bg-indigo-700 text-white" 
                                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-none"
                                    )}
                                >
                                    <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                                    {editingType === productType ? 'Cerrar' : 'Ajustar'}
                                </Button>
                            </div>
                            {isOrphanModel && (
                                <CardDescription className="text-amber-700 text-xs flex items-center gap-1 mt-2">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Puedes eliminar este modelo porque no tiene familias activas.
                                </CardDescription>
                            )}
                        </CardHeader>
                        <CardContent className="pt-4 pb-4">
                            <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-xl w-full min-h-[70px] flex items-center shadow-inner group-hover:bg-white transition-colors">
                                {generatePreview(productType)}
                            </div>
                            {isOrphanModel && (
                                <div className="mt-3 flex justify-end">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-rose-700 border-rose-200 hover:bg-rose-50"
                                        onClick={() => openDeleteDialog(productType)}
                                    >
                                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Eliminar modelo
                                    </Button>
                                </div>
                            )}
                        </CardContent>

                        {editingType === productType && (
                            <NamingRulesManager 
                                open={true}
                                productType={productType}
                                onClose={() => setEditingType(null)}
                                initialRules={namingRules.filter(r => r.target_value === productType)}
                            />
                        )}
                    </Card>
                )})}

                <Card
                    className="border-2 border-dashed border-slate-300 hover:border-indigo-400 transition-all cursor-pointer min-h-[190px]"
                    onClick={openAddDialog}
                >
                    <CardContent className="h-full flex flex-col items-center justify-center gap-3 text-slate-600">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                            <Plus className="w-6 h-6" />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold">Añadir modelo</p>
                            <p className="text-xs text-muted-foreground">
                                {orphanFamilyTypes.length > 0
                                    ? `${orphanFamilyTypes.length} product_type huérfanos disponibles`
                                    : 'No hay product_type huérfanos disponibles'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Crear modelo de nomenclatura</DialogTitle>
                        <DialogDescription>
                            Solo puedes crear modelos para product_type existentes en familias y que aun no tengan modelo.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Product type huérfano</label>
                        <select
                            value={selectedOrphanType}
                            onChange={(e) => setSelectedOrphanType(e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
                        >
                            {orphanFamilyTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={isSaving}>Cancelar</Button>
                        <Button onClick={handleCreateModel} disabled={isSaving || !selectedOrphanType}>Crear modelo</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminar modelo de nomenclatura</DialogTitle>
                        <DialogDescription>
                            Se eliminaran reglas ES y configuracion EN para <strong>{deleteTargetType}</strong>. Esta accion no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isSaving}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDeleteModel} disabled={isSaving || !deleteTargetType}>Eliminar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
