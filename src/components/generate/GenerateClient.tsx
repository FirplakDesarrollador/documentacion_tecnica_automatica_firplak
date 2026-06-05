'use client'

import { startTransition, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Search, Download, AlertTriangle, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { GenerateFilters } from '@/components/generate/GenerateFilters'
import { TemplatePicker, type TemplateOption } from '@/components/generate/TemplatePicker'
import { GenerateProductTable, type GenerateProduct } from '@/components/generate/GenerateProductTable'
import { getTemplateRequiredFields, getTemplateValidationIssues } from '@/components/generate/ValidationWarnings'
import { BulkExportPanel } from '@/components/generate/BulkExportPanel'
import { getReferencesByFamilyAction } from '@/app/assets/actions'
import { GENERATE_LAST_URL_COOKIE, GENERATE_LAST_URL_STORAGE_KEY } from '@/lib/navigation/generateLastUrl'

const STORAGE_KEYS = {
    SELECTED_IDS: 'generate-selected-ids',
    FAMILY: 'generate_filter_family',
    REFERENCE: 'generate_filter_reference',
    TEMPLATE: 'generate_filter_template_id',
    DATASET: 'generate_filter_dataset_id'
}

interface GenerateClientProps {
    products: GenerateProduct[]
    templates: TemplateOption[]
    families: { value: string, label: string }[]
    references: { value: string, label: string }[]
    initialTemplateId: string | null
    datasetsForTemplate?: { id: string; name: string }[]
    initialDatasetId?: string | null
    hasFilter: boolean
    rules: Record<string, unknown>[]
    isExternalSource?: boolean
    totalCount?: number
    page?: number
    pageSize?: number
    templateBrandWarning?: string | null
}

export function GenerateClient({
    products: initialProducts,
    templates,
    families,
    references,
    initialTemplateId,
    datasetsForTemplate = [],
    initialDatasetId = null,
    hasFilter,
    rules,
    isExternalSource = false,
    totalCount: initialTotalCount = 0,
    page = 1,
    pageSize = 200,
    templateBrandWarning = null,
}: GenerateClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    
    // --- Estados de Selección de Productos ---
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isLoaded, setIsLoaded] = useState(false)
    const didHydrateSavedStateRef = useRef(false)
    const pendingSavedTemplateIdRef = useRef<string | null>(null)
    const pendingSavedDatasetIdRef = useRef<string | null>(null)

    // --- Estados de Filtros ---
    const [familyIds, setFamilyIds] = useState<string[]>(() => searchParams.getAll('f'))
    const [referenceIds, setReferenceIds] = useState<string[]>(() => searchParams.getAll('r'))
    const [referenceOptions, setReferenceOptions] = useState(references)
    const [isLoadingReferences, setIsLoadingReferences] = useState(false)
    const referenceOptionsCacheRef = useRef<Map<string, { value: string; label: string }[]>>(new Map())
    const [textFilter, setTextFilter] = useState(() => searchParams.get('q') || '')
    const [products, setProducts] = useState<GenerateProduct[]>(initialProducts)
    const [totalCount, setTotalCount] = useState(initialTotalCount)
    const [effectiveHasFilter, setEffectiveHasFilter] = useState(hasFilter)
    const [currentTemplateBrandWarning, setCurrentTemplateBrandWarning] = useState<string | null>(templateBrandWarning)
    const [isLoadingProducts, setIsLoadingProducts] = useState(false)
    const latestProductsRequestRef = useRef(0)
    const hasProductsRef = useRef(initialProducts.length > 0)

    // --- Estado de Plantilla ---
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
        initialTemplateId ?? (templates[0]?.id ?? null)
    )

    const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(initialDatasetId ?? null)

    // --- Estado de Página ---
    const [currentPage, setCurrentPage] = useState(page)

    const [showBulkExport, setShowBulkExport] = useState(false)
    const selectedTemplate = useMemo(
        () => templates.find(t => t.id === selectedTemplateId) ?? null,
        [templates, selectedTemplateId]
    )
    const isGenericDatasetsTemplate = selectedTemplate?.data_source === 'custom_datasets'
    const needsDatasetSelection = Boolean(isGenericDatasetsTemplate && !selectedDatasetId)
    const brandScope = selectedTemplate?.brand_scope === 'private_label' ? 'private_label' : 'firplak'
    const privateLabelClientName = selectedTemplate?.private_label_client_name
        ? String(selectedTemplate.private_label_client_name).trim()
        : ''
    const buildGenerateUrl = useCallback((nextState?: {
        families?: string[]
        references?: string[]
        templateId?: string | null
        datasetId?: string | null
        text?: string
        page?: number
    }) => {
        const params = new URLSearchParams()

        const nextFamilies = nextState?.families ?? familyIds
        const nextReferences = nextState?.references ?? referenceIds
        const nextTemplateId = nextState?.templateId ?? selectedTemplateId
        const nextDatasetId = nextState?.datasetId ?? selectedDatasetId
        const nextText = nextState?.text ?? textFilter
        const nextPage = nextState?.page ?? currentPage

        nextFamilies.forEach(id => params.append('f', id))
        nextReferences.forEach(id => params.append('r', id))

        if (nextText.trim()) {
            params.set('q', nextText.trim())
        }

        if (nextTemplateId) {
            params.set('template_id', nextTemplateId)
        }

        if (nextDatasetId) {
            params.set('dataset_id', nextDatasetId)
        }

        if (nextPage > 1) {
            params.set('page', String(nextPage))
        }

        const next = params.toString()
        return next ? `/generate?${next}` : '/generate'
    }, [currentPage, familyIds, referenceIds, selectedDatasetId, selectedTemplateId, textFilter])

    // 1. Cargar estados iniciales desde localStorage si la URL está vacía
    useEffect(() => {
        if (didHydrateSavedStateRef.current) return
        let cancelled = false

        let nextSelectedIds: string[] | null = null
        let nextFamilyIds: string[] | null = null
        let nextReferenceIds: string[] | null = null
        let nextRestoredUrl: string | null = null

        const savedIds = localStorage.getItem(STORAGE_KEYS.SELECTED_IDS)
        if (savedIds) {
            try { nextSelectedIds = JSON.parse(savedIds) } catch (e) { console.error(e) }
        }

        const savedFam = localStorage.getItem(STORAGE_KEYS.FAMILY)
        const savedRef = localStorage.getItem(STORAGE_KEYS.REFERENCE)
        const savedTpl = localStorage.getItem(STORAGE_KEYS.TEMPLATE)
        const savedDs = localStorage.getItem(STORAGE_KEYS.DATASET)
        const savedTemplate = savedTpl
            ? templates.find(template => template.id === savedTpl) ?? null
            : null
        const savedTemplateDataSource = savedTemplate?.data_source ?? 'core_firplak'
        const hasUrlFilters = searchParams.has('f') || searchParams.has('r')
        const shouldHydrateSavedFilters = !initialTemplateId && !hasUrlFilters && savedTemplateDataSource === 'core_firplak'

        if (shouldHydrateSavedFilters) {
            if (savedFam) {
                try {
                    const parsed = JSON.parse(savedFam)
                    if (Array.isArray(parsed) && parsed.length > 0) nextFamilyIds = parsed
                } catch (e) { console.error(e) }
            }
            if (savedRef) {
                try {
                    const parsed = JSON.parse(savedRef)
                    if (Array.isArray(parsed) && parsed.length > 0) nextReferenceIds = parsed
                } catch (e) { console.error(e) }
            }
        }

        if (savedTpl && !initialTemplateId) {
            pendingSavedTemplateIdRef.current = savedTpl
        }

        if (savedDs && !initialDatasetId) {
            pendingSavedDatasetIdRef.current = savedDs
        }

        if (savedTpl && !initialTemplateId && savedTemplateDataSource !== 'core_firplak') {
            const params = new URLSearchParams()
            params.set('template_id', savedTpl)

            if (savedTemplateDataSource === 'custom_datasets' && savedDs) {
                params.set('dataset_id', savedDs)
            }

            nextRestoredUrl = `/generate?${params.toString()}`
        }

        queueMicrotask(() => {
            if (cancelled) return
            didHydrateSavedStateRef.current = true
            if (nextSelectedIds) setSelectedIds(nextSelectedIds)
            if (nextFamilyIds) setFamilyIds(nextFamilyIds)
            if (nextReferenceIds) setReferenceIds(nextReferenceIds)
            setIsLoaded(true)

            if (nextRestoredUrl) {
                startTransition(() => {
                    router.replace(nextRestoredUrl, { scroll: false })
                    router.refresh()
                })
            }
        })

        return () => {
            cancelled = true
        }
    }, [searchParams, initialTemplateId, initialDatasetId, router, templates])

    useEffect(() => {
        const pendingTemplateId = pendingSavedTemplateIdRef.current
        if (!pendingTemplateId || initialTemplateId) return

        const exists = templates.some(t => t.id === pendingTemplateId)
        if (!exists) return

        setSelectedTemplateId(pendingTemplateId)
        pendingSavedTemplateIdRef.current = null
    }, [templates, initialTemplateId])

    useEffect(() => {
        const pendingDatasetId = pendingSavedDatasetIdRef.current
        if (!pendingDatasetId || initialDatasetId) return

        const exists = datasetsForTemplate.some(d => d.id === pendingDatasetId)
        if (!exists) return

        setSelectedDatasetId(pendingDatasetId)
        pendingSavedDatasetIdRef.current = null
    }, [datasetsForTemplate, initialDatasetId])

    useEffect(() => {
        let cancelled = false

        const loadReferences = async () => {
            if (familyIds.length === 0) {
                setReferenceOptions([])
                setIsLoadingReferences(false)
                return
            }

            const cacheKey = [...familyIds].sort().join('|')
            const cached = referenceOptionsCacheRef.current.get(cacheKey)
            if (cached) {
                setReferenceOptions(cached)
                setIsLoadingReferences(false)
                return
            }

            setReferenceOptions([])
            setIsLoadingReferences(true)

            try {
                const nextReferences = await getReferencesByFamilyAction(familyIds)
                if (!cancelled) {
                    const safeReferences = Array.isArray(nextReferences) ? nextReferences : []
                    referenceOptionsCacheRef.current.set(cacheKey, safeReferences)
                    setReferenceOptions(safeReferences)
                    setIsLoadingReferences(false)
                }
            } catch (error) {
                console.error('[GenerateClient] Error loading references by family:', error)
                if (!cancelled) {
                    setReferenceOptions([])
                    setIsLoadingReferences(false)
                }
            }
        }

        void loadReferences()

        return () => {
            cancelled = true
        }
    }, [familyIds])

    useEffect(() => {
        queueMicrotask(() => {
            setProducts(initialProducts)
            setTotalCount(initialTotalCount)
            setEffectiveHasFilter(hasFilter)
            setCurrentTemplateBrandWarning(templateBrandWarning)
            setIsLoadingProducts(false)
        })
    }, [hasFilter, initialProducts, initialTotalCount, templateBrandWarning])

    useEffect(() => {
        hasProductsRef.current = products.length > 0
    }, [products.length])

    useEffect(() => {
        if (!isLoaded || isExternalSource || isGenericDatasetsTemplate) return

        const shouldFetch =
            familyIds.length > 0 ||
            referenceIds.length > 0 ||
            textFilter.trim().length > 0

        if (!shouldFetch) {
            let cancelled = false

            queueMicrotask(() => {
                if (cancelled) return
                setProducts([])
                setTotalCount(0)
                setEffectiveHasFilter(false)
                setCurrentTemplateBrandWarning(templateBrandWarning)
                setIsLoadingProducts(false)
            })

            return () => {
                cancelled = true
            }
        }

        if (!hasProductsRef.current) {
            setIsLoadingProducts(true)
        }

        const controller = new AbortController()
        const requestId = ++latestProductsRequestRef.current

        const params = new URLSearchParams()
        familyIds.forEach(id => params.append('f', id))
        referenceIds.forEach(id => params.append('r', id))
        if (textFilter.trim()) {
            params.set('q', textFilter.trim())
        }
        if (selectedTemplateId) {
            params.set('template_id', selectedTemplateId)
        }
        params.set('page', String(currentPage))
        params.set('pageSize', String(pageSize))

        void fetch(`/api/generate/products?${params.toString()}`, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }
                return await response.json() as {
                    products?: GenerateProduct[]
                    totalCount?: number
                    hasFilter?: boolean
                    templateBrandWarning?: string | null
                }
            })
            .then((payload) => {
                if (latestProductsRequestRef.current !== requestId) return
                setProducts(Array.isArray(payload.products) ? payload.products : [])
                setTotalCount(typeof payload.totalCount === 'number' ? payload.totalCount : 0)
                setEffectiveHasFilter(Boolean(payload.hasFilter))
                setCurrentTemplateBrandWarning(payload.templateBrandWarning ?? null)
                setIsLoadingProducts(false)
            })
            .catch((error) => {
                if (controller.signal.aborted) return
                console.error('[GenerateClient] Error fetching filtered products:', error)
                if (latestProductsRequestRef.current !== requestId) return
                setProducts([])
                setTotalCount(0)
                setEffectiveHasFilter(true)
                setIsLoadingProducts(false)
            })

        return () => {
            controller.abort()
        }
    }, [
        currentPage,
        familyIds,
        isExternalSource,
        isGenericDatasetsTemplate,
        isLoaded,
        pageSize,
        referenceIds,
        selectedTemplateId,
        templateBrandWarning,
        textFilter,
    ])

    // 2. Sincronización de URL y persistencia sin recarga completa
    useEffect(() => {
        if (!isLoaded) return

        const timeout = setTimeout(() => {
            // Persistencia
            localStorage.setItem(STORAGE_KEYS.SELECTED_IDS, JSON.stringify(selectedIds))
            localStorage.setItem(STORAGE_KEYS.FAMILY, JSON.stringify(familyIds))
            localStorage.setItem(STORAGE_KEYS.REFERENCE, JSON.stringify(referenceIds))
            if (selectedTemplateId) {
                localStorage.setItem(STORAGE_KEYS.TEMPLATE, selectedTemplateId)
            }
            if (selectedDatasetId) {
                localStorage.setItem(STORAGE_KEYS.DATASET, selectedDatasetId)
            } else {
                localStorage.removeItem(STORAGE_KEYS.DATASET)
            }

            const current = `${window.location.pathname}${window.location.search}`
            const targetUrl = buildGenerateUrl()

            if (current !== targetUrl) {
                window.history.replaceState(null, '', targetUrl)
            }

            localStorage.setItem(GENERATE_LAST_URL_STORAGE_KEY, targetUrl)
            document.cookie = `${GENERATE_LAST_URL_COOKIE}=${encodeURIComponent(targetUrl)}; path=/; max-age=2592000; samesite=lax`
        }, 300)

        return () => clearTimeout(timeout)
    }, [buildGenerateUrl, familyIds, referenceIds, selectedTemplateId, selectedDatasetId, selectedIds, textFilter, currentPage, isLoaded])

    // 3. Sincronizar selección de plantilla con cambios en la URL (Navegación externa/atrás)
    // Usamos este patrón para evitar que el estado local "pelee" con la prop inicial durante el re-renderizado
    // eslint-disable: Son efectos de sincronización props→estado. No se pueden eliminar porque el estado
    // también se modifica internamente (usuario cambia plantilla). La alternativa sería un refactor
    // grande a componente controlado o usar `key` (que perdería todo el estado interno).
    const lastSyncedInitialTemplateIdRef = useRef(initialTemplateId)
    const lastSyncedInitialDatasetIdRef = useRef(initialDatasetId)
    
    useEffect(() => {
        if (initialTemplateId === lastSyncedInitialTemplateIdRef.current) return

        let cancelled = false

        queueMicrotask(() => {
            if (cancelled) return
            setSelectedTemplateId(initialTemplateId)
            lastSyncedInitialTemplateIdRef.current = initialTemplateId
        })

        return () => {
            cancelled = true
        }
    }, [initialTemplateId])

    useEffect(() => {
        if (initialDatasetId === lastSyncedInitialDatasetIdRef.current) return

        let cancelled = false

        queueMicrotask(() => {
            if (cancelled) return
            setSelectedDatasetId(initialDatasetId ?? null)
            lastSyncedInitialDatasetIdRef.current = initialDatasetId
        })

        return () => {
            cancelled = true
        }
    }, [initialDatasetId])

    // 4. Sincronizar página con cambios externos (navegación atrás/adelante)
    const lastSyncedPageRef = useRef(page)
    useEffect(() => {
        if (page === lastSyncedPageRef.current) return

        let cancelled = false

        queueMicrotask(() => {
            if (cancelled) return
            setCurrentPage(page)
            lastSyncedPageRef.current = page
        })

        return () => {
            cancelled = true
        }
    }, [page])

    // --- Computed Values ---
    const requiredFields = useMemo(
        () => selectedTemplate ? getTemplateRequiredFields(selectedTemplate.elements_json) : [],
        [selectedTemplate]
    )

    const validationIssuesByProduct = useMemo(() => {
        const map: Record<string, ReturnType<typeof getTemplateValidationIssues>> = {}
        for (const p of products) {
            map[p.id] = getTemplateValidationIssues(p, requiredFields)
        }
        return map
    }, [products, requiredFields])

    const missingFieldsByProduct = useMemo(() => {
        const map: Record<string, string[]> = {}
        for (const p of products) {
            map[p.id] = (validationIssuesByProduct[p.id] || []).map(issue => issue.field)
        }
        return map
    }, [products, validationIssuesByProduct])

    const warnings = useMemo(() =>
        products
            .filter(p => selectedIds.includes(p.id))
            .map(p => ({
                productCode: p.code,
                productName: p.final_name_es || '',
                issues: validationIssuesByProduct[p.id] || [],
            })),
        [products, selectedIds, validationIssuesByProduct]
    )

    const selectedProducts = useMemo(
        () => products.filter(p => selectedIds.includes(p.id)),
        [products, selectedIds]
    )

    const hasWarnings = warnings.some(w => w.issues.length > 0)

    // --- Filtrado local por texto ---
    const filteredProducts = useMemo(() => {
        if (!textFilter.trim()) return products
        const query = textFilter.toLowerCase().trim()
        return products.filter(p => {
            const name = (p.final_name_es || '').toLowerCase()
            const colorCode = (p.color_code || '').toLowerCase()
            const colorName = (p.color_name || '').toLowerCase()
            const code = (p.code || '').toLowerCase()
            const refCode = (p.ref_code || '').toLowerCase()
            return name.includes(query) || 
                   colorCode.includes(query) || 
                   colorName.includes(query) ||
                   code.includes(query) ||
                   refCode.includes(query)
        })
    }, [products, textFilter])

    // --- Paginación ---
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    const pageStart = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0
    const pageEnd = Math.min(currentPage * pageSize, totalCount)

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages || newPage === currentPage) return
        setCurrentPage(newPage)
    }

    const getPageNumbers = useCallback(() => {
        const pages: (number | 'ellipsis')[] = []
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i)
        } else {
            pages.push(1)
            if (currentPage > 3) pages.push('ellipsis')
            const start = Math.max(2, currentPage - 1)
            const end = Math.min(totalPages - 1, currentPage + 1)
            for (let i = start; i <= end; i++) pages.push(i)
            if (currentPage < totalPages - 2) pages.push('ellipsis')
            pages.push(totalPages)
        }
        return pages
    }, [currentPage, totalPages])

    // --- Handlers ---
    const handleFilterChange = (families: string[], references: string[]) => {
        setFamilyIds(families)
        setReferenceIds(references)
        setCurrentPage(1)
        localStorage.setItem(STORAGE_KEYS.FAMILY, JSON.stringify(families))
        localStorage.setItem(STORAGE_KEYS.REFERENCE, JSON.stringify(references))
        // No limpiamos el filtro de texto para que persista al cambiar familias/referencias
    }

    const handleTemplateChange = (id: string) => {
        const newTpl = templates.find(t => t.id === id)
        const oldTpl = selectedTemplate
        
        console.log(`[GenerateClient] Intentando cambiar plantilla a ID: ${id}. Anterior: ${oldTpl?.id}`)

        setSelectedTemplateId(id)
        setSelectedIds([]) // reset selection when template changes
        setCurrentPage(1)

        // Si cambiamos entre fuentes de datos (Core vs Externo), reseteamos los filtros
        if (newTpl?.data_source !== oldTpl?.data_source) {
            console.log(`[GenerateClient] Fuente de datos cambió (${oldTpl?.data_source} -> ${newTpl?.data_source}). Limpiando filtros.`)
            setFamilyIds([])
            setReferenceIds([])
        }

        // La selección de dataset depende de la plantilla (server-side)
        setSelectedDatasetId(null)
        const nextUrl = buildGenerateUrl({
            templateId: id,
            datasetId: null,
            page: 1,
        })

        startTransition(() => {
            router.replace(nextUrl, { scroll: false })
            router.refresh()
        })
    }

    const handleDatasetChange = (datasetId: string) => {
        setSelectedDatasetId(datasetId)
        setSelectedIds([])
        setCurrentPage(1)
        const nextUrl = buildGenerateUrl({
            datasetId,
            page: 1,
        })

        startTransition(() => {
            router.replace(nextUrl, { scroll: false })
            router.refresh()
        })
    }

    // --- Valores para exportación completa ---
    const parsedRefsForExport = useMemo(() => {
        return referenceIds.map((v) => {
            const parts = v.split('|||')
            if (parts.length >= 3) return { reference_code: parts[1], commercial_measure: parts[2] }
            if (parts.length === 2) return { reference_code: parts[0], commercial_measure: parts[1] }
            return { reference_code: parts[0], commercial_measure: undefined }
        })
    }, [referenceIds])

    const refCodesForExport = useMemo(
        () => parsedRefsForExport.map(p => p.reference_code).filter((v): v is string => Boolean(v)),
        [parsedRefsForExport]
    )
    const measuresForExport = useMemo(
        () => parsedRefsForExport.map(p => p.commercial_measure).filter((v): v is string => Boolean(v)),
        [parsedRefsForExport]
    )

    console.log(`[GenerateClient] Render actual. initialTemplateId: ${initialTemplateId}, selectedTemplateId: ${selectedTemplateId}`)

    return (
        <div className="flex flex-col gap-6">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="w-full lg:w-auto flex-1">
                    {!isExternalSource && !isGenericDatasetsTemplate ? (
                        <GenerateFilters
                            families={families}
                            references={referenceOptions}
                            referencesLoading={isLoadingReferences}
                            familyIds={familyIds}
                            referenceIds={referenceIds}
                            onChange={handleFilterChange}
                            textFilter={textFilter}
                            onTextFilterChange={setTextFilter}
                        />
                    ) : (
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-slate-500 font-medium px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md ring-1 ring-inset ring-indigo-200">
                                {isGenericDatasetsTemplate ? 'Plantilla por Dataset' : 'Dataset Externo (No aplica filtros de Familia)'}
                            </span>
                            <div className="relative flex items-center max-w-[280px] w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <Input
                                    type="text"
                                    placeholder="Buscar por nombre o color..."
                                    value={textFilter}
                                    onChange={(e) => setTextFilter(e.target.value)}
                                    className="pl-9 pr-8 h-10 w-full"
                                />
                                {textFilter && (
                                    <button
                                        onClick={() => setTextFilter('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto mt-3 lg:mt-0">
                    <TemplatePicker
                        templates={templates}
                        selectedTemplateId={selectedTemplateId}
                        onSelect={handleTemplateChange}
                    />
                    {isGenericDatasetsTemplate && (
                        <div className="min-w-[220px]">
                            <select
                                value={selectedDatasetId ?? ''}
                                onChange={(e) => handleDatasetChange(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60"
                                disabled={datasetsForTemplate.length === 0}
                            >
                                <option value="" disabled>
                                    {datasetsForTemplate.length === 0 ? 'Sin datasets asociados' : '-- Selecciona dataset --'}
                                </option>
                                {datasetsForTemplate.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Selected template info */}
            {selectedTemplate && (
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm px-1">
                    <div className="flex flex-wrap items-center gap-2 text-slate-500">
                        <span>Plantilla activa:</span>
                        <Badge variant="outline" className="font-medium text-indigo-600 border-indigo-200 bg-indigo-50">
                            {selectedTemplate.name}
                        </Badge>
                        <span className="text-slate-400">·</span>
                        <span>{selectedTemplate.width_mm}×{selectedTemplate.height_mm}mm</span>
                        <span className="text-slate-400">·</span>
                        <span className="capitalize">{selectedTemplate.document_type}</span>
                    </div>
                    {effectiveHasFilter && products.length > 0 && (
                        <div className="flex items-center gap-2">
                            {isLoadingProducts && (
                                <div className="text-indigo-700 text-xs font-medium bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-md">
                                    Actualizando...
                                </div>
                            )}
                            <div className="text-slate-600 text-xs font-medium bg-slate-100 px-2 py-1 rounded-md">
                                {textFilter ? (
                                    `Filtrados: ${filteredProducts.length} de ${products.length} cargados (Total: ${totalCount})`
                                ) : (
                                    `Mostrando ${pageStart}-${pageEnd} de ${totalCount} productos encontrados`
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {currentTemplateBrandWarning && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="leading-snug">{currentTemplateBrandWarning}</div>
                </div>
            )}

            {/* Tabla de productos */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Empty state */}
                {needsDatasetSelection ? (
                    <div className="flex flex-col items-center justify-center h-72 text-center px-6">
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-3 ring-1 ring-inset ring-indigo-100">
                            <Search className="w-8 h-8 text-indigo-400" />
                        </div>
                            <h3 className="text-base font-semibold text-slate-800">Selecciona un dataset</h3>
                            <p className="text-sm text-slate-500 mt-1 max-w-xs">
                                Esta plantilla usa <b>Bases de datos</b>. Elige un dataset asociado para cargar los registros.
                            </p>
                    </div>
                ) : isLoadingProducts && products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-72 text-center px-6">
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-3 ring-1 ring-inset ring-indigo-100">
                            <Search className="w-8 h-8 text-indigo-400 animate-pulse" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-800">Cargando productos</h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-xs">
                            Estamos aplicando los filtros seleccionados.
                        </p>
                    </div>
                ) : !effectiveHasFilter ? (
                    <div className="flex flex-col items-center justify-center h-72 text-center px-6">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                            <Search className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-800">Selecciona productos a generar</h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-xs">
                            Usa los filtros de <b>Familia</b> y <b>Referencia</b> para cargar productos y poder seleccionarlos.
                        </p>
                    </div>
                ) : (
                    <GenerateProductTable
                        products={filteredProducts}
                        missingFieldsByProduct={missingFieldsByProduct}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        templateId={selectedTemplateId}
                        isExternalSource={isExternalSource}
                    />
                )}
            </div>

            {/* Paginación */}
            {effectiveHasFilter && totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 px-1">
                    <div className="text-xs text-slate-400">
                        Página {currentPage} de {totalPages}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage <= 1}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-slate-100 disabled:hover:bg-transparent"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Anterior
                        </button>
                        <div className="flex items-center gap-0.5">
                            {getPageNumbers().map((p, i) =>
                                p === 'ellipsis' ? (
                                    <span key={`ellipsis-${i}`} className="px-1.5 text-slate-400 text-sm">...</span>
                                ) : (
                                    <button
                                        key={p}
                                        onClick={() => handlePageChange(p)}
                                        className={`min-w-[32px] h-8 text-sm font-medium rounded-md transition-colors ${
                                            p === currentPage
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        {p}
                                    </button>
                                )
                            )}
                        </div>
                        <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage >= totalPages}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-slate-100 disabled:hover:bg-transparent"
                        >
                            Siguiente
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Footer sticky con exportación masiva */}
            {selectedIds.length > 0 && (
                <div className="sticky bottom-4 z-20">
                    <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl shadow-xl px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                                {selectedIds.length}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-800">
                                    {selectedIds.length} producto{selectedIds.length > 1 ? 's' : ''} seleccionado{selectedIds.length > 1 ? 's' : ''}
                                </p>
                                {hasWarnings ? (
                                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                        <AlertTriangle className="w-3 h-3" />
                                        {warnings.filter(w => w.issues.length > 0).length} con datos incompletos
                                    </p>
                                ) : (
                                    <p className="text-xs text-green-600 mt-0.5">Todos listos para exportar</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedIds([])}
                                className="text-slate-500 hover:text-slate-700"
                            >
                                <X className="w-4 h-4 mr-1" />
                                Limpiar
                            </Button>
                            <Button
                                onClick={() => setShowBulkExport(true)}
                                disabled={!selectedTemplate || selectedProducts.length === 0}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Exportar ({selectedIds.length})
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dialog de exportación masiva */}
            <Dialog open={showBulkExport} onOpenChange={setShowBulkExport}>
                <DialogContent className="max-w-xl rounded-2xl max-h-[90vh] flex flex-col overflow-hidden">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Download className="w-5 h-5 text-indigo-500" />
                            Exportación masiva
                        </DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto flex-1 min-h-0">
                        <BulkExportPanel
                            selectedProducts={selectedProducts}
                            template={selectedTemplate}
                            rules={rules}
                            totalCount={totalCount}
                            exportFilterFamilies={familyIds}
                            exportFilterReferences={refCodesForExport}
                            exportFilterMeasures={measuresForExport}
                            exportFilterSearch={textFilter.trim() || null}
                            exportBrandScope={brandScope}
                            exportPrivateLabelClientName={privateLabelClientName}
                            onClose={() => setShowBulkExport(false)}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
