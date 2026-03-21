'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { upsertRuleAction } from '@/app/rules/actions'
import { toast } from 'sonner'
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react'

interface NamingRulesManagerProps {
    open: boolean
    productType: string
    onClose: () => void
    initialRules: any[]
}

export function NamingRulesManager({ open, productType, onClose, initialRules }: NamingRulesManagerProps) {
    const [rules, setRules] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        setRules([...initialRules].sort((a: any, b: any) => a.priority - b.priority))
    }, [initialRules])

    const moveRule = async (index: number, direction: 'up' | 'down') => {
        const newRules = [...rules]
        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (targetIndex < 0 || targetIndex >= newRules.length) return

        const temp = newRules[index]
        newRules[index] = newRules[targetIndex]
        newRules[targetIndex] = temp

        // Update technical priorities locally
        newRules.forEach((r, idx) => r.priority = idx * 10)
        setRules([...newRules])
    }

    const handleSaveOrder = async () => {
        setLoading(true)
        try {
            for (const rule of rules) {
                await upsertRuleAction(rule)
            }
            toast.success("Orden de nomenclatura guardado")
            onClose()
        } catch (err: any) {
            toast.error("Error al guardar orden: " + err.message)
        } finally {
            setLoading(false)
        }
    }

    const addFixedText = () => {
        const newRule = {
            rule_type: 'name_component',
            target_entity: 'product',
            condition_expression: 'true', // Always apply
            action_type: 'append_text',
            action_payload: 'TEXTO',
            priority: rules.length * 10,
            enabled: true,
            target_value: productType,
            notes: 'Texto estático agregado por el administrador'
        }
        setRules([...rules, newRule])
    }

    const updateText = (index: number, val: string) => {
        const nr = [...rules]
        nr[index].action_payload = val
        setRules(nr)
    }

    const removeRule = (index: number) => {
        const nr = [...rules]
        nr.splice(index, 1)
        setRules(nr)
    }

    return (
        <Dialog open={open} onOpenChange={(val) => { if (!val) onClose() }}>
            <DialogContent className="sm:max-w-[700px] h-[85vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <DialogTitle className="text-xl">Estructura Dinámica: {productType}</DialogTitle>
                    <DialogDescription>
                        Suelte un bloque estático para agregar texto quemado, o mueva las variables azules.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-slate-50/30">
                    {rules.length === 0 && (
                        <div className="text-center py-10 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                            <p className="text-slate-400 italic">No hay componentes definidos para este tipo.</p>
                            <Button variant="ghost" className="mt-2 text-blue-600" onClick={addFixedText}>
                                <Plus className="w-4 h-4 mr-2" /> Agregar componente
                            </Button>
                        </div>
                    )}
                    
                    {rules.map((rule, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm group">
                            <div className="flex flex-col gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRule(idx, 'up')} disabled={idx === 0}>
                                    <ArrowUp className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRule(idx, 'down')} disabled={idx === rules.length - 1}>
                                    <ArrowDown className="w-3 h-3" />
                                </Button>
                            </div>
                            
                            <div className="flex-1 flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                    {rule.condition_expression === 'true' ? 'Texto Estático' : `Variable (${rule.condition_expression})`}
                                </span>
                                {rule.condition_expression === 'true' ? (
                                    <Input 
                                        value={rule.action_payload} 
                                        onChange={(e) => updateText(idx, e.target.value)}
                                        className="h-8 bg-orange-50 font-bold border-orange-200 text-orange-700"
                                    />
                                ) : (
                                    <div className="text-sm font-semibold text-slate-700">
                                        {rule.action_payload.split('=')[1] || rule.action_payload}
                                    </div>
                                )}
                            </div>

                            <Button variant="ghost" size="icon" className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeRule(idx)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 bg-white shrink-0">
                    <Button variant="outline" size="sm" onClick={addFixedText} className="border-orange-200 text-orange-700 hover:bg-orange-50">
                        <Plus className="w-4 h-4 mr-2" /> Agregar Texto Estático
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button onClick={handleSaveOrder} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                            {loading ? 'Guardando...' : 'Aplicar Cambios'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
