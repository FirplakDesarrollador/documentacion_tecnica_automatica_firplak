'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { massUpdateProducts } from '../actions'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react'
import Link from 'next/link'

interface Product {
    id: string
    code: string
    familia_code: string | null
    ref_code: string | null
    furniture_name: string | null
    edge_2mm_flag: boolean
    rh_flag: boolean
    assembled_flag: boolean
    commercial_measure: string | null
    accessory_text: string | null
    validation_status: string
    sap_description: string | null
    line: string | null
    zone_text: string | null
    color_code: string | null
    width_cm: number | null
    depth_cm: number | null
    height_cm: number | null
}

import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'

interface MassEditClientProps {
    products: Product[]
    families: { value: string, label: string }[]
}

export function MassEditClient({ products: initialProducts, families }: MassEditClientProps) {
    const [products, setProducts] = useState<Product[]>(initialProducts)
    const [filterFamily, setFilterFamily] = useState<string[]>([])
    const [filterRef, setFilterRef] = useState<string[]>([])
    const [filterMeasure, setFilterMeasure] = useState<string[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Batch update state
    const [batchUpdates, setBatchUpdates] = useState({
        edge_2mm_flag: false,
        rh_flag: false,
        assembled_flag: false,
        validation_status: '',
    })

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchFam = filterFamily.length === 0 || (p.familia_code && filterFamily.includes(p.familia_code))
            const matchRef = filterRef.length === 0 || (p.ref_code && filterRef.includes(p.ref_code))
            const matchMeas = filterMeasure.length === 0 || (p.commercial_measure && filterMeasure.includes(p.commercial_measure))
            return matchFam && matchRef && matchMeas
        })
    }, [products, filterRef, filterFamily, filterMeasure])

    const references = useMemo(() => {
        if (filterFamily.length === 0) return []
        const availableProducts = products.filter(p => p.familia_code && filterFamily.includes(p.familia_code))
        const uniqueRefs = new Map<string, string>()
        availableProducts.forEach(p => {
            if (p.ref_code) uniqueRefs.set(p.ref_code, p.furniture_name || '')
        })
        return Array.from(uniqueRefs.entries()).map(([value, label]) => ({
            value,
            label: `${value} - ${label}`
        })).sort((a, b) => a.value.localeCompare(b.value))
    }, [products, filterFamily])

    const measures = useMemo(() => {
        if (filterFamily.length === 0) return []
        const availableProducts = products.filter(p => {
            const matchFam = filterFamily.includes(p.familia_code || '')
            // Note: User says measures should not depend on references:
            // "El filtro de medidas no se condiciona a que haya o no opciones en las referencias."
            return matchFam
        })
        return Array.from(new Set(availableProducts.map(p => p.commercial_measure).filter(Boolean))) as string[]
    }, [products, filterFamily])

    const handleFamilyChange = (vals: string[]) => {
        setFilterFamily(vals)
        if (vals.length === 0) {
            setFilterRef([])
            setFilterMeasure([])
        } else {
            setFilterRef([])
            setFilterMeasure([])
        }
    }

    const handleReferenceChange = (vals: string[]) => {
        setFilterRef(vals)
        setFilterMeasure([])
    }

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(filteredProducts.map(p => p.id)))
        } else {
            setSelectedIds(new Set())
        }
    }

    const handleSelectOne = (id: string, checked: boolean) => {
        const newSet = new Set(selectedIds)
        if (checked) newSet.add(id)
        else newSet.delete(id)
        setSelectedIds(newSet)
    }

    const handleApplyBatchUpdate = async () => {
        if (selectedIds.size === 0) {
            toast.error("Selecciona al menos un producto para actualizar")
            return
        }

        const idsArray = Array.from(selectedIds)
        const updates: any = {}

        // Only apply fields that the user intentionally wants to set
        // For checkboxes, we need a way to say "don't change" or "set true/false"
        // Let's assume if it's checked here, we set it. We'll add intermediate states or just simple overrides.
        // For MVP, we pass the current state of batchUpdates.
        updates.edge_2mm_flag = batchUpdates.edge_2mm_flag
        updates.rh_flag = batchUpdates.rh_flag
        updates.assembled_flag = batchUpdates.assembled_flag
        if (batchUpdates.validation_status) {
            updates.validation_status = batchUpdates.validation_status
        }

        try {
            await massUpdateProducts(idsArray, updates)

            // Update local state
            setProducts(prev => prev.map(p =>
                idsArray.includes(p.id) ? { ...p, ...updates } : p
            ))

            toast.success(`Se actualizaron ${idsArray.length} productos correctamente`)
            setSelectedIds(new Set()) // clear selection
        } catch (error) {
            console.error(error)
            toast.error("Error al actualizar productos")
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
                <Link href="/products">
                    <Button variant="outline" size="icon" type="button">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Verificación y Edición Masiva</h1>
                    <p className="text-muted-foreground">Filtra y aplica cambios a múltiples atributos simultáneamente.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

                {/* Panel lateral de controles */}
                <div className="md:col-span-1 flex flex-col gap-6">
                    <div className="p-4 border rounded-md bg-white">
                        <h3 className="font-semibold mb-4">Filtros</h3>
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <Label>Familia</Label>
                                <MultiSelectSearchField
                                    options={families}
                                    values={filterFamily}
                                    onChange={handleFamilyChange}
                                    placeholder="Familia"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Referencia</Label>
                                <MultiSelectSearchField
                                    options={references}
                                    values={filterRef}
                                    onChange={handleReferenceChange}
                                    placeholder="Referencia"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Medida</Label>
                                <MultiSelectSearchField
                                    options={measures.map(m => ({ value: m, label: m }))}
                                    values={filterMeasure}
                                    onChange={setFilterMeasure}
                                    placeholder="Medida"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border rounded-md bg-blue-50 border-blue-200">
                        <h3 className="font-semibold mb-2 text-blue-900">Acciones Globales</h3>
                        <p className="text-sm text-blue-800/80 mb-4">Aplicar a {selectedIds.size} seleccionados</p>

                        <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="batch_edge"
                                    checked={batchUpdates.edge_2mm_flag}
                                    onCheckedChange={(c) => setBatchUpdates(p => ({ ...p, edge_2mm_flag: !!c }))}
                                />
                                <Label htmlFor="batch_edge">Aplicar Canto 2mm</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="batch_rh"
                                    checked={batchUpdates.rh_flag}
                                    onCheckedChange={(c) => setBatchUpdates(p => ({ ...p, rh_flag: !!c }))}
                                />
                                <Label htmlFor="batch_rh">Marcar como RH</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="batch_assembled"
                                    checked={batchUpdates.assembled_flag}
                                    onCheckedChange={(c) => setBatchUpdates(p => ({ ...p, assembled_flag: !!c }))}
                                />
                                <Label htmlFor="batch_assembled">Marcar Armado</Label>
                            </div>

                            <div className="grid gap-2 pt-2 border-t border-blue-200/50">
                                <Label>Estado de Validación</Label>
                                <select
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors cursor-pointer"
                                    value={batchUpdates.validation_status}
                                    onChange={(e) => setBatchUpdates(p => ({ ...p, validation_status: e.target.value }))}
                                >
                                    <option value="">(No cambiar)</option>
                                    <option value="incomplete">Incompleto</option>
                                    <option value="needs_review">Revisar</option>
                                    <option value="ready">Listo</option>
                                </select>
                            </div>

                            <Button
                                onClick={handleApplyBatchUpdate}
                                disabled={selectedIds.size === 0}
                                className="w-full mt-2"
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Aplicar Cambios
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Tabla de resultados */}
                <div className="md:col-span-3 border rounded-md bg-white overflow-hidden flex flex-col h-[70vh]">
                    <div className="overflow-y-auto flex-1">
                        <Table>
                            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                                <TableRow>
                                    <TableHead className="w-12 text-center">
                                        <Checkbox
                                            checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                                            onCheckedChange={(c) => handleSelectAll(!!c)}
                                        />
                                    </TableHead>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Descripción SAP</TableHead>
                                    <TableHead>Línea / Zona</TableHead>
                                    <TableHead className="whitespace-nowrap">Color</TableHead>
                                    <TableHead className="whitespace-nowrap">WxDxH (cm)</TableHead>
                                    <TableHead>Medida / Ref</TableHead>
                                    <TableHead className="text-center">Canto 2mm</TableHead>
                                    <TableHead className="text-center">RH</TableHead>
                                    <TableHead className="text-center">Armado</TableHead>
                                    <TableHead>Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredProducts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            No se encontraron productos con estos filtros.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredProducts.map(p => (
                                        <TableRow key={p.id} className={selectedIds.has(p.id) ? 'bg-blue-50/50' : ''}>
                                            <TableCell className="text-center">
                                                <Checkbox
                                                    checked={selectedIds.has(p.id)}
                                                    onCheckedChange={(c) => handleSelectOne(p.id, !!c)}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium text-xs font-mono">{p.code}</TableCell>
                                            <TableCell className="text-xs max-w-[200px] truncate" title={p.sap_description || ''}>
                                                {p.sap_description || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                <div className="flex flex-col">
                                                    <span>{p.line || '-'}</span>
                                                    <span className="text-muted-foreground">{p.zone_text || '-'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {p.color_code || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">
                                                {p.width_cm || p.depth_cm || p.height_cm ? `${p.width_cm||'-'} x ${p.depth_cm||'-'} x ${p.height_cm||'-'}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                <div className="flex flex-col">
                                                    <span>{p.commercial_measure || '-'}</span>
                                                    <span className="text-xs text-muted-foreground">{p.ref_code || '-'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {p.edge_2mm_flag ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700">Sí</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {p.rh_flag ? <Badge variant="outline" className="bg-blue-50 text-blue-700">Sí</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {p.assembled_flag ? <Badge variant="outline" className="bg-purple-50 text-purple-700">Sí</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        p.validation_status === 'ready'
                                                            ? 'default'
                                                            : p.validation_status === 'needs_review'
                                                                ? 'destructive'
                                                                : 'secondary'
                                                    }
                                                >
                                                    {p.validation_status === 'incomplete' ? 'Incompleto' :
                                                        p.validation_status === 'needs_review' ? 'Revisar' : 'Listo'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="p-2 bg-muted/30 border-t text-xs text-muted-foreground text-right">
                        Mostrando {filteredProducts.length} productos
                    </div>
                </div>

            </div>
        </div>
    )
}
