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
import { PlusCircle, Loader2 } from "lucide-react"
import { createTemplate } from "@/app/templates/actions"
import { toast } from "sonner"

export function NewTemplateDialog({ datasets = [] }: { datasets?: {id: string, name: string}[] }) {
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
        const dataSource = formData.get("data_source") as string

        if (!name || isNaN(width) || isNaN(height) || !dataSource) {
            toast.error("Por favor completa todos los campos correctamente.")
            setLoading(false)
            return
        }

        const res = await createTemplate({ name, width_mm: width, height_mm: height, data_source: dataSource })
        setLoading(false)

        if (res.success) {
            toast.success("Plantilla creada exitosamente")
            setOpen(false)
            router.push(`/templates/builder?id=${res.id}`)
        } else {
            toast.error("Error al crear plantilla: " + res.error)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nueva Plantilla
                </Button>
            } />
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>Crear Nueva Plantilla</DialogTitle>
                        <DialogDescription>
                            Define las dimensiones del lienzo. Las medidas deben estar en milímetros (mm).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                Nombre
                            </Label>
                            <Input id="name" name="name" placeholder="Ej. Etiqueta Estándar" className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="data_source" className="text-right leading-tight">
                                Fuente de Datos
                            </Label>
                            <select
                                id="data_source" name="data_source" required
                                className="col-span-3 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                <option value="core_firplak">Catálogo Core: Productos Firplak</option>
                                {datasets.map(ds => (
                                    <option key={ds.id} value={ds.id}>{ds.name} (Dataset Externo)</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="width" className="text-right">
                                Ancho (mm)
                            </Label>
                            <Input id="width" name="width" type="number" step="0.1" placeholder="Ej. 100" className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="height" className="text-right">
                                Alto (mm)
                            </Label>
                            <Input id="height" name="height" type="number" step="0.1" placeholder="Ej. 150" className="col-span-3" required />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Crear e Iniciar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
