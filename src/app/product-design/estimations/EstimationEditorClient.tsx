'use client'

import Link from 'next/link'
import { type ComponentProps, type ReactNode, useMemo, useState, useTransition } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Collapsible } from '@base-ui/react/collapsible'
import {
  ArrowLeft,
  Calculator,
  ChevronDown,
  ChevronRight,
  Copy,
  FilePlus2,
  GitBranchPlus,
  GripVertical,
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
import {
  copyHomologueIntoEstimationAction,
  createEstimationFamilyAction,
  freezeEstimationSyntheticMarbleCalibrationAction,
  getEstimationFamilyInferenceAction,
  type EstimationFamilyCreationOptions,
  type EstimationFamilyInference,
  getEstimationSapSubtreeAction,
  getEstimationHomologueAction,
  proposeEstimationReferenceAction,
  proposeEstimationReferenceForFamilyAction,
  redefineEstimationFamilyAction,
  registerEstimationActualConsumptionMeasurementAction,
  refreshEstimationSapCostsAction,
  replaceEstimationGelcoatForColorAction,
  saveProductDesignEstimationAction,
  searchEstimationHomologuesAction,
  searchEstimationSapFamiliesAction,
  setEstimationSharedWithSalesAction,
  suggestEstimationSubBomCodeAction,
  type EstimationHomologue,
  type EstimationHomologueCandidate,
  type EstimationSapFamilyCandidate,
  type EstimationCommercialColorCandidate,
  type ProductDesignEstimation,
  type ProductDesignEstimationStatus,
} from './actions'
import { CommercialColorSelector } from './CommercialColorSelector'
import {
  type EstimationDraft,
  type EstimationDraftBomLine,
  type EstimationDraftPhysicalWeightPolicy,
} from '@/lib/productDesign/estimationDraft'
import { isDecimalInput, parseDecimalInput } from '@/lib/productDesign/decimalInput'
import { calculateEstimationMaterialBalance } from '@/lib/productDesign/estimationMaterialBalance'
import {
  evaluateEstimationBomCosting,
  type EstimationBomCostLine,
  type EstimationBomCostStrategy,
  type EstimationBomLineValuation,
} from '@/lib/productDesign/estimationBomCosting'
import {
  buildEstimationBomHierarchy,
  getEstimationBomDescendantIds,
  getEstimationBomDisplayLevel,
  moveEstimationBomBranch,
  removeEstimationBomBranch,
  type EstimationBomDropPosition,
} from '@/lib/productDesign/estimationBomHierarchy'
import type { EstimationReferenceProposal } from '@/lib/productDesign/estimationReferenceProposal'
import { inferEstimationSapCostCategory } from '@/lib/productDesign/estimationSapClassification'
import { proposeGelcoatReplacements } from '@/lib/productDesign/gelcoatAlignment'
import { inferPhysicalWeightPolicy, isPhysicalWeightPolicyFixed } from '@/lib/productDesign/estimationPhysicalWeights'

const COST_STRATEGIES: Array<{ value: EstimationBomCostStrategy; label: string }> = [
  { value: 'expand_children', label: 'Costear por hijos' },
  { value: 'manual_override', label: 'Costo unitario' },
]

const PHYSICAL_WEIGHT_POLICY_LABELS: Record<EstimationDraftPhysicalWeightPolicy, string> = {
  direct_weight: 'Peso directo',
  useful_weight: 'Peso útil',
  sub_bom_weight: 'Peso Sub-LdM',
  no_weight: 'Sin peso',
}

const PHYSICAL_WEIGHT_POLICY_CHOICES = Object.entries(PHYSICAL_WEIGHT_POLICY_LABELS) as Array<[EstimationDraftPhysicalWeightPolicy, string]>

const ESTIMATION_STATUSES: Array<{ value: ProductDesignEstimationStatus; label: string }> = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activa' },
  { value: 'closed', label: 'Cerrada' },
  { value: 'archived', label: 'Archivada' },
]

const BOM_GRID_COLUMNS = 'grid-cols-[28px_minmax(420px,1fr)_128px_128px_128px_200px]'

function SortableBomRow({
  lineId,
  excluded,
  dropPosition,
  children,
}: {
  lineId: string
  excluded?: boolean
  dropPosition?: EstimationBomDropPosition | null
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lineId })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`grid ${BOM_GRID_COLUMNS} items-start border-t text-xs ${excluded ? 'bg-amber-50/70 opacity-65' : dropPosition === 'inside' ? 'bg-sky-50 ring-2 ring-inset ring-sky-400' : 'bg-white'} ${dropPosition === 'before' ? 'border-t-2 border-t-sky-500' : 'border-slate-100'} ${dropPosition === 'after' ? 'border-b-2 border-b-sky-500' : ''} ${isDragging ? 'relative z-20 opacity-50 shadow-lg' : ''}`}
    >
      <div className="flex justify-center p-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-8 w-7 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
          aria-label="Mover rama"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  )
}

type EstimationBomHierarchyRow = ReturnType<typeof buildEstimationBomHierarchy>[number]

function EstimationBomTreeBranch({
  row,
  rowsByParentId,
  collapsedLineIds,
  onOpenChange,
  renderRow,
}: {
  row: EstimationBomHierarchyRow
  rowsByParentId: ReadonlyMap<string | null, EstimationBomHierarchyRow[]>
  collapsedLineIds: ReadonlySet<string>
  onOpenChange: (lineId: string, open: boolean) => void
  renderRow: (row: EstimationBomHierarchyRow, chevron: ReactNode) => ReactNode
}) {
  const children = rowsByParentId.get(row.line.id) ?? []
  const hasChildren = children.length > 0

  if (!hasChildren) return <>{renderRow(row, <span className="w-6" />)}</>

  const isOpen = !collapsedLineIds.has(row.line.id)
  return (
    <Collapsible.Root open={isOpen} onOpenChange={(open) => onOpenChange(row.line.id, open)}>
      {renderRow(
        row,
        <Collapsible.Trigger className="rounded p-1 hover:bg-slate-100" aria-label={isOpen ? 'Contraer rama' : 'Expandir rama'}>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Collapsible.Trigger>,
      )}
      <Collapsible.Panel className="overflow-hidden [height:var(--collapsible-panel-height)] motion-safe:transition-[height] motion-safe:duration-300 motion-safe:ease-out data-[starting-style]:h-0 data-[ending-style]:h-0 motion-reduce:transition-none">
        {children.map((child) => (
          <EstimationBomTreeBranch
            key={child.line.id}
            row={child}
            rowsByParentId={rowsByParentId}
            collapsedLineIds={collapsedLineIds}
            onOpenChange={onOpenChange}
            renderRow={renderRow}
          />
        ))}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

type FamilyForm = {
  familyName: string
  productType: string
  zoneHome: string
  useDestination: string
  line: string
  manufacturingProcess: string
}

function familyFormFromInference(
  inference: EstimationFamilyInference | null,
  manufacturingProcess: string,
): FamilyForm {
  return {
    familyName: inference?.familyName ?? '',
    productType: inference?.productType ?? '',
    zoneHome: inference?.zoneHome ?? '',
    useDestination: inference?.useDestination ?? '',
    line: '',
    manufacturingProcess,
  }
}

function CreatableFamilySelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string
  label: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
}) {
  const [isCustom, setIsCustom] = useState(false)
  if (isCustom) {
    return (
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={`Definir ${label.toLowerCase()}`} />
        <Button type="button" variant="outline" onClick={() => { setIsCustom(false); onChange('') }}>Usar lista</Button>
      </div>
    )
  }
  const hasCustomValue = Boolean(value && !options.includes(value))
  return (
    <select
      id={id}
      value={hasCustomValue ? value : value || ''}
      onChange={(event) => {
        if (event.target.value === '__NEW__') {
          setIsCustom(true)
          onChange('')
          return
        }
        onChange(event.target.value)
      }}
      className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-slate-800 shadow-sm"
    >
      <option value="">Seleccionar {label.toLowerCase()}...</option>
      <option value="__NEW__">Agregar nueva...</option>
      {hasCustomValue && <option value={value}>{value}</option>}
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.'
}

function numberOrNull(value: string): number | null {
  return parseDecimalInput(value)
}

function numberInput(value: number | null): string {
  return value === null ? '' : String(value)
}

function UnitInput({ unit, className, ...props }: ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className="relative">
      <Input {...props} className={`${className ?? ''} pr-11`} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">{unit}</span>
    </div>
  )
}

function BomQuantityUomInput({
  line,
  contentLocked,
  onChange,
}: {
  line: EstimationDraftBomLine
  contentLocked: boolean
  onChange: (changes: Partial<EstimationDraftBomLine>) => void
}) {
  if (line.origin !== 'manual') {
    return <UnitInput aria-label="Cantidad y unidad" className="h-8 w-full pl-1.5" disabled={contentLocked} inputMode="decimal" unit={line.uom ?? '—'} value={numberInput(line.quantity)} onChange={(event) => onChange({ quantity: numberOrNull(event.target.value) })} />
  }

  return (
    <div className="flex h-8 overflow-hidden rounded-md border border-input bg-white shadow-xs">
      <Input aria-label="Cantidad" className="h-full min-w-0 flex-1 rounded-none border-0 px-2 shadow-none focus-visible:ring-0" disabled={contentLocked} inputMode="decimal" value={numberInput(line.quantity)} onChange={(event) => onChange({ quantity: numberOrNull(event.target.value) })} />
      <Input aria-label="Unidad" className="h-full w-12 rounded-none border-0 border-l border-input px-2 shadow-none focus-visible:ring-0" disabled={contentLocked} value={line.uom ?? ''} onChange={(event) => onChange({ uom: event.target.value || null })} />
    </div>
  )
}

type ActualConsumptionInputs = {
  actualMixtureKg: string
  actualGelcoatKg: string
  actualNetWeightKg: string
  actualGrossWeightKg: string
  actualCastingWasteKg: string
  actualPostDemoldWasteOverrideKg: string
  actualPackagingWeightKg: string
}

function actualConsumptionInputsFromDraft(draft: EstimationDraft): ActualConsumptionInputs {
  return {
    actualMixtureKg: numberInput(draft.geometry.actualMixtureKg),
    actualGelcoatKg: numberInput(draft.geometry.actualGelcoatKg),
    actualNetWeightKg: numberInput(draft.geometry.actualNetWeightKg),
    actualGrossWeightKg: numberInput(draft.geometry.actualGrossWeightKg),
    actualCastingWasteKg: numberInput(draft.geometry.actualCastingWasteKg),
    actualPostDemoldWasteOverrideKg: numberInput(draft.geometry.actualPostDemoldWasteOverrideKg),
    actualPackagingWeightKg: numberInput(draft.geometry.actualPackagingWeightKg),
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatQuantity(value: number | null, maximumFractionDigits = 3): string {
  return value === null ? 'Pendiente' : new Intl.NumberFormat('es-CO', { maximumFractionDigits }).format(value)
}

function lineIdentifier(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function extensionText(extensions: Record<string, unknown>, key: string): string | null {
  const value = extensions[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function buildCostLinesFromBomLines(bomLines: readonly EstimationDraftBomLine[]): { lines: EstimationBomCostLine[]; incompleteLineIds: string[] } {
  const incompleteLineIds: string[] = []
  const lines = bomLines.flatMap((line): EstimationBomCostLine[] => {
    if (isExcludedByManualBoundary(line, bomLines)) return []
    if (line.quantity === null || line.costCategory === null || line.costStrategy === null) {
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
      origin: line.origin,
      bomQuantity: typeof line.extensions.sapBomQuantity === 'number'
        ? line.extensions.sapBomQuantity
        : null,
      unitCost: line.unitCost,
    }]
  })
  return { lines, incompleteLineIds }
}

function buildCostLines(draft: EstimationDraft): { lines: EstimationBomCostLine[]; incompleteLineIds: string[] } {
  return buildCostLinesFromBomLines(draft.bomLines)
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
    physicalWeightPolicy: 'direct_weight',
    physicalWeightCategory: 'product',
    usefulQuantity: null,
    fixedWeightKg: null,
    physicalWeightSnapshot: null,
    extensions: {},
  }
}

function sapLine(candidate: EstimationHomologueCandidate, parentId: string | null): EstimationDraftBomLine {
  return {
    ...blankManualLine(parentId),
    origin: 'sap',
    sapItemCode: candidate.itemCode,
    physicalWeightCategory: /EMP\d{2}/iu.test(candidate.itemCode) ? 'packaging' : 'product',
    itemName: candidate.itemName || null,
    uom: null,
    costStrategy: 'sap_direct',
    notes: 'Ítem SAP agregado al lienzo. Confirma cantidad y unidad antes de costear.',
  }
}

type SubstructureNode = Awaited<ReturnType<typeof getEstimationSapSubtreeAction>>['tree']
type SubstructureLeafCosts = Awaited<ReturnType<typeof getEstimationSapSubtreeAction>>['leafCosts']

function substructureIsComplete(node: SubstructureNode, branchErrors: Record<string, string>): boolean {
  return !node.cycleDetected
    && !branchErrors[node.itemCode]
    && node.lines.every(child => substructureIsComplete(child, branchErrors))
}

function substructureLines(
  nodes: readonly SubstructureNode[],
  parentId: string,
  branchErrors: Record<string, string> = {},
  leafCosts: SubstructureLeafCosts = {},
): EstimationDraftBomLine[] {
  return nodes.flatMap(node => {
    const line = sapLine({ itemCode: node.itemCode, itemName: node.itemName }, parentId)
    line.quantity = node.quantity
    line.uom = node.inventoryUom
    line.costCategory = inferEstimationSapCostCategory(node.itemCode, node.itemName)
    line.costStrategy = node.lines.length > 0 || node.cycleDetected ? 'expand_children' : 'sap_direct'
    const leafCost = leafCosts[node.itemCode]
    const sourceUom = leafCost?.inventoryUom?.trim().toUpperCase() ?? null
    const lineUom = node.inventoryUom?.trim().toUpperCase() ?? sourceUom
    const hasCompatibleLeafCost = line.costStrategy === 'sap_direct'
      && leafCost?.unitCost !== null
      && leafCost?.unitCost !== undefined
      && leafCost.unitCost > 0
      && (!sourceUom || sourceUom === lineUom)
    line.unitCost = hasCompatibleLeafCost ? leafCost.unitCost : null
    line.costEvidence = line.costStrategy === 'expand_children' ? null : {
      source: hasCompatibleLeafCost ? 'warehouse_average' : 'unavailable',
      candidateId: hasCompatibleLeafCost ? `warehouse-average:${node.itemCode}:MP-01` : null,
      warehouseCode: 'MP-01',
      documentType: hasCompatibleLeafCost ? 'WarehouseAverage' : null,
      documentNumber: null,
      documentDate: leafCost?.readAt ?? null,
      originalCurrency: hasCompatibleLeafCost ? 'COP' : null,
      sourceUom,
      warning: hasCompatibleLeafCost
        ? 'Costo temporal: promedio/estándar vigente de MP-01. No representa la última compra ni una recepción de proveedor.'
        : 'SAP no reporta un promedio/estándar positivo compatible en MP-01; el costo queda pendiente.',
      extensions: { sourceReadAt: leafCost?.readAt ?? null },
    }
    line.physicalWeightPolicy = node.lines.length > 0 ? 'sub_bom_weight' : 'direct_weight'
    line.physicalWeightCategory = /EMP\d{2}/iu.test(node.itemCode) || line.costCategory === 'packaging' ? 'packaging' : 'product'
    line.notes = node.cycleDetected ? 'SAP reporta un ciclo en esta rama.' : 'Línea copiada desde la sub-LdM SAP.'
    line.extensions = {
      sapLoaded: true,
      sapLoadedComplete: substructureIsComplete(node, branchErrors),
      sapBomQuantity: node.bomQuantity,
      sapComponentWarehouse: node.componentWarehouse,
      sapOutputWarehouse: node.outputWarehouse,
      sapCycleDetected: node.cycleDetected,
      sapStructureLocked: node.lines.length > 0,
    }
    return [line, ...substructureLines(node.lines, line.id, branchErrors, leafCosts)]
  })
}

function isSapLine(line: EstimationDraftBomLine | undefined): boolean {
  return line?.origin === 'sap'
}

function sapRefreshRootLines(lines: readonly EstimationDraftBomLine[]): EstimationDraftBomLine[] {
  const linesById = new Map(lines.map(line => [line.id, line]))
  return lines.filter(line => line.origin === 'sap' && line.sapItemCode && linesById.get(line.parentId ?? '')?.origin !== 'sap')
}

function latestSapReadAt(lines: readonly EstimationDraftBomLine[]): string | null {
  return lines.reduce<string | null>((latest, line) => {
    const readAt = line.costEvidence?.source === 'warehouse_average' ? line.costEvidence.documentDate : null
    if (!readAt || Number.isNaN(Date.parse(readAt))) return latest
    return !latest || Date.parse(readAt) > Date.parse(latest) ? readAt : latest
  }, null)
}

function isExcludedByManualBoundary(
  line: EstimationDraftBomLine,
  lines: readonly EstimationDraftBomLine[],
): boolean {
  let parentId = line.parentId
  while (parentId) {
    const container = lines.find(candidate => candidate.id === parentId)
    if (!container) return false
    if (container.origin === 'manual' && container.costStrategy === 'manual_override') return true
    parentId = container.parentId
  }
  return false
}

function reconcileManualContainers(
  lines: EstimationDraftBomLine[],
  containerIds: ReadonlySet<string>,
  rollupContainerIds: ReadonlySet<string> = new Set(),
): EstimationDraftBomLine[] {
  return lines.map(line => {
    if (!containerIds.has(line.id) || line.origin !== 'manual') return line
    const hasChildren = lines.some(candidate => candidate.parentId === line.id)
    if (!hasChildren && line.costStrategy === 'expand_children') {
      return { ...line, costStrategy: 'manual_override', unitCost: null, costEvidence: null, manualCostReason: null }
    }
    const hasExplicitOverride = line.costStrategy === 'manual_override'
      && line.costEvidence?.source === 'manual'
      && line.unitCost !== null
      && line.unitCost > 0

    if (hasChildren && rollupContainerIds.has(line.id) && !hasExplicitOverride) {
      return { ...line, costStrategy: 'expand_children', unitCost: null, costEvidence: null, manualCostReason: null }
    }
    return line
  })
}

export function EstimationEditorClient({
  initialEstimation,
  commercialColors,
  familyCreationOptions,
  initialFamilyInference,
}: {
  initialEstimation: ProductDesignEstimation
  commercialColors: EstimationCommercialColorCandidate[]
  familyCreationOptions: EstimationFamilyCreationOptions
  initialFamilyInference: EstimationFamilyInference | null
}) {
  const [estimation, setEstimation] = useState<ProductDesignEstimation>(initialEstimation)
  const [actualConsumptionInputs, setActualConsumptionInputs] = useState<ActualConsumptionInputs>(
    () => actualConsumptionInputsFromDraft(initialEstimation.draft),
  )
  const [isPending, startTransition] = useTransition()
  const [homologueQuery, setHomologueQuery] = useState('')
  const [homologueCandidates, setHomologueCandidates] = useState<EstimationHomologueCandidate[]>([])
  const [pendingHomologue, setPendingHomologue] = useState<EstimationHomologue | null>(null)
  const [pendingReference, setPendingReference] = useState<EstimationReferenceProposal | null>(null)
  const [componentQuery, setComponentQuery] = useState('')
  const [componentCandidates, setComponentCandidates] = useState<EstimationHomologueCandidate[]>([])
  const [componentParentId, setComponentParentId] = useState<string>('')
  const [familyQuery, setFamilyQuery] = useState('')
  const [familyCandidates, setFamilyCandidates] = useState<EstimationSapFamilyCandidate[]>([])
  const [pendingSapFamily, setPendingSapFamily] = useState<EstimationSapFamilyCandidate | null>(null)
  const [pendingFamilyReference, setPendingFamilyReference] = useState<EstimationReferenceProposal | null>(null)
  const [isSearchingFamily, setIsSearchingFamily] = useState(false)
  const [isPreparingFamily, setIsPreparingFamily] = useState(false)
  const [hasSearchedFamily, setHasSearchedFamily] = useState(false)
  const [activeBomLineId, setActiveBomLineId] = useState<string | null>(null)
  const [bomDropHint, setBomDropHint] = useState<{ targetId: string; position: EstimationBomDropPosition } | null>(null)
  const [collapsedBomLineIds, setCollapsedBomLineIds] = useState<Set<string>>(() => new Set())
  const [familyForm, setFamilyForm] = useState<FamilyForm>(() => familyFormFromInference(initialFamilyInference, initialEstimation.manufacturingProcess))
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const suggestedFamilyCode = extensionText(estimation.draft.homologue?.extensions ?? {}, 'suggestedFamilyCode')
  const familyCodeToCreate = pendingSapFamily?.localFamilyName === null
    ? pendingSapFamily.familyCode
    : (!estimation.familyCode ? suggestedFamilyCode : null)
  const costInput = useMemo(() => buildCostLines(estimation.draft), [estimation.draft])
  const costResult = useMemo(
    () => costInput.incompleteLineIds.length === 0 ? evaluateEstimationBomCosting({ lines: costInput.lines }) : null,
    [costInput],
  )
  const hierarchyRows = useMemo(
    () => buildEstimationBomHierarchy(estimation.draft.bomLines),
    [estimation.draft.bomLines],
  )
  const visibleHierarchyRows = useMemo(() => hierarchyRows.filter(({ line }) => {
    let parentId = line.parentId
    while (parentId) {
      if (collapsedBomLineIds.has(parentId)) return false
      parentId = estimation.draft.bomLines.find(candidate => candidate.id === parentId)?.parentId ?? null
    }
    return true
  }), [collapsedBomLineIds, estimation.draft.bomLines, hierarchyRows])
  const hierarchyRowsByParentId = useMemo(() => {
    const rowsByParentId = new Map<string | null, EstimationBomHierarchyRow[]>()
    hierarchyRows.forEach((row) => {
      const siblings = rowsByParentId.get(row.line.parentId) ?? []
      siblings.push(row)
      rowsByParentId.set(row.line.parentId, siblings)
    })
    return rowsByParentId
  }, [hierarchyRows])
  const lineValuations = useMemo(() => {
    if (costResult?.ok) return new Map(costResult.lineValuations.map(valuation => [valuation.lineId, valuation]))
    const valuations = new Map<string, EstimationBomLineValuation>()
    hierarchyRows.filter(row => row.level === 0).forEach(({ line }) => {
      const branchIds = getEstimationBomDescendantIds(estimation.draft.bomLines, line.id)
      branchIds.add(line.id)
      const branchInput = buildCostLinesFromBomLines(estimation.draft.bomLines.filter(candidate => branchIds.has(candidate.id)))
      if (branchInput.incompleteLineIds.length > 0) return
      const branchResult = evaluateEstimationBomCosting({ lines: branchInput.lines })
      if (!branchResult.ok) return
      branchResult.lineValuations.forEach(valuation => valuations.set(valuation.lineId, valuation))
    })
    return valuations
  }, [costResult, estimation.draft.bomLines, hierarchyRows])
  const gelcoatReplacementProposals = useMemo(
    () => proposeGelcoatReplacements(estimation.draft.bomLines, estimation.draft.commercialColor.colorCode),
    [estimation.draft.bomLines, estimation.draft.commercialColor.colorCode],
  )
  const lastSapCostReadAt = useMemo(
    () => latestSapReadAt(estimation.draft.bomLines),
    [estimation.draft.bomLines],
  )
  const estimatedPeroxideGrams = estimation.draft.geometry.estimatedGelcoatKg === null
    ? null
    : estimation.draft.geometry.estimatedGelcoatKg * 1_000 * 0.025
  const actualGelcoatKg = parseDecimalInput(actualConsumptionInputs.actualGelcoatKg)
  const materialBalance = calculateEstimationMaterialBalance({
    actualMixtureKg: parseDecimalInput(actualConsumptionInputs.actualMixtureKg),
    actualGelcoatKg,
    theoreticalGelcoatKg: estimation.draft.geometry.estimatedGelcoatKg,
    actualCastingWasteKg: parseDecimalInput(actualConsumptionInputs.actualCastingWasteKg),
    actualPostDemoldWasteOverrideKg: parseDecimalInput(actualConsumptionInputs.actualPostDemoldWasteOverrideKg),
    actualNetWeightKg: parseDecimalInput(actualConsumptionInputs.actualNetWeightKg),
    actualPackagingWeightKg: parseDecimalInput(actualConsumptionInputs.actualPackagingWeightKg),
    actualGrossWeightKg: parseDecimalInput(actualConsumptionInputs.actualGrossWeightKg),
  })
  const actualPeroxideGrams = actualGelcoatKg === null
    ? null
    : actualGelcoatKg * 1_000 * 0.025
  const missingPhysicalWeightLineIds = estimation.draft.geometry.extensions.missingPhysicalWeightLineIds
  const hasIncompletePhysicalWeight = estimation.draft.geometry.estimatedNetWeightKg !== null
    && (estimation.draft.geometry.estimatedPackagingWeightKg === null || (Array.isArray(missingPhysicalWeightLineIds) && missingPhysicalWeightLineIds.length > 0))
  const canCalculateCad = estimation.draft.geometry.volumeMm3 !== null
    && estimation.draft.geometry.volumeMm3 > 0
    && estimation.draft.geometry.paintAreaMm2 !== null
    && estimation.draft.geometry.paintAreaMm2 > 0
    && estimation.draft.geometry.castingWastePct !== null
    && estimation.draft.geometry.postDemoldWastePct !== null
    && estimation.draft.geometry.castingWastePct + estimation.draft.geometry.postDemoldWastePct < 1

  const setSaved = (saved: ProductDesignEstimation) => {
    setEstimation(saved)
    setActualConsumptionInputs(actualConsumptionInputsFromDraft(saved.draft))
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

  const setBomBranchOpen = (lineId: string, open: boolean) => {
    setCollapsedBomLineIds((current) => {
      const next = new Set(current)
      if (open) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  const addManualChild = (parentId: string | null) => {
    const parent = estimation.draft.bomLines.find(line => line.id === parentId)
    if (isSapLine(parent)) {
      toast.error('Convierte primero la cabecera SAP en una sub-LdM nueva para agregar componentes.')
      return
    }
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
    const parent = estimation.draft.bomLines.find(line => line.id === parentId)
    if (isSapLine(parent)) {
      toast.error('Convierte primero la cabecera SAP en una sub-LdM nueva para agregar componentes.')
      return
    }
    setComponentParentId(parentId)
    toast.info('Los próximos resultados SAP se agregarán como hijos de la línea seleccionada.')
  }

  const refreshSapStructures = async (draft: EstimationDraft): Promise<EstimationDraft> => {
    let refreshedDraft = draft
    for (const rootLine of sapRefreshRootLines(refreshedDraft.bomLines)) {
      const activeRoot = refreshedDraft.bomLines.find(line => line.id === rootLine.id)
      if (!activeRoot?.sapItemCode) continue
      const result = await getEstimationSapSubtreeAction(activeRoot.sapItemCode)
      const descendantIds = getEstimationBomDescendantIds(refreshedDraft.bomLines, activeRoot.id)
      const updatedRoot: EstimationDraftBomLine = {
        ...activeRoot,
        itemName: result.tree.itemName || activeRoot.itemName,
        uom: result.tree.inventoryUom,
        costStrategy: result.tree.lines.length > 0 ? 'expand_children' : 'sap_direct',
        unitCost: null,
        costEvidence: null,
        physicalWeightPolicy: result.tree.lines.length > 0 ? 'sub_bom_weight' : 'direct_weight',
        extensions: {
          ...activeRoot.extensions,
          sapBomQuantity: result.tree.bomQuantity,
          sapLoadedComplete: Object.keys(result.branchErrors).length === 0 && !result.tree.cycleDetected,
          sapReadErrors: result.branchErrors,
        },
      }
      const refreshedChildren = substructureLines(result.tree.lines, activeRoot.id, result.branchErrors, result.leafCosts)
      refreshedDraft = {
        ...refreshedDraft,
        bomLines: refreshedDraft.bomLines.flatMap(line => {
          if (descendantIds.has(line.id)) return []
          return line.id === activeRoot.id ? [updatedRoot, ...refreshedChildren] : [line]
        }),
      }
    }
    return refreshedDraft
  }

  const convertSapSubstructure = (line: EstimationDraftBomLine) => {
    if (!line.sapItemCode) return
    startTransition(async () => {
      try {
        const suggestion = await suggestEstimationSubBomCodeAction(line.sapItemCode ?? '')
        updateBomLine(line.id, {
          origin: 'manual',
          sapItemCode: null,
          costStrategy: estimation.draft.bomLines.some(candidate => candidate.parentId === line.id) ? 'expand_children' : 'manual_override',
          unitCost: null,
          costEvidence: null,
          manualCostReason: null,
          extensions: {
            ...line.extensions,
            sourceSapItemCode: line.sapItemCode,
            sourceSapItemName: line.itemName,
            sourceSapFamilyPrefix: suggestion.familyPrefix,
            suggestedSapItemCode: suggestion.suggestedItemCode,
            suggestionReserved: false,
            convertedAt: new Date().toISOString(),
            sapStructureLocked: false,
          },
        })
        toast.success(`Sub-LdM convertida. Código sugerido no reservado: ${suggestion.suggestedItemCode}.`)
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const removeBomLine = (lineId: string) => {
    const line = estimation.draft.bomLines.find(candidate => candidate.id === lineId)
    const container = estimation.draft.bomLines.find(candidate => candidate.id === line?.parentId)
    if (isSapLine(container)) {
      toast.error('Convierte primero la cabecera SAP en una sub-LdM nueva para eliminar componentes internos.')
      return
    }
    const descendantCount = getEstimationBomDescendantIds(estimation.draft.bomLines, lineId).size
    if (!window.confirm(`Se eliminará esta línea y ${descendantCount} descendiente(s) del borrador. ¿Continuar?`)) return
    updateDraft(draft => ({
      ...draft,
      bomLines: reconcileManualContainers(
        removeEstimationBomBranch(draft.bomLines, lineId),
        new Set(line?.parentId ? [line.parentId] : []),
      ),
    }))
  }

  const updateGeometry = (field: 'volumeMm3' | 'paintAreaMm2' | 'weightWastePct' | 'castingWastePct' | 'postDemoldWastePct' | keyof ActualConsumptionInputs, value: string) => {
    updateDraft((draft) => ({
      ...draft,
      geometry: { ...draft.geometry, [field]: numberOrNull(value) },
    }))
  }

  const updateActualConsumption = (field: keyof ActualConsumptionInputs, value: string) => {
    if (!isDecimalInput(value)) return
    setActualConsumptionInputs(current => ({ ...current, [field]: value }))
    updateGeometry(field, value)
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
      setHomologueCandidates(await searchEstimationHomologuesAction(homologueQuery, estimation.draft.commercialColor.colorCode))
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
            commercialColor: estimation.draft.commercialColor.colorCode ? estimation.draft.commercialColor : saved.draft.commercialColor,
            geometry: estimation.draft.geometry,
            syntheticMarbleCalibration: estimation.draft.syntheticMarbleCalibration,
            commercialScenario: estimation.draft.commercialScenario,
          },
        }
        setSaved(await persist(next))
        const inference = await getEstimationFamilyInferenceAction({
          sapPrefix: saved.sapPrefix,
          homologueItemCode: saved.homologueSapItemCode ?? pendingHomologue.itemCode,
        })
        setFamilyForm(familyFormFromInference(inference, saved.manufacturingProcess))
        setPendingHomologue(null)
        setPendingReference(null)
        toast.success('LdM homóloga copiada. Revisa las cantidades antes de cotizar.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const replaceGelcoatForSelectedColor = () => {
    const colorCode = estimation.draft.commercialColor.colorCode
    if (!colorCode) return
    startTransition(async () => {
      try {
        const saved = await replaceEstimationGelcoatForColorAction({ id: estimation.id, colorCode })
        setSaved(saved)
        toast.success('La línea de gelcoat de la LdM fue actualizada para el color seleccionado.')
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
    const parent = estimation.draft.bomLines.find(line => line.id === componentParentId)
    if (isSapLine(parent)) {
      toast.error('Convierte primero la cabecera SAP en una sub-LdM nueva para agregar componentes.')
      return
    }
    startTransition(async () => {
      try {
        const result = await getEstimationSapSubtreeAction(candidate.itemCode)
        const [root, ...descendants] = substructureLines([result.tree], componentParentId || '__root__', result.branchErrors, result.leafCosts)
        root.parentId = componentParentId || null
        root.quantity = 1
        updateDraft((draft) => ({
          ...draft,
          bomLines: [
            ...draft.bomLines.map(line => componentParentId && line.id === componentParentId
              ? { ...line, costStrategy: 'expand_children' as const, unitCost: null, costEvidence: null }
              : line),
            root,
            ...descendants,
          ],
        }))
        setComponentCandidates([])
        setComponentQuery('')
        toast.success('Ítem SAP y su sub-LdM agregados al borrador.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const handleBomDragStart = (event: DragStartEvent) => {
    setActiveBomLineId(String(event.active.id))
  }

  const resolveBomDrop = (event: DragOverEvent | DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return null
    const lineId = String(event.active.id)
    const targetId = String(event.over.id)
    const source = estimation.draft.bomLines.find(line => line.id === lineId)
    const target = estimation.draft.bomLines.find(line => line.id === targetId)
    if (!source || !target || getEstimationBomDescendantIds(estimation.draft.bomLines, lineId).has(targetId)) return null

    const translated = event.active.rect.current.translated
    const activeCenter = translated ? translated.top + translated.height / 2 : event.over.rect.top + event.over.rect.height / 2
    const relativeY = (activeCenter - event.over.rect.top) / Math.max(event.over.rect.height, 1)
    const orderedLineIds = visibleHierarchyRows.map(row => row.line.id)
    const position: EstimationBomDropPosition = event.activatorEvent.type === 'keydown'
      ? (orderedLineIds.indexOf(targetId) > orderedLineIds.indexOf(lineId) ? 'after' : 'before')
      : relativeY < 0.25
        ? 'before'
        : relativeY > 0.75
          ? 'after'
          : 'inside'
    const sourceContainer = estimation.draft.bomLines.find(line => line.id === source.parentId)
    const destinationContainerId = position === 'inside' ? target.id : target.parentId
    const destinationContainer = estimation.draft.bomLines.find(line => line.id === destinationContainerId)
    if (isSapLine(sourceContainer) || isSapLine(destinationContainer)) return null

    return { lineId, targetId, position, source, destinationContainerId }
  }

  const handleBomDragOver = (event: DragOverEvent) => {
    const drop = resolveBomDrop(event)
    setBomDropHint(drop ? { targetId: drop.targetId, position: drop.position } : null)
  }

  const handleBomDragEnd = (event: DragEndEvent) => {
    setActiveBomLineId(null)
    setBomDropHint(null)
    const drop = resolveBomDrop(event)
    if (!drop) {
      if (event.over && event.active.id !== event.over.id) {
        toast.error('La rama no puede moverse a esa zona. Convierte primero cualquier cabecera SAP involucrada y evita ciclos.')
      }
      return
    }
    const { lineId, targetId, position, source, destinationContainerId } = drop
    const sourceContainer = estimation.draft.bomLines.find(line => line.id === source.parentId)
    const destinationContainer = estimation.draft.bomLines.find(line => line.id === destinationContainerId)
    if (isSapLine(sourceContainer) || isSapLine(destinationContainer)) {
      toast.error('Convierte primero la cabecera SAP en una sub-LdM nueva para reorganizar su contenido.')
      return
    }
    try {
      updateDraft(draft => ({
        ...draft,
        bomLines: reconcileManualContainers(
          moveEstimationBomBranch(draft.bomLines, lineId, targetId, position),
          new Set([source.parentId, destinationContainerId].filter((id): id is string => Boolean(id))),
          new Set(position === 'inside' ? [targetId] : []),
        ),
      }))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const freezeCalibration = () => {
    startTransition(async () => {
      try {
        const saved = await freezeEstimationSyntheticMarbleCalibrationAction({
          id: estimation.id,
          volumeMm3: estimation.draft.geometry.volumeMm3,
          paintAreaMm2: estimation.draft.geometry.paintAreaMm2,
          weightWastePct: estimation.draft.geometry.weightWastePct,
          castingWastePct: estimation.draft.geometry.castingWastePct,
          postDemoldWastePct: estimation.draft.geometry.postDemoldWastePct,
        })
        setSaved(saved)
        toast.success('Estimaciones calculadas y cantidades de mezcla, gelcoat y peróxido actualizadas en la LdM.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const registerActualConsumption = () => {
    startTransition(async () => {
      try {
        const saved = await registerEstimationActualConsumptionMeasurementAction({
          id: estimation.id,
          actualMixtureKg: parseDecimalInput(actualConsumptionInputs.actualMixtureKg),
          actualGelcoatKg: parseDecimalInput(actualConsumptionInputs.actualGelcoatKg),
          actualNetWeightKg: parseDecimalInput(actualConsumptionInputs.actualNetWeightKg),
          actualGrossWeightKg: parseDecimalInput(actualConsumptionInputs.actualGrossWeightKg),
          actualCastingWasteKg: parseDecimalInput(actualConsumptionInputs.actualCastingWasteKg),
          actualPostDemoldWasteOverrideKg: parseDecimalInput(actualConsumptionInputs.actualPostDemoldWasteOverrideKg),
          actualPackagingWeightKg: parseDecimalInput(actualConsumptionInputs.actualPackagingWeightKg),
        })
        setSaved(saved)
        toast.success('Toma real registrada y verificada. Mezcla, gelcoat y peróxido reemplazaron sus cantidades en la LdM; los pesos quedaron disponibles para Ingeniería.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const refreshCosts = () => {
    startTransition(async () => {
      try {
        const refreshedDraft = await refreshSapStructures(estimation.draft)
        const persisted = await persist({ ...estimation, draft: refreshedDraft })
        const saved = await refreshEstimationSapCostsAction({ id: persisted.id })
        setSaved(saved)
        toast.success('Estructura y costos SAP actualizados.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const createFamily = () => {
    const sapPrefix = pendingSapFamily?.sapPrefix ?? estimation.draft.homologue?.sapPrefix ?? estimation.sapPrefix
    startTransition(async () => {
      try {
        await createEstimationFamilyAction({
          sapPrefix,
          familyName: familyForm.familyName,
          productType: familyForm.productType,
          zoneHome: familyForm.zoneHome,
          useDestination: familyForm.useDestination,
          line: familyForm.line,
          manufacturingProcess: familyForm.manufacturingProcess,
        })
        const saved = await redefineEstimationFamilyAction({ id: estimation.id, sapPrefix })
        setSaved(saved)
        setPendingSapFamily(null)
        setPendingFamilyReference(null)
        setFamilyCandidates([])
        setFamilyQuery('')
        toast.success(`Familia local ${saved.familyCode} creada, vinculada y verificada. Referencia sugerida ${saved.proposedReferenceCode}.`)
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const searchSapFamilies = async () => {
    if (!familyQuery.trim()) {
      setFamilyCandidates([])
      setHasSearchedFamily(false)
      return
    }
    setIsSearchingFamily(true)
    setHasSearchedFamily(false)
    try {
      setFamilyCandidates(await searchEstimationSapFamiliesAction(familyQuery))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setIsSearchingFamily(false)
      setHasSearchedFamily(true)
    }
  }

  const selectSapFamily = async (candidate: EstimationSapFamilyCandidate) => {
    setPendingSapFamily(candidate)
    setPendingFamilyReference(null)
    setIsPreparingFamily(true)
    try {
      const proposal = await proposeEstimationReferenceForFamilyAction({ sapPrefix: candidate.sapPrefix })
      setPendingFamilyReference(proposal)
      if (candidate.localFamilyName === null) {
        setFamilyForm(current => ({
          ...current,
          familyName: '',
          productType: '',
          zoneHome: '',
          useDestination: '',
          line: '',
        }))
      }
    } catch (error) {
      setPendingSapFamily(null)
      toast.error(errorMessage(error))
    } finally {
      setIsPreparingFamily(false)
    }
  }

  const applySelectedFamily = () => {
    if (!pendingSapFamily || pendingSapFamily.localFamilyName === null) return
    startTransition(async () => {
      try {
        const saved = await redefineEstimationFamilyAction({ id: estimation.id, sapPrefix: pendingSapFamily.sapPrefix })
        setSaved(saved)
        setPendingSapFamily(null)
        setPendingFamilyReference(null)
        setFamilyCandidates([])
        setFamilyQuery('')
        toast.success(`Familia de trabajo actualizada a ${saved.familyCode}; referencia sugerida ${saved.proposedReferenceCode}.`)
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

  const renderBomRow = (row: EstimationBomHierarchyRow, chevron: ReactNode) => {
    const { line, level, hasChildren } = row
    const valuation = lineValuations.get(line.id)
    const containingLine = estimation.draft.bomLines.find(candidate => candidate.id === line.parentId)
    const contentLocked = isSapLine(containingLine)
    const isManual = line.origin === 'manual'
    const physicalWeightPolicy = inferPhysicalWeightPolicy(line, hasChildren)
    const physicalWeightPolicyIsFixed = isPhysicalWeightPolicyFixed(line, hasChildren)
    const suggestedCode = extensionText(line.extensions, 'suggestedSapItemCode')
    const excludedByManualBoundary = isExcludedByManualBoundary(line, estimation.draft.bomLines)
    return (
      <SortableBomRow key={line.id} lineId={line.id} excluded={excludedByManualBoundary} dropPosition={bomDropHint?.targetId === line.id ? bomDropHint.position : null}>
        <div className="p-2" style={{ paddingLeft: `${level * 14 + 4}px` }}>
          <div className="flex items-center gap-1.5">
            {chevron}
            <Badge variant={hasChildren ? 'secondary' : 'outline'}>Nivel {getEstimationBomDisplayLevel(level)}</Badge>
            <span className="font-semibold text-slate-900">{line.sapItemCode ?? suggestedCode ?? 'Manual'}</span>
            {isManual ? <Input className="h-7 min-w-0 flex-1" value={line.itemName ?? ''} onChange={(event) => updateBomLine(line.id, { itemName: event.target.value || null })} placeholder="Nombre" /> : <span className="min-w-0 flex-1 break-words leading-tight text-slate-700">{line.itemName}</span>}
          </div>
          {suggestedCode && <p className="mt-1 text-[11px] text-amber-700">Sugerido, no reservado: {suggestedCode}</p>}
          {excludedByManualBoundary && <Badge className="mt-1 bg-amber-100 text-amber-800">Excluido por costo manual de la rama</Badge>}
          <div className="mt-2 ml-[30px] flex items-center gap-2">{physicalWeightPolicyIsFixed ? <Badge variant="outline">{PHYSICAL_WEIGHT_POLICY_LABELS[physicalWeightPolicy]}</Badge> : <select aria-label="Tipo de peso" className="h-7 rounded border border-input bg-white px-2 text-[11px]" value={physicalWeightPolicy} onChange={(event) => updateBomLine(line.id, { physicalWeightPolicy: event.target.value as EstimationDraftPhysicalWeightPolicy })}>{PHYSICAL_WEIGHT_POLICY_CHOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}{physicalWeightPolicy !== 'no_weight' && <select aria-label="Destino del peso" className="h-7 rounded border border-input bg-white px-2 text-[11px]" value={line.physicalWeightCategory ?? 'product'} onChange={(event) => updateBomLine(line.id, { physicalWeightCategory: event.target.value as 'product' | 'packaging', extensions: { ...line.extensions, physicalWeightCategoryDefinedByUser: true } })}><option value="product">Producto</option><option value="packaging">Empaque</option></select>}{physicalWeightPolicy === 'useful_weight' && <Input aria-label="Cantidad útil" className="h-7 w-24" disabled={contentLocked} inputMode="decimal" value={numberInput(line.usefulQuantity)} onChange={(event) => updateBomLine(line.id, { usefulQuantity: numberOrNull(event.target.value) })} placeholder="Cantidad útil" />}{!physicalWeightPolicyIsFixed && physicalWeightPolicy === 'direct_weight' && line.physicalWeightSnapshot?.kgPerUom === null && <Link href="/physical-weights" className="text-[11px] font-medium text-amber-700 hover:text-amber-900">Definir kg/{line.uom ?? 'UOM'}</Link>}</div>
        </div>
        <div className="flex justify-center p-2"><BomQuantityUomInput line={line} contentLocked={contentLocked} onChange={(changes) => updateBomLine(line.id, changes)} /></div>
        <div className="flex flex-col items-center p-2 text-center">{isManual && <select value={line.costStrategy ?? ''} disabled={contentLocked} onChange={(event) => { const costStrategy = (event.target.value || null) as EstimationBomCostStrategy | null; if (costStrategy === 'manual_override' && hasChildren && !window.confirm('El costo manual excluirá expresamente todos los descendientes del cálculo. ¿Continuar?')) return; updateBomLine(line.id, costStrategy === 'expand_children' ? { costStrategy, unitCost: null, costEvidence: null, manualCostReason: null } : { costStrategy }) }} className="mb-1 h-7 max-w-full rounded border border-input bg-white px-1 text-[11px]">{COST_STRATEGIES.map(strategy => <option key={strategy.value} value={strategy.value}>{strategy.label}</option>)}</select>}{isManual && line.costStrategy === 'manual_override' ? <Input className="h-8 w-24" inputMode="decimal" value={numberInput(line.unitCost)} onChange={(event) => { const unitCost = numberOrNull(event.target.value); updateBomLine(line.id, { unitCost, costEvidence: unitCost === null ? null : { source: 'manual', candidateId: null, warehouseCode: null, documentType: 'Manual', documentNumber: null, documentDate: new Date().toISOString(), originalCurrency: 'COP', sourceUom: line.uom, warning: null, extensions: {} } }) }} /> : <span className="font-semibold text-slate-800">{valuation?.structuralUnitCost === null || valuation?.structuralUnitCost === undefined ? 'Pendiente' : formatCurrency(valuation.structuralUnitCost)}</span>}</div>
        <div className="p-2 text-center font-semibold text-slate-800">{valuation ? formatCurrency(valuation.totalCost) : 'Pendiente'}</div>
        <div className="px-4 py-3"><div className="flex min-w-40 flex-col gap-1">{isManual && <><Button type="button" size="sm" variant="outline" onClick={() => prepareSapChildSearch(line.id)}><GitBranchPlus className="h-3.5 w-3.5" />Agregar hijo SAP</Button><Button type="button" size="sm" variant="outline" onClick={() => addManualChild(line.id)}><PackagePlus className="h-3.5 w-3.5" />Agregar manual</Button></>}{line.origin === 'sap' && hasChildren && <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => convertSapSubstructure(line)}><Copy className="h-3.5 w-3.5" />Copiar sub-LdM</Button>}<Button type="button" variant="ghost" size="sm" disabled={contentLocked} onClick={() => removeBomLine(line.id)}><Trash2 className="h-3.5 w-3.5 text-red-600" />Eliminar rama</Button></div></div>
      </SortableBomRow>
    )
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

      <section className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Identidad provisional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-12">
              <div className="space-y-2 md:col-span-9">
                <Label htmlFor="provisional-name">Nombre provisional</Label>
                <Input id="provisional-name" value={estimation.provisionalName} onChange={(event) => setEstimation((current) => ({ ...current, provisionalName: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="estimation-status">Estado de Diseño</Label>
                <select id="estimation-status" value={estimation.status} onChange={(event) => setEstimation((current) => ({ ...current, status: event.target.value as ProductDesignEstimationStatus }))} className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-slate-800 shadow-sm">
                  {ESTIMATION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </div>
              <div className="space-y-2 md:col-span-6">
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
              <div className="space-y-2 md:col-span-2"><Label htmlFor="width-cm">Ancho (cm)</Label><Input id="width-cm" className="max-w-24" inputMode="decimal" value={numberInput(estimation.widthMm)} onChange={(event) => setEstimation((current) => ({ ...current, widthMm: numberOrNull(event.target.value) }))} /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="depth-cm">Fondo (cm)</Label><Input id="depth-cm" className="max-w-24" inputMode="decimal" value={numberInput(estimation.depthMm)} onChange={(event) => setEstimation((current) => ({ ...current, depthMm: numberOrNull(event.target.value) }))} /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="height-cm">Alto (cm)</Label><Input id="height-cm" className="max-w-24" inputMode="decimal" value={numberInput(estimation.heightMm)} onChange={(event) => setEstimation((current) => ({ ...current, heightMm: numberOrNull(event.target.value) }))} /></div>
              </div>
              <div className="space-y-4 border-t border-slate-200 pt-5">
                <h2 className="text-lg font-semibold text-slate-900">Homólogo LdM</h2>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p><strong>Actual:</strong> {estimation.draft.homologue?.sapItemCode ?? estimation.homologueSapItemCode ?? 'Sin definir'}{estimation.draft.homologue?.itemName ? ` · ${estimation.draft.homologue.itemName}` : ''}</p>
                <p className="mt-1"><strong>Familia local:</strong> {estimation.familyCode ?? 'Aún no existe en el catálogo local'}</p>
                <p className="mt-1"><strong>Referencia sugerida:</strong> {estimation.proposedReferenceCode ?? 'Pendiente'} <span className="text-xs text-slate-500">(no reservada)</span></p>
              </div>
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                <Label htmlFor="sap-family-search">Redefinir familia de trabajo desde SAP</Label>
                <div className="mt-2 flex gap-2">
                  <Input id="sap-family-search" value={familyQuery} onChange={(event) => setFamilyQuery(event.target.value)} placeholder="Código o descripción de familia SAP" />
                  <Button type="button" variant="outline" aria-label="Buscar familias SAP" onClick={searchSapFamilies} disabled={isSearchingFamily || isPending}>{isSearchingFamily ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
                </div>
                <p className="mt-2 text-xs text-violet-800">La búsqueda identifica familias por los prefijos de artículos comerciales SAP y verifica si ya existen en el catálogo local.</p>
                {isSearchingFamily && <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-violet-300 bg-white p-3 text-sm text-violet-950"><RefreshCw className="h-4 w-4 animate-spin" />Consultando familias disponibles en SAP…</div>}
                {!isSearchingFamily && hasSearchedFamily && familyCandidates.length === 0 && <p className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">No se encontraron familias SAP para esta búsqueda.</p>}
                {familyCandidates.length > 0 && <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-violet-200 bg-white p-1">{familyCandidates.map(candidate => <button key={candidate.familyCode} type="button" disabled={isPreparingFamily} onClick={() => void selectSapFamily(candidate)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-violet-50 disabled:cursor-wait disabled:opacity-60"><span className="flex items-center justify-between gap-2"><strong>{candidate.familyCode}</strong><Badge className={candidate.localFamilyName === null ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}>{candidate.localFamilyName === null ? 'Requiere crear en Supabase' : 'Disponible localmente'}</Badge></span><span className="mt-1 block text-xs text-slate-500">{candidate.sampleItemCode} · {candidate.sampleItemName}</span></button>)}</div>}
                {pendingSapFamily && isPreparingFamily && <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-violet-300 bg-white p-3 text-sm text-violet-950"><RefreshCw className="h-4 w-4 animate-spin" />Calculando la siguiente referencia SAP para {pendingSapFamily.familyCode}…</div>}
                {pendingSapFamily && pendingFamilyReference && <div className="mt-3 rounded-lg border border-violet-300 bg-white p-3 text-sm"><p className="font-semibold">Familia seleccionada: {pendingSapFamily.familyCode}</p><p className="mt-1">Siguiente referencia sugerida: <strong>{pendingFamilyReference.referenceCode}</strong> (no reservada).</p>{pendingSapFamily.localFamilyName !== null ? <Button type="button" className="mt-3" onClick={applySelectedFamily} disabled={isPending}>Usar esta familia y referencia</Button> : <p className="mt-2 text-xs font-medium text-amber-800">Esta familia existe en SAP pero no en Supabase. Completa todos los datos del formulario para crearla y vincularla.</p>}</div>}
              </div>
              <div className="flex gap-2">
                <Input value={homologueQuery} onChange={(event) => setHomologueQuery(event.target.value)} placeholder="Buscar homólogo SAP" />
                <Button type="button" variant="outline" onClick={searchHomologues}><Search className="h-4 w-4" /></Button>
              </div>
              {homologueCandidates.length > 0 && <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-1">{homologueCandidates.map((candidate) => <button key={candidate.itemCode} type="button" onClick={() => void chooseHomologue(candidate)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sky-50"><strong>{candidate.itemCode}</strong><span className="ml-2 text-slate-500">{candidate.itemName}</span></button>)}</div>}
              {estimation.draft.commercialColor.colorCode && <p className="text-xs text-slate-600">La búsqueda prioriza artículos SAP del color {estimation.draft.commercialColor.colorCode}; así la LdM base conserva su gelcoat concordante.</p>}
              {pendingHomologue && pendingReference && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p><strong>Nuevo homólogo pendiente:</strong> {pendingHomologue.itemCode} · {pendingHomologue.itemName}</p><p className="mt-1">Color del homólogo: {pendingHomologue.colorCode ?? 'sin dato'} · U_Prefijo {pendingHomologue.sapPrefix}; prefijo comercial consultado {pendingReference.salesItemPrefix}; familia {pendingReference.familyCode}; referencia sugerida {pendingReference.referenceCode} (no reservada).</p><Button type="button" variant="outline" className="mt-3" onClick={replaceWithHomologue} disabled={isPending}><Copy className="h-4 w-4" />Copiar LdM al lienzo</Button></div>}

              {familyCodeToCreate && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                  <p className="font-semibold text-sky-950">Crear familia local {familyCodeToCreate}</p>
                  <p className="mt-1 text-sm text-sky-900">Completa y revisa los datos base antes de crear la familia en el catálogo local. Este paso no crea referencias, SKU ni artículos SAP.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="family-name">Nombre o descripción de familia</Label>
                      <Input id="family-name" value={familyForm.familyName} onChange={(event) => setFamilyForm((current) => ({ ...current, familyName: event.target.value }))} placeholder="Nombre de familia" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="family-process">Proceso de manufactura</Label>
                      <CreatableFamilySelect id="family-process" label="proceso" options={familyCreationOptions.manufacturingProcesses} value={familyForm.manufacturingProcess} onChange={(manufacturingProcess) => setFamilyForm(current => ({ ...current, manufacturingProcess }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="family-product-type">Tipo de producto</Label>
                      <CreatableFamilySelect id="family-product-type" label="tipo de producto" options={familyCreationOptions.productTypes} value={familyForm.productType} onChange={(productType) => setFamilyForm(current => ({ ...current, productType }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="family-zone">Zona (ambiente)</Label>
                      <CreatableFamilySelect id="family-zone" label="zona" options={familyCreationOptions.zoneHomes} value={familyForm.zoneHome} onChange={(zoneHome) => setFamilyForm(current => ({ ...current, zoneHome }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="family-destination">Uso / destino</Label>
                      <CreatableFamilySelect id="family-destination" label="destino" options={familyCreationOptions.useDestinations} value={familyForm.useDestination} onChange={(useDestination) => setFamilyForm(current => ({ ...current, useDestination }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="family-line">Línea comercial autorizada</Label>
                      <CreatableFamilySelect id="family-line" label="línea" options={familyCreationOptions.lines} value={familyForm.line} onChange={(line) => setFamilyForm(current => ({ ...current, line }))} />
                    </div>
                  </div>
                  <Button type="button" className="mt-4" onClick={createFamily} disabled={isPending}><FilePlus2 className="h-4 w-4" />Crear familia y usarla en la cotización</Button>
                </div>
              )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Estimaciones según CAD | Mármol sintético</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 2xl:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="cad-volume">Volumen</Label><UnitInput id="cad-volume" unit="mm³" inputMode="decimal" value={numberInput(estimation.draft.geometry.volumeMm3)} onChange={(event) => updateGeometry('volumeMm3', event.target.value)} /></div>
                <div className="space-y-2"><Label>Mezcla</Label><UnitInput unit="kg" readOnly value={formatQuantity(estimation.draft.geometry.estimatedMixtureKg)} className="bg-slate-50" /></div>
                <div className="space-y-2"><Label htmlFor="paint-area">Área</Label><UnitInput id="paint-area" unit="mm²" inputMode="decimal" value={numberInput(estimation.draft.geometry.paintAreaMm2)} onChange={(event) => updateGeometry('paintAreaMm2', event.target.value)} /></div>
                <div className="space-y-2"><Label>Gelcoat</Label><UnitInput unit="kg" readOnly value={formatQuantity(estimation.draft.geometry.estimatedGelcoatKg)} className="bg-slate-50" /></div>
                <div className="space-y-2"><Label>Peróxido</Label><UnitInput unit="g" readOnly value={formatQuantity(estimatedPeroxideGrams, 2)} className="bg-slate-50" /></div>
              </div>
              <div className="grid items-end gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 2xl:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="casting-waste">Merma vaciado</Label><UnitInput id="casting-waste" unit="%" inputMode="decimal" value={numberInput(estimation.draft.geometry.castingWastePct === null ? null : estimation.draft.geometry.castingWastePct * 100)} onChange={(event) => { const value = numberOrNull(event.target.value); updateGeometry('castingWastePct', value === null ? '' : String(value / 100)) }} /></div>
                <div className="space-y-2"><Label htmlFor="post-waste">Merma pos-desmolde</Label><UnitInput id="post-waste" unit="%" inputMode="decimal" value={numberInput(estimation.draft.geometry.postDemoldWastePct === null ? null : estimation.draft.geometry.postDemoldWastePct * 100)} onChange={(event) => { const value = numberOrNull(event.target.value); updateGeometry('postDemoldWastePct', value === null ? '' : String(value / 100)) }} /></div>
                <div className="space-y-2"><Label>Peso neto</Label><UnitInput unit="kg" readOnly value={formatQuantity(estimation.draft.geometry.estimatedNetWeightKg, 2)} className="bg-white" /></div>
                <div className="space-y-2"><Label>Peso empaque</Label><UnitInput unit="kg" readOnly value={formatQuantity(estimation.draft.geometry.estimatedPackagingWeightKg, 2)} className="bg-white" /></div>
                <div className="space-y-2"><Label>Peso bruto</Label><UnitInput unit="kg" readOnly value={formatQuantity(estimation.draft.geometry.estimatedGrossWeightKg, 2)} className="bg-white" /></div>
                {hasIncompletePhysicalWeight && <p className="text-xs font-medium text-red-700 sm:col-span-2 xl:col-span-5">Faltan pesos por detallar; estos valores son una estimación inicial.</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">Completa volumen, área y ambas mermas para calcular.</p><Button type="button" variant="outline" onClick={freezeCalibration} disabled={isPending || !canCalculateCad}><Calculator className="h-4 w-4" />Calcular y congelar con muestras válidas</Button></div>
              <div className="grid items-end gap-4 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:grid-cols-2 [&>.w-full]:sm:col-span-2">
                <div className="space-y-2"><Label htmlFor="actual-mixture">Mezcla real</Label><UnitInput id="actual-mixture" unit="kg" inputMode="decimal" value={actualConsumptionInputs.actualMixtureKg} onChange={(event) => updateActualConsumption('actualMixtureKg', event.target.value)} placeholder="Consumo real" /></div>
                <div className="space-y-2"><Label htmlFor="actual-gelcoat">Gelcoat real</Label><UnitInput id="actual-gelcoat" unit="kg" inputMode="decimal" value={actualConsumptionInputs.actualGelcoatKg} onChange={(event) => updateActualConsumption('actualGelcoatKg', event.target.value)} placeholder="Consumo real" /></div>
                <div className="space-y-2"><Label htmlFor="actual-peroxide">Peróxido real</Label><UnitInput id="actual-peroxide" unit="g" readOnly value={formatQuantity(actualPeroxideGrams, 2)} className="bg-white" /></div>
                <div className="space-y-2"><Label htmlFor="actual-casting-waste">Merma vaciado</Label><UnitInput id="actual-casting-waste" unit="kg" inputMode="decimal" value={actualConsumptionInputs.actualCastingWasteKg} onChange={(event) => updateActualConsumption('actualCastingWasteKg', event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="actual-post-waste">Merma pos-desmolde</Label><UnitInput id="actual-post-waste" unit="kg" inputMode="decimal" value={actualConsumptionInputs.actualPostDemoldWasteOverrideKg || numberInput(materialBalance.calculatedPostDemoldWasteKg)} onChange={(event) => updateActualConsumption('actualPostDemoldWasteOverrideKg', event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="actual-net-weight">Peso neto real</Label><UnitInput id="actual-net-weight" unit="kg" inputMode="decimal" value={actualConsumptionInputs.actualNetWeightKg} onChange={(event) => updateActualConsumption('actualNetWeightKg', event.target.value)} placeholder="Sin empaque" /></div>
                <div className="space-y-2"><Label htmlFor="actual-packaging-weight">Peso empaque</Label><UnitInput id="actual-packaging-weight" unit="kg" inputMode="decimal" value={actualConsumptionInputs.actualPackagingWeightKg} onChange={(event) => updateActualConsumption('actualPackagingWeightKg', event.target.value)} placeholder="Opcional" /></div>
                <div className="space-y-2"><Label htmlFor="actual-gross-weight">Peso bruto real</Label><UnitInput id="actual-gross-weight" unit="kg" inputMode="decimal" value={actualConsumptionInputs.actualGrossWeightKg || numberInput(materialBalance.calculatedGrossWeightKg)} onChange={(event) => updateActualConsumption('actualGrossWeightKg', event.target.value)} placeholder="Con empaque" /></div>
                <div className="w-full grid gap-2 rounded-md border border-sky-200 bg-white p-3 text-sm sm:grid-cols-3"><p>MP usada: <strong>{formatQuantity(materialBalance.totalMaterialKg, 3)} kg</strong><br/><span className="text-xs text-slate-600">Gelcoat {materialBalance.gelcoatBasis === 'actual' ? 'real' : materialBalance.gelcoatBasis === 'theoretical' ? 'teórico' : 'pendiente'}</span></p><p>Merma vaciado: <strong>{formatQuantity(materialBalance.castingWastePct === null ? null : materialBalance.castingWastePct * 100, 2)} %</strong></p><p>Merma pos-desmolde: <strong>{formatQuantity(materialBalance.postDemoldWastePct === null ? null : materialBalance.postDemoldWastePct * 100, 2)} %</strong></p><p>Merma total: <strong>{formatQuantity(materialBalance.totalWastePct === null ? null : materialBalance.totalWastePct * 100, 2)} %</strong></p><p>Rendimiento: <strong>{formatQuantity(materialBalance.yieldPct === null ? null : materialBalance.yieldPct * 100, 2)} %</strong></p><p>No mapeado: <strong>{formatQuantity(materialBalance.unmappedWasteKg, 3)} kg</strong></p><p>Peso bruto efectivo: <strong>{formatQuantity(materialBalance.effectiveGrossWeightKg, 3)} kg</strong><br/><span className="text-xs text-slate-600">{actualConsumptionInputs.actualGrossWeightKg ? 'Dato real' : 'Calculado'}</span></p></div>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={registerActualConsumption} disabled={isPending}>Registrar toma para Ingeniería</Button>
                <p className="w-full text-xs text-sky-900">Al registrar, la toma queda pendiente en Mediciones de Ingeniería y las cantidades reales de mezcla, gelcoat y peróxido reemplazan esos componentes en la LdM. Los pesos reales permanecen en la cotización y en la evidencia de la medición para el futuro producto formal.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">

          <Card>
            <CardHeader>
              <CardTitle>Lienzo de LdM y costos</CardTitle>
              <CardDescription>Edita cantidades, agrega ítems SAP o manuales y define el costeo de cada rama sin doble conteo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {gelcoatReplacementProposals.length > 0 && <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold">La LdM usa gelcoat de otro color</p><p className="mt-1">Se propone reemplazar {gelcoatReplacementProposals.map(item => `${item.currentItemCode} por ${item.proposedItemCode}`).join(', ')} directamente en la LdM.</p></div><Button type="button" variant="outline" onClick={replaceGelcoatForSelectedColor} disabled={isPending}>Actualizar gelcoat en LdM</Button></div>}
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:flex-row">
                <Input value={componentQuery} onChange={(event) => setComponentQuery(event.target.value)} placeholder="Buscar ítem SAP para agregar" />
                <select value={componentParentId} onChange={(event) => setComponentParentId(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm">
                  <option value="">En nivel 2</option>
                  {hierarchyRows.map(({ line, level }) => <option key={line.id} value={line.id}>{'— '.repeat(level)}{line.itemName ?? line.sapItemCode ?? line.id}</option>)}
                </select>
                <Button type="button" variant="outline" onClick={searchComponents}><Search className="h-4 w-4" />Buscar SAP</Button>
                <Button type="button" variant="outline" onClick={() => addManualChild(componentParentId || null)}><PackagePlus className="h-4 w-4" />Agregar manual</Button>
              </div>
              {componentCandidates.length > 0 && <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-1">{componentCandidates.map((candidate) => <button key={candidate.itemCode} type="button" onClick={() => addSapComponent(candidate)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sky-50"><strong>{candidate.itemCode}</strong><span className="ml-2 text-slate-500">{candidate.itemName}</span></button>)}</div>}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-3">
                  <Badge className="bg-slate-900 text-white">Nivel 1</Badge>
                  <div><p className="font-semibold text-slate-950">{estimation.provisionalName}</p><p className="text-xs text-slate-600">Estructura basada en {estimation.draft.homologue?.sapItemCode ?? 'un homólogo pendiente'}</p></div>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <div className={`grid min-w-[788px] ${BOM_GRID_COLUMNS} bg-slate-100 text-xs font-semibold text-slate-600`}>
                  <div className="p-2" aria-hidden="true" /><div className="p-2 text-center">Nivel / componente</div><div className="p-2 text-center">Cant./Und</div><div className="p-2 text-center">Costo unit.</div><div className="p-2 text-center">Subtotal</div><div className="p-2 text-center">Acciones</div>
                </div>
                <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragStart={handleBomDragStart} onDragOver={handleBomDragOver} onDragEnd={handleBomDragEnd} onDragCancel={() => { setActiveBomLineId(null); setBomDropHint(null) }}>
                  <SortableContext items={visibleHierarchyRows.map(row => row.line.id)} strategy={verticalListSortingStrategy}>
                    <div className="min-w-[788px]">
                      {(hierarchyRowsByParentId.get(null) ?? []).map((row) => (
                        <EstimationBomTreeBranch
                          key={row.line.id}
                          row={row}
                          rowsByParentId={hierarchyRowsByParentId}
                          collapsedLineIds={collapsedBomLineIds}
                          onOpenChange={setBomBranchOpen}
                          renderRow={renderBomRow}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>{activeBomLineId ? <div className="rounded border border-sky-300 bg-white px-4 py-3 text-sm shadow-xl">Moviendo {estimation.draft.bomLines.find(line => line.id === activeBomLineId)?.itemName ?? 'rama'}</div> : null}</DragOverlay>
                </DndContext>
              </div>
              <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" onClick={refreshCosts} disabled={isPending}><RefreshCw className="h-4 w-4" />Actualizar estructura y costos SAP</Button>{lastSapCostReadAt && <p className="text-xs text-slate-600">Consultado el: {new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastSapCostReadAt))}</p>}<Link href="/physical-weights" className="text-sm font-medium text-sky-700 hover:text-sky-900">Administrar factores físicos</Link><p className="text-xs text-slate-600">Sólo se aplican promedios/estándares vigentes de MP-01 a hojas SAP. Las líneas manuales conservan su costo; no se usan entradas genéricas como compras.</p></div>
              {costInput.incompleteLineIds.length > 0 ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Completa cantidad, categoría y estrategia en {costInput.incompleteLineIds.length} línea(s) para calcular totales.</div> : costResult?.ok ? <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm md:grid-cols-2"><div><p className="font-semibold text-emerald-950">Materiales + empaque</p><p className="text-lg font-bold">{formatCurrency(costResult.totals.materialsAndPackaging)}</p></div><div><p className="font-semibold text-emerald-950">Total ampliado (incluye MO/CIF/otros)</p><p className="text-lg font-bold">{formatCurrency(costResult.totals.expandedTotal)}</p></div><p className="md:col-span-2 text-xs text-emerald-800">Material {formatCurrency(costResult.totals.byCategory.material)} · Empaque {formatCurrency(costResult.totals.byCategory.packaging)} · MO {formatCurrency(costResult.totals.byCategory.mo)} · CIF {formatCurrency(costResult.totals.byCategory.cif)} · Otros {formatCurrency(costResult.totals.byCategory.other)}</p></div> : <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">La LdM aún no se puede totalizar</p><ul className="mt-1 list-disc pl-5">{costResult?.issues.map((issue) => <li key={`${issue.code}-${issue.lineId}`}>{issue.message}</li>)}</ul></div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Revisión técnica</CardTitle><CardDescription>Ingeniería deja una observación informativa; no bloquea el estado de Diseño.</CardDescription></CardHeader>
            <CardContent className="space-y-2"><Badge variant={estimation.technicalReviewStatus === 'reviewed' ? 'secondary' : 'outline'}>{estimation.technicalReviewStatus}</Badge>{estimation.technicalReviewNote ? <p className="text-sm text-slate-700">{estimation.technicalReviewNote}</p> : <p className="text-sm text-slate-500">Sin observación todavía.</p>}<Link href="/engineering/estimations" className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-900"><Wrench className="h-4 w-4" />Abrir revisiones de Ingeniería</Link></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Compartir con Ventas</CardTitle><CardDescription>Ventas ve sólo cotizaciones que Diseño comparta expresamente.</CardDescription></CardHeader>
            <CardContent className="space-y-3"><Button type="button" variant={estimation.sharedWithSales ? 'outline' : 'default'} className="w-full" onClick={setSharedWithSales} disabled={isPending || (!estimation.sharedWithSales && (!costResult?.ok || costInput.incompleteLineIds.length > 0))}>{estimation.sharedWithSales ? 'Retirar de Ventas' : <><Send className="h-4 w-4" />Compartir con Ventas</>}</Button>{!estimation.sharedWithSales && (!costResult?.ok || costInput.incompleteLineIds.length > 0) && <p className="text-sm text-amber-700">Completa la LdM y sus costos para poder compartir esta cotización con Ventas.</p>}<p className="text-sm text-slate-600">Ventas administrará MC, descuento, precios y respuesta comercial.</p></CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
