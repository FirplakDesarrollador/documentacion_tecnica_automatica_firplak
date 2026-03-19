'use client'

import { useState, useCallback } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Eye, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

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
    ref_code: string | null
    [key: string]: any
}

interface GenerateProductTableProps {
    products: GenerateProduct[]
    missingFieldsByProduct?: Record<string, string[]>
    onSelectionChange: (selected: string[]) => void
    selectedIds: string[]
    templateId: string | null
}

export function GenerateProductTable({
    products,
    missingFieldsByProduct = {},
    onSelectionChange,
    selectedIds,
    templateId,
}: GenerateProductTableProps) {
    const allSelected = products.length > 0 && products.every(p => selectedIds.includes(p.id))
    const someSelected = products.some(p => selectedIds.includes(p.id))

    const toggleAll = useCallback(() => {
        if (allSelected) {
            onSelectionChange([])
        } else {
            onSelectionChange(products.map(p => p.id))
        }
    }, [allSelected, products, onSelectionChange])

    const toggleOne = useCallback((id: string) => {
        if (selectedIds.includes(id)) {
            onSelectionChange(selectedIds.filter(s => s !== id))
        } else {
            onSelectionChange([...selectedIds, id])
        }
    }, [selectedIds, onSelectionChange])

    const statusLabel = (status: string) => {
        if (status === 'ready') return 'Listo'
        if (status === 'needs_review') return 'Revisar'
        return 'Incompleto'
    }

    const statusVariant = (status: string): 'default' | 'destructive' | 'secondary' => {
        if (status === 'ready') return 'default'
        if (status === 'needs_review') return 'destructive'
        return 'secondary'
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
        <Table>
            <TableHeader>
                <TableRow className="bg-slate-50/80">
                    <TableHead className="w-10">
                        <Checkbox
                            checked={(allSelected ? true : someSelected ? 'indeterminate' : false) as any}
                            onCheckedChange={toggleAll}
                            aria-label="Seleccionar todos"
                        />
                    </TableHead>
                    <TableHead className="w-[140px]">Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-[120px]">Color</TableHead>
                    <TableHead className="w-[130px]">Estado</TableHead>
                    {templateId && <TableHead className="w-[120px]">Plantilla</TableHead>}
                    <TableHead className="text-right w-[120px]">Acción</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {products.map((product) => {
                    const missing = missingFieldsByProduct[product.id] || []
                    const hasMissing = missing.length > 0
                    const isSelected = selectedIds.includes(product.id)

                    return (
                        <TableRow
                            key={product.id}
                            className={`transition-colors ${isSelected ? 'bg-indigo-50/60 hover:bg-indigo-50' : 'hover:bg-slate-50/60'}`}
                        >
                            <TableCell>
                                <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleOne(product.id)}
                                    aria-label={`Seleccionar ${product.code}`}
                                />
                            </TableCell>
                            <TableCell className="font-mono font-semibold text-slate-800 text-sm">
                                {product.code}
                            </TableCell>
                            <TableCell className="text-slate-600 text-sm">
                                {product.final_name_es || <span className="text-slate-400 italic">Sin nombre</span>}
                            </TableCell>
                            <TableCell className="text-slate-500 text-xs font-medium uppercase">
                                {product.color_name || product.color_code || '—'}
                            </TableCell>
                            <TableCell>
                                <Badge variant={statusVariant(product.validation_status)} className="text-xs">
                                    {statusLabel(product.validation_status)}
                                </Badge>
                            </TableCell>
                            {templateId && (
                                <TableCell>
                                    {hasMissing ? (
                                        <div className="flex items-center gap-1 text-amber-600 text-xs bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 w-fit">
                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                            <span>{missing.length} campo(s)</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 text-green-600 text-xs bg-green-50 border border-green-200 rounded-full px-2 py-0.5 w-fit">
                                            <span>✓ Completo</span>
                                        </div>
                                    )}
                                </TableCell>
                            )}
                            <TableCell className="text-right">
                                <Link
                                    href={`/generate/${product.id}${templateId ? `?template_id=${templateId}` : ''}`}
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
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
}
