'use client'

import { useState, useEffect, use } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'
import { updateFamilyAction, getUniquePropertiesAction } from '@/app/products/actions'
import { ArrowLeft, Loader2, Plus, X, ShieldCheck, Box, Layers, MapPin, Settings2, AlertTriangle, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function EditFamilyPage({ params: paramsPromise }: { params: Promise<{ code: string }> }) {
    const params = use(paramsPromise)
    const code = params.code
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [datalistOptions, setDatalistOptions] = useState<any>({})
    const [customValues, setCustomValues] = useState<any>({})
    
    const [formData, setFormData] = useState({
        name: '',
        zone_home: '',
        allowed_lines: [] as string[],
        product_type: '',
        use_destination: '',
        rh_default: false,
        assembled_default: false
    })

    useEffect(() => {
        let isMounted = true
        const init = async () => {
            try {
                // 1. Fetch Datalists
                const options = await getUniquePropertiesAction()
                if (isMounted) setDatalistOptions(options)

                // 2. Fetch Family Details
                const response = await fetch(`/api/families/${code}`)
                if (response.ok) {
                    const data = await response.json()
                    if (isMounted) {
                        setFormData({
                            name: data.name || '',
                            zone_home: data.zone_home || '',
                            allowed_lines: Array.isArray(data.allowed_lines) ? data.allowed_lines : [],
                            product_type: data.product_type || '',
                            use_destination: data.use_destination || '',
                            rh_default: !!data.rh_default,
                            assembled_default: !!data.assembled_default
                        })
                    }
                }
            } catch (err) {
                console.error("Initialization Error:", err)
                if (isMounted) toast.error("Error al cargar los datos de la familia.")
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        init()
        return () => { isMounted = false }
    }, [code])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            await updateFamilyAction(code, formData)
            toast.success("Familia actualizada correctamente.")
            router.push('/families')
        } catch (err) {
            console.error("Failed to update family:", err)
            toast.error("Error al guardar los cambios.")
        } finally {
            setSaving(false)
        }
    }

    const toggleLine = (line: string) => {
        setFormData(prev => {
            const current = prev.allowed_lines
            if (current.includes(line)) {
                return { ...prev, allowed_lines: current.filter(l => l !== line) }
            } else {
                return { ...prev, allowed_lines: [...current, line].sort() }
            }
        })
    }

    const renderCreatableSelect = (
        name: string, 
        options: string[], 
        placeholder: string,
        icon?: React.ReactNode
    ) => {
        const isCustom = formData[name as keyof typeof formData] === '__NEW__'
        if (isCustom) {
            return (
                <div className="flex gap-2 animate-in fade-in zoom-in-95 duration-200">
                    <Input 
                        autoFocus
                        className="bg-white border-blue-300 shadow-sm focus:ring-blue-500"
                        value={customValues[name] || ''} 
                        onChange={e => setCustomValues((c: any) => ({...c, [name]: e.target.value}))}
                        onBlur={() => {
                            if (customValues[name]) {
                                setFormData((prev: any) => ({...prev, [name]: customValues[name]}))
                            } else {
                                setFormData((prev: any) => ({...prev, [name]: ''}))
                            }
                        }}
                        placeholder={`Nueva ${placeholder.toLowerCase()}...`}
                    />
                    <Button 
                        variant="outline" 
                        size="icon"
                        className="shrink-0 border-slate-200 hover:bg-slate-100"
                        onClick={() => setFormData((p: any) => ({...p, [name]: ''}))}
                    >
                        <X className="w-4 h-4 text-slate-500" />
                    </Button>
                </div>
            )
        }

        const currentValue = String(formData[name as keyof typeof formData] || '');

        return (
            <div className="relative">
                {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>}
                <select 
                    className={`flex h-10 w-full rounded-xl border border-slate-200 bg-white ${icon ? 'pl-10' : 'px-3'} py-2 text-sm shadow-sm ring-offset-background transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 appearance-none`}
                    value={options.includes(currentValue) ? currentValue : (currentValue ? currentValue : '')}
                    onChange={(e) => {
                        setFormData((prev: any) => ({ ...prev, [name]: e.target.value }))
                    }}
                >
                    <option value="">Seleccionar {placeholder.toLowerCase()}...</option>
                    {options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                    <option value="__NEW__" className="text-blue-600 font-bold">+ Agregar nueva...</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex flex-col h-[600px] items-center justify-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                <p className="text-slate-500 font-medium animate-pulse">Cargando configuración de familia...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full py-12 px-4 md:px-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/families">
                        <Button variant="ghost" className="rounded-xl hover:bg-white shadow-sm border border-slate-200">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Catálogo
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Editor Maestro</span>
                            <span className="text-slate-400 text-xs font-medium">Familia Técnica</span>
                        </div>
                        <h1 className="text-4xl font-black tracking-tight text-slate-900 font-outfit uppercase leading-none">
                            {code}
                        </h1>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <Button 
                        variant="outline" 
                        onClick={() => router.push('/families')}
                        className="rounded-xl border-slate-200"
                    >
                        Descartar
                    </Button>
                    <Button 
                        onClick={handleSubmit}
                        className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200 px-8"
                        disabled={saving}
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                        {saving ? 'Guardando...' : 'Aplicar Cambios'}
                    </Button>
                </div>
            </div>

            <div className="grid gap-8 grid-cols-1 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-8">
                    {/* Tarjeta Principal */}
                    <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm overflow-hidden border-t-4 border-t-amber-500">
                        <CardHeader className="pb-2 bg-gradient-to-br from-amber-50/50 to-white">
                            <div className="flex items-center gap-2 mb-2">
                                <Box className="w-5 h-5 text-amber-600" />
                                <CardTitle className="text-xl font-bold text-amber-900 uppercase tracking-tight">Estructura Técnica</CardTitle>
                            </div>
                            <CardDescription className="text-amber-800/60 font-medium italic">
                                Define el ADN de la familia. Estos valores serán los predeterminados para cualquier producto nuevo.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-8">
                            <div className="grid gap-6">
                                <div className="grid gap-2">
                                    <Label className="text-xs font-bold text-amber-800 uppercase tracking-widest ml-1">Nombre Comercial de la Familia</Label>
                                    <Input
                                        className="h-12 text-lg font-bold bg-white border-amber-100 focus:border-amber-400 focus:ring-amber-100 rounded-xl"
                                        placeholder="Ej: MUEBLE DE BAÑO LIFE..."
                                        value={formData.name}
                                        onChange={e => setFormData(p => ({...p, name: e.target.value}))}
                                    />
                                </div>

                                <div className="grid sm:grid-cols-2 gap-6">
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold text-amber-800 uppercase tracking-widest ml-1">Tipo de Producto</Label>
                                        {renderCreatableSelect('product_type', datalistOptions.productTypes || [], 'TIPO', <Layers className="w-4 h-4" />)}
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold text-amber-800 uppercase tracking-widest ml-1">Uso / Destino</Label>
                                        {renderCreatableSelect('use_destination', datalistOptions.useDestinations || [], 'DESTINO', <Box className="w-4 h-4" />)}
                                    </div>
                                </div>

                                <div className="grid sm:grid-cols-2 gap-6">
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold text-amber-800 uppercase tracking-widest ml-1">Zona (Ambiente)</Label>
                                        {renderCreatableSelect('zone_home', datalistOptions.zoneHomes || [], 'ZONA', <MapPin className="w-4 h-4" />)}
                                    </div>
                                    <div className="flex items-end">
                                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 w-full flex items-center gap-2">
                                            <ShieldCheck className="w-5 h-5 text-amber-500" />
                                            <span className="text-[10px] text-amber-800 leading-tight font-medium uppercase">
                                                Información sincronizada con el motor de nomenclatura V2.1
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Selector de Líneas Múltiples */}
                    <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm border-t-4 border-t-blue-500 overflow-hidden">
                        <CardHeader className="pb-2 bg-gradient-to-br from-blue-50/50 to-white">
                            <div className="flex items-center gap-2 mb-2">
                                <Layers className="w-5 h-5 text-blue-600" />
                                <CardTitle className="text-xl font-bold text-blue-900 uppercase tracking-tight">Líneas Comerciales Autorizadas</CardTitle>
                            </div>
                            <CardDescription className="text-blue-800/60 font-medium">
                                Selecciona todas las marcas comerciales bajo las cuales se vende esta familia técnica.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="flex flex-wrap gap-2 mb-6 min-h-[48px] p-4 bg-blue-50/30 rounded-2xl border-2 border-dashed border-blue-100">
                                {formData.allowed_lines?.length > 0 ? (
                                    formData.allowed_lines.map(line => (
                                        <Badge 
                                            key={line} 
                                            className="h-8 pl-3 pr-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg border-none flex items-center gap-2 shadow-sm transition-all"
                                        >
                                            {line}
                                            <button 
                                                onClick={() => toggleLine(line)}
                                                className="hover:bg-blue-800 p-1 rounded-md transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </Badge>
                                    ))
                                ) : (
                                    <p className="text-blue-400 text-sm font-medium italic py-1">No hay líneas autorizadas asignadas.</p>
                                )}
                            </div>

                            <div className="grid gap-3">
                                <Label className="text-xs font-bold text-blue-800 uppercase tracking-widest ml-1">Agregar o Quitar Líneas</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {(datalistOptions.lines || ['PRO', 'LIFE', 'ESSENTIAL', 'PREMIUM']).map((line: string) => {
                                        const isActive = formData.allowed_lines.includes(line)
                                        return (
                                            <button
                                                key={line}
                                                type="button"
                                                onClick={() => toggleLine(line)}
                                                className={`text-xs font-bold py-2.5 px-3 rounded-xl border transition-all flex items-center justify-between ${
                                                    isActive 
                                                    ? 'bg-blue-100 border-blue-300 text-blue-700' 
                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-blue-200 hover:bg-blue-50/50'
                                                }`}
                                            >
                                                {line}
                                                {isActive ? <ShieldCheck className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 opacity-50" />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-8">
                    {/* Configuración de Defaults */}
                    <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/80 backdrop-blur-sm border-t-4 border-t-indigo-500">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-2">
                                <Settings2 className="w-5 h-5 text-indigo-600" />
                                <CardTitle className="text-lg font-bold text-indigo-900 uppercase">Configuración</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-bold text-indigo-900">Armado (RTI)</Label>
                                    <p className="text-[10px] text-indigo-700/70 font-medium">Marcado como armado por defecto.</p>
                                </div>
                                <Checkbox 
                                    className="w-5 h-5 rounded-md border-indigo-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                    checked={formData.assembled_default}
                                    onCheckedChange={(v) => setFormData(p => ({...p, assembled_default: !!v}))}
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-bold text-indigo-900">RH Especial</Label>
                                    <p className="text-[10px] text-indigo-700/70 font-medium">Marcado como RH por defecto.</p>
                                </div>
                                <Checkbox 
                                    className="w-5 h-5 rounded-md border-indigo-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                    checked={formData.rh_default}
                                    onCheckedChange={(v) => setFormData(p => ({...p, rh_default: !!v}))}
                                />
                            </div>

                            <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 shadow-inner border border-slate-700">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nota de Ingeniería</span>
                                </div>
                                <p className="text-[11px] leading-relaxed text-slate-300">
                                    Si una variante de producto contiene el código <span className="font-mono text-white underline">MRH</span> o <span className="font-mono text-white underline">ESTÁNDAR</span> en su nomenclatura, el sistema priorizará dicho código sobre la configuración técnica definida aquí.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    
                    {/* Preview de Generación */}
                    <div className="p-6 bg-gradient-to-br from-slate-100 to-slate-200/50 rounded-3xl border border-slate-200/50 shadow-inner space-y-4">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-blue-600" />
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Impacto en Nomenclatura</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tighter">
                                    {formData.product_type || 'TIPO'} {formData.use_destination || 'USO'} {code}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tighter">
                                    {formData.allowed_lines?.length > 0 ? formData.allowed_lines[0] : 'LÍNEA'} RANGE ASSOCIATION
                                </span>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-300/50">
                            <p className="text-[10px] text-slate-500 font-medium italic py-1">
                                Estas reglas se aplican en tiempo real al motor de traducción bilingüe (EN/ES).
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
