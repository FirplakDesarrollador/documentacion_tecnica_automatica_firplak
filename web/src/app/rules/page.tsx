import { dbQuery } from '@/lib/supabase'
import { RulesTable } from '@/components/rules/RulesTable'

export default async function RulesPage() {
    // Fetch rules from Supabase server-side
    const rules = await dbQuery(`SELECT * FROM public.rules ORDER BY rule_type ASC, priority ASC`) || []

    return (
        <div className="container mx-auto py-6">
            <RulesTable initialRules={rules} />
        </div>
    )
}
