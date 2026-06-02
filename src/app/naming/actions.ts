'use server'

import { dbQuery } from '@/lib/supabase'
import { markNamingStaleForProductType } from '@/lib/engine/namingQueue'
import { processNamingJobs, type ProcessNamingJobsResult } from '@/lib/engine/namingProcessor'

export interface NamingJobSummary {
  id: string
  status: string
  scope_type: string
  scope_id: string | null
  naming_type: string | null
  total_count: number
  processed_count: number
  updated_at: string | null
  created_at: string | null
}

export interface NamingWorkStatus {
  hasWork: boolean
  activeJobs: NamingJobSummary[]
  staleVersions: number
  staleSkus: number
  staleTotal: number
}

type NamingJobRow = {
  id?: unknown
  status?: unknown
  scope_type?: unknown
  scope_id?: unknown
  naming_type?: unknown
  total_count?: unknown
  processed_count?: unknown
  created_at?: unknown
  updated_at?: unknown
}

function toNumber(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getNamingWorkStatusAction(): Promise<NamingWorkStatus> {
  const [jobs, counts] = await Promise.all([
    dbQuery(`
      SELECT id, status, scope_type, scope_id, naming_type, total_count, processed_count, created_at, updated_at
      FROM public.naming_recompute_jobs
      WHERE status IN ('pending', 'running')
      ORDER BY created_at ASC
      LIMIT 5
    `) || [],
    dbQuery(`
      SELECT
        (SELECT COUNT(*)::int FROM public.product_versions WHERE naming_stale = true) AS stale_versions,
        (SELECT COUNT(*)::int FROM public.product_skus WHERE naming_stale = true) AS stale_skus
    `) || [],
  ])

  const staleVersions = toNumber(counts[0]?.stale_versions)
  const staleSkus = toNumber(counts[0]?.stale_skus)
  const activeJobs = (jobs as NamingJobRow[]).map((job) => ({
    id: String(job.id),
    status: String(job.status || ''),
    scope_type: String(job.scope_type || ''),
    scope_id: job.scope_id ? String(job.scope_id) : null,
    naming_type: job.naming_type ? String(job.naming_type) : null,
    total_count: toNumber(job.total_count),
    processed_count: toNumber(job.processed_count),
    created_at: job.created_at ? String(job.created_at) : null,
    updated_at: job.updated_at ? String(job.updated_at) : null,
  }))

  return {
    hasWork: activeJobs.length > 0 || staleVersions + staleSkus > 0,
    activeJobs,
    staleVersions,
    staleSkus,
    staleTotal: staleVersions + staleSkus,
  }
}

export async function processPendingNamingWorkAction(maxRuntimeMs = 5000, limit = 50, leaseSeconds = 45): Promise<{
  processResult: ProcessNamingJobsResult
  status: NamingWorkStatus
}> {
  const processResult = await processNamingJobs({
    limit,
    maxRuntimeMs,
    leaseSeconds,
  })
  const status = await getNamingWorkStatusAction()
  return { processResult, status }
}

export async function enqueueProductTypeNamingWorkAction(productType: string, namingType: string): Promise<{
  jobId: string | null
  status: NamingWorkStatus
}> {
  const jobId = await markNamingStaleForProductType(productType, namingType, 'manual_naming_apply')
  const status = await getNamingWorkStatusAction()
  return { jobId, status }
}
