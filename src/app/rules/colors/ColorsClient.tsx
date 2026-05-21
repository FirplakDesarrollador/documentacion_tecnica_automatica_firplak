'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PlusCircle, Trash2, Search, ArrowLeft, Loader2, Save, Palette } from 'lucide-react'
import Link from 'next/link'
import { upsertColorAction, deleteColorAction } from './actions'
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

interface ColorEntry {
    code_4dig: string
    name_color_sap: string
}

interface ColorsClientProps {
    initialData: ColorEntry[]
}

export default function ColorsClient({ initialData }: ColorsClientProps) {
    const [data, setData] = useState<ColorEntry[]>(initialData)
    const [searchTerm, setSearchTerm] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    
    // Modal state for Add/Edit
    const [modalOpen, setModalOpen] = useState(false)
    const [editingColor, setEditingColor] = useState<Partial<ColorEntry> & { isNew?: boolean } | null>(null)

    const filteredData = data.filter(item => 
        item.code_4dig.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.name_color_sap?.toLowerCase?.().includes(searchTerm.toLowerCase()) ?? false)
    )

    const handleOpenModal = (color: Partial<ColorEntry> | null = null) => {
        if (color) {
            setEditingColor({ ...color, isNew: false })
        } else {
            setEditingColor({ code_4dig: '', name_color_sap: '', isNew: true })
        }
        setModalOpen(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingColor?.code_4dig || !editingColor?.name_color_sap) {
            toast.error("El código y el nombre SAP son obligatorios")
            return
        }

        const code = editingColor.code_4dig.trim().toUpperCase()
        const name = editingColor.name_color_sap.trim().toUpperCase()

        if (code.length === 0) {
            toast.error("El código no puede estar vacío")
            return
        }

        setIsSaving(true)
        try {
            const saved = await upsertColorAction({
                code_4dig: code,
                name_color_sap: name,
                isNew: editingColor.isNew,
            })
            toast.success("Color guardado correctamente")
            setModalOpen(false)
            
            // Sync locally
            if (!editingColor.isNew) {
                setData(prev => prev.map(c => c.code_4dig === code ? saved : c))
            } else {
                setData(prev => [saved, ...prev])
            }
        } catch (error: any) {
            console.error(error)
            toast.error(error.message || "Error al guardar el color")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (code_4dig: string) => {
        if (!confirm(`¿Seguro que deseas eliminar el color con código "${code_4dig}"?`)) return
        setIsDeleting(code_4dig)
        try {
            await deleteColorAction(code_4dig)
            setData(prev => prev.filter(c => c.code_4dig !== code_4dig))
            toast.success("Color eliminado correctamente")
        } catch (error) {
            console.error(error)
            toast.error("Error al eliminar el color")
        } finally {
            setIsDeleting(null)
        }
    }

    return (
        <div className="flex flex-col gap-6 p-2">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/configuration">
                        <Button variant="outline" size="icon" className="border-slate-200 text-slate-700 hover:bg-slate-50">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <Palette className="h-6 w-6 text-green-600" />
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Catálogo de Colores</h1>
                        </div>
                        <p className="text-muted-foreground italic">
                            Verifica y administra la correspondencia de códigos y descripciones SAP de colores.
                        </p>
                    </div>
                </div>
                <Button onClick={() => handleOpenModal()} className="bg-green-600 hover:bg-green-700 text-white font-semibold">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nuevo Color
                </Button>
            </div>

            <div className="flex items-center gap-2 p-1 bg-white border border-slate-200 rounded-lg shadow-sm">
                <Search className="ml-3 h-4 w-4 text-muted-foreground font-bold" />
                <Input 
                    placeholder="Buscar por código de color (ej: 0001, GL10) o nombre SAP..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border-0 focus-visible:ring-0 text-sm italic"
                />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="font-bold uppercase text-[10px] w-48 text-slate-600">Código (4 Dígitos)</TableHead>
                            <TableHead className="font-bold uppercase text-[10px] text-slate-600">Nombre Color SAP</TableHead>
                            <TableHead className="text-right font-bold uppercase text-[10px] w-32 text-slate-600">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-32 text-center text-muted-foreground italic">
                                    No se encontraron colores en el catálogo.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredData.map((item) => {
                                return (
                                    <TableRow key={item.code_4dig} className="hover:bg-green-50/20 transition-colors">
                                        <TableCell className="font-bold text-slate-950 border-r border-slate-100">
                                            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200 uppercase font-semibold">
                                                {item.code_4dig}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-800 font-medium italic uppercase">
                                            {item.name_color_sap}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => handleOpenModal(item)}
                                                    className="h-8 text-green-700 hover:text-green-800 hover:bg-green-50 font-medium"
                                                >
                                                    Editar
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => handleDelete(item.code_4dig)}
                                                    disabled={isDeleting === item.code_4dig}
                                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    {isDeleting === item.code_4dig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
                            <Palette className="h-5 w-5 text-green-600" />
                            {editingColor?.isNew ? 'Nuevo Color' : 'Editar Color'}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {editingColor?.isNew 
                                ? 'Ingresa el código único y el nombre SAP del color para agregarlo al catálogo.' 
                                : 'Modifica el nombre del color SAP seleccionado. El código no puede ser editado.'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="code" className="text-right font-medium text-slate-700">Código</Label>
                            <Input 
                                id="code" 
                                className="col-span-3 uppercase"
                                value={editingColor?.code_4dig || ''} 
                                onChange={(e) => setEditingColor(prev => ({ ...prev!, code_4dig: e.target.value }))}
                                placeholder="E.g. 0001, G120"
                                required
                                disabled={!editingColor?.isNew}
                                maxLength={10}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right font-medium text-slate-700">Nombre SAP</Label>
                            <Input 
                                id="name" 
                                className="col-span-3 uppercase"
                                value={editingColor?.name_color_sap || ''} 
                                onChange={(e) => setEditingColor(prev => ({ ...prev!, name_color_sap: e.target.value }))}
                                placeholder="E.g. BLANCO, GRAFITO MATE"
                                required
                            />
                        </div>

                        <DialogFooter className="mt-4">
                            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-slate-200">
                                Cancelar
                            </Button>
                            <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-semibold" disabled={isSaving}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Color
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
