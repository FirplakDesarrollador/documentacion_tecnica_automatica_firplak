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
import { Badge } from '@/components/ui/badge'
import { 
    upsertRuleAction, 
    deleteRuleAction, 
    previewNamingRulesAction, 
    getProductsCountByFamilyAction, 
    applyFullBulkNamingUpdateBatchAction, 
    revalidateRulesAndProductsAction, 
    getEnConfigAction, 
    saveEnConfigAction,
    saveFullConfigAction,
    saveGlossaryTermsAction
} from '@/app/rules/actions'
import { toast } from 'sonner'
import { ArrowUp, ArrowDown, Plus, Trash2, Eye, Settings2, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Zap, ChevronDown } from 'lucide-react'

// ─── Dynamic Expected Vars Helper ────────────────────────────────────────────
function getExpectedVarsFromRules(rules: any[]) {
    const vars: { field: string; label: string; condition: string }[] = [];
    const seen = new Set<string>();

    // Solo componentes de nombre habilitados
    const activeRules = rules.filter(r => r.rule_type === 'name_component' && r.enabled);

    activeRules.forEach(rule => {
        const fieldsInRule: { field: string; condition: string }[] = [];

        // Extraer de payload: {variable}
        const payloadMatches = rule.action_payload.match(/{([^}]+)}/g);
        if (payloadMatches) {
            payloadMatches.forEach((m: string) => {
                const f = m.replace(/[{}]/g, '').toLowerCase();
                const meta = ADDABLE_FIELDS.find(af => af.field === f);
                fieldsInRule.push({ 
                    field: f, 
                    condition: meta?.type === 'boolean' ? '==true' : '!=null' 
                });
            });
        }

        // Extraer de condición: campo!=null, campo==true
        const condParts = rule.condition_expression.split(/[&|!=\s<>]+/).filter(Boolean);
        condParts.forEach((t: string) => {
            const f = t.toLowerCase();
            const meta = ADDABLE_FIELDS.find(af => af.field === f);
            if (meta) {
                fieldsInRule.push({ 
                    field: f, 
                    condition: meta.type === 'boolean' ? '==true' : '!=null' 
                });
            }
        });

        // Mantener orden y unicidad
        fieldsInRule.forEach(item => {
            if (!seen.has(item.field)) {
                seen.add(item.field);
                const meta = ADDABLE_FIELDS.find(af => af.field === item.field);
                vars.push({ 
                    field: item.field, 
                    label: meta?.label || item.field, 
                    condition: item.condition 
                });
            }
        });
    });

    return vars;
}

// ─── Addable text fields ─────────────────────────────────────────────────────
const ADDABLE_FIELDS = [
    { field: 'product_type', label: 'Tipo de producto', type: 'text' },
    { field: 'designation', label: 'Designación', type: 'text' },
    { field: 'cabinet_name', label: 'Nombre del gabinete', type: 'text' },
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
    { field: 'code', label: 'Código SKU', type: 'text' },
    { field: 'sku_base', label: 'Código Base SKU', type: 'text' },
    { field: 'barcode_text', label: 'Código de Barras', type: 'text' },
    { field: 'private_label_client_name', label: 'Cliente marca propia', type: 'text' },
]

function getVarStatus(field: string, condition: string, product: any): 'SÍ' | 'IGNORADA' | 'FALTA' {
    const val = product[field]
    
    if (condition === '==true') {
        if (val === null || val === undefined) return 'FALTA'
        return val === true ? 'SÍ' : 'IGNORADA'
    }
    
    // != null → also skip if value is literally "NA"
    const isEmpty = val === null || val === undefined || val === ''
    const isNA = String(val ?? '').trim().toUpperCase() === 'NA'
    
    if (isEmpty) return 'FALTA'
    if (isNA) return 'IGNORADA'
    return 'SÍ'
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

// ─── Sub-component for controlled order index ──────────────────────────────
function OrderIndexInput({ initialValue, onSave, disabled }: { initialValue: number, onSave: (val: number) => void, disabled?: boolean }) {
    const [val, setVal] = useState(initialValue.toString());
    
    // Sync with external changes (e.g., if reordered elsewhere or reset)
    useEffect(() => {
        setVal(initialValue.toString());
    }, [initialValue]);

    return (
        <Input 
            type="number" 
            value={val} 
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
                const num = parseInt(val);
                if (!isNaN(num) && num !== initialValue) {
                    onSave(num);
                } else {
                    setVal(initialValue.toString());
                }
            }}
            disabled={disabled}
            className="h-7 w-12 text-center text-[11px] px-1 font-mono"
        />
    );
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
    sapDescription: string
    previewName: string
    productData: any
    previewNameEn?: string
    isValidEn?: boolean
    errorEn?: string
    missingTerms?: string[]
}

type MassApplyResult = { code: string; newName: string; newNameEn?: string; oldName: string; error?: string; status?: string }

export function NamingRulesManager({ open, productType, onClose, initialRules }: NamingRulesManagerProps) {
    const [rules, setRules] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<'orden_es' | 'orden_en' | 'vista_previa'>('orden_es')

    // EN Config tab state
    const [enConfig, setEnConfig] = useState<any[]>([])
    const [enConfigLoading, setEnConfigLoading] = useState(false)
    const [enConfigSaving, setEnConfigSaving] = useState<string | null>(null) // variable_id being saved
    const [showEnSyncAlert, setShowEnSyncAlert] = useState(false)

    // Preview state
    const [previewResults, setPreviewResults] = useState<PreviewResult[]>([])
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)
    const [previewGenerated, setPreviewGenerated] = useState(false)
    const [savedSuccessfully, setSavedSuccessfully] = useState(false)

    // New Governance states
    const [glossaryEdits, setGlossaryEdits] = useState<Record<string, string>>({})
    const [isSavingGlossary, setIsSavingGlossary] = useState(false)

    const [massApplyMode, setMassApplyMode] = useState(false)
    const [isApplying, setIsApplying] = useState(false)
    const [massResults, setMassResults] = useState<any[]>([])
    const [massTotal, setMassTotal] = useState(0)
    const [deletedIds, setDeletedIds] = useState<string[]>([])
    
    // Sync issues state
    const [syncIssues, setSyncIssues] = useState<{ missing: string[], obsolete: string[] }>({ missing: [], obsolete: [] })

    // Add variable dialog
    const [showAddVar, setShowAddVar] = useState(false)
    const [selectedField, setSelectedField] = useState('')
    const [selectedCondition, setSelectedCondition] = useState('')
    const [variablePrefix, setVariablePrefix] = useState('')
    const [variableSuffix, setVariableSuffix] = useState('')

    // ─── Helper: Normalize Priorities ────────────────────────────────────
    const reindexRules = (list: any[]) => {
        return list.map((r, idx) => ({
            ...r,
            priority: idx * 10
        }))
    }

    useEffect(() => {
        // Only sync if we haven't just saved (to avoid resetting the "Mass Apply" UI)
        if (!savedSuccessfully) {
            const sorted = [...initialRules].sort((a: any, b: any) => a.priority - b.priority)
            setRules(reindexRules(sorted))
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
        
        const indexed = reindexRules(newRules)
        setRules(indexed)
        markDirty()
    }

    const handleSaveOrder = async () => {
        // Final sync check before saving
        const issues = checkSyncIssues(enConfig)
        if (issues.missing.length > 0 || issues.obsolete.length > 0) {
            toast.error("No se puede guardar: Existe una desincronización estructural. Por favor, revisa la pestaña 'Orden EN'.")
            setActiveTab('orden_en')
            setSyncIssues(issues)
            setShowEnSyncAlert(true)
            return
        }

        setLoading(true)
        try {
            await saveFullConfigAction(productType, rules, deletedIds, enConfig)
            toast.success("Configuración ES + EN guardada correctamente")
            setSavedSuccessfully(true)
            setDeletedIds([])
        } catch (err: any) {
            toast.error("Error al guardar: " + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSaveGlossary = async () => {
        const termsToSave = Object.entries(glossaryEdits)
            .filter(([_, en]) => en.trim() !== '')
            .map(([es, en]) => ({ es, en }))
            
        if (termsToSave.length === 0) return
        
        setIsSavingGlossary(true)
        try {
            await saveGlossaryTermsAction(termsToSave)
            toast.success(`${termsToSave.length} términos guardados en el glosario`)
            setGlossaryEdits({})
            // Auto-revalidate preview after saving glossary
            await handleLoadPreview()
        } catch (err: any) {
            toast.error("Error al guardar glosario: " + err.message)
        } finally {
            setIsSavingGlossary(false)
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
        const updated = reindexRules([...rules, newRule])
        setRules(updated)
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
        const updated = reindexRules([...rules, newRule])
        setRules(updated)
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
        const indexed = reindexRules(nr)
        setRules(indexed)
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

    const getActiveEsVariables = () => {
        return [...new Set(rules
            .filter(r => r.condition_expression !== 'true')
            .map(r => {
                // Extract base variable from expression (field!=null, field==true)
                return r.condition_expression.split('!=')[0].split('==')[0].trim()
            })
        )]
    }

    const checkSyncIssues = (currentEnConfig: any[]) => {
        const esVars = getActiveEsVariables()
        
        // Mapping: EN var -> possible ES fields
        const mappingKeys: Record<string, string[]> = {
            'rh': ['rh_flag', 'rh'],
            'canto_puertas': ['edge_2mm_flag', 'canto_puertas'],
            'door_color_text': ['door_color_text', 'id_color_frente'],
            'resolved_type': ['product_type', 'designation', 'use_destination']
        }

        const enVars = currentEnConfig.map(c => c.variable_id)
        
        // Missing in EN: ES vars that are not covered by any EN entry
        const missing = esVars.filter(ev => {
            // Find if any enVar covers this ev
            const isCovered = enVars.some(env => {
                const possibleEs = mappingKeys[env] || [env]
                return possibleEs.includes(ev)
            })
            return !isCovered
        })

        // Obsolete in EN: EN entries that don't match any active ES var
        const obsolete = enVars.filter(env => {
            if (env === 'resolved_type') return false // commercial type is always valid
            if (env === 'special_label' || env === 'private_label_client_name' || env === 'assembled_flag' || env === 'armado_con_lvm' || env === 'carb2') {
                // check if they exist in ES rules too
                return !esVars.includes(env)
            }
            const possibleEs = mappingKeys[env] || [env]
            return !possibleEs.some(pe => esVars.includes(pe))
        })

        return { missing, obsolete }
    }

    const handleSyncEnWithEs = async () => {
        const issues = checkSyncIssues(enConfig)
        if (issues.missing.length === 0 && issues.obsolete.length === 0) {
            toast.info("La configuración ya está sincronizada")
            return
        }

        let newEnConfig = [...enConfig]
        
        // 1. Remove obsolete
        newEnConfig = newEnConfig.filter(c => !issues.obsolete.includes(c.variable_id))
        
        // 2. Add missing
        issues.missing.forEach(v => {
            // Smart defaults for new variables
            const isTechnical = ['rh', 'canto_puertas', 'rh_flag', 'edge_2mm_flag'].includes(v)
            const isColor = v === 'door_color_text' || v === 'id_color_frente'
            
            newEnConfig.push({
                variable_id: v,
                order_index: newEnConfig.length * 10,
                emit: true,
                behavior: (isTechnical || isColor) ? 'translate_and_emit' : 'preserve',
                fallback_strategy: (isTechnical || isColor) ? 'translate' : 'preserve',
                drop_if_resolved: false,
                notes: `Variable sincronizada desde ES: ${v}`
            })
        })

        setEnConfig(newEnConfig)
        setSyncIssues({ missing: [], obsolete: [] })
        setShowEnSyncAlert(false)
        toast.success("Estructura sincronizada con éxito")
    }

    const handleTabChange = async (tab: 'orden_es' | 'orden_en' | 'vista_previa') => {
        // Safe check: If entering EN or Preview, we MUST check sync
        if (tab === 'orden_en' || tab === 'vista_previa') {
            const issues = checkSyncIssues(enConfig)
            setSyncIssues(issues)
            setShowEnSyncAlert(issues.missing.length > 0 || issues.obsolete.length > 0)
        }

        setActiveTab(tab)
        
        if (tab === 'vista_previa' && !previewGenerated) {
            handleLoadPreview()
        } else if (tab === 'orden_en' && enConfig.length === 0) {
            setEnConfigLoading(true)
            try {
                const cfg = await getEnConfigAction('MUEBLE') 
                setEnConfig(cfg)
                const issues = checkSyncIssues(cfg)
                setSyncIssues(issues)
                setShowEnSyncAlert(issues.missing.length > 0 || issues.obsolete.length > 0)
            } catch (err: any) {
                toast.error("Error al cargar config EN: " + err.message)
            } finally {
                setEnConfigLoading(false)
            }
        }
    }

    const updateEnConfigField = async (variable_id: string, field: string, value: any) => {
        // Optimistic update for immediate visual reordering or UI response
        setEnConfig(prev => {
            const updated = prev.map(c => c.variable_id === variable_id ? { ...c, [field]: value } : c)
            if (field === 'order_index') {
                return [...updated].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
            }
            return updated
        })

        setEnConfigSaving(variable_id)
        try {
            await saveEnConfigAction('MUEBLE', variable_id, { [field]: value })
            // Success: state already updated optimistically
            toast.success(`Configuración actualizada`)
        } catch (err: any) {
            // Rollback optimistic change on error (optional, but safer)
            // For now, just toast error. 
            toast.error("Error al guardar: " + err.message)
            // Reload from server to be safe
            const cfg = await getEnConfigAction('MUEBLE') 
            setEnConfig(cfg)
        } finally {
            setEnConfigSaving(null)
        }
    }

    const handleMassApply = async () => {
        if (showEnSyncAlert) {
            toast.error("No se puede aplicar masivamente: Existe una desincronización estructural entre ES y EN.")
            return
        }

        setIsApplying(true)
        setMassApplyMode(true)
        setMassResults([])
        setMassTotal(0)
        
        try {
            const total = await getProductsCountByFamilyAction(productType)
            setMassTotal(total)
            
            if (total === 0) {
                setIsApplying(false)
                return
            }

            const BATCH_SIZE = 100
            let allResults: any[] = []
            
            for (let offset = 0; offset < total; offset += BATCH_SIZE) {
                const batchResults = await applyFullBulkNamingUpdateBatchAction(
                    productType, 
                    offset, 
                    BATCH_SIZE,
                    rules,
                    enConfig
                )
                allResults = [...allResults, ...batchResults]
                setMassResults([...allResults])
            }
            
            await revalidateRulesAndProductsAction()
            toast.success(`Gobernanza aplicada: ${total} productos actualizados (ES + EN)`)
        } catch (err: any) {
            toast.error("Error en aplicación masiva: " + err.message)
        } finally {
            setIsApplying(false)
        }
    }

    const dynamicExpectedVars = getExpectedVarsFromRules(rules)

    return (
        <Dialog open={open} onOpenChange={(val) => { if (!val) onClose() }}>
            <DialogContent className="sm:max-w-[720px] h-[88vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <DialogTitle className="text-xl">Nomenclatura: {productType}</DialogTitle>

                    {/* Tab switcher */}
                    <div className="flex gap-1 mt-3 bg-slate-100 p-1 rounded-lg w-fit">
                        <button
                            onClick={() => handleTabChange('orden_es')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'orden_es' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Settings2 className="w-3.5 h-3.5" />
                            Orden ES
                        </button>
                        <button
                            onClick={() => handleTabChange('orden_en')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all relative ${activeTab === 'orden_en' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
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
                            onClick={() => handleTabChange('vista_previa')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all relative ${activeTab === 'vista_previa' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
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

                    {/* ── ORDEN ES TAB ── */}
                    {activeTab === 'orden_es' && !massApplyMode && (
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
                                            <span className={`text-[10px] font-bold uppercase tracking-tighter text-blue-500`}>
                                                Variable ({rule.condition_expression})
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                Prioridad: {rule.priority}
                                            </span>
                                        </div>
                                        {rule.condition_expression === 'true' ? (
                                            <Input
                                                value={rule.action_payload ?? ""}
                                                onChange={(e) => updateText(idx, e.target.value)}
                                                className="h-8 bg-orange-50 font-bold border-orange-200 text-orange-700"
                                            />
                                        ) : (
                                            <Input
                                                value={rule.action_payload ?? ""}
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
                                                value={selectedField || ""}
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
                                                value={variablePrefix ?? ""}
                                                onChange={e => setVariablePrefix(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-medium block mb-1">Sufijo (Opcional)</label>
                                            <Input
                                                placeholder="Ej:  -"
                                                className="h-8 text-xs"
                                                value={variableSuffix ?? ""}
                                                onChange={e => setVariableSuffix(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-medium block mb-1">Condición</label>
                                            {selectedField && ADDABLE_FIELDS.find(x => x.field === selectedField)?.type === 'boolean' ? (
                                                <select
                                                    className="w-full h-8 text-xs rounded-md border border-slate-200 bg-white px-2"
                                                    value={selectedCondition || ""}
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

                    {/* ── ORDEN EN TAB ── */}
                    {activeTab === 'orden_en' && (
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
                                                El sistema toma automáticamente las variables validadas por el nombre en español. Aquí defines el orden, el tratamiento (traducir o conservar) y cómo resolver términos faltantes.
                                            </div>
                                        </div>
                                    </div>

                                    {showEnSyncAlert && (
                                        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4 flex flex-col gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                                            <div className="flex items-start gap-3">
                                                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                                <div className="flex-1">
                                                    <h3 className="text-sm font-bold text-red-900 uppercase tracking-tight">Desincronización Estructural Detectada</h3>
                                                    <p className="text-xs text-red-700 mt-1 leading-relaxed">
                                                        La estructura del Orden EN no coincide con las variables activas del Orden ES. 
                                                        Esto puede causar errores en la generación de nombres bilingües.
                                                    </p>
                                                    <div className="mt-3 grid grid-cols-2 gap-4">
                                                        {syncIssues.missing.length > 0 && (
                                                            <div>
                                                                <p className="text-[10px] font-bold text-red-800 uppercase mb-1">Faltan en EN:</p>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {syncIssues.missing.map(v => (
                                                                        <span key={v} className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">+{v}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {syncIssues.obsolete.length > 0 && (
                                                            <div>
                                                                <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Obsoletas en EN:</p>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {syncIssues.obsolete.map(v => (
                                                                        <span key={v} className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">-{v}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2 border-t border-red-100 pt-3">
                                                <Button 
                                                    size="sm" 
                                                    className="bg-red-600 hover:bg-red-700 text-white font-bold h-8 text-xs"
                                                    onClick={handleSyncEnWithEs}
                                                >
                                                    <RefreshCw className="w-3 h-3 mr-1.5" />
                                                    Resincronizar con Orden ES
                                                </Button>
                                            </div>
                                        </div>
                                    )}

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
                                                {[...enConfig].sort((a, b) => a.order_index - b.order_index).map((c) => {
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
                                                                <OrderIndexInput 
                                                                    initialValue={c.order_index} 
                                                                    onSave={(val) => updateEnConfigField(c.variable_id, 'order_index', val)}
                                                                    disabled={enConfigSaving === c.variable_id}
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
                                                                    value={c.behavior || "translate_and_emit"}
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
                    
                    {activeTab === 'vista_previa' && (
                        <div className="flex flex-col h-full space-y-0 overflow-hidden">
                            {/* Header info */}
                            <div className="px-6 py-2 bg-slate-100/50 border-b border-slate-200 flex justify-between items-center shrink-0">
                                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-tight flex items-center gap-2">
                                    <Eye className="w-3.5 h-3.5 text-blue-500" /> Auditoría de Nombres (SAP vs ES vs EN)
                                </span>
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] text-blue-600 font-bold" onClick={handleLoadPreview}>
                                    <RefreshCw className="w-3 h-3 mr-1" /> Revalidar Muestra
                                </Button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-6 py-4">
                                {isLoadingPreview ? (
                                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                        <p className="text-sm text-slate-500 font-medium">Evaluando reglas y traduciendo...</p>
                                    </div>
                                ) : previewResults.length === 0 ? (
                                    <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-slate-200">
                                        <Eye className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                        <p className="text-slate-400 text-sm">No hay productos disponibles para este tipo.</p>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                                    <div className="flex flex-col gap-4">
                                        {previewResults.map((item) => {
                                            const esChanged = item.sapDescription !== item.previewName;
                                            const unusedTerms = getUnusedSapText(item.sapDescription, item.previewName);
                                            const expectedVars = dynamicExpectedVars;
                                            
                                            return (
                                                <div key={item.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden hover:border-slate-300 transition-all">
                                                    {/* Header: Code & Reference */}
                                                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <span className="font-mono text-[12px] font-bold text-slate-900 border-r border-slate-200 pr-3">{item.code}</span>
                                                            <span className="text-[10px] text-slate-500 font-medium">Ref: <span className="font-mono">{item.productData.ref_code}</span></span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {item.isValidEn && item.previewName ? (
                                                                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                                    <CheckCircle2 className="w-3 h-3" /> LISTO
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                                    <AlertTriangle className="w-3 h-3" /> VERIFICAR
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="p-4 space-y-4">
                                                        {/* SAP Content */}
                                                        <div className="space-y-1">
                                                            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Nombre SAP (ERP Actual)</p>
                                                            <p className="text-[11px] font-medium text-slate-500 italic leading-snug break-words bg-slate-50/50 p-2 rounded border border-slate-100/50">
                                                                {item.sapDescription || '—'}
                                                            </p>
                                                        </div>

                                                        {/* Proposed Names Grid */}
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="space-y-1">
                                                                <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Propuesto Español (ES)</p>
                                                                <div className="text-[12px] font-bold text-slate-800 leading-snug break-words p-2.5 bg-blue-50/30 rounded-lg border border-blue-100/50">
                                                                    {item.previewName ? (
                                                                        item.previewName.split(' ').map((word, i) => {
                                                                            const isNew = word && !item.sapDescription?.toUpperCase().includes(word.toUpperCase());
                                                                            return (
                                                                                <span key={i} className={isNew ? "text-emerald-700 bg-emerald-100/50 px-0.5 rounded" : ""}>
                                                                                    {word}{' '}
                                                                                </span>
                                                                            );
                                                                        })
                                                                    ) : <span className="text-red-500 italic">Error: Nombre Vacío</span>}
                                                                </div>
                                                                {unusedTerms && (
                                                                    <div className="flex flex-wrap gap-1 mt-1.5 px-1">
                                                                        <span className="text-[9px] text-amber-600 font-bold uppercase tracking-tighter mr-1">Removido (SAP):</span>
                                                                        {unusedTerms.split(' ').map(term => (
                                                                            <span key={term} className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md border border-amber-100 font-medium scale-95 origin-left">
                                                                                {term}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="space-y-1">
                                                                <p className="text-[9px] uppercase font-bold text-indigo-600 tracking-wider">Propuesto Inglés (EN)</p>
                                                                <div className="text-[12px] font-bold text-slate-800 leading-snug break-words p-2.5 bg-indigo-50/30 rounded-lg border border-indigo-100/50">
                                                                    {item.isValidEn ? (
                                                                        item.previewNameEn
                                                                    ) : (
                                                                        <div className="flex flex-col">
                                                                            <span className="text-red-500 italic">{item.errorEn || 'Error de Traducción'}</span>
                                                                            {item.missingTerms && item.missingTerms.length > 0 && (
                                                                                <div className="flex flex-wrap gap-1 mt-1">
                                                                                    {item.missingTerms.map(t => (
                                                                                        <span key={t} className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">+{t}</span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Variable Validation (Horizontal Scrollable or Wrap) */}
                                                        <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                                                            <p className="text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-2">Validación de Variables Técnicas</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {expectedVars.map((v) => {
                                                                    const status = getVarStatus(v.field, v.condition, item.productData);
                                                                    const label = ADDABLE_FIELDS.find(f => f.field === v.field)?.label || v.field;
                                                                    
                                                                    let colorClass = "bg-white text-slate-400 border-slate-200";
                                                                    if (status === 'SÍ') colorClass = "bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm";
                                                                    if (status === 'IGNORADA') colorClass = "bg-slate-200 text-slate-500 border-slate-300";
                                                                    if (status === 'FALTA') colorClass = "bg-red-100 text-red-700 border-red-200 animate-pulse-subtle";

                                                                    return (
                                                                        <div key={v.field} className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-bold ${colorClass}`}>
                                                                            <span>{label}:</span>
                                                                            <span className="bg-white/50 px-1 rounded">{status}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    </div>
                                )}
                            </div>

                            {/* Glossary Resolution Panel */}
                            {!isLoadingPreview && previewResults.some(r => !r.isValidEn && r.missingTerms && r.missingTerms.length > 0) && (
                                <div className="shrink-0 bg-amber-50 border-t border-amber-200 p-4 max-h-[30vh] overflow-y-auto">
                                    <div className="flex items-center justify-between mb-3 px-2">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-amber-500 p-1.5 rounded-lg shadow-sm">
                                                <Zap className="w-4 h-4 text-white" />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-tight">Resolver Glosario Faltante</h4>
                                                <p className="text-[10px] text-amber-600 font-medium">Estos términos son necesarios para completar la traducción al inglés.</p>
                                            </div>
                                        </div>
                                        <Button 
                                            size="sm" 
                                            className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 shadow-sm"
                                            disabled={isSavingGlossary || Object.keys(glossaryEdits).length === 0}
                                            onClick={handleSaveGlossary}
                                        >
                                            {isSavingGlossary ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
                                            Guardar y Revalidar
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 px-2 pb-2">
                                        {[...new Set(previewResults.flatMap(r => r.missingTerms || []))].map(term => (
                                            <div key={term} className="bg-white p-3 rounded-xl border border-amber-200 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-bold text-amber-700 uppercase tracking-tight">Término en Español</span>
                                                    <div className="text-[11px] font-mono font-bold bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100 truncate text-slate-700">
                                                        {term}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-tight">Traducción Inglés</span>
                                                    <Input 
                                                        className="h-8 text-xs bg-white border-indigo-200 focus:ring-indigo-100 rounded-lg font-medium" 
                                                        placeholder="Ej: SLIDES..." 
                                                        value={glossaryEdits[term] || ''}
                                                        onChange={(e) => setGlossaryEdits(prev => ({ ...prev, [term]: e.target.value.toUpperCase() }))}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                 handleSaveGlossary()
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
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
                                        {isApplying ? `Procesando actualización masiva ES + EN...` : `Completado — ${massTotal} productos procesados`}
                                    </p>
                                    <div className="flex gap-2 text-[10px] font-bold mt-1">
                                        <span className={isApplying && massResults.length < massTotal/2 ? 'text-blue-600 animate-pulse' : 'text-slate-400'}>ETAPA 1: ESPAÑOL</span>
                                        <span className="text-slate-300">|</span>
                                        <span className={isApplying && massResults.length >= massTotal/2 ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}>ETAPA 2: INGLÉS</span>
                                    </div>
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
                                <div className="max-h-[45vh] overflow-y-auto space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50 shadow-inner">
                                    {massResults.map((r: any, idx) => (
                                        <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border text-[11px] transition-all shadow-sm ${r.error ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                            <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${r.error ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                {r.error ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="font-mono font-bold text-slate-800 tracking-tight">{r.code}</span>
                                                    {r.status === 'INACTIVO' && <span className="text-[9px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-wider">Inactivo</span>}
                                                </div>
                                                
                                                {!r.error ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 mt-1.5 pt-1.5 border-t border-slate-50">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Español (ES)</span>
                                                            <span className="text-slate-600 font-medium truncate">{r.name_es}</span>
                                                        </div>
                                                        <div className="flex flex-col border-l border-slate-100 pl-4">
                                                            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-tighter">Inglés (EN)</span>
                                                            <span className="text-indigo-600 font-bold truncate">{r.name_en || "FALTA TRADUCCIÓN"}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="mt-1 flex flex-col gap-1">
                                                        {r.name_es && (
                                                            <div className="flex flex-col opacity-60 mb-1">
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Propuesto ES: {r.name_es}</span>
                                                            </div>
                                                        )}
                                                        <span className="text-red-700 font-bold bg-red-100/50 px-2 py-1 rounded inline-block w-fit border border-red-200">
                                                            MOTIVO: {r.error}
                                                        </span>
                                                    </div>
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
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-4">
                                <span className="text-xs font-medium text-slate-500">
                                    Total: <span className="font-bold text-slate-700">{massResults.length}</span> / {massTotal}
                                </span>
                                <div className="flex items-center gap-3 border-l pl-4 border-slate-200">
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-bold px-2 py-0.5 h-6">
                                        {massResults.filter((r: any) => !r.error).length} ÉXITOS
                                    </Badge>
                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-bold px-2 py-0.5 h-6">
                                        {massResults.filter((r: any) => r.error).length} FALLIDOS
                                    </Badge>
                                </div>
                            </div>
                            <Button onClick={onClose} disabled={isApplying} variant="outline" className="h-9 px-6 font-bold uppercase tracking-wide">Cerrar</Button>
                        </div>
                    ) : (activeTab as any) === 'orden_es' ? (
                        <>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setShowAddVar(v => !v)} className="border-blue-200 text-blue-700 hover:bg-blue-50">
                                    <Plus className="w-4 h-4 mr-1.5" /> Agregar variable
                                </Button>
                            </div>
                            <div className="flex gap-2 items-center">
                                <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                                <Button onClick={() => handleTabChange('orden_en')} className="bg-slate-800 hover:bg-slate-900 gap-1.5">
                                    Siguiente: Orden EN
                                    <ArrowDown className="w-4 h-4 -rotate-90" />
                                </Button>
                            </div>
                        </>
                    ) : (activeTab as any) === 'orden_en' ? (
                        <>
                            <span className="text-xs text-slate-400">{enConfig.length} variables configuradas</span>
                            <div className="flex gap-2 items-center">
                                <Button variant="ghost" onClick={() => setActiveTab('orden_es')}>Atrás</Button>
                                <Button onClick={() => handleTabChange('vista_previa')} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5 shadow-md shadow-indigo-100">
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
                                            <span className="text-[10px] text-red-500 font-bold animate-pulse mb-1 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Bloqueado: Glosario faltante o errores
                                            </span>
                                        )}
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => setSavedSuccessfully(false)}>Ajustar Reglas</Button>
                                            <Button
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 animate-in zoom-in-95 duration-200"
                                                onClick={handleMassApply}
                                                disabled={!previewResults.every((r: any) => r.isValidEn)}
                                            >
                                                <Zap className="w-3.5 h-3.5" />
                                                Aplicar cambios masivos ES + EN
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <Button variant="ghost" onClick={() => setActiveTab('orden_en')}>Atrás</Button>
                                        <Button 
                                            onClick={handleSaveOrder} 
                                            disabled={loading} 
                                            className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100 font-bold px-6"
                                        >
                                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                            {loading ? 'Guardando...' : 'Guardar configuración ES + EN'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
