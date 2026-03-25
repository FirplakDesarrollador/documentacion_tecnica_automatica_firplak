import { dbQuery } from '@/lib/supabase'
import { RulesTable } from '@/components/rules/RulesTable'
import { NomenclaturesSection } from '@/components/rules/NomenclaturesSection'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Settings } from 'lucide-react'

export default async function RulesPage() {
    // Fetch rules from Supabase server-side
    const rules = await dbQuery(`SELECT * FROM public.rules ORDER BY rule_type ASC, priority ASC`) || []
    
    // Filter naming rules for the top section
    const namingRules = rules.filter((r: any) => r.rule_type === 'name_component')

    return (
        <div className="container mx-auto py-6">
            <div className="flex items-center justify-between mb-8">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Configuración de Reglas</h1>
                    <p className="text-muted-foreground">
                        Administra cómo se estructuran los nombres de tus productos y centraliza la inteligencia del negocio.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/rules/versions">
                        <Button variant="outline" className="h-10 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold uppercase text-xs shadow-sm shadow-indigo-100">
                            <Settings className="w-4 h-4 mr-2" />
                            Diccionario Versiones
                        </Button>
                    </Link>
                </div>
            </div>

            <NomenclaturesSection namingRules={namingRules} />
            
            <div className="my-10 border-t border-slate-200 w-full" />

            <RulesTable initialRules={rules} />
        </div>
    )
}

