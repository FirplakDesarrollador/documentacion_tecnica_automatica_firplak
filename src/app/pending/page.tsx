import Link from 'next/link'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'

import { TranslationConflictScanner } from '@/components/pending/TranslationConflictScanner'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getPendingStructuralPage,
  getPendingStructuralSummary,
  normalizePendingReasonFilter,
  type PendingStructuralReason,
  type PendingStructuralReasonFilter,
} from '@/lib/engine/pendingStructural'
import { dbQuery } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type PendingPageProps = {
  searchParams: Promise<{
    page?: string
    reason?: string
  }>
}

const PAGE_SIZE = 50

function parsePage(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}

function getPendingHref(page: number, reason: PendingStructuralReasonFilter | null) {
  const params = new URLSearchParams()
  if (page > 1) params.set('page', String(page))
  if (reason) params.set('reason', reason)

  const query = params.toString()
  return query ? `/pending?${query}` : '/pending'
}

async function getGlossaryCategories() {
  const rows = await dbQuery(`
    SELECT DISTINCT category
    FROM public.glossary
    WHERE category IS NOT NULL AND btrim(category) <> ''
    ORDER BY category ASC
  `) as { category?: unknown }[]

  return (rows ?? [])
    .map(row => row.category)
    .filter((category): category is string => typeof category === 'string' && category.trim().length > 0)
}

export default async function PendingPage({ searchParams }: PendingPageProps) {
  const params = await searchParams
  const currentPage = parsePage(params.page)
  const reasonFilter = normalizePendingReasonFilter(params.reason)
  const [summary, pendingPage, categories] = await Promise.all([
    getPendingStructuralSummary(),
    getPendingStructuralPage({ page: currentPage, pageSize: PAGE_SIZE, reason: reasonFilter }),
    getGlossaryCategories(),
  ])

  const reasonFilterLinks: { label: string; value: PendingStructuralReasonFilter | null; count: number }[] = [
    { label: 'Todos', value: null, count: summary.pendingCount },
    { label: 'Isometricos', value: 'MISSING_ISOMETRIC', count: summary.missingIsometricCount },
    { label: 'Campos de plantilla', value: 'MISSING_TEMPLATE_FIELD', count: summary.missingTemplateFieldCount },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600 ring-1 ring-amber-600/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            Pendientes
          </h1>
          <p className="text-slate-500 mt-2 text-sm max-w-2xl leading-relaxed">
            Reporte de productos activos/exportables que requieren accion por faltantes de plantillas,
            isometricos o traduccion EN pendiente de revisar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryMetric label="Pendientes estructurales" value={summary.pendingCount} tone="amber" />
        <SummaryMetric label="Criticos" value={summary.criticalCount} tone="rose" />
        <SummaryMetric label="Isometricos faltantes" value={summary.missingIsometricCount} tone="slate" />
        <SummaryMetric label="Campos de plantilla" value={summary.missingTemplateFieldCount} tone="slate" />
      </div>

      <TranslationConflictScanner
        candidateCount={summary.translationCandidateCount}
        categories={categories}
      />

      <div className="flex flex-wrap gap-2">
        {reasonFilterLinks.map(link => {
          const isActive = reasonFilter === link.value
          return (
            <Link
              key={link.label}
              href={getPendingHref(1, link.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-amber-300 bg-amber-100 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {link.label}: {link.count}
            </Link>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-600">
            Mostrando {pendingPage.rows.length} de {pendingPage.totalCount} productos
          </p>
          <p className="text-xs text-slate-500">
            Pagina {pendingPage.page} de {pendingPage.totalPages}
          </p>
        </div>
        <Table>
          <TableHeader className="bg-slate-50/50 text-slate-500">
            <TableRow>
              <TableHead className="uppercase tracking-wider text-[10px] font-bold">Producto / Codigo</TableHead>
              <TableHead className="uppercase tracking-wider text-[10px] font-bold">Severidad</TableHead>
              <TableHead className="uppercase tracking-wider text-[10px] font-bold">Motivos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingPage.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-green-600 font-medium">
                  No hay pendientes. Todos los productos evaluados estan listos.
                </TableCell>
              </TableRow>
            ) : (
              pendingPage.rows.map(({ productId, productCode, productName, severity, reasons }) => (
                <TableRow key={productId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">{productCode}</span>
                      <span className="text-[10px] text-slate-500">{productName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {severity === 'critical' ? (
                      <Badge className="bg-rose-50 text-rose-700 ring-1 ring-rose-700/10 hover:bg-rose-50 text-[10px] px-2 py-0.5 font-bold uppercase tracking-tight">
                        Critico
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 ring-1 ring-amber-700/10 hover:bg-amber-50 text-[10px] px-2 py-0.5 font-bold uppercase tracking-tight">
                        Advertencia
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5 py-1">
                      {reasons.map((reason: PendingStructuralReason) => (
                        <div key={`${productId}-${reason.code}`} className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={
                              reason.severity === 'critical'
                                ? 'text-[9px] font-bold border-none bg-rose-100 text-rose-700 px-1.5 py-0 uppercase tracking-tighter'
                                : 'text-[9px] font-bold border-none bg-amber-100 text-amber-800 px-1.5 py-0 uppercase tracking-tighter'
                            }
                          >
                            {reason.code.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-[11px] text-slate-700">{reason.message}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pendingPage.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Link
            href={getPendingHref(Math.max(1, pendingPage.page - 1), reasonFilter)}
            aria-disabled={!pendingPage.hasPreviousPage}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              !pendingPage.hasPreviousPage && 'pointer-events-none opacity-50',
            )}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Anterior
          </Link>
          <Link
            href={getPendingHref(Math.min(pendingPage.totalPages, pendingPage.page + 1), reasonFilter)}
            aria-disabled={!pendingPage.hasNextPage}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              !pendingPage.hasNextPage && 'pointer-events-none opacity-50',
            )}
          >
            Siguiente
            <ChevronRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'rose' | 'slate' }) {
  const toneClass = {
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
    slate: 'bg-white text-slate-800 border-slate-200',
  }[tone]

  return (
    <div className={cn('rounded-xl border p-4 shadow-sm', toneClass)}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums">{value}</p>
    </div>
  )
}
