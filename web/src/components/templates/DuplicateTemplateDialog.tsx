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
import { Copy, Loader2 } from "lucide-react"
import { duplicateTemplate } from "@/app/templates/actions"
import { toast } from "sonner"

export function DuplicateTemplateDialog({ 
    id, 
    originalName,
    originalDataSource,
    datasets = [] 
}: { 
    id: string, 
    originalName: string,
    originalDataSource: string,
    datasets?: {id: string, name: string}[] 
}) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData(e.currentTarget)
        const newName = formData.get("name") as string
        const dataSource = formData.get("data_source") as string

        if (!newName || !dataSource) {
            toast.error("Por favor completa los campos correctamente.")
            setLoading(false)
            return
        }

        const res = await duplicateTemplate(id, newName, dataSource)
        setLoading(false)

        if (res.success) {
            toast.success("Plantilla duplicada exitosamente")
            setOpen(false)
            // Opcional: redirigir al builder o simplemente recargar la tabla
            router.push(`/templates/builder?id=${res.id}`)
        } else {
            toast.error("Error al duplicar plantilla: " + res.error)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={
                <Button variant="ghost" size="sm" className="font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100">
                    <Copy className="h-4 w-4" />
                </Button>
            } />
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>Duplicar Plantilla</DialogTitle>
                        <DialogDescription>
                            Se creará una copia exacta de la plantilla original (diseño, variables, estilos y dimensiones).
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
                                defaultValue={`${originalName} (Copia)`}
                                className="col-span-3" 
                                required 
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="data_source" className="text-right leading-tight">
                                Fuente de Datos
                            </Label>
                            <select
                                id="data_source" 
                                name="data_source" 
                                defaultValue={originalDataSource || "core_firplak"}
                                required
                                className="col-span-3 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                <option value="core_firplak">Catálogo Core: Productos Firplak</option>
                                {datasets.map(ds => (
                                    <option key={ds.id} value={ds.id}>{ds.name} (Dataset Externo)</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Crear Copia
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
