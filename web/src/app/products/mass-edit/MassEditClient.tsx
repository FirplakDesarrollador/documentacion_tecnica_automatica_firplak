'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { massUpdateProducts } from '../actions'
import { applyNamingRulesAction, NamingBatchResult } from '../naming-actions'
import { Badge } from '@/components/ui/badge'
import { 
    Search, Filter, Save, Download, RefreshCcw, Loader2, 
    CheckCircle2, AlertCircle, Trash2, Edit3, X, ChevronRight,
    ArrowLeft, RotateCcw, PlusCircle, Settings, AlertTriangle
} from 'lucide-react'
import Link from 'next/link'
import { deleteProducts, translateProductsAction, saveGlossaryTermsAction } from '../actions'
import { cn } from "@/lib/utils"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

interface Product {
    id: string
    code: string
    familia_code: string | null
    ref_code: string | null
    product_type: string | null
    designation: string | null
    furniture_name: string | null
    canto_puertas: string | null
    rh: string | null
    rh_flag: boolean
    assembled_flag: boolean
    commercial_measure: string | null
    accessory_text: string | null
    door_color_text: string | null
    carb2: string | null
    special_label: string | null
    private_label_client_name: string | null
    armado_con_lvm: string | null
    line: string | null
    use_destination: string | null
    validation_status: string
    sap_description: string | null
    zone_home: string | null
    color_code: string | null
    width_cm: number | null
    depth_cm: number | null
    height_cm: number | null
    final_name_en: string | null
    final_name_es: string | null
    status: string
}

import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'

interface MassEditClientProps {
    products: Product[]
    families: { value: string, label: string }[]
}

export function MassEditClient({ products: initialProducts, families }: MassEditClientProps) {
    const [products, setProducts] = useState<Product[]>(initialProducts)
    const [filterFamily, setFilterFamily] = useState<string[]>([])
    const [filterRef, setFilterRef] = useState<string[]>([])
    const [filterMeasure, setFilterMeasure] = useState<string[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Deletion states
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteStep, setDeleteStep] = useState(0)
    const [isDeleting, setIsDeleting] = useState(false)
    const [idsToDelete, setIdsToDelete] = useState<string[]>([])

    const CONFIRMATION_STEPS = [
        "¿Estás segur@ de que deseas eliminar permanentemente estos elementos?",
        "¿Estás bien, bien segur@ de lo que haces?",
        "Mira que vas a borrar esto para siempre... ¿Eres human@ de verdad?",
        "Bueno, conste que te avisé. Si le das a 'Sí' otra vez se eliminará y no hay vuelta atrás.",
        "Ok, ok, te doy una última oportunidad... ¿Sí lo eliminas definitivamente?"
    ]

    // Batch update state
    const [batchUpdates, setBatchUpdates] = useState({
        canto_puertas: '',
        rh: '',
        assembled_flag: '', // Cambiado a string para consistencia con los demás selects
        validation_status: '',
        zone_home: '',
        designation: '',
        status: '',
        special_label: '',
    })

    const filteredProducts = useMemo(() => {
        // Si no hay filtros seleccionados, no mostrar nada para evitar selecciones masivas accidentales
        if (filterFamily.length === 0 && filterRef.length === 0 && filterMeasure.length === 0) {
            return []
        }

        return products.filter(p => {
            // Normalize product familia_code by removing prefixes if necessary
            let normalizedPCode = p.familia_code || ''
            if (/^[VCP]([A-Z]{3,4}\d{2})$/i.test(normalizedPCode)) {
                normalizedPCode = normalizedPCode.substring(1)
            } else if (/^[VCP](?!$)/i.test(normalizedPCode)) {
                // If it starts with V, C, or P and followed by anything, assume it's a prefix
                normalizedPCode = normalizedPCode.substring(1)
            }

            const matchFam = filterFamily.length === 0 || filterFamily.includes(normalizedPCode) || filterFamily.includes(p.familia_code || '')
            const matchRef = filterRef.length === 0 || (p.ref_code && filterRef.includes(p.ref_code))
            const matchMeas = filterMeasure.length === 0 || (p.commercial_measure && filterMeasure.includes(p.commercial_measure))
            return matchFam && matchRef && matchMeas
        })
    }, [products, filterRef, filterFamily, filterMeasure])

    const references = useMemo(() => {
        if (filterFamily.length === 0) return []
        const availableProducts = products.filter(p => {
            let normalizedPCode = p.familia_code || ''
            if (/^[VCP]/i.test(normalizedPCode)) normalizedPCode = normalizedPCode.substring(1)
            return filterFamily.includes(normalizedPCode) || filterFamily.includes(p.familia_code || '')
        })
        const uniqueRefs = new Map<string, string>()
        availableProducts.forEach(p => {
            if (p.ref_code) uniqueRefs.set(p.ref_code, p.furniture_name || '')
        })
        return Array.from(uniqueRefs.entries()).map(([value, label]) => ({
            value,
            label: `${value} - ${label}`
        })).sort((a, b) => a.value.localeCompare(b.value))
    }, [products, filterFamily])

    const measures = useMemo(() => {
        if (filterFamily.length === 0) return []
        const availableProducts = products.filter(p => {
            let normalizedPCode = p.familia_code || ''
            if (/^[VCP]/i.test(normalizedPCode)) normalizedPCode = normalizedPCode.substring(1)
            const matchFam = filterFamily.includes(normalizedPCode) || filterFamily.includes(p.familia_code || '')
            // Note: User says measures should not depend on references:
            // "El filtro de medidas no se condiciona a que haya o no opciones en las referencias."
            return matchFam
        })
        return Array.from(new Set(availableProducts.map(p => p.commercial_measure).filter(Boolean))) as string[]
    }, [products, filterFamily])

    const handleFamilyChange = (vals: string[]) => {
        setFilterFamily(vals)
        if (vals.length === 0) {
            setFilterRef([])
            setFilterMeasure([])
        } else {
            setFilterRef([])
            setFilterMeasure([])
        }
    }

    const handleReferenceChange = (vals: string[]) => {
        setFilterRef(vals)
        setFilterMeasure([])
    }

    const handleSelectAll = (checked: boolean) => {
        if (filteredProducts.length === 0) return
        if (checked) {
            setSelectedIds(new Set(filteredProducts.map(p => p.id)))
        } else {
            setSelectedIds(new Set())
        }
    }

    const handleSelectOne = (id: string, checked: boolean) => {
        const newSet = new Set(selectedIds)
        if (checked) newSet.add(id)
        else newSet.delete(id)
        setSelectedIds(newSet)
    }

    const handleApplyBatchUpdate = async () => {
        if (selectedIds.size === 0) {
            toast.error("Selecciona al menos un producto para actualizar")
            return
        }

        const idsArray = Array.from(selectedIds)
        const updates: any = {}

        if (batchUpdates.canto_puertas) {
            updates.canto_puertas = batchUpdates.canto_puertas
        }
        if (batchUpdates.rh) {
            updates.rh = batchUpdates.rh
        }
        if (batchUpdates.assembled_flag !== '') {
            updates.assembled_flag = batchUpdates.assembled_flag === 'true'
        }
        if (batchUpdates.validation_status) {
            updates.validation_status = batchUpdates.validation_status
        }
        if (batchUpdates.zone_home) {
            updates.zone_home = batchUpdates.zone_home
        }
        if (batchUpdates.designation) {
            updates.designation = batchUpdates.designation
        }
        if (batchUpdates.status) {
            updates.status = batchUpdates.status
        }
        if (batchUpdates.special_label) {
            updates.special_label = batchUpdates.special_label
        }

        try {
            await massUpdateProducts(idsArray, updates)

            setProducts(prev => prev.map(p =>
                idsArray.includes(p.id) ? { ...p, ...updates } : p
            ))

            toast.success(`Se actualizaron ${idsArray.length} productos correctamente`)
            setSelectedIds(new Set())
        } catch (error) {
            console.error(error)
            toast.error("Error al actualizar productos")
        }
    }

    const [isTranslating, setIsTranslating] = useState(false)
    const [missingTermsData, setMissingTermsData] = useState<{ term_es: string, term_en: string, category: string, priority: number }[]>([])
    const [missingTermsDialogOpen, setMissingTermsDialogOpen] = useState(false)
    const [isSavingGlossary, setIsSavingGlossary] = useState(false)

    // Naming RPC progress state
    const [isNaming, setIsNaming] = useState(false)
    const [namingProgress, setNamingProgress] = useState(0)
    const [namingBatches, setNamingBatches] = useState<NamingBatchResult[]>([])
    const [namingTotal, setNamingTotal] = useState(0)

    const handleApplyNamingRules = async () => {
        if (selectedIds.size === 0) {
            toast.error('Selecciona al menos un producto para aplicar las reglas de nomenclatura')
            return
        }
        const idsArray = Array.from(selectedIds)
        setIsNaming(true)
        setNamingProgress(0)
        setNamingBatches([])
        setNamingTotal(idsArray.length)

        try {
            const result = await applyNamingRulesAction(idsArray)
            setNamingBatches(result.batches)
            setNamingProgress(100)

            if (result.success) {
                toast.success(`Motor de nombrado aplicado: ${result.totalUpdated} productos actualizados.`)
                // Reload page to reflect updated names
                window.location.reload()
            } else {
                toast.error(`Error en el proceso: ${result.batches.find(b => b.error)?.error}`)
            }
        } catch (err: any) {
            toast.error(`Error inesperado: ${err.message}`)
        } finally {
            setIsNaming(false)
        }
    }

    const handleBatchTranslate = async (mode: 'missing' | 'repair' | 'all') => {
        if (selectedIds.size === 0) {
            toast.error("Selecciona productos para traducir")
            return
        }

        setIsTranslating(true)
        const idsArray = Array.from(selectedIds)

        try {
            const result = await translateProductsAction(idsArray, mode)
            if (result.success) {
                toast.success(result.message)
                
                if (result.updatedProducts && result.updatedProducts.length > 0) {
                    const updates = result.updatedProducts;
                    setProducts(prev => prev.map(p => {
                        const up = updates.find(u => u.id === p.id);
                        if (up) {
                            return { ...p, final_name_en: up.final_name_en, validation_status: up.final_name_en.includes('[') ? 'needs_review' : 'ready' };
                        }
                        return p;
                    }));
                }

                if (result.missingTerms && result.missingTerms.length > 0) {
                    setMissingTermsData(result.missingTerms.map((term: string) => ({
                        term_es: term,
                        term_en: '',
                        category: 'MODEL',
                        priority: 10
                    })))
                    setMissingTermsDialogOpen(true)
                }
            } else {
                toast.error(result.message)
            }
        } catch (error) {
            console.error(error)
            toast.error("Error en la traducción masiva")
        } finally {
            setIsTranslating(false)
        }
    }

    const handleSaveGlossary = async () => {
        const validTerms = missingTermsData.filter(t => t.term_en.trim() !== '')
        if (validTerms.length === 0) {
            toast.error("Ingresa al menos una traducción para guardar")
            return
        }

        setIsSavingGlossary(true)
        try {
            const res = await saveGlossaryTermsAction(validTerms)
            if (res.success) {
                toast.success(res.message)
                setMissingTermsDialogOpen(false)
                // Re-ejecutar traducción automáticamente para los seleccionados
                setTimeout(() => handleBatchTranslate('repair'), 500)
            } else {
                toast.error(res.message)
            }
        } catch (error: any) {
            toast.error("Error al guardar en el glosario")
        } finally {
            setIsSavingGlossary(false)
        }
    }

    const startDelete = (ids: string[]) => {
        if (ids.length === 0) {
            toast.error("Selecciona al menos un producto para eliminar")
            return
        }
        setIdsToDelete(ids)
        setDeleteStep(0)
        setDeleteOpen(true)
    }

    const cancelDelete = () => {
        setDeleteOpen(false)
        setDeleteStep(0)
        setIdsToDelete([])
    }

    const confirmDelete = async () => {
        if (deleteStep < CONFIRMATION_STEPS.length - 1) {
            setDeleteStep(deleteStep + 1)
        } else {
            setIsDeleting(true)
            try {
                await deleteProducts(idsToDelete)
                setProducts(prev => prev.filter(p => !idsToDelete.includes(p.id)))
                setSelectedIds(prev => {
                    const next = new Set(prev)
                    idsToDelete.forEach(id => next.delete(id))
                    return next
                })
                toast.success(`Se eliminaron ${idsToDelete.length} productos exitosamente.`)
                cancelDelete()
            } catch (error) {
                console.error(error)
                toast.error("Error al eliminar productos")
            } finally {
                setIsDeleting(false)
            }
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
                <Link href="/products">
                    <Button variant="outline" size="icon" type="button">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Verificación y Edición Masiva</h1>
                    <p className="text-muted-foreground">Filtra y aplica cambios a múltiples atributos simultáneamente.</p>
                </div>
            </div>

            {/* Panel superior de controles (Acciones Globales y Filtros) */}
            <div className="flex flex-col lg:flex-row gap-4">
                {/* Acciones Globales (Izquierda, más espacio) */}
                <div className="flex-1 p-4 border rounded-md bg-blue-50 border-blue-200 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Acciones Globales
                            </h3>
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                {selectedIds.size} seleccionados
                            </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mb-4">
                            <div className="flex items-center space-x-2">
                                <select
                                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-0 text-[10px] shadow-sm transition-colors cursor-pointer"
                                    value={batchUpdates.canto_puertas}
                                    onChange={(e) => setBatchUpdates(p => ({ ...p, canto_puertas: e.target.value }))}
                                >
                                    <option value="">(Canto)</option>
                                    <option value="CANTO 2 MM">CANTO 2 MM</option>
                                    <option value="CANTO 1.5 MM">CANTO 1.5 MM</option>
                                    <option value="CANTO 0.45 MM">CANTO 0.45 MM</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-2">
                                <select
                                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-0 text-[10px] shadow-sm transition-colors cursor-pointer"
                                    value={batchUpdates.rh}
                                    onChange={(e) => setBatchUpdates(p => ({ ...p, rh: e.target.value }))}
                                >
                                    <option value="">(RH)</option>
                                    <option value="RH">RH (Resist. Humedad)</option>
                                    <option value="NA">NA (No Aplica)</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-2">
                                <select
                                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-0 text-[10px] shadow-sm transition-colors cursor-pointer"
                                    value={batchUpdates.assembled_flag}
                                    onChange={(e) => setBatchUpdates(p => ({ ...p, assembled_flag: e.target.value }))}
                                >
                                    <option value="">(Armado)</option>
                                    <option value="true">SÍ (ARMADO)</option>
                                    <option value="false">NO (DESARMADO)</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-2">
                                <select
                                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-0 text-[10px] shadow-sm transition-colors cursor-pointer"
                                    value={batchUpdates.validation_status}
                                    onChange={(e) => setBatchUpdates(p => ({ ...p, validation_status: e.target.value }))}
                                >
                                    <option value="">(Estado)</option>
                                    <option value="incomplete">Incompleto</option>
                                    <option value="needs_review">Revisar</option>
                                    <option value="ready">Listo</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-2 col-span-2 md:col-span-1">
                                <select
                                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-0 text-[10px] shadow-sm transition-colors cursor-pointer"
                                    value={batchUpdates.zone_home}
                                    onChange={(e) => setBatchUpdates(p => ({ ...p, zone_home: e.target.value }))}
                                >
                                    <option value="">(Cambiar Zona Masivo)</option>
                                    <option value="BAÑO">BAÑO</option>
                                    <option value="COCINA">COCINA</option>
                                    <option value="ZONA DE ROPA">ZONA DE ROPA</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-2 col-span-2 md:col-span-1">
                                <select
                                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-0 text-[10px] shadow-sm transition-colors cursor-pointer"
                                    value={batchUpdates.designation}
                                    onChange={(e) => setBatchUpdates(p => ({ ...p, designation: e.target.value }))}
                                >
                                    <option value="">(Uso Masivo)</option>
                                    <option value="ELEVADO">ELEVADO</option>
                                    <option value="PISO">PISO</option>
                                    <option value="PARED">PARED (EMPOTRADO)</option>
                                    <option value="N/A">N/A</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-2 col-span-2 md:col-span-1 border-l pl-2">
                                <select
                                    className="flex h-7 w-full rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0 text-[10px] shadow-sm transition-colors cursor-pointer font-bold text-indigo-900"
                                    value={batchUpdates.status}
                                    onChange={(e) => setBatchUpdates(p => ({ ...p, status: e.target.value }))}
                                >
                                    <option value="">(Cambiar Estado)</option>
                                    <option value="ACTIVO">ACTIVO</option>
                                    <option value="INACTIVO">INACTIVO</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-2 col-span-2 md:col-span-1 border-l pl-2">
                                <select
                                    className="flex h-7 w-full rounded-md border border-amber-200 bg-amber-50 px-2 py-0 text-[10px] shadow-sm transition-colors cursor-pointer font-bold text-amber-900"
                                    value={batchUpdates.special_label}
                                    onChange={(e) => setBatchUpdates(p => ({ ...p, special_label: e.target.value }))}
                                >
                                    <option value="">(Marca Especial)</option>
                                    <option value="NA">NA</option>
                                    <option value="ESPECIAL OBRA">ESPECIAL OBRA</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={handleApplyBatchUpdate}
                                disabled={selectedIds.size === 0}
                                size="sm"
                                className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <CheckCircle2 className="w-3 h-3 mr-2" />
                                Aplicar Cambios
                            </Button>

                            <Button
                                variant="destructive"
                                onClick={() => startDelete(Array.from(selectedIds))}
                                disabled={selectedIds.size === 0}
                                size="sm"
                                className="h-8"
                            >
                                <Trash2 className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 mt-4 pt-4 border-t border-blue-200/50">
                        {/* Motor de Nombrado RPC */}
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] uppercase font-bold text-emerald-800">Motor de Nomenclatura (Reglas)</Label>
                        </div>
                        <Button
                            size="sm"
                            onClick={handleApplyNamingRules}
                            disabled={selectedIds.size === 0 || isNaming}
                            title="Aplica las reglas de nombrado activas a los productos seleccionados"
                            className="w-full text-[10px] h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        >
                            {isNaming ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Settings className="w-3 h-3 mr-1" />}
                            {isNaming ? `Aplicando... (${namingBatches.reduce((a, b) => a + b.updated, 0)}/${namingTotal})` : 'Aplicar Reglas de Nombre'}
                        </Button>
                        {/* Barra de progreso de nombrado */}
                        {isNaming && (
                            <div className="w-full bg-emerald-100 rounded-full h-1.5 mt-1">
                                <div
                                    className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${namingProgress}%` }}
                                />
                            </div>
                        )}
                        {/* Resultados por batch */}
                        {namingBatches.length > 0 && !isNaming && (
                            <div className="text-[9px] text-emerald-700 font-mono bg-emerald-50 rounded p-1">
                                {namingBatches.map((b, i) => (
                                    <div key={i}>
                                        {b.error
                                            ? `Batch ${i+1}: ❌ ${b.error}`
                                            : `Batch ${i+1}: ✅ ${b.updated}/${b.processed} actualizados`
                                        }
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Motor de Traducción */}
                        <div className="flex items-center justify-between mt-2">
                            <Label className="text-[10px] uppercase font-bold text-blue-800">Motor de Traducción (Glosario)</Label>
                            <div className="flex items-center gap-2">
                                <Link href="/products/glossary">
                                    <Button variant="outline" size="sm" className="h-7 text-[10px] border-slate-200 text-blue-600 hover:text-blue-700 hover:bg-white font-bold uppercase transition-all shadow-sm">
                                        <PlusCircle className="h-3 w-3 mr-1" />
                                        Glosario Técnico
                                    </Button>
                                </Link>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleBatchTranslate('missing')}
                                disabled={selectedIds.size === 0 || isTranslating}
                                title="Traduce solo los que están vacíos o marcados como Pendiente"
                                className="flex-1 text-[10px] h-7 border-blue-200 bg-white/50 hover:bg-white text-blue-700"
                            >
                                {isTranslating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                                Solo Faltantes
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleBatchTranslate('repair')}
                                disabled={selectedIds.size === 0 || isTranslating}
                                title="Vuelve a procesar todos los seleccionados con las reglas actuales"
                                className="flex-1 text-[10px] h-7 border-blue-200 bg-white/50 hover:bg-white text-blue-700"
                            >
                                {isTranslating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                Reparar / Actualizar
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Filtros de Búsqueda (Derecha, más compacto) */}
                <div className="lg:w-[400px] p-4 border rounded-md bg-white">
                    <h3 className="font-semibold mb-3 text-sm flex items-center gap-2 text-slate-700">
                        <Search className="w-4 h-4" />
                        Filtros de Búsqueda
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                        <div className="grid gap-1">
                            <Label className="text-[10px] font-medium text-slate-500">Familia</Label>
                            <MultiSelectSearchField
                                options={families}
                                values={filterFamily}
                                onChange={handleFamilyChange}
                                placeholder="Familia"
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="grid gap-1">
                            <Label className="text-[10px] font-medium text-slate-500">Referencia</Label>
                            <MultiSelectSearchField
                                options={references}
                                values={filterRef}
                                onChange={handleReferenceChange}
                                placeholder="Referencia"
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="grid gap-1">
                            <Label className="text-[10px] font-medium text-slate-500">Medida</Label>
                            <MultiSelectSearchField
                                options={measures.map(m => ({ value: m, label: m }))}
                                values={filterMeasure}
                                onChange={setFilterMeasure}
                                placeholder="Medida"
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                </div>
            </div>

                {/* Tabla de resultados */}
                <div className="w-full border rounded-md bg-white overflow-hidden flex flex-col h-[65vh]">
                    <div className="overflow-auto flex-1 custom-scrollbar">
                        <Table className="min-w-[1400px]">
                            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                                <TableRow>
                                    <TableHead className="w-12 text-center sticky left-0 bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                        <Checkbox
                                            disabled={filteredProducts.length === 0}
                                            checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                                            onCheckedChange={(c) => handleSelectAll(!!c)}
                                        />
                                    </TableHead>
                                    <TableHead className="sticky left-12 bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Código</TableHead>
                                    <TableHead className="min-w-[200px]">Descripción SAP</TableHead>
                                    <TableHead className="min-w-[200px]">Nombre Final (ES)</TableHead>
                                    <TableHead className="min-w-[200px]">Nombre EN (US)</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Uso</TableHead>
                                    <TableHead>Zona</TableHead>
                                    <TableHead>Línea</TableHead>
                                    <TableHead className="whitespace-nowrap">Color</TableHead>
                                    <TableHead className="whitespace-nowrap">WxDxH (cm)</TableHead>
                                    <TableHead>Medida / Ref</TableHead>
                                    <TableHead className="text-center">Canto</TableHead>
                                    <TableHead className="text-center">Material (RH)</TableHead>
                                    <TableHead className="text-center">Armado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filterFamily.length === 0 && filterRef.length === 0 && filterMeasure.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={12} className="h-[400px] text-center">
                                            <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-4">
                                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                                                    <Search className="w-8 h-8 text-slate-400" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-slate-900">Empieza tu verificación</h3>
                                                <p className="text-sm text-slate-500 text-center leading-relaxed">
                                                    Selecciona una <b>Familia</b> para filtrar el catálogo y realizar ediciones masivas de forma segura.
                                                </p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredProducts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                                            No se encontraron productos con estos filtros.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredProducts.map(p => (
                                        <TableRow key={p.id} className={selectedIds.has(p.id) ? 'bg-blue-50/50' : ''}>
                                            <TableCell className="text-center sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                <Checkbox
                                                    checked={selectedIds.has(p.id)}
                                                    onCheckedChange={(c) => handleSelectOne(p.id, !!c)}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium text-xs font-mono sticky left-12 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{p.code}</TableCell>
                                            <TableCell className="text-xs max-w-[250px] truncate" title={p.sap_description || ''}>
                                                {p.sap_description || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs font-medium max-w-[250px] truncate" title={p.final_name_es || ''}>
                                                {p.final_name_es || '-'}
                                            </TableCell>
                                            <TableCell className="text-[10px] font-medium max-w-[250px] truncate" title={p.final_name_en || ''}>
                                                {p.final_name_en || <span className="text-slate-400 italic">Pendiente</span>}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        p.validation_status === 'ready'
                                                            ? 'default'
                                                            : p.validation_status === 'needs_review'
                                                                ? 'destructive'
                                                                : 'secondary'
                                                    }
                                                >
                                                    {p.validation_status === 'incomplete' ? 'Incompleto' :
                                                        p.validation_status === 'needs_review' ? 'Revisar' : 'Listo'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {p.designation ? (
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 text-[10px] font-medium uppercase">
                                                        {p.designation}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-red-500 text-[10px] font-bold italic flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" /> Sin Uso
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "text-[10px] font-medium",
                                                        p.zone_home === 'BAÑO' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                        p.zone_home === 'COCINA' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                        p.zone_home === 'ZONA DE ROPA' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                        'bg-slate-50 text-slate-600 border-slate-100'
                                                    )}
                                                >
                                                    {p.zone_home || '-'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs font-medium">
                                                {p.line || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {p.color_code || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">
                                                {p.width_cm || p.depth_cm || p.height_cm ? `${p.width_cm||'-'} x ${p.depth_cm||'-'} x ${p.height_cm||'-'}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                <div className="flex flex-col">
                                                    <span>{p.commercial_measure || '-'}</span>
                                                    <span className="text-xs text-muted-foreground">{p.ref_code || '-'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {p.canto_puertas ? <Badge variant="outline" className={cn("text-[10px]", p.canto_puertas === 'CANTO 2 MM' ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-700")}>{p.canto_puertas.replace('CANTO ', '')}</Badge> : <span className="text-muted-foreground text-[10px]">-</span>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={cn("text-[10px] font-bold", p.status === 'ACTIVO' ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100")}>
                                                    {p.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={cn("text-[10px]", p.special_label && p.special_label !== 'NA' ? "bg-amber-50 text-amber-700 border-amber-100" : "text-slate-400 border-slate-100")}>
                                                    {p.special_label || 'NA'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {p.rh ? <Badge variant="outline" className={cn("text-[10px]", p.rh === 'RH' ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-700")}>{p.rh}</Badge> : <span className="text-muted-foreground text-[10px]">-</span>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {p.assembled_flag ? <Badge variant="outline" className="bg-purple-50 text-purple-700">Sí</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => startDelete([p.id])}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="p-2 bg-muted/30 border-t text-xs text-muted-foreground text-right">
                        Mostrando {filteredProducts.length} productos
                    </div>
                </div>


            <Dialog open={deleteOpen} onOpenChange={(val) => !val && cancelDelete()}>
                {/* ... existing delete dialog ... */}
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Eliminar {idsToDelete.length > 1 ? `${idsToDelete.length} productos` : 'producto'} {deleteStep > 2 ? '🔥' : '⚠️'}
                        </DialogTitle>
                        <DialogDescription className="pt-4 text-base font-medium text-slate-800">
                            {CONFIRMATION_STEPS[deleteStep]}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6 flex justify-between sm:justify-between items-center w-full">
                        <Button variant="outline" onClick={cancelDelete}>
                            ¡No, me arrepentí! (Cancelar)
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
                            {isDeleting ? 'Eliminando...' : 'Sí, continuar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={missingTermsDialogOpen} onOpenChange={setMissingTermsDialogOpen}>
                <DialogContent className="max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            Configurar Términos Faltantes
                        </DialogTitle>
                        <DialogDescription>
                            El motor no reconoce estos términos. Configúralos aquí mismo para completar la traducción sin salir de esta página.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-auto py-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[30%]">Término (ES)</TableHead>
                                    <TableHead className="w-[35%]">Traducción (EN)</TableHead>
                                    <TableHead className="w-[20%]">Categoría</TableHead>
                                    <TableHead className="w-[15%]">Prioridad</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {missingTermsData.map((term, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell className="font-bold text-slate-700">{term.term_es}</TableCell>
                                        <TableCell>
                                            <Input 
                                                value={term.term_en}
                                                placeholder="Ej: CABINET"
                                                className="h-8 text-xs bg-amber-50/30 border-amber-200 focus:border-amber-500"
                                                onChange={(e) => {
                                                    const newData = [...missingTermsData]
                                                    newData[idx].term_en = e.target.value.toUpperCase()
                                                    setMissingTermsData(newData)
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <select 
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                value={term.category}
                                                onChange={(e) => {
                                                    const newData = [...missingTermsData]
                                                    newData[idx].category = e.target.value
                                                    setMissingTermsData(newData)
                                                }}
                                            >
                                                <option value="MODEL">MODEL</option>
                                                <option value="FEATURE">FEATURE</option>
                                                <option value="MATERIAL">MATERIAL</option>
                                                <option value="FINISH">FINISH</option>
                                                <option value="TYPE">TYPE</option>
                                                <option value="INSTALLATION">INSTALLATION</option>
                                            </select>
                                        </TableCell>
                                        <TableCell>
                                            <Input 
                                                type="number"
                                                value={term.priority}
                                                className="h-8 text-xs"
                                                onChange={(e) => {
                                                    const newData = [...missingTermsData]
                                                    newData[idx].priority = parseInt(e.target.value) || 0
                                                    setMissingTermsData(newData)
                                                }}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <DialogFooter className="pt-4 border-t">
                        <Button variant="outline" onClick={() => setMissingTermsDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button 
                            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                            onClick={handleSaveGlossary}
                            disabled={isSavingGlossary}
                        >
                            {isSavingGlossary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Guardar y Seguir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
