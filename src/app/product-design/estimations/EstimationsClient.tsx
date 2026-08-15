'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Calculator, ChevronRight, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  copyHomologueIntoEstimationAction,
  createProductDesignEstimationAction,
  deleteProductDesignEstimationAction,
  getEstimationHomologueAction,
  proposeEstimationReferenceAction,
  searchEstimationHomologuesAction,
  type EstimationCommercialColorCandidate,
  type EstimationHomologue,
  type EstimationHomologueCandidate,
  type ProductDesignEstimationSummary,
} from './actions'
import { CommercialColorSelector } from './CommercialColorSelector'
import type { EstimationReferenceProposal } from '@/lib/productDesign/estimationReferenceProposal'

type EstimationForm = {
  provisionalName: string
  widthMm: string
  depthMm: string
  heightMm: string
  colorCode: string
  colorName: string
}

const EMPTY_FORM: EstimationForm = {
  provisionalName: '',
  widthMm: '',
  depthMm: '',
  heightMm: '',
  colorCode: '',
  colorName: '',
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.'
}

function optionalNumber(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Sin fecha'
    : date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: '2-digit' })
}

function dimensionsLabel(estimation: ProductDesignEstimationSummary): string {
  const dimensions = [estimation.widthMm, estimation.depthMm, estimation.heightMm]
  return dimensions.some((dimension) => dimension !== null)
    ? dimensions.map((dimension) => dimension === null ? '—' : `${dimension} cm`).join(' × ')
    : 'Medidas pendientes'
}

function dimensionDistance(candidate: EstimationHomologueCandidate, widthMm: string, depthMm: string): number {
  // Las dimensiones comerciales (p. ej. 40 × 50) se expresan en cm. Los
  // nombres SAP usan la misma convención; no se convierten a milímetros.
  const requestedWidthCm = optionalNumber(widthMm)
  const requestedDepthCm = optionalNumber(depthMm)
  if (requestedWidthCm === null || requestedDepthCm === null) return Number.POSITIVE_INFINITY
  const match = candidate.itemName.toUpperCase().match(/(?:^|\D)(\d{2,3})\s*[X×]\s*(\d{2,3})(?:\D|$)/u)
  if (!match) return Number.POSITIVE_INFINITY
  const firstCm = Number(match[1])
  const secondCm = Number(match[2])
  return Math.min(
    Math.abs(firstCm - requestedWidthCm) + Math.abs(secondCm - requestedDepthCm),
    Math.abs(secondCm - requestedWidthCm) + Math.abs(firstCm - requestedDepthCm),
  )
}

function rankHomologueCandidates(
  candidates: EstimationHomologueCandidate[],
  widthMm: string,
  depthMm: string,
): EstimationHomologueCandidate[] {
  return [...candidates].sort((left, right) => {
    const distance = dimensionDistance(left, widthMm, depthMm) - dimensionDistance(right, widthMm, depthMm)
    return Number.isNaN(distance) || distance === 0 ? left.itemCode.localeCompare(right.itemCode) : distance
  })
}

function statusBadgeVariant(status: ProductDesignEstimationSummary['status']) {
  return status === 'active' ? 'secondary' : status === 'closed' ? 'outline' : 'default'
}

export function EstimationsClient({
  initialEstimations,
  commercialColors,
}: {
  initialEstimations: ProductDesignEstimationSummary[]
  commercialColors: EstimationCommercialColorCandidate[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [estimations, setEstimations] = useState(initialEstimations)
  const [form, setForm] = useState<EstimationForm>(EMPTY_FORM)
  const [homologueQuery, setHomologueQuery] = useState('')
  const [homologueCandidates, setHomologueCandidates] = useState<EstimationHomologueCandidate[]>([])
  const [selectedHomologue, setSelectedHomologue] = useState<EstimationHomologue | null>(null)
  const [referenceProposal, setReferenceProposal] = useState<EstimationReferenceProposal | null>(null)
  const [isSearchingHomologue, setIsSearchingHomologue] = useState(false)
  const [selectingHomologue, setSelectingHomologue] = useState<EstimationHomologueCandidate | null>(null)
  const [deletingEstimation, setDeletingEstimation] = useState<ProductDesignEstimationSummary | null>(null)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)

  const updateForm = <Key extends keyof EstimationForm>(key: Key, value: EstimationForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const searchHomologues = async () => {
    if (!homologueQuery.trim()) {
      setHomologueCandidates([])
      return
    }
    setIsSearchingHomologue(true)
    try {
      const candidates = await searchEstimationHomologuesAction(homologueQuery)
      setHomologueCandidates(rankHomologueCandidates(candidates, form.widthMm, form.depthMm))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setIsSearchingHomologue(false)
    }
  }

  const selectHomologue = async (candidate: EstimationHomologueCandidate) => {
    setSelectingHomologue(candidate)
    setSelectedHomologue(null)
    setReferenceProposal(null)
    try {
      const homologue = await getEstimationHomologueAction(candidate.itemCode)
      const proposal = await proposeEstimationReferenceAction({
        sapPrefix: homologue.sapPrefix,
        homologueItemCode: homologue.itemCode,
      })
      setSelectedHomologue(homologue)
      setReferenceProposal(proposal)
      setHomologueCandidates([])
      toast.success('Homólogo seleccionado. El consecutivo propuesto no queda reservado.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSelectingHomologue(null)
    }
  }

  const createEstimation = () => {
    if (!selectedHomologue || !referenceProposal) {
      toast.error('Selecciona primero un homólogo SAP y espera el consecutivo propuesto.')
      return
    }
    if (!form.provisionalName.trim()) {
      toast.error('Ingresa un nombre provisional para la cotización.')
      return
    }

    startTransition(async () => {
      try {
        const created = await createProductDesignEstimationAction({
          provisionalName: form.provisionalName,
          sapPrefix: selectedHomologue.sapPrefix,
          proposedReferenceCode: referenceProposal.referenceCode,
          widthMm: optionalNumber(form.widthMm),
          depthMm: optionalNumber(form.depthMm),
          heightMm: optionalNumber(form.heightMm),
          colorCode: form.colorCode || null,
          homologueSapItemCode: selectedHomologue.itemCode,
          manufacturingProcess: 'MÁRMOL SINTÉTICO',
        })
        await copyHomologueIntoEstimationAction({ id: created.id, itemCode: selectedHomologue.itemCode })
        toast.success('Cotización creada con una copia editable de la LdM homóloga.')
        router.push(`/product-design/estimations/${created.id}`)
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const deleteEstimation = () => {
    if (!deletingEstimation || !deleteConfirmed) return
    startTransition(async () => {
      try {
        const result = await deleteProductDesignEstimationAction({ id: deletingEstimation.id })
        setEstimations(current => current.filter(estimation => estimation.id !== result.deletedId))
        setDeletingEstimation(null)
        setDeleteConfirmed(false)
        toast.success(
          result.preservedEngineeringMeasurements > 0
            ? `Cotización eliminada. Se conservaron ${result.preservedEngineeringMeasurements} toma(s) histórica(s) de Ingeniería.`
            : 'Cotización eliminada y verificada.',
        )
        router.refresh()
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Cotizaciones en curso</h2>
            <p className="text-sm text-slate-600">Abre una cotización para continuar editando su LdM, consumos y escenario comercial.</p>
          </div>
          <Badge variant="outline">{estimations.length} registradas</Badge>
        </div>

        {estimations.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-sky-700" />Aún no hay cotizaciones</CardTitle>
              <CardDescription>Empieza a la derecha seleccionando el producto homólogo que servirá de base.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3">
            {estimations.map((estimation) => (
              <Card key={estimation.id} className="transition hover:border-sky-300 hover:shadow-md">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <Link href={`/product-design/estimations/${estimation.id}`} className="group flex min-w-0 flex-1 items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-slate-900">{estimation.provisionalName}</h3>
                        <Badge variant={statusBadgeVariant(estimation.status)}>{estimation.status}</Badge>
                        {estimation.sharedWithSales && <Badge variant="secondary">Compartida con Ventas</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {estimation.sapPrefix} · {estimation.proposedReferenceCode ?? 'sin consecutivo'} · {dimensionsLabel(estimation)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Actualizada {formatDate(estimation.updatedAt)}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-sky-700" />
                    </Link>
                    <Button type="button" size="icon" variant="ghost" aria-label={`Eliminar cotización ${estimation.provisionalName}`} disabled={isPending} onClick={() => { setDeletingEstimation(estimation); setDeleteConfirmed(false) }}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                  {deletingEstimation?.id === estimation.id && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
                      <p className="font-semibold">Eliminar esta cotización definitivamente</p>
                      <p className="mt-1 text-xs text-red-800">Se eliminará el borrador y dejará de aparecer en Diseño y Ventas. Las tomas históricas de Ingeniería se conservarán.</p>
                      <label className="mt-3 flex items-start gap-2 text-xs font-medium">
                        <input type="checkbox" className="mt-0.5" checked={deleteConfirmed} onChange={(event) => setDeleteConfirmed(event.target.checked)} />
                        Confirmo que deseo eliminar la cotización “{estimation.provisionalName}”.
                      </label>
                      <div className="mt-3 flex gap-2">
                        <Button type="button" size="sm" variant="destructive" disabled={!deleteConfirmed || isPending} onClick={deleteEstimation}>{isPending && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar cotización</Button>
                        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => { setDeletingEstimation(null); setDeleteConfirmed(false) }}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card className="h-fit border-sky-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-sky-700" />Nueva cotización</CardTitle>
          <CardDescription>El homólogo se propone, pero Diseño siempre lo confirma. Nada de esta pantalla crea un código SAP.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="estimation-name">Nombre provisional</Label>
            <Input id="estimation-name" value={form.provisionalName} onChange={(event) => updateForm('provisionalName', event.target.value)} placeholder="Lavarropas Versa 40 × 50" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['widthMm', 'depthMm', 'heightMm'] as const).map((field, index) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>{['Ancho', 'Fondo', 'Alto'][index]} (cm)</Label>
                <Input id={field} inputMode="decimal" value={form[field]} onChange={(event) => updateForm(field, event.target.value)} />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="homologue-search">Buscar homólogo SAP</Label>
            <div className="flex gap-2">
              <Input id="homologue-search" value={homologueQuery} onChange={(event) => setHomologueQuery(event.target.value)} placeholder="Versa, Oslo, código SAP…" disabled={selectingHomologue !== null} />
              <Button type="button" variant="outline" onClick={searchHomologues} disabled={isSearchingHomologue || selectingHomologue !== null}>
                {isSearchingHomologue ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-500">Los nombres que contienen medidas se ordenan por cercanía al ancho y fondo ingresados. La LdM y U_Prefijo se validan al seleccionar.</p>
            {homologueCandidates.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
                {homologueCandidates.map((candidate) => {
                  const isSelecting = selectingHomologue?.itemCode === candidate.itemCode
                  return (
                    <button key={candidate.itemCode} type="button" onClick={() => void selectHomologue(candidate)} disabled={selectingHomologue !== null} aria-pressed={isSelecting} className={`block w-full rounded-md px-3 py-2 text-left text-sm transition ${isSelecting ? 'bg-sky-100 ring-1 ring-inset ring-sky-300' : 'hover:bg-sky-50'} disabled:cursor-wait disabled:opacity-70`}>
                      <span className="flex items-center gap-2 font-medium text-slate-900">{isSelecting && <Loader2 className="h-4 w-4 animate-spin text-sky-700" />}{candidate.itemCode}</span>
                      <span className="block text-xs text-slate-500">{candidate.itemName || 'Sin descripción SAP'}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {selectingHomologue && (
              <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-sky-700" />
                <div>
                  <p className="font-semibold">Extrayendo información para el lienzo</p>
                  <p className="mt-1 text-xs text-sky-800">{selectingHomologue.itemCode} · {selectingHomologue.itemName || 'Sin descripción SAP'}</p>
                  <p className="mt-1 text-xs text-sky-700">Consultando la LdM completa, unidades y costos SAP. Esto puede tardar unos segundos.</p>
                </div>
              </div>
            )}
            {selectedHomologue && referenceProposal && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
                <p className="font-semibold">{selectedHomologue.itemCode} · {selectedHomologue.itemName || 'Sin descripción SAP'}</p>
                <p className="mt-1">U_Prefijo: {selectedHomologue.sapPrefix}. Prefijo comercial consultado: {referenceProposal.salesItemPrefix}. Familia local: {referenceProposal.familyCode}. Referencia sugerida: <strong>{referenceProposal.referenceCode}</strong> (no reservada).</p>
                {selectedHomologue.bomError && <p className="mt-2 text-xs text-amber-800">La LdM se podrá revisar, pero SAP reportó: {selectedHomologue.bomError}</p>}
              </div>
            )}
          </div>

          <CommercialColorSelector
            id="commercial-color"
            colors={commercialColors}
            colorCode={form.colorCode || null}
            onSelect={(color) => setForm(current => ({
              ...current,
              colorCode: color?.colorCode ?? '',
              colorName: color?.colorName ?? '',
            }))}
          />

          <Button type="button" className="w-full" onClick={createEstimation} disabled={isPending || !selectedHomologue || !referenceProposal}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear lienzo de cotización
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
