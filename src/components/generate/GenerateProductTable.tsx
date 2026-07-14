'use client'

import { useCallback, useMemo } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Eye } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { isCatalogScope, type CatalogScope } from '@/lib/templates/catalogScope'

export interface GenerateProduct {
    id: string
    code: string
    final_name_es: string | null
    product_type: string | null
    validation_status: string
    familia_code: string | null
    isometric_asset_id: string | null
    barcode_text: string | null
    commercial_measure: string | null
    weight_kg: number | null
    width_cm: number | null
    depth_cm: number | null
    height_cm: number | null
    color_code: string | null
    color_name: string | null
    effective_status?: string
    is_exportable?: boolean
    inactive_reasons?: string[]
    ref_code: string | null
    catalog_scope?: CatalogScope
    catalog_target_id?: string
    [key: string]: unknown
}

interface GenerateProductTableProps {
    products: GenerateProduct[]
    missingFieldsByProduct?: Record<string, string[]>
    onSelectionChange: (selected: string[]) => void
    selectedIds: string[]
    templateId?: string | null
    isExternalSource?: boolean
    hideActions?: boolean
}

export function GenerateProductTable({
    products,
    missingFieldsByProduct: _missingFieldsByProduct = {},
    onSelectionChange,
    selectedIds,
    templateId: _templateId,
    isExternalSource = false,
    hideActions = false,
}: GenerateProductTableProps) {
    void _missingFieldsByProduct
    void _templateId
    const exportableProducts = products.filter(p => p.is_exportable !== false)
    const allSelected = exportableProducts.length > 0 && exportableProducts.every(p => selectedIds.includes(p.id))
    const someSelected = products.some(p => selectedIds.includes(p.id))

    const dynamicColumns = useMemo(() => {
        if (!isExternalSource || !products.length) return []
        
        // Campos que ya mostramos en columnas fijas o que son metadatos internos
        const excludeBase = [
            'id', 'validation_status', 'code', 'final_name_es', 
            'status', 'is_external', 'created_at', 'updated_at', 
            'dataset_id', 'color_name', 'color_code', 'product_type',
            'sap_description', 'codigo', 'nombre', 'sku'
        ]
        
        // Normalizar exclusión (case-insensitive)
        const excludeLower = excludeBase.map(e => e.toLowerCase())
        
        return Object.keys(products[0]).filter(k => {
            const kl = k.toLowerCase()
            return !excludeLower.includes(kl)
        })
    }, [isExternalSource, products])

    const toggleAll = useCallback(() => {
        if (allSelected) {
            onSelectionChange(selectedIds.filter(id => !exportableProducts.some(p => p.id === id)))
        } else {
            onSelectionChange(Array.from(new Set([...selectedIds, ...exportableProducts.map(p => p.id)])))
        }
    }, [allSelected, exportableProducts, onSelectionChange, selectedIds])

    const toggleOne = useCallback((id: string) => {
        if (selectedIds.includes(id)) {
            onSelectionChange(selectedIds.filter(s => s !== id))
        } else {
            onSelectionChange([...selectedIds, id])
        }
    }, [selectedIds, onSelectionChange])

    const searchParams = useSearchParams()
    const catalogScope = products.find((product) => isCatalogScope(product.catalog_scope))?.catalog_scope
    const detailLabel = catalogScope === 'family'
        ? 'Tipo'
        : catalogScope === 'reference'
            ? 'Familia'
            : catalogScope === 'version'
                ? 'Referencia'
                : 'Color'

    const getDetail = (product: GenerateProduct) => {
        if (catalogScope === 'family') return product.product_type || '—'
        if (catalogScope === 'reference') return product.familia_code || '—'
        if (catalogScope === 'version') return product.ref_code || '—'
        return product.color_name || product.color_code || '—'
    }

    const getPreviewHref = (product: GenerateProduct) => {
        const params = new URLSearchParams(searchParams.toString())
        const scope = !isExternalSource && isCatalogScope(product.catalog_scope)
            ? product.catalog_scope
            : null
        const targetId = scope ? product.catalog_target_id || product.id : product.id

        if (scope) {
            params.set('scope', scope)
            params.set('target', targetId)
        } else {
            params.delete('scope')
            params.delete('target')
        }

        const query = params.toString()
        return `/generate/${encodeURIComponent(targetId)}${query ? `?${query}` : ''}`
    }

    if (products.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                    <Eye className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium">No se encontraron productos</p>
                <p className="text-slate-400 text-sm mt-1">Ajusta los filtros para ver resultados</p>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
        <Table>
            <TableHeader>
                <TableRow className="bg-slate-50/80">
                    <TableHead className="w-10">
                        <Checkbox
                            checked={allSelected ? true : someSelected ? ('indeterminate' as unknown as boolean) : false}
                            onCheckedChange={toggleAll}
                            aria-label="Seleccionar todos"
                        />
                    </TableHead>
                    <TableHead className="w-[140px]">Código</TableHead>
                    <TableHead className="min-w-[200px]">Nombre / Descripción</TableHead>
                    
                    {/* Renderizado dinámico de columnas para datasets externos */}
                    {isExternalSource ? (
                        dynamicColumns.map(col => (
                            <TableHead key={col} className="capitalize">{col.replace(/_/g, ' ')}</TableHead>
                        ))
                    ) : (
                        <TableHead className="w-[120px]">{detailLabel}</TableHead>
                    )}

                    {!hideActions && <TableHead className="text-right w-[120px]">Acción</TableHead>}
                </TableRow>
            </TableHeader>
            <TableBody>
                {products.map((product) => {
                    const isSelected = selectedIds.includes(product.id)
                    const isInactive = product.is_exportable === false
                    const inactiveReasons = product.inactive_reasons || []

                    return (
                        <TableRow
                            key={product.id}
                            className={cn(
                                'transition-colors',
                                isInactive
                                    ? 'bg-rose-50/60 text-slate-500 opacity-75 hover:bg-rose-50'
                                    : isSelected
                                        ? 'bg-indigo-50/60 hover:bg-indigo-50'
                                        : 'hover:bg-slate-50/60'
                            )}
                            title={inactiveReasons.join(', ') || undefined}
                        >
                            <TableCell>
                                <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleOne(product.id)}
                                    disabled={isInactive}
                                    aria-label={`Seleccionar ${product.code}`}
                                />
                            </TableCell>
                            <TableCell className="font-mono font-semibold text-slate-800 text-sm">
                                {product.code}
                            </TableCell>
                            <TableCell className="text-slate-600 text-sm whitespace-normal break-words max-w-sm">
                                {product.final_name_es || <span className="text-slate-400 italic">Sin nombre</span>}
                            </TableCell>
                            
                            {/* Celdas dinámicas o celda de color fija */}
                            {isExternalSource ? (
                                dynamicColumns.map(col => (
                                    <TableCell key={col} className="text-slate-500 text-xs">
                                        {String(product[col] ?? '—')}
                                    </TableCell>
                                ))
                            ) : (
                                <TableCell className="text-slate-500 text-xs font-medium uppercase">
                                    {getDetail(product)}
                                </TableCell>
                            )}


                            {!hideActions && (
                                <TableCell className="text-right">
                                    <Link
                                        href={getPreviewHref(product)}
                                    >
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                        >
                                            <Eye className="w-3.5 h-3.5 mr-1.5" />
                                            Preview
                                        </Button>
                                    </Link>
                                </TableCell>
                            )}
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
        </div>
    )
}
