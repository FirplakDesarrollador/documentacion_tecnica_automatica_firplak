'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import Link from 'next/link'
import { createFamilyAction } from '@/app/products/actions'
import { ArrowLeft } from 'lucide-react'

export default function NewFamilyPage() {
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        zone_text: '',
        line: '',
        product_type: '',
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await createFamilyAction(formData)
    }

    return (
        <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full py-8">
            <div className="flex items-center gap-4">
                <Link href="/products">
                    <Button variant="outline" size="icon" type="button">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Nueva Familia</h1>
                    <p className="text-muted-foreground">Registra una nueva familia para autocompletar productos.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Detalles de Familia</CardTitle>
                    <CardDescription>
                        Ingresa el código principal de la familia (ej. VBAN05, VBAN31) y sus propiedades por defecto.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="code">Código de Familia *</Label>
                            <Input
                                id="code" name="code" required
                                placeholder="VBAN05, BAN31..."
                                value={formData.code} onChange={handleChange}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="name">Nombre de Familia</Label>
                            <Input
                                id="name" name="name"
                                placeholder="Mueble de Baño Life..."
                                value={formData.name} onChange={handleChange}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="product_type">Tipo de Producto</Label>
                                <Input
                                    id="product_type" name="product_type"
                                    placeholder="TAPAS, MUEBLE..."
                                    value={formData.product_type} onChange={handleChange}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="line">Línea</Label>
                                <Input
                                    id="line" name="line"
                                    placeholder="ESSENTIAL, LIFE..."
                                    value={formData.line} onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="zone_text">Zona</Label>
                                <Input
                                    id="zone_text" name="zone_text"
                                    placeholder="BAÑOS, COCINA..."
                                    value={formData.zone_text} onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end mt-4">
                            <Link href="/products">
                                <Button variant="outline" type="button">Cancelar</Button>
                            </Link>
                            <Button type="submit">Guardar Familia</Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
