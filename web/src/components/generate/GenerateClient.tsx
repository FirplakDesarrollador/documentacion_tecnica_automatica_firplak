'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Search, Download, AlertTriangle, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { GenerateFilters } from '@/components/generate/GenerateFilters'
import { TemplatePicker, type TemplateOption } from '@/components/generate/TemplatePicker'
import { GenerateProductTable, type GenerateProduct } from '@/components/generate/GenerateProductTable'
import { ValidationWarnings, getMissingFields, getTemplateRequiredFields } from '@/components/generate/ValidationWarnings'
import { BulkExportPanel } from '@/components/generate/BulkExportPanel'

const STORAGE_KEYS = {
    SELECTED_IDS: 'generate-selected-ids',
    FAMILY: 'generate_filter_family',
    REFERENCE: 'generate_filter_reference',
    TEMPLATE: 'generate_filter_template_id'
}

interface GenerateClientProps {
    products: GenerateProduct[]
    templates: TemplateOption[]
    families: { value: string, label: string }[]
    references: { value: string, label: string }[]
    initialTemplateId: string | null
    hasFilter: boolean
    rules: any[]
    isExternalSource?: boolean
}

export function GenerateClient({
    products,
    templates,
    families,
    references,
    initialTemplateId,
    hasFilter,
    rules,
    isExternalSource = false,
}: GenerateClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    
    // --- Estados de Selección de Productos ---
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isLoaded, setIsLoaded] = useState(false)

    // --- Estados de Filtros ---
    const [familyIds, setFamilyIds] = useState<string[]>(() => searchParams.getAll('f'))
    const [referenceIds, setReferenceIds] = useState<string[]>(() => searchParams.getAll('r'))

    // --- Estado de Plantilla ---
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
        initialTemplateId ?? (templates[0]?.id ?? null)
    )

    const [showBulkExport, setShowBulkExport] = useState(false)

    // 1. Cargar estados iniciales desde localStorage si la URL está vacía
    useEffect(() => {
        // Cargar selección de productos
        const savedIds = localStorage.getItem(STORAGE_KEYS.SELECTED_IDS)
        if (savedIds) {
            try { setSelectedIds(JSON.parse(savedIds)) } catch (e) { console.error(e) }
        }

        const hasUrlFilters = searchParams.has('f') || searchParams.has('r')
        if (!hasUrlFilters) {
            const savedFam = localStorage.getItem(STORAGE_KEYS.FAMILY)
            const savedRef = localStorage.getItem(STORAGE_KEYS.REFERENCE)
            const savedTpl = localStorage.getItem(STORAGE_KEYS.TEMPLATE)

            if (savedFam) {
                try {
                    const parsed = JSON.parse(savedFam)
                    if (Array.isArray(parsed) && parsed.length > 0) setFamilyIds(parsed)
                } catch (e) { console.error(e) }
            }
            if (savedRef) {
                try {
                    const parsed = JSON.parse(savedRef)
                    if (Array.isArray(parsed) && parsed.length > 0) setReferenceIds(parsed)
                } catch (e) { console.error(e) }
            }
            if (savedTpl && !initialTemplateId) {
                // Solo restaurar si no hay nada en la URL que mande
                const exists = templates.some(t => t.id === savedTpl)
                if (exists) setSelectedTemplateId(savedTpl)
            }
        }
        setIsLoaded(true)
    }, [])

    // 2. Sincronización Unificada con la URL (Debounced)
    useEffect(() => {
        if (!isLoaded) return

        const timeout = setTimeout(() => {
            const params = new URLSearchParams()
            
            // Filtros
            familyIds.forEach(id => params.append('f', id))
            referenceIds.forEach(id => params.append('r', id))
            
            // Plantilla
            if (selectedTemplateId) {
                params.set('template_id', selectedTemplateId)
            }

            // Persistencia
            localStorage.setItem(STORAGE_KEYS.SELECTED_IDS, JSON.stringify(selectedIds))
            localStorage.setItem(STORAGE_KEYS.FAMILY, JSON.stringify(familyIds))
            localStorage.setItem(STORAGE_KEYS.REFERENCE, JSON.stringify(referenceIds))
            if (selectedTemplateId) {
                localStorage.setItem(STORAGE_KEYS.TEMPLATE, selectedTemplateId)
            }

            const current = searchParams.toString()
            const next = params.toString()

            if (current !== next) {
                router.push(`/generate?${next}`)
            }
        }, 300)

        return () => clearTimeout(timeout)
    }, [familyIds, referenceIds, selectedTemplateId, selectedIds, isLoaded, router, searchParams])

    // 3. Sincronizar selección de plantilla con cambios en la URL (Navegación externa/atrás)
    // Usamos este patrón para evitar que el estado local "pelee" con la prop inicial durante el re-renderizado
    const [lastSyncedInitialId, setLastSyncedInitialId] = useState(initialTemplateId)
    
    useEffect(() => {
        if (initialTemplateId !== lastSyncedInitialId) {
            setSelectedTemplateId(initialTemplateId)
            setLastSyncedInitialId(initialTemplateId)
        }
    }, [initialTemplateId, lastSyncedInitialId])

    // --- Computed Values ---
    const selectedTemplate = useMemo(
        () => templates.find(t => t.id === selectedTemplateId) ?? null,
        [templates, selectedTemplateId]
    )

    const requiredFields = useMemo(
        () => selectedTemplate ? getTemplateRequiredFields(selectedTemplate.elements_json) : [],
        [selectedTemplate]
    )

    const missingFieldsByProduct = useMemo(() => {
        const map: Record<string, string[]> = {}
        for (const p of products) {
            map[p.id] = getMissingFields(p, requiredFields)
        }
        return map
    }, [products, requiredFields])

    const warnings = useMemo(() =>
        products
            .filter(p => selectedIds.includes(p.id))
            .map(p => ({
                productCode: p.code,
                productName: p.final_name_es || '',
                missingFields: missingFieldsByProduct[p.id] || [],
            })),
        [products, selectedIds, missingFieldsByProduct]
    )

    const selectedProducts = useMemo(
        () => products.filter(p => selectedIds.includes(p.id)),
        [products, selectedIds]
    )

    const hasWarnings = warnings.some(w => w.missingFields.length > 0)

    // --- Handlers ---
    const handleFilterChange = (families: string[], references: string[]) => {
        setFamilyIds(families)
        setReferenceIds(references)
    }

    const handleTemplateChange = (id: string) => {
        const newTpl = templates.find(t => t.id === id)
        const oldTpl = selectedTemplate
        
        console.log(`[GenerateClient] Intentando cambiar plantilla a ID: ${id}. Anterior: ${oldTpl?.id}`)

        setSelectedTemplateId(id)
        setSelectedIds([]) // reset selection when template changes

        // Si cambiamos entre fuentes de datos (Core vs Externo), reseteamos los filtros
        if (newTpl?.data_source !== oldTpl?.data_source) {
            console.log(`[GenerateClient] Fuente de datos cambió (${oldTpl?.data_source} -> ${newTpl?.data_source}). Limpiando filtros.`)
            setFamilyIds([])
            setReferenceIds([])
        }
    }

    console.log(`[GenerateClient] Render actual. initialTemplateId: ${initialTemplateId}, selectedTemplateId: ${selectedTemplateId}`)

    return (
        <div className="flex flex-col gap-6">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="w-full lg:w-auto flex-1">
                    {!isExternalSource ? (
                        <GenerateFilters
                            families={families}
                            references={references}
                            familyIds={familyIds}
                            referenceIds={referenceIds}
                            onChange={handleFilterChange}
                        />
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500 font-medium px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md ring-1 ring-indigo-200">Dataset Externo (No aplica filtros de Familia)</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto mt-3 lg:mt-0">
                    <TemplatePicker
                        templates={templates}
                        selectedTemplateId={selectedTemplateId}
                        onSelect={handleTemplateChange}
                    />
                </div>
            </div>

            {/* Selected template info */}
            {selectedTemplate && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 px-1">
                    <span>Plantilla activa:</span>
                    <Badge variant="outline" className="font-medium text-indigo-600 border-indigo-200 bg-indigo-50">
                        {selectedTemplate.name}
                    </Badge>
                    <span className="text-slate-400">·</span>
                    <span>{selectedTemplate.width_mm}×{selectedTemplate.height_mm}mm</span>
                    <span className="text-slate-400">·</span>
                    <span className="capitalize">{selectedTemplate.document_type}</span>
                </div>
            )}

            {/* Tabla de productos */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Empty state */}
                {!hasFilter ? (
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
                        products={products}
                        missingFieldsByProduct={missingFieldsByProduct}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        templateId={selectedTemplateId}
                    />
                )}
            </div>

            {/* Advertencias para la selección actual */}
            {selectedIds.length > 0 && hasWarnings && (
                <ValidationWarnings warnings={warnings} />
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
                                        {warnings.filter(w => w.missingFields.length > 0).length} con datos incompletos
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
                                disabled={!selectedTemplate}
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
                            onClose={() => setShowBulkExport(false)}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
