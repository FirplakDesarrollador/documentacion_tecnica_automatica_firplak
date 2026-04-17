'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PlusCircle, Trash2, Search, ArrowLeft, Loader2, Save, Settings } from 'lucide-react'
import Link from 'next/link'
import { upsertVersionAction, deleteVersionAction } from './actions'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface VersionEntry {
    id: string
    code: string
    description: string
    automatic_rules: any
    notes: string | null
    created_at: string
}

interface VersionsClientProps {
    initialData: VersionEntry[]
}

export default function VersionsClient({ initialData }: VersionsClientProps) {
    const [data, setData] = useState<VersionEntry[]>(initialData)
    const [searchTerm, setSearchTerm] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    
    // Modal state for Add/Edit
    const [modalOpen, setModalOpen] = useState(false)
    const [editingVersion, setEditingVersion] = useState<Partial<VersionEntry> | null>(null)

    const filteredData = data.filter(item => 
        item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleOpenModal = (version: Partial<VersionEntry> | null = null) => {
        setEditingVersion(version || { code: '', description: '', automatic_rules: {}, notes: '' })
        setModalOpen(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingVersion?.code || !editingVersion?.description) {
            toast.error("El código y la descripción son obligatorios")
            return
        }

        setIsSaving(true)
        try {
            const saved = await upsertVersionAction(editingVersion as any)
            toast.success("Versión guardada correctamente")
            setModalOpen(false)
            
            // Refrescar localmente
            if (editingVersion.id) {
                setData(prev => prev.map(v => v.id === editingVersion.id ? saved : v))
            } else {
                setData(prev => [saved, ...prev])
            }
            
            // Opcionalmente recargar para asegurar consistencia del server
            // window.location.reload() 
        } catch (error) {
            console.error(error)
            toast.error("Error al guardar")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Seguro que deseas eliminar esta regla de versión?")) return
        setIsDeleting(id)
        try {
            await deleteVersionAction(id)
            setData(prev => prev.filter(t => t.id !== id))
            toast.success("Versión eliminada")
        } catch (error) {
            console.error(error)
            toast.error("Error al eliminar")
        } finally {
            setIsDeleting(null)
        }
    }

    return (
        <div className="flex flex-col gap-6 p-2">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/rules">
                        <Button variant="outline" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Diccionario de Versiones</h1>
                        <p className="text-muted-foreground italic">
                            Define reglas automáticas basadas en el tercer segmento del SKU (Versión).
                        </p>
                    </div>
                </div>
                <Button onClick={() => handleOpenModal()} className="bg-indigo-600 hover:bg-indigo-700">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nueva Versión
                </Button>
            </div>

            <div className="flex items-center gap-2 p-1 bg-white border rounded-lg shadow-sm">
                <Search className="ml-3 h-4 w-4 text-muted-foreground font-bold" />
                <Input 
                    placeholder="Buscar por código (ej: CHT, MRH) o descripción..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border-0 focus-visible:ring-0 text-sm italic"
                />
            </div>

            <div className="bg-white rounded-xl border shadow-premium overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="font-bold uppercase text-[10px] w-24">Código</TableHead>
                            <TableHead className="font-bold uppercase text-[10px]">Descripción / Accesorios</TableHead>
                            <TableHead className="font-bold uppercase text-[10px]">Reglas Automáticas</TableHead>
                            <TableHead className="text-right font-bold uppercase text-[10px]">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">
                                    No se encontraron versiones.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredData.map((item) => {
                                const hasRules = Object.keys(item.automatic_rules || {}).length > 0;
                                return (
                                    <TableRow key={item.id} className="hover:bg-indigo-50/30 transition-colors">
                                        <TableCell className="font-bold text-slate-900 border-r border-slate-100">
                                            <Badge variant="outline" className="bg-slate-50 text-indigo-700 border-indigo-100 uppercase">
                                                {item.code}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-700 font-medium italic">{item.description}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {item.automatic_rules?.rh && (
                                                    <Badge variant="secondary" className="text-[9px] bg-amber-50 text-amber-700 border-amber-100">
                                                        RH: {item.automatic_rules.rh}
                                                    </Badge>
                                                )}
                                                {item.automatic_rules?.client_name && (
                                                    <Badge variant="secondary" className="text-[9px] bg-blue-50 text-blue-700 border-blue-100">
                                                        CLIENTE: {item.automatic_rules.client_name}
                                                    </Badge>
                                                )}
                                                {!hasRules && <span className="text-[10px] text-slate-400 italic">Sin reglas</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => handleOpenModal(item)}
                                                    className="h-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                                >
                                                    Editar
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => handleDelete(item.id)}
                                                    disabled={isDeleting === item.id}
                                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    {isDeleting === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingVersion?.id ? 'Editar Versión' : 'Nueva Versión'}</DialogTitle>
                        <DialogDescription>
                            Configura el comportamiento automático para este código de versión.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="code" className="text-right">Código SKU</Label>
                            <Input 
                                id="code" 
                                className="col-span-3"
                                value={editingVersion?.code || ''} 
                                onChange={(e) => setEditingVersion(prev => ({ ...prev!, code: e.target.value.toUpperCase() }))}
                                placeholder="E.g. CHT, MRH, 001"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="description" className="text-right">Descripción</Label>
                            <Input 
                                id="description" 
                                className="col-span-3"
                                value={editingVersion?.description || ''} 
                                onChange={(e) => setEditingVersion(prev => ({ ...prev!, description: e.target.value.toUpperCase() }))}
                                placeholder="E.g. CHILEMAT, CROMO 2 LUCES"
                                required
                            />
                        </div>
                        
                        <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                            <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm mb-2">
                                <Settings className="h-4 w-4" />
                                Reglas de Automatización (Opcional)
                            </div>
                            
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right text-xs">Forzar RH</Label>
                                <select 
                                    className="col-span-3 h-9 px-3 py-1 text-sm border rounded-md"
                                    value={editingVersion?.automatic_rules?.rh || ''}
                                    onChange={(e) => setEditingVersion(prev => ({
                                        ...prev!,
                                        automatic_rules: { ...prev!.automatic_rules, rh: e.target.value || undefined }
                                    }))}
                                >
                                    <option value="">No aplicar</option>
                                    <option value="RH">FORZAR RH</option>
                                    <option value="NA">FORZAR SIN RH (NA)</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right text-xs">Forzar Cliente</Label>
                                <Input 
                                    className="col-span-3 h-9"
                                    value={editingVersion?.automatic_rules?.client_name || ''}
                                    onChange={(e) => setEditingVersion(prev => ({
                                        ...prev!,
                                        automatic_rules: { ...prev!.automatic_rules, client_name: e.target.value.toUpperCase() || undefined }
                                    }))}
                                    placeholder="Nombre del cliente"
                                />
                            </div>
                        </div>

                        <DialogFooter className="mt-4">
                            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={isSaving}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Regla
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
