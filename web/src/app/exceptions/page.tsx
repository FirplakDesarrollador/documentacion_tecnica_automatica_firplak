import { dbQuery } from '@/lib/supabase'
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
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { AlertCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { getFullValidationSweep } from '@/lib/engine/validationActions'

export default async function ExceptionsPage() {
    const validationSummary = await getFullValidationSweep()
    const exceptionalProducts = validationSummary.details

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                        <div className="p-2 bg-rose-50 rounded-lg text-rose-500 ring-1 ring-rose-500/20">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                        Bandeja de Excepciones
                    </h1>
                    <p className="text-slate-500 mt-2 text-sm max-w-2xl leading-relaxed">
                        Productos con inconsistencias o falta de datos críticos detectados por el motor de validación.
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50 text-slate-500">
                        <TableRow>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold">Producto / Código</TableHead>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold">Estado de Validación</TableHead>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold">Atributos Faltantes</TableHead>
                            <TableHead className="text-right uppercase tracking-wider text-[10px] font-bold">Acción</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {exceptionalProducts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-green-600 font-medium">
                                    ¡Todos los productos están listos para la generación de documentos!
                                </TableCell>
                            </TableRow>
                        ) : (
                            exceptionalProducts.map(({ productId, productCode, productName, issues }: any) => (
                                <TableRow key={productId}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-900">{productCode}</span>
                                            <span className="text-[10px] text-slate-500 truncate max-w-[200px]">{productName}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {!issues.isValid ? (
                                            <Badge className="bg-rose-50 text-rose-700 ring-1 ring-rose-700/10 hover:bg-rose-50 text-[10px] px-2 py-0.5 font-bold uppercase tracking-tight">Crítico</Badge>
                                        ) : (
                                            <Badge className="bg-amber-50 text-amber-700 ring-1 ring-amber-700/10 hover:bg-amber-50 text-[10px] px-2 py-0.5 font-bold uppercase tracking-tight">Advertencia</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {issues.missingFields.map((f: string) => (
                                                <Badge key={f} className="text-[9px] font-bold border-none bg-slate-100 text-slate-600 px-1.5 py-0 uppercase tracking-tighter">
                                                    {f === 'isometric' ? 'Falta Isométrico' : f.replace(/_/g, ' ')}
                                                </Badge>
                                            ))}
                                            {issues.warnings.map((w: string) => (
                                                <span key={w} className="text-[10px] text-amber-600 font-medium italic">⚠️ {w}</span>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Link 
                                            href={`/products/${productId}`} 
                                            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), "flex items-center gap-1 text-blue-600")}
                                        >
                                            Corregir <ArrowRight className="w-4 h-4" />
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
