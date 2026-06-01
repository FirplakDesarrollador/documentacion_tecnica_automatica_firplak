import { dbQuery, supabaseServer } from '@/lib/supabase'
import {
    recomputeMasterNamesForSkuIds,
    recomputeMasterNamesForVersionIds,
} from './masterNaming'

type NamingJob = {
    id: string
    scope_type: string
    scope_id: string | null
    scope_payload: Record<string, unknown> | null
    processed_count: number | null
    total_count: number | null
}

type SupabaseRpcClient = {
    rpc: (
        functionName: string,
        args?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>
}

export interface ProcessNamingJobsOptions {
    limit?: number
    maxRuntimeMs?: number
    leaseSeconds?: number
}

export interface ProcessNamingJobsResult {
    claimedJobs: number
    completedJobs: number
    deferredJobs: number
    failedJobs: number
    processedVersions: number
    processedSkus: number
    processedRows: number
    errors: string[]
}

function sqlString(value: string) {
    return `'${String(value).replace(/'/g, "''")}'`
}

function sqlList(values: string[]) {
    if (values.length === 0) return "''"
    return values.map(sqlString).join(',')
}

function payloadArray(job: NamingJob, key: string) {
    const raw = job.scope_payload?.[key]
    if (!Array.isArray(raw)) return []
    return Array.from(new Set(
        raw
            .map(value => String(value || '').trim())
            .filter(Boolean)
    ))
}

function normalizeScopeId(job: NamingJob) {
    return String(job.scope_id || '').trim().toUpperCase()
}

function buildVersionPredicate(job: NamingJob) {
    const scope = String(job.scope_type || '').trim()
    const scopeId = normalizeScopeId(job)

    if (scope === 'all') return 'true'
    if (scope === 'product_type' && scopeId) {
        return `upper(btrim(COALESCE(f.product_type, ''))) = ${sqlString(scopeId)}`
    }
    if (scope === 'families') {
        const values = payloadArray(job, 'family_codes').map(value => value.toUpperCase())
        return values.length > 0 ? `upper(btrim(r.family_code)) IN (${sqlList(values)})` : 'false'
    }
    if (scope === 'references') {
        const values = payloadArray(job, 'reference_ids')
        return values.length > 0 ? `v.reference_id IN (${sqlList(values)})` : 'false'
    }
    if (scope === 'versions') {
        const values = payloadArray(job, 'version_ids')
        return values.length > 0 ? `v.id IN (${sqlList(values)})` : 'false'
    }
    if (scope === 'version_rule' && scopeId) {
        return `upper(btrim(v.version_code)) = ${sqlString(scopeId)}`
    }

    return 'false'
}

function buildSkuPredicate(job: NamingJob) {
    const scope = String(job.scope_type || '').trim()
    const scopeId = normalizeScopeId(job)

    if (scope === 'all') return 'true'
    if (scope === 'product_type' && scopeId) {
        return `upper(btrim(COALESCE(f.product_type, ''))) = ${sqlString(scopeId)}`
    }
    if (scope === 'families') {
        const values = payloadArray(job, 'family_codes').map(value => value.toUpperCase())
        return values.length > 0 ? `upper(btrim(r.family_code)) IN (${sqlList(values)})` : 'false'
    }
    if (scope === 'references') {
        const values = payloadArray(job, 'reference_ids')
        return values.length > 0 ? `v.reference_id IN (${sqlList(values)})` : 'false'
    }
    if (scope === 'versions') {
        const values = payloadArray(job, 'version_ids')
        return values.length > 0 ? `v.id IN (${sqlList(values)})` : 'false'
    }
    if (scope === 'skus') {
        const values = payloadArray(job, 'sku_ids')
        return values.length > 0 ? `s.id IN (${sqlList(values)})` : 'false'
    }
    if (scope === 'color' && scopeId) {
        return `upper(btrim(s.color_code)) = ${sqlString(scopeId)}`
    }
    if (scope === 'version_rule' && scopeId) {
        return `upper(btrim(v.version_code)) = ${sqlString(scopeId)}`
    }

    return 'false'
}

async function claimNextJob(leaseSeconds: number): Promise<NamingJob | null> {
    const { data, error } = await (supabaseServer as unknown as SupabaseRpcClient).rpc('claim_next_naming_job', {
        p_lease_seconds: leaseSeconds,
    })
    if (error) throw new Error(error.message)
    const rows = Array.isArray(data) ? data : []
    return rows[0] ? rows[0] as NamingJob : null
}

async function countScopedStale(job: NamingJob) {
    const versionPredicate = buildVersionPredicate(job)
    const skuPredicate = buildSkuPredicate(job)
    const [versionRows, skuRows] = await Promise.all([
        dbQuery(`
            SELECT COUNT(*)::int AS count
            FROM public.product_versions v
            JOIN public.product_references r ON v.reference_id = r.id
            JOIN public.families f ON r.family_code = f.family_code
            WHERE v.naming_stale = true
              AND ${versionPredicate}
        `),
        dbQuery(`
            SELECT COUNT(*)::int AS count
            FROM public.product_skus s
            JOIN public.product_versions v ON s.version_id = v.id
            JOIN public.product_references r ON v.reference_id = r.id
            JOIN public.families f ON r.family_code = f.family_code
            WHERE s.naming_stale = true
              AND ${skuPredicate}
        `),
    ])

    const versionCount = Number(versionRows?.[0]?.count || 0)
    const skuCount = Number(skuRows?.[0]?.count || 0)
    return {
        versionCount,
        skuCount,
        total: versionCount + skuCount,
    }
}

async function getStaleVersionIds(job: NamingJob, limit: number) {
    const rows = await dbQuery(`
        SELECT v.id
        FROM public.product_versions v
        JOIN public.product_references r ON v.reference_id = r.id
        JOIN public.families f ON r.family_code = f.family_code
        WHERE v.naming_stale = true
          AND ${buildVersionPredicate(job)}
        ORDER BY v.naming_stale_at ASC NULLS FIRST, v.id ASC
        LIMIT ${limit}
    `) || []

    return rows.map((row: { id?: string }) => row.id).filter(Boolean) as string[]
}

async function getStaleSkuIds(job: NamingJob, limit: number) {
    const rows = await dbQuery(`
        SELECT s.id
        FROM public.product_skus s
        JOIN public.product_versions v ON s.version_id = v.id
        JOIN public.product_references r ON v.reference_id = r.id
        JOIN public.families f ON r.family_code = f.family_code
        WHERE s.naming_stale = true
          AND ${buildSkuPredicate(job)}
        ORDER BY s.naming_stale_at ASC NULLS FIRST, s.id ASC
        LIMIT ${limit}
    `) || []

    return rows.map((row: { id?: string }) => row.id).filter(Boolean) as string[]
}

async function updateJobTotal(jobId: string, total: number, leaseSeconds: number) {
    await dbQuery(`
        UPDATE public.naming_recompute_jobs
        SET total_count = GREATEST(total_count, $1),
            lease_expires_at = now() + make_interval(secs => $2),
            updated_at = now()
        WHERE id = $3
    `, [total, leaseSeconds, jobId])
}

async function addJobProgress(jobId: string, processed: number, leaseSeconds: number) {
    if (processed <= 0) return
    await dbQuery(`
        UPDATE public.naming_recompute_jobs
        SET processed_count = processed_count + $1,
            lease_expires_at = now() + make_interval(secs => $2),
            updated_at = now()
        WHERE id = $3
    `, [processed, leaseSeconds, jobId])
}

async function releaseJob(jobId: string) {
    await dbQuery(`
        UPDATE public.naming_recompute_jobs
        SET status = 'pending',
            locked_at = NULL,
            lease_expires_at = NULL,
            updated_at = now()
        WHERE id = $1
    `, [jobId])
}

async function finishJob(jobId: string) {
    await dbQuery(`
        UPDATE public.naming_recompute_jobs
        SET status = 'done',
            locked_at = NULL,
            lease_expires_at = NULL,
            finished_at = now(),
            total_count = GREATEST(total_count, processed_count),
            updated_at = now()
        WHERE id = $1
    `, [jobId])
}

async function failJob(jobId: string, errorMessage: string) {
    await dbQuery(`
        UPDATE public.naming_recompute_jobs
        SET status = 'failed',
            locked_at = NULL,
            lease_expires_at = NULL,
            last_error = $1,
            finished_at = now(),
            updated_at = now()
        WHERE id = $2
    `, [errorMessage.slice(0, 4000), jobId])
}

function hasRuntimeLeft(deadline: number) {
    return Date.now() + 250 < deadline
}

async function processJob(
    job: NamingJob,
    batchLimit: number,
    deadline: number,
    leaseSeconds: number,
    result: ProcessNamingJobsResult
) {
    const initialCounts = await countScopedStale(job)
    await updateJobTotal(job.id, initialCounts.total, leaseSeconds)

    while (hasRuntimeLeft(deadline)) {
        const versionIds = await getStaleVersionIds(job, batchLimit)
        if (versionIds.length > 0) {
            const recomputed = await recomputeMasterNamesForVersionIds(versionIds)
            const processed = recomputed.updatedVersions + recomputed.updatedSkus
            result.processedVersions += recomputed.updatedVersions
            result.processedSkus += recomputed.updatedSkus
            result.processedRows += processed
            await addJobProgress(job.id, processed, leaseSeconds)
            continue
        }

        const skuIds = await getStaleSkuIds(job, batchLimit)
        if (skuIds.length > 0) {
            const recomputed = await recomputeMasterNamesForSkuIds(skuIds)
            const processed = recomputed.updatedVersions + recomputed.updatedSkus
            result.processedVersions += recomputed.updatedVersions
            result.processedSkus += recomputed.updatedSkus
            result.processedRows += processed
            await addJobProgress(job.id, processed, leaseSeconds)
            continue
        }

        return false
    }

    const remaining = await countScopedStale(job)
    return remaining.total > 0
}

export async function processNamingJobs(options: ProcessNamingJobsOptions = {}): Promise<ProcessNamingJobsResult> {
    const batchLimit = Math.max(1, Math.min(Number(options.limit || 100), 500))
    const maxRuntimeMs = Math.max(1000, Math.min(Number(options.maxRuntimeMs || 25000), 55000))
    const leaseSeconds = Math.max(10, Number(options.leaseSeconds || 60))
    const deadline = Date.now() + maxRuntimeMs

    const result: ProcessNamingJobsResult = {
        claimedJobs: 0,
        completedJobs: 0,
        deferredJobs: 0,
        failedJobs: 0,
        processedVersions: 0,
        processedSkus: 0,
        processedRows: 0,
        errors: [],
    }

    while (hasRuntimeLeft(deadline)) {
        const job = await claimNextJob(leaseSeconds)
        if (!job) break

        result.claimedJobs += 1
        try {
            const hasMore = await processJob(job, batchLimit, deadline, leaseSeconds, result)
            if (hasMore) {
                await releaseJob(job.id)
                result.deferredJobs += 1
            } else {
                await finishJob(job.id)
                result.completedJobs += 1
            }
        } catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : 'Error desconocido recalculando nombres'
            result.errors.push(message)
            result.failedJobs += 1
            await failJob(job.id, message)
        }
    }

    return result
}
