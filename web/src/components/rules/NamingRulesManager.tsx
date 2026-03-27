'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { upsertRuleAction, deleteRuleAction, previewNamingRulesAction, getProductsCountByFamilyAction, applyNamesToProductTypeBatchAction, revalidateRulesAndProductsAction, getEnConfigAction, saveEnConfigAction } from '@/app/rules/actions'
import { toast } from 'sonner'
import { ArrowUp, ArrowDown, Plus, Trash2, Eye, Settings2, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Zap, ChevronDown } from 'lucide-react'

// ─── Expected variables by product type ─────────────────────────────────────
const EXPECTED_VARS: Record<string, { field: string; condition: string }[]> = {
    default: [
        { field: 'rh', condition: '!=null' },
        { field: 'product_type', condition: '!=null' },
        { field: 'designation', condition: '!=null' },
        { field: 'furniture_name', condition: '!=null' },
        { field: 'line', condition: '!=null' },
        { field: 'accessory_text', condition: '!=null' },
        { field: 'door_color_text', condition: '!=null' },
        { field: 'use_destination', condition: '!=null' },
        { field: 'commercial_measure', condition: '!=null' },
        { field: 'canto_puertas', condition: '!=null' },
        { field: 'assembled_flag', condition: '==true' },
        { field: 'armado_con_lvm', condition: '!=null' },
        { field: 'carb2', condition: '!=null' },
        { field: 'private_label_client_name', condition: '!=null' },
    ],
}

// ─── Addable text fields ─────────────────────────────────────────────────────
const ADDABLE_FIELDS = [
    { field: 'product_type', label: 'Tipo de producto', type: 'text' },
    { field: 'designation', label: 'Designación', type: 'text' },
    { field: 'furniture_name', label: 'Nombre del mueble', type: 'text' },
    { field: 'line', label: 'Línea', type: 'text' },
    { field: 'zone_home', label: 'Zona (BAÑO/COCINA/etc)', type: 'text' },
    { field: 'special_label', label: 'Marca Especial (OBRA/etc)', type: 'text' },
    { field: 'accessory_text', label: 'Accesorio', type: 'text' },
    { field: 'door_color_text', label: 'Color de puerta', type: 'text' },
    { field: 'use_destination', label: 'Destino de uso', type: 'text' },
    { field: 'commercial_measure', label: 'Medida comercial', type: 'text' },
    { field: 'canto_puertas', label: 'Canto puertas', type: 'text' },
    { field: 'rh', label: 'RH', type: 'text' },
    { field: 'assembled_flag', label: 'Armado', type: 'boolean' },
    { field: 'armado_con_lvm', label: 'Kit Lavamanos', type: 'text' },
    { field: 'carb2', label: 'Certificación CARB2', type: 'text' },
    { field: 'private_label_client_name', label: 'Cliente marca propia', type: 'text' },
]

function getVarStatus(field: string, condition: string, product: any): 'ok' | 'na' | 'missing' {
    const val = product[field]
    
    if (condition === '==true') {
        if (val === null || val === undefined) return 'missing'
        return val === true ? 'ok' : 'na'
    }
    
    // != null → also skip if value is literally "NA"
    const isEmpty = val === null || val === undefined || val === ''
    const isNA = String(val ?? '').trim().toUpperCase() === 'NA'
    
    if (isEmpty) return 'missing'
    if (isNA) return 'na'
    return 'ok'
}

function getUnusedSapText(sapDesc: string, generatedName: string): string {
    if (!sapDesc) return ''
    if (!generatedName) return sapDesc.toUpperCase()
    const normalize = (s: string) => s.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~() ]/g, " ").split(/\s+/).filter(Boolean)
    const sapWords = normalize(sapDesc)
    const genWords = normalize(generatedName)
    const unused = sapWords.filter(word => !genWords.includes(word))
    return unused.join(' ').toUpperCase()
}

interface NamingRulesManagerProps {
    open: boolean
    productType: string
    onClose: () => void
    initialRules: any[]
}

interface PreviewResult {
    id: string
    code: string
    currentName: string
    previewName: string
    productData: any
}

type MassApplyResult = { code: string; newName: string; oldName: string; error?: string }

export function NamingRulesManager({ open, productType, onClose, initialRules }: NamingRulesManagerProps) {
    const [rules, setRules] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<'structure' | 'preview' | 'en_config'>('structure')

    // EN Config tab state
    const [enConfig, setEnConfig] = useState<any[]>([])
    const [enConfigLoading, setEnConfigLoading] = useState(false)
    const [enConfigSaving, setEnConfigSaving] = useState<string | null>(null) // variable_id being saved
    const [showEnSyncAlert, setShowEnSyncAlert] = useState(false)

    // Preview state
    const [previewResults, setPreviewResults] = useState<PreviewResult[]>([])
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)
    const [previewGenerated, setPreviewGenerated] = useState(false)

    // Post-save state
    const [savedSuccessfully, setSavedSuccessfully] = useState(false)
    const [massApplyMode, setMassApplyMode] = useState(false)
    const [isApplying, setIsApplying] = useState(false)
    const [massResults, setMassResults] = useState<MassApplyResult[]>([])
    const [massTotal, setMassTotal] = useState(0)
    const [deletedIds, setDeletedIds] = useState<string[]>([])

    // Add variable dialog
    const [showAddVar, setShowAddVar] = useState(false)
    const [selectedField, setSelectedField] = useState('')
    const [selectedCondition, setSelectedCondition] = useState('')
    const [variablePrefix, setVariablePrefix] = useState('')
    const [variableSuffix, setVariableSuffix] = useState('')

    useEffect(() => {
        // Only sync if we haven't just saved (to avoid resetting the "Mass Apply" UI)
        if (!savedSuccessfully) {
            setRules([...initialRules].sort((a: any, b: any) => a.priority - b.priority))
            setPreviewGenerated(false)
            setPreviewResults([])
            setMassApplyMode(false)
            setMassResults([])
            setDeletedIds([])
        }
    }, [initialRules])

    const markDirty = () => {
        setPreviewGenerated(false)
        setSavedSuccessfully(false)
    }

    const moveRule = (index: number, direction: 'up' | 'down') => {
        const newRules = [...rules]
        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (targetIndex < 0 || targetIndex >= newRules.length) return
        const temp = newRules[index]
        newRules[index] = newRules[targetIndex]
        newRules[targetIndex] = temp
        newRules.forEach((r, idx) => r.priority = idx * 10)
        setRules([...newRules])
        markDirty()
    }

    const handleSaveOrder = async () => {
        setLoading(true)
        try {
            // 1. Delete removed rules
            for (const id of deletedIds) {
                await deleteRuleAction(id)
            }
            
            // 2. Upsert existing ones
            for (const rule of rules) {
                await upsertRuleAction(rule)
            }
            toast.success("Orden de nomenclatura guardado")
            setSavedSuccessfully(true)
            setDeletedIds([]) // Clear after success
        } catch (err: any) {
            toast.error("Error al guardar orden: " + err.message)
        } finally {
            setLoading(false)
        }
    }

    const addFixedText = () => {
        const newRule = {
            rule_type: 'name_component',
            target_entity: 'product',
            condition_expression: 'true',
            action_type: 'append_text',
            action_payload: 'TEXTO',
            priority: rules.length * 10,
            enabled: true,
            target_value: productType,
            notes: 'Texto estático'
        }
        setRules([...rules, newRule])
        markDirty()
    }

    const handleFieldSelect = (field: string) => {
        setSelectedField(field)
        const f = ADDABLE_FIELDS.find(x => x.field === field)
        setSelectedCondition(f?.type === 'boolean' ? '==true' : '!=null')
    }

    const confirmAddVariable = () => {
        if (!selectedField) return
        const condExpr = `${selectedField}${selectedCondition}`
        const newRule = {
            rule_type: 'name_component',
            target_entity: productType,
            condition_expression: condExpr,
            action_type: 'append_text',
            action_payload: `${variablePrefix}{${selectedField}}${variableSuffix}`,
            priority: rules.length * 10,
            enabled: true,
            target_value: productType,
            notes: `Variable ${selectedField} agregada manualmente`
        }
        setRules([...rules, newRule])
        setShowAddVar(false)
        setSelectedField('')
        setSelectedCondition('')
        setVariablePrefix('')
        setVariableSuffix('')
        markDirty()
    }

    const updateText = (index: number, val: string) => {
        const nr = [...rules]
        nr[index].action_payload = val
        setRules(nr)
        markDirty()
    }

    const removeRule = (index: number) => {
        const nr = [...rules]
        const removed = nr.splice(index, 1)[0]
        if (removed.id) {
            setDeletedIds(prev => [...prev, removed.id])
        }
        setRules(nr)
        markDirty()
    }

    const handleLoadPreview = async () => {
        setIsLoadingPreview(true)
        try {
            const results = await previewNamingRulesAction(productType, rules)
            setPreviewResults(results as PreviewResult[])
            setPreviewGenerated(true)
        } catch (err: any) {
            toast.error("Error al cargar la vista previa: " + err.message)
        } finally {
            setIsLoadingPreview(false)
        }
    }

    const handleTabChange = async (tab: 'structure' | 'preview' | 'en_config') => {
        setActiveTab(tab)
        if (tab === 'preview' && !previewGenerated) {
            handleLoadPreview()
        } else if (tab === 'en_config' && enConfig.length === 0) {
            setEnConfigLoading(true)
            try {
                const cfg = await getEnConfigAction('MUEBLE') // Simplified to target 'MUEBLE' generic for all products currently
                setEnConfig(cfg)
                // Check sync status against current ES active rules
                const esVariables = [...new Set(rules
                    .filter(r => r.condition_expression !== 'true')
                    .map(r => r.condition_expression.split('!=')[0].split('==')[0].trim())
                )]
                const enVariables = [...new Set(cfg
                    .filter((c: any) => c.emit || c.behavior === 'classify_and_resolve')
                    .map((c: any) => c.variable_id)
                )]
                
                // Compare sets
                const missingInEn = esVariables.filter(v => !enVariables.includes(v))
                const extraInEn = enVariables.filter(v => !esVariables.includes(v) && v !== 'resolved_type')
                
                if (missingInEn.length > 0 || extraInEn.length > 0) {
                    setShowEnSyncAlert(true)
                    if (missingInEn.length > 0) {
                        console.warn(`Sync Alert: ES variables missing in EN config: ${missingInEn.join(', ')}`)
                    }
                } else {
                    setShowEnSyncAlert(false)
                }
            } catch (err: any) {
                toast.error("Error al cargar config EN: " + err.message)
            } finally {
                setEnConfigLoading(false)
            }
        }
    }

    const updateEnConfigField = async (variable_id: string, field: string, value: any) => {
        setEnConfigSaving(variable_id)
        try {
            await saveEnConfigAction('MUEBLE', variable_id, { [field]: value })
            setEnConfig(prev => prev.map(c => c.variable_id === variable_id ? { ...c, [field]: value } : c))
            toast.success(`Configuración actualizada`)
        } catch (err: any) {
            toast.error("Error al guardar: " + err.message)
        } finally {
            setEnConfigSaving(null)
        }
    }

    const handleMassApply = async () => {
        setIsApplying(true)
        setMassApplyMode(true)
        setMassResults([])
        setMassTotal(0)
        
        try {
            // 1. Get total count
            const total = await getProductsCountByFamilyAction(productType)
            setMassTotal(total)
            
            if (total === 0) {
                setIsApplying(false)
                return
            }

            // 2. Process in batches from frontend
            const BATCH_SIZE = 25
            let allResults: MassApplyResult[] = []
            
            for (let offset = 0; offset < total; offset += BATCH_SIZE) {
                const batchResults = await applyNamesToProductTypeBatchAction(productType, offset, BATCH_SIZE)
                
                // Track results (we only show results for ACTIVO in the list to avoid clutter, as per previous requirement, 
                // but we process all)
                allResults = [...allResults, ...batchResults]
                setMassResults([...allResults])
            }
            
            // 3. Final Revalidation
            await revalidateRulesAndProductsAction()
            
            toast.success(`Proceso completado: ${total} productos actualizados`)
        } catch (err: any) {
            toast.error("Error en la aplicación masiva: " + err.message)
        } finally {
            setIsApplying(false)
        }
    }

    const expectedVars = EXPECTED_VARS[productType] ?? EXPECTED_VARS.default

    return (
        <Dialog open={open} onOpenChange={(val) => { if (!val) onClose() }}>
            <DialogContent className="sm:max-w-[720px] h-[88vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <DialogTitle className="text-xl">Nomenclatura: {productType}</DialogTitle>

                    {/* Tab switcher */}
                    <div className="flex gap-1 mt-3 bg-slate-100 p-1 rounded-lg w-fit">
                        <button
                            onClick={() => handleTabChange('structure')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'structure' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Settings2 className="w-3.5 h-3.5" />
                            Estructura ES
                        </button>
                        <button
                            onClick={() => handleTabChange('en_config')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all relative ${activeTab === 'en_config' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Zap className="w-3.5 h-3.5" />
                            Orden EN
                            {showEnSyncAlert && (
                                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => handleTabChange('preview')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all relative ${activeTab === 'preview' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Eye className="w-3.5 h-3.5" />
                            Vista Previa
                            {!previewGenerated && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" />
                            )}
                        </button>
                    </div>
                </DialogHeader>

                {/* ════ Content ════ */}
                <div className="flex-1 overflow-y-auto bg-slate-50/30">

                    {/* ── STRUCTURE TAB ── */}
                    {activeTab === 'structure' && !massApplyMode && (
                        <div className="px-6 py-4 space-y-3">
                            {rules.length === 0 && (
                                <div className="text-center py-10 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                                    <p className="text-slate-400 italic">No hay componentes definidos para este tipo.</p>
                                </div>
                            )}

                            {rules.map((rule, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm group">
                                    <div className="flex flex-col gap-1">
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRule(idx, 'up')} disabled={idx === 0}>
                                            <ArrowUp className="w-3 h-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRule(idx, 'down')} disabled={idx === rules.length - 1}>
                                            <ArrowDown className="w-3 h-3" />
                                        </Button>
                                    </div>

                                    <div className="flex-1 flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className={`text-[10px] font-bold uppercase tracking-tighter ${rule.condition_expression === 'true' ? 'text-orange-500' : 'text-blue-500'}`}>
                                                {rule.condition_expression === 'true' ? 'Texto estático' : `Variable (${rule.condition_expression})`}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                Prioridad: {rule.priority}
                                            </span>
                                        </div>
                                        {rule.condition_expression === 'true' ? (
                                            <Input
                                                value={rule.action_payload}
                                                onChange={(e) => updateText(idx, e.target.value)}
                                                className="h-8 bg-orange-50 font-bold border-orange-200 text-orange-700"
                                            />
                                        ) : (
                                            <Input
                                                value={rule.action_payload}
                                                onChange={(e) => updateText(idx, e.target.value)}
                                                className="h-8 bg-blue-50 font-bold border-blue-200 text-blue-700"
                                            />
                                        )}
                                    </div>

                                    <Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeRule(idx)}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}

                            {/* Add variable inline form */}
                            {showAddVar && (
                                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl space-y-3">
                                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">Nueva variable</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-medium block mb-1">Campo</label>
                                            <select
                                                className="w-full h-8 text-xs rounded-md border border-slate-200 bg-white px-2"
                                                value={selectedField}
                                                onChange={e => handleFieldSelect(e.target.value)}
                                            >
                                                <option value="">Seleccionar campo...</option>
                                                {ADDABLE_FIELDS.map(f => (
                                                    <option key={f.field} value={f.field}>{f.label} ({f.field})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-medium block mb-1">Prefijo (Opcional)</label>
                                            <Input
                                                placeholder="Ej: CON "
                                                className="h-8 text-xs"
                                                value={variablePrefix}
                                                onChange={e => setVariablePrefix(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-medium block mb-1">Sufijo (Opcional)</label>
                                            <Input
                                                placeholder="Ej:  -"
                                                className="h-8 text-xs"
                                                value={variableSuffix}
                                                onChange={e => setVariableSuffix(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-medium block mb-1">Condición</label>
                                            {selectedField && ADDABLE_FIELDS.find(x => x.field === selectedField)?.type === 'boolean' ? (
                                                <select
                                                    className="w-full h-8 text-xs rounded-md border border-slate-200 bg-white px-2"
                                                    value={selectedCondition}
                                                    onChange={e => setSelectedCondition(e.target.value)}
                                                >
                                                    <option value="==true">== true (solo si está activo)</option>
                                                    <option value="==false">== false (solo si está inactivo)</option>
                                                </select>
                                            ) : (
                                                <div className="h-8 flex items-center px-3 text-xs bg-slate-100 rounded-md text-slate-600 border border-slate-200">
                                                    {selectedField ? '!= "NA"  (si tiene valor real)' : '—'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <Button variant="ghost" size="sm" onClick={() => { setShowAddVar(false); setSelectedField(''); setSelectedCondition(''); setVariablePrefix(''); setVariableSuffix(''); }}>
                                            Cancelar
                                        </Button>
                                        <Button size="sm" disabled={!selectedField} onClick={confirmAddVariable} className="bg-blue-600 hover:bg-blue-700 text-white">
                                            Agregar
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── EN CONFIG TAB ── */}
                    {activeTab === 'en_config' && (
                        <div className="px-6 py-4 space-y-4">
                            {enConfigLoading ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                                    <p className="text-sm text-slate-500">Cargando configuración de inglés...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-700 leading-relaxed mb-4">
                                        <div className="flex gap-2">
                                            <Zap className="w-4 h-4 shrink-0 text-amber-500" />
                                            <div>
                                                <p className="font-bold mb-1 italic">Traducción Técnica y Adaptativa</p>
                                                El nombre en inglés se construye a partir de las variables que ya fueron aprobadas por el motor de español. Aquí defines cómo se reorganizan esas variables activas, si se traducen o se conservan, y qué hacer si falta una traducción.
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-2 w-12 text-center">N°</th>
                                                    <th className="px-4 py-2">Variable</th>
                                                    <th className="px-4 py-2 text-center">Mostrar en Nombre EN</th>
                                                    <th className="px-4 py-2">Tratamiento</th>
                                                    <th className="px-4 py-2 text-center">Si no existe traducción</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {enConfig.map((c) => {
                                                    // Logic to detect if it's active in ES
                                                    const esVariables = rules.filter(r => r.condition_expression !== 'true').map(r => r.condition_expression.split('!=')[0].split('==')[0].trim())
                                                    
                                                    // Mapping: EN var -> possible ES fields
                                                    const mapping: Record<string, string[]> = {
                                                        'rh': ['rh_flag', 'rh'],
                                                        'canto_puertas': ['edge_2mm_flag', 'canto_puertas'],
                                                        'door_color_text': ['door_color_text', 'id_color_frente'],
                                                        'resolved_type': ['product_type', 'designation', 'use_destination']
                                                    }
                                                    const matchKeys = mapping[c.variable_id] || [c.variable_id]
                                                    const isActiveInEs = matchKeys.some(k => esVariables.includes(k))
                                                    const isResolvedTypePart = ['product_type', 'designation', 'use_destination'].includes(c.variable_id)

                                                    return (
                                                        <tr 
                                                            key={c.variable_id} 
                                                            className={`hover:bg-slate-50/50 transition-colors ${!isActiveInEs ? 'bg-slate-50/70 opacity-60' : ''}`}
                                                            title={!isActiveInEs ? 'Esta variable no participa en el nombre en español actual (No pasó el filtro del motor ES)' : ''}
                                                        >
                                                            <td className="px-4 py-2">
                                                                <Input 
                                                                    type="number" 
                                                                    defaultValue={c.order_index} 
                                                                    onBlur={(e) => updateEnConfigField(c.variable_id, 'order_index', parseInt(e.target.value))}
                                                                    className="h-7 w-12 text-center text-[11px] px-1 font-mono"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <div className="flex flex-col">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-xs font-mono font-bold text-slate-700">{c.variable_id}</span>
                                                                        {!isActiveInEs && (
                                                                            <span className="text-[9px] bg-slate-200 text-slate-500 px-1 rounded font-bold uppercase tracking-tighter">Ignorada por ES</span>
                                                                        )}
                                                                        {isResolvedTypePart && (
                                                                            <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded font-bold flex items-center gap-0.5" title="Esta variable se agrupa para formar el 'Tipo Comercial' (Resolved Type)">
                                                                                INFO
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[10px] text-slate-400 italic max-w-[200px] truncate">{c.notes}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2 text-center align-middle">
                                                                <div className="flex justify-center">
                                                                    <button 
                                                                        onClick={() => updateEnConfigField(c.variable_id, 'emit', !c.emit)}
                                                                        disabled={enConfigSaving === c.variable_id}
                                                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${c.emit ? 'bg-indigo-600' : 'bg-slate-200'} ${!isActiveInEs ? 'cursor-not-allowed opacity-50' : ''}`}
                                                                    >
                                                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${c.emit ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <select 
                                                                    className={`h-7 text-[11px] rounded border border-slate-200 bg-white w-full max-w-[160px] ${isResolvedTypePart ? 'bg-slate-50 cursor-not-allowed text-slate-500' : ''}`}
                                                                    value={c.behavior}
                                                                    onChange={(e) => {
                                                                        const newBehavior = e.target.value
                                                                        updateEnConfigField(c.variable_id, 'behavior', newBehavior)
                                                                        
                                                                        // Automatic fallback strategy based on treatment
                                                                        if (newBehavior === 'translate_and_emit') {
                                                                            updateEnConfigField(c.variable_id, 'fallback_strategy', 'translate')
                                                                        } else {
                                                                            updateEnConfigField(c.variable_id, 'fallback_strategy', 'preserve')
                                                                        }
                                                                    }}
                                                                    disabled={enConfigSaving === c.variable_id || isResolvedTypePart}
                                                                >
                                                                    <option value="translate_and_emit">Traducir y mostrar</option>
                                                                    <option value="preserve">Conservar sin traducir</option>
                                                                    {isResolvedTypePart && <option value="classify_and_resolve">Usar para resolver tipo</option>}
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <div className="flex items-center gap-2 justify-center">
                                                                    {c.variable_id === 'special_label' ? (
                                                                        <select 
                                                                            className="h-7 text-[11px] rounded border border-slate-200 bg-indigo-50 w-full max-w-[150px]"
                                                                            value={c.fallback_strategy === 'translate' ? 'traducir' : (c.behavior === 'preserve' ? 'no_traducir' : 'solo_si_existe')}
                                                                            onChange={(e) => {
                                                                                const v = e.target.value;
                                                                                if (v === 'traducir') {
                                                                                    updateEnConfigField(c.variable_id, 'fallback_strategy', 'translate')
                                                                                } else if (v === 'no_traducir') {
                                                                                    updateEnConfigField(c.variable_id, 'behavior', 'preserve')
                                                                                    updateEnConfigField(c.variable_id, 'fallback_strategy', 'preserve')
                                                                                } else {
                                                                                    updateEnConfigField(c.variable_id, 'behavior', 'translate_and_emit')
                                                                                    updateEnConfigField(c.variable_id, 'fallback_strategy', 'preserve')
                                                                                }
                                                                            }}
                                                                        >
                                                                            <option value="traducir">Traducir (Obligatorio)</option>
                                                                            <option value="no_traducir">No traducir (Original)</option>
                                                                            <option value="solo_si_existe">Traducir solo si existe</option>
                                                                        </select>
                                                                    ) : (
                                                                        <div className="text-[10px] font-medium text-slate-500 uppercase tracking-tight bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                                            {c.fallback_strategy === 'translate' ? 'Bloquear y pedir traducción' : 'No aplica'}
                                                                        </div>
                                                                    )}
                                                                    {enConfigSaving === c.variable_id && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── PREVIEW TAB ── */}
                    {activeTab === 'preview' && !massApplyMode && (
                        <div className="px-6 py-4 space-y-4">
                            {isLoadingPreview ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                    <p className="text-sm text-slate-500">Simulando nombres con productos reales...</p>
                                </div>
                            ) : previewResults.length === 0 ? (
                                <div className="text-center py-16">
                                    <Eye className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-400 text-sm">No hay productos disponibles para este tipo.</p>
                                    <Button variant="outline" size="sm" className="mt-4" onClick={handleLoadPreview}>
                                        <RefreshCw className="w-3 h-3 mr-2" /> Generar
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-slate-400 italic">
                                            Simulación con reglas en memoria (no guardadas aún)
                                        </p>
                                        <Button variant="ghost" size="sm" className="text-xs text-blue-600" onClick={handleLoadPreview}>
                                            <RefreshCw className="w-3 h-3 mr-1" /> Generar
                                        </Button>
                                    </div>

                                    <div className="space-y-4">
                                        {previewResults.map((item) => {
                                            const changed = item.previewName !== item.currentName
                                            const empty = !item.previewName
                                            return (
                                                <div key={item.id} className={`p-4 rounded-xl border-2 ${empty ? 'border-red-200 bg-red-50' : changed ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                                                    {/* Header */}
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-mono text-xs text-slate-500 font-bold">{item.code}</span>
                                                        {empty ? (
                                                            <span className="flex items-center gap-1 text-[10px] text-red-600 font-semibold">
                                                                <AlertTriangle className="w-3 h-3" /> Nombre vacío
                                                            </span>
                                                        ) : changed ? (
                                                            <span className="text-[10px] text-amber-700 font-semibold">✦ Cambio detectado</span>
                                                        ) : (
                                                            <span className="flex items-center gap-1 text-[10px] text-green-700 font-semibold">
                                                                <CheckCircle2 className="w-3 h-3" /> Sin cambios
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Names */}
                                                    {item.currentName && (
                                                        <div className="text-[11px] text-slate-400 line-through mb-1">
                                                            Actual: {item.currentName}
                                                        </div>
                                                    )}
                                                    <div className="text-[11px] text-indigo-500 font-medium mb-1">
                                                        VS SAP: <span className="font-bold">{item.productData?.sap_description || '—'}</span>
                                                    </div>
                                                    <div className={`text-sm font-bold mb-1 ${empty ? 'text-red-600 italic' : changed ? 'text-amber-800' : 'text-green-800'}`}>
                                                        {item.previewName || '(vacío — revisa las variables)'}
                                                    </div>

                                                    {/* English Name (Adaptive) */}
                                                    <div className="mt-2 pt-2 border-t border-slate-200/50">
                                                        <div className="text-[10px] uppercase font-black text-slate-400 mb-1 flex items-center gap-1.5">
                                                            <Zap className="w-2.5 h-2.5" />
                                                            Motor EN: {(item as any).previewNameEn && (item as any).isValidEn ? <span className="text-emerald-500">READY</span> : <span className="text-red-500">BLOCKED</span>}
                                                        </div>
                                                        <div className={`text-xs font-bold leading-relaxed ${(item as any).isValidEn ? 'text-indigo-600' : 'text-slate-400 italic'}`}>
                                                            {(item as any).previewNameEn || (item as any).errorEn || (item.previewName === '' ? 'Esperando nombre ES...' : 'Traducción no disponible')}
                                                        </div>
                                                    </div>

                                                    {/* Variable audit */}
                                                    <details className="group">
                                                        <summary className="text-[10px] text-slate-500 cursor-pointer flex items-center gap-1 select-none">
                                                            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                                                            Auditoría de variables
                                                        </summary>
                                                        <div className="mt-2 grid grid-cols-2 gap-1">
                                                            {expectedVars.map(({ field, condition }) => {
                                                                const status = getVarStatus(field, condition, item.productData ?? item)
                                                                const icon = status === 'ok' ? '✅' : status === 'na' ? '🟡' : '🔴'
                                                                const label = status === 'ok' ? '' : status === 'na' ? 'IGNORADO' : 'FALTA'
                                                                return (
                                                                    <div key={field} className="flex items-center gap-1.5 text-[10px]">
                                                                        <span>{icon}</span>
                                                                        <span className="font-mono text-slate-600">{field}</span>
                                                                        {label && <span className={`font-bold ${status === 'na' ? 'text-amber-600' : 'text-red-600'}`}>{label}</span>}
                                                                    </div>
                                                                )
                                                            })}
                                                            <div className="col-span-2 mt-2 pt-2 border-t border-slate-100">
                                                                <div className="text-[10px] font-bold text-slate-500 mb-1">TEXTO NO USADO DE SAP:</div>
                                                                <div className="text-[11px] font-mono text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-100 break-words leading-relaxed">
                                                                    {getUnusedSapText(item.productData?.sap_description || '', item.previewName) || <span className="text-slate-400 italic font-sans">(Todo el texto fue mapeado)</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </details>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── MASS APPLY SCREEN ── */}
                    {massApplyMode && (
                        <div className="px-6 py-4 space-y-4">
                            <div className="flex items-center gap-3">
                                {isApplying ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                                ) : (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                )}
                                <div>
                                    <p className="text-sm font-bold text-slate-800">
                                        {isApplying ? `Aplicando nombres para: ${productType}...` : `Completado — ${massTotal} productos procesados`}
                                    </p>
                                    {!isApplying && (
                                        <p className="text-xs text-slate-500">
                                            {massResults.filter(r => !r.error).length} actualizados · {massResults.filter(r => r.error).length} con alertas
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Progress bar */}
                            {(isApplying || massResults.length > 0) && (
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                        <span>Progreso</span>
                                        <span>{Math.round((massResults.length / (massTotal || 1)) * 100)}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                        <div 
                                            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                                            style={{ width: `${(massResults.length / (massTotal || 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {massResults.length > 0 && (
                                <div className="max-h-[45vh] overflow-y-auto space-y-1.5 border border-slate-100 rounded-xl p-2 bg-slate-50/50">
                                    {massResults.filter(r => (r as any).status === 'ACTIVO' || r.error).map((r, idx) => (
                                        <div key={idx} className={`flex items-start gap-2 p-2.5 rounded-lg text-[11px] shadow-sm ${r.error ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
                                            <span className="shrink-0 mt-0.5">{r.error ? '❌' : '✅'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-mono font-bold text-slate-700">{r.code}</span>
                                                    {(r as any).status === 'INACTIVO' && <span className="text-[9px] bg-slate-200 text-slate-500 px-1 rounded">INACTIVO (Actualizado silenciosamente)</span>}
                                                </div>
                                                {r.newName && !r.error && (
                                                    <span className="text-slate-500 truncate block mt-0.5">{r.newName}</span>
                                                )}
                                                {r.error && (
                                                    <span className="text-red-600 font-medium block mt-0.5">{r.error}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ════ Footer ════ */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 bg-white shrink-0 gap-3">
                    {massApplyMode ? (
                        <>
                            <span className="text-xs text-slate-400">{massResults.length}/{massTotal} procesados</span>
                            <Button onClick={onClose} disabled={isApplying} variant="outline">Cerrar</Button>
                        </>
                    ) : activeTab === 'structure' ? (
                        <>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={addFixedText} className="border-orange-200 text-orange-700 hover:bg-orange-50">
                                    <Plus className="w-4 h-4 mr-1.5" /> Agregar texto estático
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setShowAddVar(v => !v)} className="border-blue-200 text-blue-700 hover:bg-blue-50">
                                    <Plus className="w-4 h-4 mr-1.5" /> Agregar variable
                                </Button>
                            </div>
                            <div className="flex gap-2 items-center">
                                <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                                <Button onClick={() => handleTabChange('preview')} className="bg-slate-800 hover:bg-slate-900 gap-1.5">
                                    Siguiente: Vista Previa
                                    <ArrowDown className="w-4 h-4 -rotate-90" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <span className="text-xs text-slate-400">{previewResults.length} de muestra</span>
                            <div className="flex gap-2 items-center">
                                {savedSuccessfully ? (
                                    <div className="flex flex-col items-end gap-1">
                                        {!previewResults.every((r: any) => r.isValidEn) && (
                                            <span className="text-[10px] text-red-500 font-bold animate-pulse mb-1">
                                                ⚠ Bloqueado: Hay errores en nombres EN (Glosario faltante)
                                            </span>
                                        )}
                                        <Button
                                            size="sm"
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 animate-in zoom-in-95 duration-200"
                                            onClick={handleMassApply}
                                            disabled={!previewResults.every((r: any) => r.isValidEn)}
                                        >
                                            <Zap className="w-3.5 h-3.5" />
                                            Aplicar cambio de nombres MASIVO
                                        </Button>
                                    </div>
                                ) : (
                                    <Button 
                                        onClick={handleSaveOrder} 
                                        disabled={loading} 
                                        className="bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-100"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                        {loading ? 'Guardando...' : 'Aplicar Cambios a MUEBLE'}
                                    </Button>
                                )}
                                <Button variant="ghost" onClick={onClose}>Cerrar</Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
