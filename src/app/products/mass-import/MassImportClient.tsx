'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { executeMassImportAction } from '../actions'
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'

export function MassImportClient() {
    const [file, setFile] = useState<File | null>(null)
    const [parsedData, setParsedData] = useState<any[]>([])
    const [isParsing, setIsParsing] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [importResult, setImportResult] = useState<any>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0]
        if (selected) {
            setFile(selected)
            setParsedData([])
            setImportResult(null)
        }
    }

    const handleParse = () => {
        if (!file) return
        setIsParsing(true)
        
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data as any[]
                // Filtrar solo los que son para CREAR y PENDIENTE
                const toCreate = data.filter(r => 
                    r.import_action === 'CREAR' && 
                    r.existing_in_supabase === 'NO' &&
                    r.validation_status === 'PENDIENTE'
                )
                
                // Mapear al payload que espera el RPC
                const payload = toCreate.map(r => {
                    const refAttrs: any = {}
                    if (r.RH === 'TRUE' || r.RH === 'true') refAttrs.rh = true
                    if (r.CARB2 === 'TRUE' || r.CARB2 === 'true') refAttrs.carb2 = true
                    if (r.PUR === 'TRUE' || r.PUR === 'true') refAttrs.pur = true
                    // Se pueden extraer dinámicamente los REF_ATTR_...
                    Object.keys(r).forEach(k => {
                        if (k.startsWith('REF_ATTR_') && r[k]) {
                            const attrKey = k.replace('REF_ATTR_', '')
                            refAttrs[attrKey] = r[k] === 'true' ? true : (r[k] === 'false' ? false : r[k])
                        }
                    })

                    const verAttrs: any = {}
                    Object.keys(r).forEach(k => {
                        if (k.startsWith('VERSION_ATTR_') && r[k]) {
                            const attrKey = k.replace('VERSION_ATTR_', '')
                            verAttrs[attrKey] = r[k] === 'true' ? true : (r[k] === 'false' ? false : r[k])
                        }
                    })

                    return {
                        sku_complete: r.SKU_COMPLETE,
                        family_code: r.FAMILY_CODE,
                        reference_code: r.REF_CODE,
                        version_code: r.VERSION_CODE,
                        color_code: r.COLOR_CODE,
                        sap_description_original: r.SAP_DESCRIPTION,
                        product_name: r.PRODUCT_NAME || '',
                        designation: r.DESIGNATION || '',
                        product_type: r.PRODUCT_TYPE || '',
                        width_cm: parseFloat(r.WIDTH_CM) || 0,
                        depth_cm: parseFloat(r.DEPTH_CM) || 0,
                        height_cm: parseFloat(r.HEIGHT_CM) || 0,
                        weight_kg: parseFloat(r.WEIGHT_KG) || 0,
                        ref_attrs: refAttrs,
                        version_attrs: verAttrs
                    }
                })

                setParsedData(payload)
                setIsParsing(false)
                toast.success(`Leídos ${toCreate.length} registros listos para importar.`)
            },
            error: (error) => {
                console.error(error)
                toast.error('Error al parsear el archivo.')
                setIsParsing(false)
            }
        })
    }

    const handleImport = async () => {
        if (parsedData.length === 0) return
        
        setIsImporting(true)
        try {
            const res = await executeMassImportAction(parsedData)
            if (res.success) {
                setImportResult(res.data?.[0]?.bulk_import_products || { success: true })
                toast.success('Importación completada correctamente.')
            } else {
                toast.error('Error en la importación: ' + res.error)
            }
        } catch (e: any) {
            toast.error('Ocurrió un error inesperado.')
        } finally {
            setIsImporting(false)
        }
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 shadow-sm h-fit">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-blue-500" />
                        Subir Archivo
                    </CardTitle>
                    <CardDescription>
                        Selecciona el archivo CSV de trabajo con los datos completados por el equipo.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                    </div>
                    {file && (
                        <Button 
                            onClick={handleParse} 
                            disabled={isParsing} 
                            className="w-full"
                        >
                            {isParsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                            Analizar Datos
                        </Button>
                    )}
                </CardContent>
            </Card>

            <Card className="md:col-span-2 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Previsualización (Dry Run)
                        {parsedData.length > 0 && (
                            <Badge variant="secondary" className="ml-auto">
                                {parsedData.length} a crear
                            </Badge>
                        )}
                    </CardTitle>
                    <CardDescription>
                        Revisa los datos antes de ejecutar la inserción en la base de datos. Solo se procesarán filas con estado CREAR.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {parsedData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-gray-50/50">
                            <FileText className="w-10 h-10 mb-4 text-gray-400" />
                            <p>Sube y analiza un archivo para previsualizar los registros aquí.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <ScrollArea className="h-[300px] w-full rounded-md border">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">SKU Completo</th>
                                            <th className="px-4 py-2 font-medium">Familia</th>
                                            <th className="px-4 py-2 font-medium">Referencia</th>
                                            <th className="px-4 py-2 font-medium">Dimensiones</th>
                                            <th className="px-4 py-2 font-medium">Atributos</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {parsedData.map((row, i) => (
                                            <tr key={i} className="hover:bg-gray-50/50">
                                                <td className="px-4 py-2 font-mono text-xs">{row.sku_complete}</td>
                                                <td className="px-4 py-2">{row.family_code}</td>
                                                <td className="px-4 py-2">{row.reference_code}</td>
                                                <td className="px-4 py-2">
                                                    {row.width_cm}x{row.depth_cm}x{row.height_cm} ({row.weight_kg}kg)
                                                </td>
                                                <td className="px-4 py-2 text-xs text-gray-500">
                                                    {JSON.stringify(row.ref_attrs)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>

                            {importResult && (
                                <div className={`p-4 rounded-md border ${importResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {importResult.success ? (
                                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                                        ) : (
                                            <XCircle className="w-5 h-5 text-red-600" />
                                        )}
                                        <h3 className={`font-medium ${importResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                            {importResult.message || 'Resultado de la operación'}
                                        </h3>
                                    </div>
                                    {importResult.success && (
                                        <ul className="text-sm text-green-700 list-disc list-inside ml-7">
                                            <li>Referencias creadas: {importResult.created_references}</li>
                                            <li>Versiones creadas: {importResult.created_versions}</li>
                                            <li>SKUs creados: {importResult.created_skus}</li>
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end gap-2 bg-gray-50/50 p-4 border-t">
                    <Button variant="outline" onClick={() => {setParsedData([]); setImportResult(null)}} disabled={parsedData.length === 0 || isImporting}>
                        Limpiar
                    </Button>
                    <Button onClick={handleImport} disabled={parsedData.length === 0 || isImporting} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                        Confirmar e Insertar en DB
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
