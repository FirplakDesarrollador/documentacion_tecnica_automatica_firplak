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
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

export default async function GeneratePage() {
    const products = await prisma.product.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 20
    })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Generar Documentos</h1>
                    <p className="text-muted-foreground">
                        Selecciona un producto para previsualizar y generar su etiqueta.
                    </p>
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <div className="p-4 border-b flex gap-4">
                    <div className="relative w-full max-w-sm border-none shadow-none focus-visible:ring-0">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Buscar código de producto a generar..."
                            className="w-full pl-8"
                        />
                    </div>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acción</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {products.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No hay productos disponibles para generación.
                                </TableCell>
                            </TableRow>
                        ) : (
                            products.map((product) => (
                                <TableRow key={product.id}>
                                    <TableCell className="font-medium">{product.code}</TableCell>
                                    <TableCell>{product.product_type || '-'}</TableCell>
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
                                            {product.validation_status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" size="sm">
                                            <Link href={`/generate/${product.id}`}>Vista Previa</Link>
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
