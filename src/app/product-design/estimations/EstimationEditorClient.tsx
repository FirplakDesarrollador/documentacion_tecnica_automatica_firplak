'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Copy,
  FilePlus2,
  GitBranchPlus,
  PackagePlus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  copyHomologueIntoEstimationAction,
  createEstimationFamilyAction,
  freezeEstimationSyntheticMarbleCalibrationAction,
  getEstimationHomologueChildrenAction,
  getEstimationHomologueAction,
  proposeEstimationReferenceAction,
  recordEstimationCommercialOutcomeAction,
  refreshEstimationSapCostsAction,
  saveProductDesignEstimationAction,
  searchEstimationHomologuesAction,
  setEstimationSharedWithSalesAction,
  type EstimationHomologue,
  type EstimationHomologueCandidate,
  type EstimationCommercialColorCandidate,
  type ProductDesignCommercialOutcome,
  type ProductDesignEstimation,
  type ProductDesignEstimationStatus,
} from './actions'
import { CommercialColorSelector } from './CommercialColorSelector'
import type { EstimationDraft, EstimationDraftBomLine } from '@/lib/productDesign/estimationDraft'
import {
  evaluateEstimationBomCosting,
  type EstimationBomCostCategory,
  type EstimationBomCostLine,
  type EstimationBomCostStrategy,
} from '@/lib/productDesign/estimationBomCosting'
import {
  buildEstimationBomHierarchy,
  canAssignEstimationBomParent,
  getEstimationBomParentCandidates,
} from '@/lib/productDesign/estimationBomHierarchy'
import type { EstimationReferenceProposal } from '@/lib/productDesign/estimationReferenceProposal'

const COST_CATEGORIES: Array<{ value: EstimationBomCostCategory; label: string }> = [
  { value: 'material', label: 'Material' },
  { value: 'packaging', label: 'Empaque' },
  { value: 'mo', label: 'MO' },
  { value: 'cif', label: 'CIF' },
  { value: 'other', label: 'Otro' },
]

const COST_STRATEGIES: Array<{ value: EstimationBomCostStrategy; label: string }> = [
  { value: 'expand_children', label: 'Costear por hijos' },
  { value: 'manual_override', label: 'Costo unitario' },
]

const ESTIMATION_STATUSES: Array<{ value: ProductDesignEstimationStatus; label: string }> = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activa' },
  { value: 'closed', label: 'Cerrada' },
  { value: 'archived', label: 'Archivada' },
]

const COMMERCIAL_OUTCOMES: Array<{ value: ProductDesignCommercialOutcome; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'rejected', label: 'Rechazada' },
  { value: 'not_pursued', label: 'No continuó' },
]

type FamilyForm = {
  familyName: string
  productType: string
  zoneHome: string
  useDestination: string
}

const EMPTY_FAMILY_FORM: FamilyForm = {
  familyName: '',
  productType: '',
  zoneHome: '',
  useDestination: '',
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.'
}

function numberOrNull(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function numberInput(value: number | null): string {
  return value === null ? '' : String(value)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatFactor(value: number | null): string {
  if (value === null) return 'Sin factor'
  return new Intl.NumberFormat('es-CO', { maximumSignificantDigits: 7 }).format(value)
}

function lineIdentifier(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function extensionText(extensions: Record<string, unknown>, key: string): string | null {
  const value = extensions[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function buildCostLines(draft: EstimationDraft): { lines: EstimationBomCostLine[]; incompleteLineIds: string[] } {
  const incompleteLineIds: string[] = []
  const lines = draft.bomLines.flatMap((line): EstimationBomCostLine[] => {
    const manualCostWithoutReason = line.costEvidence?.source === 'manual' && !line.manualCostReason?.trim()
    if (line.quantity === null || line.costCategory === null || line.costStrategy === null || manualCostWithoutReason) {
      incompleteLineIds.push(line.id)
      return []
    }
    return [{
      id: line.id,
      parentId: line.parentId,
      quantity: line.quantity,
      uom: line.uom,
      costCategory: line.costCategory,
      costStrategy: line.costStrategy,
      unitCost: line.unitCost,
    }]
  })
  return { lines, incompleteLineIds }
}

function blankManualLine(parentId: string | null): EstimationDraftBomLine {
  return {
    id: lineIdentifier(),
    parentId,
    origin: 'manual',
    sapItemCode: null,
    itemName: 'Componente manual',
    quantity: 1,
    uom: 'UN',
    costCategory: 'other',
    costStrategy: 'manual_override',
    unitCost: null,
    costEvidence: null,
    manualCostReason: null,
    notes: null,
    extensions: {},
  }
}

function sapLine(candidate: EstimationHomologueCandidate, parentId: string | null): EstimationDraftBomLine {
  return {
    ...blankManualLine(parentId),
    origin: 'sap',
    sapItemCode: candidate.itemCode,
    itemName: candidate.itemName || null,
    uom: null,
    notes: 'Ítem SAP agregado al lienzo. Confirma cantidad y unidad antes de costear.',
  }
}

type SubstructureNode = Awaited<ReturnType<typeof getEstimationHomologueChildrenAction>>['lines'][number]

function substructureLines(nodes: readonly SubstructureNode[], parentId: string): EstimationDraftBomLine[] {
  return nodes.flatMap(node => {
    const line = sapLine({ itemCode: node.itemCode, itemName: node.itemName }, parentId)
    line.quantity = node.quantity
    line.uom = node.inventoryUom
    line.costStrategy = node.lines.length > 0 ? 'expand_children' : 'manual_override'
    line.notes = 'Línea copiada desde la sub-LdM SAP. Confirma cantidad, unidad y costo.'
    line.extensions = { sapLevel: node.level, sapLoaded: node.loaded }
    return [line, ...substructureLines(node.lines, line.id)]
  })
}

export function EstimationEditorClient({
  initialEstimation,
  commercialColors,
}: {
  initialEstimation: ProductDesignEstimation
  commercialColors: EstimationCommercialColorCandidate[]
}) {
  const [estimation, setEstimation] = useState<ProductDesignEstimation>(initialEstimation)
  const [isPending, startTransition] = useTransition()
  const [homologueQuery, setHomologueQuery] = useState('')
  const [homologueCandidates, setHomologueCandidates] = useState<EstimationHomologueCandidate[]>([])
  const [pendingHomologue, setPendingHomologue] = useState<EstimationHomologue | null>(null)
  const [pendingReference, setPendingReference] = useState<EstimationReferenceProposal | null>(null)
  const [componentQuery, setComponentQuery] = useState('')
  const [componentCandidates, setComponentCandidates] = useState<EstimationHomologueCandidate[]>([])
  const [componentParentId, setComponentParentId] = useState<string>('')
  const [familyForm, setFamilyForm] = useState<FamilyForm>(EMPTY_FAMILY_FORM)
  const [commercialContact, setCommercialContact] = useState(estimation.commercialContactName ?? '')
  const [commercialNote, setCommercialNote] = useState(estimation.commercialNote ?? '')

  const suggestedFamilyCode = extensionText(estimation.draft.homologue?.extensions ?? {}, 'suggestedFamilyCode')
  const costInput = useMemo(() => buildCostLines(estimation.draft), [estimation.draft])
  const costResult = useMemo(
    () => costInput.incompleteLineIds.length === 0 ? evaluateEstimationBomCosting({ lines: costInput.lines }) : null,
    [costInput],
  )
  const hierarchyRows = useMemo(
    () => buildEstimationBomHierarchy(estimation.draft.bomLines),
    [estimation.draft.bomLines],
  )
  const lineValuations = useMemo(() => new Map(
    costResult?.ok ? costResult.lineValuations.map(valuation => [valuation.lineId, valuation]) : [],
  ), [costResult])
  const estimatedPeroxideGrams = estimation.draft.geometry.estimatedGelcoatKg === null
    ? null
    : estimation.draft.geometry.estimatedGelcoatKg * 1_000 * 0.025

  const setSaved = (saved: ProductDesignEstimation) => {
    setEstimation(saved)
    setCommercialContact(saved.commercialContactName ?? '')
    setCommercialNote(saved.commercialNote ?? '')
  }

  const updateDraft = (update: (draft: EstimationDraft) => EstimationDraft) => {
    setEstimation((current) => ({ ...current, draft: update(current.draft) }))
  }

  const updateBomLine = (lineId: string, patch: Partial<EstimationDraftBomLine>) => {
    updateDraft((draft) => ({
      ...draft,
      bomLines: draft.bomLines.map((line) => line.id === lineId ? { ...line, ...patch } : line),
    }))
  }

  const assignBomParent = (lineId: string, parentId: string | null) => {
    if (!canAssignEstimationBomParent(estimation.draft.bomLines, lineId, parentId)) {
      toast.error('No se puede mover una línea debajo de sí misma ni de uno de sus descendientes.')
      return
    }
    updateBomLine(lineId, { parentId })
  }

  const addManualChild = (parentId: string | null) => {
    updateDraft(draft => ({
      ...draft,
      bomLines: [
        ...draft.bomLines.map(line => parentId && line.id === parentId
          ? { ...line, costStrategy: 'expand_children' as const, unitCost: null, costEvidence: null }
          : line),
        blankManualLine(parentId),
      ],
    }))
  }

  const prepareSapChildSearch = (parentId: string) => {
    setComponentParentId(parentId)
    toast.info('Los próximos resultados SAP se agregarán como hijos de la línea seleccionada.')
  }

  const copySapSubstructure = (line: EstimationDraftBomLine) => {
    if (!line.sapItemCode) {
      toast.error('Sólo una línea vinculada a SAP puede consultar una sub-LdM.')
      return
    }
    const existingChildren = estimation.draft.bomLines.filter(candidate => candidate.parentId === line.id)
    if (existingChildren.length > 0 && !window.confirm(
      `Esta línea ya tiene ${existingChildren.length} hijo(s). ¿Deseas anexar también las líneas actuales de la sub-LdM SAP?`,
    )) return
    startTransition(async () => {
      try {
        const result = await getEstimationHomologueChildrenAction(line.sapItemCode ?? '')
        if (result.error) throw new Error(result.error)
        if (result.lines.length === 0) {
          toast.info(`${line.sapItemCode} no tiene una sub-LdM SAP.`)
          return
        }
        updateDraft(draft => ({
          ...draft,
          bomLines: [
            ...draft.bomLines.map(candidate => candidate.id === line.id
              ? { ...candidate, costStrategy: 'expand_children' as const, unitCost: null, costEvidence: null }
              : candidate),
            ...substructureLines(result.lines, line.id),
          ],
        }))
        toast.success(`Se copiaron ${result.lines.length} línea(s) hijas desde SAP. Guarda para persistir el cambio.`)
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const removeBomLine = (lineId: string) => {
    updateDraft((draft) => {
      const removedIds = new Set([lineId])
      let changed = true
      while (changed) {
        changed = false
        for (const line of draft.bomLines) {
          if (line.parentId && removedIds.has(line.parentId) && !removedIds.has(line.id)) {
            removedIds.add(line.id)
            changed = true
          }
        }
      }
      return { ...draft, bomLines: draft.bomLines.filter((line) => !removedIds.has(line.id)) }
    })
  }

  const updateGeometry = (field: 'volumeMm3' | 'paintAreaMm2', value: string) => {
    updateDraft((draft) => ({
      ...draft,
      geometry: { ...draft.geometry, [field]: numberOrNull(value) },
    }))
  }

  const persist = async (value: ProductDesignEstimation): Promise<ProductDesignEstimation> => {
    return saveProductDesignEstimationAction({
      id: value.id,
      provisionalName: value.provisionalName,
      sapPrefix: value.sapPrefix,
      manufacturingProcess: value.manufacturingProcess,
      familyCode: value.familyCode,
      proposedReferenceCode: value.proposedReferenceCode,
      widthMm: value.widthMm,
      depthMm: value.depthMm,
      heightMm: value.heightMm,
      colorCode: value.draft.commercialColor.colorCode ?? value.colorCode,
      homologueSapItemCode: value.draft.homologue?.sapItemCode ?? value.homologueSapItemCode,
      status: value.status,
      draft: value.draft,
    })
  }

  const saveEstimation = () => {
    startTransition(async () => {
      try {
        const saved = await persist(estimation)
        setSaved(saved)
        toast.success('Cotización guardada.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const searchHomologues = async () => {
    if (!homologueQuery.trim()) {
      setHomologueCandidates([])
      return
    }
    try {
      setHomologueCandidates(await searchEstimationHomologuesAction(homologueQuery))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const chooseHomologue = async (candidate: EstimationHomologueCandidate) => {
    try {
      const homologue = await getEstimationHomologueAction(candidate.itemCode)
      const reference = await proposeEstimationReferenceAction({
        sapPrefix: homologue.sapPrefix,
        homologueItemCode: homologue.itemCode,
      })
      setPendingHomologue(homologue)
      setPendingReference(reference)
      setHomologueCandidates([])
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const replaceWithHomologue = () => {
    if (!pendingHomologue || !pendingReference) return
    if (!window.confirm('Esto reemplazará el lienzo de LdM actual por la estructura del nuevo homólogo. Los ajustes no guardados se perderán. ¿Continuar?')) return

    startTransition(async () => {
      try {
        const saved = await copyHomologueIntoEstimationAction({ id: estimation.id, itemCode: pendingHomologue.itemCode })
        const next = {
          ...saved,
          proposedReferenceCode: pendingReference.referenceCode,
          draft: {
            ...saved.draft,
            commercialColor: estimation.draft.commercialColor,
            gelcoatItem: estimation.draft.gelcoatItem,
            geometry: estimation.draft.geometry,
            syntheticMarbleCalibration: estimation.draft.syntheticMarbleCalibration,
            commercialScenario: estimation.draft.commercialScenario,
          },
        }
        setSaved(await persist(next))
        setPendingHomologue(null)
        setPendingReference(null)
        toast.success('LdM homóloga copiada. Revisa las cantidades antes de cotizar.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const searchComponents = async () => {
    if (!componentQuery.trim()) {
      setComponentCandidates([])
      return
    }
    try {
      setComponentCandidates(await searchEstimationHomologuesAction(componentQuery))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const addSapComponent = (candidate: EstimationHomologueCandidate) => {
    updateDraft((draft) => ({
      ...draft,
      bomLines: [
        ...draft.bomLines.map(line => componentParentId && line.id === componentParentId
          ? { ...line, costStrategy: 'expand_children' as const, unitCost: null, costEvidence: null }
          : line),
        sapLine(candidate, componentParentId || null),
      ],
    }))
    setComponentCandidates([])
    setComponentQuery('')
  }

  const freezeCalibration = () => {
    startTransition(async () => {
      try {
        const saved = await freezeEstimationSyntheticMarbleCalibrationAction({
          id: estimation.id,
          volumeMm3: estimation.draft.geometry.volumeMm3,
          paintAreaMm2: estimation.draft.geometry.paintAreaMm2,
        })
        setSaved(saved)
        toast.success('Se congeló el conjunto de muestras y sus factores para esta cotización.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const refreshCosts = () => {
    startTransition(async () => {
      try {
        const persisted = await persist(estimation)
        const saved = await refreshEstimationSapCostsAction({ id: persisted.id })
        setSaved(saved)
        toast.success('Costos SAP actualizados con su fuente y advertencias guardadas.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const createFamily = () => {
    const sapPrefix = estimation.draft.homologue?.sapPrefix ?? estimation.sapPrefix
    startTransition(async () => {
      try {
        const family = await createEstimationFamilyAction({
          sapPrefix,
          familyName: familyForm.familyName,
          productType: familyForm.productType,
          zoneHome: familyForm.zoneHome,
          useDestination: familyForm.useDestination,
          manufacturingProcess: estimation.manufacturingProcess,
        })
        const next: ProductDesignEstimation = {
          ...estimation,
          familyCode: family.familyCode,
          draft: estimation.draft.homologue
            ? { ...estimation.draft, homologue: { ...estimation.draft.homologue, familyCode: family.familyCode } }
            : estimation.draft,
        }
        setSaved(await persist(next))
        toast.success(`Familia local ${family.familyCode} creada y vinculada. No se creó ningún producto formal.`)
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const setSharedWithSales = () => {
    startTransition(async () => {
      try {
        const saved = await setEstimationSharedWithSalesAction({ id: estimation.id, shared: !estimation.sharedWithSales })
        setSaved(saved)
        toast.success(saved.sharedWithSales ? 'Cotización compartida con Ventas.' : 'Cotización retirada de la vista de Ventas.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const recordCommercialOutcome = () => {
    startTransition(async () => {
      try {
        const saved = await recordEstimationCommercialOutcomeAction({
          id: estimation.id,
          outcome: estimation.commercialOutcome,
          contactName: commercialContact,
          note: commercialNote,
        })
        setSaved(saved)
        toast.success('Resultado comercial registrado.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <Link href="/product-design/estimations" className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-900"><ArrowLeft className="h-4 w-4" />Cotizaciones</Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{estimation.provisionalName}</h1>
            <Badge variant="outline">{estimation.status}</Badge>
            {estimation.sharedWithSales && <Badge variant="secondary">Visible para Ventas</Badge>}
          </div>
          <p className="mt-2 text-sm text-slate-600">{estimation.sapPrefix} · referencia sugerida {estimation.proposedReferenceCode ?? 'pendiente'} · propuesta no reservada en SAP.</p>
        </div>
        <Button type="button" onClick={saveEstimation} disabled={isPending}><Save className="h-4 w-4" />Guardar cotización</Button>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identidad provisional</CardTitle>
              <CardDescription>Estos datos describen la estimación; no crean todavía referencia, versión, SKU ni nomenclatura oficial.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="provisional-name">Nombre provisional</Label>
                <Input id="provisional-name" value={estimation.provisionalName} onChange={(event) => setEstimation((current) => ({ ...current, provisionalName: event.target.value }))} />
              </div>
              <div className="space-y-2"><Label htmlFor="width-mm">Ancho (mm)</Label><Input id="width-mm" inputMode="decimal" value={numberInput(estimation.widthMm)} onChange={(event) => setEstimation((current) => ({ ...current, widthMm: numberOrNull(event.target.value) }))} /></div>
              <div className="space-y-2"><Label htmlFor="depth-mm">Fondo (mm)</Label><Input id="depth-mm" inputMode="decimal" value={numberInput(estimation.depthMm)} onChange={(event) => setEstimation((current) => ({ ...current, depthMm: numberOrNull(event.target.value) }))} /></div>
              <div className="space-y-2"><Label htmlFor="height-mm">Alto (mm)</Label><Input id="height-mm" inputMode="decimal" value={numberInput(estimation.heightMm)} onChange={(event) => setEstimation((current) => ({ ...current, heightMm: numberOrNull(event.target.value) }))} /></div>
              <div className="space-y-2">
                <Label htmlFor="estimation-status">Estado de Diseño</Label>
                <select id="estimation-status" value={estimation.status} onChange={(event) => setEstimation((current) => ({ ...current, status: event.target.value as ProductDesignEstimationStatus }))} className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-slate-800 shadow-sm">
                  {ESTIMATION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <CommercialColorSelector
                  id="estimation-commercial-color"
                  colors={commercialColors}
                  colorCode={estimation.draft.commercialColor.colorCode}
                  onSelect={(color) => updateDraft(draft => ({
                    ...draft,
                    commercialColor: {
                      ...draft.commercialColor,
                      colorCode: color?.colorCode ?? null,
                      colorName: color?.colorName ?? null,
                      selectedAt: new Date().toISOString(),
                    },
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Homólogo y familia local</CardTitle>
              <CardDescription>La LdM se copia al lienzo. El consecutivo sólo es una sugerencia y debe verificarse de nuevo cuando se cree en SAP.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p><strong>Homólogo actual:</strong> {estimation.draft.homologue?.sapItemCode ?? estimation.homologueSapItemCode ?? 'Sin definir'}{estimation.draft.homologue?.itemName ? ` · ${estimation.draft.homologue.itemName}` : ''}</p>
                <p className="mt-1"><strong>Familia local:</strong> {estimation.familyCode ?? 'Aún no existe en el catálogo local'}</p>
              </div>
              <div className="flex gap-2">
                <Input value={homologueQuery} onChange={(event) => setHomologueQuery(event.target.value)} placeholder="Buscar otro homólogo SAP" />
                <Button type="button" variant="outline" onClick={searchHomologues}><Search className="h-4 w-4" /></Button>
              </div>
              {homologueCandidates.length > 0 && <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-1">{homologueCandidates.map((candidate) => <button key={candidate.itemCode} type="button" onClick={() => void chooseHomologue(candidate)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sky-50"><strong>{candidate.itemCode}</strong><span className="ml-2 text-slate-500">{candidate.itemName}</span></button>)}</div>}
              {pendingHomologue && pendingReference && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p><strong>Nuevo homólogo pendiente:</strong> {pendingHomologue.itemCode} · {pendingHomologue.itemName}</p><p className="mt-1">U_Prefijo {pendingHomologue.sapPrefix}; prefijo comercial consultado {pendingReference.salesItemPrefix}; familia {pendingReference.familyCode}; referencia sugerida {pendingReference.referenceCode} (no reservada).</p><Button type="button" variant="outline" className="mt-3" onClick={replaceWithHomologue} disabled={isPending}><Copy className="h-4 w-4" />Copiar LdM al lienzo</Button></div>}

              {!estimation.familyCode && suggestedFamilyCode && <div className="rounded-lg border border-sky-200 bg-sky-50 p-4"><p className="font-semibold text-sky-950">Crear familia local {suggestedFamilyCode}</p><p className="mt-1 text-sm text-sky-900">Sólo se creará la familia en el catálogo local. No se creará referencia, SKU ni artículo SAP.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><Input placeholder="Nombre de familia" value={familyForm.familyName} onChange={(event) => setFamilyForm((current) => ({ ...current, familyName: event.target.value }))} /><Input placeholder="Tipo de producto" value={familyForm.productType} onChange={(event) => setFamilyForm((current) => ({ ...current, productType: event.target.value }))} /><Input placeholder="Zona" value={familyForm.zoneHome} onChange={(event) => setFamilyForm((current) => ({ ...current, zoneHome: event.target.value }))} /><Input placeholder="Destino de uso" value={familyForm.useDestination} onChange={(event) => setFamilyForm((current) => ({ ...current, useDestination: event.target.value }))} /></div><Button type="button" className="mt-3" onClick={createFamily} disabled={isPending}><FilePlus2 className="h-4 w-4" />Crear sólo familia local</Button></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Geometría Fusion 360 y calibración de Mármol Sintético</CardTitle>
              <CardDescription>Calcula mezcla y gelcoat por razón de totales de las muestras válidas. El snapshot queda congelado en esta cotización.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="cad-volume">Volumen CAD (mm³)</Label><Input id="cad-volume" inputMode="decimal" value={numberInput(estimation.draft.geometry.volumeMm3)} onChange={(event) => updateGeometry('volumeMm3', event.target.value)} /></div><div className="space-y-2"><Label htmlFor="paint-area">Área de pintura (mm²)</Label><Input id="paint-area" inputMode="decimal" value={numberInput(estimation.draft.geometry.paintAreaMm2)} onChange={(event) => updateGeometry('paintAreaMm2', event.target.value)} /></div></div>
              <Button type="button" variant="outline" onClick={freezeCalibration} disabled={isPending}><Calculator className="h-4 w-4" />Calcular y congelar con muestras válidas</Button>
              {estimation.draft.syntheticMarbleCalibration ? <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm md:grid-cols-2"><div><p className="font-semibold text-emerald-950">Mezcla</p><p>{estimation.draft.geometry.estimatedMixtureKg === null ? 'Ingresa volumen CAD' : `${formatFactor(estimation.draft.geometry.estimatedMixtureKg)} kg estimados`}</p><p className="mt-1 text-xs text-emerald-800">Factor {formatFactor(estimation.draft.syntheticMarbleCalibration.mixture?.factor ?? null)} kg/mm³ · n={estimation.draft.syntheticMarbleCalibration.mixture?.sampleCount ?? 0}</p></div><div><p className="font-semibold text-emerald-950">Gelcoat</p><p>{estimation.draft.geometry.estimatedGelcoatKg === null ? 'Ingresa área CAD' : `${formatFactor(estimation.draft.geometry.estimatedGelcoatKg)} kg estimados`}</p><p className="mt-1 text-xs text-emerald-800">Factor {formatFactor(estimation.draft.syntheticMarbleCalibration.gelcoat?.factor ?? null)} kg/mm² · n={estimation.draft.syntheticMarbleCalibration.gelcoat?.sampleCount ?? 0}</p><p className="mt-1 text-xs text-emerald-800">Peróxido sugerido (2,5%): {estimatedPeroxideGrams === null ? 'pendiente' : `${formatFactor(estimatedPeroxideGrams)} g`}</p></div></div> : <p className="text-sm text-amber-700">Aún no hay un snapshot congelado. Guardar una cotización no toma automáticamente una muestra individual como patrón.</p>}
              <div className="grid gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-3"><div className="space-y-2 md:col-span-2"><Label htmlFor="gelcoat-item">Gelcoat SAP (confirmación explícita)</Label><Input id="gelcoat-item" value={estimation.draft.gelcoatItem.itemCode ?? ''} onChange={(event) => updateDraft((draft) => ({ ...draft, gelcoatItem: { ...draft.gelcoatItem, itemCode: event.target.value || null, selectedAt: new Date().toISOString() } }))} placeholder="Código SAP del gelcoat elegido" /></div><div className="space-y-2"><Label htmlFor="gelcoat-uom">Unidad</Label><Input id="gelcoat-uom" value={estimation.draft.gelcoatItem.uom ?? ''} onChange={(event) => updateDraft((draft) => ({ ...draft, gelcoatItem: { ...draft.gelcoatItem, uom: event.target.value || null, selectedAt: new Date().toISOString() } }))} placeholder="KG" /></div><div className="space-y-2 md:col-span-3"><Label htmlFor="gelcoat-name">Nombre gelcoat</Label><Input id="gelcoat-name" value={estimation.draft.gelcoatItem.itemName ?? ''} onChange={(event) => updateDraft((draft) => ({ ...draft, gelcoatItem: { ...draft.gelcoatItem, itemName: event.target.value || null, selectedAt: new Date().toISOString() } }))} placeholder="El color comercial no mapea automáticamente al gelcoat." /></div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lienzo de LdM y costos</CardTitle>
              <CardDescription>Edita cantidades, agrega ítems SAP o manuales, y decide si un padre se expande por sus hijos o usa un costo explícito.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:flex-row">
                <Input value={componentQuery} onChange={(event) => setComponentQuery(event.target.value)} placeholder="Buscar ítem SAP para agregar" />
                <select value={componentParentId} onChange={(event) => setComponentParentId(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm">
                  <option value="">Como raíz</option>
                  {hierarchyRows.map(({ line, level }) => <option key={line.id} value={line.id}>{'— '.repeat(level)}{line.itemName ?? line.sapItemCode ?? line.id}</option>)}
                </select>
                <Button type="button" variant="outline" onClick={searchComponents}><Search className="h-4 w-4" />Buscar SAP</Button>
                <Button type="button" variant="outline" onClick={() => addManualChild(componentParentId || null)}><PackagePlus className="h-4 w-4" />Agregar manual</Button>
              </div>
              {componentCandidates.length > 0 && <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-1">{componentCandidates.map((candidate) => <button key={candidate.itemCode} type="button" onClick={() => addSapComponent(candidate)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sky-50"><strong>{candidate.itemCode}</strong><span className="ml-2 text-slate-500">{candidate.itemName}</span></button>)}</div>}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[1420px] w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600"><tr><th className="p-2">Nivel / componente</th><th className="p-2">Padre</th><th className="p-2">Cant.</th><th className="p-2">Unidad</th><th className="p-2">Categoría</th><th className="p-2">Estrategia</th><th className="p-2">Costo unit.</th><th className="p-2">Subtotal</th><th className="p-2">Evidencia</th><th className="p-2">Acciones</th></tr></thead>
                  <tbody>
                    {hierarchyRows.map(({ line, level, hasChildren }) => {
                      const valuation = lineValuations.get(line.id)
                      const parentCandidates = getEstimationBomParentCandidates(estimation.draft.bomLines, line.id)
                      return (
                        <tr key={line.id} className="border-t border-slate-100 align-top">
                          <td className="p-2">
                            <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 18}px` }}>
                              <Badge variant={hasChildren ? 'secondary' : 'outline'}>Nivel {level}</Badge>
                              <p className="font-medium text-slate-900">{line.sapItemCode ?? 'Manual'}</p>
                            </div>
                            <Input className="mt-1 h-8 min-w-56" style={{ marginLeft: `${level * 18}px` }} value={line.itemName ?? ''} onChange={(event) => updateBomLine(line.id, { itemName: event.target.value || null })} placeholder="Nombre" />
                          </td>
                          <td className="p-2"><select value={line.parentId ?? ''} onChange={(event) => assignBomParent(line.id, event.target.value || null)} className="h-8 max-w-44 rounded border border-input bg-white px-2"><option value="">Raíz</option>{parentCandidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.itemName ?? candidate.sapItemCode ?? candidate.id}</option>)}</select></td>
                          <td className="p-2"><Input className="h-8 w-20" inputMode="decimal" value={numberInput(line.quantity)} onChange={(event) => updateBomLine(line.id, { quantity: numberOrNull(event.target.value) })} /></td>
                          <td className="p-2"><Input className="h-8 w-16" value={line.uom ?? ''} onChange={(event) => updateBomLine(line.id, { uom: event.target.value || null })} /></td>
                          <td className="p-2"><select value={line.costCategory ?? ''} onChange={(event) => updateBomLine(line.id, { costCategory: (event.target.value || null) as EstimationBomCostCategory | null })} className="h-8 rounded border border-input bg-white px-2">{line.costCategory === null && <option value="">—</option>}{COST_CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></td>
                          <td className="p-2"><select value={line.costStrategy ?? ''} onChange={(event) => {
                            const costStrategy = (event.target.value || null) as EstimationBomCostStrategy | null
                            updateBomLine(line.id, costStrategy === 'expand_children'
                              ? { costStrategy, unitCost: null, costEvidence: null, manualCostReason: null }
                              : { costStrategy })
                          }} className="h-8 rounded border border-input bg-white px-2">{line.costStrategy === null && <option value="">—</option>}{COST_STRATEGIES.map(strategy => <option key={strategy.value} value={strategy.value}>{strategy.label}</option>)}</select></td>
                          <td className="p-2"><Input className="h-8 w-28" inputMode="decimal" disabled={line.costStrategy === 'expand_children'} value={numberInput(line.unitCost)} onChange={(event) => {
                            const unitCost = numberOrNull(event.target.value)
                            updateBomLine(line.id, {
                              unitCost,
                              costEvidence: unitCost === null ? null : {
                                source: 'manual', candidateId: null, warehouseCode: 'MP-01', documentType: 'Manual', documentNumber: null,
                                documentDate: new Date().toISOString(), originalCurrency: 'COP', sourceUom: line.uom,
                                warning: 'Costo manual definido por Diseño; requiere justificación.', extensions: {},
                              },
                            })
                          }} /></td>
                          <td className="p-2 font-semibold text-slate-800">{valuation ? formatCurrency(valuation.totalCost) : 'Pendiente'}</td>
                          <td className="p-2"><Input className="h-8 min-w-52" value={line.manualCostReason ?? ''} onChange={(event) => updateBomLine(line.id, { manualCostReason: event.target.value || null })} placeholder="Justificación costo manual" /><p className="mt-1 max-w-60 break-words text-slate-600">{line.costEvidence?.source ?? 'Pendiente'}{line.costEvidence?.warehouseCode ? ` · ${line.costEvidence.warehouseCode}` : ''}{line.costEvidence?.sourceUom ? ` · ${line.costEvidence.sourceUom}` : ''}</p>{line.costEvidence?.documentDate && <p className="mt-1 text-slate-500">Lectura: {new Date(line.costEvidence.documentDate).toLocaleString('es-CO')}</p>}{line.costEvidence?.warning && <p className="mt-1 max-w-60 break-words text-amber-700">{line.costEvidence.warning}</p>}</td>
                          <td className="p-2"><div className="flex min-w-48 flex-col gap-1"><Button type="button" size="sm" variant="outline" onClick={() => prepareSapChildSearch(line.id)}><GitBranchPlus className="h-3.5 w-3.5" />Agregar hijo SAP</Button><Button type="button" size="sm" variant="outline" onClick={() => addManualChild(line.id)}><PackagePlus className="h-3.5 w-3.5" />Agregar manual</Button><Button type="button" size="sm" variant="outline" disabled={!line.sapItemCode || isPending} onClick={() => copySapSubstructure(line)}><Copy className="h-3.5 w-3.5" />Copiar sub-LdM SAP</Button><Button type="button" variant="ghost" size="sm" onClick={() => removeBomLine(line.id)}><Trash2 className="h-3.5 w-3.5 text-red-600" />Eliminar rama</Button></div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" onClick={refreshCosts} disabled={isPending}><RefreshCw className="h-4 w-4" />Actualizar promedios MP-01</Button><p className="text-xs text-slate-600">Sólo se aplican promedios/estándares vigentes de MP-01 a hojas SAP. Las líneas manuales conservan su costo y motivo; no se usan entradas genéricas como compras.</p></div>
              {costInput.incompleteLineIds.length > 0 ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Completa cantidad, categoría, estrategia y la justificación de cualquier costo manual en {costInput.incompleteLineIds.length} línea(s) para calcular totales.</div> : costResult?.ok ? <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm md:grid-cols-2"><div><p className="font-semibold text-emerald-950">Materiales + empaque</p><p className="text-lg font-bold">{formatCurrency(costResult.totals.materialsAndPackaging)}</p></div><div><p className="font-semibold text-emerald-950">Total ampliado (incluye MO/CIF/otros)</p><p className="text-lg font-bold">{formatCurrency(costResult.totals.expandedTotal)}</p></div><p className="md:col-span-2 text-xs text-emerald-800">Material {formatCurrency(costResult.totals.byCategory.material)} · Empaque {formatCurrency(costResult.totals.byCategory.packaging)} · MO {formatCurrency(costResult.totals.byCategory.mo)} · CIF {formatCurrency(costResult.totals.byCategory.cif)} · Otros {formatCurrency(costResult.totals.byCategory.other)}</p></div> : <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">La LdM aún no se puede totalizar</p><ul className="mt-1 list-disc pl-5">{costResult?.issues.map((issue) => <li key={`${issue.code}-${issue.lineId}`}>{issue.message}</li>)}</ul></div>}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Escenario comercial</CardTitle><CardDescription>Permanece editable; esta primera versión no endurece las fórmulas inconsistentes del Excel.</CardDescription></CardHeader>
            <CardContent className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>MC %</Label><Input inputMode="decimal" value={numberInput(estimation.draft.commercialScenario.contributionMarginPct)} onChange={(event) => updateDraft((draft) => ({ ...draft, commercialScenario: { ...draft.commercialScenario, contributionMarginPct: numberOrNull(event.target.value) } }))} /></div><div className="space-y-1"><Label>Descuento %</Label><Input inputMode="decimal" value={numberInput(estimation.draft.commercialScenario.discountPct)} onChange={(event) => updateDraft((draft) => ({ ...draft, commercialScenario: { ...draft.commercialScenario, discountPct: numberOrNull(event.target.value) } }))} /></div><div className="space-y-1"><Label>Precio mínimo</Label><Input inputMode="decimal" value={numberInput(estimation.draft.commercialScenario.minimumPrice)} onChange={(event) => updateDraft((draft) => ({ ...draft, commercialScenario: { ...draft.commercialScenario, minimumPrice: numberOrNull(event.target.value) } }))} /></div><div className="space-y-1"><Label>PVP</Label><Input inputMode="decimal" value={numberInput(estimation.draft.commercialScenario.pvp)} onChange={(event) => updateDraft((draft) => ({ ...draft, commercialScenario: { ...draft.commercialScenario, pvp: numberOrNull(event.target.value) } }))} /></div><div className="space-y-1"><Label>Peso neto kg</Label><Input inputMode="decimal" value={numberInput(estimation.draft.commercialScenario.netWeightKg)} onChange={(event) => updateDraft((draft) => ({ ...draft, commercialScenario: { ...draft.commercialScenario, netWeightKg: numberOrNull(event.target.value) } }))} /></div><div className="space-y-1"><Label>Peso bruto kg</Label><Input inputMode="decimal" value={numberInput(estimation.draft.commercialScenario.grossWeightKg)} onChange={(event) => updateDraft((draft) => ({ ...draft, commercialScenario: { ...draft.commercialScenario, grossWeightKg: numberOrNull(event.target.value) } }))} /></div></div><Textarea value={estimation.draft.commercialScenario.notes ?? ''} onChange={(event) => updateDraft((draft) => ({ ...draft, commercialScenario: { ...draft.commercialScenario, notes: event.target.value || null } }))} placeholder="Supuestos del escenario comercial" /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Revisión técnica</CardTitle><CardDescription>Ingeniería deja una observación informativa; no bloquea el estado de Diseño.</CardDescription></CardHeader>
            <CardContent className="space-y-2"><Badge variant={estimation.technicalReviewStatus === 'reviewed' ? 'secondary' : 'outline'}>{estimation.technicalReviewStatus}</Badge>{estimation.technicalReviewNote ? <p className="text-sm text-slate-700">{estimation.technicalReviewNote}</p> : <p className="text-sm text-slate-500">Sin observación todavía.</p>}<Link href="/engineering/estimations" className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-900"><Wrench className="h-4 w-4" />Abrir revisiones de Ingeniería</Link></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Compartir con Ventas</CardTitle><CardDescription>Ventas ve sólo cotizaciones que Diseño comparta expresamente.</CardDescription></CardHeader>
            <CardContent className="space-y-3"><Button type="button" variant={estimation.sharedWithSales ? 'outline' : 'default'} className="w-full" onClick={setSharedWithSales} disabled={isPending}>{estimation.sharedWithSales ? 'Retirar de Ventas' : <><Send className="h-4 w-4" />Compartir con Ventas</>}</Button><div className="space-y-2"><Label htmlFor="commercial-outcome">Resultado externo</Label><select id="commercial-outcome" value={estimation.commercialOutcome} onChange={(event) => setEstimation((current) => ({ ...current, commercialOutcome: event.target.value as ProductDesignCommercialOutcome }))} className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm">{COMMERCIAL_OUTCOMES.map((outcome) => <option key={outcome.value} value={outcome.value}>{outcome.label}</option>)}</select></div><Input value={commercialContact} onChange={(event) => setCommercialContact(event.target.value)} placeholder="Contacto o cuenta comercial" /><Textarea value={commercialNote} onChange={(event) => setCommercialNote(event.target.value)} placeholder="Respuesta o condición comercial" /><Button type="button" variant="outline" className="w-full" onClick={recordCommercialOutcome} disabled={isPending}><CheckCircle2 className="h-4 w-4" />Registrar respuesta</Button></CardContent>
          </Card>
        </aside>
      </section>
    </div>
  )
}
