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
    version_code: string
    version_description: string
    automatic_version_rules: any
    product_types: string[] | any
    status: string | null
    created_at: string
    updated_at: string
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
    const [editingVersion, setEditingVersion] = useState<Partial<VersionEntry> & { isNew?: boolean } | null>(null)

    const filteredData = data.filter(item => 
        item.version_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.version_description.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleOpenModal = (version: Partial<VersionEntry> | null = null) => {
        if (version) {
            setEditingVersion({ ...version, isNew: false })
        } else {
            setEditingVersion({ version_code: '', version_description: '', automatic_version_rules: {}, product_types: [], status: 'ACTIVO', isNew: true })
        }
        setModalOpen(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingVersion?.version_code || !editingVersion?.version_description) {
            toast.error("El código y la descripción son obligatorios")
            return
        }

        setIsSaving(true)
        try {
            const saved = await upsertVersionAction({
                version_code: editingVersion.version_code,
                version_description: editingVersion.version_description,
                automatic_version_rules: editingVersion.automatic_version_rules,
                status: editingVersion.status || 'ACTIVO',
                product_types: editingVersion.product_types || [],
                isNew: editingVersion.isNew,
            })
            toast.success("Versión guardada correctamente")
            setModalOpen(false)
            
            // Refrescar localmente
            if (!editingVersion.isNew) {
                setData(prev => prev.map(v => v.version_code === editingVersion.version_code ? saved : v))
            } else {
                setData(prev => [saved, ...prev])
            }
        } catch (error) {
            console.error(error)
            toast.error("Error al guardar")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (version_code: string) => {
        if (!confirm("¿Seguro que deseas eliminar esta regla de versión?")) return
        setIsDeleting(version_code)
        try {
            await deleteVersionAction(version_code)
            setData(prev => prev.filter(t => t.version_code !== version_code))
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
                            <TableHead className="font-bold uppercase text-[10px] w-20">Estado</TableHead>
                            <TableHead className="text-right font-bold uppercase text-[10px]">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                                    No se encontraron versiones.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredData.map((item) => {
                                const rules = item.automatic_version_rules || {};
                                const hasRules = Object.keys(rules).length > 0;
                                return (
                                    <TableRow key={item.version_code} className="hover:bg-indigo-50/30 transition-colors">
                                        <TableCell className="font-bold text-slate-900 border-r border-slate-100">
                                            <Badge variant="outline" className="bg-slate-50 text-indigo-700 border-indigo-100 uppercase">
                                                {item.version_code}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-700 font-medium italic">{item.version_description}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {rules?.rh && (
                                                    <Badge variant="secondary" className="text-[9px] bg-amber-50 text-amber-700 border-amber-100">
                                                        RH: {rules.rh}
                                                    </Badge>
                                                )}
                                                {rules?.client_name && (
                                                    <Badge variant="secondary" className="text-[9px] bg-blue-50 text-blue-700 border-blue-100">
                                                        CLIENTE: {rules.client_name}
                                                    </Badge>
                                                )}
                                                {!hasRules && <span className="text-[10px] text-slate-400 italic">Sin reglas</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={item.status === 'ACTIVO' ? 'default' : 'secondary'}
                                                className={item.status === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]' : 'text-[9px]'}>
                                                {item.status || 'ACTIVO'}
                                            </Badge>
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
                                                    onClick={() => handleDelete(item.version_code)}
                                                    disabled={isDeleting === item.version_code}
                                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    {isDeleting === item.version_code ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                        <DialogTitle>{editingVersion?.isNew ? 'Nueva Versión' : 'Editar Versión'}</DialogTitle>
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
                                value={editingVersion?.version_code || ''} 
                                onChange={(e) => setEditingVersion(prev => ({ ...prev!, version_code: e.target.value.toUpperCase() }))}
                                placeholder="E.g. CHT, MRH, 001"
                                required
                                disabled={!editingVersion?.isNew}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="description" className="text-right">Descripción</Label>
                            <Input 
                                id="description" 
                                className="col-span-3"
                                value={editingVersion?.version_description || ''} 
                                onChange={(e) => setEditingVersion(prev => ({ ...prev!, version_description: e.target.value.toUpperCase() }))}
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
                                    value={editingVersion?.automatic_version_rules?.rh || ''}
                                    onChange={(e) => setEditingVersion(prev => ({
                                        ...prev!,
                                        automatic_version_rules: { ...prev!.automatic_version_rules, rh: e.target.value || undefined }
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
                                    value={editingVersion?.automatic_version_rules?.client_name || ''}
                                    onChange={(e) => setEditingVersion(prev => ({
                                        ...prev!,
                                        automatic_version_rules: { ...prev!.automatic_version_rules, client_name: e.target.value.toUpperCase() || undefined }
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
