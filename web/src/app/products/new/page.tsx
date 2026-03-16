'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import Link from 'next/link'
import { AiAssistantPanel } from '@/components/ai/AiAssistantPanel'
import { createProductAction, checkFamilyExists } from '../actions'
import { Checkbox } from '@/components/ui/checkbox'

export default function NewProductPage() {
    const [formData, setFormData] = useState({
        code: '',
        sap_description: '',
        product_type: '',
        furniture_name: '',
        color_code: '',
        rh_flag: false,
        assembled_flag: false,
        edge_2mm_flag: false,
        line: '',
        use_destination: '',
        commercial_measure: '',
        accessory_text: '',
        designation: '',
        width_cm: '',
        depth_cm: '',
        height_cm: '',
        weight_kg: '',
        stacking_max: '',
    })

    const [isAnalyzed, setIsAnalyzed] = useState(false)
    const [isNewFamily, setIsNewFamily] = useState(false)
    const [familyData, setFamilyData] = useState({
        name: '',
        zone_text: '',
        line: '',
        product_type: '',
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleFamilyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFamilyData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleApplySuggestions = async (suggestions: Record<string, any>) => {
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
            rh_flag: suggestions.rh_flag !== undefined ? suggestions.rh_flag : prev.rh_flag,
            assembled_flag: suggestions.assembled_flag !== undefined ? suggestions.assembled_flag : prev.assembled_flag,
            edge_2mm_flag: suggestions.edge_2mm_flag !== undefined ? suggestions.edge_2mm_flag : prev.edge_2mm_flag,
        }))

        // Verifica si la familia existe
        if (formData.code) {
            const familyExists = await checkFamilyExists(formData.code)
            setIsNewFamily(!familyExists)
        }

        setIsAnalyzed(true)
    }

    const handleSkipAnalysis = async () => {
        if (formData.code) {
            const familyExists = await checkFamilyExists(formData.code)
            setIsNewFamily(!familyExists)
        }
        setIsAnalyzed(true)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await createProductAction({ ...formData, _newFamily: isNewFamily ? familyData : undefined })
    }

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Nuevo Producto</h1>
                    <p className="text-muted-foreground">Agrega un producto nuevo manualmente a la base maestra.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Detalles Principales</CardTitle>
                            <CardDescription>
                                Ingresa el código y la descripción para autocompletar el resto de campos.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form id="productForm" onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="code">Código de Producto (FAM-REF-VER-COL) *</Label>
                                    <Input
                                        id="code" name="code" required
                                        placeholder="VBAN05-0001-000-0387"
                                        value={formData.code} onChange={handleChange}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="sap_description">Descripción cruda SAP</Label>
                                    <Input
                                        id="sap_description" name="sap_description"
                                        placeholder="Pega la descripción de SAP y envíala al asistente AI..."
                                        value={formData.sap_description} onChange={handleChange}
                                    />
                                </div>

                                {!isAnalyzed && (
                                    <div className="flex justify-end gap-2 mt-2">
                                        <Button variant="ghost" type="button" onClick={handleSkipAnalysis}>
                                            Llenar manualmente
                                        </Button>
                                    </div>
                                )}

                                {isAnalyzed && (
                                    <>
                                        {isNewFamily && (
                                            <div className="p-4 border border-orange-200 bg-orange-50 rounded-md mt-4 flex flex-col gap-4">
                                                <div>
                                                    <h3 className="font-semibold text-orange-800">Nueva Familia Detectada</h3>
                                                    <p className="text-sm text-orange-700">El código ingresado contiene una familia que no existe. Por favor, define sus valores por defecto.</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="grid gap-2">
                                                        <Label htmlFor="family_name">Nombre Familia</Label>
                                                        <Input id="family_name" name="name" value={familyData.name} onChange={handleFamilyChange} required />
                                                    </div>
                                                    <div className="grid gap-2">
                                                        <Label htmlFor="family_zone">Zona</Label>
                                                        <Input id="family_zone" name="zone_text" value={familyData.zone_text} onChange={handleFamilyChange} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="border-t pt-4 mt-2">
                                            <h3 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">Validación de Propiedades</h3>

                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="product_type">Tipo de Producto</Label>
                                                    <Input
                                                        id="product_type" name="product_type" placeholder="MUEBLE..."
                                                        value={formData.product_type} onChange={handleChange}
                                                    />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label htmlFor="furniture_name">Nombre de Mueble</Label>
                                                    <Input
                                                        id="furniture_name" name="furniture_name" placeholder="BASICO..."
                                                        value={formData.furniture_name} onChange={handleChange}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="color_code">Código Color (4 dígitos)</Label>
                                                    <Input
                                                        id="color_code" name="color_code" placeholder="0387..."
                                                        value={formData.color_code} onChange={handleChange}
                                                    />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label htmlFor="line">Línea</Label>
                                                    <Input
                                                        id="line" name="line" placeholder="CLASS, LIFE, ESSENTIAL..."
                                                        value={formData.line} onChange={handleChange}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="use_destination">Destino de Uso</Label>
                                                    <Input
                                                        id="use_destination" name="use_destination" placeholder="LAVAMANOS..."
                                                        value={formData.use_destination} onChange={handleChange}
                                                    />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label htmlFor="designation">Designación</Label>
                                                    <Input
                                                        id="designation" name="designation" placeholder="ELEVADO..."
                                                        value={formData.designation} onChange={handleChange}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="commercial_measure">Medida Comercial</Label>
                                                    <Input
                                                        id="commercial_measure" name="commercial_measure" placeholder="60X40..."
                                                        value={formData.commercial_measure} onChange={handleChange}
                                                    />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label htmlFor="accessory_text">Accesorios / Rieles</Label>
                                                    <Input
                                                        id="accessory_text" name="accessory_text" placeholder="MANIJAS, RIEL FULL..."
                                                        value={formData.accessory_text} onChange={handleChange}
                                                    />
                                                </div>
                                            </div>

                                            <h3 className="font-semibold mb-4 mt-6 text-sm text-muted-foreground uppercase tracking-wide">Dimensiones (Faltantes)</h3>
                                            <div className="grid grid-cols-3 gap-4 mb-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="width_cm">Ancho (cm)</Label>
                                                    <Input type="number" step="0.1" id="width_cm" name="width_cm" value={formData.width_cm} onChange={handleChange} />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label htmlFor="depth_cm">Fondo (cm)</Label>
                                                    <Input type="number" step="0.1" id="depth_cm" name="depth_cm" value={formData.depth_cm} onChange={handleChange} />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label htmlFor="height_cm">Alto (cm)</Label>
                                                    <Input type="number" step="0.1" id="height_cm" name="height_cm" value={formData.height_cm} onChange={handleChange} />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="weight_kg">Peso (kg)</Label>
                                                    <Input type="number" step="0.1" id="weight_kg" name="weight_kg" value={formData.weight_kg} onChange={handleChange} />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label htmlFor="stacking_max">Apilamiento Max</Label>
                                                    <Input type="number" id="stacking_max" name="stacking_max" value={formData.stacking_max} onChange={handleChange} />
                                                </div>
                                            </div>

                                            <div className="flex gap-6 mt-4 p-4 bg-muted/30 rounded-md">
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
                                        </div>

                                        <div className="flex gap-2 justify-end mt-4">
                                            <Link href="/products">
                                                <Button variant="outline" type="button">Cancelar</Button>
                                            </Link>
                                            <Button type="submit">Guardar Producto</Button>
                                        </div>
                                    </>
                                )}
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
        </div>
    )
}
