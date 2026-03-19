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
    const products = await dbQuery(`SELECT * FROM public.products ORDER BY updated_at DESC`) || []
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
                    <h1 className="text-3xl font-bold tracking-tight text-red-600 flex items-center gap-2">
                        <AlertCircle className="w-8 h-8" />
                        Bandeja de Excepciones
                    </h1>
                    <p className="text-muted-foreground">
                        Productos a los que les faltan datos requeridos para la generación de documentos.
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Estado de Validación</TableHead>
                            <TableHead>Campos Faltantes</TableHead>
                            <TableHead className="text-right">Acción</TableHead>
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
                                    <TableCell className="font-medium">{product.code}</TableCell>
                                    <TableCell>
                                        {!issues.isValid ? (
                                            <Badge variant="destructive">Necesita Revisión</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Advertencia</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-1 flex-wrap">
                                            {issues.missingFields.map((f: string) => (
                                                <Badge key={f} variant="outline" className="text-xs border-red-200 text-red-600 bg-red-50">{f}</Badge>
                                            ))}
                                            {issues.warnings.map((w: string) => (
                                                <span key={w} className="text-xs text-yellow-600">{w}</span>
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
