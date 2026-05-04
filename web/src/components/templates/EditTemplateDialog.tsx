"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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

export function EditTemplateDialog({ 
    id, 
    currentName,
    currentWidth,
    currentHeight
}: { 
    id: string, 
    currentName: string,
    currentWidth: number,
    currentHeight: number
}) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

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
            height_mm: height
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
        <Dialog open={open} onOpenChange={setOpen}>
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
                            Modifica el nombre o las dimensiones de la plantilla.
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
