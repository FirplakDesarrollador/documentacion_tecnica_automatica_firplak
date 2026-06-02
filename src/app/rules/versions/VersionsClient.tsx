'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PlusCircle, Trash2, Search, ArrowLeft, Loader2, Save, X } from 'lucide-react'
import Link from 'next/link'
import { upsertVersionAction, deleteVersionAction, previewDeleteVersionAction } from './actions'
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
    automatic_version_rules: Record<string, string>
    product_types: string[]
    status: string | null
    created_at: string
    updated_at: string
}

interface VersionsClientProps {
    initialData: VersionEntry[]
    productTypes: string[]
}

const OVERRIDE_FIELDS: { key: string; label: string; group: string; type: 'text' | 'number' | 'select'; options?: string[] }[] = [
    { key: 'rh', label: 'Material RH', group: 'Material', type: 'select', options: ['NA', 'RH'] },
    { key: 'bisagras', label: 'Bisagras', group: 'Material', type: 'text' },
    { key: 'carb2', label: 'CARB2', group: 'Material', type: 'text' },
    { key: 'canto_puertas', label: 'Canto Puertas', group: 'Material', type: 'text' },
    { key: 'accessory_text', label: 'Accesorios', group: 'Material', type: 'text' },
    { key: 'door_color_text', label: 'Color Puerta', group: 'Material', type: 'text' },
    { key: 'armado_con_lvm', label: 'Armado con LVM', group: 'Material', type: 'text' },
    { key: 'pur', label: 'PUR', group: 'Material', type: 'text' },
    { key: 'special_label', label: 'Etiqueta Especial', group: 'Etiquetas', type: 'text' },
    { key: 'version_label', label: 'Etiqueta de Versión', group: 'Etiquetas', type: 'text' },
    { key: 'private_label_client_name', label: 'Cliente / Marca Propia', group: 'Marca Propia', type: 'text' },
    { key: 'width_cm', label: 'Ancho (cm)', group: 'Dimensiones', type: 'number' },
    { key: 'depth_cm', label: 'Fondo (cm)', group: 'Dimensiones', type: 'number' },
    { key: 'height_cm', label: 'Alto (cm)', group: 'Dimensiones', type: 'number' },
    { key: 'weight_kg', label: 'Peso (kg)', group: 'Dimensiones', type: 'number' },
]

const OVERRIDE_GROUPS = Array.from(new Set(OVERRIDE_FIELDS.map(f => f.group)))

export default function VersionsClient({ initialData, productTypes }: VersionsClientProps) {
    const [data, setData] = useState<VersionEntry[]>(initialData)
    const [searchTerm, setSearchTerm] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    
    // Modal state for Add/Edit
    const [modalOpen, setModalOpen] = useState(false)
    const [editingVersion, setEditingVersion] = useState<Partial<VersionEntry> & { isNew?: boolean } | null>(null)

    // Delete preview state
    const [deletePreview, setDeletePreview] = useState<{
        version_code: string
        versionCount: number
        skuCount: number
    } | null>(null)

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
        const vc = editingVersion?.version_code || ''
        if (!vc || !/^[A-Z0-9]{3}$/.test(vc)) {
            toast.error("Código de versión inválido", {
                description: "Debe tener exactamente 3 caracteres alfanuméricos (A-Z, 0-9), sin tildes ni caracteres especiales."
            })
            return
        }
        if (!editingVersion?.version_description) {
            toast.error("La descripción es obligatoria")
            return
        }

        setIsSaving(true)
        try {
            const saved = await upsertVersionAction({
                version_code: editingVersion.version_code!,
                version_description: editingVersion.version_description!,
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
        setIsDeleting(version_code)
        try {
            const preview = await previewDeleteVersionAction(version_code)
            if (preview.versionCount > 0 || preview.skuCount > 0) {
                setDeletePreview(preview)
                return
            }
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

    const handleConfirmDelete = async () => {
        if (!deletePreview) return
        setIsDeleting(deletePreview.version_code)
        try {
            await deleteVersionAction(deletePreview.version_code)
            setData(prev => prev.filter(t => t.version_code !== deletePreview.version_code))
            toast.success(`Versión eliminada (${deletePreview.versionCount} versiones y ${deletePreview.skuCount} SKU(s) afectados)`)
            setDeletePreview(null)
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
                    <Link href="/configuration">
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
                            <TableHead className="font-bold uppercase text-[10px]">Tipos de Producto</TableHead>
                            <TableHead className="font-bold uppercase text-[10px] w-20">Estado</TableHead>
                            <TableHead className="text-right font-bold uppercase text-[10px]">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
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
                                                {hasRules
                                                    ? Object.entries(rules).map(([key, val]) => {
                                                        const field = OVERRIDE_FIELDS.find(f => f.key === key)
                                                        const label = field?.label || key
                                                        return (
                                                            <Badge key={key} variant="secondary" className="text-[9px] bg-amber-50 text-amber-700 border-amber-100">
                                                                {label}: {String(val)}
                                                            </Badge>
                                                        )
                                                    })
                                                    : <span className="text-[10px] text-slate-400 italic">Sin reglas</span>
                                                }
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {Array.isArray(item.product_types) && item.product_types.length > 0
                                                    ? item.product_types.map(pt => (
                                                        <Badge key={pt} variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-200">
                                                            {pt}
                                                        </Badge>
                                                    ))
                                                    : <span className="text-[10px] text-slate-400 italic">Sin tipos</span>
                                                }
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
                                className="col-span-3 font-mono font-bold tracking-widest"
                                value={editingVersion?.version_code || ''} 
                                onChange={(e) => {
                                    const raw = e.target.value.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 3)
                                    setEditingVersion(prev => ({ ...prev!, version_code: raw }))
                                }}
                                placeholder="E.g. CHT, MRH, 001"
                                maxLength={3}
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

                        <div className="grid gap-3">
                            <Label className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Tipos de Producto Asociados</Label>
                            <div className="flex flex-wrap gap-3 p-3 bg-white rounded-xl border border-slate-200/50">
                                {productTypes.length === 0 ? (
                                    <span className="text-xs text-slate-400 italic">Cargando tipos...</span>
                                ) : (
                                    productTypes.map(pt => (
                                        <label key={pt} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={(editingVersion?.product_types as string[] | undefined)?.includes(pt) || false}
                                                onChange={() => {
                                                    const current = (editingVersion?.product_types as string[]) || []
                                                    setEditingVersion(prev => ({
                                                        ...prev!,
                                                        product_types: current.includes(pt)
                                                            ? current.filter(t => t !== pt)
                                                            : [...current, pt]
                                                    }))
                                                }}
                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-xs font-medium text-slate-700">{pt}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                        
                        <div className="border rounded-xl p-4 bg-white border-slate-200 space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-extrabold text-indigo-800 uppercase tracking-wider">Reglas de Automatización (Override por Versión)</Label>
                                <select
                                    className="text-xs h-8 px-2 border border-indigo-200 rounded-md bg-white text-indigo-700 font-medium"
                                    value=""
                                    onChange={(e) => {
                                        const key = e.target.value
                                        if (!key) return
                                        const rules = editingVersion?.automatic_version_rules || {}
                                        if (rules[key] !== undefined) return
                                        const field = OVERRIDE_FIELDS.find(f => f.key === key)
                                        let defaultVal = ''
                                        if (field?.type === 'select' && field.options) defaultVal = field.options[0]
                                        setEditingVersion(prev => ({
                                            ...prev!,
                                            automatic_version_rules: { ...(prev!.automatic_version_rules || {}), [key]: defaultVal }
                                        }))
                                    }}
                                >
                                    <option value="">+ Agregar Override</option>
                                    {OVERRIDE_GROUPS.map(group => (
                                        <optgroup key={group} label={group}>
                                            {OVERRIDE_FIELDS
                                                .filter(f => f.group === group)
                                                .filter(f => (editingVersion?.automatic_version_rules || {})[f.key] === undefined)
                                                .map(f => (
                                                    <option key={f.key} value={f.key}>{f.label}</option>
                                                ))
                                            }
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                            {Object.keys(editingVersion?.automatic_version_rules || {}).length === 0 && (
                                <p className="text-[11px] text-slate-400 italic text-center py-2">
                                    Sin overrides. Usa el selector de arriba para agregar reglas.
                                </p>
                            )}
                            <div className="space-y-3">
                                {Object.entries(editingVersion?.automatic_version_rules || {}).map(([key, value]) => {
                                    const field = OVERRIDE_FIELDS.find(f => f.key === key)
                                    if (!field) return null
                                    return (
                                        <div key={key} className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-200">
                                            <Label className="text-xs font-bold text-slate-600 w-36 shrink-0">{field.label}</Label>
                                            {field.type === 'select' && field.options ? (
                                                <select
                                                    className="flex-1 h-9 px-2 border border-indigo-200 rounded-md bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={String(value)}
                                                    onChange={(e) => setEditingVersion(prev => ({
                                                        ...prev!,
                                                        automatic_version_rules: { ...(prev!.automatic_version_rules || {}), [key]: e.target.value }
                                                    }))}
                                                >
                                                    {field.options.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type={field.type}
                                                    className="flex-1 h-9 px-3 border border-indigo-200 rounded-md bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={String(value)}
                                                    onChange={(e) => setEditingVersion(prev => ({
                                                        ...prev!,
                                                        automatic_version_rules: { ...(prev!.automatic_version_rules || {}), [key]: e.target.value }
                                                    }))}
                                                />
                                            )}
                                            <button
                                                type="button"
                                                className="text-red-400 hover:text-red-600 text-lg leading-none px-1"
                                                onClick={() => {
                                                    const rules = { ...(editingVersion?.automatic_version_rules || {}) }
                                                    delete rules[key]
                                                    setEditingVersion(prev => ({ ...prev!, automatic_version_rules: rules }))
                                                }}
                                            ><X className="h-4 w-4" /></button>
                                        </div>
                                    )
                                })}
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

            {/* Delete Preview Dialog */}
            <Dialog open={!!deletePreview} onOpenChange={(open) => { if (!open) setDeletePreview(null) }}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600 font-bold">
                            <Trash2 className="h-5 w-5" />
                            Eliminar versión &quot;{deletePreview?.version_code}&quot;
                        </DialogTitle>
                        <DialogDescription>
                            Esta versión global tiene registros asociados en el catálogo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                        <div className="bg-slate-50 p-4 rounded-lg border text-center">
                            <p className="text-slate-500 text-sm font-medium">Versiones en catálogo</p>
                            <p className="text-3xl font-bold text-red-600 mt-1">{deletePreview?.versionCount ?? 0}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-lg border text-center">
                            <p className="text-slate-500 text-sm font-medium">SKUs asociados</p>
                            <p className="text-3xl font-bold text-orange-600 mt-1">{deletePreview?.skuCount ?? 0}</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600 bg-amber-50 p-3 rounded border border-amber-200">
                        Se eliminarán todos estos registros de forma permanente.
                    </p>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setDeletePreview(null)}>Cancelar</Button>
                        <Button onClick={handleConfirmDelete} disabled={isDeleting !== null} className="bg-red-600 hover:bg-red-700 text-white font-semibold">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Eliminar todo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
