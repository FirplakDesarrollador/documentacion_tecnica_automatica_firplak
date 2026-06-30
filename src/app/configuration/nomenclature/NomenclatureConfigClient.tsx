'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    upsertDocumentSlugPrefixAction,
    upsertNomenclatureAbbreviationAction,
} from './actions'

type PrefixRow = {
    id?: string
    document_slot: string
    label: string
    prefix: string
    description?: string | null
    active: boolean
}

type AbbreviationRow = {
    id?: string
    category: string
    source_value: string
    abbreviation: string
    description?: string | null
    active: boolean
}

type PrefixForm = Omit<PrefixRow, 'id'>
type AbbreviationForm = Omit<AbbreviationRow, 'id'>

const EMPTY_PREFIX: PrefixForm = {
    document_slot: '',
    label: '',
    prefix: '',
    description: '',
    active: true,
}

const EMPTY_ABBREVIATION: AbbreviationForm = {
    category: 'use_destination',
    source_value: '',
    abbreviation: '',
    description: '',
    active: true,
}

export function NomenclatureConfigClient({
    prefixes,
    abbreviations,
}: {
    prefixes: PrefixRow[]
    abbreviations: AbbreviationRow[]
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [prefixForm, setPrefixForm] = useState<PrefixForm>(EMPTY_PREFIX)
    const [abbreviationForm, setAbbreviationForm] = useState<AbbreviationForm>(EMPTY_ABBREVIATION)

    const savePrefix = () => {
        startTransition(async () => {
            try {
                await upsertDocumentSlugPrefixAction(prefixForm)
                toast.success('Prefijo guardado')
                setPrefixForm(EMPTY_PREFIX)
                router.refresh()
            } catch (error) {
                toast.error(error instanceof Error ? error.message : 'No se pudo guardar el prefijo')
            }
        })
    }

    const saveAbbreviation = () => {
        startTransition(async () => {
            try {
                await upsertNomenclatureAbbreviationAction(abbreviationForm)
                toast.success('Abreviatura guardada')
                setAbbreviationForm(EMPTY_ABBREVIATION)
                router.refresh()
            } catch (error) {
                toast.error(error instanceof Error ? error.message : 'No se pudo guardar la abreviatura')
            }
        })
    }

    return (
        <div className="space-y-8">
            <section className="space-y-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Prefijos documentales publicos</h2>
                    <p className="text-sm text-slate-500">
                        Definen la primera parte del link: ins/nombre, gar/nombre, cui/nombre.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
                    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                        <div className="grid grid-cols-[110px_1fr_80px_90px] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <span>Slot</span>
                            <span>Etiqueta</span>
                            <span>Prefijo</span>
                            <span>Estado</span>
                        </div>
                        {prefixes.map((row) => (
                            <button
                                key={row.document_slot}
                                type="button"
                                onClick={() => setPrefixForm({
                                    document_slot: row.document_slot,
                                    label: row.label,
                                    prefix: row.prefix,
                                    description: row.description || '',
                                    active: row.active,
                                })}
                                className="grid w-full grid-cols-[110px_1fr_80px_90px] gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm hover:bg-indigo-50/30"
                            >
                                <span className="font-mono text-xs text-slate-500">{row.document_slot}</span>
                                <span className="font-semibold text-slate-800">{row.label}</span>
                                <span className="font-mono font-bold text-indigo-700">{row.prefix}</span>
                                <Badge className={row.active ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                                    {row.active ? 'Activo' : 'Inactivo'}
                                </Badge>
                            </button>
                        ))}
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Agregar / editar prefijo</h3>
                        <div className="space-y-1.5">
                            <Label>Slot</Label>
                            <Input value={prefixForm.document_slot} onChange={(event) => setPrefixForm((prev) => ({ ...prev, document_slot: event.target.value }))} placeholder="manual_instalacion" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Etiqueta</Label>
                            <Input value={prefixForm.label} onChange={(event) => setPrefixForm((prev) => ({ ...prev, label: event.target.value }))} placeholder="Instructivo / manual" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Prefijo URL</Label>
                            <Input value={prefixForm.prefix} onChange={(event) => setPrefixForm((prev) => ({ ...prev, prefix: event.target.value }))} placeholder="ins" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Descripcion</Label>
                            <Textarea value={prefixForm.description || ''} onChange={(event) => setPrefixForm((prev) => ({ ...prev, description: event.target.value }))} className="min-h-20" />
                        </div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" checked={prefixForm.active} onChange={(event) => setPrefixForm((prev) => ({ ...prev, active: event.target.checked }))} />
                            Activo
                        </label>
                        <Button onClick={savePrefix} disabled={isPending} className="w-full">Guardar prefijo</Button>
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Abreviaturas maestras</h2>
                    <p className="text-sm text-slate-500">
                        Se reutilizan para slugs, nombres recomendados y futuras reglas de nomenclatura.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
                    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                        <div className="grid grid-cols-[130px_1fr_100px_90px] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <span>Categoria</span>
                            <span>Valor</span>
                            <span>Abrev.</span>
                            <span>Estado</span>
                        </div>
                        {abbreviations.map((row) => (
                            <button
                                key={`${row.category}-${row.source_value}`}
                                type="button"
                                onClick={() => setAbbreviationForm({
                                    category: row.category,
                                    source_value: row.source_value,
                                    abbreviation: row.abbreviation,
                                    description: row.description || '',
                                    active: row.active,
                                })}
                                className="grid w-full grid-cols-[130px_1fr_100px_90px] gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm hover:bg-indigo-50/30"
                            >
                                <span className="font-mono text-xs text-slate-500">{row.category}</span>
                                <span className="font-semibold text-slate-800">{row.source_value}</span>
                                <span className="font-mono font-bold text-indigo-700">{row.abbreviation}</span>
                                <Badge className={row.active ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                                    {row.active ? 'Activo' : 'Inactivo'}
                                </Badge>
                            </button>
                        ))}
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Agregar / editar abreviatura</h3>
                        <div className="space-y-1.5">
                            <Label>Categoria</Label>
                            <Input value={abbreviationForm.category} onChange={(event) => setAbbreviationForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="use_destination" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Valor original</Label>
                            <Input value={abbreviationForm.source_value} onChange={(event) => setAbbreviationForm((prev) => ({ ...prev, source_value: event.target.value }))} placeholder="LAVAMANOS" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Abreviatura</Label>
                            <Input value={abbreviationForm.abbreviation} onChange={(event) => setAbbreviationForm((prev) => ({ ...prev, abbreviation: event.target.value }))} placeholder="lvm" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Descripcion</Label>
                            <Textarea value={abbreviationForm.description || ''} onChange={(event) => setAbbreviationForm((prev) => ({ ...prev, description: event.target.value }))} className="min-h-20" />
                        </div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" checked={abbreviationForm.active} onChange={(event) => setAbbreviationForm((prev) => ({ ...prev, active: event.target.checked }))} />
                            Activa
                        </label>
                        <Button onClick={saveAbbreviation} disabled={isPending} className="w-full">Guardar abreviatura</Button>
                    </div>
                </div>
            </section>
        </div>
    )
}
