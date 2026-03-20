'use client'

import { useState, useEffect, use } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'
import { updateFamilyAction } from '@/app/products/actions'
import { dbQuery } from '@/lib/supabase'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function EditFamilyPage({ params: paramsPromise }: { params: Promise<{ code: string }> }) {
    const params = use(paramsPromise)
    const code = params.code
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        zone_home: '',
        line: '',
        product_type: '',
        use_destination: '',
    })

    useEffect(() => {
        const fetchFamily = async () => {
            try {
                // We use dbQuery which is client-safe in this context if implemented correctly, 
                // but let's assume it's available or we should use a server action.
                // Given the project structure, I'll use a fetch-like approach if possible or a direct await if it's a server component.
                // Wait, this is a client component ('use client'). I should fetch via an API or a server action that returns data.
                
                // Let's use a server action to fetch family details to keep it consistent.
                const response = await fetch(`/api/families/${code}`)
                if (response.ok) {
                    const data = await response.json()
                    setFormData({
                        name: data.name || '',
                        zone_home: data.zone_home || '',
                        line: data.line || '',
                        product_type: data.product_type || '',
                        use_destination: data.use_destination || '',
                    })
                }
            } catch (err) {
                console.error("Failed to fetch family:", err)
            } finally {
                setLoading(false)
            }
        }
        fetchFamily()
    }, [code])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSelectChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            await updateFamilyAction(code, formData)
            router.push('/families')
        } catch (err) {
            console.error("Failed to update family:", err)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
        )
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
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Editar Familia</h1>
                    <p className="text-slate-500">Actualiza las propiedades de la familia de productos <span className="font-mono text-slate-900 font-bold">{code}</span>.</p>
                </div>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold text-slate-800">Detalles de Familia</CardTitle>
                    <CardDescription className="text-sm text-slate-500">
                        Modifica las propiedades por defecto que se aplicarán a los nuevos productos de esta familia.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label className="text-sm font-medium">Código de Familia</Label>
                                <Input
                                    disabled
                                    className="bg-slate-100 border-slate-200 font-mono"
                                    value={code}
                                />
                                <p className="text-[10px] text-slate-400 font-medium tracking-tight">El código único no se puede modificar.</p>
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
                                <Select value={(formData.line as string) || ''} onValueChange={(v) => handleSelectChange('line', v)}>
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
                                <Select value={(formData.zone_home as string) || ''} onValueChange={(v) => handleSelectChange('zone_home', v)}>
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
                                <Select value={(formData.product_type as string) || ''} onValueChange={(v) => handleSelectChange('product_type', v)}>
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
                                <Select value={(formData.use_destination as string) || ''} onValueChange={(v) => handleSelectChange('use_destination', v)}>
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
                            <Button 
                                type="submit" 
                                className="bg-slate-900 text-white hover:bg-slate-800 px-6"
                                disabled={saving}
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    'Guardar Cambios'
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
