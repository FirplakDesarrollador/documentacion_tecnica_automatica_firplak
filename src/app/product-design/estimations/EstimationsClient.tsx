'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Calculator, ChevronRight, Loader2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  copyHomologueIntoEstimationAction,
  createProductDesignEstimationAction,
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
  const [form, setForm] = useState<EstimationForm>(EMPTY_FORM)
  const [homologueQuery, setHomologueQuery] = useState('')
  const [homologueCandidates, setHomologueCandidates] = useState<EstimationHomologueCandidate[]>([])
  const [selectedHomologue, setSelectedHomologue] = useState<EstimationHomologue | null>(null)
  const [referenceProposal, setReferenceProposal] = useState<EstimationReferenceProposal | null>(null)
  const [isSearchingHomologue, setIsSearchingHomologue] = useState(false)

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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Cotizaciones en curso</h2>
            <p className="text-sm text-slate-600">Abre una cotización para continuar editando su LdM, consumos y escenario comercial.</p>
          </div>
          <Badge variant="outline">{initialEstimations.length} registradas</Badge>
        </div>

        {initialEstimations.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-sky-700" />Aún no hay cotizaciones</CardTitle>
              <CardDescription>Empieza a la derecha seleccionando el producto homólogo que servirá de base.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3">
            {initialEstimations.map((estimation) => (
              <Link key={estimation.id} href={`/product-design/estimations/${estimation.id}`} className="group">
                <Card className="transition hover:border-sky-300 hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4 pt-5">
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
                  </CardContent>
                </Card>
              </Link>
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
              <Input id="homologue-search" value={homologueQuery} onChange={(event) => setHomologueQuery(event.target.value)} placeholder="Versa, Oslo, código SAP…" />
              <Button type="button" variant="outline" onClick={searchHomologues} disabled={isSearchingHomologue}>
                {isSearchingHomologue ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-500">Los nombres que contienen medidas se ordenan por cercanía al ancho y fondo ingresados. La LdM y U_Prefijo se validan al seleccionar.</p>
            {homologueCandidates.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
                {homologueCandidates.map((candidate) => (
                  <button key={candidate.itemCode} type="button" onClick={() => void selectHomologue(candidate)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sky-50">
                    <span className="font-medium text-slate-900">{candidate.itemCode}</span>
                    <span className="block text-xs text-slate-500">{candidate.itemName || 'Sin descripción SAP'}</span>
                  </button>
                ))}
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
