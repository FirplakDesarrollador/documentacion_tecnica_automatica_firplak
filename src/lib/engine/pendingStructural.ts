import { dbQuery } from '@/lib/supabase'

export type PendingStructuralReasonCode = 'MISSING_ISOMETRIC' | 'MISSING_TEMPLATE_FIELD'
export type PendingStructuralSeverity = 'critical' | 'warning'
export type PendingStructuralReasonFilter = PendingStructuralReasonCode

export type PendingStructuralReason = {
  code: PendingStructuralReasonCode
  severity: PendingStructuralSeverity
  message: string
  fields: string[]
}

export type PendingStructuralSummary = {
  pendingCount: number
  criticalCount: number
  missingIsometricCount: number
  missingTemplateFieldCount: number
  translationCandidateCount: number
}

export type PendingStructuralDetail = {
  productId: string
  productCode: string
  productName: string
  severity: PendingStructuralSeverity
  reasons: PendingStructuralReason[]
}

export type PendingStructuralPage = {
  rows: PendingStructuralDetail[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

type PendingSummaryRow = {
  pending_count?: unknown
  critical_count?: unknown
  missing_isometric_count?: unknown
  missing_template_field_count?: unknown
  translation_candidate_count?: unknown
}

type PendingPageRow = {
  product_id?: unknown
  product_code?: unknown
  product_name?: unknown
  severity?: unknown
  reasons?: unknown
  total_count?: unknown
  page?: unknown
  page_size?: unknown
}

const DEFAULT_PAGE_SIZE = 50

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function isReasonCode(value: unknown): value is PendingStructuralReasonCode {
  return value === 'MISSING_ISOMETRIC' || value === 'MISSING_TEMPLATE_FIELD'
}

function isSeverity(value: unknown): value is PendingStructuralSeverity {
  return value === 'critical' || value === 'warning'
}

function normalizeFields(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function normalizeReasons(value: unknown): PendingStructuralReason[] {
  const rawReasons = typeof value === 'string' ? parseReasonsJson(value) : value
  if (!Array.isArray(rawReasons)) return []

  return rawReasons.flatMap(reason => {
    if (!reason || typeof reason !== 'object') return []
    const raw = reason as Record<string, unknown>
    if (!isReasonCode(raw.code)) return []

    return {
      code: raw.code,
      severity: isSeverity(raw.severity) ? raw.severity : 'critical',
      message: toText(raw.message, raw.code.replace(/_/g, ' ')),
      fields: normalizeFields(raw.fields),
    }
  })
}

function parseReasonsJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

export async function getPendingStructuralSummary(): Promise<PendingStructuralSummary> {
  const rows = await dbQuery('SELECT * FROM public.rpc_pending_structural_summary()') as PendingSummaryRow[]
  const row = rows?.[0] ?? {}

  return {
    pendingCount: toNumber(row.pending_count),
    criticalCount: toNumber(row.critical_count),
    missingIsometricCount: toNumber(row.missing_isometric_count),
    missingTemplateFieldCount: toNumber(row.missing_template_field_count),
    translationCandidateCount: toNumber(row.translation_candidate_count),
  }
}

export async function getPendingStructuralPage(options: {
  page?: number
  pageSize?: number
  reason?: PendingStructuralReasonFilter | null
} = {}): Promise<PendingStructuralPage> {
  const page = Math.max(1, Math.floor(options.page ?? 1))
  const pageSize = Math.max(1, Math.min(100, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE)))
  const reason = options.reason ?? null

  const rows = await dbQuery(
    'SELECT * FROM public.rpc_pending_structural_page($1, $2, $3)',
    [page, pageSize, reason],
  ) as PendingPageRow[]

  const totalCount = toNumber(rows?.[0]?.total_count)
  const resolvedPage = toNumber(rows?.[0]?.page, page)
  const resolvedPageSize = toNumber(rows?.[0]?.page_size, pageSize)
  const totalPages = Math.max(1, Math.ceil(totalCount / resolvedPageSize))

  return {
    rows: (rows ?? []).map(row => ({
      productId: toText(row.product_id),
      productCode: toText(row.product_code, 'Sin codigo'),
      productName: toText(row.product_name, 'Sin nombre'),
      severity: isSeverity(row.severity) ? row.severity : 'critical',
      reasons: normalizeReasons(row.reasons),
    })),
    totalCount,
    page: resolvedPage,
    pageSize: resolvedPageSize,
    totalPages,
    hasPreviousPage: resolvedPage > 1,
    hasNextPage: resolvedPage < totalPages,
  }
}

export function normalizePendingReasonFilter(value: unknown): PendingStructuralReasonFilter | null {
  return isReasonCode(value) ? value : null
}
