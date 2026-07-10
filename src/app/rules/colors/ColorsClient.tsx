'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PlusCircle, Trash2, Search, ArrowLeft, Loader2, Save, Palette } from 'lucide-react'
import Link from 'next/link'
import { upsertColorAction, deleteColorAction, forceDeleteColorAction } from './actions'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
    COLOR_APPLICATION_SCOPE_KEYS,
    COLOR_APPLICATION_SCOPE_LABELS,
    MATERIAL_PROFILE_LABELS,
    MATERIAL_PROFILE_OPTIONS,
    COLOR_MODE_LABELS,
    COLOR_MODE_OPTIONS,
    SAP_COLOR_CODE_PATTERN,
    type ColorApplicationMap,
    type ColorApplicationScope,
    type ColorMaterialProfileMap,
    type ColorMode,
    type MaterialProfile,
} from './productiveScopes'

interface ColorEntry {
    code_4dig: string
    name_color_sap: string
    color_mode: ColorMode
    application_colors_json: ColorApplicationMap
    application_material_profiles_json: ColorMaterialProfileMap
    allowed_product_types: string[]
    allowed_manufacturing_processes: string[]
    is_active: boolean
    notes: string | null
}

interface ColorsClientProps {
    initialData: ColorEntry[]
    manufacturingProcesses: string[]
    productTypes: string[]
}

type EditableColor = Omit<Partial<ColorEntry>, 'application_colors_json' | 'application_material_profiles_json'> & {
    application_colors_json?: Record<ColorApplicationScope, string>
    application_material_profiles_json?: EditableMaterialProfileMap
    isNew?: boolean
}

function createEmptyApplicationColors(): Record<ColorApplicationScope, string> {
    const values = {} as Record<ColorApplicationScope, string>
    for (const scope of COLOR_APPLICATION_SCOPE_KEYS) {
        values[scope] = ''
    }
    return values
}

function getEditableApplicationColors(color?: { application_colors_json?: Partial<Record<ColorApplicationScope, string>> } | null): Record<ColorApplicationScope, string> {
    const values = createEmptyApplicationColors()
    for (const scope of COLOR_APPLICATION_SCOPE_KEYS) {
        values[scope] = color?.application_colors_json?.[scope] ?? ''
    }
    return values
}

type EditableMaterialProfileMap = Record<ColorApplicationScope, MaterialProfile | ''>

function createEmptyMaterialProfiles(): EditableMaterialProfileMap {
    const values = {} as EditableMaterialProfileMap
    for (const scope of COLOR_APPLICATION_SCOPE_KEYS) values[scope] = ''
    return values
}

function getEditableMaterialProfiles(color?: { application_material_profiles_json?: Partial<Record<ColorApplicationScope, string>> } | null): EditableMaterialProfileMap {
    const values = createEmptyMaterialProfiles()
    for (const scope of COLOR_APPLICATION_SCOPE_KEYS) {
        const profile = color?.application_material_profiles_json?.[scope]
        values[scope] = MATERIAL_PROFILE_OPTIONS.includes(profile as MaterialProfile)
            ? profile as MaterialProfile
            : ''
    }
    return values
}

function getConfiguredScopeEntries(applicationColors: ColorApplicationMap | undefined) {
    return COLOR_APPLICATION_SCOPE_KEYS
        .map((scope) => ({ scope, value: applicationColors?.[scope] ?? '' }))
        .filter((entry) => entry.value.length > 0)
}

function getApplicationColorsPayload(applicationColors: ColorApplicationMap | undefined): ColorApplicationMap {
    const payload: ColorApplicationMap = {}
    for (const scope of COLOR_APPLICATION_SCOPE_KEYS) {
        const code = applicationColors?.[scope]?.trim().toUpperCase() ?? ''
        if (code) payload[scope] = code
    }
    return payload
}

function getMaterialProfilesPayload(materialProfiles: Partial<Record<ColorApplicationScope, string>> | undefined): ColorMaterialProfileMap {
    const payload: ColorMaterialProfileMap = {}
    for (const scope of COLOR_APPLICATION_SCOPE_KEYS) {
        const profile = materialProfiles?.[scope]?.trim().toUpperCase() ?? ''
        if (MATERIAL_PROFILE_OPTIONS.includes(profile as (typeof MATERIAL_PROFILE_OPTIONS)[number])) {
            payload[scope] = profile as (typeof MATERIAL_PROFILE_OPTIONS)[number]
        }
    }
    return payload
}

function getInvalidApplicationScope(applicationColors: ColorApplicationMap | undefined): ColorApplicationScope | null {
    for (const scope of COLOR_APPLICATION_SCOPE_KEYS) {
        const code = applicationColors?.[scope]?.trim().toUpperCase() ?? ''
        if (code && !SAP_COLOR_CODE_PATTERN.test(code)) return scope
    }
    return null
}

function normalizeTextArray(values: string[] | undefined): string[] {
    const seen = new Set<string>()
    const normalized: string[] = []

    for (const value of values ?? []) {
        const item = value.trim().toUpperCase()
        if (!item || seen.has(item)) continue

        seen.add(item)
        normalized.push(item)
    }

    return normalized
}

function getScopeSummary(values: string[]) {
    return values.length === 0 ? 'Todos' : values.join(', ')
}

export default function ColorsClient({ initialData, manufacturingProcesses, productTypes }: ColorsClientProps) {
    const [data, setData] = useState<ColorEntry[]>(initialData)
    const [searchTerm, setSearchTerm] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    
    // Modal state for Add/Edit
    const [modalOpen, setModalOpen] = useState(false)
    const [editingColor, setEditingColor] = useState<EditableColor | null>(null)

    // Delete conflict state
    const [deleteConflict, setDeleteConflict] = useState<{
        code_4dig: string
        skuCount: number
        skuCodes: string[]
    } | null>(null)

    const normalizedSearchTerm = searchTerm.toLowerCase()
    const filteredData = data.filter(item => 
        item.code_4dig.toLowerCase().includes(normalizedSearchTerm) ||
        (item.name_color_sap?.toLowerCase?.().includes(normalizedSearchTerm) ?? false) ||
        item.color_mode.toLowerCase().includes(normalizedSearchTerm) ||
        item.allowed_product_types.some((productType) => productType.toLowerCase().includes(normalizedSearchTerm)) ||
        item.allowed_manufacturing_processes.some((process) => process.toLowerCase().includes(normalizedSearchTerm)) ||
        (item.notes?.toLowerCase().includes(normalizedSearchTerm) ?? false) ||
        COLOR_APPLICATION_SCOPE_KEYS.some((scope) =>
            (item.application_colors_json?.[scope] ?? '').toLowerCase().includes(normalizedSearchTerm)
        )
    )

    const handleOpenModal = (color: Partial<ColorEntry> | null = null) => {
        if (color) {
            setEditingColor({
                ...color,
                allowed_manufacturing_processes: normalizeTextArray(color.allowed_manufacturing_processes),
                allowed_product_types: normalizeTextArray(color.allowed_product_types),
                application_colors_json: getEditableApplicationColors(color),
                application_material_profiles_json: getEditableMaterialProfiles(color),
                color_mode: color.color_mode ?? 'full',
                isNew: false,
                is_active: color.is_active ?? true,
                notes: color.notes ?? '',
            })
        } else {
            setEditingColor({
                allowed_manufacturing_processes: [],
                allowed_product_types: [],
                application_colors_json: createEmptyApplicationColors(),
                application_material_profiles_json: createEmptyMaterialProfiles(),
                code_4dig: '',
                color_mode: 'full',
                isNew: true,
                is_active: true,
                name_color_sap: '',
                notes: '',
            })
        }
        setModalOpen(true)
    }

    const updateApplicationColor = (scope: ColorApplicationScope, rawValue: string) => {
        const code = rawValue.toUpperCase().slice(0, 4)
        setEditingColor(prev => prev ? {
            ...prev,
            application_colors_json: {
                ...getEditableApplicationColors(prev),
                [scope]: code,
            },
        } : prev)
    }

    const updateMaterialProfile = (scope: ColorApplicationScope, rawValue: string) => {
        const profile = MATERIAL_PROFILE_OPTIONS.includes(rawValue as MaterialProfile)
            ? rawValue as MaterialProfile
            : ''
        setEditingColor(prev => prev ? {
            ...prev,
            application_material_profiles_json: {
                ...getEditableMaterialProfiles(prev),
                [scope]: profile,
            },
        } : prev)
    }

    const toggleArrayValue = (field: 'allowed_product_types' | 'allowed_manufacturing_processes', value: string) => {
        const normalizedValue = value.trim().toUpperCase()
        if (!normalizedValue) return

        setEditingColor(prev => {
            if (!prev) return prev

            const current = normalizeTextArray(prev[field])
            return {
                ...prev,
                [field]: current.includes(normalizedValue)
                    ? current.filter(item => item !== normalizedValue)
                    : [...current, normalizedValue],
            }
        })
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingColor?.code_4dig || !editingColor?.name_color_sap) {
            toast.error("El código y el nombre SAP son obligatorios")
            return
        }

        const code = editingColor.code_4dig.trim().toUpperCase()
        const name = editingColor.name_color_sap.trim().toUpperCase()
        const invalidScope = getInvalidApplicationScope(editingColor.application_colors_json)

        if (code.length === 0) {
            toast.error("El código no puede estar vacío")
            return
        }

        if (invalidScope) {
            toast.error(`${COLOR_APPLICATION_SCOPE_LABELS[invalidScope]} debe usar 4 caracteres SAP (A-Z o 0-9) o quedar vacio`)
            return
        }

        setIsSaving(true)
        try {
            const saved = await upsertColorAction({
                code_4dig: code,
                name_color_sap: name,
                allowed_manufacturing_processes: normalizeTextArray(editingColor.allowed_manufacturing_processes),
                allowed_product_types: normalizeTextArray(editingColor.allowed_product_types),
                application_colors_json: getApplicationColorsPayload(editingColor.application_colors_json),
                application_material_profiles_json: getMaterialProfilesPayload(editingColor.application_material_profiles_json),
                color_mode: editingColor.color_mode ?? 'full',
                isNew: editingColor.isNew,
                is_active: editingColor.is_active ?? true,
                notes: editingColor.notes ?? null,
            })
            toast.success("Color guardado correctamente")
            setModalOpen(false)
            
            // Sync locally
            if (!editingColor.isNew) {
                setData(prev => prev.map(c => c.code_4dig === code ? saved : c))
            } else {
                setData(prev => [saved, ...prev])
            }
        } catch (error: unknown) {
            console.error(error)
            toast.error(error instanceof Error ? error.message : "Error al guardar el color")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (code_4dig: string) => {
        if (!confirm(`¿Seguro que deseas eliminar el color con código "${code_4dig}"?`)) return
        setIsDeleting(code_4dig)
        try {
            const res = await deleteColorAction(code_4dig)
            if (!res.success && 'hasSkus' in res && res.hasSkus) {
                setDeleteConflict({
                    code_4dig,
                    skuCount: res.skuCount,
                    skuCodes: res.skuCodes
                })
                return
            }
            setData(prev => prev.filter(c => c.code_4dig !== code_4dig))
            toast.success("Color eliminado correctamente")
        } catch (error) {
            console.error(error)
            toast.error("Error al eliminar el color")
        } finally {
            setIsDeleting(null)
        }
    }

    const handleForceDelete = async () => {
        if (!deleteConflict) return
        setIsDeleting(deleteConflict.code_4dig)
        try {
            await forceDeleteColorAction(deleteConflict.code_4dig)
            setData(prev => prev.filter(c => c.code_4dig !== deleteConflict.code_4dig))
            toast.success(`Color y ${deleteConflict.skuCount} SKU(s) eliminados`)
            setDeleteConflict(null)
        } catch (error) {
            console.error(error)
            toast.error("Error al eliminar")
        } finally {
            setIsDeleting(null)
        }
    }

    return (
        <div className="flex flex-col gap-6 p-2">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/configuration">
                        <Button variant="outline" size="icon" className="border-slate-200 text-slate-700 hover:bg-slate-50">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <Palette className="h-6 w-6 text-green-600" />
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Catálogo de Colores</h1>
                        </div>
                        <p className="text-muted-foreground italic">
                            Verifica y administra la correspondencia de códigos y descripciones SAP de colores.
                        </p>
                    </div>
                </div>
                <Button onClick={() => handleOpenModal()} className="bg-green-600 hover:bg-green-700 text-white font-semibold">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nuevo Color
                </Button>
            </div>

            <div className="flex items-center gap-2 p-1 bg-white border border-slate-200 rounded-lg shadow-sm">
                <Search className="ml-3 h-4 w-4 text-muted-foreground font-bold" />
                <Input 
                    placeholder="Buscar por código de color (ej: 0001, GL10) o nombre SAP..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border-0 focus-visible:ring-0 text-sm italic"
                />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="font-bold uppercase text-[10px] w-48 text-slate-600">Código (4 Dígitos)</TableHead>
                            <TableHead className="font-bold uppercase text-[10px] text-slate-600">Nombre Color SAP</TableHead>
                            <TableHead className="font-bold uppercase text-[10px] text-slate-600">Alcance</TableHead>
                            <TableHead className="font-bold uppercase text-[10px] text-slate-600">Scopes productivos</TableHead>
                            <TableHead className="text-right font-bold uppercase text-[10px] w-32 text-slate-600">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                                    No se encontraron colores en el catálogo.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredData.map((item) => {
                                const configuredScopes = getConfiguredScopeEntries(item.application_colors_json)
                                return (
                                    <TableRow key={item.code_4dig} className="hover:bg-green-50/20 transition-colors">
                                        <TableCell className="font-bold text-slate-950 border-r border-slate-100">
                                            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200 uppercase font-semibold">
                                                {item.code_4dig}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-800 font-medium italic uppercase">
                                            {item.name_color_sap}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1.5">
                                                <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-[10px] font-semibold text-indigo-700">
                                                    {COLOR_MODE_LABELS[item.color_mode]}
                                                </Badge>
                                                <Badge variant="outline" className={item.is_active ? 'border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700' : 'border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-500'}>
                                                    {item.is_active ? 'Activo' : 'Inactivo'}
                                                </Badge>
                                                <Badge variant="outline" className="border-slate-200 bg-white text-[10px] font-semibold text-slate-600">
                                                    Tipos: {getScopeSummary(item.allowed_product_types)}
                                                </Badge>
                                                <Badge variant="outline" className="border-slate-200 bg-white text-[10px] font-semibold text-slate-600">
                                                    Procesos: {getScopeSummary(item.allowed_manufacturing_processes)}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {configuredScopes.length === 0 ? (
                                                <span className="text-xs italic text-slate-400">Sin scopes</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {configuredScopes.map(({ scope, value }) => (
                                                        <Badge key={scope} variant="outline" className="border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-700">
                                                            {COLOR_APPLICATION_SCOPE_LABELS[scope]}: {value}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => handleOpenModal(item)}
                                                    className="h-8 text-green-700 hover:text-green-800 hover:bg-green-50 font-medium"
                                                >
                                                    Editar
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => handleDelete(item.code_4dig)}
                                                    disabled={isDeleting === item.code_4dig}
                                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    {isDeleting === item.code_4dig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-[720px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
                            <Palette className="h-5 w-5 text-green-600" />
                            {editingColor?.isNew ? 'Nuevo Color' : 'Editar Color'}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {editingColor?.isNew 
                                ? 'Ingresa el código único y el nombre SAP del color para agregarlo al catálogo.' 
                                : 'Modifica el nombre del color SAP seleccionado. El código no puede ser editado.'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
                        <div className="grid min-h-0 flex-1 gap-2.5 overflow-y-auto py-3 pr-2">
                        <div className="grid gap-2.5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                            <div className="grid gap-1">
                            <Label htmlFor="code" className="text-xs font-semibold text-slate-600">Código</Label>
                            <Input 
                                id="code" 
                                className="h-9 uppercase"
                                value={editingColor?.code_4dig || ''} 
                                onChange={(e) => setEditingColor(prev => ({ ...prev!, code_4dig: e.target.value }))}
                                placeholder="0001"
                                required
                                disabled={!editingColor?.isNew}
                                maxLength={10}
                            />
                            </div>
                            <div className="grid gap-1">
                            <Label htmlFor="name" className="text-xs font-semibold text-slate-600">Nombre SAP</Label>
                            <Input 
                                id="name" 
                                className="h-9 uppercase"
                                value={editingColor?.name_color_sap || ''} 
                                onChange={(e) => setEditingColor(prev => ({ ...prev!, name_color_sap: e.target.value }))}
                                placeholder="BLANCO, GRAFITO MATE"
                                required
                            />
                            </div>
                        </div>

                        <div className="grid gap-2.5 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
                            <div className="grid gap-1.5">
                                <Label htmlFor="color-mode" className="text-xs font-semibold text-slate-600">Modo de color</Label>
                                <select
                                    id="color-mode"
                                    className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                                    value={editingColor?.color_mode ?? 'full'}
                                    onChange={(e) => setEditingColor(prev => ({ ...prev!, color_mode: e.target.value as ColorMode }))}
                                >
                                    {COLOR_MODE_OPTIONS.map((mode) => (
                                        <option key={mode} value={mode}>{COLOR_MODE_LABELS[mode]}</option>
                                    ))}
                                </select>
                            </div>
                            <label className="flex items-center gap-3 self-end rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={editingColor?.is_active ?? true}
                                    onChange={(e) => setEditingColor(prev => ({ ...prev!, is_active: e.target.checked }))}
                                    className="h-4 w-4 rounded border-slate-300 text-green-600"
                                />
                                {editingColor?.is_active ?? true ? 'Activo' : 'Inactivo'}
                            </label>
                        </div>

                        <div className="grid gap-2.5 border-t border-slate-100 pt-3 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <div>
                                    <Label className="text-sm font-bold text-slate-800">Tipos de producto <span className="text-xs font-normal text-slate-500">(vacio = todos)</span></Label>
                                </div>
                                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                                    {productTypes.length === 0 ? (
                                        <span className="text-xs italic text-slate-400">No hay tipos configurados.</span>
                                    ) : productTypes.map((productType) => (
                                        <label key={productType} className="flex items-center gap-1.5 rounded border border-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={normalizeTextArray(editingColor?.allowed_product_types).includes(productType)}
                                                onChange={() => toggleArrayValue('allowed_product_types', productType)}
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-green-600"
                                            />
                                            {productType}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <div>
                                    <Label className="text-sm font-bold text-slate-800">Procesos productivos <span className="text-xs font-normal text-slate-500">(vacio = todos)</span></Label>
                                </div>
                                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                                    {manufacturingProcesses.length === 0 ? (
                                        <span className="text-xs italic text-slate-400">No hay procesos configurados.</span>
                                    ) : manufacturingProcesses.map((process) => (
                                        <label key={process} className="flex items-center gap-1.5 rounded border border-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={normalizeTextArray(editingColor?.allowed_manufacturing_processes).includes(process)}
                                                onChange={() => toggleArrayValue('allowed_manufacturing_processes', process)}
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-green-600"
                                            />
                                            {process}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-1.5 border-t border-slate-100 pt-3">
                            <Label htmlFor="notes" className="text-sm font-bold text-slate-800">Notas productivas</Label>
                            <Textarea
                                id="notes"
                                className="h-16 min-h-16"
                                value={editingColor?.notes ?? ''}
                                onChange={(e) => setEditingColor(prev => ({ ...prev!, notes: e.target.value }))}
                                placeholder="Observaciones sobre aplicacion productiva del color"
                            />
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                            <div className="mb-2">
                                <Label className="text-sm font-bold text-slate-800">Scopes productivos BOM</Label>
                                <p className="text-xs text-slate-500">
                                    Usa codigos SAP de 4 caracteres. Deja un campo vacio para quitar ese scope.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                                {COLOR_APPLICATION_SCOPE_KEYS.map((scope) => {
                                    const value = editingColor?.application_colors_json?.[scope] ?? ''
                                    const hasInvalidValue = value.length > 0 && !SAP_COLOR_CODE_PATTERN.test(value)

                                    return (
                                        <div key={scope} className="grid gap-1">
                                            <Label htmlFor={`application-color-${scope}`} className="truncate text-[11px] font-semibold text-slate-600">
                                                {COLOR_APPLICATION_SCOPE_LABELS[scope]}
                                            </Label>
                                            <Input
                                                id={`application-color-${scope}`}
                                                className="h-8 w-[5.5rem] uppercase font-mono text-center tracking-widest"
                                                value={value}
                                                onChange={(e) => updateApplicationColor(scope, e.target.value)}
                                                placeholder="0437"
                                                maxLength={4}
                                                aria-invalid={hasInvalidValue}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <div className="border-t border-slate-100 pt-3">
                            <div className="mb-2">
                                <Label className="text-sm font-bold text-slate-800">Perfil de material por uso</Label>
                                <p className="text-xs text-slate-500">
                                    Define la familia base del material. Los codigos de color SAP siguen configurandose arriba.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                                {COLOR_APPLICATION_SCOPE_KEYS.map((scope) => (
                                    <div key={scope} className="grid gap-1">
                                        <Label htmlFor={`material-profile-${scope}`} className="truncate text-[11px] font-semibold text-slate-600">
                                            {COLOR_APPLICATION_SCOPE_LABELS[scope]}
                                        </Label>
                                        <select
                                            id={`material-profile-${scope}`}
                                            className="h-8 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                                            value={editingColor?.application_material_profiles_json?.[scope] ?? ''}
                                            onChange={(event) => updateMaterialProfile(scope, event.target.value)}
                                        >
                                            <option value="">Sin definir</option>
                                            {MATERIAL_PROFILE_OPTIONS.map((profile) => (
                                                <option key={profile} value={profile}>{MATERIAL_PROFILE_LABELS[profile]}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                        </div>

                        <DialogFooter className="border-t border-slate-100 pt-3">
                            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-slate-200">
                                Cancelar
                            </Button>
                            <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-semibold" disabled={isSaving}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Color
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Conflict Dialog */}
            <Dialog open={!!deleteConflict} onOpenChange={(open) => { if (!open) setDeleteConflict(null) }}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600 font-bold">
                            <Trash2 className="h-5 w-5" />
                            Color en uso
                        </DialogTitle>
                        <DialogDescription>
                            Este color está siendo usado por {deleteConflict?.skuCount} SKU(s). ¿Eliminar también esos SKUs?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-32 overflow-y-auto bg-slate-50 rounded p-3 border text-xs font-mono">
                        {deleteConflict?.skuCodes.map((code) => (
                            <div key={code} className="text-slate-700">{code}</div>
                        ))}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setDeleteConflict(null)} className="border-slate-200">
                            Cancelar
                        </Button>
                        <Button onClick={handleForceDelete} disabled={isDeleting !== null} className="bg-red-600 hover:bg-red-700 text-white font-semibold">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Eliminar color y {deleteConflict?.skuCount} SKU(s)
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
