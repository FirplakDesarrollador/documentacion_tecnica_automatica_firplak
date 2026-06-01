'use server'

import { dbQuery } from '@/lib/supabase'
import { markNamingStaleForVersionRule, processNamingJobsInline } from '@/lib/engine/namingQueue'
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
        await markNamingStaleForVersionRule(version_code, null, 'version_rule_upsert')
        await processNamingJobsInline()
        revalidatePath('/rules/versions')
        revalidatePath('/configuration/versions')
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
        await markNamingStaleForVersionRule(version_code, null, 'version_rule_update')
        await processNamingJobsInline()
        revalidatePath('/rules/versions')
        revalidatePath('/configuration/versions')
        return result[0]
    }
}

export async function previewDeleteVersionAction(version_code: string) {
    const result = await dbQuery(`
        SELECT
            (SELECT COUNT(*) FROM public.product_versions WHERE version_code = $1)::int AS version_count,
            (SELECT COUNT(*) FROM public.product_skus WHERE version_id IN (SELECT id FROM public.product_versions WHERE version_code = $1))::int AS sku_count
    `, [version_code])
    return {
        version_code,
        versionCount: result?.[0]?.version_count ?? 0,
        skuCount: result?.[0]?.sku_count ?? 0
    }
}

export async function deleteVersionAction(version_code: string) {
    await dbQuery(`
        DELETE FROM public.product_skus WHERE version_id IN (SELECT id FROM public.product_versions WHERE version_code = $1);
        DELETE FROM public.product_versions WHERE version_code = $1;
        DELETE FROM public.global_version_rules WHERE version_code = $1;
    `, [version_code])
    revalidatePath('/rules/versions')
    revalidatePath('/configuration/versions')
}
