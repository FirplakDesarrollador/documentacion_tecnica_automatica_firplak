'use client'

import { useState } from 'react'
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
import { PlusCircle, Edit2, Trash2 } from 'lucide-react'
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select'
import { RuleFormDialog } from './RuleFormDialog'
import { deleteRuleAction } from '@/app/rules/actions'
import { toast } from 'sonner'
import { ruleToSpanishDescription } from '@/lib/engine/ruleTranslator'

interface RulesTableProps {
    initialRules: any[]
}

export function RulesTable({ initialRules }: RulesTableProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedRule, setSelectedRule] = useState<any>(null)

    // Ocultar las reglas de nomenclatura (están en NomenclaturesSection)
    const filteredRules = initialRules.filter((r: any) => r.rule_type !== 'name_component')

    const handleAdd = () => {
        setSelectedRule(null)
        setIsDialogOpen(true)
    }

    const handleEdit = (rule: any) => {
        setSelectedRule(rule)
        setIsDialogOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar esta regla?')) return
        try {
            await deleteRuleAction(id)
            toast.success('Regla eliminada')
        } catch (error: any) {
            toast.error('Error al eliminar: ' + error.message)
        }
    }

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-800">Reglas Avanzadas</h2>
                    <p className="text-muted-foreground text-sm">
                        Configura el motor lógico subyacente: plantillas IA, recursos, modificadores y alertas visuales.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={handleAdd}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Agregar Regla Avanzada
                    </Button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Descripción de la Regla (Lógica de Negocio)</TableHead>
                            <TableHead>Prio</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRules.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No hay reglas definidas para este tipo.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredRules.map((rule: any) => (
                                <TableRow key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="font-medium whitespace-nowrap">
                                        <Badge variant="outline" className={
                                            (rule.rule_type === 'naming' || rule.rule_type === 'name_component') ? 'border-blue-200 text-blue-700 bg-blue-50' :
                                            rule.rule_type === 'template' ? 'border-purple-200 text-purple-700 bg-purple-50' :
                                            (rule.rule_type === 'asset' || rule.rule_type === 'icon_activation') ? 'border-amber-200 text-amber-700 bg-amber-50' :
                                            (rule.rule_type === 'attribute_modifier') ? 'border-cyan-200 text-cyan-700 bg-cyan-50' :
                                            'border-red-200 text-red-700 bg-red-50'
                                        }>
                                            {(rule.rule_type === 'naming' || rule.rule_type === 'name_component') ? 'Nomenclatura' :
                                             rule.rule_type === 'template' ? 'Plantilla' :
                                             (rule.rule_type === 'asset' || rule.rule_type === 'icon_activation') ? 'Recurso' : 
                                             (rule.rule_type === 'attribute_modifier') ? 'Atributo' : 'Alarma'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div 
                                            className="text-sm text-slate-700 leading-relaxed py-2 min-w-[300px]"
                                            dangerouslySetInnerHTML={{ __html: ruleToSpanishDescription(rule).replace(/\*\*([^*]+)\*\*/g, '<strong class="text-blue-700 font-semibold">$1</strong>') }}
                                        />
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
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(rule)}>
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(rule.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <RuleFormDialog 
                open={isDialogOpen} 
                onOpenChange={setIsDialogOpen} 
                rule={selectedRule} 
            />
        </div>
    )
}
