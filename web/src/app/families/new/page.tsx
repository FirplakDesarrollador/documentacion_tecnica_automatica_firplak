'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'
import { upsertFamilyAction } from '@/app/products/actions'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function NewFamilyPage() {
    const router = useRouter()
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        zone_home: '',
        line: '',
        product_type: '',
        use_destination: '',
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSelectChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await upsertFamilyAction(formData)
        router.push('/families')
    }

    return (
        <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full py-8">
            <div className="flex items-center gap-4">
                <Link href="/families">
                    <Button variant="outline" size="icon" type="button">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Nueva Familia</h1>
                    <p className="text-slate-500">Registra una nueva familia para autocompletar productos.</p>
                </div>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold text-slate-800">Detalles de Familia</CardTitle>
                    <CardDescription className="text-sm text-slate-500">
                        Ingresa el código principal de la familia (ej. VBAN05, VBAN31) y sus propiedades por defecto.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="code" className="text-sm font-medium">Código de Familia *</Label>
                                <Input
                                    id="code" name="code" required
                                    placeholder="VBAN05, BAN31..."
                                    className="bg-slate-50 border-slate-200"
                                    value={formData.code} onChange={handleChange}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="name" className="text-sm font-medium">Nombre de Familia</Label>
                                <Input
                                    id="name" name="name"
                                    placeholder="Mueble de Baño Life..."
                                    className="bg-slate-50 border-slate-200"
                                    value={formData.name} onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className="grid gap-6 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label className="text-sm font-medium text-slate-700">Línea</Label>
                                <Select value={(formData.line || '')} onValueChange={(v) => handleSelectChange('line', v || '')}>
                                    <SelectTrigger className="w-full bg-slate-50 border-slate-200 h-9">
                                        <SelectValue placeholder="Seleccionar línea" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="NA">NA (No Aplica)</SelectItem>
                                        <SelectItem value="ESSENTIAL">ESSENTIAL</SelectItem>
                                        <SelectItem value="LIFE">LIFE</SelectItem>
                                        <SelectItem value="PREMIUM">PREMIUM</SelectItem>
                                        <SelectItem value="PRO">PRO</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label className="text-sm font-medium text-slate-700">Zona (Ambiente)</Label>
                                <Select value={(formData.zone_home || '')} onValueChange={(v) => handleSelectChange('zone_home', v || '')}>
                                    <SelectTrigger className="w-full bg-slate-50 border-slate-200 h-9">
                                        <SelectValue placeholder="Seleccionar zona" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="BAÑO">BAÑO</SelectItem>
                                        <SelectItem value="COCINA">COCINA</SelectItem>
                                        <SelectItem value="ZONA DE ROPA">ZONA DE ROPA</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-6 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label className="text-sm font-medium text-slate-700">Tipo de Producto</Label>
                                <Select value={(formData.product_type || '')} onValueChange={(v) => handleSelectChange('product_type', v || '')}>
                                    <SelectTrigger className="w-full bg-slate-50 border-slate-200 h-9">
                                        <SelectValue placeholder="Seleccionar tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MUEBLE">MUEBLE</SelectItem>
                                        <SelectItem value="TAPA">TAPA</SelectItem>
                                        <SelectItem value="LAVAMANOS">LAVAMANOS</SelectItem>
                                        <SelectItem value="LAVARROPAS">LAVARROPAS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label className="text-sm font-medium text-slate-700">Uso / Destino</Label>
                                <Select value={(formData.use_destination || '')} onValueChange={(v) => handleSelectChange('use_destination', v || '')}>
                                    <SelectTrigger className="w-full bg-slate-50 border-slate-200 h-9">
                                        <SelectValue placeholder="Seleccionar destino" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="LAVAMANOS">LAVAMANOS</SelectItem>
                                        <SelectItem value="LAVARROPAS">LAVARROPAS</SelectItem>
                                        <SelectItem value="LAVAPLATOS">LAVAPLATOS</SelectItem>
                                        <SelectItem value="COCINA">COCINA</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-slate-100">
                            <Link href="/families">
                                <Button variant="ghost" type="button" className="text-slate-600 hover:bg-slate-100">
                                    Cancelar
                                </Button>
                            </Link>
                            <Button type="submit" className="bg-slate-900 text-white hover:bg-slate-800 px-6">
                                Guardar Familia
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
