"use client"

import { useEffect, useState } from "react"
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
import { getClientsAction } from "@/app/configuration/clients/actions"

interface ClientRow {
    id: string
    name: string
}

export function NewTemplateDialog() {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [clients, setClients] = useState<ClientRow[]>([])
    const [dataSource, setDataSource] = useState<string>('core_firplak')
    const [brandScope, setBrandScope] = useState<'firplak' | 'private_label'>('firplak')
    const [privateLabelClientName, setPrivateLabelClientName] = useState<string>('')
    const router = useRouter()

    useEffect(() => {
        if (!open) return
        getClientsAction()
            .then((res: ClientRow[]) => setClients(Array.isArray(res) ? res : []))
            .catch(() => setClients([]))
    }, [open])

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData(e.currentTarget)
        const name = formData.get("name") as string
        const width = parseFloat(formData.get("width") as string)
        const height = parseFloat(formData.get("height") as string)
        const scope = (formData.get("brand_scope") as string) || 'firplak'
        const plc = (formData.get("private_label_client_name") as string) || ''

        if (!name || isNaN(width) || isNaN(height) || !dataSource) {
            toast.error("Por favor completa todos los campos correctamente.")
            setLoading(false)
            return
        }

        const res = await createTemplate({
            name,
            width_mm: width,
            height_mm: height,
            data_source: dataSource,
            brand_scope: scope === 'private_label' ? 'private_label' : 'firplak',
            private_label_client_name: scope === 'private_label' ? plc : null,
        })
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
                                value={dataSource}
                                onChange={(e) => {
                                    const next = e.target.value
                                    setDataSource(next)
                                    if (next !== 'core_firplak') {
                                        setBrandScope('firplak')
                                        setPrivateLabelClientName('')
                                    }
                                }}
                                className="col-span-3 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                <option value="core_firplak">Catálogo Core: Productos Firplak</option>
                                <option value="custom_datasets">Bases de Datos (Genérico)</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="brand_scope" className="text-right leading-tight">
                                Alcance de Marca
                            </Label>
                            <select
                                id="brand_scope"
                                name="brand_scope"
                                value={dataSource === 'core_firplak' ? brandScope : 'firplak'}
                                onChange={(e) => {
                                    const next = (e.target.value as 'firplak' | 'private_label') || 'firplak'
                                    setBrandScope(next)
                                    if (next === 'firplak') setPrivateLabelClientName('')
                                }}
                                disabled={dataSource !== 'core_firplak'}
                                className="col-span-3 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60"
                            >
                                <option value="firplak">Firplak</option>
                                <option value="private_label">Marca Propia (Cliente)</option>
                            </select>
                        </div>
                        {dataSource === 'core_firplak' && brandScope === 'private_label' && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="private_label_client_name" className="text-right leading-tight">
                                    Cliente
                                </Label>
                                <select
                                    id="private_label_client_name"
                                    name="private_label_client_name"
                                    value={privateLabelClientName}
                                    onChange={(e) => setPrivateLabelClientName(e.target.value)}
                                    className="col-span-3 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    required
                                >
                                    <option value="" disabled>-- Selecciona un cliente --</option>
                                    {clients.map((c: ClientRow) => (
                                        <option key={c.id || c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
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
