'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { 
    Database, 
    FileSpreadsheet, 
    ChevronRight, 
    CheckCircle2, 
    AlertCircle, 
    Loader2,
    Settings,
    Layers,
    Table as TableIcon,
    RotateCcw,
    PlusCircle,
    Combine,
    Info
} from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import {
    createDatasetImportAction,
    getDatasetsAction,
    linkDatasetToTemplatesAction,
    revalidateDatasetsPathsAction,
} from '@/app/datasets/actions'
import { getDatasetModeTemplatesAction } from '@/app/templates/actions'
import { extractTemplateVariables } from '@/lib/templates/templateVariables'

interface ExistingDataset {
    id: string
    name: string
}

interface DatasetIngestorProps {
    mode: 'new' | { id: string; name: string }
    existingDatasets: ExistingDataset[]
    onClose: () => void
    onDone: (updated: Record<string, unknown>[]) => void
}

type Step = 'name_file' | 'strategy' | 'mapping' | 'associate_templates' | 'preview'
type WorkflowStep = { id: Step; label: string }

const NEW_DATASET_STEPS: WorkflowStep[] = [
    { id: 'name_file', label: 'Archivo' },
    { id: 'mapping', label: 'Variables' },
    { id: 'associate_templates', label: 'Plantilla' },
    { id: 'preview', label: 'Confirmar' },
]

const UPDATE_DATASET_STEPS: WorkflowStep[] = [
    { id: 'name_file', label: 'Archivo' },
    { id: 'strategy', label: 'Estrategia' },
    { id: 'mapping', label: 'Variables' },
    { id: 'preview', label: 'Confirmar' },
]

const STRATEGY_LABELS = {
    overwrite: 'Sobrescribir todo',
    append: 'Añadir al final',
    merge: 'Fusionar / Actualizar',
} as const

function getImportErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null) {
        const candidate = error as { message?: unknown; details?: unknown; code?: unknown }
        const message = typeof candidate.message === 'string' ? candidate.message : ''
        const details = typeof candidate.details === 'string' ? candidate.details : ''
        const code = typeof candidate.code === 'string' ? candidate.code : ''
        return [message, details, code ? `(${code})` : ''].filter(Boolean).join(' ')
    }
    return String(error)
}

export function DatasetIngestor({ mode, existingDatasets, onClose, onDone }: DatasetIngestorProps) {
    const isNew = mode === 'new'
    const supabase = useMemo(() => createClient(), [])
    const workflowSteps = isNew ? NEW_DATASET_STEPS : UPDATE_DATASET_STEPS
    
    const [step, setStep] = useState<Step>('name_file')
    const [datasetName, setDatasetName] = useState(isNew ? '' : mode.name)
    const [strategy, setStrategy] = useState<'overwrite' | 'append' | 'merge'>('overwrite')
    
    const [csvHeaders, setCsvHeaders] = useState<string[]>([])
    const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
    const [encoding, setEncoding] = useState<string>('UTF-8')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    
    // Mapeo de campos críticos
    const [fieldMap, setFieldMap] = useState<Record<string, string>>({
        code: '',
        final_name_es: ''
    })
    
    // Columnas a incluir como datos extra
    const [selectedColumns, setSelectedColumns] = useState<string[]>([])
    
    // Configuración detallada por columna (Key para variable y Label para vista)
    const [columnConfigs, setColumnConfigs] = useState<Record<string, { key: string, label: string }>>({})

    const [loading, setLoading] = useState(false)

    const [availableTemplates, setAvailableTemplates] = useState<{ id: string; name: string; elements_json: string; data_source: string }[]>([])
    const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
    const [templateVarToHeader, setTemplateVarToHeader] = useState<Record<string, string>>({})

    const currentStepIndex = workflowSteps.findIndex((workflowStep) => workflowStep.id === step)
    const currentStep = workflowSteps[currentStepIndex]
    const hasLoadedFile = csvHeaders.length > 0
    const selectedTemplateNames = useMemo(
        () => availableTemplates.filter((template) => selectedTemplateIds.includes(template.id)).map((template) => template.name),
        [availableTemplates, selectedTemplateIds]
    )
    const templateSummary = selectedTemplateNames.length === 0
        ? 'Ninguna'
        : selectedTemplateNames.length === 1
            ? selectedTemplateNames[0]
            : `${selectedTemplateNames.length} plantillas asociadas`

    const stripDiacritics = (value: string) =>
        value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    const toSnakeCaseKey = (value: string) => {
        const base = stripDiacritics(String(value || '').trim().toLowerCase())
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')

        if (!base) return 'col'
        if (/^[a-z]/.test(base)) return base
        return `col_${base}`
    }

    const toDisplayLabel = (value: string) => {
        const normalized = String(value || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

        if (!normalized) return ''

        const lower = normalized.toLowerCase()
        return lower.charAt(0).toUpperCase() + lower.slice(1)
    }

    // Auto-mapeo inicial al cargar archivo
    const autoMap = (headers: string[]) => {
        const newMap: Record<string, string> = { code: '', final_name_es: '' }
        headers.forEach(header => {
            const hLower = stripDiacritics(header).toLowerCase()
            if (!newMap.code && (hLower.includes('codigo') || hLower.includes('sku') || hLower === 'id' || hLower === 'code' || hLower.includes('sap'))) {
                newMap.code = header
            }
            if (!newMap.final_name_es && (hLower.includes('nombre') || hLower.includes('descrip') || hLower === 'name')) {
                newMap.final_name_es = header
            }
        })
        setFieldMap(newMap)
        // Por defecto incluir todas las columnas en la primera carga
        setSelectedColumns(headers)
        
        // Inicializar configuraciones con nombres originales
        const configs: Record<string, { key: string, label: string }> = {}
        const usedKeys = new Set<string>()
        headers.forEach((h) => {
            const baseKey = toSnakeCaseKey(h)
            let key = baseKey
            let suffix = 2
            while (usedKeys.has(key)) {
                key = `${baseKey}_${suffix++}`
            }
            usedKeys.add(key)

            configs[h] = {
                key,
                label: toDisplayLabel(h),
            }
        })

        // Evitar duplicidad: forzar keys canónicas para identificador y nombre visible
        if (newMap.code && configs[newMap.code]) configs[newMap.code].key = 'code'
        if (newMap.final_name_es && configs[newMap.final_name_es]) configs[newMap.final_name_es].key = 'final_name_es'

        setColumnConfigs(configs)
    }

    const isDatasetModeTemplate = (t: { data_source: string }) => {
        const ds = String(t.data_source || '').trim()
        if (!ds) return false
        if (ds === 'custom_datasets') return true
        if (ds === 'core_firplak') return false
        // Legacy: template.data_source points to a specific dataset UUID
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ds)
    }

    useEffect(() => {
        if (step !== 'associate_templates') return
        if (availableTemplates.length > 0) return

        getDatasetModeTemplatesAction()
            .then((rows) => setAvailableTemplates((rows || []).filter(isDatasetModeTemplate)))
            .catch(() => setAvailableTemplates([]))
    }, [step, availableTemplates.length])

    const requiredTemplateVars = useMemo(() => {
        const selected = availableTemplates.filter(t => selectedTemplateIds.includes(t.id))
        const union = new Set<string>()
        for (const t of selected) {
            for (const v of extractTemplateVariables(t.elements_json)) union.add(v)
        }
        return Array.from(union).sort((a, b) => a.localeCompare(b))
    }, [availableTemplates, selectedTemplateIds])

    const normalizedLoose = (value: string) => stripDiacritics(String(value || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim()

    const autoSuggestHeaderForVar = (varName: string) => {
        if (varName === 'code' && fieldMap.code) return fieldMap.code
        if (varName === 'final_name_es' && fieldMap.final_name_es) return fieldMap.final_name_es

        const target = normalizedLoose(varName)
        if (!target) return ''

        // 1) Exact match against snake_case(header)
        const exact = csvHeaders.find(h => toSnakeCaseKey(h) === varName)
        if (exact) return exact

        // 2) Loose match
        const loose = csvHeaders.find(h => normalizedLoose(h) === target)
        if (loose) return loose

        return ''
    }

    useEffect(() => {
        if (step !== 'associate_templates') return
        /* eslint-disable react-hooks/set-state-in-effect */
        setTemplateVarToHeader((prev) => {
            const next = { ...prev }
            for (const v of requiredTemplateVars) {
                if (!next[v]) {
                    const suggested = autoSuggestHeaderForVar(v)
                    if (suggested) next[v] = suggested
                }
            }
            // Clean stale keys
            Object.keys(next).forEach((k) => {
                if (!requiredTemplateVars.includes(k)) delete next[k]
            })
            return next
        })
        /* eslint-enable react-hooks/set-state-in-effect */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, requiredTemplateVars])

    const parseFile = useCallback((file: File, enc: string) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: enc, 
            complete: (results) => {
                const headers = (results.meta.fields || []).filter((header) => {
                    if (!String(header).trim()) return false
                    return results.data.some((row) => String((row as Record<string, unknown>)[header] ?? '').trim())
                })
                if (headers.length === 0) {
                    toast.error('El archivo no contiene columnas con datos para importar.')
                    setCsvHeaders([])
                    setCsvRows([])
                    return
                }
                setCsvHeaders(headers)
                setCsvRows(results.data as Record<string, string>[])
                autoMap(headers)
            }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setSelectedFile(file)
        parseFile(file, encoding)
        // Auto-proponer nombre desde el archivo solo si el usuario aún no escribió nada
        if (isNew && !datasetName.trim()) {
            const nameFromFile = file.name.replace(/\.csv$/i, '').trim()
            if (nameFromFile) setDatasetName(nameFromFile)
        }
    }

    // Re-parsear cuando cambia la codificación
    useEffect(() => {
        if (selectedFile) {
            parseFile(selectedFile, encoding)
        }
    }, [encoding, selectedFile, parseFile])

    const handleNext = () => {
        if (step === 'name_file') {
            if (!datasetName.trim()) {
                toast.error('El nombre de la base de datos es obligatorio')
                return
            }
            if (isNew && existingDatasets.some(d => d.name.toLowerCase() === datasetName.trim().toLowerCase())) {
                toast.error(`Ya existe una base de datos con el nombre "${datasetName}".`, {
                    description: "Por favor, elige otro nombre o cierra esta ventana y usa la opción 'Actualizar' en la base existente."
                })
                return
            }
            if (csvHeaders.length === 0) {
                toast.error('Debes seleccionar un archivo CSV')
                return
            }
            // SI ES NUEVO, SALTAR ESTRATEGIA
            if (isNew) setStep('mapping')
            else setStep('strategy')
        }
        else if (step === 'strategy') setStep('mapping')
        else if (step === 'mapping') {
            if (!fieldMap.code) {
                toast.error('Debes seleccionar la columna que servirá como Identificador (ID/SKU)')
                return
            }

            const includedHeaders = Array.from(new Set([
                ...selectedColumns,
                fieldMap.code,
                fieldMap.final_name_es,
            ].filter(Boolean)))

            const seenKeys = new Set<string>()
            for (const header of includedHeaders) {
                const key = String(columnConfigs[header]?.key || '').trim()
                if (!key) {
                    toast.error(`La variable interna (key) es obligatoria para: ${header}`)
                    return
                }
                if (seenKeys.has(key)) {
                    toast.error(`La variable interna (key) debe ser única. Repetida: "${key}".`)
                    return
                }
                seenKeys.add(key)
            }

            if (isNew) setStep('associate_templates')
            else setStep('preview')
        }
        else if (step === 'associate_templates') {
            if (selectedTemplateIds.length === 0) {
                setStep('preview')
                return
            }

            // Validate mapping completeness and uniqueness
            const used = new Set<string>()
            for (const v of requiredTemplateVars) {
                const header = String(templateVarToHeader[v] || '').trim()
                if (!header) {
                    toast.error(`Debes asociar la variable "${v}" a una columna del CSV.`)
                    return
                }
                if (used.has(header)) {
                    toast.error(`La columna "${header}" no puede asignarse a múltiples variables de plantilla.`)
                    return
                }
                used.add(header)
            }

            setStep('preview')
        }
    }

    const handleBack = () => {
        if (step === 'strategy') setStep('name_file')
        else if (step === 'mapping') {
            if (isNew) setStep('name_file')
            else setStep('strategy')
        }
        else if (step === 'associate_templates') setStep('mapping')
        else if (step === 'preview') {
            if (isNew) setStep('associate_templates')
            else setStep('mapping')
        }
    }

    const toggleColumn = (header: string) => {
        setSelectedColumns(prev => 
            prev.includes(header) ? prev.filter(h => h !== header) : [...prev, header]
        )
    }

    const handleFinish = async () => {
        setLoading(true)
        try {
            const workingDatasetId = mode === 'new' ? null : mode.id

            // Apply template mappings (canonical keys) before persisting rows/schema.
            let effectiveColumnConfigs = columnConfigs
            if (isNew && selectedTemplateIds.length > 0 && requiredTemplateVars.length > 0) {
                effectiveColumnConfigs = { ...columnConfigs }
                for (const v of requiredTemplateVars) {
                    const header = String(templateVarToHeader[v] || '').trim()
                    if (!header) continue
                    effectiveColumnConfigs[header] = {
                        ...(effectiveColumnConfigs[header] || { key: header, label: header }),
                        key: v,
                    }
                }
            }

            // Ensure unique keys within selected columns (global canonical keys for the dataset).
            const uniqueKeys = new Set<string>()
            for (const h of selectedColumns) {
                const k = String(effectiveColumnConfigs[h]?.key || h).trim()
                if (!k) continue
                if (uniqueKeys.has(k)) {
                    throw new Error(`La variable interna (key) debe ser única. Repetida: "${k}".`)
                }
                uniqueKeys.add(k)
            }

            if (isNew) {
                const finalColumns = selectedColumns.map((header) => ({
                    original: header,
                    key: effectiveColumnConfigs[header]?.key || header,
                    label: effectiveColumnConfigs[header]?.label || header,
                    is_identifier: header === fieldMap.code,
                }))
                const rowsToImport = csvRows.map((row) => {
                    const data: Record<string, string> = {}
                    if (fieldMap.code) data.code = String(row[fieldMap.code] ?? '').trim()
                    if (fieldMap.final_name_es) data.final_name_es = String(row[fieldMap.final_name_es] ?? '').trim()
                    for (const header of selectedColumns) {
                        const targetKey = effectiveColumnConfigs[header]?.key || header
                        data[targetKey] = String(row[header] ?? '').trim()
                    }
                    return data
                })

                const result = await createDatasetImportAction({
                    name: datasetName,
                    schema: { fieldMap, selectedColumns, columns: finalColumns },
                    rows: rowsToImport,
                    templateIds: selectedTemplateIds,
                })
                if (!result.success) throw new Error(result.error || 'No se pudo crear la base de datos.')

                const updated = await getDatasetsAction()
                onDone(updated as unknown as Record<string, unknown>[])
                toast.success('Base de datos procesada y verificada con éxito')
                onClose()
                return
            }

            // 1. Crear dataset si es nuevo
            // 2. Preparar filas
            const rowsToInsert = csvRows.map((row) => {
                const data: Record<string, string> = {}
                
                // Campos técnicos internos (copia redundante para compatibilidad del motor)
                if (fieldMap.code) {
                    data.code = String(row[fieldMap.code] ?? '').trim()
                }
                if (fieldMap.final_name_es) {
                    data.final_name_es = String(row[fieldMap.final_name_es] ?? '').trim()
                }
                
                // Conservar TODOS los campos seleccionados
                selectedColumns.forEach((h) => {
                    const config = effectiveColumnConfigs[h]
                    const targetKey = config?.key || h
                    data[targetKey] = String(row[h] ?? '').trim()
                    
                    // Si el nombre original es distinto al key, también guardamos el original para respaldo
                    // No duplicar llaves con el header original (evita columnas duplicadas en exportación).
                })

                return {
                    dataset_id: workingDatasetId,
                    data_json: data,
                }
            })

            // 3. Ejecutar estrategia
            if (strategy === 'overwrite' && !isNew) {
                await supabase.from('custom_dataset_rows').delete().eq('dataset_id', workingDatasetId)
            } else if (strategy === 'merge' && !isNew) {
                // Borrar solo los que coinciden en el ID (code) para "actualizar"
                const idsToUpdate = rowsToInsert.map(r => r.data_json.code).filter(Boolean)
                if (idsToUpdate.length > 0) {
                    // Esta es una forma simple de hacer merge sin UPSERT complejo en un campo JSON
                    // Borramos los existentes y luego insertamos
                    // Nota: Para grandes volumenes esto debería hacerse vía RPC o UPSERT real por constraint
                    // Pero asumiendo IDs únicos en el dataset:
                    // await supabase.from('custom_dataset_rows').delete().eq('dataset_id', workingDatasetId).in('data_json->>code', idsToUpdate)
                    // El filtro JSON en Supabase JS es un poco especial, mejor hacerlo simple por ahora o dejar Append.
                }
            }
            
            const { error } = await supabase.from('custom_dataset_rows').insert(rowsToInsert)
            if (error) throw error

            toast.success('Base de datos procesada con éxito')

            if (isNew && selectedTemplateIds.length > 0 && workingDatasetId) {
                await linkDatasetToTemplatesAction(String(workingDatasetId), selectedTemplateIds)
            }

            await revalidateDatasetsPathsAction()
            
            // Recargar datasets
            const { data: updated } = await supabase
                .from('custom_datasets')
                .select('*, row_count:custom_dataset_rows(count)')
                .order('created_at', { ascending: false })
            
            const normalized = (updated || []).map((d: Record<string, unknown> & {
                row_count?: Array<{ count?: number | string | null }>
            }) => ({ ...d, row_count: d.row_count?.[0]?.count || 0 }))
            onDone(normalized)
            onClose()
        } catch (error: unknown) {
            toast.error(getImportErrorMessage(error) || 'Error al procesar datos')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[860px] md:max-w-[900px]">
                <DialogHeader className="shrink-0 gap-0 bg-[#162c39] px-5 py-4 pr-12 text-white sm:px-6">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-white/10 p-2 text-firplak-ivory ring-1 ring-white/15">
                            <Database className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-lg font-bold text-white sm:text-xl">
                                {isNew ? 'Nueva Base de Datos' : 'Actualizar Datos'}
                            </DialogTitle>
                            <DialogDescription className="truncate text-xs text-slate-300 sm:text-sm">
                                {datasetName || 'Configuración de origen'}
                            </DialogDescription>
                            {hasLoadedFile && <p className="mt-0.5 text-[11px] text-slate-400">{csvRows.length.toLocaleString()} registros · {csvHeaders.length} columnas</p>}
                        </div>
                    </div>
                </DialogHeader>

                <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 sm:px-6">
                    <div className="sm:hidden">
                        <p className="text-xs font-semibold text-slate-600">Paso {currentStepIndex + 1} de {workflowSteps.length} · <span className="text-indigo-700">{currentStep?.label}</span></p>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${((currentStepIndex + 1) / workflowSteps.length) * 100}%` }} /></div>
                    </div>
                    <ol className="hidden items-center gap-2 sm:flex" aria-label="Progreso de importación">
                        {workflowSteps.map((workflowStep, index) => {
                            const isComplete = index < currentStepIndex
                            const isCurrent = index === currentStepIndex
                            return (
                                <li key={workflowStep.id} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none" aria-current={isCurrent ? 'step' : undefined}>
                                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isComplete ? 'bg-emerald-600 text-white' : isCurrent ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                                    </span>
                                    <span className={`truncate text-xs font-semibold ${isCurrent ? 'text-indigo-700' : isComplete ? 'text-emerald-700' : 'text-slate-500'}`}>{workflowStep.label}</span>
                                    {index < workflowSteps.length - 1 && <span className="h-px min-w-3 flex-1 bg-slate-200" />}
                                </li>
                            )
                        })}
                    </ol>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 px-5 py-4 custom-scrollbar sm:px-6 sm:py-5">
                    
                    {/* ── PASO 1: NOMBRE Y ARCHIVO ────────────────────────────── */}
                    {step === 'name_file' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {isNew && (
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Nombre de la Base de Datos</Label>
                                    <Input 
                                        placeholder="Ej: Base de Precios 2024" 
                                        value={datasetName}
                                        onChange={(e) => setDatasetName(e.target.value)}
                                        className="h-10 rounded-lg border-slate-200 bg-white font-semibold text-slate-700 shadow-sm"
                                    />
                                </div>
                            )}

                            <div className="relative">
                                <Input
                                    id="dataset-file"
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileUpload}
                                    className="sr-only"
                                />
                                <label htmlFor="dataset-file" className={`flex cursor-pointer items-center border transition-colors ${
                                    hasLoadedFile
                                        ? 'gap-3 rounded-xl border-emerald-200 bg-emerald-50/50 p-3.5 hover:border-emerald-300'
                                        : 'min-h-40 flex-col justify-center gap-2 rounded-xl border-dashed border-slate-300 bg-white p-6 hover:border-indigo-400 hover:bg-indigo-50/30'
                                }`}>
                                    <span className={`flex shrink-0 items-center justify-center rounded-lg ${hasLoadedFile ? 'h-9 w-9 bg-emerald-100 text-emerald-700' : 'h-12 w-12 bg-slate-100 text-slate-500'}`}>
                                        {hasLoadedFile ? <CheckCircle2 className="h-5 w-5" /> : <FileSpreadsheet className="h-6 w-6" />}
                                    </span>
                                    <span className={hasLoadedFile ? 'min-w-0 flex-1' : 'text-center'}>
                                        <span className="block truncate text-sm font-bold text-slate-800">
                                            {hasLoadedFile ? 'Archivo cargado' : 'Seleccionar archivo CSV'}
                                        </span>
                                        <span className="mt-0.5 block text-xs text-slate-500">
                                            {hasLoadedFile
                                                ? `${selectedFile?.name || 'Archivo seleccionado'} · ${csvRows.length.toLocaleString()} filas · ${csvHeaders.length} columnas`
                                                : 'Haz clic o arrastra tu archivo .csv aquí'}
                                        </span>
                                    </span>
                                    {hasLoadedFile && <span className="text-xs font-semibold text-indigo-700">Reemplazar archivo</span>}
                                </label>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                    <div>
                                        <Label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Codificación del archivo</Label>
                                        <p className="mt-0.5 text-[11px] text-slate-500">Cámbiala solo si las tildes no se ven bien.</p>
                                    </div>
                                    <Select value={encoding} onValueChange={(val) => setEncoding(val || 'UTF-8')}>
                                    <SelectTrigger className="h-9 w-full rounded-lg border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 sm:w-[300px]">
                                        <SelectValue placeholder="Selecciona codificación" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="UTF-8" className="font-bold">Automática / Internacional (UTF-8)</SelectItem>
                                        <SelectItem value="ISO-8859-1" className="font-bold">Excel Español / Occidental (ANSI / ISO-8859-1)</SelectItem>
                                    </SelectContent>
                                    </Select>
                                </div>
                                {encoding === 'UTF-8' ? (
                                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-indigo-700">
                                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <p className="text-[11px] leading-snug">
                                            Recomendado para archivos modernos. Si ves rombos con &quot;?&quot; en las tildes, cambia a &quot;Occidental&quot;.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-amber-700">
                                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <p className="text-[11px] leading-snug">
                                            Usa esta opción si el archivo viene de Excel antiguo o con configuración regional ANSI.
                                        </p>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-amber-900">
                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                <p className="text-[11px] leading-snug">
                                    Asegúrate de que tu archivo CSV use comas (,) o punto y coma (;) como separadores y que la primera fila contenga los nombres de las columnas.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── PASO 2: ESTRATEGIA (SOLO SI NO ES NUEVO) ───────────────── */}
                    {step === 'strategy' && (
                        <div className="grid grid-cols-1 gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Estrategia de actualización</h3>
                                <p className="mt-1 text-sm text-slate-500">Elige cómo aplicar las filas del archivo a la base existente.</p>
                            </div>
                            {[
                                { id: 'overwrite' as const, icon: RotateCcw, title: 'Sobrescribir todo', desc: 'Borra los datos actuales y carga el nuevo archivo completo.' },
                                { id: 'append' as const, icon: PlusCircle, title: 'Añadir al final', desc: 'Agrega las nuevas filas sin tocar lo que ya existe.' },
                                { id: 'merge' as const, icon: Combine, title: 'Fusionar / Actualizar', desc: 'Actualiza registros existentes usando el ID como llave.' }
                            ].map((opt: { id: 'overwrite' | 'append' | 'merge'; icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setStrategy(opt.id)}
                                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                                        strategy === opt.id 
                                            ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-100'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <div className={`rounded-lg p-2 ${strategy === opt.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        <opt.icon className="h-4 w-4" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-slate-800">{opt.title}</p>
                                        <p className="mt-0.5 text-xs leading-snug text-slate-500">{opt.desc}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── PASO 3: MAPEO Y SELECCIÓN DE COLUMNAS ─────────────────── */}
                    {step === 'mapping' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                             {/* Configuración de Identificadores */}
                             <div className="space-y-4">
                                <h4 className="flex items-center gap-2 text-base font-bold text-slate-900">
                                    <Layers className="h-4 w-4 text-slate-500" /> Identificadores
                                </h4>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Mapeo de ID/SKU */}
                                    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">Columna identificadora</p>
                                                <p className="mt-0.5 text-[11px] text-slate-500">Se usa para buscar y distinguir cada registro.</p>
                                            </div>
                                            <Badge className="border-red-100 bg-red-50 text-[9px] font-bold text-red-600">OBLIGATORIO</Badge>
                                        </div>
                                        <Select 
                                            value={fieldMap.code || ""} 
                                            onValueChange={(val) => setFieldMap(p => ({ ...p, code: val || '' }))}
                                        >
                                            <SelectTrigger className="h-9 w-full rounded-lg border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                                                <SelectValue placeholder="Selecciona columna ID" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {csvHeaders.map(h => (
                                                    <SelectItem key={h} value={h} className="font-medium">{h}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Mapeo de Nombre */}
                                    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">Columna de nombre</p>
                                                <p className="mt-0.5 text-[11px] text-slate-500">Nombre legible mostrado al usuario.</p>
                                            </div>
                                            <Badge variant="secondary" className="border-slate-200 bg-slate-100 text-[9px] font-bold text-slate-500">OPCIONAL</Badge>
                                        </div>
                                        <Select 
                                            value={fieldMap.final_name_es || ""} 
                                            onValueChange={(val) => setFieldMap(p => ({ ...p, final_name_es: val || '' }))}
                                        >
                                            <SelectTrigger className="h-9 w-full rounded-lg border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                                                <SelectValue placeholder="Selecciona columna Nombre" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="" className="text-slate-400 italic">Ninguna (Usar ID)</SelectItem>
                                                {csvHeaders.map(h => (
                                                    <SelectItem key={h} value={h} className="font-medium">{h}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                             </div>

                              {/* Selección y Mapeo de columnas (Configuración de Variables) */}
                               <div className="space-y-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                      <div>
                                      <h4 className="flex items-center gap-2 text-base font-bold text-slate-900">
                                          <TableIcon className="h-4 w-4 text-slate-500" /> Configuración de variables
                                      </h4>
                                      <p className="mt-1 text-xs text-slate-500">Las propuestas son editables. La variable interna no admite espacios ni tildes.</p>
                                      </div>
                                      <div className="flex gap-2">
                                          <Button variant="ghost" size="sm" onClick={() => setSelectedColumns(csvHeaders)} className="h-auto p-0 text-xs font-semibold text-indigo-700 hover:bg-transparent">Marcar todas</Button>
                                          <Button variant="ghost" size="sm" onClick={() => setSelectedColumns([])} className="h-auto p-0 text-xs font-semibold text-slate-500 hover:bg-transparent">Desmarcar todas</Button>
                                      </div>
                                  </div>

                                 <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                     <div className="max-h-[300px] min-w-[720px] overflow-y-auto custom-scrollbar">
                                         <table className="w-full border-collapse text-left">
                                             <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                                                 <tr>
                                                      <th className="w-[76px] px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Importar</th>
                                                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Columna original</th>
                                                      <th className="w-[230px] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Variable interna</th>
                                                      <th className="w-[230px] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Nombre visible</th>
                                                 </tr>
                                             </thead>
                                             <tbody className="divide-y divide-slate-50">
                                                 {csvHeaders.map(header => {
                                                     const isCores = header === fieldMap.code || header === fieldMap.final_name_es
                                                     const isSelected = selectedColumns.includes(header) || isCores
                                                     return (
                                                          <tr key={header} className={isSelected ? 'bg-white' : 'bg-slate-50/50 text-slate-400'}>
                                                              <td className="px-3 py-2 text-center">
                                                                 <Checkbox 
                                                                     checked={isSelected} 
                                                                     onCheckedChange={() => !isCores && toggleColumn(header)}
                                                                     disabled={isCores}
                                                                     className="rounded-md border-slate-300"
                                                                 />
                                                             </td>
                                                              <td className="px-3 py-2">
                                                                  <p className="max-w-[180px] truncate text-xs font-semibold text-slate-700" title={header}>{header}</p>
                                                                  {isCores && <span className="text-[9px] font-semibold text-indigo-600">Requerida</span>}
                                                              </td>
                                                              <td className="px-3 py-2">
                                                                 <Input 
                                                                     value={columnConfigs[header]?.key || ''} 
                                                                     onChange={(e) => setColumnConfigs(p => ({ ...p, [header]: { ...p[header], key: e.target.value } }))}
                                                                     disabled={!isSelected}
                                                                     placeholder="Ej: sku"
                                                                      className="h-8 rounded-md border-slate-200 bg-white font-mono text-xs shadow-none"
                                                                 />
                                                             </td>
                                                              <td className="px-3 py-2">
                                                                 <Input 
                                                                     value={columnConfigs[header]?.label || ''} 
                                                                     onChange={(e) => setColumnConfigs(p => ({ ...p, [header]: { ...p[header], label: e.target.value } }))}
                                                                     disabled={!isSelected}
                                                                     placeholder="Ej: Referencia"
                                                                      className="h-8 rounded-md border-slate-200 bg-white text-xs font-medium shadow-none"
                                                                 />
                                                             </td>
                                                         </tr>
                                                     )
                                                 })}
                                             </tbody>
                                         </table>
                                     </div>
                                 </div>
                              </div>
                        </div>
                    )}

                    {/* ── PASO 4: ASOCIAR PLANTILLAS (OPCIONAL) ───────────────── */}
                    {step === 'associate_templates' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-base font-bold text-slate-900">Asociar con una plantilla</p>
                                        <p className="mt-1 text-sm text-slate-500">Puedes conectar esta fuente con una plantilla existente ahora o hacerlo después.</p>
                                    </div>
                                    <Badge variant="secondary" className="border-slate-200 bg-slate-100 text-[9px] font-bold text-slate-500">OPCIONAL</Badge>
                                </div>

                                {availableTemplates.length === 0 ? (
                                    <div className="text-sm text-slate-400 italic">No hay plantillas activas en modo Bases de Datos.</div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                        {availableTemplates.map((t) => {
                                            const checked = selectedTemplateIds.includes(t.id)
                                            return (
                                                <label key={t.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${checked ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                                    <Checkbox
                                                        checked={checked}
                                                        onCheckedChange={(v) => {
                                                            const next = Boolean(v)
                                                            setSelectedTemplateIds(prev => next ? Array.from(new Set([...prev, t.id])) : prev.filter(x => x !== t.id))
                                                        }}
                                                        className="rounded border-slate-300"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-slate-800">{t.name}</p>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}
                                {selectedTemplateIds.length === 0 && <p className="text-xs text-slate-500">Continuar sin seleccionar una plantilla no cambia la importación.</p>}
                            </div>

                            {selectedTemplateIds.length > 0 && (
                                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                                <Settings className="h-4 w-4" /> Asociación de variables
                                            </h4>
                                            <p className="mt-1 text-xs text-slate-500">Variable de plantilla → columna de la fuente.</p>
                                        </div>
                                        <Badge className="border-indigo-100 bg-indigo-50 text-[9px] font-bold text-indigo-600">
                                            {requiredTemplateVars.length} variables
                                        </Badge>
                                    </div>

                                    {requiredTemplateVars.length === 0 ? (
                                        <p className="text-sm text-slate-400 italic">Las plantillas seleccionadas no usan variables detectables.</p>
                                    ) : (
                                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-slate-50 border-b border-slate-100">
                                                    <tr>
                                                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Variable de plantilla</th>
                                                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Columna de la fuente</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {requiredTemplateVars.map((v) => (
                                                        <tr key={v}>
                                                            <td className="px-3 py-2">
                                                                <span className="font-mono text-xs font-semibold text-slate-700">{`{${v}}`}</span>
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <Select
                                                                    value={templateVarToHeader[v] || ''}
                                                                    onValueChange={(val) => setTemplateVarToHeader(p => ({ ...p, [v]: val || '' }))}
                                                                >
                                                                    <SelectTrigger className="h-8 w-full rounded-md border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                                                                        <SelectValue placeholder="Selecciona columna" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="" className="text-slate-400 italic">Sin asociar</SelectItem>
                                                                        {csvHeaders.map(h => (
                                                                            <SelectItem key={h} value={h} className="font-medium">{h}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── PASO 5: PREVIEW FINAL ───────────────────────────────── */}
                    {step === 'preview' && (
                        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                             <div>
                                <h3 className="text-lg font-bold text-slate-900">Confirmar operación</h3>
                                <p className="mt-1 text-sm text-slate-500">Revisa la configuración antes de procesar el archivo.</p>
                             </div>
                             <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_1fr] sm:gap-4"><dt className="text-xs font-semibold text-slate-500">Nombre</dt><dd className="text-sm font-semibold text-slate-800">{datasetName}</dd></div>
                                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_1fr] sm:gap-4"><dt className="text-xs font-semibold text-slate-500">Estrategia</dt><dd className="text-sm font-semibold text-slate-800">{isNew ? 'Creación' : STRATEGY_LABELS[strategy]}</dd></div>
                                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_1fr] sm:gap-4"><dt className="text-xs font-semibold text-slate-500">Registros</dt><dd className="text-sm font-semibold text-slate-800">{csvRows.length.toLocaleString()}</dd></div>
                                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_1fr] sm:gap-4"><dt className="text-xs font-semibold text-slate-500">Columnas</dt><dd className="text-sm font-semibold text-slate-800">{selectedColumns.length}</dd></div>
                                {isNew && <div className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_1fr] sm:gap-4"><dt className="text-xs font-semibold text-slate-500">Plantilla asociada</dt><dd className="text-sm font-semibold text-slate-800">{templateSummary}</dd></div>}
                             </dl>

                             <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
                                 <div className="flex items-center gap-3">
                                     <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-200">
                                         <CheckCircle2 className="h-4 w-4" />
                                     </div>
                                     <div>
                                         <p className="text-sm font-semibold">Todo listo para procesar</p>
                                         <p className="mt-0.5 text-xs text-slate-300">Confirma para finalizar la operación.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="mx-0 mb-0 shrink-0 flex-row items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3.5 sm:px-6">
                    <Button 
                        variant="ghost" 
                        onClick={step === 'name_file' ? onClose : handleBack} 
                        disabled={loading} 
                        className="h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                    >
                        {step === 'name_file' ? 'Cancelar' : 'Anterior'}
                    </Button>

                    <Button
                        onClick={step === 'preview' ? handleFinish : handleNext}
                        disabled={loading || (step === 'name_file' && !hasLoadedFile)}
                        className={`h-10 min-w-[140px] rounded-lg px-4 text-sm font-bold ${
                            step === 'preview' 
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {step === 'preview' ? (isNew ? 'Crear base de datos' : 'Actualizar datos') : 'Continuar'}
                        {!loading && step !== 'preview' && <ChevronRight className="ml-2 h-4 w-4" />}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
