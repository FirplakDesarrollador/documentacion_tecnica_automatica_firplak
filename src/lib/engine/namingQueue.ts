import { supabaseServer } from '@/lib/supabase'
import { processNamingJobs } from './namingProcessor'

type NamingType = string | null | undefined
type SupabaseRpcClient = {
    rpc: (
        functionName: string,
        args?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>
}

async function callMarkRpc(functionName: string, args: Record<string, unknown>) {
    const { data, error } = await (supabaseServer as unknown as SupabaseRpcClient).rpc(functionName, args)
    if (error) throw new Error(error.message)
    return data as string | null
}

export async function markNamingStaleForProductType(
    productType: string,
    namingType?: NamingType,
    origin = 'app'
) {
    return callMarkRpc('mark_naming_stale_for_product_type', {
        p_product_type: productType,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForFamilies(
    familyCodes: string[],
    namingType?: NamingType,
    origin = 'app'
) {
    if (!familyCodes.length) return null
    return callMarkRpc('mark_naming_stale_for_families', {
        p_family_codes: familyCodes,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForReferences(
    referenceIds: string[],
    namingType?: NamingType,
    origin = 'app'
) {
    if (!referenceIds.length) return null
    return callMarkRpc('mark_naming_stale_for_references', {
        p_reference_ids: referenceIds,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForVersions(
    versionIds: string[],
    namingType?: NamingType,
    origin = 'app'
) {
    if (!versionIds.length) return null
    return callMarkRpc('mark_naming_stale_for_versions', {
        p_version_ids: versionIds,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForSkus(
    skuIds: string[],
    namingType?: NamingType,
    origin = 'app'
) {
    if (!skuIds.length) return null
    return callMarkRpc('mark_naming_stale_for_skus', {
        p_sku_ids: skuIds,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForColor(
    colorCode: string,
    namingType?: NamingType,
    origin = 'app'
) {
    return callMarkRpc('mark_naming_stale_for_color', {
        p_color_code: colorCode,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markNamingStaleForVersionRule(
    versionCode: string,
    namingType?: NamingType,
    origin = 'app'
) {
    return callMarkRpc('mark_naming_stale_for_version_rule', {
        p_version_code: versionCode,
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function markAllNamingStale(namingType?: NamingType, origin = 'backfill') {
    return callMarkRpc('mark_naming_stale_for_all', {
        p_naming_type: namingType ?? null,
        p_origin: origin,
    })
}

export async function processNamingJobsInline(maxRuntimeMs = 5000) {
    try {
        return await processNamingJobs({ maxRuntimeMs })
    } catch (error) {
        console.error('processNamingJobsInline error:', error)
        return null
    }
}
