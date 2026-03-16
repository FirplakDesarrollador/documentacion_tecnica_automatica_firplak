'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import Link from 'next/link'
import { AiAssistantPanel } from '@/components/ai/AiAssistantPanel'
import { updateProductAction } from '../actions'
import { Checkbox } from '@/components/ui/checkbox'

export function EditProductForm({ initialData }: { initialData: any }) {
    const [formData, setFormData] = useState({
        code: initialData.code || '',
        sap_description: initialData.sap_description || '',
        product_type: initialData.product_type || '',
        furniture_name: initialData.furniture_name || '',
        color_code: initialData.color_code || '',
        rh_flag: initialData.rh_flag || false,
        assembled_flag: initialData.assembled_flag || false,
        edge_2mm_flag: initialData.edge_2mm_flag || false,
        line: initialData.line || '',
        use_destination: initialData.use_destination || '',
        commercial_measure: initialData.commercial_measure || '',
        accessory_text: initialData.accessory_text || '',
        designation: initialData.designation || '',
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleApplySuggestions = (suggestions: Record<string, any>) => {
        setFormData(prev => ({
            ...prev,
            product_type: suggestions.product_type || prev.product_type,
            furniture_name: suggestions.furniture_name || prev.furniture_name,
            color_code: suggestions.color_code || prev.color_code,
            line: suggestions.line || prev.line,
            designation: suggestions.designation || prev.designation,
            commercial_measure: suggestions.commercial_measure || prev.commercial_measure,
            accessory_text: suggestions.accessory_text || prev.accessory_text,
            use_destination: suggestions.use_destination || prev.use_destination,
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await updateProductAction(initialData.id, formData)
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Detalles del Producto</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="code">Código de Producto (FAM-REF-VER-COL) *</Label>
                                <Input
                                    id="code" name="code" required
                                    value={formData.code} onChange={handleChange}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="sap_description">Descripción cruda SAP</Label>
                                <Input
                                    id="sap_description" name="sap_description"
                                    value={formData.sap_description} onChange={handleChange}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="product_type">Tipo de Producto</Label>
                                    <Input
                                        id="product_type" name="product_type"
                                        value={formData.product_type} onChange={handleChange}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="furniture_name">Nombre de Mueble</Label>
                                    <Input
                                        id="furniture_name" name="furniture_name"
                                        value={formData.furniture_name} onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="color_code">Código Color (4 dígitos)</Label>
                                    <Input
                                        id="color_code" name="color_code"
                                        value={formData.color_code} onChange={handleChange}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="line">Línea</Label>
                                    <Input
                                        id="line" name="line"
                                        value={formData.line} onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="use_destination">Destino de Uso</Label>
                                    <Input
                                        id="use_destination" name="use_destination"
                                        value={formData.use_destination} onChange={handleChange}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="designation">Designación</Label>
                                    <Input
                                        id="designation" name="designation"
                                        value={formData.designation} onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="commercial_measure">Medida Comercial</Label>
                                    <Input
                                        id="commercial_measure" name="commercial_measure"
                                        value={formData.commercial_measure} onChange={handleChange}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="accessory_text">Accesorios / Rieles</Label>
                                    <Input
                                        id="accessory_text" name="accessory_text"
                                        value={formData.accessory_text} onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-6 mt-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="rh_flag"
                                        checked={formData.rh_flag}
                                        onCheckedChange={(c) => setFormData(p => ({ ...p, rh_flag: !!c }))}
                                    />
                                    <Label htmlFor="rh_flag">Es RH</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="assembled_flag"
                                        checked={formData.assembled_flag}
                                        onCheckedChange={(c) => setFormData(p => ({ ...p, assembled_flag: !!c }))}
                                    />
                                    <Label htmlFor="assembled_flag">Es Armado</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="edge_2mm_flag"
                                        checked={formData.edge_2mm_flag}
                                        onCheckedChange={(c) => setFormData(p => ({ ...p, edge_2mm_flag: !!c }))}
                                    />
                                    <Label htmlFor="edge_2mm_flag">Canto 2mm</Label>
                                </div>
                            </div>

                            <div className="flex gap-2 justify-end mt-4">
                                <Button variant="outline" type="button">
                                    <Link href="/products">Cancelar</Link>
                                </Button>
                                <Button type="submit">Guardar Cambios</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>

            <div className="md:col-span-1">
                <AiAssistantPanel
                    sapDescription={formData.sap_description}
                    onApplySuggestions={handleApplySuggestions}
                />
            </div>
        </div>
    )
}
