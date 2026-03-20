'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

function esc(v: any) {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (typeof v === 'number') return String(v)
    return `'${String(v).replace(/'/g, "''")}'`
}

export async function upsertRuleAction(data: any) {
    const { id, rule_type, target_entity, condition_expression, action_type, action_payload, priority, enabled, notes } = data

    if (id) {
        // Update
        await dbQuery(`
            UPDATE public.rules SET
                rule_type=${esc(rule_type)},
                target_entity=${esc(target_entity)},
                condition_expression=${esc(condition_expression)},
                action_type=${esc(action_type)},
                action_payload=${esc(action_payload)},
                priority=${priority || 0},
                enabled=${enabled ? 'true' : 'false'},
                notes=${esc(notes)},
                updated_at=now()
            WHERE id='${id}'
        `)
    } else {
        // Insert
        await dbQuery(`
            INSERT INTO public.rules (rule_type, target_entity, condition_expression, action_type, action_payload, priority, enabled, notes)
            VALUES (${esc(rule_type)}, ${esc(target_entity)}, ${esc(condition_expression)}, ${esc(action_type)}, ${esc(action_payload)}, ${priority || 0}, ${enabled ? 'true' : 'false'}, ${esc(notes)})
        `)
    }

    revalidatePath('/rules')
}

export async function deleteRuleAction(id: string) {
    if (!id) return
    await dbQuery(`DELETE FROM public.rules WHERE id = '${id}'`)
    revalidatePath('/rules')
}
