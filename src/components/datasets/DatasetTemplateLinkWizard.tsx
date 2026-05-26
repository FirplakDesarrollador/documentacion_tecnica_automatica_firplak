'use client'

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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { backfillDatasetRowKeysAction, linkDatasetToTemplatesAction, revalidateDatasetsPathsAction } from '@/app/datasets/actions'
import { extractTemplateVariables } from '@/lib/templates/templateVariables'

type ColumnDef = { original: string; key: string; label: string; is_identifier: boolean }
type NormalizedSchema = { fieldMap: { code: string; final_name_es: string }; selectedColumns: string[]; columns: ColumnDef[] }

export type WizardTemplate = { id: string; name: string; elements_json: string; data_source: string }

interface DatasetTemplateLinkWizardProps {
    open: boolean
    onClose: () => void
    datasetId: string
    schema: NormalizedSchema
    templates: WizardTemplate[]
    excludeTemplateIds?: string[]
    editTemplateId?: string
    onLinked?: (templateId: string) => void
}

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const toSnakeCaseKey = (value: string) => {
    const base = stripDiacritics(String(value || '').trim().toLowerCase())
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')

    if (!base) return 'col'
    if (/^[a-z]/.test(base)) return base
    return `col_${base}`
}

const normalizedLoose = (value: string) =>
    stripDiacritics(String(value || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim()

export function DatasetTemplateLinkWizard({
    open,
    onClose,
    datasetId,
    schema,
    templates,
    excludeTemplateIds = [],
    editTemplateId,
    onLinked,
}: DatasetTemplateLinkWizardProps) {
    const availableTemplates = useMemo(
        () => templates.filter(t => !excludeTemplateIds.includes(t.id)),
        [templates, excludeTemplateIds.join('|')]
    )

    const [templateId, setTemplateId] = useState<string>('')
    const [mapping, setMapping] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)

    const selectedTemplate = useMemo(
        () => availableTemplates.find(t => t.id === templateId) ?? null,
        [availableTemplates, templateId]
    )

    const requiredVars = useMemo(() => {
        if (!selectedTemplate) return []
        return extractTemplateVariables(selectedTemplate.elements_json)
            .map(v => String(v || '').trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))
    }, [selectedTemplate?.id])

    useEffect(() => {
        if (!open) return
        setTemplateId(editTemplateId || '')
        if (!editTemplateId) {
            setMapping({})
        }
        setSaving(false)
    }, [open, editTemplateId])

    useEffect(() => {
        if (!open) return
        if (!selectedTemplate) return

        setMapping((prev) => {
            const next = { ...prev }
            for (const v of requiredVars) {
                if (next[v]) continue

                // 1) exact existing key match
                const byKey = schema.columns.find(c => String(c.key).trim() === v)
                if (byKey) {
                    next[v] = byKey.original
                    continue
                }

                // 2) snake_case(original) == var
                const bySnake = schema.columns.find(c => toSnakeCaseKey(c.original) === v)
                if (bySnake) {
                    next[v] = bySnake.original
                    continue
                }

                // 3) loose match
                const target = normalizedLoose(v)
                const byLoose = schema.columns.find(c => normalizedLoose(c.original) === target)
                if (byLoose) {
                    next[v] = byLoose.original
                    continue
                }
            }

            // clean stale keys
            Object.keys(next).forEach((k) => {
                if (!requiredVars.includes(k)) delete next[k]
            })
            return next
        })
    }, [open, selectedTemplate?.id, requiredVars.join('|'), schema.columns.length])

    const canSync = useMemo(() => {
        if (!selectedTemplate) return false
        if (requiredVars.length === 0) return false

        const used = new Set<string>()
        for (const v of requiredVars) {
            const original = String(mapping[v] || '').trim()
            if (!original) return false
            if (used.has(original)) return false
            used.add(original)
        }

        // Validate resulting unique keys
        const nextKeys = new Set<string>()
        for (const col of schema.columns) {
            const planned = requiredVars.find(v => mapping[v] === col.original) || null
            const k = planned ? planned : col.key
            if (nextKeys.has(k)) return false
            nextKeys.add(k)
        }

        return true
    }, [selectedTemplate?.id, requiredVars.join('|'), JSON.stringify(mapping), schema.columns.map(c => `${c.original}:${c.key}`).join('|')])

    const handleConfirm = async () => {
        if (!selectedTemplate) return
        setSaving(true)
        try {
            if (canSync) {
                const renames: { fromKey: string; toKey: string }[] = []
                const nextColumns: ColumnDef[] = schema.columns.map((c) => {
                    const targetVar = requiredVars.find(v => mapping[v] === c.original) || null
                    if (!targetVar) return c
                    if (c.key && c.key !== targetVar) renames.push({ fromKey: c.key, toKey: targetVar })
                    return { ...c, key: targetVar }
                })

                const nextSchema: NormalizedSchema = {
                    fieldMap: schema.fieldMap,
                    selectedColumns: schema.selectedColumns,
                    columns: nextColumns,
                }

                const { error } = await supabase
                    .from('custom_datasets')
                    .update({ schema_json: nextSchema as any })
                    .eq('id', datasetId)
                if (error) throw error

                if (renames.length > 0) {
                    const res = await backfillDatasetRowKeysAction(datasetId, renames)
                    if (!res?.success) {
                        throw new Error(res?.error || 'Error al sincronizar llaves en filas existentes')
                    }
                }
            }

            await linkDatasetToTemplatesAction(datasetId, [selectedTemplate.id])
            await revalidateDatasetsPathsAction()

            toast.success(canSync ? 'Plantilla asociada y sincronizada' : 'Plantilla asociada (pendiente de sincronizar)')
            onLinked?.(selectedTemplate.id)
            onClose()
        } catch (e: any) {
            toast.error(e?.message || 'Error al asociar plantilla')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[720px] p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
                <DialogHeader className="px-8 py-6 bg-slate-900 text-white">
                    <DialogTitle className="text-xl font-black tracking-tight">Asociar plantilla</DialogTitle>
                    <DialogDescription className="text-slate-400 text-xs font-medium uppercase tracking-widest mt-0.5">
                        Sincroniza variables (opcional) y crea la asociación
                    </DialogDescription>
                </DialogHeader>

                <div className="px-8 py-6 max-h-[70vh] overflow-y-auto bg-slate-50/30 custom-scrollbar space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Plantilla</Label>
                        {editTemplateId ? (
                            <div className="h-11 flex items-center px-4 rounded-xl border border-slate-200 bg-slate-100 font-bold text-slate-700 text-sm">
                                {selectedTemplate?.name || 'Cargando...'}
                            </div>
                        ) : (
                            <Select value={templateId} onValueChange={(val) => setTemplateId(val || '')}>
                                <SelectTrigger className="w-full h-11 rounded-xl border-slate-200 bg-white font-bold text-slate-700">
                                    <SelectValue placeholder="Selecciona una plantilla" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableTemplates.map((t) => (
                                        <SelectItem key={t.id} value={t.id} className="font-medium">
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {selectedTemplate && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100">
                                <p className="font-black text-sm text-slate-800">Variables requeridas</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    Si faltan, la asociación queda en rojo hasta sincronizar
                                </p>
                            </div>
                            <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                                        <tr>
                                            <th className="p-3 pl-6 text-[9px] font-black text-slate-400 uppercase w-[260px]">Variable (template)</th>
                                            <th className="p-3 pr-6 text-[9px] font-black text-slate-400 uppercase">Columna del dataset</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {requiredVars.map((v) => (
                                            <tr key={v}>
                                                <td className="p-3 pl-6">
                                                    <p className="text-[11px] font-mono font-bold text-slate-700">{v}</p>
                                                </td>
                                                <td className="p-3 pr-6">
                                                    <Select
                                                        value={mapping[v] || ''}
                                                        onValueChange={(val) => setMapping(p => ({ ...p, [v]: val || '' }))}
                                                    >
                                                        <SelectTrigger className="w-full h-9 rounded-xl border-slate-200 bg-white text-[11px] font-bold text-slate-700">
                                                            <SelectValue placeholder="Selecciona columna" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {schema.columns.map((c) => (
                                                                <SelectItem key={c.original} value={c.original} className="font-medium">
                                                                    {c.original} ({c.key})
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
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
                        onClick={handleConfirm}
                        disabled={!selectedTemplate || saving}
                        className="min-w-[180px] h-11 rounded-xl font-black tracking-tight transition-all active:scale-95 shadow-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {canSync ? 'SINCRONIZAR Y ASOCIAR' : 'ASOCIAR'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
