'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PlusCircle, Trash2, Search, ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { upsertGlossaryTermAction, deleteGlossaryTermAction } from './actions'
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

interface GlossaryEntry {
    id: string
    term_es: string
    term_en: string
    category: string | null
    created_at: string
}

interface GlossaryClientProps {
    initialData: GlossaryEntry[]
}

export default function GlossaryClient({ initialData }: GlossaryClientProps) {
    const [data, setData] = useState<GlossaryEntry[]>(initialData)
    const [searchTerm, setSearchTerm] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    
    // Modal state for Add/Edit
    const [modalOpen, setModalOpen] = useState(false)
    const [editingTerm, setEditingTerm] = useState<Partial<GlossaryEntry> | null>(null)

    const filteredData = data.filter(item => 
        item.term_es.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.term_en.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleOpenModal = (term: Partial<GlossaryEntry> | null = null) => {
        setEditingTerm(term || { term_es: '', term_en: '', category: 'GENERAL' })
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
            await upsertGlossaryTermAction(editingTerm as any)
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

    return (
        <div className="flex flex-col gap-6 p-2">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/products/mass-edit">
                        <Button variant="outline" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Glosario Técnico</h1>
                        <p className="text-muted-foreground italic">
                            Define traducciones precisas para términos específicos de Firplak.
                        </p>
                    </div>
                </div>
                <Button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nuevo Término
                </Button>
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
                            <Input 
                                id="category" 
                                value={editingTerm?.category || ''} 
                                onChange={(e) => setEditingTerm(prev => ({ ...prev!, category: e.target.value.toUpperCase() }))}
                                placeholder="E.g. GENERAL, MUEBLES, ACCESORIOS"
                            />
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
        </div>
    )
}
