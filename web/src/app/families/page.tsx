import { dbQuery } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Edit2, PlusCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { DeleteButton } from './DeleteButton'

export default async function FamiliesPage() {
    const families = await dbQuery(`
        SELECT * FROM public.familias ORDER BY code ASC
    `) || []

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full py-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/products">
                        <Button variant="outline" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Gestión de Familias</h1>
                        <p className="text-slate-500">Administra las propiedades por defecto de cada familia de producto.</p>
                    </div>
                </div>
                <Link href="/families/new">
                    <Button className="bg-slate-900 text-white hover:bg-slate-800">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Nueva Familia
                    </Button>
                </Link>
            </div>

            <Card className="border-slate-200">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                <TableHead className="w-[150px] font-semibold">Código</TableHead>
                                <TableHead className="font-semibold">Nombre</TableHead>
                                <TableHead className="font-semibold">Línea</TableHead>
                                <TableHead className="font-semibold text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {families.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-32 text-center text-slate-500">
                                        No hay familias registradas.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                families.map((family: any) => (
                                    <TableRow key={family.id} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="font-mono font-medium text-slate-700">{family.code}</TableCell>
                                        <TableCell className="text-slate-600">{family.name}</TableCell>
                                        <TableCell className="text-slate-600">{family.use_destination}</TableCell>
                                        <TableCell className="text-right flex items-center justify-end gap-1">
                                            <Link href={`/families/edit/${family.code}`}>
                                                <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-400 hover:text-slate-900">
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Editar
                                                </Button>
                                            </Link>
                                            <DeleteButton code={family.code} />
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
