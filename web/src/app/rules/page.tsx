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
import { PlusCircle } from 'lucide-react'
import Link from 'next/link'

export default async function RulesPage() {
    const rules = await prisma.rule.findMany({
        orderBy: [
            { rule_type: 'asc' },
            { priority: 'asc' },
        ],
    })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Motor de Reglas</h1>
                    <p className="text-muted-foreground">
                        Configura reglas dinámicas para construir nombres, activar íconos y plantillas.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Agregar Regla
                    </Button>
                </div>
            </div>

            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Entidad Destino</TableHead>
                            <TableHead>Condición</TableHead>
                            <TableHead>Acción</TableHead>
                            <TableHead>Payload</TableHead>
                            <TableHead>Prioridad</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rules.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-24 text-center">
                                    No hay reglas definidas.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rules.map((rule) => (
                                <TableRow key={rule.id}>
                                    <TableCell className="font-medium">
                                        <Badge variant="outline">{rule.rule_type}</Badge>
                                    </TableCell>
                                    <TableCell className="capitalize">{rule.target_entity}</TableCell>
                                    <TableCell>
                                        <code className="bg-muted px-2 py-1 rounded text-xs">{rule.condition_expression}</code>
                                    </TableCell>
                                    <TableCell className="capitalize text-sm">{rule.action_type.replace('_', ' ')}</TableCell>
                                    <TableCell>
                                        <code className="bg-muted px-2 py-1 rounded text-xs">{rule.action_payload}</code>
                                    </TableCell>
                                    <TableCell>{rule.priority}</TableCell>
                                    <TableCell>
                                        {rule.enabled ? (
                                            <Badge variant="default" className="bg-blue-600">Activo</Badge>
                                        ) : (
                                            <Badge variant="secondary">Deshabilitado</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm">
                                            Editar
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
