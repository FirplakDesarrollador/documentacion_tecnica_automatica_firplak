'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FilePlus2,
  FlaskConical,
  Loader2,
  Pencil,
  Plus,
  Ruler,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  SYNTHETIC_MARBLE_CALIBRATION_GROUP,
} from '@/lib/productDesign/estimationCalibration'
import type {
  EngineeringMeasurement,
  EngineeringMeasurementDraftInput,
  EngineeringMeasurementStatus,
} from '@/lib/productDesign/engineeringMeasurements'

import {
  changeEngineeringMeasurementStatusAction,
  createEngineeringMeasurementAction,
  updateEngineeringMeasurementAction,
} from './actions'

type EngineeringMeasurementsClientProps = {
  initialMeasurements: EngineeringMeasurement[]
  initialError: string | null
}

type MeasurementFormState = {
  calibrationGroup: string
  sampleLabel: string
  sapPrefix: string
  familyCode: string
  productReferenceId: string
  productVersionId: string
  productSkuId: string
  sapItemCode: string
  legacyProductName: string
  colorCode: string
  cadVolumeMm3: string
  paintAreaMm2: string
  mixtureKg: string
  gelcoatKg: string
  actualNetWeightKg: string
  actualGrossWeightKg: string
  measuredAt: string
  productionLot: string
  sourceType: string
  sourceFile: string
  sourceSheet: string
  sourceRow: string
  sourceEvidenceJson: string
  notes: string
}

function createEmptyForm(): MeasurementFormState {
  return {
    calibrationGroup: SYNTHETIC_MARBLE_CALIBRATION_GROUP,
    sampleLabel: '',
    sapPrefix: '',
    familyCode: '',
    productReferenceId: '',
    productVersionId: '',
    productSkuId: '',
    sapItemCode: '',
    legacyProductName: '',
    colorCode: '',
    cadVolumeMm3: '',
    paintAreaMm2: '',
    mixtureKg: '',
    gelcoatKg: '',
    actualNetWeightKg: '',
    actualGrossWeightKg: '',
    measuredAt: '',
    productionLot: '',
    sourceType: 'manual',
    sourceFile: '',
    sourceSheet: '',
    sourceRow: '',
    sourceEvidenceJson: '{}',
    notes: '',
  }
}

function nullableNumberInput(value: number | null): string {
  return value === null ? '' : String(value)
}

function formFromMeasurement(measurement: EngineeringMeasurement): MeasurementFormState {
  return {
    calibrationGroup: measurement.calibrationGroup,
    sampleLabel: measurement.sampleLabel,
    sapPrefix: measurement.sapPrefix ?? '',
    familyCode: measurement.familyCode ?? '',
    productReferenceId: measurement.productReferenceId ?? '',
    productVersionId: measurement.productVersionId ?? '',
    productSkuId: measurement.productSkuId ?? '',
    sapItemCode: measurement.sapItemCode ?? '',
    legacyProductName: measurement.legacyProductName ?? '',
    colorCode: measurement.colorCode ?? '',
    cadVolumeMm3: nullableNumberInput(measurement.cadVolumeMm3),
    paintAreaMm2: nullableNumberInput(measurement.paintAreaMm2),
    mixtureKg: nullableNumberInput(measurement.mixtureKg),
    gelcoatKg: nullableNumberInput(measurement.gelcoatKg),
    actualNetWeightKg: nullableNumberInput(measurement.actualNetWeightKg),
    actualGrossWeightKg: nullableNumberInput(measurement.actualGrossWeightKg),
    measuredAt: measurement.measuredAt ?? '',
    productionLot: measurement.productionLot ?? '',
    sourceType: measurement.sourceType,
    sourceFile: measurement.sourceFile ?? '',
    sourceSheet: measurement.sourceSheet ?? '',
    sourceRow: nullableNumberInput(measurement.sourceRow),
    sourceEvidenceJson: JSON.stringify(measurement.sourceEvidenceJson, null, 2),
    notes: measurement.notes ?? '',
  }
}

function parseEvidenceJson(value: string): Record<string, unknown> {
  const normalized = value.trim()
  if (!normalized) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized) as unknown
  } catch {
    throw new Error('La evidencia debe contener un objeto JSON válido.')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('La evidencia debe contener un objeto JSON válido.')
  }
  return parsed as Record<string, unknown>
}

function formToDraft(form: MeasurementFormState): EngineeringMeasurementDraftInput {
  return {
    calibrationGroup: form.calibrationGroup,
    sampleLabel: form.sampleLabel,
    sapPrefix: form.sapPrefix,
    familyCode: form.familyCode,
    productReferenceId: form.productReferenceId,
    productVersionId: form.productVersionId,
    productSkuId: form.productSkuId,
    sapItemCode: form.sapItemCode,
    legacyProductName: form.legacyProductName,
    colorCode: form.colorCode,
    cadVolumeMm3: form.cadVolumeMm3,
    paintAreaMm2: form.paintAreaMm2,
    mixtureKg: form.mixtureKg,
    gelcoatKg: form.gelcoatKg,
    actualNetWeightKg: form.actualNetWeightKg,
    actualGrossWeightKg: form.actualGrossWeightKg,
    measuredAt: form.measuredAt,
    productionLot: form.productionLot,
    sourceType: form.sourceType,
    sourceFile: form.sourceFile,
    sourceSheet: form.sourceSheet,
    sourceRow: form.sourceRow,
    sourceEvidenceJson: parseEvidenceJson(form.sourceEvidenceJson),
    notes: form.notes,
  }
}

function formatNumber(value: number | null, maximumFractionDigits = 3): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits }).format(value)
}

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha'
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u)
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  return value
}

function statusLabel(status: EngineeringMeasurementStatus): string {
  return {
    pending: 'Pendiente',
    valid: 'Válida',
    excluded: 'Excluida',
  }[status]
}

function statusVariant(status: EngineeringMeasurementStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'valid') return 'secondary'
  if (status === 'excluded') return 'destructive'
  return 'default'
}

function statusIcon(status: EngineeringMeasurementStatus) {
  if (status === 'valid') return <CheckCircle2 className="h-3.5 w-3.5" />
  if (status === 'excluded') return <XCircle className="h-3.5 w-3.5" />
  return <CircleDashed className="h-3.5 w-3.5" />
}

function sortMeasurements(measurements: EngineeringMeasurement[]): EngineeringMeasurement[] {
  return [...measurements].sort((left, right) => {
    const leftDate = left.measuredAt ?? left.updatedAt
    const rightDate = right.measuredAt ?? right.updatedAt
    return rightDate.localeCompare(leftDate)
  })
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-slate-700">{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  )
}

function CalibrationSummary({ measurements }: { measurements: EngineeringMeasurement[] }) {
  const summary = useMemo(() => {
    const validMeasurements = measurements.filter(measurement => (
      measurement.calibrationGroup === SYNTHETIC_MARBLE_CALIBRATION_GROUP
      && measurement.measurementStatus === 'valid'
      && measurement.cadVolumeMm3 !== null
      && measurement.paintAreaMm2 !== null
      && measurement.mixtureKg !== null
      && measurement.gelcoatKg !== null
    ))
    const totals = validMeasurements.reduce(
      (current, measurement) => ({
        volumeMm3: current.volumeMm3 + (measurement.cadVolumeMm3 ?? 0),
        paintAreaMm2: current.paintAreaMm2 + (measurement.paintAreaMm2 ?? 0),
        mixtureKg: current.mixtureKg + (measurement.mixtureKg ?? 0),
        gelcoatKg: current.gelcoatKg + (measurement.gelcoatKg ?? 0),
      }),
      { volumeMm3: 0, paintAreaMm2: 0, mixtureKg: 0, gelcoatKg: 0 },
    )

    return {
      count: validMeasurements.length,
      mixtureFactor: totals.volumeMm3 > 0 ? totals.mixtureKg / totals.volumeMm3 : null,
      gelcoatFactor: totals.paintAreaMm2 > 0 ? totals.gelcoatKg / totals.paintAreaMm2 : null,
    }
  }, [measurements])

  return (
    <Card className="border-sky-200 bg-sky-50/40">
      <CardHeader className="border-b border-sky-100">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-sky-100 p-2 text-sky-700"><FlaskConical className="h-5 w-5" /></div>
          <div>
            <CardTitle>Calibración activa: Mármol Sintético</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Sólo las muestras <strong>válidas</strong> alimentan el cotizador. Se usa razón de totales: no se toma una muestra individual como regla ni se compara contra un producto puntual.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
        <div className="rounded-lg border border-sky-100 bg-white px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Muestras válidas</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{summary.count}</p>
        </div>
        <div className="rounded-lg border border-sky-100 bg-white px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mezcla / volumen total</p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-900">
            {summary.mixtureFactor === null ? 'Sin base suficiente' : summary.mixtureFactor.toExponential(6)} kg/mm³
          </p>
        </div>
        <div className="rounded-lg border border-sky-100 bg-white px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gelcoat / área total</p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-900">
            {summary.gelcoatFactor === null ? 'Sin base suficiente' : summary.gelcoatFactor.toExponential(6)} kg/mm²
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function EngineeringMeasurementsClient({
  initialMeasurements,
  initialError,
}: EngineeringMeasurementsClientProps) {
  const [measurements, setMeasurements] = useState(() => sortMeasurements(initialMeasurements))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<MeasurementFormState>(createEmptyForm)
  const [formError, setFormError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedMeasurement = useMemo(
    () => measurements.find(measurement => measurement.id === selectedId) ?? null,
    [measurements, selectedId],
  )
  const validCount = useMemo(
    () => measurements.filter(measurement => (
      measurement.calibrationGroup === SYNTHETIC_MARBLE_CALIBRATION_GROUP
      && measurement.measurementStatus === 'valid'
    )).length,
    [measurements],
  )

  function updateForm(field: keyof MeasurementFormState, value: string): void {
    setForm(current => ({ ...current, [field]: value }))
  }

  function beginNewMeasurement(): void {
    setSelectedId(null)
    setForm(createEmptyForm())
    setFormError(null)
    setNotice(null)
  }

  function editMeasurement(measurement: EngineeringMeasurement): void {
    setSelectedId(measurement.id)
    setForm(formFromMeasurement(measurement))
    setFormError(null)
    setNotice(null)
  }

  function upsertMeasurement(measurement: EngineeringMeasurement): void {
    setMeasurements(current => sortMeasurements([
      measurement,
      ...current.filter(candidate => candidate.id !== measurement.id),
    ]))
    setSelectedId(measurement.id)
    setForm(formFromMeasurement(measurement))
  }

  function saveMeasurement(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    let draft: EngineeringMeasurementDraftInput
    try {
      draft = formToDraft(form)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Revise la evidencia de la muestra.')
      return
    }

    const editingId = selectedId
    startTransition(async () => {
      const result = editingId
        ? await updateEngineeringMeasurementAction({ id: editingId, draft })
        : await createEngineeringMeasurementAction(draft)

      if (result.error || !result.measurement) {
        setFormError(result.error ?? 'No se pudo guardar la medición.')
        return
      }

      upsertMeasurement(result.measurement)
      setFormError(null)
      setNotice(editingId
        ? 'Medición actualizada. Su estado se conserva hasta que Ingeniería lo cambie explícitamente.'
        : 'Medición registrada como pendiente de validación.')
    })
  }

  function changeStatus(nextStatus: EngineeringMeasurementStatus): void {
    if (!selectedMeasurement) return
    const measurementId = selectedMeasurement.id
    startTransition(async () => {
      const result = await changeEngineeringMeasurementStatusAction({
        id: measurementId,
        measurementStatus: nextStatus,
      })
      if (result.error || !result.measurement) {
        setFormError(result.error ?? 'No se pudo actualizar el estado.')
        return
      }

      upsertMeasurement(result.measurement)
      setFormError(null)
      setNotice(nextStatus === 'valid'
        ? 'Muestra validada: ya alimenta la razón de totales del cotizador.'
        : nextStatus === 'excluded'
          ? 'Muestra excluida: deja de alimentar la calibración.'
          : 'Muestra marcada como pendiente: deja de alimentar la calibración hasta una nueva validación.')
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-soft sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-700"><Ruler className="h-4 w-4" />Ingeniería</div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Mediciones de consumo</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Registra la geometría del CAD y los consumos reales de planta que sirven como evidencia para estimar productos nuevos. Este registro no crea artículos, referencias ni LdM en SAP.
          </p>
        </div>
        <Button type="button" onClick={beginNewMeasurement} disabled={isPending} className="bg-sky-700 text-white hover:bg-sky-800">
          <Plus className="mr-2 h-4 w-4" />Nueva muestra
        </Button>
      </header>

      <CalibrationSummary measurements={measurements} />

      {initialError ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No fue posible cargar todo el historial: {initialError}</span>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
        <Card>
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Muestras registradas</CardTitle>
                <CardDescription>
                  {measurements.length} en total · {validCount} válidas para la calibración activa.
                </CardDescription>
              </div>
              <Badge variant="outline">No modifica SAP</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Muestra</TableHead>
                  <TableHead>Producto y trazabilidad</TableHead>
                  <TableHead>CAD</TableHead>
                  <TableHead>Consumo real</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {measurements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-28 text-center text-slate-500">
                      Aún no hay muestras. Registre una toma real para iniciar su validación.
                    </TableCell>
                  </TableRow>
                ) : null}
                {measurements.map(measurement => (
                  <TableRow key={measurement.id} data-state={selectedId === measurement.id ? 'selected' : undefined}>
                    <TableCell className="whitespace-normal">
                      <p className="font-semibold text-slate-900">{measurement.sampleLabel}</p>
                      <p className="mt-1 text-xs text-slate-500">{measurement.calibrationGroup} · {formatDate(measurement.measuredAt)}</p>
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal">
                      <p className="font-medium text-slate-800">{measurement.sapItemCode ?? measurement.legacyProductName ?? 'Sin código asociado'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {[measurement.familyCode, measurement.colorCode ? `Color ${measurement.colorCode}` : null].filter(Boolean).join(' · ') || 'Sin familia ni color formal'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p>{formatNumber(measurement.cadVolumeMm3)} mm³</p>
                      <p className="mt-1 text-xs text-slate-500">{formatNumber(measurement.paintAreaMm2)} mm²</p>
                    </TableCell>
                    <TableCell>
                      <p>{formatNumber(measurement.mixtureKg)} kg mezcla</p>
                      <p className="mt-1 text-xs text-slate-500">{formatNumber(measurement.gelcoatKg)} kg gelcoat</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(measurement.measurementStatus)}>
                        {statusIcon(measurement.measurementStatus)}{statusLabel(measurement.measurementStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="sm" variant="outline" onClick={() => editMeasurement(measurement)} disabled={isPending}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="self-start border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-700"><FilePlus2 className="h-5 w-5" /></div>
              <div>
                <CardTitle>{selectedMeasurement ? 'Editar muestra' : 'Registrar muestra'}</CardTitle>
                <CardDescription>
                  {selectedMeasurement
                    ? `Estado actual: ${statusLabel(selectedMeasurement.measurementStatus)}. Guardar datos no cambia este estado.`
                    : 'Las nuevas muestras quedan pendientes hasta que Ingeniería las valide.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {formError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{formError}</span>
              </div>
            ) : null}
            {notice ? (
              <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span>
              </div>
            ) : null}

            <form className="space-y-5" onSubmit={saveMeasurement}>
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ClipboardCheck className="h-4 w-4 text-sky-700" />Identificación</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Grupo de calibración">
                    <Input value={form.calibrationGroup} onChange={event => updateForm('calibrationGroup', event.target.value)} placeholder="MÁRMOL SINTÉTICO" disabled={isPending} />
                  </Field>
                  <Field label="Etiqueta de la muestra">
                    <Input value={form.sampleLabel} onChange={event => updateForm('sampleLabel', event.target.value)} placeholder="Toma de planta agosto" disabled={isPending} required />
                  </Field>
                  <Field label="Código SAP" hint="Opcional; el registro puede existir antes del producto formal.">
                    <Input value={form.sapItemCode} onChange={event => updateForm('sapItemCode', event.target.value)} placeholder="VBAN29-0048-000-0000" disabled={isPending} />
                  </Field>
                  <Field label="Nombre legado o descriptivo">
                    <Input value={form.legacyProductName} onChange={event => updateForm('legacyProductName', event.target.value)} placeholder="Mesón Oasis" disabled={isPending} />
                  </Field>
                  <Field label="Prefijo SAP">
                    <Input value={form.sapPrefix} onChange={event => updateForm('sapPrefix', event.target.value)} placeholder="VBAN29" disabled={isPending} />
                  </Field>
                  <Field label="Familia local">
                    <Input value={form.familyCode} onChange={event => updateForm('familyCode', event.target.value)} placeholder="BAN29" disabled={isPending} />
                  </Field>
                  <Field label="Color comercial" hint="Código de cuatro dígitos, si se conoce.">
                    <Input value={form.colorCode} onChange={event => updateForm('colorCode', event.target.value)} placeholder="0437" maxLength={4} disabled={isPending} />
                  </Field>
                  <Field label="Fecha de la toma">
                    <Input type="date" value={form.measuredAt} onChange={event => updateForm('measuredAt', event.target.value)} disabled={isPending} />
                  </Field>
                </div>
              </section>

              <section className="space-y-3 border-t border-slate-100 pt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Ruler className="h-4 w-4 text-sky-700" />Geometría CAD y consumo real</div>
                <p className="text-xs leading-5 text-slate-500">Los cuatro valores de geometría y consumo son necesarios para calibrar. Los pesos reales enriquecen el aprendizaje físico cuando estén disponibles.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Volumen CAD (mm³)">
                    <Input type="number" min="0" step="any" inputMode="decimal" value={form.cadVolumeMm3} onChange={event => updateForm('cadVolumeMm3', event.target.value)} placeholder="0" disabled={isPending} />
                  </Field>
                  <Field label="Área de pintura (mm²)">
                    <Input type="number" min="0" step="any" inputMode="decimal" value={form.paintAreaMm2} onChange={event => updateForm('paintAreaMm2', event.target.value)} placeholder="0" disabled={isPending} />
                  </Field>
                  <Field label="Mezcla consumida (kg)">
                    <Input type="number" min="0" step="any" inputMode="decimal" value={form.mixtureKg} onChange={event => updateForm('mixtureKg', event.target.value)} placeholder="0" disabled={isPending} />
                  </Field>
                  <Field label="Gelcoat consumido (kg)">
                    <Input type="number" min="0" step="any" inputMode="decimal" value={form.gelcoatKg} onChange={event => updateForm('gelcoatKg', event.target.value)} placeholder="0" disabled={isPending} />
                  </Field>
                  <Field label="Peso neto real (kg)">
                    <Input type="number" min="0" step="any" inputMode="decimal" value={form.actualNetWeightKg} onChange={event => updateForm('actualNetWeightKg', event.target.value)} placeholder="Sin empaque" disabled={isPending} />
                  </Field>
                  <Field label="Peso bruto real (kg)">
                    <Input type="number" min="0" step="any" inputMode="decimal" value={form.actualGrossWeightKg} onChange={event => updateForm('actualGrossWeightKg', event.target.value)} placeholder="Con empaque" disabled={isPending} />
                  </Field>
                </div>
              </section>

              <section className="space-y-3 border-t border-slate-100 pt-5">
                <div className="text-sm font-semibold text-slate-800">Trazabilidad</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Origen">
                    <Input value={form.sourceType} onChange={event => updateForm('sourceType', event.target.value)} placeholder="manual, planta, excel histórico" disabled={isPending} />
                  </Field>
                  <Field label="Lote de producción">
                    <Input value={form.productionLot} onChange={event => updateForm('productionLot', event.target.value)} disabled={isPending} />
                  </Field>
                  <Field label="Archivo de origen">
                    <Input value={form.sourceFile} onChange={event => updateForm('sourceFile', event.target.value)} placeholder="Costeo inicial.xlsx" disabled={isPending} />
                  </Field>
                  <Field label="Hoja / fila">
                    <div className="grid grid-cols-[1fr_5rem] gap-2">
                      <Input value={form.sourceSheet} onChange={event => updateForm('sourceSheet', event.target.value)} placeholder="Mármol sintético" disabled={isPending} />
                      <Input type="number" min="1" step="1" value={form.sourceRow} onChange={event => updateForm('sourceRow', event.target.value)} placeholder="Fila" disabled={isPending} />
                    </div>
                  </Field>
                </div>
                <Field label="Evidencia adicional (JSON)" hint="Se preserva al editar; use un objeto, por ejemplo {&quot;fuente&quot;:&quot;planta&quot;}.">
                  <Textarea value={form.sourceEvidenceJson} onChange={event => updateForm('sourceEvidenceJson', event.target.value)} className="min-h-20 font-mono text-xs" disabled={isPending} />
                </Field>
                <Field label="Notas">
                  <Textarea value={form.notes} onChange={event => updateForm('notes', event.target.value)} placeholder="Condiciones de la toma, observaciones de planta o motivo de exclusión." disabled={isPending} />
                </Field>
              </section>

              <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Vínculos formales opcionales</summary>
                <p className="mt-2 text-xs leading-5 text-slate-500">Úselos sólo cuando la familia, referencia, versión o SKU ya existan; una toma histórica puede no tenerlos.</p>
                <div className="mt-3 grid gap-3">
                  <Field label="UUID de referencia"><Input value={form.productReferenceId} onChange={event => updateForm('productReferenceId', event.target.value)} placeholder="UUID" disabled={isPending} /></Field>
                  <Field label="UUID de versión"><Input value={form.productVersionId} onChange={event => updateForm('productVersionId', event.target.value)} placeholder="UUID" disabled={isPending} /></Field>
                  <Field label="UUID de SKU"><Input value={form.productSkuId} onChange={event => updateForm('productSkuId', event.target.value)} placeholder="UUID" disabled={isPending} /></Field>
                </div>
              </details>

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                {selectedMeasurement ? <Button type="button" variant="outline" onClick={beginNewMeasurement} disabled={isPending}>Cancelar edición</Button> : null}
                <Button type="submit" disabled={isPending} className="bg-firplak-green text-white hover:bg-firplak-green/90">
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
                  {selectedMeasurement ? 'Guardar cambios' : 'Registrar muestra'}
                </Button>
              </div>
            </form>

            {selectedMeasurement ? (
              <section className="space-y-3 border-t border-slate-100 pt-5">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Estado de validación</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Cambiar el estado es explícito. Editar los datos no devuelve automáticamente una muestra válida a pendiente.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={isPending || selectedMeasurement.measurementStatus === 'pending'} onClick={() => changeStatus('pending')}>Marcar pendiente</Button>
                  <Button type="button" size="sm" disabled={isPending || selectedMeasurement.measurementStatus === 'valid'} onClick={() => changeStatus('valid')} className="bg-sky-700 text-white hover:bg-sky-800"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Validar</Button>
                  <Button type="button" size="sm" variant="outline" disabled={isPending || selectedMeasurement.measurementStatus === 'excluded'} onClick={() => changeStatus('excluded')} className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"><XCircle className="mr-1.5 h-3.5 w-3.5" />Excluir</Button>
                </div>
              </section>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
