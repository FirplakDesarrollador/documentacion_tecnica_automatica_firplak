'use client'

import { useState } from 'react'
import { AlertCircle, Calculator, ChevronRight, FileText, Package, Ruler } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SalesEstimationView } from './actions'

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number | null, maximumFractionDigits = 2): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits }).format(value)
}

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Sin fecha'
    : date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: '2-digit' })
}

function dimensionsLabel(estimation: SalesEstimationView): string {
  const dimensions = [
    estimation.dimensions.widthMm,
    estimation.dimensions.depthMm,
    estimation.dimensions.heightMm,
  ]
  return dimensions.some((dimension) => dimension !== null)
    ? dimensions.map((dimension) => dimension === null ? '—' : `${formatNumber(dimension)} mm`).join(' × ')
    : 'Medidas pendientes'
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    active: 'Activa',
    closed: 'Cerrada',
    archived: 'Archivada',
    not_requested: 'No solicitada',
    pending: 'Pendiente',
    reviewed: 'Revisada',
    observed: 'Con observaciones',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    not_pursued: 'No continuó',
  }
  return labels[value] ?? value
}

function outcomeVariant(value: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (value === 'approved') return 'secondary'
  if (value === 'rejected') return 'destructive'
  return 'outline'
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function PricingSummary({ estimation }: { estimation: SalesEstimationView }) {
  const { pricing, commercialScenario } = estimation
  if (pricing.state === 'pending') {
    return (
      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p>{pricing.message}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Metric label="Materiales y empaque" value={formatCurrency(pricing.materialsAndPackaging, pricing.currency)} />
      <Metric label="Total ampliado (MO/CIF)" value={formatCurrency(pricing.expandedTotal, pricing.currency)} />
      <Metric label="PVP propuesto" value={commercialScenario.pvp === null ? 'Pendiente' : formatCurrency(commercialScenario.pvp, commercialScenario.currency)} />
      <Metric label="Precio mínimo" value={commercialScenario.minimumPrice === null ? 'Pendiente' : formatCurrency(commercialScenario.minimumPrice, commercialScenario.currency)} />
      <Metric label="Precio máximo" value={commercialScenario.maximumPrice === null ? 'Pendiente' : formatCurrency(commercialScenario.maximumPrice, commercialScenario.currency)} />
      <Metric label="MC" value={commercialScenario.contributionMarginPct === null ? 'Pendiente' : `${formatNumber(commercialScenario.contributionMarginPct)} %`} />
    </div>
  )
}

function EstimationDetail({ estimation }: { estimation: SalesEstimationView }) {
  const { geometry, commercialScenario } = estimation

  return (
    <section className="space-y-4" aria-live="polite">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{estimation.provisionalName}</CardTitle>
              <CardDescription>
                {estimation.sapPrefix} · {estimation.proposedReferenceCode ?? 'Consecutivo pendiente'} · {dimensionsLabel(estimation)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{statusLabel(estimation.status)}</Badge>
              <Badge variant={outcomeVariant(estimation.commercialResponse.outcome)}>
                {statusLabel(estimation.commercialResponse.outcome)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <FileText className="h-4 w-4 text-sky-700" />
            Compartida por Diseño el {formatDate(estimation.sharedAt)}. Actualizada el {formatDate(estimation.updatedAt)}.
          </div>

          <div className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Calculator className="h-4 w-4 text-sky-700" />Costo y escenario comercial</h2>
            <PricingSummary estimation={estimation} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Package className="h-4 w-4 text-sky-700" />Producto y color</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Homólogo SAP" value={estimation.homologueSapItemCode ?? 'Pendiente'} />
                <Metric label="Familia local" value={estimation.familyCode ?? 'Pendiente'} />
                <Metric label="Color comercial" value={[estimation.color.commercialCode, estimation.color.commercialName].filter(Boolean).join(' · ') || 'Pendiente'} />
                <Metric label="Gelcoat seleccionado" value={[estimation.color.gelcoatItemCode, estimation.color.gelcoatItemName].filter(Boolean).join(' · ') || 'Pendiente'} />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Ruler className="h-4 w-4 text-sky-700" />Modelo y consumos</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Volumen CAD" value={geometry.volumeMm3 === null ? 'Pendiente' : `${formatNumber(geometry.volumeMm3, 0)} mm³`} />
                <Metric label="Área de pintura" value={geometry.paintAreaMm2 === null ? 'Pendiente' : `${formatNumber(geometry.paintAreaMm2, 0)} mm²`} />
                <Metric label="Mezcla estimada" value={geometry.estimatedMixtureKg === null ? 'Pendiente' : `${formatNumber(geometry.estimatedMixtureKg, 3)} kg`} />
                <Metric label="Gelcoat estimado" value={geometry.estimatedGelcoatKg === null ? 'Pendiente' : `${formatNumber(geometry.estimatedGelcoatKg, 3)} kg`} />
              </div>
              {geometry.calibrationSampleCount !== null && (
                <p className="text-xs text-slate-500">Estimación de Mármol Sintético congelada con {geometry.calibrationSampleCount} muestras válidas.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Revisión técnica</h2>
              <p className="mt-1 text-sm text-slate-600">{statusLabel(estimation.technicalReview.status)}{estimation.technicalReview.reviewedAt ? ` · ${formatDate(estimation.technicalReview.reviewedAt)}` : ''}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{estimation.technicalReview.note ?? 'Sin observaciones registradas.'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Respuesta comercial externa</h2>
              <p className="mt-1 text-sm text-slate-600">{statusLabel(estimation.commercialResponse.outcome)}{estimation.commercialResponse.outcomeAt ? ` · ${formatDate(estimation.commercialResponse.outcomeAt)}` : ''}</p>
              {estimation.commercialResponse.contactName && <p className="mt-2 text-sm text-slate-700">Contacto: {estimation.commercialResponse.contactName}</p>}
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{estimation.commercialResponse.note ?? 'Sin respuesta externa registrada.'}</p>
            </div>
          </div>

          {commercialScenario.notes && (
            <div className="rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
              <p className="font-semibold">Notas del escenario comercial</p>
              <p className="mt-1 whitespace-pre-wrap">{commercialScenario.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

export function SalesEstimationsClient({ initialEstimations }: { initialEstimations: SalesEstimationView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(() => initialEstimations[0]?.id ?? null)
  const selectedEstimation = initialEstimations.find((estimation) => estimation.id === selectedId) ?? null

  if (initialEstimations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-sky-700" />No hay cotizaciones compartidas</CardTitle>
          <CardDescription>Cuando Diseño comparta una cotización, aparecerá aquí para consulta interna.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-3" aria-label="Cotizaciones compartidas">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Compartidas</h2>
          <Badge variant="outline">{initialEstimations.length}</Badge>
        </div>
        <div className="grid gap-2">
          {initialEstimations.map((estimation) => {
            const selected = estimation.id === selectedId
            return (
              <button
                key={estimation.id}
                type="button"
                onClick={() => setSelectedId(estimation.id)}
                aria-pressed={selected}
                className={`w-full rounded-xl border p-4 text-left transition ${selected ? 'border-sky-300 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{estimation.provisionalName}</p>
                    <p className="mt-1 text-xs text-slate-600">{estimation.sapPrefix} · {estimation.proposedReferenceCode ?? 'Pendiente'}</p>
                    <p className="mt-1 text-xs text-slate-500">{dimensionsLabel(estimation)}</p>
                  </div>
                  <ChevronRight className={`mt-1 h-4 w-4 shrink-0 ${selected ? 'text-sky-700' : 'text-slate-400'}`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{statusLabel(estimation.status)}</Badge>
                  <Badge variant={outcomeVariant(estimation.commercialResponse.outcome)}>{statusLabel(estimation.commercialResponse.outcome)}</Badge>
                </div>
              </button>
            )
          })}
        </div>
      </aside>
      {selectedEstimation && <EstimationDetail estimation={selectedEstimation} />}
    </div>
  )
}
