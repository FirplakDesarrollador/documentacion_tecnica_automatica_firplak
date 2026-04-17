import { dbQuery } from '@/lib/supabase'
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
import { DuplicateTemplateDialog } from '@/components/templates/DuplicateTemplateDialog'

export default async function TemplatesPage() {
    const templates = await dbQuery(`SELECT * FROM public.plantillas_doc_tec ORDER BY created_at ASC`) || []
    const datasets = await dbQuery(`SELECT id, name FROM public.custom_datasets ORDER BY created_at DESC`) || []

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Diseñador de Plantillas</h1>
                    <p className="text-slate-500 mt-2 text-sm max-w-2xl">
                        Gestiona la estructura visual y las variables de datos para cada tipo de documento generado.
                    </p>
                </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <NewTemplateDialog datasets={datasets} />
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <Table>
                        <TableHeader className="bg-slate-50/50">
                            <TableRow>
                                <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Nombre de Plantilla</TableHead>
                                <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Tipo de Doc</TableHead>
                                <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Dimensiones (mm)</TableHead>
                                <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Versión</TableHead>
                                <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Estado</TableHead>
                                <TableHead className="text-right uppercase tracking-wider text-[10px] font-bold text-slate-500">Acciones</TableHead>
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
                                    <TableCell>
                                        <Badge className="bg-slate-50 text-slate-500 ring-1 ring-slate-500/10 hover:bg-slate-50 text-[10px] px-2 py-0.5 font-bold uppercase tracking-tight">v{template.version}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        {template.active ? (
                                            <Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-700/10 hover:bg-emerald-50 text-[10px] px-2 py-0.5 font-bold uppercase tracking-tight">Activa</Badge>
                                        ) : (
                                            <Badge className="bg-slate-50 text-slate-400 ring-1 ring-slate-400/10 hover:bg-slate-50 text-[10px] px-2 py-0.5 font-bold uppercase tracking-tight">Inactiva</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link href={`/templates/builder?id=${template.id}`}>
                                                <Button variant="ghost" size="sm" className="font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">Configurar</Button>
                                            </Link>
                                            <DuplicateTemplateDialog 
                                                id={template.id} 
                                                originalName={template.name} 
                                                originalDataSource={template.data_source} 
                                                datasets={datasets} 
                                            />
                                            <DeleteTemplateButton id={template.id} />
                                        </div>
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
