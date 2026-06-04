'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
    getDatasetLinkedTemplateIdsAction,
    normalizeDatasetRowJsonKeysAction,
    revalidateDatasetsPathsAction,
    unlinkDatasetFromTemplateAction,
    type FieldDef,
} from '@/app/datasets/actions'
import { getDatasetModeTemplatesAction } from '@/app/templates/actions'
import { extractTemplateVariables } from '@/lib/templates/templateVariables'
import { DatasetTemplateLinkWizard, type WizardTemplate } from '@/components/datasets/DatasetTemplateLinkWizard'

type ColumnDef = { original: string; key: string; label: string; is_identifier: boolean }
type NormalizedSchema = { fieldMap: { code: string; final_name_es: string }; selectedColumns: string[]; columns: ColumnDef[] }

interface DatasetConfiguratorProps {
    datasetId: string
    onClose: () => void
    onSaved: (updated: { id: string; name: string; schema_json: any }) => void
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

function normalizeSchema(schema_json: any): NormalizedSchema {
    const fallback: NormalizedSchema = {
        fieldMap: { code: '', final_name_es: '' },
        selectedColumns: [],
        columns: [],
    }

    if (!schema_json) return fallback

    // New format: { fieldMap, selectedColumns, columns }
    if (typeof schema_json === 'object' && !Array.isArray(schema_json)) {
        const obj = schema_json as Record<string, any>
        const fieldMap = (obj.fieldMap && typeof obj.fieldMap === 'object')
            ? {
                code: typeof obj.fieldMap.code === 'string' ? obj.fieldMap.code : '',
                final_name_es: typeof obj.fieldMap.final_name_es === 'string' ? obj.fieldMap.final_name_es : '',
            }
            : { code: '', final_name_es: '' }

        if (Array.isArray(obj.columns)) {
            const cols: ColumnDef[] = obj.columns
                .filter((c: any) => c && typeof c === 'object')
                .map((c: any) => ({
                    original: String(c.original ?? c.key ?? ''),
                    key: String(c.key ?? ''),
                    label: String(c.label ?? c.key ?? ''),
                    is_identifier: Boolean(c.is_identifier),
                }))
                .filter(c => c.original && c.key)

            const selectedColumns = cols.map(c => c.original)
            return { fieldMap, selectedColumns, columns: cols }
        }

        if (Array.isArray(obj.selectedColumns)) {
            const selectedColumns = obj.selectedColumns.filter((c: any) => typeof c === 'string')
            const usedKeys = new Set<string>()
            const columns: ColumnDef[] = selectedColumns.map((original: string) => {
                // IMPORTANT: keep legacy behavior when the dataset doesn't have explicit `columns`:
                // - Default `key` should match existing stored JSON keys (original header string).
                // - User can still edit keys, but saving without touching should not break templates.
                let key = original
                let suffix = 2
                while (usedKeys.has(key)) key = `${original}_${suffix++}`
                usedKeys.add(key)

                return {
                    original,
                    key,
                    label: toDisplayLabel(original),
                    is_identifier: fieldMap.code ? original === fieldMap.code : false,
                }
            })
            return { fieldMap, selectedColumns, columns }
        }
    }

    // Old format: FieldDef[]
    if (Array.isArray(schema_json)) {
        const cols: ColumnDef[] = (schema_json as FieldDef[])
            .map((f: any) => ({
                original: String(f?.original ?? f?.key ?? ''),
                key: String(f?.key ?? ''),
                label: String(f?.label ?? f?.key ?? ''),
                is_identifier: Boolean(f?.is_identifier),
            }))
            .filter(c => c.original && c.key)

        const selectedColumns = cols.map(c => c.original)
        const identifier = cols.find(c => c.is_identifier)?.original || ''
        return {
            fieldMap: { code: identifier, final_name_es: '' },
            selectedColumns,
            columns: cols,
        }
    }

    return fallback
}

function validateKeyError(key: string) {
    if (!key) return 'La variable interna (key) es obligatoria.'
    return null
}

function validateKeyWarning(key: string) {
    if (!key) return null
    if (!/^[a-z][a-z0-9_]*$/.test(key)) return 'Recomendado: snake_case (minúsculas, números y _).'
    return null
}

export function DatasetConfigurator({ datasetId, onClose, onSaved }: DatasetConfiguratorProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [rowCount, setRowCount] = useState<number>(0)
    const [linkedTemplateIds, setLinkedTemplateIds] = useState<string[]>([])
    const [templates, setTemplates] = useState<WizardTemplate[]>([])
    const [showLinkWizard, setShowLinkWizard] = useState(false)
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
    const [normalizing, setNormalizing] = useState(false)

    const [datasetName, setDatasetName] = useState('')
    const [schema, setSchema] = useState<NormalizedSchema>({
        fieldMap: { code: '', final_name_es: '' },
        selectedColumns: [],
        columns: [],
    })

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            setLoading(true)
            try {
                const { data, error } = await supabase
                    .from('custom_datasets')
                    .select('id, name, schema_json, row_count:custom_dataset_rows(count)')
                    .eq('id', datasetId)
                    .single()
                if (error) throw error
                if (cancelled) return

                setDatasetName(String(data?.name || ''))
                setSchema(normalizeSchema(data?.schema_json))
                const count = data?.row_count?.[0]?.count
                setRowCount(typeof count === 'number' ? count : Number(count || 0))
            } catch (e) {
                if (!cancelled) toast.error(e instanceof Error ? e.message : String(e) || 'Error al cargar configuración')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [datasetId])

    const isDatasetModeTemplate = (t: { data_source: string }) => {
        const ds = String(t.data_source || '').trim()
        if (!ds) return false
        if (ds === 'custom_datasets') return true
        if (ds === 'core_firplak') return false
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ds)
    }

    useEffect(() => {
        let cancelled = false
        const loadLinks = async () => {
            try {
                const ids = await getDatasetLinkedTemplateIdsAction(datasetId)
                if (!cancelled) setLinkedTemplateIds(Array.isArray(ids) ? ids : [])
            } catch {
                if (!cancelled) setLinkedTemplateIds([])
            }

            try {
                const rows = await getDatasetModeTemplatesAction()
                const list = (rows || []).filter(isDatasetModeTemplate)
                if (!cancelled) setTemplates(list as any)
            } catch {
                if (!cancelled) setTemplates([])
            }
        }
        loadLinks()
        return () => { cancelled = true }
    }, [datasetId])

    const originalOptions = useMemo(() => schema.columns.map(c => c.original), [schema.columns])

    const datasetKeys = useMemo(
        () => new Set(schema.columns.map(c => String(c.key || '').trim()).filter(Boolean)),
        [schema.columns]
    )

    const linkedTemplates = useMemo(() => {
        const byId = new Map(templates.map(t => [t.id, t]))
        return linkedTemplateIds
            .map(id => byId.get(id))
            .filter(Boolean) as WizardTemplate[]
    }, [linkedTemplateIds, templates])

    const templateSyncStatus = useMemo(() => {
        const out: Record<string, { required: string[]; ok: boolean }> = {}
        for (const t of linkedTemplates) {
            const required = extractTemplateVariables(t.elements_json)
            const ok = required.every(v => datasetKeys.has(v))
            out[t.id] = { required, ok }
        }
        return out
    }, [linkedTemplates, datasetKeys])

    const keyErrors = useMemo(() => {
        const errors: Record<string, string> = {}
        const seen = new Set<string>()
        for (const c of schema.columns) {
            const err = validateKeyError(c.key)
            if (err) errors[c.original] = err
            if (seen.has(c.key)) errors[c.original] = 'La variable interna (key) debe ser única.'
            seen.add(c.key)
        }
        return errors
    }, [schema.columns])

    const keyWarnings = useMemo(() => {
        const warnings: Record<string, string> = {}
        for (const c of schema.columns) {
            const warn = validateKeyWarning(c.key)
            if (warn) warnings[c.original] = warn
        }
        return warnings
    }, [schema.columns])

    const hasErrors = useMemo(() => Object.keys(keyErrors).length > 0, [keyErrors])

    const updateColumn = (original: string, patch: Partial<ColumnDef>) => {
        setSchema(prev => ({
            ...prev,
            columns: prev.columns.map(c => (c.original === original ? { ...c, ...patch } : c)),
        }))
    }

    const handleSave = async () => {
        if (!datasetName.trim()) {
            toast.error('El nombre de la base de datos es obligatorio')
            return
        }
        if (hasErrors) {
            toast.error('Corrige los errores de variables internas (keys) antes de guardar.')
            return
        }

        setSaving(true)
        try {
            const nextColumns = schema.columns.map((c) => ({
                ...c,
                is_identifier: schema.fieldMap.code ? c.original === schema.fieldMap.code : c.is_identifier,
            }))

            const nextSchema: NormalizedSchema = {
                fieldMap: {
                    code: schema.fieldMap.code || '',
                    final_name_es: schema.fieldMap.final_name_es || '',
                },
                selectedColumns: nextColumns.map(c => c.original),
                columns: nextColumns,
            }

            const { error } = await supabase
                .from('custom_datasets')
                .update({ name: datasetName.trim(), schema_json: nextSchema as any })
                .eq('id', datasetId)
            if (error) throw error

            await revalidateDatasetsPathsAction()

            toast.success('Configuración actualizada')
            onSaved({ id: datasetId, name: datasetName.trim(), schema_json: nextSchema })
            onClose()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e) || 'Error al guardar configuración')
        } finally {
            setSaving(false)
        }
    }

    const refreshSchemaFromDb = async () => {
        const { data } = await supabase
            .from('custom_datasets')
            .select('schema_json')
            .eq('id', datasetId)
            .single()
        if (data?.schema_json) {
            setSchema(normalizeSchema(data.schema_json))
        }
    }

    const handleEditTemplate = (t: WizardTemplate) => {
        setEditingTemplateId(t.id)
        setShowLinkWizard(true)
    }

    const handleUnlink = async (templateId: string) => {
        if (!confirm('¿Desasociar esta plantilla del dataset?')) return
        const res = await unlinkDatasetFromTemplateAction(datasetId, templateId)
        if (!res?.success) {
            toast.error(res?.error || 'No se pudo desasociar')
            return
        }
        setLinkedTemplateIds(prev => prev.filter(id => id !== templateId))
        await revalidateDatasetsPathsAction()
        toast.success('Plantilla desasociada')
    }

    const handleNormalizeRows = async () => {
        if (!confirm('¿Eliminar llaves duplicadas (headers originales) de las filas existentes?')) return
        setNormalizing(true)
        try {
            const res = await normalizeDatasetRowJsonKeysAction(datasetId)
            if (!res?.success) throw new Error(res?.error || 'No se pudo normalizar')
            toast.success('Filas normalizadas', { description: `Llaves removidas: ${res.removedKeys ?? 0}` })
            await revalidateDatasetsPathsAction()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e) || 'Error al normalizar filas')
        } finally {
            setNormalizing(false)
        }
    }

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[760px] p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
                <DialogHeader className="px-8 py-6 bg-slate-900 text-white">
                    <DialogTitle className="text-xl font-black tracking-tight">Configurar base de datos</DialogTitle>
                    <DialogDescription className="text-slate-400 text-xs font-medium uppercase tracking-widest mt-0.5">
                        Variables, nombre e identificador
                    </DialogDescription>
                </DialogHeader>

                <div className="px-8 py-6 max-h-[70vh] overflow-y-auto bg-slate-50/30 custom-scrollbar space-y-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-slate-500 gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Cargando…
                        </div>
                    ) : (
                        <>
                            {rowCount > 0 && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                        <div className="text-xs">
                                            <p className="font-black uppercase tracking-widest text-[10px]">Importante</p>
                                            <p className="mt-1">
                                                Este dataset tiene <b>{rowCount.toLocaleString()}</b> filas. Cambiar la variable interna (key)
                                                es <b>solo metadatos</b>: no renombra llaves dentro de los datos ya importados.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Nombre</Label>
                                <Input
                                    value={datasetName}
                                    onChange={(e) => setDatasetName(e.target.value)}
                                    className="h-11 border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-slate-700 shadow-sm"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                    <div>
                                        <p className="font-black text-sm text-slate-800">Identificador (ID/Code)</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Se usa para filtrar/buscar</p>
                                    </div>
                                    <Select
                                        value={schema.fieldMap.code || ''}
                                        onValueChange={(val) => setSchema(p => ({ ...p, fieldMap: { ...p.fieldMap, code: val || '' } }))}
                                    >
                                        <SelectTrigger className="w-full h-11 rounded-xl border-slate-200 bg-slate-50 font-bold text-slate-700">
                                            <SelectValue placeholder="Selecciona columna ID" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {originalOptions.map((o) => (
                                                <SelectItem key={o} value={o} className="font-medium">{o}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                    <div>
                                        <p className="font-black text-sm text-slate-800">Nombre visible</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Muestra en tabla</p>
                                    </div>
                                    <Select
                                        value={schema.fieldMap.final_name_es || ''}
                                        onValueChange={(val) => setSchema(p => ({ ...p, fieldMap: { ...p.fieldMap, final_name_es: val || '' } }))}
                                    >
                                        <SelectTrigger className="w-full h-11 rounded-xl border-slate-200 bg-slate-50 font-bold text-slate-700">
                                            <SelectValue placeholder="Selecciona columna Nombre" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="" className="text-slate-400 italic">Ninguna (Usar ID)</SelectItem>
                                            {originalOptions.map((o) => (
                                                <SelectItem key={o} value={o} className="font-medium">{o}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                                            <tr>
                                                <th className="p-3 pl-6 text-[9px] font-black text-slate-400 uppercase">Original</th>
                                                <th className="p-3 text-[9px] font-black text-slate-400 uppercase w-[240px]">Variable interna (key)</th>
                                                <th className="p-3 pr-6 text-[9px] font-black text-slate-400 uppercase w-[240px]">Nombre visible (label)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {schema.columns.map((col) => (
                                                <tr key={col.original} className="group transition-colors">
                                                    <td className="p-3 pl-6">
                                                        <p className="text-[11px] font-bold text-slate-600 truncate max-w-[220px]" title={col.original}>{col.original}</p>
                                                    </td>
                                                    <td className="p-3">
                                                        <Input
                                                            value={col.key}
                                                            onChange={(e) => updateColumn(col.original, { key: e.target.value })}
                                                            placeholder="Ej: sku"
                                                            className="h-8 text-[11px] font-mono border-slate-100 bg-white shadow-none focus:ring-1 focus:ring-indigo-200 transition-all rounded-lg"
                                                        />
                                                        {keyErrors[col.original] && (
                                                            <p className="mt-1 text-[10px] text-red-600">{keyErrors[col.original]}</p>
                                                        )}
                                                        {!keyErrors[col.original] && keyWarnings[col.original] && (
                                                            <p className="mt-1 text-[10px] text-amber-700">{keyWarnings[col.original]}</p>
                                                        )}
                                                    </td>
                                                    <td className="p-3 pr-6">
                                                        <Input
                                                            value={col.label}
                                                            onChange={(e) => updateColumn(col.original, { label: e.target.value })}
                                                            placeholder="Ej: Referencia"
                                                            className="h-8 text-[11px] font-bold border-slate-100 bg-white shadow-none focus:ring-1 focus:ring-indigo-200 transition-all rounded-lg"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-black text-sm text-slate-800">Normalizar filas</p>
                                    <p className="text-xs text-slate-500 mt-1 max-w-xl">
                                        Elimina duplicados en <code className="font-mono">data_json</code> (ej. <code className="font-mono">Tienda</code> y <code className="font-mono">tienda</code>),
                                        conservando solo las keys canónicas definidas en el esquema del dataset.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    className="rounded-xl h-10 border-slate-200 shrink-0"
                                    onClick={handleNormalizeRows}
                                    disabled={loading || normalizing}
                                >
                                    {normalizing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                    Normalizar
                                </Button>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-black text-sm text-slate-800">Plantillas asociadas</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                            Verde = sincronizada (tiene todas las variables requeridas)
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="rounded-xl h-10 border-slate-200"
                                        onClick={() => setShowLinkWizard(true)}
                                        disabled={loading}
                                    >
                                        Asociar plantilla
                                    </Button>
                                </div>
                                <div className="p-4">
                                    {linkedTemplates.length === 0 ? (
                                        <p className="text-sm text-slate-500">Este dataset aún no está asociado a ninguna plantilla.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {linkedTemplates.map((t) => {
                                                const st = templateSyncStatus[t.id]
                                                const ok = st?.ok
                                                const missing = (st?.required || []).filter(v => !datasetKeys.has(v))
                                                return (
                                                    <div
                                                        key={t.id}
                                                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-slate-800 truncate">{t.name}</p>
                                                            <p className="text-[10px] text-slate-500">
                                                                {ok ? 'Sincronizada' : `Faltan: ${missing.slice(0, 4).join(', ') || 'variables'}`}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span
                                                                className={`inline-flex h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
                                                                title={ok ? 'Sincronizada' : 'No sincronizada'}
                                                            />
                                                            <Button
                                                                variant="ghost"
                                                                className="text-xs text-slate-600 hover:bg-white"
                                                                onClick={() => handleEditTemplate(t)}
                                                            >
                                                                Editar
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                className="text-xs text-red-500 hover:bg-white hover:text-red-700"
                                                                onClick={() => handleUnlink(t.id)}
                                                            >
                                                                Desasociar
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="px-8 py-6 border-t border-slate-100 bg-white sm:justify-between items-center">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        disabled={saving}
                        className="font-black text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl h-11 px-6 transition-all"
                    >
                        CANCELAR
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || loading || hasErrors}
                        className="min-w-[160px] h-11 rounded-xl font-black tracking-tight transition-all active:scale-95 shadow-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        GUARDAR
                    </Button>
                </DialogFooter>
            </DialogContent>

            <DatasetTemplateLinkWizard
                open={showLinkWizard}
                onClose={() => { setShowLinkWizard(false); setEditingTemplateId(null) }}
                datasetId={datasetId}
                schema={schema}
                templates={templates}
                excludeTemplateIds={editingTemplateId ? linkedTemplateIds.filter(id => id !== editingTemplateId) : linkedTemplateIds}
                editTemplateId={editingTemplateId || undefined}
                onLinked={async (tid) => {
                    setLinkedTemplateIds(prev => (prev.includes(tid) ? prev : [...prev, tid]))
                    await refreshSchemaFromDb()
                }}
            />
        </Dialog>
    )
}
