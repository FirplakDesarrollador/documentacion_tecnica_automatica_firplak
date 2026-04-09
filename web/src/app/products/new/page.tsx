'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createProductAction, getUniquePropertiesAction, parseProductCodeAction, translateAction, checkProductExistsAction, getDiagnosticInfoAction } from '../actions'
import { Checkbox } from '@/components/ui/checkbox'
import { getColorByNameAction, getRulesAction } from '@/app/rules/actions'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { FileBadge2, AlertTriangle, Sparkles, Building2, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Product } from '@prisma/client'
import { UploadAssetButton } from '@/components/assets/UploadAssetButton'
import { getClientsAction } from '../actions'

export default function NewProductPage() {
    const router = useRouter()
    const [dupeAlertModal, setDupeAlertModal] = useState<string | null>(null)
    const [customValues, setCustomValues] = useState({ line: '', designation: '', product_type: '', use_destination: '', zone_home: '', bisagras: '', carb2: '' })
    const [clients, setClients] = useState<{id: string, name: string}[]>([])
    const [isPrivateLabel, setIsPrivateLabel] = useState(false)
    const [privateLabelData, setPrivateLabelData] = useState({
        client_id: '',
        client_name: '',
        logo_id: ''
    })
    const [hasBarcode, setHasBarcode] = useState(false)
    
    const [formData, setFormData] = useState({
        code: '',
        sap_description: '',
        product_type: '',
        cabinet_name: '',
        color_code: '',
        color_name: '',
        rh: 'NA',
        assembled_flag: false,
        canto_puertas: '',
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
        isometric_path: '',
        isometric_asset_id: '',
        bisagras: 'NA',
        carb2: 'NA',
        special_label: 'NA',
        status: 'ACTIVO',
        barcode_text: '',
        armado_con_lvm: '',
        door_color_text: 'NA'
    })

    const [datalistOptions, setDatalistOptions] = useState({ lines: [] as string[], designations: [] as string[], productTypes: [] as string[], useDestinations: [] as string[], cabinetNames: [] as string[], commercialMeasures: [] as string[], accessoryTexts: [] as string[], colors: [] as {code: string, name: string}[], bisagras: [] as string[], carb2: [] as string[], specialLabels: [] as string[], zoneHomes: [] as string[] })

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
        console.log("LOG: Iniciando carga de reglas en NewProductPage...");
        
        getRulesAction().then(r => {
            console.log("LOG: Resultado getRulesAction:", r);
            if (Array.isArray(r)) {
                console.log(`LOG: Se cargaron ${r.length} reglas.`);
                setRules(r);
            } else {
                console.error("LOG: getRulesAction NO devolvió un array:", r);
            }
        }).catch(err => {
            console.error("LOG: Error fatal en getRulesAction:", err);
            toast.error("Fallo al conectar con el servidor de reglas.");
        });

        getUniquePropertiesAction().then(res => {
            console.log("LOG: Opciones cargadas correctamente.");
            setDatalistOptions(res as any);
        });

        getDiagnosticInfoAction().then(diag => {
            console.log("LOG: Diagnóstico del Servidor:", diag);
            if (diag.error) {
                toast.error("Error de Diagnóstico: " + diag.error);
            } else if (diag.rulesCount === 0) {
                toast.warning("El servidor reporta 0 reglas habilitadas.");
            }
        });

        getClientsAction().then(c => setClients(c))
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
            const parsed = await parseProductCodeAction(formData.code, formData.sap_description, formData.rh === 'RH')
            
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
                rh: parsed.rh || prev.rh || 'NA',
                canto_puertas: parsed.canto_puertas || prev.canto_puertas || '',
                cabinet_name: parsed.cabinet_name || prev.cabinet_name || '',
                line: parsed.line || prev.line || '',
                designation: parsed.designation || prev.designation || '',
                commercial_measure: parsed.commercial_measure || prev.commercial_measure || '',
                width_cm: parsed.width_cm ? String(parsed.width_cm) : prev.width_cm || '',
                depth_cm: parsed.depth_cm ? String(parsed.depth_cm) : prev.depth_cm || '',
                height_cm: parsed.height_cm ? String(parsed.height_cm) : prev.height_cm || '',
                weight_kg: parsed.weight_kg ? String(parsed.weight_kg) : prev.weight_kg || '',
                accessory_text: parsed.accessory_text || prev.accessory_text || '',
                bisagras: parsed.bisagras || prev.bisagras || 'NA',
                carb2: parsed.carb2 || prev.carb2 || 'NA',
                special_label: parsed.special_label || prev.special_label || 'NA',
                barcode_text: parsed.barcode_text || prev.barcode_text || '',
                status: parsed.status || prev.status || 'ACTIVO',
                armado_con_lvm: parsed.armado_con_lvm || prev.armado_con_lvm || ''
            }))

            if (parsed.barcode_text) setHasBarcode(true)

            if (!isAnalyzed) setIsAnalyzed(true)

            if (!parsed.cabinet_name && !parsed.width_cm) {
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

    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.cabinet_name && rules.length > 0) {
                handleGenerateNames();
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [
        formData.cabinet_name, formData.color_code, formData.line, 
        formData.designation, formData.commercial_measure, formData.accessory_text,
        formData.rh, formData.assembled_flag, formData.canto_puertas,
        formData.carb2, formData.bisagras, formData.special_label, formData.door_color_text
    ]);

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
        
        // Validación de Isométrico Obligatorio
        if (!formData.isometric_path || formData.isometric_path === '') {
            toast.error("El isométrico es obligatorio", {
                description: "Debes subir un archivo SVG o que el sistema lo vincule automáticamente antes de guardar."
            })
            return
        }

        try {
            await createProductAction({ 
                ...formData, 
                _newFamily: isNewFamily ? familyData : undefined,
                private_label_flag: isPrivateLabel,
                private_label_client_id: privateLabelData.client_id,
                private_label_client_name: privateLabelData.client_id === '__NEW__' ? privateLabelData.client_name : (clients.find(c => c.id === privateLabelData.client_id)?.name || ''),
                private_label_logo_id: privateLabelData.logo_id
            })
            toast.success("Producto guardado correctamente")
            router.push('/products')
        } catch (err: any) {
            if (err.message.includes('NEXT_REDIRECT')) return; // Dejar que Next.js maneje la redirección
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

                            {/* Marca Propia Section */}
                            <div className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-indigo-600" />
                                        <div>
                                            <p className="text-sm font-bold text-indigo-900">¿Es Marca Propia?</p>
                                            <p className="text-[10px] text-indigo-700/70">Marca personalizada para el cliente (ej: CHILEMAT)</p>
                                        </div>
                                    </div>
                                    <Checkbox 
                                        checked={isPrivateLabel} 
                                        onCheckedChange={(c) => setIsPrivateLabel(!!c)}
                                        className="h-6 w-6 border-indigo-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                    />
                                </div>

                                {isPrivateLabel && (
                                    <div className="grid gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-indigo-700 uppercase">Cliente / Marca</Label>
                                            <select 
                                                className="flex h-10 w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                                value={privateLabelData.client_id}
                                                onChange={(e) => setPrivateLabelData(p => ({ ...p, client_id: e.target.value }))}
                                            >
                                                <option value="" disabled>Seleccionar marca...</option>
                                                <option value="__NEW__" className="font-bold text-indigo-600 bg-indigo-50">➕ Agregar nueva marca...</option>
                                                {clients.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {privateLabelData.client_id === '__NEW__' && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded-lg border border-indigo-100 shadow-sm animate-in zoom-in-95 duration-200">
                                                <div className="grid gap-2">
                                                    <Label className="text-xs font-bold text-slate-500 uppercase">Nombre de la Marca</Label>
                                                    <Input 
                                                        placeholder="Ej: SODIMAC"
                                                        value={privateLabelData.client_name}
                                                        onChange={(e) => setPrivateLabelData(p => ({ ...p, client_name: e.target.value.toUpperCase() }))}
                                                        className="border-indigo-100"
                                                    />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label className="text-xs font-bold text-slate-500 uppercase">Logo de Cliente</Label>
                                                    <div className="flex items-center gap-2">
                                                        <UploadAssetButton 
                                                            onUploadComplete={(asset) => setPrivateLabelData(p => ({ ...p, logo_id: asset.id }))}
                                                            variant="outline"
                                                            className="flex-1 border-indigo-100 text-indigo-700 hover:bg-indigo-50"
                                                            label="Subir Logo"
                                                        />
                                                        {privateLabelData.logo_id && (
                                                            <div className="w-10 h-10 bg-green-50 border border-green-200 rounded flex items-center justify-center">
                                                                <ImageIcon className="w-5 h-5 text-green-600" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
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
                                            {renderCreatableSelect('cabinet_name', datalistOptions.cabinetNames || [], 'NOMBRE DEL PRODUCTO')}
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
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Canto Puertas</Label>
                                            <Input
                                                name="canto_puertas"
                                                placeholder="Ej: CANTO 2MM"
                                                value={formData.canto_puertas}
                                                onChange={handleChange}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Material / RH</Label>
                                            <Input 
                                                name="rh" 
                                                value={formData.rh} 
                                                onChange={handleChange} 
                                                placeholder="RH / NA"
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Accesorios / Rieles</Label>
                                            {renderCreatableSelect('accessory_text', datalistOptions.accessoryTexts || [], 'ACCESORIO/RIEL')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Bisagras</Label>
                                            {renderCreatableSelect('bisagras', datalistOptions.bisagras || [], 'BISAGRAS')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">CARB2</Label>
                                            {renderCreatableSelect('carb2', datalistOptions.carb2 || [], 'CARB2')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Zona</Label>
                                            {renderCreatableSelect('zone_home', datalistOptions.zoneHomes || [], 'ZONA')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Etiqueta Especial</Label>
                                            <Input 
                                                name="special_label" 
                                                value={formData.special_label} 
                                                onChange={handleChange} 
                                                placeholder="Ej: FRENTES 18MM"
                                            />
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
                                                            setFormData(p => ({ 
                                                                ...p, 
                                                                isometric_path: asset.file_path || 'exists',
                                                                isometric_asset_id: asset.id
                                                            }))
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
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Peso Bruto (kg)</Label>
                                            <Input type="number" step="0.1" name="weight_kg" value={formData.weight_kg} onChange={handleChange} className="border-orange-200 bg-orange-50/20" />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Apilamiento Max</Label>
                                            <Input type="number" name="stacking_max" value={formData.stacking_max} onChange={handleChange} />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-8 mt-6 p-5 bg-slate-50 border border-slate-100 rounded-xl">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox id="assembled_flag" checked={formData.assembled_flag} onCheckedChange={(c) => setFormData(p => ({ ...p, assembled_flag: !!c }))} />
                                            <Label htmlFor="assembled_flag" className="font-semibold text-slate-700">Es Armado</Label>
                                        </div>

                                        {formData.assembled_flag && (
                                            <div className="flex items-center gap-3 animate-in slide-in-from-left-2 duration-200">
                                                <Label htmlFor="armado_con_lvm" className="text-xs font-bold text-slate-500 uppercase shrink-0">Armado con LVM</Label>
                                                <Input 
                                                    id="armado_con_lvm"
                                                    name="armado_con_lvm"
                                                    value={formData.armado_con_lvm}
                                                    onChange={handleChange}
                                                    placeholder="Ej: LVM SIKUANI"
                                                    className="w-48 h-8 text-xs border-blue-200 focus:ring-blue-500"
                                                />
                                            </div>
                                        )}

                                        <div className="flex items-center space-x-2 border-l border-slate-200 pl-8">
                                            <Checkbox id="has_barcode" checked={hasBarcode} onCheckedChange={(c) => setHasBarcode(!!c)} />
                                            <Label htmlFor="has_barcode" className="font-semibold text-slate-700">¿Lleva código de barra?</Label>
                                        </div>

                                        {hasBarcode && (
                                            <div className="flex items-center gap-3 animate-in slide-in-from-left-2 duration-200">
                                                <Label htmlFor="barcode_text" className="text-xs font-bold text-slate-500 uppercase shrink-0">Código de Barra</Label>
                                                <Input 
                                                    id="barcode_text"
                                                    name="barcode_text"
                                                    value={formData.barcode_text}
                                                    onChange={handleChange}
                                                    placeholder="Ingresa código..."
                                                    className="w-48 h-8 text-xs border-indigo-200 focus:ring-indigo-500"
                                                />
                                            </div>
                                        )}
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
