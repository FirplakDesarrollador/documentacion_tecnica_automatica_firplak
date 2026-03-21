'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createProductAction, getUniquePropertiesAction, parseProductCodeAction, translateAction, checkProductExistsAction } from '../actions'
import { Checkbox } from '@/components/ui/checkbox'
import { getColorByNameAction, getRulesAction } from '@/app/rules/actions'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { FileBadge2, AlertTriangle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Product } from '@prisma/client'
import { UploadAssetButton } from '@/components/assets/UploadAssetButton'

export default function NewProductPage() {
    const router = useRouter()
    const [dupeAlertModal, setDupeAlertModal] = useState<string | null>(null)
    const [customValues, setCustomValues] = useState({ line: '', designation: '', product_type: '', use_destination: '' })
    
    const [formData, setFormData] = useState({
        code: '',
        sap_description: '',
        product_type: '',
        furniture_name: '',
        color_code: '',
        color_name: '',
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
        final_name_es: '',
        final_name_en: '',
        familia_code: '',
        ref_code: '',
        version_code: '',
        zone_home: '',
        isometric_path: ''
    })

    const [datalistOptions, setDatalistOptions] = useState({ lines: [] as string[], designations: [] as string[], productTypes: [] as string[], useDestinations: [] as string[], furnitureNames: [] as string[], commercialMeasures: [] as string[], accessoryTexts: [] as string[], colors: [] as {code: string, name: string}[] })

    const [isAnalyzed, setIsAnalyzed] = useState(false)
    const [isNewFamily, setIsNewFamily] = useState(false)
    const [rules, setRules] = useState<any[]>([])
    const [familyData, setFamilyData] = useState({
        name: '',
        zone_home: '',
        line: '',
        product_type: '',
    })

    // Cargar reglas y opciones una vez
    useEffect(() => {
        getRulesAction().then(r => setRules(r))
        getUniquePropertiesAction().then(res => setDatalistOptions(res as any))
    }, [])

    const handleCheckDupe = async (onSuccess: () => void) => {
        if (!formData.code && !formData.sap_description) {
            if (!isAnalyzed) setIsAnalyzed(true)
            return
        }
        const exist = await checkProductExistsAction(formData.code, formData.sap_description)
        if (exist) {
            setDupeAlertModal(exist.id)
        } else {
            onSuccess()
        }
    }

    const handleManualProcess = () => {
        handleCheckDupe(() => {
            if (!isAnalyzed) setIsAnalyzed(true)
        })
    }

    // Autocompletado inteligente manually triggered
    const handleAutoProcess = async () => {
        handleCheckDupe(async () => {
            if (formData.code.split('-').length >= 2 || formData.code.trim().length > 3) {
            const parsed = await parseProductCodeAction(formData.code, formData.sap_description, formData.rh_flag)
            
            let colorName = formData.color_name
            if (parsed.color_code && parsed.color_code !== formData.color_code) {
                const foundColor = await getColorByNameAction(parsed.color_code)
                if (foundColor) colorName = foundColor
            }

            setFormData(prev => ({
                ...prev,
                familia_code: parsed.familia_code || prev.familia_code || '',
                ref_code: parsed.ref_code || prev.ref_code || '',
                version_code: parsed.version_code || prev.version_code || '',
                color_code: parsed.color_code || prev.color_code || '',
                color_name: colorName || '',
                product_type: parsed.product_type || prev.product_type || '',
                use_destination: parsed.use_destination || prev.use_destination || '',
                zone_home: parsed.zone_home || prev.zone_home || '',
                assembled_flag: parsed.assembled_flag ?? prev.assembled_flag ?? false,
                rh_flag: parsed.rh_flag ?? prev.rh_flag ?? false,
                commercial_measure: parsed.commercial_measure || prev.commercial_measure || '',
                accessory_text: parsed.accessory_text || prev.accessory_text || '',
                isometric_path: parsed.isometric_path || prev.isometric_path || '',
                width_cm: parsed.width_cm ? String(parsed.width_cm) : (prev.width_cm || ''),
                depth_cm: parsed.depth_cm ? String(parsed.depth_cm) : (prev.depth_cm || ''),
                height_cm: parsed.height_cm ? String(parsed.height_cm) : (prev.height_cm || ''),
                weight_kg: parsed.weight_kg ? String(parsed.weight_kg) : (prev.weight_kg || ''),
                furniture_name: parsed.furniture_name || prev.furniture_name || '',
                line: parsed.line || prev.line || '',
                designation: parsed.designation || prev.designation || '',
                edge_2mm_flag: parsed.edge_2mm_flag ?? prev.edge_2mm_flag ?? false,
            }))

            if (!isAnalyzed) setIsAnalyzed(true)

            if (!parsed.furniture_name && !parsed.width_cm) {
                toast.warning("Completar campo de nombre.", {
                    description: "No se encontraron hermanos históricos para este código."
                })
            } else {
                toast.success("Datos completados automáticamente.")
            }
        } else {
            toast.error("El código es demasiado corto o inválido.")
        }
        })
    }

    const renderCreatableSelect = (name: keyof typeof formData, options: string[], placeholder: string) => {
        const isCustom = formData[name] === '__NEW__'
        
        if (isCustom) {
            return (
                <div className="flex gap-2">
                    <Input 
                        autoFocus
                        value={customValues[name as keyof typeof customValues] || ''} 
                        onChange={e => setCustomValues(c => ({...c, [name]: e.target.value.toUpperCase()}))}
                        onBlur={() => {
                            if (customValues[name as keyof typeof customValues]) {
                                setFormData(prev => ({...prev, [name]: customValues[name as keyof typeof customValues]}))
                            } else {
                                setFormData(prev => ({...prev, [name]: ''}))
                            }
                        }}
                        placeholder={`Escribe nueva ${placeholder.toLowerCase()}`}
                    />
                    <Button variant="ghost" onClick={() => setFormData(p => ({...p, [name]: ''}))}>X</Button>
                </div>
            )
        }

        const currentValue = String(formData[name]);

        return (
            <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                value={options.includes(currentValue) ? currentValue : (currentValue ? currentValue : '')}
                onChange={(e) => {
                    setFormData(prev => ({ ...prev, [name]: e.target.value }))
                    if (e.target.value !== '__NEW__') {
                        setCustomValues(c => ({...c, [name]: ''}))
                    }
                }}
            >
                <option value="" disabled>Seleccionar {placeholder.toLowerCase()}...</option>
                <option value="__NEW__" className="font-bold text-blue-600 bg-blue-50">➕ Agregar nueva...</option>
                {currentValue && !options.includes(currentValue) && currentValue !== '__NEW__' && (
                    <option value={currentValue}>{currentValue}</option>
                )}
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        )
    }

    // Generación de Nombres en Tiempo Real
    useEffect(() => {
        const ccode = formData.color_code;
        if (ccode && ccode !== '__NEW__') {
            const found = datalistOptions.colors?.find(c => c.code === ccode);
            if (found && found.name !== formData.color_name) {
                setFormData(p => ({ ...p, color_name: found.name }));
            }
        }
    }, [formData.color_code, datalistOptions.colors])

    const handleGenerateNames = async () => {
        if (rules.length > 0) {
            const evalResult = evaluateProductRules(formData as any as Product, rules)
            const finalEs = evalResult.finalNameEs

            if (finalEs !== formData.final_name_es) {
                const { translatedName, isValid, missingTerms } = await translateAction(finalEs, formData)
                
                if (!isValid && missingTerms.length > 0) {
                    toast.error(`Traducción pendiente para: ${missingTerms.join(', ')}`)
                } else if (!isValid) {
                    toast.error(`Traducción bloqueada por reglas de integridad.`)
                }

                setFormData(prev => ({
                    ...prev,
                    final_name_es: finalEs,
                    final_name_en: translatedName
                }))
                toast.success("Nombres finalizados.")
            } else {
                toast.info("No hay cambios en el nombre generado.")
            }
        } else {
            toast.error("Las reglas no han cargado aún.")
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleFamilyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFamilyData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await createProductAction({ ...formData, _newFamily: isNewFamily ? familyData : undefined })
            toast.success("Producto guardado correctamente")
        } catch (err: any) {
            toast.error("Error al guardar: " + err.message)
        }
    }

    return (
        <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full pb-20">
            {dupeAlertModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Card className="max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-amber-600">
                                <AlertTriangle className="w-5 h-5"/>
                                Producto Duplicado
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-600 mb-6">
                                Este producto ya existe en la base de datos, ¿deseas editarlo?
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setDupeAlertModal(null)}>Cancelar</Button>
                                <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => router.push(`/products/${dupeAlertModal}`)}>Sí, deseo editarlo</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
            
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-outfit">Nuevo Producto</h1>
                    <p className="text-slate-500">Agrega un producto nuevo manualmente a la base maestra.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
                <div className="flex flex-col gap-6">
                    <Card className="border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                            <CardTitle className="text-lg font-bold">Detalles Principales</CardTitle>
                            <CardDescription>Ingresa el código y la descripción para autocompletar el resto de campos.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="code" className="font-semibold text-slate-700">Código de Producto (FAM-REF-VER-COL) *</Label>
                                <Input
                                    id="code" name="code" required
                                    placeholder="VBAN12-0032-000-0368"
                                    className="h-12 text-lg font-mono border-slate-300 focus:ring-blue-500"
                                    value={formData.code} onChange={handleChange}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="sap_description" className="font-semibold text-slate-700">Descripción cruda SAP</Label>
                                <Input
                                    id="sap_description" name="sap_description"
                                    placeholder="MUEBLE VITELI LVM 79X48..."
                                    className="h-12 border-slate-300"
                                    value={formData.sap_description} onChange={handleChange}
                                />
                            </div>

                            <div className="pt-2 flex justify-end gap-3">
                                <Button 
                                    variant="outline"
                                    type="button" 
                                    onClick={handleManualProcess}
                                    className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                >
                                    Rellenar Manualmente
                                </Button>
                                <Button 
                                    type="button" 
                                    onClick={handleAutoProcess}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all gap-2"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Generar Automáticamente
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {isAnalyzed && (
                        <>
                            <Card className="border-slate-200 shadow-sm">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                                    <CardTitle className="text-lg font-bold">Validación de Propiedades</CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Tipo de Producto</Label>
                                            {renderCreatableSelect('product_type', datalistOptions.productTypes, 'TIPO DE PRODUCTO')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Nombre del Producto</Label>
                                            {renderCreatableSelect('furniture_name', datalistOptions.furnitureNames || [], 'NOMBRE DEL PRODUCTO')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Código Color (4 dígitos)</Label>
                                            <div className="flex gap-2">
                                                <div className="w-28 text-sm">{renderCreatableSelect('color_code', (datalistOptions.colors || []).map(c=>c.code), 'CÓDIGO COLOR')}</div>
                                                <Input name="color_name" value={formData.color_name} onChange={handleChange} className="flex-1 bg-slate-50" readOnly />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Línea</Label>
                                            {renderCreatableSelect('line', datalistOptions.lines, 'LÍNEA')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Destino de Uso</Label>
                                            {renderCreatableSelect('use_destination', datalistOptions.useDestinations, 'DESTINO DE USO')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Designación</Label>
                                            {renderCreatableSelect('designation', datalistOptions.designations, 'DESIGNACIÓN')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Medida Comercial</Label>
                                            {renderCreatableSelect('commercial_measure', datalistOptions.commercialMeasures || [], 'MEDIDA COMERCIAL')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Accesorios / Rieles</Label>
                                            {renderCreatableSelect('accessory_text', datalistOptions.accessoryTexts || [], 'ACCESORIO/RIEL')}
                                        </div>
                                    </div>

                                    {formData.ref_code && (
                                        <div className="pt-2">
                                            {formData.isometric_path ? (
                                                <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg border border-green-200">
                                                    <FileBadge2 className="w-5 h-5"/>
                                                    <span className="text-sm font-semibold">Isométrico vinculado automáticamente ({formData.ref_code})</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between gap-4 p-4 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
                                                    <div className="flex items-start gap-3">
                                                        <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-600 shrink-0"/>
                                                        <div>
                                                            <span className="text-sm font-bold block">Requiere Isométrico</span>
                                                            <span className="text-xs text-amber-700/80">Puedes adjuntarlo ahora mismo en formato SVG.</span>
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 flex items-center">
                                                        <UploadAssetButton onUploadComplete={(asset) => {
                                                            setFormData(p => ({ ...p, isometric_path: asset.file_path || 'exists' }))
                                                        }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border-blue-200 border-2 shadow-md bg-blue-50/30">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div>
                                        <CardTitle className="text-lg font-bold text-blue-900">Nomenclatura Generada</CardTitle>
                                        <CardDescription>Vista previa de cómo aparecerán los nombres en los documentos.</CardDescription>
                                    </div>
                                    <Button type="button" onClick={handleGenerateNames} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm mt-0">
                                        Generar Nombre Final
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-6 space-y-4">
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-extrabold text-blue-700 uppercase">Nombre Final (ES)</Label>
                                        <div className="p-3 bg-white border border-blue-200 rounded-lg text-sm font-semibold text-blue-900 shadow-inner">
                                            {formData.final_name_es ? formData.final_name_es : (isAnalyzed ? <span className="text-slate-400 italic font-normal">No se generó nombre...</span> : <span className="text-slate-400 italic font-normal">Esperando datos...</span>)}
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-extrabold text-blue-700 uppercase">Nombre Final (EN)</Label>
                                        <div className="p-3 bg-white border border-blue-200 rounded-lg text-sm font-semibold text-blue-900 shadow-inner italic">
                                            {formData.final_name_en ? formData.final_name_en : (isAnalyzed ? <span className="text-slate-400 font-normal">No se generó nombre...</span> : <span className="text-slate-400 font-normal">Esperando datos...</span>)}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-slate-200 shadow-sm">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                                    <CardTitle className="text-lg font-bold font-outfit">Dimensiones (Autocompletadas)</CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Ancho (cm)</Label>
                                            <Input type="number" step="0.1" name="width_cm" value={formData.width_cm} onChange={handleChange} className="border-orange-200 bg-orange-50/20" />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Fondo (cm)</Label>
                                            <Input type="number" step="0.1" name="depth_cm" value={formData.depth_cm} onChange={handleChange} className="border-orange-200 bg-orange-50/20" />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Alto (cm)</Label>
                                            <Input type="number" step="0.1" name="height_cm" value={formData.height_cm} onChange={handleChange} className="border-orange-200 bg-orange-50/20" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Peso (kg)</Label>
                                            <Input type="number" step="0.1" name="weight_kg" value={formData.weight_kg} onChange={handleChange} className="border-orange-200 bg-orange-50/20" />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Apilamiento Max</Label>
                                            <Input type="number" name="stacking_max" value={formData.stacking_max} onChange={handleChange} />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-6 mt-6 p-5 bg-slate-50 border border-slate-100 rounded-xl">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox id="rh_flag" checked={formData.rh_flag} onCheckedChange={(c) => setFormData(p => ({ ...p, rh_flag: !!c }))} />
                                            <Label htmlFor="rh_flag" className="font-semibold text-slate-700">Es RH</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox id="assembled_flag" checked={formData.assembled_flag} onCheckedChange={(c) => setFormData(p => ({ ...p, assembled_flag: !!c }))} />
                                            <Label htmlFor="assembled_flag" className="font-semibold text-slate-700">Es Armado</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox id="edge_2mm_flag" checked={formData.edge_2mm_flag} onCheckedChange={(c) => setFormData(p => ({ ...p, edge_2mm_flag: !!c }))} />
                                            <Label htmlFor="edge_2mm_flag" className="font-semibold text-slate-700">Canto 2mm</Label>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="flex gap-2 justify-end mt-4">
                                <Link href="/products">
                                    <Button variant="outline" type="button" className="h-11 px-8">Cancelar</Button>
                                </Link>
                                <Button onClick={handleSubmit} className="bg-slate-900 hover:bg-slate-800 text-white h-11 px-10 font-bold shadow-lg">
                                    Guardar Producto
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
