'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import Link from 'next/link'
// AiAssistantPanel removed - component does not exist yet
import { updateProductAction } from '../actions'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { useEffect, useCallback } from 'react'
import { getRulesAction } from '@/app/rules/actions'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { translateProductToEnglish } from '@/lib/engine/translator'
import { Rule, Product } from '@prisma/client'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Languages, Sparkles } from 'lucide-react'

export function EditProductForm({ initialData }: { initialData: any }) {
    const [formData, setFormData] = useState({
        code: initialData.code || '',
        sap_description: initialData.sap_description || '',
        product_type: initialData.product_type || '',
        cabinet_name: initialData.cabinet_name || '',
        color_code: initialData.color_code || '',
        rh: initialData.rh || 'NA',
        assembled_flag: initialData.assembled_flag || false,
        canto_puertas: initialData.canto_puertas || '',
        line: initialData.line || '',
        use_destination: initialData.use_destination || '',
        commercial_measure: initialData.commercial_measure || '',
        accessory_text: initialData.accessory_text || '',
        designation: initialData.designation || '',
        width_cm: String(initialData.width_cm || ''),
        depth_cm: String(initialData.depth_cm || ''),
        height_cm: String(initialData.height_cm || ''),
        weight_kg: String(initialData.weight_kg || ''),
        final_name_es: initialData.final_name_es || '',
        final_name_en: initialData.final_name_en || '',
        door_color_text: initialData.door_color_text || 'NA',
        private_label_flag: initialData.private_label_flag || false,
        private_label_client_name: initialData.private_label_client_name || 'NA',
        private_label_client_id: initialData.private_label_client_id || '',
        isometric_path: initialData.isometric_path || '',
        isometric_asset_id: initialData.isometric_asset_id || '',
    })

    const [rules, setRules] = useState<Rule[]>([])
    const [isGenerating, setIsGenerating] = useState(false)

    useEffect(() => {
        getRulesAction().then(setRules)
    }, [])

    const handleGenerateNames = useCallback(async (currentData: any) => {
        if (rules.length === 0) return
        
        setIsGenerating(true)
        try {
            const evalResult = evaluateProductRules(currentData as any as Product, rules)
            const namingEs = evalResult.finalNameEs
            
            const transResult = await translateProductToEnglish(currentData as any as Product, namingEs)
            const namingEn = transResult.translatedName

            setFormData(prev => ({
                ...prev,
                final_name_es: namingEs,
                final_name_en: namingEn
            }))
        } catch (error) {
            console.error("Error auto-generating names:", error)
        } finally {
            setIsGenerating(false)
        }
    }, [rules])

    // Auto-generación reactiva
    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.cabinet_name && rules.length > 0) {
                handleGenerateNames(formData);
            }
        }, 800)
        return () => clearTimeout(timer)
    }, [
        formData.cabinet_name, formData.color_code, formData.line, 
        formData.designation, formData.commercial_measure, formData.accessory_text,
        formData.rh, formData.assembled_flag, formData.canto_puertas,
        formData.door_color_text, rules
    ])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleApplySuggestions = (suggestions: Record<string, any>) => {
        setFormData(prev => ({
            ...prev,
            product_type: suggestions.product_type || prev.product_type,
            cabinet_name: suggestions.cabinet_name || prev.cabinet_name,
            color_code: suggestions.color_code || prev.color_code,
            line: suggestions.line || prev.line,
            designation: suggestions.designation || prev.designation,
            commercial_measure: suggestions.commercial_measure || prev.commercial_measure,
            accessory_text: suggestions.accessory_text || prev.accessory_text,
            use_destination: suggestions.use_destination || prev.use_destination,
            canto_puertas: suggestions.canto_puertas || prev.canto_puertas,
            rh: suggestions.rh || prev.rh,
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await updateProductAction(initialData.id, formData)
            toast.success("Producto actualizado correctamente")
        } catch (err: any) {
            if (err.message.includes('NEXT_REDIRECT')) return;
            toast.error("Error al actualizar: " + err.message)
        }
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
                                    <Label htmlFor="cabinet_name">Nombre de Gabinete</Label>
                                    <Input
                                        id="cabinet_name" name="cabinet_name"
                                        value={formData.cabinet_name} onChange={handleChange}
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
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="rh">Material / RH</Label>
                                    <Input
                                        id="rh" name="rh"
                                        value={formData.rh} onChange={handleChange}
                                        placeholder="RH o NA"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="canto_puertas">Canto Puertas</Label>
                                    <Input
                                        id="canto_puertas" name="canto_puertas"
                                        value={formData.canto_puertas} onChange={handleChange}
                                        placeholder="Ej: CANTO 2MM"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-6 mt-6 p-5 bg-slate-50 border border-slate-100 rounded-xl">
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
                                        id="private_label_flag"
                                        checked={formData.private_label_flag}
                                        onCheckedChange={(c) => setFormData(p => ({ ...p, private_label_flag: !!c }))}
                                    />
                                    <Label htmlFor="private_label_flag">Marca Propia</Label>
                                </div>
                            </div>

                            {/* Nombres Generados Automáticamente */}
                            <div className="mt-6 space-y-4 p-5 bg-blue-50/50 border border-blue-100 rounded-xl">
                                <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4"/>
                                    Nomenclatura Sugerida
                                </h3>
                                <div className="grid gap-4">
                                    <div className="grid gap-2">
                                        <Label className="text-xs text-slate-500">Nombre Final (ES)</Label>
                                        <div className="p-3 bg-white border rounded font-mono text-sm min-h-[40px]">
                                            {isGenerating ? 'Generando...' : (formData.final_name_es || '—')}
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs text-slate-500">Nombre Final (EN)</Label>
                                        <div className="p-3 bg-white border rounded font-mono text-sm min-h-[40px] flex items-center gap-2">
                                            <Languages className="w-3 h-3 text-slate-400"/>
                                            {isGenerating ? 'Traduciendo...' : (formData.final_name_en || '—')}
                                        </div>
                                    </div>
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
                {/* AiAssistantPanel - TODO: implement component */}
            </div>
        </div>
    )
}
