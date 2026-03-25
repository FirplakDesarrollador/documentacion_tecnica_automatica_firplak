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
import { AlertCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { validateProductReadiness } from '@/lib/engine/validator'

// MVP Mock of required template variables
const MVP_REQUIRED_TEMPLATE_ELEMENTS = [
    { id: '1', type: 'dynamic_text', x: 0, y: 0, width: 0, height: 0, dataField: 'final_name_es' },
    { id: '2', type: 'barcode', x: 0, y: 0, width: 0, height: 0, dataField: 'code' },
] as any

export default async function ExceptionsPage() {
    const products = await dbQuery(`SELECT * FROM public.cabinet_products ORDER BY updated_at DESC`) || []
    const rules = await dbQuery(`SELECT * FROM public.rules WHERE enabled = true`) || []

    // Find products that have issues
    const exceptionalProducts = products.map((p: any) => {
        const issues = validateProductReadiness(p, rules, MVP_REQUIRED_TEMPLATE_ELEMENTS)
        return { product: p, issues }
    }).filter((item: any) => !item.issues.isValid || item.issues.warnings.length > 0)

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
                            exceptionalProducts.map(({ product, issues }: any) => (
                                <TableRow key={product.id}>
                                    <TableCell className="font-semibold text-slate-900">{product.code}</TableCell>
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
                                                <Badge key={f} className="text-[9px] font-bold border-none bg-slate-100 text-slate-600 px-1.5 py-0 uppercase tracking-tighter">{f}</Badge>
                                            ))}
                                            {issues.warnings.map((w: string) => (
                                                <span key={w} className="text-[10px] text-amber-600 font-medium italic">⚠️ {w}</span>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm">
                                            <Link href={`/products/${product.id}`} className="flex items-center gap-1 text-blue-600">
                                                Corregir <ArrowRight className="w-4 h-4" />
                                            </Link>
                                        </Button>
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
