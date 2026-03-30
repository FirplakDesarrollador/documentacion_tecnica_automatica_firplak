'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Settings2, ArrowRight } from 'lucide-react'
import { NamingRulesManager } from './NamingRulesManager'
import { cn } from '@/lib/utils'

interface NomenclaturesSectionProps {
    namingRules: any[];
}

const PRODUCT_TYPES = [
    { value: 'MUEBLE', label: 'Muebles' },
    { value: 'LAVAMANOS', label: 'Lavamanos' },
    { value: 'LAVARROPAS', label: 'Lavarropas' },
    { value: 'MESON', label: 'Mesones' },
    { value: 'QUARTZSTONE', label: 'Quartzstone' },
    { value: 'BAÑERA', label: 'Bañeras' },
    { value: 'TAPA', label: 'Tapas' },
]

export function NomenclaturesSection({ namingRules }: NomenclaturesSectionProps) {
    const [editingType, setEditingType] = useState<string | null>(null)

    // Helper to generate a preview string of the structure
    const generatePreview = (type: string) => {
        const rulesForType = namingRules
            .filter(r => r.target_value === type)
            .sort((a, b) => a.priority - b.priority)
        
        if (rulesForType.length === 0) return <span className="text-slate-400 italic font-mono text-sm">Sin estructura definida</span>

        return (
            <div className="flex flex-wrap gap-1 items-center">
                {rulesForType.map((r, i) => (
                    <div key={i} className="flex items-center gap-1">
                        {r.condition_expression === 'true' ? (
                            <span className="text-orange-600 font-extrabold text-sm select-none break-keep whitespace-nowrap">"{r.action_payload}"</span>
                        ) : (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-bold uppercase tracking-tighter text-[10px] break-keep whitespace-nowrap">
                                {r.action_payload.split('=')[1] || r.action_payload}
                            </Badge>
                        )}
                        {i < rulesForType.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />}
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 mb-12">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-800">Modelos de Nomenclatura</h2>
                <p className="text-muted-foreground text-sm">
                    Configura las fórmulas exactas para autogenerar los nombres finales de cada familia de producto.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {PRODUCT_TYPES.map(pt => (
                    <Card key={pt.value} className={`border-2 transition-all ${editingType === pt.value ? 'border-blue-500 shadow-md ring-4 ring-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
                        <CardHeader className="pb-3 bg-slate-50/50">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-900 uppercase tracking-wider">{pt.label}</CardTitle>
                                <Button 
                                    variant={editingType === pt.value ? "default" : "secondary"} 
                                    size="sm"
                                    onClick={() => setEditingType(editingType === pt.value ? null : pt.value)}
                                    className={cn(
                                        "h-8 px-3 text-[11px] font-bold uppercase transition-all shadow-sm",
                                        editingType === pt.value 
                                            ? "bg-indigo-600 hover:bg-indigo-700 text-white" 
                                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-none"
                                    )}
                                >
                                    <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                                    {editingType === pt.value ? 'Cerrar' : 'Ajustar'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4 pb-4">
                            <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-xl w-full min-h-[70px] flex items-center shadow-inner group-hover:bg-white transition-colors">
                                {generatePreview(pt.value)}
                            </div>
                        </CardContent>

                        {editingType === pt.value && (
                            <NamingRulesManager 
                                open={true}
                                productType={pt.value} 
                                onClose={() => setEditingType(null)}
                                initialRules={namingRules.filter(r => r.target_value === pt.value)}
                            />
                        )}
                    </Card>
                ))}
            </div>
        </div>
    )
}
