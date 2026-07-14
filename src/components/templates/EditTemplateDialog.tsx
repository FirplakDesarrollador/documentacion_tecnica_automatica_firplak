"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Settings2, Loader2 } from "lucide-react"
import { updateTemplate } from "@/app/templates/actions"
import { toast } from "sonner"
import {
    CATALOG_SCOPE_OPTIONS,
    isCoreCatalogDataSource,
    normalizeCatalogScope,
    type CatalogScope,
} from "@/lib/templates/catalogScope"

export function EditTemplateDialog({ 
    id, 
    currentName,
    currentWidth,
    currentHeight,
    currentDataSource,
    currentCatalogScope,
}: { 
    id: string, 
    currentName: string,
    currentWidth: number,
    currentHeight: number,
    currentDataSource?: string | null,
    currentCatalogScope?: CatalogScope | null,
}) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [catalogScope, setCatalogScope] = useState<CatalogScope>(() => normalizeCatalogScope(currentCatalogScope))
    const isCoreCatalog = isCoreCatalogDataSource(currentDataSource)

    function handleOpenChange(nextOpen: boolean) {
        if (nextOpen) setCatalogScope(normalizeCatalogScope(currentCatalogScope))
        setOpen(nextOpen)
    }

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData(e.currentTarget)
        const name = formData.get("name") as string
        const width = parseFloat(formData.get("width") as string)
        const height = parseFloat(formData.get("height") as string)

        if (!name || isNaN(width) || isNaN(height)) {
            toast.error("Por favor completa los campos correctamente.")
            setLoading(false)
            return
        }

        const res = await updateTemplate(id, {
            name: name,
            width_mm: width,
            height_mm: height,
            catalog_scope: isCoreCatalog ? catalogScope : null,
        })
        
        setLoading(false)

        if (res.success) {
            toast.success("Plantilla actualizada exitosamente")
            setOpen(false)
        } else {
            toast.error("Error al actualizar plantilla: " + res.error)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger render={
                <Button variant="ghost" size="sm" className="font-semibold text-slate-500 hover:text-indigo-600 hover:bg-slate-100">
                    <Settings2 className="h-4 w-4" />
                </Button>
            } />
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>Editar Propiedades</DialogTitle>
                        <DialogDescription>
                            Modifica el nombre, las dimensiones y el alcance del catálogo cuando la plantilla usa datos Core.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                Nombre
                            </Label>
                            <Input 
                                id="name" 
                                name="name" 
                                defaultValue={currentName}
                                className="col-span-3" 
                                required 
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="width" className="text-right">
                                Ancho (mm)
                            </Label>
                            <Input 
                                id="width" 
                                name="width" 
                                type="number" 
                                step="0.1" 
                                defaultValue={currentWidth} 
                                className="col-span-3" 
                                required 
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="height" className="text-right">
                                Alto (mm)
                            </Label>
                            <Input 
                                id="height" 
                                name="height" 
                                type="number" 
                                step="0.1" 
                                defaultValue={currentHeight} 
                                className="col-span-3" 
                                required 
                            />
                        </div>
                        {isCoreCatalog && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="catalog_scope" className="text-right leading-tight">
                                    Alcance del catálogo
                                </Label>
                                <select
                                    id="catalog_scope"
                                    name="catalog_scope"
                                    value={catalogScope}
                                    onChange={(e) => setCatalogScope(normalizeCatalogScope(e.target.value))}
                                    className="col-span-3 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                >
                                    {CATALOG_SCOPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Actualizar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
