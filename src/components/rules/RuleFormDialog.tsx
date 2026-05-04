'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { upsertRuleAction } from '@/app/rules/actions'
import { toast } from 'sonner'

interface RuleFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    rule?: any // Rule to edit, or undefined for new
}

interface RuleFormData {
    id?: string
    rule_type: string
    target_entity: string
    condition_expression: string
    action_type: string
    action_payload: string
    priority: number
    enabled: boolean
    notes: string
    target_value: string
}

// Opciones para el constructor
const FIELD_OPTIONS = [
    { value: 'version_code', label: 'Versión' },
    { value: 'familia_code', label: 'Familia' },
    { value: 'product_type', label: 'Tipo de Producto' },
    { value: 'rh_flag', label: 'RH (Humedad)' },
    { value: 'edge_2mm_flag', label: 'Canto 2mm' },
    { value: 'assembled_flag', label: 'Armado' },
    { value: 'line', label: 'Línea/Modelo' },
    { value: 'sap_description', label: 'Descripción SAP' },
    { value: 'code', label: 'Código SKU' },
    { value: 'sku_base', label: 'Código Base SKU' },
    { value: 'barcode_text', label: 'Código de Barras' },
    { value: 'zone_home', label: 'Zona Firplak' },
    { value: 'designation', label: 'Designación' },
    { value: 'cabinet_name', label: 'Nombre Mueble' },
    { value: 'commercial_measure', label: 'Medida Comercial' },
    { value: 'accessory_text', label: 'Accesorios/Riel' },
]

const OPERATOR_OPTIONS = [
    { value: '==', label: 'Es igual a' },
    { value: '!=', label: 'No es igual a' },
    { value: '.includes', label: 'Contiene' },
]

const ACTION_OPTIONS = [
    { value: 'set_field', label: 'Cambiar atributo' },
    { value: 'set_template', label: 'Asignar plantilla' },
    { value: 'activate_icon', label: 'Activar ícono' },
    { value: 'add_warning', label: 'Generar Alerta (Inconsistencia)' },
    { value: 'append_text', label: 'Agregar palabra al final del nombre' },
    { value: 'prepend_text', label: 'Agregar palabra al inicio del nombre' },
]

const PRODUCT_TYPE_OPTIONS = [
    { value: 'MUEBLE', label: 'Mueble' },
    { value: 'LAVAMANOS', label: 'Lavamanos' },
    { value: 'LAVARROPAS', label: 'Lavarropas' },
    { value: 'MESON', label: 'Mesón' },
    { value: 'QUARTZSTONE', label: 'Quartzstone' },
    { value: 'BAÑERA', label: 'Bañera' },
    { value: 'ACCESORIO', label: 'Accesorio' },
]

export function RuleFormDialog({ open, onOpenChange, rule }: RuleFormDialogProps) {
    const [loading, setLoading] = useState(false)
    
    // Estados para el constructor estructurado
    const [condField, setCondField] = useState('version_code')
    const [condOp, setCondOp] = useState('==')
    const [condVal, setCondVal] = useState('')
    
    const [actionType, setActionType] = useState('set_field')
    const [actionTarget, setActionTarget] = useState('') // Para set_field es el campo, para otros es el valor
    const [actionVal, setActionVal] = useState('')

    const [formData, setFormData] = useState<RuleFormData>({
        id: undefined,
        rule_type: 'naming',
        target_entity: 'product',
        condition_expression: '',
        action_type: 'set_field',
        action_payload: '',
        priority: 0,
        enabled: true,
        notes: '',
        target_value: 'MUEBLE'
    })

    useEffect(() => {
        if (rule) {
            // Mapeo de tipos técnicos a los del UI (SELECT)
            const getMappedType = (type: string) => {
                if (type === 'name_component' || type === 'attribute_modifier') return 'naming';
                if (type === 'icon_activation') return 'asset';
                return type || 'naming';
            }

            // Cargar datos en el formulario
            setFormData({
                id: rule.id,
                rule_type: getMappedType(rule.rule_type),
                target_entity: rule.target_entity || 'product',
                condition_expression: rule.condition_expression || '',
                action_type: rule.action_type || 'set_field',
                action_payload: rule.action_payload || '',
                priority: rule.priority || 0,
                enabled: rule.enabled !== undefined ? rule.enabled : true,
                target_value: rule.target_value || 'MUEBLE',
                notes: rule.notes || ''
            })

            // Parsear condición estructurada
            const expr = rule.condition_expression || ''
            if (expr.includes('==')) {
                const [f, v] = expr.split('==').map((s: string) => s.trim().replace(/'/g, ''))
                setCondField(f); setCondOp('=='); setCondVal(v)
            } else if (expr.includes('!=')) {
                const [f, v] = expr.split('!=').map((s: string) => s.trim().replace(/'/g, ''))
                setCondField(f); setCondOp('!='); setCondVal(v)
            } else if (expr.includes('.includes')) {
                const f = expr.split('.')[0]
                const v = expr.match(/'([^']+)'/)?.[1] || ''
                setCondField(f); setCondOp('.includes'); setCondVal(v)
            }

            // Parsear acción estructurada
            const aType = rule.action_type || 'set_field'
            const aPayload = rule.action_payload || ''
            setActionType(aType === 'set_attribute' ? 'set_field' : aType)
            const separator = aPayload.includes('=') ? '=' : ':';
            if ((aType === 'set_field' || aType === 'set_attribute') && aPayload.includes(separator)) {
                const [f, v] = aPayload.split(separator)
                setActionTarget(f.trim()); setActionVal(v.trim())
            } else {
                setActionVal(aPayload)
            }
        } else {
            // Reset totals
            setFormData({
                id: undefined,
                rule_type: 'naming',
                target_entity: 'product',
                condition_expression: '',
                action_type: 'set_field',
                action_payload: '',
                priority: 0,
                enabled: true,
                target_value: 'MUEBLE',
                notes: ''
            })
            setCondField('version_code'); setCondOp('=='); setCondVal('')
            setActionType('set_field'); setActionTarget('rh_flag'); setActionVal('')
        }
    }, [rule, open])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        // Construir expresiones técnicas
        let finalExpr = ''
        if (condOp === '.includes') {
            finalExpr = `${condField}.includes('${condVal}')`
        } else {
            finalExpr = `${condField} ${condOp} '${condVal}'`
        }

        let finalPayload = actionVal
        if (actionType === 'set_field') {
            finalPayload = `${actionTarget}=${actionVal}`
        }

        // Determinar rule_type técnico
        let technicalRuleType = formData.rule_type
        if (formData.rule_type === 'naming') {
            technicalRuleType = actionType === 'set_field' ? 'attribute_modifier' : 'name_component'
        }

        const dataToSave = {
            ...formData,
            rule_type: technicalRuleType,
            condition_expression: finalExpr,
            action_type: actionType,
            action_payload: finalPayload
        }

        try {
            await upsertRuleAction(dataToSave)
            toast.success(rule ? 'Regla actualizada' : 'Regla creada')
            onOpenChange(false)
        } catch (error: any) {
            toast.error('Error al guardar la regla: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[650px] max-h-[95vh] overflow-y-auto overflow-x-hidden p-0 gap-0 border-none shadow-2xl">
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-6">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold text-slate-900 leading-tight">
                                {rule ? 'Editar Regla de Negocio' : 'Nueva Regla de Negocio'}
                            </DialogTitle>
                            <DialogDescription className="text-slate-500 text-sm leading-relaxed max-w-prose">
                                Configure la lógica en lenguaje sencillo. El sistema traducirá esto automáticamente a reglas técnicas para el motor de generación.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-6 bg-slate-50/50 -mx-6 px-6 py-1 border-y border-slate-100">
                            {/* Configuración General */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                                <div className="space-y-2">
                                    <Label className="text-slate-700 font-medium">Categoría de la Regla</Label>
                                    <Select value={formData.rule_type} onValueChange={(v: string | null) => setFormData({...formData, rule_type: v || 'naming'})}>
                                        <SelectTrigger className="w-full h-11 bg-white border-slate-200 shadow-sm transition-all focus:ring-2 focus:ring-blue-500/20">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="naming">Construcción de Nombre (Nomenclatura)</SelectItem>
                                            <SelectItem value="template">Selección de Etiqueta (Plantilla)</SelectItem>
                                            <SelectItem value="asset">Recursos e Íconos (Logos/Isométricos)</SelectItem>
                                            <SelectItem value="validation">Validación y Alarmas (Inconsistencias)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-slate-700 font-medium">Prioridad de Aplicación</Label>
                                    <Input 
                                        type="number" 
                                        value={formData.priority} 
                                        className="h-11 bg-white border-slate-200 shadow-sm focus:ring-2 focus:ring-blue-500/20"
                                        onChange={(e) => setFormData({...formData, priority: parseInt(e.target.value) || 0})}
                                    />
                                    <p className="text-[10px] text-slate-400">Valores más altos se ejecutan después y pueden sobreescribir otros.</p>
                                </div>
                            </div>
                        </div>

                        {formData.rule_type === 'naming' && (
                            <div className="space-y-2 py-2">
                                <Label className="text-slate-700 font-medium">Aplica para Tipo de Producto:</Label>
                                <Select value={formData.target_value} onValueChange={(v: string | null) => setFormData({...formData, target_value: v || 'MUEBLE'})}>
                                    <SelectTrigger className="h-11 bg-white border-slate-200 shadow-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PRODUCT_TYPE_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Bloque SI (Condición) */}
                        <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wider text-xs">
                                <span className="bg-slate-900 text-white px-2 py-1 rounded-md">SI</span>
                                Condición de activación
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-500 font-semibold uppercase">Campo</Label>
                                    <Select value={condField} onValueChange={(v) => setCondField(v || 'version_code')}>
                                        <SelectTrigger className="bg-slate-50 border-slate-200 h-10 truncate">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {FIELD_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-500 font-semibold uppercase">Operador</Label>
                                    <Select value={condOp} onValueChange={(v) => setCondOp(v || '==')}>
                                        <SelectTrigger className="bg-slate-50 border-slate-200 h-10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {OPERATOR_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-500 font-semibold uppercase">Valor esperado</Label>
                                    <Input 
                                        value={condVal} 
                                        className="h-10 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                                        onChange={(e) => setCondVal(e.target.value)} 
                                        placeholder="Ej. MST, LVR..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Bloque ENTONCES (Acción) */}
                        <div className="space-y-4 bg-blue-50/50 p-5 rounded-xl border border-blue-100 shadow-sm">
                            <h4 className="font-bold text-blue-900 flex items-center gap-2 uppercase tracking-wider text-xs">
                                <span className="bg-blue-600 text-white px-2 py-1 rounded-md">ENTONCES</span>
                                Acción a ejecutar
                            </h4>
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <Label className="text-xs text-blue-700 font-semibold uppercase">Qué desea hacer?</Label>
                                    <Select value={actionType} onValueChange={(v) => setActionType(v || 'set_field')}>
                                        <SelectTrigger className="bg-white border-blue-200 h-11 text-blue-900 font-medium">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ACTION_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {actionType === 'set_field' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-blue-700 font-semibold uppercase">Campo a modificar</Label>
                                            <Select value={actionTarget} onValueChange={(v) => setActionTarget(v || '')}>
                                                <SelectTrigger className="bg-white border-blue-200 h-10">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {FIELD_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs text-blue-700 font-semibold uppercase">Nuevo valor</Label>
                                            <Input 
                                                value={actionVal} 
                                                className="h-10 bg-white border-blue-200 focus:ring-blue-500/20"
                                                onChange={(e) => setActionVal(e.target.value)} 
                                                placeholder="Ej. true, false, texto..."
                                            />
                                        </div>
                                    </div>
                                )}

                                {actionType !== 'set_field' && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <Label className="text-xs text-blue-700 font-semibold uppercase">
                                            {actionType === 'add_warning' ? 'Contenido de la Alerta' : 
                                             actionType === 'set_template' ? 'Identificador de la Plantilla' : 
                                             actionType === 'activate_icon' ? 'Nombre del Ícono' : 'Valor o Texto'}
                                        </Label>
                                        <Input 
                                            value={actionVal} 
                                            className="h-11 bg-white border-blue-200 focus:ring-blue-500/20"
                                            onChange={(e) => setActionVal(e.target.value)} 
                                            placeholder="Describa el valor aquí..."
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-700 font-medium">Notas o Contexto Interno</Label>
                            <Textarea 
                                value={formData.notes} 
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                placeholder="Escriba aquí el motivo de esta regla para otros usuarios..."
                                className="h-24 bg-white border-slate-200 resize-none"
                            />
                        </div>
                    </div>

                    <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100 mt-0">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading} className="text-slate-500 hover:text-slate-700">
                            Cancelar
                        </Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px] h-11 font-semibold shadow-lg shadow-blue-500/20" disabled={loading}>
                            {loading ? 'Guardando...' : rule ? 'Actualizar Regla' : 'Crear Regla'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
