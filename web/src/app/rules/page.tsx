import { dbQuery } from '@/lib/supabase'
import { RulesTable } from '@/components/rules/RulesTable'
import { NomenclaturesSection } from '@/components/rules/NomenclaturesSection'

export default async function RulesPage() {
    // Fetch rules from Supabase server-side
    const rules = await dbQuery(`SELECT * FROM public.rules ORDER BY rule_type ASC, priority ASC`) || []
    
    // Filter naming rules for the top section
    const namingRules = rules.filter((r: any) => r.rule_type === 'name_component')

    return (
        <div className="container mx-auto py-6">
            <div className="flex flex-col gap-4 mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Configuración de Reglas</h1>
                <p className="text-muted-foreground">
                    Administra cómo se estructuran los nombres de tus productos y centraliza la inteligencia del negocio.
                </p>
            </div>

            <NomenclaturesSection namingRules={namingRules} />
            
            <div className="my-10 border-t border-slate-200 w-full" />

            <RulesTable initialRules={rules} />
        </div>
    )
}

