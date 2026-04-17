import { dbQuery } from '@/lib/supabase'
import { getFamilyFilters, getReferenceFilters } from '@/lib/data/filters'
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
import { PlusCircle, DatabaseZap, Search } from 'lucide-react'
import Link from 'next/link'
import { ImportCsvButton } from '@/components/products/ImportCsvButton'
import { ProductSearch } from '@/components/products/ProductSearch'
import { cn } from '@/lib/utils'

export default async function ProductsPage({
    searchParams: searchParamsPromise
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const searchParams = await searchParamsPromise

    const toArray = (val: string | string[] | undefined) => {
        if (!val) return []
        if (Array.isArray(val)) return val
        return [val]
    }

    const f = toArray(searchParams?.f)
    const r = toArray(searchParams?.r)
    const m = toArray(searchParams?.m)

    // Construct query string for persistence
    const urlParams = new URLSearchParams()
    f.forEach(v => urlParams.append('f', v))
    r.forEach(v => urlParams.append('r', v))
    m.forEach(v => urlParams.append('m', v))
    const filterQuery = urlParams.toString() ? `?${urlParams.toString()}` : ''

    const hasFilter = f.length > 0 || r.length > 0 || m.length > 0

    let products: any[] = []
    if (hasFilter) {
        const conditions: string[] = []
        if (f.length > 0) conditions.push(`familia_code IN (${f.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        if (r.length > 0) conditions.push(`ref_code IN (${r.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        if (m.length > 0) conditions.push(`commercial_measure IN (${m.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        const where = conditions.length > 0 ? `WHERE status = 'ACTIVO' AND ${conditions.join(' AND ')}` : "WHERE status = 'ACTIVO'"
        products = await dbQuery(
            `SELECT p.*, c.name_color_sap as color_name
             FROM public.cabinet_products p
             LEFT JOIN public.colors c ON p.color_code = c.code_4dig
             ${where} ORDER BY p.updated_at DESC LIMIT 100`
        ) || []
    }

    // --- Filtros centralizados (src/lib/data/filters.ts) ---
    // Para modificar cómo se obtienen familias o referencias, edita ese módulo.
    const families = await getFamilyFilters()
    const references = await getReferenceFilters(f)

    // Medidas integradas en referencias — no se exponen como filtro separado.

    const hasFilterMsg = !hasFilter ? (
        <TableRow>
            <TableCell colSpan={7} className="h-[400px] text-center">
                <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                        <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">Encuentra tus productos</h3>
                    <p className="text-sm text-slate-500 text-center leading-relaxed">
                        Selecciona una <b>Familia</b>, <b>Referencia con su medida</b> en la barra superior para empezar a explorar y gestionar el catálogo técnico.
                    </p>
                </div>
            </TableCell>
        </TableRow>
    ) : products.length === 0 ? (
        <TableRow>
            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                No se encontraron productos para los filtros seleccionados.
            </TableCell>
        </TableRow>
    ) : null

    return (
        <div className="flex flex-col gap-8 text-foreground pb-10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Productos</h1>
                    <p className="text-slate-500 mt-1">
                        Administra y consolida la base de datos maestra de etiquetas.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
                    <ImportCsvButton />
                    <Link href="/families">
                        <Button variant="outline" className="w-full sm:w-auto border-slate-200 text-slate-600 hover:bg-slate-50">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Familias
                        </Button>
                    </Link>
                    <Link href="/products/mass-edit">
                        <Button variant="secondary" className="w-full sm:w-auto">
                            <DatabaseZap className="mr-2 h-4 w-4 text-indigo-500" />
                            Cambios masivos
                        </Button>
                    </Link>
                    <Link href={`/products/new${filterQuery}`}>
                        <Button className="w-full sm:w-auto shadow-sm">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Agregar Producto
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-col gap-6">
                
                {/* Filters & Actions Toolbar */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-soft">
                    <ProductSearch families={families} references={references} />
                </div>

                {/* Data Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-premium overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50/50">
                            <TableRow>
                                <TableHead className="w-[140px] uppercase tracking-wider text-[10px] font-bold text-slate-500">Código</TableHead>
                                <TableHead className="min-w-[200px] uppercase tracking-wider text-[10px] font-bold text-slate-500">Descripción SAP</TableHead>
                                <TableHead className="min-w-[200px] uppercase tracking-wider text-[10px] font-bold text-slate-500">Nombre Final (ES)</TableHead>
                                <TableHead className="min-w-[200px] uppercase tracking-wider text-[10px] font-bold text-slate-500">Nombre Final (EN)</TableHead>
                                <TableHead className="w-[120px] uppercase tracking-wider text-[10px] font-bold text-slate-500">Color</TableHead>
                                <TableHead className="w-[130px] uppercase tracking-wider text-[10px] font-bold text-slate-500">Estado</TableHead>
                                <TableHead className="text-right w-[100px] uppercase tracking-wider text-[10px] font-bold text-slate-500">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {hasFilterMsg || products.map((product) => (
                                <TableRow key={product.id}>
                                    <TableCell className="font-medium text-slate-900">{product.code}</TableCell>
                                    <TableCell className="text-slate-500 text-xs truncate max-w-[200px]" title={product.sap_description || ''}>
                                        {product.sap_description || '-'}
                                    </TableCell>
                                    <TableCell className="text-slate-600 font-medium">{product.final_name_es || '-'}</TableCell>
                                    <TableCell className="text-slate-500 italic text-sm">
                                        {product.final_name_en || <span className="opacity-50">Pendiente</span>}
                                    </TableCell>
                                    <TableCell className="text-slate-500 text-sm uppercase">
                                        {product.color_name || product.color_code || '-'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            className={cn(
                                                "text-[10px] px-2 py-0.5 font-semibold uppercase tracking-tight ring-1 ring-inset",
                                                product.validation_status === 'ready'
                                                    ? "bg-indigo-50 text-indigo-700 ring-indigo-700/10 hover:bg-indigo-50"
                                                    : product.validation_status === 'needs_review'
                                                        ? "bg-rose-50 text-rose-700 ring-rose-700/10 hover:bg-rose-50"
                                                        : "bg-slate-50 text-slate-600 ring-slate-600/10 hover:bg-slate-50"
                                            )}
                                        >
                                            {product.validation_status === 'incomplete' ? 'Incompleto' :
                                                product.validation_status === 'needs_review' ? 'Revisar' : 'Listo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Link href={`/products/${product.id}${filterQuery}`}>
                                            <Button variant="ghost" size="sm" className="font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">Editar</Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    )
}
