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
    Upload, 
    FileSpreadsheet, 
    ChevronRight, 
    CheckCircle2, 
    AlertCircle, 
    Loader2,
    X,
    Filter,
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
import { supabase } from '@/lib/supabase'

interface DatasetIngestorProps {
    mode: 'new' | { id: string; name: string }
    existingDatasets: any[]
    onClose: () => void
    onDone: (updated: any[]) => void
}

type Step = 'name_file' | 'strategy' | 'mapping' | 'preview'

export function DatasetIngestor({ mode, existingDatasets, onClose, onDone }: DatasetIngestorProps) {
    const isNew = mode === 'new'
    
    const [step, setStep] = useState<Step>('name_file')
    const [datasetName, setDatasetName] = useState(isNew ? '' : mode.name)
    const [strategy, setStrategy] = useState<'overwrite' | 'append' | 'merge'>('overwrite')
    
    const [csvHeaders, setCsvHeaders] = useState<string[]>([])
    const [csvRows, setCsvRows] = useState<any[]>([])
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

    // Auto-mapeo inicial al cargar archivo
    const autoMap = (headers: string[]) => {
        const newMap: Record<string, string> = { code: '', final_name_es: '' }
        headers.forEach(header => {
            const hLower = header.toLowerCase()
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
        headers.forEach(h => {
            configs[h] = {
                key: h, 
                label: h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            }
        })
        setColumnConfigs(configs)
    }

    const parseFile = useCallback((file: File, enc: string) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: enc, 
            complete: (results) => {
                const headers = results.meta.fields || []
                setCsvHeaders(headers)
                setCsvRows(results.data)
                autoMap(headers)
            }
        })
    }, [])

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setSelectedFile(file)
        parseFile(file, encoding)
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
            setStep('preview')
        }
    }

    const handleBack = () => {
        if (step === 'strategy') setStep('name_file')
        else if (step === 'mapping') {
            if (isNew) setStep('name_file')
            else setStep('strategy')
        }
        else if (step === 'preview') setStep('mapping')
    }

    const toggleColumn = (header: string) => {
        setSelectedColumns(prev => 
            prev.includes(header) ? prev.filter(h => h !== header) : [...prev, header]
        )
    }

    const handleFinish = async () => {
        setLoading(true)
        try {
            let workingDatasetId = mode === 'new' ? null : mode.id

            // 1. Crear dataset si es nuevo
            if (isNew) {
                const finalColumns = selectedColumns.map(h => ({
                    original: h,
                    key: columnConfigs[h]?.key || h,
                    label: columnConfigs[h]?.label || h,
                    is_identifier: h === fieldMap.code
                }))

                const { data: newDS, error: dsErr } = await supabase
                    .from('custom_datasets')
                    .insert({ 
                        name: datasetName, 
                        schema_json: { 
                            fieldMap, 
                            selectedColumns,
                            columns: finalColumns
                        } 
                    })
                    .select()
                    .single()
                if (dsErr) throw dsErr
                workingDatasetId = newDS.id
            }

            // 2. Preparar filas
            const rowsToInsert = csvRows.map(row => {
                const data: Record<string, any> = {}
                
                // Campos técnicos internos (copia redundante para compatibilidad del motor)
                if (fieldMap.code) {
                    data.code = row[fieldMap.code]
                }
                if (fieldMap.final_name_es) {
                    data.final_name_es = row[fieldMap.final_name_es]
                }
                
                // Conservar TODOS los campos seleccionados
                selectedColumns.forEach(h => {
                    const config = columnConfigs[h]
                    const targetKey = config?.key || h
                    data[targetKey] = row[h]
                    
                    // Si el nombre original es distinto al key, también guardamos el original para respaldo
                    if (targetKey !== h) {
                        data[h] = row[h]
                    }
                })

                return {
                    dataset_id: workingDatasetId,
                    data_json: data
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
            
            // Recargar datasets
            const { data: updated } = await supabase
                .from('custom_datasets')
                .select('*, row_count:custom_dataset_rows(count)')
                .order('created_at', { ascending: false })
            
            const normalized = (updated || []).map(d => ({ ...d, row_count: d.row_count?.[0]?.count || 0 }))
            onDone(normalized)
            onClose()
        } catch (error: any) {
            toast.error(error.message || 'Error al procesar datos')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
                <DialogHeader className="px-8 py-6 bg-gradient-to-br from-slate-900 to-indigo-950 text-white relative">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/10 p-2.5 rounded-2xl backdrop-blur-md">
                            <Database className="h-6 w-6 text-indigo-300" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-black tracking-tight underline-offset-4 decoration-indigo-500/50">
                                {isNew ? 'Nueva Base de Datos' : 'Actualizar Datos'}
                            </DialogTitle>
                            <DialogDescription className="text-slate-400 text-xs font-medium uppercase tracking-widest mt-0.5">
                                {datasetName || 'Configuración de Origen'}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="px-8 py-6 max-h-[70vh] overflow-y-auto bg-slate-50/30 custom-scrollbar">
                    
                    {/* ── PASO 1: NOMBRE Y ARCHIVO ────────────────────────────── */}
                    {step === 'name_file' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {isNew && (
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Nombre de la Base de Datos</Label>
                                    <Input 
                                        placeholder="Ej: Base de Precios 2024" 
                                        value={datasetName}
                                        onChange={(e) => setDatasetName(e.target.value)}
                                        className="h-12 border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-slate-700 shadow-sm"
                                    />
                                </div>
                            )}

                            <div className="relative group">
                                <Input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 transition-all duration-300 ${
                                    csvHeaders.length > 0 
                                        ? 'border-green-200 bg-green-50/30' 
                                        : 'border-slate-200 bg-white group-hover:border-indigo-400 group-hover:bg-indigo-50/50'
                                } shadow-sm`}>
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                                         csvHeaders.length > 0 ? 'bg-green-100 text-green-600' : 'bg-slate-50 text-slate-400 group-hover:text-indigo-500'
                                    }`}>
                                        {csvHeaders.length > 0 ? <CheckCircle2 className="h-8 w-8" /> : <FileSpreadsheet className="h-8 w-8" />}
                                    </div>
                                    <div className="text-center">
                                        <p className="font-black text-slate-800 tracking-tight">
                                            {csvHeaders.length > 0 ? '¡Archivo Cargado!' : 'Seleccionar archivo CSV'}
                                        </p>
                                        <p className="text-xs text-slate-400 font-medium">
                                            {csvHeaders.length > 0 ? `${csvRows.length.toLocaleString()} filas detectadas` : 'Haga clic o arrastre su archivo .csv aquí'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Codificación del Archivo</Label>
                                        <p className="text-[9px] text-slate-400 font-medium ml-1">Cambia esto si las tildes no se ven bien</p>
                                    </div>
                                    <Badge variant="outline" className="text-[8px] font-black uppercase">{encoding}</Badge>
                                </div>
                                <Select value={encoding} onValueChange={(val) => setEncoding(val ?? encoding)}>
                                    <SelectTrigger className="h-10 border-slate-100 bg-slate-50 rounded-xl font-bold text-slate-700 shadow-none">
                                        <SelectValue placeholder="Selecciona codificación" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="UTF-8" className="font-bold">Automática / Internacional (UTF-8)</SelectItem>
                                        <SelectItem value="ISO-8859-1" className="font-bold">Excel Español / Occidental (ANSI / ISO-8859-1)</SelectItem>
                                    </SelectContent>
                                </Select>
                                {encoding === 'UTF-8' ? (
                                    <div className="flex items-start gap-2 p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-100">
                                        <Info className="h-4 w-4 text-indigo-500 mt-0.5" />
                                        <p className="text-[10px] text-indigo-700 font-medium leading-tight">
                                            <b>Recomendado</b> para archivos modernos. Si ves rombos con "?" en las tildes, cambia a la opción "Occidental".
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                                        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                                        <p className="text-[10px] text-amber-700 font-medium leading-tight">
                                            Usa esta opción si el archivo viene directamente de un <b>Excel antiguo</b> o con configuración regional en español (ANSI).
                                        </p>
                                    </div>
                                )}
                            </div>
                            
                            <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3">
                                <Info className="h-5 w-5 text-amber-500 shrink-0" />
                                <p className="text-[11px] text-amber-900 font-medium leading-relaxed">
                                    Asegúrate de que tu archivo CSV use comas (,) o punto y coma (;) como separadores y que la primera fila contenga los nombres de las columnas.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── PASO 2: ESTRATEGIA (SOLO SI NO ES NUEVO) ───────────────── */}
                    {step === 'strategy' && (
                        <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">¿Qué deseas hacer con los datos?</Label>
                            {[
                                { id: 'overwrite', icon: RotateCcw, title: 'Sobrescribir todo', desc: 'Borra los datos actuales y carga el nuevo archivo completo.' },
                                { id: 'append', icon: PlusCircle, title: 'Añadir al final', desc: 'Agrega las nuevas filas sin tocar lo que ya existe.' },
                                { id: 'merge', icon: Combine, title: 'Fusionar / Actualizar', desc: 'Actualiza registros existentes usando el ID como llave.' }
                            ].map((opt: any) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setStrategy(opt.id as any)}
                                    className={`flex items-start gap-4 p-5 rounded-2xl border-2 transition-all group ${
                                        strategy === opt.id 
                                            ? 'border-indigo-600 bg-indigo-50 shadow-md ring-4 ring-indigo-50' 
                                            : 'border-slate-100 bg-white hover:border-slate-200'
                                    }`}
                                >
                                    <div className={`p-2.5 rounded-xl ${strategy === opt.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        <opt.icon className="h-5 w-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-black text-slate-800">{opt.title}</p>
                                        <p className="text-xs text-slate-500 font-medium leading-relaxed">{opt.desc}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── PASO 3: MAPEO Y SELECCIÓN DE COLUMNAS ─────────────────── */}
                    {step === 'mapping' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                             {/* Configuración de Identificadores */}
                             <div className="space-y-4">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                    <Layers className="h-4 w-4" /> Mapeo de Identificadores Críticos
                                </h4>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Mapeo de ID/SKU */}
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="font-black text-sm text-slate-800">Columna Identificadora</p>
                                                <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">Esencial para filtros</p>
                                            </div>
                                            <Badge className="bg-red-50 text-red-600 border-red-100 font-black text-[9px]">OBLIGATORIO</Badge>
                                        </div>
                                        <Select 
                                            value={fieldMap.code || ""} 
                                            onValueChange={(val) => setFieldMap(p => ({ ...p, code: val ?? '' }))}
                                        >
                                            <SelectTrigger className="w-full h-11 rounded-xl border-slate-200 bg-slate-50 font-bold text-slate-700">
                                                <SelectValue placeholder="Selecciona columna ID" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {csvHeaders.map(h => (
                                                    <SelectItem key={h} value={h} className="font-medium">{h}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[9px] text-slate-400 italic">Esta columna se usará para buscar y filtrar los productos al generar etiquetas.</p>
                                    </div>

                                    {/* Mapeo de Nombre */}
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="font-black text-sm text-slate-800">Columna de Nombre</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Muestra en tabla</p>
                                            </div>
                                            <Badge variant="secondary" className="bg-slate-50 text-slate-400 border-slate-100 font-black text-[9px]">OPCIONAL</Badge>
                                        </div>
                                        <Select 
                                            value={fieldMap.final_name_es || ""} 
                                            onValueChange={(val) => setFieldMap(p => ({ ...p, final_name_es: val ?? '' }))}
                                        >
                                            <SelectTrigger className="w-full h-11 rounded-xl border-slate-200 bg-slate-50 font-bold text-slate-700">
                                                <SelectValue placeholder="Selecciona columna Nombre" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="" className="text-slate-400 italic">Ninguna (Usar ID)</SelectItem>
                                                {csvHeaders.map(h => (
                                                    <SelectItem key={h} value={h} className="font-medium">{h}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[9px] text-slate-400 italic">Se usa solo para que identifiques el producto visualmente en la tabla de generación.</p>
                                    </div>
                                </div>
                             </div>

                              {/* Selección y Mapeo de columnas (Configuración de Variables) */}
                              <div className="space-y-4">
                                 <div className="flex items-center justify-between">
                                     <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                         <TableIcon className="h-4 w-4" /> Configuración de Variables
                                     </h4>
                                     <div className="flex gap-2">
                                         <Button variant="ghost" size="sm" onClick={() => setSelectedColumns(csvHeaders)} className="text-[9px] font-black text-indigo-600 p-0 h-auto px-2">MARCAR TODAS</Button>
                                         <Button variant="ghost" size="sm" onClick={() => setSelectedColumns([])} className="text-[9px] font-black text-slate-400 p-0 h-auto px-2">DESMARCAR TODAS</Button>
                                     </div>
                                 </div>

                                 <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                     <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                                         <table className="w-full text-left border-collapse">
                                             <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                                                 <tr>
                                                     <th className="p-3 pl-6 text-[9px] font-black text-slate-400 uppercase w-[80px]">Importar</th>
                                                     <th className="p-3 text-[9px] font-black text-slate-400 uppercase">Original</th>
                                                     <th className="p-3 text-[9px] font-black text-slate-400 uppercase w-[180px]">Key (Variable)</th>
                                                     <th className="p-3 pr-6 text-[9px] font-black text-slate-400 uppercase w-[180px]">Etiqueta App</th>
                                                 </tr>
                                             </thead>
                                             <tbody className="divide-y divide-slate-50">
                                                 {csvHeaders.map(header => {
                                                     const isCores = header === fieldMap.code || header === fieldMap.final_name_es
                                                     const isSelected = selectedColumns.includes(header) || isCores
                                                     return (
                                                         <tr key={header} className={`group transition-colors ${isSelected ? 'bg-indigo-50/20' : 'opacity-60'}`}>
                                                             <td className="p-3 pl-6 text-center">
                                                                 <Checkbox 
                                                                     checked={isSelected} 
                                                                     onCheckedChange={() => !isCores && toggleColumn(header)}
                                                                     disabled={isCores}
                                                                     className="rounded-md border-slate-300"
                                                                 />
                                                             </td>
                                                             <td className="p-3">
                                                                 <p className="text-[11px] font-bold text-slate-600 truncate max-w-[120px]" title={header}>{header}</p>
                                                                 {isCores && <Badge className="mt-1 bg-indigo-50 text-indigo-500 border-indigo-100 text-[8px] px-1 font-black uppercase tracking-tighter">Obligatorio</Badge>}
                                                             </td>
                                                             <td className="p-3">
                                                                 <Input 
                                                                     value={columnConfigs[header]?.key || ''} 
                                                                     onChange={(e) => setColumnConfigs(p => ({ ...p, [header]: { ...p[header], key: e.target.value } }))}
                                                                     disabled={!isSelected}
                                                                     placeholder="Ej: sku"
                                                                     className="h-8 text-[11px] font-mono border-slate-100 bg-white shadow-none focus:ring-1 focus:ring-indigo-200 transition-all rounded-lg"
                                                                 />
                                                             </td>
                                                             <td className="p-3 pr-6">
                                                                 <Input 
                                                                     value={columnConfigs[header]?.label || ''} 
                                                                     onChange={(e) => setColumnConfigs(p => ({ ...p, [header]: { ...p[header], label: e.target.value } }))}
                                                                     disabled={!isSelected}
                                                                     placeholder="Ej: Referencia"
                                                                     className="h-8 text-[11px] font-bold border-slate-100 bg-white shadow-none focus:ring-1 focus:ring-indigo-200 transition-all rounded-lg"
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

                    {/* ── PASO 4: PREVIEW FINAL ───────────────────────────────── */}
                    {step === 'preview' && (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                             <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-8 text-white shadow-2xl shadow-indigo-200 flex items-center justify-between overflow-hidden relative">
                                <div className="absolute top-0 right-0 p-12 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                                <div className="relative z-10">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Confirmar Operación</p>
                                    <h3 className="text-3xl font-black tracking-tight">{datasetName}</h3>
                                </div>
                                <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md relative z-10 border border-white/10">
                                    <Database className="h-10 w-10" />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Filter className="h-3 w-3" /> Estrategia
                                    </p>
                                    <p className="text-sm font-black text-slate-800 capitalize">
                                        {isNew ? 'Creación' : strategy}
                                    </p>
                                </div>
                                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <FileSpreadsheet className="h-3 w-3" /> Filas
                                    </p>
                                    <p className="text-sm font-black text-indigo-600">
                                        {csvRows.length.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Layers className="h-3 w-3" /> Columnas
                                    </p>
                                    <p className="text-sm font-black text-slate-800">
                                        {selectedColumns.length} seleccionadas
                                    </p>
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-2xl p-6 text-indigo-300">
                                <div className="flex gap-4 items-center">
                                    <div className="shrink-0 w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                                        <CheckCircle2 className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Todo listo para procesar</p>
                                        <p className="text-xs text-indigo-300/70">Pulsa el botón "Subir" para finalizar el proceso.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="px-8 py-6 border-t border-slate-100 bg-white sm:justify-between items-center">
                    <Button 
                        variant="ghost" 
                        onClick={step === 'name_file' ? onClose : handleBack} 
                        disabled={loading} 
                        className="font-black text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl h-11 px-6 transition-all"
                    >
                        {step === 'name_file' ? 'CANCELAR' : 'ANTERIOR'}
                    </Button>

                    <Button
                        onClick={step === 'preview' ? handleFinish : handleNext}
                        disabled={loading || (step === 'name_file' && csvHeaders.length === 0)}
                        className={`min-w-[140px] h-11 rounded-xl font-black tracking-tight transition-all active:scale-95 shadow-xl ${
                            step === 'preview' 
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100' 
                            : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-100'
                        }`}
                    >
                        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {step === 'preview' ? 'SUBIR BASE DE DATOS' : 'CONTINUAR'}
                        {!loading && step !== 'preview' && <ChevronRight className="h-4 w-4 ml-2" />}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
