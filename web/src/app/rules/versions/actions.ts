'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function upsertVersionAction(data: {
    id?: string
    code: string
    description: string
    automatic_rules?: any
    notes?: string
}) {
    const { id, code, description, automatic_rules, notes } = data

    const query = id
        ? `
            UPDATE public.versions
            SET code = $1, description = $2, automatic_rules = $3, notes = $4
            WHERE id = $5
            RETURNING *
        `
        : `
            INSERT INTO public.versions (code, description, automatic_rules, notes)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `
    
    const values = id 
        ? [code, description, JSON.stringify(automatic_rules || {}), notes || null, id]
        : [code, description, JSON.stringify(automatic_rules || {}), notes || null]

    const result = await dbQuery(query, values)
    revalidatePath('/rules/versions')
    return result[0]
}

export async function deleteVersionAction(id: string) {
    await dbQuery(`DELETE FROM public.versions WHERE id = $1`, [id])
    revalidatePath('/rules/versions')
}
