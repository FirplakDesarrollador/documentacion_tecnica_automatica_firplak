import prisma from '@/lib/prisma'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { NewTemplateDialog } from '@/components/templates/NewTemplateDialog'
import { DeleteTemplateButton } from '@/components/templates/DeleteTemplateButton'

export default async function TemplatesPage() {
    const templates = await prisma.template.findMany({
        orderBy: { updatedAt: 'desc' },
    })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Plantillas</h1>
                    <p className="text-muted-foreground">
                        Administra visualmente los diseños de tus etiquetas y documentos.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <NewTemplateDialog />
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Dimensiones</TableHead>
                            <TableHead>Versión</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {templates.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No se encontraron plantillas.
                                </TableCell>
                            </TableRow>
                        ) : (
                            templates.map((template: any) => (
                                <TableRow key={template.id}>
                                    <TableCell className="font-medium">{template.name}</TableCell>
                                    <TableCell className="capitalize">{template.document_type}</TableCell>
                                    <TableCell>
                                        {template.width_mm}mm x {template.height_mm}mm ({template.orientation})
                                    </TableCell>
                                    <TableCell>v{template.version}</TableCell>
                                    <TableCell>
                                        {template.active ? (
                                            <Badge variant="default" className="bg-green-600">Activa</Badge>
                                        ) : (
                                            <Badge variant="secondary">Inactiva</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right flex items-center justify-end gap-2">
                                        <Link href={`/templates/builder?id=${template.id}`}>
                                            <Button variant="ghost" size="sm">Editar</Button>
                                        </Link>
                                        <DeleteTemplateButton id={template.id} />
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
