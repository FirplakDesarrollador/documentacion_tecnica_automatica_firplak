'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PlusCircle, Trash2, Search, ChevronLeft, Loader2, Save, ScanSearch, X } from 'lucide-react'
import Link from 'next/link'
import { upsertGlossaryTermAction, deleteGlossaryTermAction, saveGlossaryTermsAction } from './actions'
import { scanMissingGlossaryTermsAction } from './translation-actions'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from '@/components/ui/label'

interface GlossaryEntry {
    id: string
    term_es: string
    term_en: string
    category: string | null
    created_at: string
}

interface GlossaryClientProps {
    initialData: GlossaryEntry[]
    initialCategories: string[]
}

export default function GlossaryClient({ initialData, initialCategories }: GlossaryClientProps) {
    const [data, setData] = useState<GlossaryEntry[]>(initialData)
    const [categories] = useState<string[]>(() => {
        const defaults = ['TECNICO', 'GENERAL', 'RESOLVED_TYPE', 'MATERIAL', 'ACCESORIO', 'DIMENSION']
        const combined = Array.from(new Set([...defaults, ...initialCategories]))
        return combined.sort()
    })
    const [searchTerm, setSearchTerm] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    
    // Modal state for Add/Edit
    const [modalOpen, setModalOpen] = useState(false)
    const [editingTerm, setEditingTerm] = useState<Partial<GlossaryEntry> & { isNewCategory?: boolean }>({ term_es: '', term_en: '', category: 'GENERAL' })

    // Scanner State
    const [isScanning, setIsScanning] = useState(false)
    const [scannerModalOpen, setScannerModalOpen] = useState(false)
    const [missingTerms, setMissingTerms] = useState<{ term: string, count: number, translation: string, category: string, isNewCategory: boolean, kind?: 'RESOLVED_TYPE' | 'OTHER' }[]>([])
    const [isSavingScan, setIsSavingScan] = useState(false)

    const normalizeMissingTerm = (raw: string): { term: string, kind: 'RESOLVED_TYPE' | 'OTHER', defaultCategory: string } => {
        const upper = String(raw || '').trim().toUpperCase()
        const resolvedTypePrefix = 'RESOLVED_TYPE_MISSING:'
        if (upper.startsWith(resolvedTypePrefix)) {
            return {
                term: upper.slice(resolvedTypePrefix.length).trim(),
                kind: 'RESOLVED_TYPE',
                defaultCategory: 'RESOLVED_TYPE'
            }
        }
        return { term: upper, kind: 'OTHER', defaultCategory: 'GENERAL' }
    }

    const filteredData = data.filter(item => 
        item.term_es.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.term_en.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleOpenModal = (term: Partial<GlossaryEntry> | null = null) => {
        setEditingTerm(term || { term_es: '', term_en: '', category: 'GENERAL', isNewCategory: false })
        setModalOpen(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingTerm?.term_es || !editingTerm?.term_en) {
            toast.error("Ambos términos son obligatorios")
            return
        }

        setIsSaving(true)
        try {
            await upsertGlossaryTermAction({
              id: editingTerm.id,
              term_es: editingTerm.term_es!,
              term_en: editingTerm.term_en!,
              category: editingTerm.category ?? undefined,
            })
            toast.success("Término guardado correctamente")
            setModalOpen(false)
            // Re-fetch or update local state (for now update local state optimistically or re-fetch)
            // Revalidation handles the actual data, but locally we can refresh
            window.location.reload() 
        } catch (error) {
            console.error(error)
            toast.error("Error al guardar")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Seguro que deseas eliminar este término?")) return
        setIsDeleting(id)
        try {
            await deleteGlossaryTermAction(id)
            setData(prev => prev.filter(t => t.id !== id))
            toast.success("Término eliminado")
        } catch (error) {
            console.error(error)
            toast.error("Error al eliminar")
        } finally {
            setIsDeleting(null)
        }
    }

    const handleScanMissingTerms = async () => {
        setIsScanning(true)
        try {
            const res = await scanMissingGlossaryTermsAction()
            if (res.success && res.missingTerms) {
                if (res.missingTerms.length === 0) {
                    toast.success("¡Excelente! No se encontraron términos faltantes en el catálogo.")
                } else {
                    setMissingTerms(res.missingTerms.map(m => {
                        const n = normalizeMissingTerm(m.term)
                        return { term: n.term, count: m.count, translation: '', category: n.defaultCategory, isNewCategory: false, kind: n.kind }
                    }))
                    setScannerModalOpen(true)
                }
            } else {
                toast.error(res.error || "Error al escanear conflictos")
            }
        } catch (error) {
            console.error(error)
            toast.error("Error al escanear conflictos")
        } finally {
            setIsScanning(false)
        }
    }

    const handleSaveScan = async () => {
        const termsToSave = missingTerms.filter(t => t.translation.trim() !== '')
        if (termsToSave.length === 0) {
            toast.error("Ingresa al menos una traducción para guardar")
            return
        }

        setIsSavingScan(true)
        try {
            const payload = termsToSave.map(t => ({
                term_es: t.term,
                term_en: t.translation.toUpperCase(),
                category: t.kind === 'RESOLVED_TYPE' ? 'RESOLVED_TYPE' : t.category,
                priority: t.kind === 'RESOLVED_TYPE' ? 20 : 10
            }))
            const res = await saveGlossaryTermsAction(payload)
            if (res.success) {
                toast.success(res.message)
                setScannerModalOpen(false)
                window.location.reload()
            } else {
                toast.error(res.message)
            }
        } catch (error) {
            console.error(error)
            toast.error("Error al guardar términos")
        } finally {
            setIsSavingScan(false)
        }
    }

    return (
        <div className="flex flex-col gap-6 p-2">
            <div className="flex items-center justify-between gap-4">
            <div>
                    <Link
                        href="/configuration"
                        className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm mb-2 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" /> Volver a Configuración
                    </Link>
                    <h1 className="text-3xl font-bold text-slate-900">
                        Glosario Técnico
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Define traducciones precisas para términos específicos de Firplak.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleScanMissingTerms} disabled={isScanning} variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 shadow-sm">
                        {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
                        Escanear Conflictos
                    </Button>
                    <Button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 shadow-sm">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Nuevo Término
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-2 p-1 bg-white border rounded-lg shadow-sm">
                <Search className="ml-3 h-4 w-4 text-muted-foreground font-bold" />
                <Input 
                    placeholder="Buscar término en español o inglés..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border-0 focus-visible:ring-0 text-sm italic"
                />
            </div>

            <div className="bg-white rounded-xl border shadow-premium overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="font-bold uppercase text-[10px]">Término (ES)</TableHead>
                            <TableHead className="font-bold uppercase text-[10px]">Traducción (EN)</TableHead>
                            <TableHead className="font-bold uppercase text-[10px]">Categoría</TableHead>
                            <TableHead className="text-right font-bold uppercase text-[10px]">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">
                                    No se encontraron términos.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredData.map((item) => (
                                <TableRow key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                    <TableCell className="font-bold text-slate-900 border-r border-slate-100">{item.term_es}</TableCell>
                                    <TableCell className="text-blue-700 font-medium italic">{item.term_en}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">
                                            {item.category || 'GENERAL'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => handleOpenModal(item)}
                                                className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
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
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingTerm?.id ? 'Editar Término' : 'Nuevo Término'}</DialogTitle>
                        <DialogDescription>
                            Asegúrate de que el término esté en MAYÚSCULAS para mayor consistencia SAP.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="term_es">Término en Español</Label>
                            <Input 
                                id="term_es" 
                                value={editingTerm?.term_es || ''} 
                                onChange={(e) => setEditingTerm(prev => ({ ...prev!, term_es: e.target.value.toUpperCase() }))}
                                placeholder="E.g. MUEBLE BASICO"
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="term_en">Traducción al Inglés</Label>
                            <Input 
                                id="term_en" 
                                value={editingTerm?.term_en || ''} 
                                onChange={(e) => setEditingTerm(prev => ({ ...prev!, term_en: e.target.value.toUpperCase() }))}
                                placeholder="E.g. BASIC CABINET"
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="category">Categoría</Label>
                            {editingTerm?.isNewCategory ? (
                                <div className="flex gap-2">
                                    <Input 
                                        placeholder="Nombre de nueva categoría..."
                                        value={editingTerm?.category || ''}
                                        onChange={(e) => setEditingTerm(prev => ({ ...prev!, category: e.target.value.toUpperCase() }))}
                                        className="flex-1"
                                        autoFocus
                                    />
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => setEditingTerm(prev => ({ ...prev!, isNewCategory: false, category: 'GENERAL' }))}
                                    >
                                        Cancelar
                                    </Button>
                                </div>
                            ) : (
                                <Select
                                    value={editingTerm?.category || 'GENERAL'}
                                    onValueChange={(val) => {
                                        if (val === 'ADD_NEW') {
                                            setEditingTerm(prev => ({ ...prev!, isNewCategory: true, category: '' }))
                                        } else {
                                            setEditingTerm(prev => ({ ...prev!, category: val }))
                                        }
                                    }}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Selecciona una categoría" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories.map(cat => (
                                            <SelectItem key={cat} value={cat}>
                                                {cat}
                                            </SelectItem>
                                        ))}
                                        <div className="border-t my-1" />
                                        <SelectItem value="ADD_NEW" className="text-blue-600 font-bold">
                                            + AGREGAR NUEVA...
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                        <DialogFooter className="mt-4">
                            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Término
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={scannerModalOpen} onOpenChange={setScannerModalOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Conflictos de Traducción Encontrados</DialogTitle>
                        <DialogDescription>
                            Se encontraron {missingTerms.length} términos en el catálogo que no tienen traducción en el glosario.
                            Ingresa su traducción al inglés para resolver los conflictos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto border rounded-md my-4">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <TableRow>
                                    <TableHead className="w-[300px] font-bold text-xs uppercase">Término en Español</TableHead>
                                    <TableHead className="w-[80px] font-bold text-xs uppercase text-center">Frecuencia</TableHead>
                                    <TableHead className="font-bold text-xs uppercase">Traducción (EN)</TableHead>
                                    <TableHead className="w-[150px] font-bold text-xs uppercase">Categoría</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {missingTerms.map((item, index) => (
                                    <TableRow key={index} className="hover:bg-slate-50/50">
                                        <TableCell className="font-bold text-sm text-slate-800">{item.term}</TableCell>
                                        <TableCell className="text-center text-slate-500 font-medium">
                                            <Badge variant="outline">{item.count}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Input 
                                                value={item.translation}
                                                onChange={(e) => {
                                                    const newTerms = [...missingTerms]
                                                    newTerms[index].translation = e.target.value.toUpperCase()
                                                    setMissingTerms(newTerms)
                                                }}
                                                placeholder="Ej: BASIC CABINET"
                                                className="h-8 text-xs font-mono"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {item.isNewCategory ? (
                                                <div className="flex gap-1">
                                                    <Input 
                                                        value={item.category}
                                                        onChange={(e) => {
                                                            const newTerms = [...missingTerms]
                                                            newTerms[index].category = e.target.value.toUpperCase()
                                                            setMissingTerms(newTerms)
                                                        }}
                                                        placeholder="NUEVA CAT..."
                                                        className="h-8 text-xs"
                                                        autoFocus
                                                    />
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-8 px-1"
                                                        onClick={() => {
                                                            const newTerms = [...missingTerms]
                                                            newTerms[index].isNewCategory = false
                                                            newTerms[index].category = item.kind === 'RESOLVED_TYPE' ? 'RESOLVED_TYPE' : 'GENERAL'
                                                            setMissingTerms(newTerms)
                                                        }}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Select
                                                    disabled={item.kind === 'RESOLVED_TYPE'}
                                                    value={item.category}
                                                    onValueChange={(val) => {
                                                        if (!val) return
                                                        if (item.kind === 'RESOLVED_TYPE') return
                                                        const newTerms = [...missingTerms]
                                                        if (val === 'ADD_NEW') {
                                                            newTerms[index].isNewCategory = true
                                                            newTerms[index].category = ''
                                                        } else {
                                                            newTerms[index].category = val
                                                        }
                                                        setMissingTerms(newTerms)
                                                    }}
                                                >
                                                    <SelectTrigger className="h-8 text-xs">
                                                        <SelectValue placeholder="Categoría" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {categories.map(cat => (
                                                            <SelectItem key={cat} value={cat}>
                                                                {cat}
                                                            </SelectItem>
                                                        ))}
                                                        <div className="border-t my-1" />
                                                        <SelectItem value="ADD_NEW" className="text-blue-600 font-bold text-[10px]">
                                                            + NUEVA...
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setScannerModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveScan} className="bg-amber-600 hover:bg-amber-700 text-white" disabled={isSavingScan}>
                            {isSavingScan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Guardar Traducciones ({missingTerms.filter(t => t.translation.trim()).length})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
