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
    ArrowLeft, RotateCcw, PlusCircle, Settings, AlertTriangle,
    ChevronDown, ChevronUp, History, ListFilter, Activity
} from 'lucide-react'
import Link from 'next/link'
import { deleteProducts, saveGlossaryTermsAction } from '../actions'
import { translateEnglishBatchAction } from '../translation-actions'
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
    cabinet_name: string | null
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
        if (filterFamily.length === 0 && filterRef.length === 0) {
            return []
        }

        return products.filter(p => {
            let normalizedPCode = p.familia_code || ''
            if (/^[VCP]([A-Z]{3,4}\d{2})$/i.test(normalizedPCode)) {
                normalizedPCode = normalizedPCode.substring(1)
            } else if (/^[VCP](?!$)/i.test(normalizedPCode)) {
                normalizedPCode = normalizedPCode.substring(1)
            }

            const matchFam = filterFamily.length === 0 || filterFamily.includes(normalizedPCode) || filterFamily.includes(p.familia_code || '')
            // filterRef contiene valores compuestos "ref_code|||commercial_measure"
            const matchRef = filterRef.length === 0 || filterRef.some(v => {
                const [rc, cm] = v.split('|||')
                const refMatch = p.ref_code === rc
                const measMatch = !cm || p.commercial_measure === cm
                return refMatch && measMatch
            })
            return matchFam && matchRef
        })
    }, [products, filterRef, filterFamily])

    const references = useMemo(() => {
        if (filterFamily.length === 0) return []
        const availableProducts = products.filter(p => {
            let normalizedPCode = p.familia_code || ''
            if (/^[VCP]/i.test(normalizedPCode)) normalizedPCode = normalizedPCode.substring(1)
            return filterFamily.includes(normalizedPCode) || filterFamily.includes(p.familia_code || '')
        })
        // Agrupar por ref_code + commercial_measure para incluir la medida en el label
        const uniqueRefs = new Map<string, { name: string, measure: string }>()
        availableProducts.forEach(p => {
            if (p.ref_code) {
                const key = `${p.ref_code}|||${p.commercial_measure || ''}`
                if (!uniqueRefs.has(key)) {
                    uniqueRefs.set(key, { name: p.cabinet_name || '', measure: p.commercial_measure || '' })
                }
            }
        })
        return Array.from(uniqueRefs.entries()).map(([key, { name, measure }]) => {
            const [rc] = key.split('|||')
            return {
                value: key,
                label: measure ? `${name} - ${measure}` : name
            }
        }).sort((a, b) => a.label.localeCompare(b.label))
    }, [products, filterFamily])

    const handleFamilyChange = (vals: string[]) => {
        setFilterFamily(vals)
        setFilterRef([])
    }

    const handleReferenceChange = (vals: string[]) => {
        setFilterRef(vals)
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

    // Translation progress state
    const [translationProgress, setTranslationProgress] = useState({
        processed: 0,
        updated: 0,
        skippedCount: 0,
        skippedDetails: { already_translated: 0, no_logic_change: 0 },
        failed: 0,
        total: 0,
        missingTermsCount: 0,
        currentBatch: 0,
        totalBatches: 0
    })
    const [translationResults, setTranslationResults] = useState<{
        uniqueMissingTerms: string[]
        missingTermsMap: Record<string, string[]>
        failedItems: { code: string, reason: string, category: string }[]
        batchDiagnostics: { batchNumber: number, size: number, durationMs: number, success: boolean, error?: string }[]
    }>({ uniqueMissingTerms: [], missingTermsMap: {}, failedItems: [], batchDiagnostics: [] })
    const [showTranslationSummary, setShowTranslationSummary] = useState(false)
    const [lastJobContext, setLastJobContext] = useState<{ startTime: Date | null, totalRequested: number } | null>(null)

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

    const TRANSLATION_BATCH_SIZE = 30

    const handleBatchTranslate = async (mode: 'missing' | 'repair' | 'all', targetedIds?: string[]) => {
        const idsToProcess = targetedIds || Array.from(selectedIds)
        
        if (idsToProcess.length === 0) {
            toast.error("Selecciona productos para traducir")
            return
        }

        setIsTranslating(true)
        setShowTranslationSummary(false)
        setLastJobContext({ startTime: new Date(), totalRequested: idsToProcess.length })
        
        const total = idsToProcess.length
        const totalBatches = Math.ceil(total / TRANSLATION_BATCH_SIZE)
        
        setTranslationProgress({
            processed: 0, updated: 0, skippedCount: 0, 
            skippedDetails: { already_translated: 0, no_logic_change: 0 },
            failed: 0,
            total, missingTermsCount: 0,
            currentBatch: 0, totalBatches
        })
        setTranslationResults({ uniqueMissingTerms: [], missingTermsMap: {}, failedItems: [], batchDiagnostics: [] })

        const accumulatedMissingTermsMap: Record<string, string[]> = {}
        const allFailedItems: { code: string, reason: string, category: string }[] = []
        const currentDiagnostics: { batchNumber: number, size: number, durationMs: number, success: boolean, error?: string }[] = []

        try {
            for (let i = 0; i < idsToProcess.length; i += TRANSLATION_BATCH_SIZE) {
                const batchIds = idsToProcess.slice(i, i + TRANSLATION_BATCH_SIZE)
                const currentBatch = Math.floor(i / TRANSLATION_BATCH_SIZE) + 1
                
                await new Promise(r => setTimeout(r, 0))
                
                const startTime = Date.now()
                const result = await translateEnglishBatchAction(batchIds)
                const durationMs = Date.now() - startTime
                
                if (result.success && result.data) {
                    currentDiagnostics.push({ batchNumber: currentBatch, size: batchIds.length, durationMs, success: true })
                    const { data } = result
                    
                    // Update accumulated missing terms
                    Object.entries(data.missingTermsMap).forEach(([term, codes]) => {
                        if (!accumulatedMissingTermsMap[term]) accumulatedMissingTermsMap[term] = []
                        accumulatedMissingTermsMap[term] = Array.from(new Set([...accumulatedMissingTermsMap[term], ...codes]))
                    })
                    
                    // Update accumulated failed items
                    if (data.failedItems.length > 0) allFailedItems.push(...data.failedItems)

                    // Update progress state
                    setTranslationProgress(prev => ({
                        ...prev,
                        currentBatch,
                        processed: prev.processed + data.processed,
                        updated: prev.updated + data.updated,
                        skippedCount: prev.skippedCount + data.skippedCount,
                        skippedDetails: {
                            already_translated: prev.skippedDetails.already_translated + data.skippedDetails.already_translated,
                            no_logic_change: prev.skippedDetails.no_logic_change + data.skippedDetails.no_logic_change
                        },
                        failed: prev.failed + data.failedCount,
                        missingTermsCount: Object.keys(accumulatedMissingTermsMap).length
                    }))

                    // Optimized table update
                    if (data.updatedProducts.length > 0) {
                        const updateMap = new Map(data.updatedProducts.map(u => [u.id, u]))
                        setProducts(prev => prev.map(p => {
                            const up = updateMap.get(p.id)
                            if (up) {
                                return { 
                                    ...p, 
                                    final_name_en: up.final_name_en, 
                                    validation_status: up.validation_status 
                                }
                            }
                            return p
                        }))
                    }
                } else {
                    currentDiagnostics.push({ batchNumber: currentBatch, size: batchIds.length, durationMs, success: false, error: result.error })
                    // Critical Batch failure (e.g. Server Error)
                    setTranslationProgress(prev => ({
                        ...prev,
                        currentBatch,
                        processed: prev.processed + batchIds.length,
                        failed: prev.failed + batchIds.length
                    }))
                    batchIds.forEach(id => {
                        const prod = products.find(p => p.id === id)
                        allFailedItems.push({ 
                            code: prod?.code || id, 
                            reason: result.error || "Error crítico del servidor", 
                            category: "database" 
                        })
                    })
                }
            }
            
            // Sync final results
            setTranslationResults({
                uniqueMissingTerms: Object.keys(accumulatedMissingTermsMap),
                missingTermsMap: accumulatedMissingTermsMap,
                failedItems: allFailedItems,
                batchDiagnostics: currentDiagnostics
            })
            
            if (allFailedItems.length === 0) {
                toast.success("Traducción masiva completada")
                setSelectedIds(new Set()) 
            } else {
                toast.warning(`Traducción completada con ${allFailedItems.length} fallos. Revisa el resumen.`)
                // NOT clearing selectedIds so user can see what failed or retry
            }
        } catch (error: any) {
            console.error(error)
            toast.error(`Error en la traducción masiva: ${error.message}`)
        } finally {
            setTimeout(() => {
                setIsTranslating(false)
                setShowTranslationSummary(true)
            }, 500)
        }
    }

    const openGlossaryRegistry = () => {
        const terms = translationResults.uniqueMissingTerms.map(term => ({
            term_es: term,
            term_en: '',
            category: 'TECNICO',
            priority: 1
        }))
        setMissingTermsData(terms)
        setMissingTermsDialogOpen(true)
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
                // Preguntar al usuario si desea re-traducir (opcional, pero lo hacemos automático según sugerencia)
                toast.info("Reiniciando traducción para aplicar nuevos términos...")
                setTimeout(() => {
                    // Re-capturamos seleccionados si aún existen, o usamos los que fallaron/faltaron
                    // Para simplificar, si el usuario acaba de corregir, probablemente quiere re-procesar todo el set inicial
                    // Pero como ya limpiamos selectedIds, tendríamos que haber guardado un backup
                    // Por ahora, dejamos que el usuario lo inicie si quiere, o lo automatizamos si guardamos el snapshot
                    // handleBatchTranslate('repair') // Requiere selectedIds no vacío
                }, 500)
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4 pt-4 border-t border-blue-200/50">
                        {/* Columna Izquierda: Motor de Nomenclatura */}
                        <div className="flex flex-col gap-2">
                            {/* Fila 1: Título (Altura fija para alineación) */}
                            <div className="h-4 flex items-center">
                                <Label className="text-[10px] uppercase font-bold text-emerald-800">Motor de Nomenclatura (Reglas)</Label>
                            </div>
                            
                            {/* Fila 2: Spacer para alinear con el botón de glosario de la derecha */}
                            <div className="h-6" aria-hidden="true" />

                            {/* Fila 3: Botón Principal */}
                            <Button
                                size="sm"
                                onClick={handleApplyNamingRules}
                                disabled={selectedIds.size === 0 || isNaming}
                                title="Aplica las reglas de nombrado activas a los productos seleccionados"
                                className="w-full text-[10px] h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                                {isNaming ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Settings className="w-3 h-3 mr-1" />}
                                {isNaming ? `Aplicando... (${namingBatches.reduce((a: number, b: NamingBatchResult) => a + b.updated, 0)}/${namingTotal})` : 'Aplicar Reglas de Nombre'}
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
                                    {namingBatches.map((b: NamingBatchResult, i: number) => (
                                        <div key={i}>
                                            {b.error
                                                ? `Batch ${i+1}: ❌ ${b.error}`
                                                : `Batch ${i+1}: ✅ ${b.updated}/${b.processed} actualizados`
                                            }
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Columna Derecha: Motor de Traducción */}
                        <div className="flex flex-col gap-2">
                            {/* Fila 1: Título (Misma altura que la izquierda) */}
                            <div className="h-4 flex items-center">
                                <Label className="text-[10px] uppercase font-bold text-blue-800">Motor de Traducción (Glosario)</Label>
                            </div>

                            {/* Fila 2: Acciones secundarias (Botón Glosario) */}
                            <div className="h-6 flex items-center">
                                <Link href="/products/glossary">
                                    <Button variant="ghost" size="sm" className="h-6 text-[9px] text-blue-600 hover:text-blue-700 font-bold uppercase p-0 px-1">
                                        <PlusCircle className="h-3 w-3 mr-1" />
                                        Glosario Técnico
                                    </Button>
                                </Link>
                            </div>

                            {/* Fila 3: Botón Principal (Alineado con el de la izquierda) */}
                            <Button
                                size="sm"
                                onClick={() => handleBatchTranslate('repair')}
                                disabled={selectedIds.size === 0 || isTranslating}
                                title="Traduce los seleccionados usando el glosario"
                                className="w-full text-[10px] h-7 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                            >
                                {isTranslating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCcw className="w-3 h-3 mr-1" />}
                                {isTranslating ? `Traduciendo... (${translationProgress.processed}/${translationProgress.total})` : 'Traducir a Inglés'}
                            </Button>

                            {/* Barra de progreso de traducción */}
                            {isTranslating && (
                                <div className="space-y-1.5 mt-1">
                                    <div className="w-full bg-blue-100 rounded-full h-1.5">
                                        <div
                                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                            style={{ width: `${(translationProgress.processed / translationProgress.total) * 100}%` }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[9px] font-medium text-blue-700">
                                        <div className="flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> {translationProgress.updated} ok</div>
                                        <div className="flex items-center gap-1 text-slate-500"><RotateCcw className="w-2.5 h-2.5" /> {translationProgress.skippedCount} sk</div>
                                        <div className="flex items-center gap-1 text-red-500"><AlertCircle className="w-2.5 h-2.5" /> {translationProgress.failed} err</div>
                                    </div>
                                </div>
                            )}

                            {/* Resumen Final de Traducción */}
                            {showTranslationSummary && !isTranslating && (
                                <div className="mt-1 p-2 bg-blue-50 border border-blue-200 rounded-md shadow-sm space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-blue-900 uppercase text-[9px] flex items-center gap-1">
                                                <History className="w-3 h-3" /> Resumen de Última Ejecución
                                            </span>
                                            {lastJobContext && (
                                                <span className="text-[7px] text-blue-500 font-medium ml-4 italic">
                                                    Iniciado: {lastJobContext.startTime?.toLocaleTimeString()} • {lastJobContext.totalRequested} seleccionados al inicio
                                                </span>
                                            )}
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-4 w-4 text-blue-400 hover:text-blue-600" onClick={() => setShowTranslationSummary(false)}>
                                            <X className="h-2.5 w-2.5" />
                                        </Button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9px] text-blue-800 border-b border-blue-100 pb-2">
                                        <div className="flex justify-between"><span>✅ Actualizados:</span> <span className="font-bold">{translationProgress.updated}</span></div>
                                        <div className="flex justify-between"><span>⏭️ Saltados:</span> <span className="font-bold">{translationProgress.skippedCount}</span></div>
                                        <div className="flex justify-between"><span>❌ Fallidos:</span> <span className="font-bold text-red-600">{translationProgress.failed}</span></div>
                                        <div className="flex justify-between"><span>⚠️ Términos :</span> <span className="font-bold text-amber-600">{translationProgress.missingTermsCount}</span></div>
                                    </div>

                                    {/* SECCIÓN DESPLEGABLE: SKIPS */}
                                    {translationProgress.skippedCount > 0 && (
                                        <div className="bg-slate-50/50 rounded p-1.5 border border-slate-200/50">
                                            <div className="flex justify-between text-[8px] text-slate-500 font-medium">
                                                <span>✅ Ya en Inglés (Sin Cambios): {translationProgress.skippedDetails.already_translated}</span>
                                                <span>⏭️ Ignorados (No requiere traducción): {translationProgress.skippedDetails.no_logic_change}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* SECCIÓN DESPLEGABLE: FAILED */}
                                    {translationResults.failedItems.length > 0 && (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[8px] font-bold text-red-700 uppercase flex items-center gap-1">
                                                    <AlertTriangle className="w-2.5 h-2.5" /> Productos con Error
                                                </span>
                                                <Button 
                                                    onClick={() => {
                                                        const failedIds = translationResults.failedItems.map(item => {
                                                            const p = products.find(prod => prod.code === item.code || prod.id === item.code)
                                                            return p?.id
                                                        }).filter(Boolean) as string[]
                                                        handleBatchTranslate('repair', failedIds)
                                                    }}
                                                    variant="secondary" 
                                                    size="sm" 
                                                    className="h-5 text-[8px] px-2 bg-red-100 text-red-800 hover:bg-red-200 border-red-200"
                                                >
                                                    <RotateCcw className="w-2.5 h-2.5 mr-1" /> Reintentar Fallidos
                                                </Button>
                                            </div>
                                            <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-1">
                                                {translationResults.failedItems.map((item, i) => (
                                                    <div key={i} className="text-[7px] bg-red-50/50 border-l-2 border-red-300 p-1 flex justify-between items-start">
                                                        <span className="font-bold text-red-700">{item.code}</span>
                                                        <span className="text-slate-500 italic flex-1 text-right ml-2">{item.reason}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* SECCIÓN DESPLEGABLE: MISSING TERMS */}
                                    {translationResults.uniqueMissingTerms.length > 0 && (
                                        <div className="space-y-1 pt-1 border-t border-blue-100">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[8px] font-bold text-amber-700 uppercase flex items-center gap-1">
                                                    <ListFilter className="w-2.5 h-2.5" /> Términos Faltantes
                                                </span>
                                                <Button 
                                                    onClick={openGlossaryRegistry}
                                                    variant="secondary" 
                                                    size="sm" 
                                                    className="h-5 text-[8px] px-2 bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200"
                                                >
                                                    <PlusCircle className="w-2.5 h-2.5 mr-1" /> Glosario
                                                </Button>
                                            </div>
                                            <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-1">
                                                {translationResults.uniqueMissingTerms.map((term, i) => (
                                                    <div key={i} className="bg-white/60 p-1 rounded border border-blue-100/30 flex justify-between items-center gap-2">
                                                        <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-[7px] h-3.5 py-0 px-1 font-mono uppercase">{term}</Badge>
                                                        <span className="text-[7px] text-slate-400 font-mono whitespace-nowrap overflow-hidden text-ellipsis text-right flex-1">
                                                            {translationResults.missingTermsMap[term]?.slice(0, 3).join(', ')}
                                                            {(translationResults.missingTermsMap[term]?.length || 0) > 3 && '...'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* SECCIÓN DESPLEGABLE: DIAGNÓSTICO DE RED */}
                                    {translationResults.batchDiagnostics && translationResults.batchDiagnostics.length > 0 && (
                                        <div className="space-y-1 pt-1 border-t border-blue-100">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[8px] font-bold text-slate-600 uppercase flex items-center gap-1">
                                                    <Activity className="w-2.5 h-2.5" /> Diagnóstico de Red (Lotes)
                                                </span>
                                            </div>
                                            <div className="max-h-20 overflow-y-auto custom-scrollbar space-y-1">
                                                {translationResults.batchDiagnostics.map((b, i) => (
                                                    <div key={i} className={`text-[7px] border-l-2 p-1 flex justify-between items-center ${b.success ? 'bg-slate-50 border-slate-300' : 'bg-red-50 border-red-400'}`}>
                                                        <span className="font-bold text-slate-700">Lote {b.batchNumber}</span>
                                                        <span className="text-slate-500">{b.size} items</span>
                                                        <span className="text-slate-500">{b.durationMs}ms</span>
                                                        {b.success ? <span className="text-emerald-600 font-bold ml-2">OK</span> : <span className="text-red-600 font-bold ml-2 overflow-hidden text-ellipsis whitespace-nowrap max-w-[100px]">{b.error || "Fallo transitorio"}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
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
                            <Label className="text-[10px] font-medium text-slate-500">Referencia · Medida</Label>
                            <MultiSelectSearchField
                                options={references}
                                values={filterRef}
                                onChange={handleReferenceChange}
                                placeholder="Referencia · Medida"
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
                                {filterFamily.length === 0 && filterRef.length === 0 ? (
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
