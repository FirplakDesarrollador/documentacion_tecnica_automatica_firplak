import prisma from '@/lib/prisma'
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

    // Helper to ensure we always have an array of strings
    const toArray = (val: string | string[] | undefined) => {
        if (!val) return []
        if (Array.isArray(val)) return val
        return [val]
    }

    const f = toArray(searchParams?.f)
    const r = toArray(searchParams?.r)
    const m = toArray(searchParams?.m)

    const hasFilter = f.length > 0 || r.length > 0 || m.length > 0

    // Fetch products only if there is at least one filter selected
    let products: any[] = []
    if (hasFilter) {
        products = await prisma.product.findMany({
            where: {
                familia_code: f.length > 0 ? { in: f } : undefined,
                ref_code: r.length > 0 ? { in: r } : undefined,
                commercial_measure: m.length > 0 ? { in: m } : undefined,
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
        })
    }

    // Families: Fetch from the Familia table so we have the name
    const familiasDb = await prisma.familia.findMany({
        select: { code: true, name: true },
        orderBy: { code: 'asc' }
    })
    const families = familiasDb.map(f => ({
        value: f.code,
        label: `${f.code} - ${f.name}`
    }))

    // References: Filtered by family if selected. Empty if no family.
    let references: {value: string, label: string}[] = []
    if (f.length > 0) {
        const refRecords = await prisma.product.findMany({ 
            select: { ref_code: true, furniture_name: true }, 
            distinct: ['ref_code'], 
            where: { 
                ref_code: { not: null },
                familia_code: { in: f }
            } 
        })
        references = refRecords.map((rec: any) => ({
            value: rec.ref_code as string,
            label: `${rec.ref_code} - ${rec.furniture_name || ''}`
        })).sort((a, b) => a.value.localeCompare(b.value))
    }

    // Measures: Filtered by family. Empty if no family.
    let measures: string[] = []
    if (f.length > 0) {
        const measureRecords = await prisma.product.findMany({ 
            select: { commercial_measure: true }, 
            distinct: ['commercial_measure'], 
            where: { 
                commercial_measure: { not: '' },
                familia_code: { in: f },
            } 
        })
        measures = measureRecords.map((rec: any) => rec.commercial_measure as string).sort()
    }

    const hasFilterMsg = !hasFilter ? (
        <TableRow>
            <TableCell colSpan={4} className="h-64 text-center">
                <div className="flex flex-col items-center gap-2 opacity-50">
                    <Search className="w-8 h-8" />
                    <p className="max-w-[300px]">
                        Por favor selecciona una <b>Familia</b>, <b>Referencia</b> o <b>Medida</b> para comenzar la búsqueda.
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
        <div className="flex flex-col gap-6 text-foreground">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
                    <p className="text-muted-foreground">
                        Administra tu base de datos maestra de productos y etiquetas.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/families/new">
                        <Button variant="secondary">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Agregar Familia
                        </Button>
                    </Link>
                    <Link href="/products/mass-edit">
                        <Button variant="outline">
                            <DatabaseZap className="mr-2 h-4 w-4 text-blue-500" />
                            Verificación de datos masivos
                        </Button>
                    </Link>
                    <Link href="/products/new">
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Agregar Producto
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="rounded-md border bg-card">
                <div className="p-4 border-b flex gap-4">
                    <ProductSearch families={families} references={references} measures={measures} />
                    <ImportCsvButton />
                    <AiTranslateButton />
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Nombre Final</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {hasFilterMsg || products.map((product) => (
                            <TableRow key={product.id}>
                                <TableCell className="font-medium">{product.code}</TableCell>
                                <TableCell>{product.final_name_es || '-'}</TableCell>
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
                                        <Button variant="ghost" size="sm">Editar</Button>
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}

