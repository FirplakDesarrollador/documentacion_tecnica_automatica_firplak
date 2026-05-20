'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function upsertVersionAction(data: {
    version_code: string
    version_description: string
    automatic_version_rules?: any
    status?: string
    product_types?: string[]
    isNew?: boolean
}) {
    const { version_code, version_description, automatic_version_rules, status, product_types, isNew } = data

    if (isNew) {
        // INSERT new version
        const result = await dbQuery(
            `INSERT INTO public.global_version_rules (version_code, version_description, automatic_version_rules, product_types, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                version_code,
                version_description,
                JSON.stringify(automatic_version_rules || {}),
                JSON.stringify(product_types || []),
                status || 'ACTIVO',
            ]
        )
        revalidatePath('/rules/versions')
        return result[0]
    } else {
        // UPDATE existing version (PK = version_code, so we match by it)
        const result = await dbQuery(
            `UPDATE public.global_version_rules
             SET version_description = $1, automatic_version_rules = $2, product_types = $3, status = $4, updated_at = NOW()
             WHERE version_code = $5
             RETURNING *`,
            [
                version_description,
                JSON.stringify(automatic_version_rules || {}),
                JSON.stringify(product_types || []),
                status || 'ACTIVO',
                version_code,
            ]
        )
        revalidatePath('/rules/versions')
        return result[0]
    }
}

export async function deleteVersionAction(version_code: string) {
    await dbQuery(`DELETE FROM public.global_version_rules WHERE version_code = $1`, [version_code])
    revalidatePath('/rules/versions')
}
