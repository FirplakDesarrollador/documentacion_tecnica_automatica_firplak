'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Database, Plus, Trash2, Upload } from 'lucide-react'
import type { CustomDataset } from '@/app/datasets/actions'
import { deleteDatasetAction } from '@/app/datasets/actions'
import { DatasetIngestor } from './DatasetIngestor'
import { toast } from 'sonner'

interface DatasetsClientProps {
    initialDatasets: CustomDataset[]
}

export function DatasetsClient({ initialDatasets }: DatasetsClientProps) {
    const [datasets, setDatasets] = useState<CustomDataset[]>(initialDatasets)
    const [showIngestor, setShowIngestor] = useState(false)
    const [ingestorMode, setIngestorMode] = useState<'new' | { id: string; name: string }>('new')

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`¿Eliminar la base de datos "${name}"? Esta acción también borrará todos sus registros.`)) return
        const res = await deleteDatasetAction(id)
        if (res.success) {
            setDatasets(prev => prev.filter(d => d.id !== id))
            toast.success(`Base de datos "${name}" eliminada.`)
        } else {
            toast.error('Error al eliminar: ' + res.error)
        }
    }

    const openNew = () => {
        setIngestorMode('new')
        setShowIngestor(true)
    }

    const openAdd = (ds: CustomDataset) => {
        setIngestorMode({ id: ds.id, name: ds.name })
        setShowIngestor(true)
    }

    const handleIngestDone = (updated: CustomDataset[]) => {
        setDatasets(updated)
        setShowIngestor(false)
    }

    return (
        <>
            <div className="flex justify-end">
                <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Nueva Base de Datos
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Nombre</TableHead>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Variables</TableHead>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Registros</TableHead>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Creada</TableHead>
                            <TableHead className="text-right uppercase tracking-wider text-[10px] font-bold text-slate-500">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {datasets.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-40 text-center">
                                    <div className="flex flex-col items-center gap-3 text-slate-400">
                                        <Database className="h-10 w-10 opacity-30" />
                                        <p className="text-sm">No hay bases de datos externas. Sube un CSV para comenzar.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            datasets.map(ds => (
                                <TableRow key={ds.id}>
                                    <TableCell className="font-semibold text-slate-800">{ds.name}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1 max-w-sm">
                                            {(() => {
                                                const schema = ds.schema_json as any || {}
                                                // Nueva estructura enriquecida { fieldMap, selectedColumns, columns: [...] }
                                                if (schema.columns && Array.isArray(schema.columns)) {
                                                    const cols = schema.columns.slice(0, 5)
                                                    return (
                                                        <>
                                                            {cols.map((col: any) => (
                                                                <Badge key={col.key || col.original} className="text-[10px] bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 font-mono">
                                                                    {col.label || col.key || col.original}
                                                                </Badge>
                                                            ))}
                                                            {schema.columns.length > 5 && (
                                                                <Badge className="text-[10px] bg-slate-100 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100">
                                                                    +{schema.columns.length - 5} más
                                                                </Badge>
                                                            )}
                                                        </>
                                                    )
                                                }

                                                // Estructura intermedia { fieldMap, selectedColumns }
                                                if (schema.selectedColumns && Array.isArray(schema.selectedColumns)) {
                                                    const cols = schema.selectedColumns.slice(0, 4)
                                                    return (
                                                        <>
                                                            {cols.map((col: string) => (
                                                                <Badge key={col} className="text-[10px] bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 font-mono">
                                                                    {col}
                                                                </Badge>
                                                            ))}
                                                            {schema.selectedColumns.length > 4 && (
                                                                <Badge className="text-[10px] bg-slate-100 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100">
                                                                    +{schema.selectedColumns.length - 4} más
                                                                </Badge>
                                                            )}
                                                        </>
                                                    )
                                                }
                                                // Estructura vieja (array)
                                                if (Array.isArray(schema)) {
                                                    const fields = schema.slice(0, 4)
                                                    return (
                                                        <>
                                                            {fields.map((f: any) => (
                                                                <Badge key={f.key || f} className="text-[10px] bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 font-mono">
                                                                    {f.label || f}
                                                                </Badge>
                                                            ))}
                                                            {schema.length > 4 && (
                                                                <Badge className="text-[10px] bg-slate-100 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100">
                                                                    +{schema.length - 4} más
                                                                </Badge>
                                                            )}
                                                        </>
                                                    )
                                                }
                                                return <span className="text-[10px] text-slate-400 italic">Sin variables</span>
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-bold text-slate-700">{(ds.row_count ?? 0).toLocaleString()}</span>
                                        <span className="text-xs text-slate-400 ml-1">filas</span>
                                    </TableCell>
                                    <TableCell className="text-slate-500 text-xs">
                                        {new Date(ds.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost" size="sm"
                                                className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-1 font-semibold"
                                                onClick={() => openAdd(ds)}
                                            >
                                                <Upload className="h-3.5 w-3.5" />
                                                Añadir Datos
                                            </Button>
                                            <Button
                                                variant="ghost" size="sm"
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                onClick={() => handleDelete(ds.id, ds.name)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {showIngestor && (
                <DatasetIngestor
                    mode={ingestorMode}
                    existingDatasets={datasets}
                    onClose={() => setShowIngestor(false)}
                    onDone={handleIngestDone}
                />
            )}
        </>
    )
}
