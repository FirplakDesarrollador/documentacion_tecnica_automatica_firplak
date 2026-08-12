'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, ClipboardCheck, LoaderCircle, MessageSquareText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import {
  saveEngineeringEstimationTechnicalReviewAction,
  type EngineeringEstimationReview,
  type EngineeringEstimationReviewStatus,
} from './actions'

const TECHNICAL_REVIEW_OPTIONS: Array<{ value: EngineeringEstimationReviewStatus; label: string }> = [
  { value: 'not_requested', label: 'Sin solicitar' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'reviewed', label: 'Revisada' },
  { value: 'observed', label: 'Con observaciones' },
]

function formatDateTime(value: string | null): string {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(date)
}

function formatDimensions(estimation: EngineeringEstimationReview): string {
  const values = [estimation.widthMm, estimation.depthMm, estimation.heightMm]
  if (values.every(value => value === null)) return 'Medidas pendientes'
  return `${values.map(value => value ?? '—').join(' × ')} mm`
}

function reviewStatusLabel(status: EngineeringEstimationReviewStatus): string {
  return TECHNICAL_REVIEW_OPTIONS.find(option => option.value === status)?.label ?? status
}

function reviewStatusVariant(status: EngineeringEstimationReviewStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'observed') return 'destructive'
  if (status === 'reviewed') return 'secondary'
  if (status === 'pending') return 'outline'
  return 'default'
}

type EstimationReviewCardProps = {
  estimation: EngineeringEstimationReview
  onSaved: (saved: EngineeringEstimationReview) => void
}

function EstimationReviewCard({ estimation, onSaved }: EstimationReviewCardProps) {
  const [technicalReviewStatus, setTechnicalReviewStatus] = useState<EngineeringEstimationReviewStatus>(
    estimation.technicalReviewStatus,
  )
  const [technicalReviewNote, setTechnicalReviewNote] = useState(estimation.technicalReviewNote ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const noteId = `technical-review-note-${estimation.id}`
  const statusId = `technical-review-status-${estimation.id}`

  function saveReview(): void {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      try {
        const saved = await saveEngineeringEstimationTechnicalReviewAction({
          id: estimation.id,
          technicalReviewStatus,
          technicalReviewNote,
        })
        setTechnicalReviewStatus(saved.technicalReviewStatus)
        setTechnicalReviewNote(saved.technicalReviewNote ?? '')
        onSaved(saved)
        setMessage('Revisión técnica registrada. Diseño puede continuar sin bloqueo.')
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo guardar la revisión técnica.')
      }
    })
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{estimation.provisionalName}</CardTitle>
            <CardDescription className="mt-1">
              {estimation.manufacturingProcess} · {formatDimensions(estimation)}
            </CardDescription>
          </div>
          <Badge variant={reviewStatusVariant(estimation.technicalReviewStatus)}>
            {reviewStatusLabel(estimation.technicalReviewStatus)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Propuesta</dt>
            <dd className="mt-1 font-medium text-slate-800">{estimation.sapPrefix}-{estimation.proposedReferenceCode ?? 'sin consecutivo'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Homólogo SAP</dt>
            <dd className="mt-1 font-medium text-slate-800">{estimation.homologueSapItemCode ?? 'Sin seleccionar'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Familia / color</dt>
            <dd className="mt-1 font-medium text-slate-800">{estimation.familyCode ?? 'Pendiente'} · {estimation.colorCode ?? 'Pendiente'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actualizada</dt>
            <dd className="mt-1 font-medium text-slate-800">{formatDateTime(estimation.updatedAt)}</dd>
          </div>
        </dl>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor={statusId}>Estado de revisión</Label>
            <select
              id={statusId}
              value={technicalReviewStatus}
              disabled={isPending}
              onChange={event => setTechnicalReviewStatus(event.target.value as EngineeringEstimationReviewStatus)}
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {TECHNICAL_REVIEW_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={noteId}>Observación técnica <span className="font-normal text-slate-500">(opcional)</span></Label>
            <Textarea
              id={noteId}
              value={technicalReviewNote}
              disabled={isPending}
              onChange={event => setTechnicalReviewNote(event.target.value)}
              maxLength={4_000}
              placeholder="Criterio, riesgo o recomendación para Diseño. No bloquea la cotización."
              className="min-h-20"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={saveReview} disabled={isPending}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
            Guardar revisión
          </Button>
          <p className="text-xs text-slate-500">
            Última revisión: {formatDateTime(estimation.technicalReviewedAt)}
          </p>
        </div>

        {message ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
        {error ? <p role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
      </CardContent>
    </Card>
  )
}

export function EngineeringEstimationReviewsClient({
  initialEstimations,
}: {
  initialEstimations: EngineeringEstimationReview[]
}) {
  const [estimations, setEstimations] = useState(initialEstimations)

  function replaceSavedEstimation(saved: EngineeringEstimationReview): void {
    setEstimations(current => current.map(estimation => estimation.id === saved.id ? saved : estimation))
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-sky-700" />
          <div>
            <p className="font-semibold">Revisión técnica informativa</p>
            <p className="mt-1 text-sky-900">Registra criterio y observaciones de Ingeniería. No cambia ni bloquea el estado de la cotización de Diseño.</p>
          </div>
        </div>
      </div>

      {estimations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-600">
            Aún no hay cotizaciones para revisar.
          </CardContent>
        </Card>
      ) : (
        estimations.map(estimation => (
          <EstimationReviewCard key={estimation.id} estimation={estimation} onSaved={replaceSavedEstimation} />
        ))
      )}
    </section>
  )
}
