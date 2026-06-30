'use client'

import * as React from 'react'
import Image from 'next/image'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'
import { CheckCircle2, FileText, Image as ImageIcon, Layers, Loader2, Search, Upload } from 'lucide-react'
import {
    associateIsometricAction,
    associateProductResourceAction,
    deleteAssetAction,
    getAssetsByTypeAction,
    getDocumentSlugPrefixesAction,
    getFamiliesAction,
    getProductResourceScopeOptionsAction,
    getReferencesByFamilyAction,
    getVersionsByFamilyAndRefAction,
} from '@/app/assets/actions'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Option {
    value: string
    label: string
    meta?: {
        designation?: string
        product_name?: string
        commercial_measure?: string
        accessory_text?: string
    }
}

interface AssetItem {
    id: string
    name: string
    file_path: string
    relation_count: number
    type?: string
}

type ResourceStatus = 'draft' | 'review' | 'approved' | 'replaced' | 'rejected'
type RelationshipScope = 'reference' | 'family' | 'product_type' | 'manufacturing_process' | 'use_destination' | 'global'

interface ResourceTypeConfig {
    value: string
    label: string
    description: string
    accept: string
}

interface DocumentPrefixOption {
    document_slot: string
    label: string
    prefix: string
    description?: string | null
    active: boolean
}

const DEFAULT_RESOURCE_TYPE = 'instruction_pdf'

const RESOURCE_TYPES: ResourceTypeConfig[] = [
    {
        value: 'instruction_pdf',
        label: 'Instructivo PDF',
        description: 'PDF publico para QR permanente.',
        accept: 'application/pdf,.pdf',
    },
    {
        value: 'isometric',
        label: 'Isometrico',
        description: 'Mantiene el flujo legacy de isometricos.',
        accept: 'image/svg+xml,.svg',
    },
    {
        value: 'front_view_dimensioned',
        label: 'Vista frontal acotada',
        description: 'Archivo ya acotado, listo para consultar o usar.',
        accept: 'application/pdf,image/png,image/jpeg,image/svg+xml,.pdf,.png,.jpg,.jpeg,.svg',
    },
    {
        value: 'side_view_dimensioned',
        label: 'Vista lateral acotada',
        description: 'Archivo ya acotado, listo para consultar o usar.',
        accept: 'application/pdf,image/png,image/jpeg,image/svg+xml,.pdf,.png,.jpg,.jpeg,.svg',
    },
    {
        value: 'top_view_dimensioned',
        label: 'Vista superior acotada',
        description: 'Archivo ya acotado, listo para consultar o usar.',
        accept: 'application/pdf,image/png,image/jpeg,image/svg+xml,.pdf,.png,.jpg,.jpeg,.svg',
    },
    {
        value: 'exploded_view',
        label: 'Despiece',
        description: 'Vista explotada, lista de piezas u otro apoyo visual.',
        accept: 'application/pdf,image/png,image/jpeg,image/svg+xml,.pdf,.png,.jpg,.jpeg,.svg',
    },
    {
        value: 'assembly_step',
        label: 'Paso de armado',
        description: 'Recurso ordenable para una secuencia de armado.',
        accept: 'application/pdf,image/png,image/jpeg,image/svg+xml,.pdf,.png,.jpg,.jpeg,.svg',
    },
]

const STATUS_OPTIONS: Array<{ value: ResourceStatus; label: string }> = [
    { value: 'draft', label: 'Borrador' },
    { value: 'review', label: 'En revision' },
    { value: 'approved', label: 'Aprobado' },
    { value: 'replaced', label: 'Reemplazado' },
    { value: 'rejected', label: 'Rechazado' },
]

const RELATIONSHIP_SCOPE_OPTIONS: Array<{ value: RelationshipScope; label: string; description: string }> = [
    { value: 'reference', label: 'Referencia / version', description: 'Relaciona a referencias y opcionalmente a versiones especificas.' },
    { value: 'family', label: 'Familia', description: 'Relaciona el recurso a una familia completa.' },
    { value: 'use_destination', label: 'Destino de uso', description: 'Relaciona por destino como LAVAMANOS, COCINA o LAVARROPAS.' },
    { value: 'product_type', label: 'Tipo de producto', description: 'Relaciona por tipo tecnico de producto.' },
    { value: 'manufacturing_process', label: 'Manufactura', description: 'Relaciona por proceso/planta de manufactura.' },
    { value: 'global', label: 'Global', description: 'Documento general sin producto especifico.' },
]

function getResourceConfig(type: string) {
    return RESOURCE_TYPES.find((item) => item.value === type) || RESOURCE_TYPES[0]
}

function getFileBaseName(fileName: string) {
    const dot = fileName.lastIndexOf('.')
    return dot > 0 ? fileName.slice(0, dot) : fileName
}

function slugify(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
}

function isImageAsset(path: string) {
    return /\.(svg|png|jpe?g|gif|webp)(?:\?|$)/i.test(path)
}

function isPdfAsset(path: string) {
    return /\.pdf(?:\?|$)/i.test(path)
}

function isAcceptedFileForType(file: File, type: string) {
    const lowerName = file.name.toLowerCase()
    if (type === 'instruction_pdf') return file.type === 'application/pdf' || lowerName.endsWith('.pdf')
    if (type === 'isometric') return file.type === 'image/svg+xml' || lowerName.endsWith('.svg')
    return (
        file.type === 'application/pdf' ||
        file.type.startsWith('image/') ||
        /\.(pdf|svg|png|jpe?g)$/i.test(lowerName)
    )
}

function normalizeReferenceDiffs(selectedReferences: string[], references: Option[]) {
    const normalize = (value: unknown) => {
        const text = String(value ?? '').trim()
        return text === '' || text.toUpperCase() === 'NA' ? 'NA' : text
    }

    const selectedOptions = selectedReferences
        .map((value) => references.find((option) => option.value === value))
        .filter((option): option is Option => Boolean(option))

    const valuesByField = {
        medida: new Set<string>(),
        designacion: new Set<string>(),
        nombre: new Set<string>(),
        accesorio: new Set<string>(),
    }

    for (const option of selectedOptions) {
        const measureFromValue = (option.value.split('|||')[2] || '').trim()
        valuesByField.medida.add(normalize(option.meta?.commercial_measure ?? measureFromValue))
        valuesByField.designacion.add(normalize(option.meta?.designation))
        valuesByField.nombre.add(normalize(option.meta?.product_name))
        valuesByField.accesorio.add(normalize(option.meta?.accessory_text))
    }

    const diffs: string[] = []
    if (valuesByField.medida.size > 1) diffs.push('medida')
    if (valuesByField.nombre.size > 1) diffs.push('nombre')
    if (valuesByField.designacion.size > 1) diffs.push('designacion')
    if (valuesByField.accesorio.size > 1) diffs.push('accesorio')
    return diffs
}

function formatResourceTypeLabel(type: string) {
    return getResourceConfig(type).label
}

export function ResourceAssociationDialog() {
    const [open, setOpen] = React.useState(false)
    const [resourceType, setResourceType] = React.useState(DEFAULT_RESOURCE_TYPE)
    const [families, setFamilies] = React.useState<Option[]>([])
    const [references, setReferences] = React.useState<Option[]>([])
    const [versions, setVersions] = React.useState<Option[]>([])
    const [assets, setAssets] = React.useState<AssetItem[]>([])
    const [documentPrefixes, setDocumentPrefixes] = React.useState<DocumentPrefixOption[]>([])
    const [relationshipScope, setRelationshipScope] = React.useState<RelationshipScope>('reference')
    const [scopeOptions, setScopeOptions] = React.useState<Option[]>([])
    const [selectedScopeTargets, setSelectedScopeTargets] = React.useState<string[]>([])
    const [selectedFamilies, setSelectedFamilies] = React.useState<string[]>([])
    const [selectedReferences, setSelectedReferences] = React.useState<string[]>([])
    const [selectedVersions, setSelectedVersions] = React.useState<string[]>([])
    const [selectedAssetId, setSelectedAssetId] = React.useState('')
    const [searchQuery, setSearchQuery] = React.useState('')
    const [createPublicLink, setCreatePublicLink] = React.useState(false)
    const [documentSlot, setDocumentSlot] = React.useState('manual_instalacion')
    const [documentLabel, setDocumentLabel] = React.useState('')
    const [versionNumber, setVersionNumber] = React.useState(1)
    const [status, setStatus] = React.useState<ResourceStatus>('approved')
    const [sortOrder, setSortOrder] = React.useState(0)
    const [revisionNote, setRevisionNote] = React.useState('')
    const [blockingDiffFields, setBlockingDiffFields] = React.useState<string[]>([])
    const [confirmBlockingDiffs, setConfirmBlockingDiffs] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [uploading, setUploading] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const uploadedAssetIdsRef = React.useRef<string[]>([])
    const skipCleanupRef = React.useRef(false)

    const config = getResourceConfig(resourceType)
    const isIsometric = resourceType === 'isometric'
    const isAssemblyStep = resourceType === 'assembly_step'
    const activeDocumentPrefix = documentPrefixes.find((item) => item.document_slot === documentSlot)
    const selectedAsset = assets.find((asset) => asset.id === selectedAssetId)
    const previewSlugBody = slugify(documentLabel || selectedAsset?.name || 'documento')
    const previewPublicSlug = activeDocumentPrefix && previewSlugBody
        ? `${activeDocumentPrefix.prefix}/${previewSlugBody}`
        : ''
    const selectedScopeConfig = RELATIONSHIP_SCOPE_OPTIONS.find((item) => item.value === relationshipScope) || RELATIONSHIP_SCOPE_OPTIONS[0]

    const resetState = () => {
        setResourceType(DEFAULT_RESOURCE_TYPE)
        setFamilies([])
        setReferences([])
        setVersions([])
        setAssets([])
        setDocumentPrefixes([])
        setRelationshipScope('reference')
        setScopeOptions([])
        setSelectedScopeTargets([])
        setSelectedFamilies([])
        setSelectedReferences([])
        setSelectedVersions([])
        setSelectedAssetId('')
        setSearchQuery('')
        setCreatePublicLink(false)
        setDocumentSlot('manual_instalacion')
        setDocumentLabel('')
        setVersionNumber(1)
        setStatus('approved')
        setSortOrder(0)
        setRevisionNote('')
        setBlockingDiffFields([])
        setConfirmBlockingDiffs(false)
        uploadedAssetIdsRef.current = []
        skipCleanupRef.current = false
    }

    const loadInitialData = async (type: string) => {
        setLoading(true)
        try {
            const [familyOptions, assetOptions, prefixOptions] = await Promise.all([
                getFamiliesAction(),
                getAssetsByTypeAction(type),
                getDocumentSlugPrefixesAction(),
            ])
            setFamilies(familyOptions as Option[])
            setAssets(assetOptions as AssetItem[])
            const activePrefixes = (prefixOptions as DocumentPrefixOption[]).filter((item) => item.active)
            setDocumentPrefixes(activePrefixes)
            if (activePrefixes.length > 0 && !activePrefixes.some((item) => item.document_slot === documentSlot)) {
                setDocumentSlot(activePrefixes[0].document_slot)
            }
        } catch {
            toast.error('Error al cargar datos maestros')
        } finally {
            setLoading(false)
        }
    }

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setOpen(false)
            if (!skipCleanupRef.current && uploadedAssetIdsRef.current.length > 0) {
                void Promise.all(uploadedAssetIdsRef.current.map((id) => deleteAssetAction(id).catch(() => null)))
            }
            resetState()
            return
        }

        resetState()
        setOpen(true)
        void loadInitialData(DEFAULT_RESOURCE_TYPE)
    }

    const handleResourceTypeChange = async (nextType: string) => {
        setResourceType(nextType)
        if (nextType === 'isometric') {
            setRelationshipScope('reference')
            setSelectedScopeTargets([])
            setScopeOptions([])
        }
        setSelectedAssetId('')
        setAssets([])
        setSearchQuery('')
        setCreatePublicLink(false)
        setDocumentLabel('')
        setVersionNumber(1)
        setStatus('approved')
        setSortOrder(0)
        setRevisionNote('')
        setBlockingDiffFields([])
        setConfirmBlockingDiffs(false)
        await loadInitialData(nextType)
    }

    const handleRelationshipScopeChange = async (nextScope: RelationshipScope) => {
        setRelationshipScope(nextScope)
        setSelectedFamilies([])
        setSelectedReferences([])
        setSelectedVersions([])
        setReferences([])
        setVersions([])
        setSelectedScopeTargets(nextScope === 'global' ? ['global'] : [])
        setScopeOptions([])
        setBlockingDiffFields([])
        setConfirmBlockingDiffs(false)

        if (nextScope === 'reference') return

        setLoading(true)
        try {
            const options = await getProductResourceScopeOptionsAction(nextScope)
            setScopeOptions(options as Option[])
            if (nextScope === 'global') {
                setSelectedScopeTargets(['global'])
            }
        } catch {
            toast.error('Error al cargar destinos del recurso')
        } finally {
            setLoading(false)
        }
    }

    const handleFamiliesChange = async (values: string[]) => {
        setSelectedFamilies(values)
        setSelectedReferences([])
        setSelectedVersions([])
        setReferences([])
        setVersions([])
        setBlockingDiffFields([])
        setConfirmBlockingDiffs(false)

        if (values.length === 0) return
        try {
            const nextReferences = await getReferencesByFamilyAction(values)
            setReferences(nextReferences as Option[])
        } catch {
            toast.error('Error al cargar referencias')
        }
    }

    const handleReferencesChange = async (values: string[]) => {
        setSelectedReferences(values)
        setSelectedVersions([])
        setVersions([])
        const diffs = isIsometric ? normalizeReferenceDiffs(values, references) : []
        setBlockingDiffFields(diffs)
        setConfirmBlockingDiffs(false)

        if (values.length === 0 && selectedFamilies.length === 0) return
        try {
            const nextVersions = await getVersionsByFamilyAndRefAction(selectedFamilies, values)
            setVersions(nextVersions as Option[])
        } catch {
            toast.error('Error al cargar versiones')
        }
    }

    const handleFileUpload = async (file: File) => {
        if (!isAcceptedFileForType(file, resourceType)) {
            toast.error(`El archivo no coincide con el tipo ${formatResourceTypeLabel(resourceType)}.`)
            return
        }

        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', resourceType)
            formData.append('name', getFileBaseName(file.name))

            const response = await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData,
            })
            const result = await response.json()
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Error al subir archivo')
            }

            const newAsset = result.asset as AssetItem
            setAssets((prev) => [{ ...newAsset, relation_count: 0 }, ...prev])
            setSelectedAssetId(newAsset.id)
            uploadedAssetIdsRef.current = [...uploadedAssetIdsRef.current, newAsset.id]
            if (!documentLabel.trim()) {
                setDocumentLabel(getFileBaseName(file.name))
            }
            toast.success('Archivo subido y listo para asociar')
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Error al subir archivo')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleSubmit = async () => {
        if (!selectedAssetId) {
            toast.error('Selecciona o sube un recurso.')
            return
        }
        if (relationshipScope === 'reference' && (selectedFamilies.length === 0 || selectedReferences.length === 0)) {
            toast.error('Selecciona al menos una familia y una referencia.')
            return
        }
        if (relationshipScope !== 'reference' && selectedScopeTargets.length === 0) {
            toast.error('Selecciona al menos un destino para el recurso.')
            return
        }
        if (createPublicLink && !documentSlot) {
            toast.error('Selecciona el tipo funcional del documento para generar el prefijo.')
            return
        }
        if (isIsometric && blockingDiffFields.length > 0 && !confirmBlockingDiffs) {
            toast.error('Confirma las diferencias antes de asociar.')
            return
        }

        setSubmitting(true)
        try {
            if (isIsometric) {
                const result = await associateIsometricAction({
                    assetId: selectedAssetId,
                    familyCodes: selectedFamilies,
                    referenceCodes: selectedReferences,
                    versionCodes: selectedVersions,
                })
                toast.success(`Isometrico asociado a ${result.updatedCount} registro(s)`)
            } else {
                const result = await associateProductResourceAction({
                    assetId: selectedAssetId,
                    assetType: resourceType,
                    relationshipScope,
                    referenceCodes: selectedReferences,
                    versionCodes: selectedVersions,
                    targetValues: relationshipScope === 'reference' ? [] : selectedScopeTargets,
                    createPublicLink,
                    documentSlot: createPublicLink ? documentSlot : undefined,
                    documentLabel: documentLabel || selectedAsset?.name || undefined,
                    versionNumber,
                    status,
                    sortOrder: isAssemblyStep ? sortOrder : 0,
                    revisionNote,
                })
                toast.success(`Recurso asociado a ${result.insertedCount} destino(s)`)
            }

            skipCleanupRef.current = true
            uploadedAssetIdsRef.current = []
            handleOpenChange(false)
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Error al asociar recurso')
        } finally {
            setSubmitting(false)
        }
    }

    const filteredAssets = assets.filter((asset) => {
        if (!searchQuery.trim()) return true
        const keywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean)
        const name = asset.name.toLowerCase()
        const path = (asset.file_path || '').toLowerCase()
        return keywords.every((keyword) => name.includes(keyword) || path.includes(keyword))
    })

    const hasValidTarget = relationshipScope === 'reference'
        ? selectedFamilies.length > 0 && selectedReferences.length > 0
        : selectedScopeTargets.length > 0

    const canSubmit = Boolean(selectedAssetId)
        && hasValidTarget
        && (!createPublicLink || Boolean(documentSlot))
        && (!isIsometric || blockingDiffFields.length === 0 || confirmBlockingDiffs)
        && !submitting
        && !uploading

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger
                render={(
                    <Button variant="outline" className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 shadow-sm transition-all h-10 px-4">
                        <Layers className="h-4 w-4" />
                        Asociar recursos
                    </Button>
                )}
            />
            <DialogContent className="max-w-md sm:max-w-2xl p-0 bg-white border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="p-6 pb-2 shrink-0">
                    <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Layers className="h-5 w-5 text-indigo-500" />
                        Asociar recursos
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Vincula instructivos, vistas, despieces, pasos de armado o isometricos a referencias y versiones.
                    </DialogDescription>
                </DialogHeader>

                <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">1. Tipo de recurso</Label>
                        <select
                            value={resourceType}
                            onChange={(event) => void handleResourceTypeChange(event.target.value)}
                            disabled={loading || uploading || submitting}
                            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        >
                            {RESOURCE_TYPES.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </select>
                        <p className="text-[11px] text-slate-500">{config.description}</p>
                    </div>

                    <div className="space-y-4">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">2. Seleccionar o subir archivo</Label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                            }}
                            onDrop={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                const file = event.dataTransfer.files?.[0]
                                if (file) void handleFileUpload(file)
                            }}
                            className={cn(
                                'border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer',
                                uploading ? 'bg-slate-50 border-slate-200 opacity-50 pointer-events-none' : 'hover:bg-indigo-50/30 hover:border-indigo-300 border-slate-200'
                            )}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept={config.accept}
                                onChange={(event) => {
                                    const file = event.target.files?.[0]
                                    if (file) void handleFileUpload(file)
                                }}
                            />
                            {uploading ? (
                                <Loader2 className="h-8 w-8 text-indigo-500 mx-auto animate-spin mb-2" />
                            ) : (
                                <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                            )}
                            <p className="text-sm font-medium text-slate-700">
                                {uploading ? 'Subiendo archivo...' : `Subir ${config.label.toLowerCase()}`}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">SVG, JPG, PDF u otro compatible. Tambien puedes escoger un recurso existente abajo.</p>
                        </div>

                        {assets.length > 0 && (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder={`Buscar ${config.label.toLowerCase()}...`}
                                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                />
                            </div>
                        )}

                        {loading ? (
                            <div className="h-24 flex items-center justify-center text-slate-400 text-sm">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Cargando recursos...
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-1">
                                {filteredAssets.map((asset) => (
                                    <div
                                        key={asset.id}
                                        onClick={() => {
                                            setSelectedAssetId(asset.id)
                                            if (!documentLabel.trim()) setDocumentLabel(asset.name)
                                        }}
                                        className={cn(
                                            'flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer',
                                            selectedAssetId === asset.id
                                                ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/20'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                        )}
                                    >
                                        <div className="relative h-10 w-10 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-slate-200">
                                            {asset.file_path && isImageAsset(asset.file_path) ? (
                                                <Image
                                                    src={asset.file_path}
                                                    alt={`Vista previa de ${asset.name}`}
                                                    fill
                                                    unoptimized
                                                    sizes="40px"
                                                    className="object-contain"
                                                />
                                            ) : isPdfAsset(asset.file_path || '') ? (
                                                <FileText className="h-5 w-5 text-rose-500" />
                                            ) : (
                                                <ImageIcon className="h-5 w-5 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-slate-900 truncate uppercase">{asset.name}</p>
                                                {asset.relation_count === 0 && (
                                                    <Badge className="bg-slate-100 text-slate-500 border-none text-[8px] h-4 font-bold">SIN USO</Badge>
                                                )}
                                            </div>
                                            <p className="text-[9px] text-slate-400 truncate mt-0.5">{asset.file_path}</p>
                                        </div>
                                        {selectedAssetId === asset.id && <CheckCircle2 className="h-5 w-5 text-indigo-500" />}
                                    </div>
                                ))}
                                {assets.length > 0 && filteredAssets.length === 0 && (
                                    <div className="text-center py-6 text-sm text-slate-400">
                                        No se encontraron recursos con ese nombre.
                                    </div>
                                )}
                                {assets.length === 0 && (
                                    <div className="text-center py-6 text-sm text-slate-400">
                                        No hay recursos existentes de este tipo.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">3. Destino del recurso</Label>
                        <div className="space-y-2">
                            <Label className="text-slate-700 font-medium">Nivel de relacionamiento</Label>
                            <select
                                value={relationshipScope}
                                onChange={(event) => void handleRelationshipScopeChange(event.target.value as RelationshipScope)}
                                disabled={loading || uploading || submitting || isIsometric}
                                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            >
                                {RELATIONSHIP_SCOPE_OPTIONS.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-slate-500">{selectedScopeConfig.description}</p>
                        </div>

                        {relationshipScope === 'reference' ? (
                            <>
                                <div className="space-y-2">
                                    <Label className="text-slate-700 font-medium">Familia(s)</Label>
                                    <MultiSelectSearchField
                                        options={families}
                                        values={selectedFamilies}
                                        onChange={(values) => void handleFamiliesChange(values)}
                                        placeholder="Seleccionar familias"
                                        className="h-11"
                                    />
                                </div>

                                <div className={cn('space-y-2 transition-opacity', selectedFamilies.length === 0 && 'opacity-50 pointer-events-none')}>
                                    <Label className="text-slate-700 font-medium">Ref - Desig - Medida - Nombre - Accesorio - Marca</Label>
                                    <MultiSelectSearchField
                                        options={references}
                                        values={selectedReferences}
                                        onChange={(values) => void handleReferencesChange(values)}
                                        placeholder="Seleccionar referencia"
                                        className="h-11"
                                        emptyMessage="Selecciona familias primero."
                                    />
                                </div>

                                <div className={cn('space-y-2 transition-opacity', selectedReferences.length === 0 && 'opacity-50 pointer-events-none')}>
                                    <Label className="text-slate-700 font-medium">Version(es) <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">(Opcional)</span></Label>
                                    <MultiSelectSearchField
                                        options={versions}
                                        values={selectedVersions}
                                        onChange={setSelectedVersions}
                                        placeholder="Todas las versiones"
                                        className="h-11"
                                        emptyMessage="Selecciona referencias primero."
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="space-y-2">
                                <Label className="text-slate-700 font-medium">Destino(s)</Label>
                                <MultiSelectSearchField
                                    options={scopeOptions}
                                    values={selectedScopeTargets}
                                    onChange={setSelectedScopeTargets}
                                    placeholder={`Seleccionar ${selectedScopeConfig.label.toLowerCase()}`}
                                    className="h-11"
                                    emptyMessage="No hay opciones disponibles para este alcance."
                                />
                            </div>
                        )}
                    </div>

                    {!isIsometric && (
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">4. Control del recurso</Label>
                            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={createPublicLink}
                                    onChange={(event) => setCreatePublicLink(event.target.checked)}
                                />
                                <span className="space-y-1">
                                    <span className="block font-bold">Crear enlace publico para QR</span>
                                    <span className="block text-[11px] text-slate-500">
                                        Si esta apagado, el recurso queda relacionado pero no se ofrece como QR ni link publico.
                                    </span>
                                </span>
                            </label>

                            {createPublicLink && (
                                <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
                                    <div className="space-y-2">
                                        <Label className="text-slate-700 font-medium">Tipo funcional / prefijo</Label>
                                        <select
                                            value={documentSlot}
                                            onChange={(event) => setDocumentSlot(event.target.value)}
                                            className="w-full h-11 bg-white border border-indigo-100 rounded-lg px-3 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                        >
                                            {documentPrefixes.map((item) => (
                                                <option key={item.document_slot} value={item.document_slot}>
                                                    {item.prefix} - {item.label}
                                                </option>
                                            ))}
                                        </select>
                                        {documentPrefixes.length === 0 && (
                                            <p className="text-[11px] font-semibold text-rose-600">
                                                No hay prefijos activos. Configuralos en Configuracion &gt; Nomenclatura.
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-slate-700 font-medium">Etiqueta del documento</Label>
                                        <Input
                                            value={documentLabel}
                                            onChange={(event) => setDocumentLabel(event.target.value)}
                                            placeholder={selectedAsset?.name || 'Instructivo mueble elevado...'}
                                            className="h-11 bg-white border-indigo-100 focus:bg-white"
                                        />
                                    </div>

                                    <p className="text-[11px] text-slate-500">
                                        Preview aproximado:{' '}
                                        <span className="font-mono text-slate-800">
                                            /{previewPublicSlug || 'prefijo/slug-generado'}
                                        </span>
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                        El slug final se genera en servidor con la nomenclatura y abreviaturas configuradas.
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label className="text-slate-700 font-medium">Version del archivo</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={versionNumber}
                                        onChange={(event) => setVersionNumber(Math.max(1, Math.trunc(Number(event.target.value) || 1)))}
                                        className="h-11 bg-slate-50 border-slate-200 focus:bg-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-slate-700 font-medium">Estado</Label>
                                    <select
                                        value={status}
                                        onChange={(event) => setStatus(event.target.value as ResourceStatus)}
                                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                    >
                                        {STATUS_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {isAssemblyStep && (
                                <div className="space-y-2">
                                    <Label className="text-slate-700 font-medium">Orden del paso</Label>
                                    <Input
                                        type="number"
                                        value={sortOrder}
                                        onChange={(event) => setSortOrder(Math.trunc(Number(event.target.value) || 0))}
                                        className="h-11 bg-slate-50 border-slate-200 focus:bg-white"
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-slate-700 font-medium">Nota de revision</Label>
                                <Textarea
                                    value={revisionNote}
                                    onChange={(event) => setRevisionNote(event.target.value)}
                                    placeholder="Que cambio o por que se carga esta version..."
                                    className="min-h-20 resize-none bg-slate-50 border-slate-200 focus:bg-white"
                                />
                            </div>
                        </div>
                    )}

                    {isIsometric && blockingDiffFields.length > 0 && (
                        <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 space-y-3">
                            <p className="text-xs text-rose-800 font-semibold">
                                Cuidado: las referencias seleccionadas tienen diferencias en {blockingDiffFields.join(', ')}.
                            </p>
                            <label className="flex items-start gap-2 text-xs text-rose-800">
                                <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={confirmBlockingDiffs}
                                    onChange={(event) => setConfirmBlockingDiffs(event.target.checked)}
                                />
                                <span>Entiendo y deseo asociar el mismo isometrico igualmente.</span>
                            </label>
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                    <Button variant="ghost" className="hover:bg-slate-200" onClick={() => handleOpenChange(false)} disabled={submitting || uploading}>
                        Cancelar
                    </Button>
                    <Button
                        disabled={!canSubmit}
                        onClick={() => void handleSubmit()}
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-md h-10 px-6 transition-all"
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        {submitting ? 'Procesando...' : 'Asociar recurso'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
