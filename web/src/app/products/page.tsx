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
import { PlusCircle, DatabaseZap, Search } from 'lucide-react'
import Link from 'next/link'
import { ImportCsvButton } from '@/components/products/ImportCsvButton'
import { ProductSearch } from '@/components/products/ProductSearch'
import { AiTranslateButton } from '@/components/products/AiTranslateButton'

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

    const hasFilter = f.length > 0 || r.length > 0 || m.length > 0

    let products: any[] = []
    if (hasFilter) {
        const conditions: string[] = []
        if (f.length > 0) conditions.push(`familia_code IN (${f.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        if (r.length > 0) conditions.push(`ref_code IN (${r.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        if (m.length > 0) conditions.push(`commercial_measure IN (${m.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        products = await dbQuery(`SELECT * FROM public.products ${where} ORDER BY updated_at DESC LIMIT 100`) || []
    }

    // Usamos familia_code directamente de products para evitar el mismatch
    // (familias.code = 'BAN05' pero products.familia_code = 'VBAN05')
    const familiaRecords = await dbQuery(
        `SELECT DISTINCT p.familia_code, f.name
         FROM public.products p
         LEFT JOIN public.familias f ON f.code = LTRIM(p.familia_code, 'V')
         WHERE p.familia_code IS NOT NULL
         ORDER BY p.familia_code ASC`
    ) || []
    const families = familiaRecords.map((fam: any) => ({
        value: fam.familia_code,
        label: fam.name ? `${fam.familia_code} - ${fam.name}` : fam.familia_code
    }))

    let references: {value: string, label: string}[] = []
    if (f.length > 0) {
        const fFilter = f.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(',')
        const refRecords = await dbQuery(`SELECT DISTINCT ref_code, furniture_name FROM public.products WHERE ref_code IS NOT NULL AND familia_code IN (${fFilter})`) || []
        references = refRecords.map((rec: any) => ({ value: rec.ref_code as string, label: `${rec.ref_code} - ${rec.furniture_name || ''}` })).sort((a: any, b: any) => a.value.localeCompare(b.value))
    }

    let measures: string[] = []
    if (f.length > 0) {
        const fFilter = f.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(',')
        const measureRecords = await dbQuery(`SELECT DISTINCT commercial_measure FROM public.products WHERE commercial_measure IS NOT NULL AND commercial_measure != '' AND familia_code IN (${fFilter})`) || []
        measures = measureRecords.map((rec: any) => rec.commercial_measure as string).sort()
    }

    const hasFilterMsg = !hasFilter ? (
        <TableRow>
            <TableCell colSpan={4} className="h-[400px] text-center">
                <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                        <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">Encuentra tus productos</h3>
                    <p className="text-sm text-slate-500 text-center leading-relaxed">
                        Selecciona una <b>Familia</b>, <b>Referencia</b> o <b>Medida</b> en la barra superior para empezar a explorar y gestionar el catálogo técnico.
                    </p>
                </div>
            </TableCell>
        </TableRow>
    ) : products.length === 0 ? (
        <TableRow>
            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
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
                    <Link href="/families/new">
                        <Button variant="outline" className="w-full sm:w-auto">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Familia
                        </Button>
                    </Link>
                    <Link href="/products/mass-edit">
                        <Button variant="secondary" className="w-full sm:w-auto">
                            <DatabaseZap className="mr-2 h-4 w-4 text-indigo-500" />
                            Verificación
                        </Button>
                    </Link>
                    <Link href="/products/new">
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
                <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-soft">
                    <div className="w-full lg:w-auto flex-1">
                        <ProductSearch families={families} references={references} measures={measures} />
                    </div>
                    <div className="flex items-center gap-3 w-full lg:w-auto">
                        <ImportCsvButton />
                        <AiTranslateButton />
                    </div>
                </div>

                {/* Data Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-premium overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[150px]">Código</TableHead>
                                <TableHead>Nombre Final</TableHead>
                                <TableHead className="w-[150px]">Estado</TableHead>
                                <TableHead className="text-right w-[100px]">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {hasFilterMsg || products.map((product) => (
                                <TableRow key={product.id}>
                                    <TableCell className="font-medium text-slate-900">{product.code}</TableCell>
                                    <TableCell className="text-slate-600">{product.final_name_es || '-'}</TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                product.validation_status === 'ready'
                                                    ? 'default'
                                                    : product.validation_status === 'needs_review'
                                                        ? 'destructive'
                                                        : 'secondary'
                                            }
                                        >
                                            {product.validation_status === 'incomplete' ? 'Incompleto' :
                                                product.validation_status === 'needs_review' ? 'Revisar' : 'Listo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Link href={`/products/${product.id}`}>
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
