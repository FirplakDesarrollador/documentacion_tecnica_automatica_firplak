'use server'

import { revalidatePath } from 'next/cache'

import {
  getSapItem,
  getSapItemBomsByCodes,
  getSapItemGroup,
  getSapItemsByCodes,
  getSapItemsWithWarehouseAverage,
  getSapWarehouseAverageCost,
  searchSapItems,
} from '@/lib/sap/serviceLayer'
import { loadFullSapBomHierarchy, type FullSapBomNode } from '@/lib/sap/fullBomHierarchy'
import { dbQuery } from '@/lib/supabase'
import {
  calculateSyntheticMarbleCalibration,
  type EstimationMeasurement,
} from '@/lib/productDesign/estimationCalibration'
import {
  createEmptyEstimationDraft,
  freezeSyntheticMarbleCalibration,
  isPackagingPhysicalItemCode,
  normalizeEstimationDraft,
  serializeEstimationDraft,
  type EstimationDraft,
  type EstimationDraftBomLine,
} from '@/lib/productDesign/estimationDraft'
import {
  deriveEstimationFamilyCode,
  deriveEstimationSalesItemPrefix,
  proposeEstimationReference,
} from '@/lib/productDesign/estimationReferenceProposal'
import { familyNameFromSapItemGroup, inferFamilyFromSapDescriptions } from '@/lib/productDesign/familyInference'
import { evaluateEstimationBomCosting, type EstimationBomCostLine } from '@/lib/productDesign/estimationBomCosting'
import { assertValidEstimationBomLinks, getEstimationBomDescendantIds } from '@/lib/productDesign/estimationBomHierarchy'
import { inferEstimationSapCostCategory } from '@/lib/productDesign/estimationSapClassification'
import { proposeGelcoatReplacements, sapItemColorCode } from '@/lib/productDesign/gelcoatAlignment'
import { applySyntheticMarbleBomQuantities } from '@/lib/productDesign/syntheticMarbleBomQuantities'
import {
  calculateEstimationPhysicalWeights,
  DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT,
  inferPhysicalWeightPolicy,
} from '@/lib/productDesign/estimationPhysicalWeights'
import { calculateEstimationMaterialBalance } from '@/lib/productDesign/estimationMaterialBalance'
import { assertPermission, type AccessContext } from '@/utils/auth/access'

const ESTIMATION_STATUSES = ['draft', 'active', 'closed', 'archived'] as const
const COMMERCIAL_OUTCOMES = ['pending', 'approved', 'rejected', 'not_pursued'] as const
const SYNTHETIC_MARBLE_PROCESS = 'MÁRMOL SINTÉTICO'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const SAP_PAGE_LIMIT = 20
const SAP_REFERENCE_SCAN_MAX_PAGES = 50
const ESTIMATION_COST_CURRENCY = 'COP'

type RawRow = Record<string, unknown>
type ProductDesignAccess = AccessContext & {
  user: NonNullable<AccessContext['user']>
}

function toCostLine(line: EstimationDraftBomLine): EstimationBomCostLine | null {
  if (line.quantity === null || line.costCategory === null || line.costStrategy === null) return null
  const rawBomQuantity = line.extensions.sapBomQuantity
  const bomQuantity = typeof rawBomQuantity === 'number' && Number.isFinite(rawBomQuantity) ? rawBomQuantity : null
  return {
    id: line.id,
    parentId: line.parentId,
    quantity: line.quantity,
    uom: line.uom,
    costCategory: line.costCategory,
    costStrategy: line.costStrategy,
    origin: line.origin,
    bomQuantity,
    unitCost: line.unitCost,
  }
}

export type ProductDesignEstimationStatus = (typeof ESTIMATION_STATUSES)[number]
export type ProductDesignCommercialOutcome = (typeof COMMERCIAL_OUTCOMES)[number]

export type ProductDesignEstimationSummary = {
  id: string
  manufacturingProcess: string
  sapPrefix: string
  familyCode: string | null
  proposedReferenceCode: string | null
  provisionalName: string
  widthMm: number | null
  depthMm: number | null
  heightMm: number | null
  colorCode: string | null
  homologueSapItemCode: string | null
  status: ProductDesignEstimationStatus
  technicalReviewStatus: string
  sharedWithSales: boolean
  commercialOutcome: ProductDesignCommercialOutcome
  createdAt: string
  updatedAt: string
}

export type ProductDesignEstimation = ProductDesignEstimationSummary & {
  technicalReviewNote: string | null
  technicalReviewedBy: string | null
  technicalReviewedAt: string | null
  sharedWithSalesAt: string | null
  sharedWithSalesBy: string | null
  commercialContactName: string | null
  commercialOutcomeAt: string | null
  commercialRecordedBy: string | null
  commercialRecordedAt: string | null
  commercialNote: string | null
  createdBy: string | null
  updatedBy: string | null
  draft: EstimationDraft
}

export type CreateProductDesignEstimationInput = {
  provisionalName: string
  sapPrefix: string
  manufacturingProcess?: string | null
  familyCode?: string | null
  proposedReferenceCode?: string | null
  widthMm?: number | null
  depthMm?: number | null
  heightMm?: number | null
  colorCode?: string | null
  homologueSapItemCode?: string | null
}

export type SaveProductDesignEstimationInput = CreateProductDesignEstimationInput & {
  id: string
  status: ProductDesignEstimationStatus
  draft: unknown
}

export type EstimationHomologueCandidate = {
  itemCode: string
  itemName: string
}

export type EstimationSapFamilyCandidate = {
  sapPrefix: string
  familyCode: string
  sampleItemCode: string
  sampleItemName: string
  localFamilyName: string | null
}

export type EstimationCommercialColorCandidate = {
  colorCode: string
  colorName: string
}

export type EstimationHomologue = {
  itemCode: string
  itemName: string
  sapPrefix: string
  colorCode: string | null
  bom: FullSapBomNode | null
  bomError: string | null
  bomBranchErrors: Record<string, string>
  bomLeafCosts: Record<string, EstimationSapLeafCost>
}

export type EstimationSapLeafCost = {
  unitCost: number | null
  inventoryUom: string | null
  warehouseCode: string
  readAt: string
}

export type EstimationFamilyInput = {
  sapPrefix: string
  familyName: string
  productType: string
  zoneHome: string
  useDestination: string
  line: string
  manufacturingProcess?: string | null
}

export type EstimationFamilyCreationOptions = {
  productTypes: string[]
  zoneHomes: string[]
  useDestinations: string[]
  lines: string[]
  manufacturingProcesses: string[]
}

export type EstimationFamilyInference = {
  familyName: string
  productType: string
  zoneHome: string
  useDestination: string
  analyzedItemCount: number
  commonTerms: string[]
  sapItemGroupCode: number | null
  sapItemGroupName: string | null
  familyNameSource: 'sap_item_group' | 'description_terms'
}

function requireServiceRoleConfiguration(): void {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
    throw new Error('La operación requiere credenciales server-side de Supabase; el cliente autenticado no accede directamente a las nuevas tablas.')
  }
}

async function requireProductDesignAccess(): Promise<ProductDesignAccess> {
  const access = await assertPermission('module:product-design:estimations')
  requireServiceRoleConfiguration()
  if (!access.user) throw new Error('No se pudo identificar al usuario de Diseño.')
  return { ...access, user: access.user }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function requiredText(value: unknown, label: string): string {
  const normalized = stringOrNull(value)
  if (!normalized) throw new Error(`${label} es obligatorio.`)
  return normalized
}

function optionalText(value: unknown): string | null {
  return stringOrNull(value)
}

function optionalPositiveNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === '') return null
  const normalized = numberOrNull(value)
  if (normalized === null || normalized <= 0) throw new Error(`${label} debe ser un número mayor que cero.`)
  return normalized
}

function optionalNonNegativeNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} debe ser un número no negativo.`)
  return parsed
}

function requiredUuid(value: unknown, label: string): string {
  const normalized = requiredText(value, label)
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} no es un identificador válido.`)
  return normalized
}

function asEstimationStatus(value: unknown): ProductDesignEstimationStatus {
  const normalized = requiredText(value, 'Estado')
  if (!(ESTIMATION_STATUSES as readonly string[]).includes(normalized)) {
    throw new Error('El estado de la cotización no es válido.')
  }
  return normalized as ProductDesignEstimationStatus
}

function normalizeSapPrefix(value: unknown): string {
  const normalized = requiredText(value, 'U_Prefijo SAP').toUpperCase()
  deriveEstimationFamilyCode(normalized)
  return normalized
}

function normalizeReferenceCode(value: unknown): string | null {
  const normalized = optionalText(value)
  if (normalized === null) return null
  if (!/^\d{4,}$/u.test(normalized)) throw new Error('La referencia propuesta debe ser numérica y tener al menos cuatro dígitos.')
  return normalized
}

function parseDraftJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return {}
  }
}

function mapEstimationSummary(row: RawRow): ProductDesignEstimationSummary {
  const status = stringOrNull(row.status)
  const commercialOutcome = stringOrNull(row.commercial_outcome)
  if (!(ESTIMATION_STATUSES as readonly string[]).includes(status ?? '')) {
    throw new Error('La cotización almacenada tiene un estado inválido.')
  }
  if (!(COMMERCIAL_OUTCOMES as readonly string[]).includes(commercialOutcome ?? '')) {
    throw new Error('La cotización almacenada tiene un resultado comercial inválido.')
  }

  return {
    id: requiredText(row.id, 'Identificador de cotización'),
    manufacturingProcess: requiredText(row.manufacturing_process, 'Proceso de fabricación'),
    sapPrefix: requiredText(row.sap_prefix, 'U_Prefijo SAP'),
    familyCode: stringOrNull(row.family_code),
    proposedReferenceCode: stringOrNull(row.proposed_reference_code),
    provisionalName: requiredText(row.provisional_name, 'Nombre provisional'),
    widthMm: numberOrNull(row.width_mm),
    depthMm: numberOrNull(row.depth_mm),
    heightMm: numberOrNull(row.height_mm),
    colorCode: stringOrNull(row.color_code),
    homologueSapItemCode: stringOrNull(row.homologue_sap_item_code),
    status: status as ProductDesignEstimationStatus,
    technicalReviewStatus: requiredText(row.technical_review_status, 'Estado de revisión técnica'),
    sharedWithSales: booleanValue(row.shared_with_sales),
    commercialOutcome: commercialOutcome as ProductDesignCommercialOutcome,
    createdAt: requiredText(row.created_at, 'Fecha de creación'),
    updatedAt: requiredText(row.updated_at, 'Fecha de actualización'),
  }
}

function mapEstimation(row: RawRow): ProductDesignEstimation {
  return {
    ...mapEstimationSummary(row),
    technicalReviewNote: stringOrNull(row.technical_review_note),
    technicalReviewedBy: stringOrNull(row.technical_reviewed_by),
    technicalReviewedAt: stringOrNull(row.technical_reviewed_at),
    sharedWithSalesAt: stringOrNull(row.shared_with_sales_at),
    sharedWithSalesBy: stringOrNull(row.shared_with_sales_by),
    commercialContactName: stringOrNull(row.commercial_contact_name),
    commercialOutcomeAt: stringOrNull(row.commercial_outcome_at),
    commercialRecordedBy: stringOrNull(row.commercial_recorded_by),
    commercialRecordedAt: stringOrNull(row.commercial_recorded_at),
    commercialNote: stringOrNull(row.commercial_note),
    createdBy: stringOrNull(row.created_by),
    updatedBy: stringOrNull(row.updated_by),
    draft: normalizeEstimationDraft(parseDraftJson(row.draft_data_json)),
  }
}

const ESTIMATION_COLUMNS = `
  id, manufacturing_process, sap_prefix, family_code, proposed_reference_code,
  provisional_name, width_mm, depth_mm, height_mm, color_code,
  homologue_sap_item_code, status, technical_review_status,
  technical_review_note, technical_reviewed_by, technical_reviewed_at,
  shared_with_sales, shared_with_sales_at, shared_with_sales_by,
  commercial_outcome, commercial_contact_name, commercial_outcome_at,
  commercial_recorded_by, commercial_recorded_at, commercial_note,
  draft_data_json, created_by, updated_by, created_at, updated_at
`

async function getEstimationRecord(id: string): Promise<ProductDesignEstimation | null> {
  const rows = await dbQuery(
    `SELECT ${ESTIMATION_COLUMNS}
       FROM public.product_design_estimations
      WHERE id = $1::uuid
      LIMIT 1`,
    [id],
  )
  const row = rows[0]
  return row ? mapEstimation(row) : null
}

async function assertExistingFamily(familyCode: string | null): Promise<void> {
  if (!familyCode) return
  const rows = await dbQuery(
    'SELECT family_code FROM public.families WHERE family_code = $1 LIMIT 1',
    [familyCode],
  )
  if (rows.length === 0) throw new Error(`La familia local ${familyCode} no existe todavía. Créala desde el cotizador o deja la familia sin definir.`)
}

async function getExistingCommercialColor(colorCode: string | null): Promise<EstimationCommercialColorCandidate | null> {
  if (!colorCode) return null
  const rows = await dbQuery(
    'SELECT code_4dig, name_color_sap FROM public.colors WHERE code_4dig = $1 LIMIT 1',
    [colorCode],
  )
  if (rows.length === 0) throw new Error(`El color comercial ${colorCode} no existe en el catálogo.`)
  return {
    colorCode: requiredText(rows[0]?.code_4dig, 'Código del color'),
    colorName: stringOrNull(rows[0]?.name_color_sap) ?? '',
  }
}

function toBomDraftLines(
  nodes: readonly FullSapBomNode[],
  parentId: string | null = null,
  branchErrors: Record<string, string> = {},
  level = 2,
  rootBomQuantity = 1,
  leafCosts: Record<string, EstimationSapLeafCost> = {},
): EstimationDraftBomLine[] {
  const safeRootBomQuantity = Number.isFinite(rootBomQuantity) && rootBomQuantity > 0 ? rootBomQuantity : 1
  return nodes.flatMap((node, index) => {
    const id = `${parentId ?? 'root'}-${node.itemCode}-${index + 1}`
    const branchError = branchErrors[node.itemCode] ?? null
    const subtreeComplete = !node.cycleDetected
      && branchError === null
      && node.lines.every(child => isFullSapSubtreeComplete(child, branchErrors))
    const hasExpandableStructure = node.lines.length > 0 || node.cycleDetected || branchError !== null
    const leafCost = leafCosts[node.itemCode]
    const sourceUom = leafCost?.inventoryUom?.trim().toUpperCase() ?? null
    const lineUom = node.inventoryUom?.trim().toUpperCase() ?? sourceUom
    const hasCompatibleLeafCost = !hasExpandableStructure
      && leafCost?.unitCost !== null
      && leafCost?.unitCost !== undefined
      && leafCost.unitCost > 0
      && (!sourceUom || sourceUom === lineUom)
    const line: EstimationDraftBomLine = {
      id,
      parentId,
      origin: 'sap',
      sapItemCode: node.itemCode,
      itemName: node.itemName || null,
      quantity: parentId === null ? node.quantity / safeRootBomQuantity : node.quantity,
      uom: node.inventoryUom,
      costCategory: inferEstimationSapCostCategory(node.itemCode, node.itemName),
      costStrategy: hasExpandableStructure ? 'expand_children' : 'sap_direct',
      unitCost: hasCompatibleLeafCost ? leafCost.unitCost : null,
      costEvidence: hasExpandableStructure ? null : {
        source: hasCompatibleLeafCost ? 'warehouse_average' : 'unavailable',
        candidateId: hasCompatibleLeafCost ? `warehouse-average:${node.itemCode}:MP-01` : null,
        warehouseCode: 'MP-01',
        documentType: hasCompatibleLeafCost ? 'WarehouseAverage' : null,
        documentNumber: null,
        documentDate: leafCost?.readAt ?? null,
        originalCurrency: hasCompatibleLeafCost ? ESTIMATION_COST_CURRENCY : null,
        sourceUom,
        warning: hasCompatibleLeafCost
          ? 'Costo temporal: promedio/estándar vigente de MP-01. No representa la última compra ni una recepción de proveedor.'
          : sourceUom && lineUom && sourceUom !== lineUom
            ? `El promedio MP-01 está en ${sourceUom} y la línea usa ${lineUom}; el costo queda pendiente.`
            : 'SAP no reporta un promedio/estándar positivo en MP-01; el costo queda pendiente.',
        extensions: { sourceReadAt: leafCost?.readAt ?? null },
      },
      manualCostReason: null,
      notes: branchError ?? (node.cycleDetected ? 'SAP reporta un ciclo en esta sub-LdM.' : null),
      physicalWeightPolicy: hasExpandableStructure ? 'sub_bom_weight' : 'direct_weight',
      physicalWeightCategory: isPackagingPhysicalItemCode(node.itemCode) || inferEstimationSapCostCategory(node.itemCode, node.itemName) === 'packaging' ? 'packaging' : 'product',
      usefulQuantity: null,
      fixedWeightKg: null,
      physicalWeightSnapshot: null,
      extensions: {
        sapLevel: level,
        sapLoaded: !branchError,
        sapLoadedComplete: subtreeComplete,
        sapBomQuantity: node.bomQuantity,
        sapComponentWarehouse: node.componentWarehouse,
        sapOutputWarehouse: node.outputWarehouse,
        sapCycleDetected: node.cycleDetected,
        sapStructureLocked: node.lines.length > 0,
        sapReadError: branchError,
      },
    }
    return [line, ...toBomDraftLines(node.lines, id, branchErrors, level + 1, 1, leafCosts)]
  })
}

function isFullSapSubtreeComplete(node: FullSapBomNode, branchErrors: Record<string, string>): boolean {
  return !node.cycleDetected
    && !branchErrors[node.itemCode]
    && node.lines.every(child => isFullSapSubtreeComplete(child, branchErrors))
}

function collectFullSapLeafCodes(node: FullSapBomNode): string[] {
  if (node.lines.length === 0) return node.cycleDetected ? [] : [node.itemCode]
  return node.lines.flatMap(collectFullSapLeafCodes)
}

async function loadEstimationSapLeafCosts(tree: FullSapBomNode | null): Promise<Record<string, EstimationSapLeafCost>> {
  if (!tree) return {}
  const readAt = timestampNow()
  const averages = await getSapItemsWithWarehouseAverage(collectFullSapLeafCodes(tree), 'MP-01')
  return Object.fromEntries([...averages].map(([itemCode, average]) => [itemCode, {
    unitCost: average.standardAveragePrice,
    inventoryUom: average.inventoryUom,
    warehouseCode: average.warehouseCode,
    readAt,
  }]))
}

function assertSapSubstructureIntegrity(
  lines: readonly EstimationDraftBomLine[],
  previousLines: readonly EstimationDraftBomLine[],
): void {
  assertValidEstimationBomLinks(lines)
  const currentById = new Map(lines.map(line => [line.id, line]))
  const previousById = new Map(previousLines.map(line => [line.id, line]))

  for (const previous of previousLines) {
    if (previous.origin !== 'sap') continue
    const current = currentById.get(previous.id)
    if (!current) continue
    const previousChildren = previousLines.filter(line => line.parentId === previous.id)

    if (current.origin === 'manual') {
      const sourceItemCode = stringOrNull(current.extensions.sourceSapItemCode)?.toUpperCase()
      const convertedAt = stringOrNull(current.extensions.convertedAt)
      if (previousChildren.length === 0 || sourceItemCode !== previous.sapItemCode?.toUpperCase() || !convertedAt) {
        throw new Error(`La conversión de ${previous.sapItemCode ?? previous.id} a componente manual no tiene trazabilidad válida.`)
      }
      continue
    }

  }

  for (const line of lines) {
    const previous = previousById.get(line.id)
    if (previous?.origin === 'manual' && line.origin === 'sap') {
      throw new Error(`La línea manual ${line.id} no puede cambiar de origen conservando el mismo identificador.`)
    }
  }
}

async function canonicalizeSapDraftLines(
  lines: readonly EstimationDraftBomLine[],
  previousLines: readonly EstimationDraftBomLine[],
): Promise<EstimationDraftBomLine[]> {
  assertSapSubstructureIntegrity(lines, previousLines)
  const previousById = new Map(previousLines.map(line => [line.id, line]))
  const sapItemCodes = [...new Set(lines.flatMap(line => {
    const previous = previousById.get(line.id)
    const itemCode = line.origin === 'sap'
      ? (previous?.origin === 'sap' ? previous.sapItemCode : line.sapItemCode)?.trim().toUpperCase()
      : null
    return itemCode ? [itemCode] : []
  }))]
  const itemMasters = await getSapItemsByCodes(sapItemCodes, ['ItemCode', 'ItemName', 'InventoryUOM'])
  const childCounts = new Map<string, number>()
  lines.forEach(line => {
    if (!line.parentId) return
    childCounts.set(line.parentId, (childCounts.get(line.parentId) ?? 0) + 1)
  })
  const completeSapHeaders = lines.filter(line => line.origin === 'sap'
    && (childCounts.get(line.id) ?? 0) > 0
    && line.extensions.sapLoadedComplete !== false)
  const sapBoms = await getSapItemBomsByCodes(completeSapHeaders.flatMap(line => {
    const previous = previousById.get(line.id)
    const itemCode = previous?.origin === 'sap' ? previous.sapItemCode : line.sapItemCode
    return itemCode ? [itemCode.trim().toUpperCase()] : []
  }))
  completeSapHeaders.forEach(header => {
    const previous = previousById.get(header.id)
    const itemCode = (previous?.origin === 'sap' ? previous.sapItemCode : header.sapItemCode)?.trim().toUpperCase()
    const sapBom = itemCode ? sapBoms.get(itemCode) : null
    if (!sapBom) throw new Error(`No fue posible verificar la sub-LdM SAP ${itemCode ?? header.id} antes de guardar.`)
    const currentChildren = lines.filter(line => line.parentId === header.id)
    const matchesSap = currentChildren.length === sapBom.lines.length && currentChildren.every((child, index) => {
      const sapChild = sapBom.lines[index]
      return child.origin === 'sap'
        && child.sapItemCode?.trim().toUpperCase() === sapChild.ItemCode.trim().toUpperCase()
        && child.quantity === sapChild.Quantity
    })
    if (!matchesSap) {
      throw new Error(`Convierte ${itemCode ?? header.id} en una sub-LdM nueva antes de modificar su estructura interna.`)
    }
  })

  return lines.map(line => {
    const hasChildren = (childCounts.get(line.id) ?? 0) > 0
    if (line.origin === 'manual') {
      return {
        ...line,
        sapItemCode: null,
        costStrategy: hasChildren && line.costStrategy === 'sap_direct'
          ? 'expand_children'
          : !hasChildren && line.costStrategy === 'sap_direct'
            ? 'manual_override'
            : line.costStrategy,
      }
    }

    const previous = previousById.get(line.id)
    const itemCode = (previous?.origin === 'sap' ? previous.sapItemCode : line.sapItemCode)?.trim().toUpperCase()
    if (!itemCode) throw new Error(`La línea SAP ${line.id} no tiene ItemCode.`)
    if (line.costStrategy === 'manual_override' || line.costEvidence?.source === 'manual') {
      throw new Error(`Convierte ${itemCode} en una sub-LdM nueva antes de asignarle un costo manual.`)
    }
    const itemMaster = itemMasters.get(itemCode)
    if (!itemMaster) throw new Error(`No fue posible verificar ${itemCode} en SAP antes de guardar.`)

    return {
      ...line,
      sapItemCode: itemCode,
      itemName: stringOrNull(itemMaster.ItemName),
      uom: stringOrNull(itemMaster.InventoryUOM),
      costStrategy: hasChildren ? 'expand_children' : 'sap_direct',
      unitCost: hasChildren ? null : line.unitCost,
      costEvidence: hasChildren ? null : line.costEvidence,
      manualCostReason: null,
    }
  })
}

async function getCurrentSyntheticMarbleCalibration(): Promise<ReturnType<typeof calculateSyntheticMarbleCalibration>> {
  const rows = await dbQuery(
    `SELECT id, calibration_group, measurement_status, cad_volume_mm3,
            paint_area_mm2, mixture_kg, gelcoat_kg
       FROM public.product_engineering_measurements
      WHERE calibration_group = 'SYNTHETIC_MARBLE_GENERAL'`,
  )
  const measurements: EstimationMeasurement[] = rows.map((row: RawRow) => ({
    id: requiredText(row.id, 'Identificador de muestra'),
    calibrationGroup: requiredText(row.calibration_group, 'Grupo de calibración'),
    eligibility: row.measurement_status === 'valid'
      ? 'eligible'
      : row.measurement_status === 'excluded'
        ? 'excluded'
        : 'draft',
    volumeMm3: numberOrNull(row.cad_volume_mm3),
    paintAreaMm2: numberOrNull(row.paint_area_mm2),
    mixtureKg: numberOrNull(row.mixture_kg),
    gelcoatKg: numberOrNull(row.gelcoat_kg),
  }))
  return calculateSyntheticMarbleCalibration(measurements)
}

async function getCurrentWasteCalibration(): Promise<{ castingWastePct: number | null; postDemoldWastePct: number | null; sampleIds: string[] }> {
  const rows = await dbQuery(
    `SELECT id, source_evidence_json
       FROM public.product_engineering_measurements
      WHERE calibration_group = 'SYNTHETIC_MARBLE_GENERAL' AND measurement_status = 'valid'`,
  )
  let materialTotal = 0
  let castingWasteTotal = 0
  let postDemoldWasteTotal = 0
  const sampleIds: string[] = []
  for (const row of rows as RawRow[]) {
    const evidence = row.source_evidence_json && typeof row.source_evidence_json === 'object' ? row.source_evidence_json as RawRow : null
    const balance = evidence?.materialBalance && typeof evidence.materialBalance === 'object' ? evidence.materialBalance as RawRow : null
    const totalMaterialKg = numberOrNull(balance?.totalMaterialKg)
    const castingWasteKg = numberOrNull(balance?.actualCastingWasteKg ?? balance?.castingWasteKg)
    const postDemoldWasteKg = numberOrNull(balance?.effectivePostDemoldWasteKg)
    if (!totalMaterialKg || totalMaterialKg <= 0 || castingWasteKg === null || postDemoldWasteKg === null) continue
    materialTotal += totalMaterialKg
    castingWasteTotal += castingWasteKg
    postDemoldWasteTotal += postDemoldWasteKg
    sampleIds.push(requiredText(row.id, 'Identificador de muestra'))
  }
  return {
    castingWastePct: materialTotal > 0 ? castingWasteTotal / materialTotal : null,
    postDemoldWastePct: materialTotal > 0 ? postDemoldWasteTotal / materialTotal : null,
    sampleIds,
  }
}

function timestampNow(): string {
  return new Date().toISOString()
}

async function applyCurrentPhysicalWeightProfiles(
  lines: readonly EstimationDraftBomLine[],
): Promise<EstimationDraftBomLine[]> {
  const itemCodes = [...new Set(lines.flatMap(line => line.sapItemCode ? [line.sapItemCode.trim().toUpperCase()] : []))]
  if (itemCodes.length === 0) return [...lines]
  const placeholders = itemCodes.map((_, index) => `$${index + 1}`).join(', ')
  const rows = await dbQuery(
    `SELECT item_code, physical_weight_kg_per_uom, physical_weight_source, physical_weight_note, physical_weight_updated_at
       FROM public.component_items
      WHERE item_code IN (${placeholders})`,
    itemCodes,
  )
  type PhysicalWeightProfile = {
    kgPerUom: number | null
    source: string | null
    note: string | null
    capturedAt: string | null
  }
  const byCode = new Map<string, PhysicalWeightProfile>()
  for (const row of rows as RawRow[]) {
    const itemCode = stringOrNull(row.item_code)?.toUpperCase()
    if (!itemCode) continue
    byCode.set(itemCode, {
      kgPerUom: numberOrNull(row.physical_weight_kg_per_uom),
      source: stringOrNull(row.physical_weight_source),
      note: stringOrNull(row.physical_weight_note),
      capturedAt: stringOrNull(row.physical_weight_updated_at),
    })
  }
  const childIds = new Set(lines.flatMap(line => line.parentId ? [line.parentId] : []))
  return lines.map((line): EstimationDraftBomLine => {
    const profile = line.sapItemCode ? byCode.get(line.sapItemCode.trim().toUpperCase()) : undefined
    const lineWithProfile = profile ? {
      ...line,
      physicalWeightSnapshot: {
        kgPerUom: profile.kgPerUom,
        source: profile.source,
        note: profile.note,
        capturedAt: profile.capturedAt,
        extensions: {},
      },
    } : line
    return {
      ...lineWithProfile,
      physicalWeightPolicy: inferPhysicalWeightPolicy(lineWithProfile, childIds.has(line.id)),
    }
  })
}

function applyPhysicalWeightEstimate(draft: EstimationDraft): void {
  const childIds = new Set(draft.bomLines.flatMap(line => line.parentId ? [line.parentId] : []))
  draft.bomLines = draft.bomLines.map(line => ({
    ...line,
    physicalWeightPolicy: inferPhysicalWeightPolicy(line, childIds.has(line.id)),
    physicalWeightCategory: inferPhysicalWeightPolicy(line, childIds.has(line.id)) === 'no_weight'
      ? null
      : line.physicalWeightCategory ?? 'product',
  }))
  const result = calculateEstimationPhysicalWeights({
    lines: draft.bomLines,
    estimatedMixtureKg: draft.geometry.estimatedMixtureKg,
    estimatedGelcoatKg: draft.geometry.estimatedGelcoatKg,
    wastePct: draft.geometry.weightWastePct ?? DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT,
    castingWastePct: draft.geometry.castingWastePct ?? 0,
    postDemoldWastePct: draft.geometry.postDemoldWastePct ?? draft.geometry.weightWastePct ?? DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT,
  })
  draft.geometry = {
    ...draft.geometry,
    weightWastePct: draft.geometry.weightWastePct ?? DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT,
    estimatedNetWeightKg: result.netWeightKg,
    estimatedPackagingWeightKg: result.packagingWeightKg,
    estimatedGrossWeightKg: result.grossWeightKg,
    extensions: {
      ...draft.geometry.extensions,
      missingPhysicalWeightLineIds: result.missingLineIds,
    },
  }
}

async function refreshSapDraftLineCost(
  line: EstimationDraftBomLine,
): Promise<EstimationDraftBomLine> {
  const itemCode = line.sapItemCode?.trim().toUpperCase() ?? null
  if (!itemCode || line.origin !== 'sap' || line.costStrategy !== 'sap_direct') return line

  try {
    const warehouseAverage = await getSapWarehouseAverageCost(itemCode, 'MP-01')
    const sourceUom = warehouseAverage.inventoryUom?.trim().toUpperCase() ?? null
    const targetUom = line.uom?.trim().toUpperCase() ?? sourceUom
    if (!targetUom) {
      return {
        ...line,
        unitCost: null,
        costEvidence: {
          source: 'unavailable',
          candidateId: null,
          warehouseCode: 'MP-01',
          documentType: null,
          documentNumber: null,
          documentDate: null,
          originalCurrency: null,
          sourceUom: null,
          warning: 'No se pudo comprobar la unidad de inventario SAP; el costo queda pendiente hasta corregir la fuente SAP.',
          extensions: { sourceReadAt: timestampNow() },
        },
      }
    }

    if (sourceUom && sourceUom !== targetUom) {
      return {
        ...line,
        unitCost: null,
        costEvidence: {
          source: 'unavailable',
          candidateId: `warehouse-average:${itemCode}:MP-01`,
          warehouseCode: 'MP-01',
          documentType: 'WarehouseAverage',
          documentNumber: null,
          documentDate: timestampNow(),
          originalCurrency: ESTIMATION_COST_CURRENCY,
          sourceUom,
          warning: `El promedio MP-01 está en ${sourceUom} y la línea usa ${targetUom}. No se aplicó una conversión implícita; el costo queda pendiente.`,
          extensions: { sourceReadAt: timestampNow() },
        },
      }
    }

    const averageCost = warehouseAverage.standardAveragePrice
    if (averageCost === null || !Number.isFinite(averageCost) || averageCost <= 0) {
      return {
        ...line,
        uom: targetUom,
        unitCost: null,
        costEvidence: {
          source: 'unavailable',
          candidateId: `warehouse-average:${itemCode}:MP-01`,
          warehouseCode: 'MP-01',
          documentType: 'WarehouseAverage',
          documentNumber: null,
          documentDate: timestampNow(),
          originalCurrency: ESTIMATION_COST_CURRENCY,
          sourceUom,
          warning: 'SAP no reporta un promedio/estándar positivo en MP-01. El costo queda pendiente y no admite reemplazo manual mientras la línea conserve origen SAP.',
          extensions: { sourceReadAt: timestampNow() },
        },
      }
    }

    return {
      ...line,
      uom: targetUom,
      unitCost: averageCost,
      costEvidence: {
        source: 'warehouse_average',
        candidateId: `warehouse-average:${itemCode}:MP-01`,
        warehouseCode: 'MP-01',
        documentType: 'WarehouseAverage',
        documentNumber: null,
        documentDate: timestampNow(),
        originalCurrency: ESTIMATION_COST_CURRENCY,
        sourceUom,
        warning: 'Costo temporal: promedio/estándar vigente de MP-01. No representa la última compra ni una recepción de proveedor.',
        extensions: { sourceReadAt: timestampNow() },
      },
    }
  } catch (error) {
    return {
      ...line,
      unitCost: null,
      costEvidence: {
        source: 'unavailable',
        candidateId: null,
        warehouseCode: 'MP-01',
        documentType: null,
        documentNumber: null,
        documentDate: null,
        originalCurrency: null,
        sourceUom: null,
        warning: error instanceof Error
          ? `No se pudo actualizar el costo SAP: ${error.message}`
          : 'No se pudo actualizar el costo SAP.',
        extensions: { sourceReadAt: timestampNow() },
      },
    }
  }
}

export async function listProductDesignEstimationsAction(): Promise<ProductDesignEstimationSummary[]> {
  await requireProductDesignAccess()
  const rows = await dbQuery(
    `SELECT id, manufacturing_process, sap_prefix, family_code, proposed_reference_code,
            provisional_name, width_mm, depth_mm, height_mm, color_code,
            homologue_sap_item_code, status, technical_review_status,
            shared_with_sales, commercial_outcome, created_at, updated_at
       FROM public.product_design_estimations
      ORDER BY updated_at DESC, id DESC`,
  )
  return rows.map(mapEstimationSummary)
}

export async function deleteProductDesignEstimationAction(input: { id: string }): Promise<{
  deletedId: string
  provisionalName: string
  preservedEngineeringMeasurements: number
}> {
  await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('La cotización no existe o ya fue eliminada.')
  const measurementRows = await dbQuery(
    `SELECT count(*)::int AS count
       FROM public.product_engineering_measurements
      WHERE source_evidence_json ->> 'productDesignEstimationId' = $1`,
    [id],
  )
  const preservedEngineeringMeasurements = numberOrNull(measurementRows[0]?.count) ?? 0
  await dbQuery('DELETE FROM public.product_design_estimations WHERE id = $1::uuid', [id])
  const deleted = await getEstimationRecord(id)
  if (deleted) throw new Error('La cotización no pudo eliminarse de forma verificable.')
  revalidatePath('/product-design/estimations')
  return { deletedId: id, provisionalName: existing.provisionalName, preservedEngineeringMeasurements }
}

export async function getProductDesignEstimationAction(id: string): Promise<ProductDesignEstimation | null> {
  await requireProductDesignAccess()
  return getEstimationRecord(requiredUuid(id, 'Cotización'))
}

export async function createProductDesignEstimationAction(input: CreateProductDesignEstimationInput): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const sapPrefix = normalizeSapPrefix(input.sapPrefix)
  const familyCode = optionalText(input.familyCode)
  const colorCode = optionalText(input.colorCode)
  const [, commercialColor] = await Promise.all([
    assertExistingFamily(familyCode),
    getExistingCommercialColor(colorCode),
  ])

  const draft = createEmptyEstimationDraft()
  draft.homologue = {
    sapItemCode: optionalText(input.homologueSapItemCode),
    itemName: null,
    sapPrefix,
    familyCode,
    selectedAt: null,
    bomReadAt: null,
    extensions: {},
  }
  if (commercialColor) {
    draft.commercialColor = {
      ...draft.commercialColor,
      colorCode: commercialColor.colorCode,
      colorName: commercialColor.colorName,
      selectedAt: timestampNow(),
    }
  }

  const rows = await dbQuery(
    `INSERT INTO public.product_design_estimations (
       manufacturing_process, sap_prefix, family_code, proposed_reference_code,
       provisional_name, width_mm, depth_mm, height_mm, color_code,
       homologue_sap_item_code, draft_data_json, created_by, updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid, $13::uuid)
     RETURNING id`,
    [
      optionalText(input.manufacturingProcess) ?? SYNTHETIC_MARBLE_PROCESS,
      sapPrefix,
      familyCode,
      normalizeReferenceCode(input.proposedReferenceCode),
      requiredText(input.provisionalName, 'Nombre provisional'),
      optionalPositiveNumber(input.widthMm, 'Ancho'),
      optionalPositiveNumber(input.depthMm, 'Profundidad'),
      optionalPositiveNumber(input.heightMm, 'Alto'),
      colorCode,
      optionalText(input.homologueSapItemCode),
      JSON.stringify(serializeEstimationDraft(draft)),
      access.user.id,
      access.user.id,
    ],
  )
  const id = stringOrNull(rows[0]?.id)
  if (!id) throw new Error('La cotización fue creada pero no devolvió un identificador verificable.')

  const saved = await getEstimationRecord(id)
  if (!saved) throw new Error('No fue posible releer la cotización creada.')
  revalidatePath('/product-design/estimations')
  return saved
}

export async function saveProductDesignEstimationAction(input: SaveProductDesignEstimationInput): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const draft = normalizeEstimationDraft(input.draft)
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('No fue posible releer la cotización antes de guardar.')
  draft.bomLines = await canonicalizeSapDraftLines(draft.bomLines, existing.draft.bomLines)
  const childIds = new Set(draft.bomLines.flatMap(line => line.parentId ? [line.parentId] : []))
  draft.bomLines = draft.bomLines.map(line => {
    const physicalWeightPolicy = inferPhysicalWeightPolicy(line, childIds.has(line.id))
    return { ...line, physicalWeightPolicy, physicalWeightCategory: physicalWeightPolicy === 'no_weight' ? null : line.physicalWeightCategory ?? 'product' }
  })
  draft.bomLines = draft.bomLines.map(line => {
    const evidence = line.costEvidence
    if (line.origin !== 'manual' || line.costStrategy !== 'manual_override' || evidence?.source !== 'manual') return line
    return {
      ...line,
      costEvidence: {
        ...evidence,
        documentDate: evidence.documentDate ?? timestampNow(),
        extensions: {
          ...evidence.extensions,
          definedByUserId: evidence.extensions.definedByUserId ?? access.user.id,
        },
      },
    }
  })
  // Pricing belongs to Sales. Preserve it even if a crafted Design request sends it.
  draft.commercialScenario = existing.draft.commercialScenario
  const draftPrefix = draft.homologue?.sapPrefix
  const sapPrefix = normalizeSapPrefix(input.sapPrefix ?? draftPrefix)
  const familyCode = optionalText(input.familyCode) ?? draft.homologue?.familyCode ?? null
  const draftColorCode = draft.commercialColor.colorCode
  const inputColorCode = optionalText(input.colorCode)
  if (inputColorCode && draftColorCode && inputColorCode !== draftColorCode) {
    throw new Error('El color comercial de la cabecera y el del borrador no coinciden.')
  }
  const colorCode = inputColorCode ?? draftColorCode
  const [, commercialColor] = await Promise.all([
    assertExistingFamily(familyCode),
    getExistingCommercialColor(colorCode),
  ])

  if (draft.homologue) {
    draft.homologue.sapPrefix = sapPrefix
    draft.homologue.familyCode = familyCode
  }
  if (commercialColor) {
    draft.commercialColor = {
      ...draft.commercialColor,
      colorCode: commercialColor.colorCode,
      colorName: commercialColor.colorName,
      selectedAt: draft.commercialColor.selectedAt ?? timestampNow(),
    }
  }

  await dbQuery(
    `UPDATE public.product_design_estimations
        SET manufacturing_process = $1,
            sap_prefix = $2,
            family_code = $3,
            proposed_reference_code = $4,
            provisional_name = $5,
            width_mm = $6,
            depth_mm = $7,
            height_mm = $8,
            color_code = $9,
            homologue_sap_item_code = $10,
            status = $11,
            draft_data_json = $12::jsonb,
            updated_by = $13::uuid
      WHERE id = $14::uuid`,
    [
      optionalText(input.manufacturingProcess) ?? SYNTHETIC_MARBLE_PROCESS,
      sapPrefix,
      familyCode,
      normalizeReferenceCode(input.proposedReferenceCode),
      requiredText(input.provisionalName, 'Nombre provisional'),
      optionalPositiveNumber(input.widthMm, 'Ancho'),
      optionalPositiveNumber(input.depthMm, 'Profundidad'),
      optionalPositiveNumber(input.heightMm, 'Alto'),
      colorCode,
      draft.homologue?.sapItemCode ?? optionalText(input.homologueSapItemCode),
      asEstimationStatus(input.status),
      JSON.stringify(serializeEstimationDraft(draft)),
      access.user.id,
      id,
    ],
  )
  const saved = await getEstimationRecord(id)
  if (!saved) throw new Error('No fue posible releer la cotización guardada.')
  revalidatePath('/product-design/estimations')
  revalidatePath(`/product-design/estimations/${id}`)
  return saved
}

export async function setEstimationSharedWithSalesAction(input: { id: string; shared: boolean }): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const shared = input.shared === true
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('No fue posible releer la cotización antes de cambiar su visibilidad.')
  if (shared) {
    const ignoredLineIds = new Set<string>()
    existing.draft.bomLines.forEach(line => {
      if (line.origin === 'manual' && line.costStrategy === 'manual_override') {
        getEstimationBomDescendantIds(existing.draft.bomLines, line.id).forEach(id => ignoredLineIds.add(id))
      }
    })
    const lines = existing.draft.bomLines.filter(line => !ignoredLineIds.has(line.id)).map((line) => toCostLine(line))
    if (lines.some((line) => line === null)) throw new Error('Completa la LdM y sus costos antes de compartirla con Ventas.')
    const costing = evaluateEstimationBomCosting({ lines: lines.filter((line): line is EstimationBomCostLine => line !== null) })
    if (!costing.ok) throw new Error('La LdM no se puede totalizar todavía; corrige sus líneas antes de compartirla con Ventas.')
  }
  await dbQuery(
    `UPDATE public.product_design_estimations
        SET shared_with_sales = $1,
            shared_with_sales_at = CASE WHEN $1 THEN now() ELSE NULL END,
            shared_with_sales_by = CASE WHEN $1 THEN $2::uuid ELSE NULL END,
            updated_by = $2::uuid
      WHERE id = $3::uuid`,
    [shared, access.user.id, id],
  )
  const saved = await getEstimationRecord(id)
  if (!saved) throw new Error('No fue posible releer el cambio de visibilidad para Ventas.')
  revalidatePath('/product-design/estimations')
  revalidatePath(`/product-design/estimations/${id}`)
  revalidatePath('/sales/estimations')
  return saved
}

export async function getSyntheticMarbleCalibrationAction() {
  await requireProductDesignAccess()
  return getCurrentSyntheticMarbleCalibration()
}

export async function freezeEstimationSyntheticMarbleCalibrationAction(input: {
  id: string
  volumeMm3: number | null
  paintAreaMm2: number | null
  weightWastePct: number | null
  castingWastePct: number | null
  postDemoldWastePct: number | null
}): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('La cotización no existe.')
  const volumeMm3 = optionalPositiveNumber(input.volumeMm3, 'Volumen CAD')
  const paintAreaMm2 = optionalPositiveNumber(input.paintAreaMm2, 'Área de pintura')
  const castingWastePct = optionalNonNegativeNumber(input.castingWastePct, 'Merma de vaciado')
  const postDemoldWastePct = optionalNonNegativeNumber(input.postDemoldWastePct, 'Merma pos-desmolde')
  if (volumeMm3 === null || paintAreaMm2 === null || castingWastePct === null || postDemoldWastePct === null) {
    throw new Error('Completa volumen, área, merma de vaciado y merma pos-desmolde antes de calcular.')
  }
  if (castingWastePct >= 1 || postDemoldWastePct >= 1 || castingWastePct + postDemoldWastePct >= 1) {
    throw new Error('Las mermas deben ser menores a 100 % y su suma también debe ser menor a 100 %.')
  }
  const [calibration, wasteCalibration] = await Promise.all([getCurrentSyntheticMarbleCalibration(), getCurrentWasteCalibration()])
  const frozen = freezeSyntheticMarbleCalibration(calibration, timestampNow())
  const draft = existing.draft
  draft.syntheticMarbleCalibration = frozen
  draft.geometry = {
    ...draft.geometry,
    source: 'fusion_360',
    capturedAt: timestampNow(),
    volumeMm3,
    paintAreaMm2,
    estimatedMixtureKg: frozen?.mixture
      ? volumeMm3 * frozen.mixture.factor
      : null,
    estimatedGelcoatKg: frozen?.gelcoat
      ? paintAreaMm2 * frozen.gelcoat.factor
      : null,
    weightWastePct: input.weightWastePct ?? DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT,
    castingWastePct: wasteCalibration.castingWastePct ?? castingWastePct,
    postDemoldWastePct: wasteCalibration.postDemoldWastePct ?? postDemoldWastePct,
    extensions: {
      ...draft.geometry.extensions,
      wasteCalibrationSampleIds: wasteCalibration.sampleIds,
    },
  }
  const appliedQuantities = applySyntheticMarbleBomQuantities(
    draft.bomLines,
    draft.geometry.estimatedMixtureKg,
    draft.geometry.estimatedGelcoatKg,
  )
  draft.bomLines = await applyCurrentPhysicalWeightProfiles(appliedQuantities.lines)
  applyPhysicalWeightEstimate(draft)
  await dbQuery(
    `UPDATE public.product_design_estimations
        SET draft_data_json = $1::jsonb,
            updated_by = $2::uuid
      WHERE id = $3::uuid`,
    [JSON.stringify(serializeEstimationDraft(draft)), access.user.id, id],
  )
  const saved = await getEstimationRecord(id)
  if (!saved) throw new Error('No fue posible releer la calibración congelada.')
  revalidatePath(`/product-design/estimations/${id}`)
  return saved
}

export async function registerEstimationActualConsumptionMeasurementAction(input: {
  id: string
  actualMixtureKg: number | null
  actualGelcoatKg: number | null
  actualNetWeightKg: number | null
  actualGrossWeightKg: number | null
  actualCastingWasteKg: number | null
  actualPostDemoldWasteOverrideKg: number | null
  actualPackagingWeightKg: number | null
}): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('La cotización no existe.')
  const actualMixtureKg = optionalPositiveNumber(input.actualMixtureKg, 'Mezcla real')
  const actualGelcoatKg = optionalPositiveNumber(input.actualGelcoatKg, 'Gelcoat real')
  const actualNetWeightKg = optionalPositiveNumber(input.actualNetWeightKg, 'Peso neto real')
  const actualGrossWeightKg = optionalPositiveNumber(input.actualGrossWeightKg, 'Peso bruto real')
  const actualCastingWasteKg = optionalNonNegativeNumber(input.actualCastingWasteKg, 'Merma de vaciado')
  const actualPostDemoldWasteOverrideKg = optionalNonNegativeNumber(input.actualPostDemoldWasteOverrideKg, 'Merma pos-desmolde')
  const actualPackagingWeightKg = optionalNonNegativeNumber(input.actualPackagingWeightKg, 'Peso del empaque')
  if (actualMixtureKg === null && actualGelcoatKg === null && actualNetWeightKg === null) throw new Error('Registra al menos mezcla, gelcoat o peso neto antes de enviar la toma a Ingeniería.')
  if (actualGrossWeightKg !== null && actualNetWeightKg !== null && actualGrossWeightKg < actualNetWeightKg) {
    throw new Error('El peso bruto real no puede ser menor que el peso neto real.')
  }
  const { volumeMm3, paintAreaMm2 } = existing.draft.geometry
  if (volumeMm3 === null || paintAreaMm2 === null) {
    throw new Error('La toma real requiere volumen CAD y área de pintura.')
  }
  const draft = existing.draft
  const effectiveGelcoatKg = actualGelcoatKg ?? draft.geometry.estimatedGelcoatKg
  const actualPeroxideGrams = effectiveGelcoatKg === null ? null : effectiveGelcoatKg * 1_000 * 0.025
  const materialBalance = calculateEstimationMaterialBalance({ actualMixtureKg, actualGelcoatKg, theoreticalGelcoatKg: draft.geometry.estimatedGelcoatKg, actualCastingWasteKg, actualPostDemoldWasteOverrideKg, actualNetWeightKg, actualPackagingWeightKg, actualGrossWeightKg })
  const appliedQuantities = applySyntheticMarbleBomQuantities(draft.bomLines, actualMixtureKg, actualGelcoatKg)
  draft.bomLines = appliedQuantities.lines
  draft.geometry = {
    ...draft.geometry,
    actualMixtureKg,
    actualGelcoatKg,
    actualNetWeightKg,
    actualGrossWeightKg,
    actualCastingWasteKg,
    actualPostDemoldWasteOverrideKg,
    actualPackagingWeightKg,
    extensions: {
      ...draft.geometry.extensions,
      actualPeroxideGrams,
      actualPackagingWeightKg,
      materialBalance: { ...materialBalance, actualCastingWasteKg, actualPostDemoldWasteOverrideKg },
      actualConsumptionRecordedAt: timestampNow(),
      actualBomLineIds: {
        mixture: appliedQuantities.mixtureLineIds,
        gelcoat: appliedQuantities.gelcoatLineIds,
        peroxide: appliedQuantities.peroxideLineIds,
      },
    },
  }
  const measurementId = stringOrNull(draft.geometry.extensions.engineeringMeasurementId)
  let verifiedMeasurementId = measurementId
  const evidence = JSON.stringify({
    productDesignEstimationId: id,
    recordedFrom: 'product_design_estimation',
      physicalWeightSnapshot: {
      wastePct: draft.geometry.weightWastePct,
      estimatedNetWeightKg: draft.geometry.estimatedNetWeightKg,
      estimatedGrossWeightKg: draft.geometry.estimatedGrossWeightKg,
        bomLines: draft.bomLines,
      },
      actualPeroxideGrams,
      actualPackagingWeightKg,
      materialBalance: { ...materialBalance, actualCastingWasteKg, actualPostDemoldWasteOverrideKg },
  })
  if (measurementId) {
    const updated = await dbQuery(
      `UPDATE public.product_engineering_measurements
          SET cad_volume_mm3 = $1, paint_area_mm2 = $2, mixture_kg = $3, gelcoat_kg = $4,
              actual_net_weight_kg = $5, actual_gross_weight_kg = $6,
              color_code = $7, sap_item_code = $8, legacy_product_name = $9,
              source_evidence_json = $10::jsonb
        WHERE id = $11::uuid AND measurement_status = 'pending'
        RETURNING id`,
      [volumeMm3, paintAreaMm2, actualMixtureKg, actualGelcoatKg, actualNetWeightKg, actualGrossWeightKg, existing.colorCode, existing.homologueSapItemCode, existing.provisionalName, evidence, measurementId],
    )
    if (updated.length === 0) throw new Error('La toma ya fue validada o excluida por Ingeniería. Registra una nueva toma desde Mediciones.')
  } else {
    const rows = await dbQuery(
      `INSERT INTO public.product_engineering_measurements (
        calibration_group, measurement_status, sample_label, sap_prefix, family_code,
        sap_item_code, legacy_product_name, color_code, cad_volume_mm3, paint_area_mm2,
        mixture_kg, gelcoat_kg, actual_net_weight_kg, actual_gross_weight_kg,
        source_type, source_evidence_json, recorded_by
      ) VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::uuid)
        RETURNING id`,
      ['SYNTHETIC_MARBLE_GENERAL', existing.provisionalName, existing.sapPrefix, existing.familyCode, existing.homologueSapItemCode, existing.provisionalName, existing.colorCode, volumeMm3, paintAreaMm2, actualMixtureKg, actualGelcoatKg, actualNetWeightKg, actualGrossWeightKg, 'product_design_estimation', evidence, access.user.id],
    )
    const createdMeasurementId = stringOrNull(rows[0]?.id)
    if (!createdMeasurementId) throw new Error('La toma se registró sin un identificador verificable.')
    verifiedMeasurementId = createdMeasurementId
  }
  if (!verifiedMeasurementId) throw new Error('La toma no devolvió un identificador verificable.')
  const measurementRows = await dbQuery(
    `SELECT mixture_kg, gelcoat_kg, actual_net_weight_kg, actual_gross_weight_kg
       FROM public.product_engineering_measurements
      WHERE id = $1::uuid AND measurement_status = 'pending'
      LIMIT 1`,
    [verifiedMeasurementId],
  )
  const verifiedMeasurement = measurementRows[0]
  if (
    !verifiedMeasurement
    || numberOrNull(verifiedMeasurement.mixture_kg) !== actualMixtureKg
    || numberOrNull(verifiedMeasurement.gelcoat_kg) !== actualGelcoatKg
    || numberOrNull(verifiedMeasurement.actual_net_weight_kg) !== actualNetWeightKg
    || numberOrNull(verifiedMeasurement.actual_gross_weight_kg) !== actualGrossWeightKg
  ) {
    throw new Error('La toma no pudo verificarse después de guardarla en Mediciones de Ingeniería.')
  }
  draft.geometry.extensions.engineeringMeasurementId = verifiedMeasurementId
  await dbQuery(
    `UPDATE public.product_design_estimations
        SET draft_data_json = $1::jsonb, updated_by = $2::uuid
      WHERE id = $3::uuid`,
    [JSON.stringify(serializeEstimationDraft(draft)), access.user.id, id],
  )
  const saved = await getEstimationRecord(id)
  if (!saved) throw new Error('No fue posible releer la cotización tras registrar la toma.')
  revalidatePath(`/product-design/estimations/${id}`)
  revalidatePath('/engineering/measurements')
  return saved
}

/**
 * Refreshes only SAP-origin leaves from the current MP-01 average/standard.
 * Expanded parents retain their child-derived value and explicit manual costs
 * remain untouched. Generic inventory entries are intentionally not consulted.
 */
export async function refreshEstimationSapCostsAction(input: { id: string }): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('La cotización no existe.')

  const directSapItemCodes = existing.draft.bomLines.flatMap(line => line.origin === 'sap'
    && line.costStrategy === 'sap_direct'
    && line.sapItemCode
    ? [line.sapItemCode.trim().toUpperCase()]
    : [])
  const unexpectedSapBoms = await getSapItemBomsByCodes(directSapItemCodes)
  const refreshedLines: EstimationDraftBomLine[] = []
  for (const line of existing.draft.bomLines) {
    const itemCode = line.sapItemCode?.trim().toUpperCase()
    if (line.origin === 'sap' && line.costStrategy === 'sap_direct' && itemCode && unexpectedSapBoms.has(itemCode)) {
      refreshedLines.push({
        ...line,
        unitCost: null,
        costEvidence: {
          source: 'unavailable',
          candidateId: null,
          warehouseCode: 'MP-01',
          documentType: null,
          documentNumber: null,
          documentDate: null,
          originalCurrency: null,
          sourceUom: line.uom,
          warning: `${itemCode} tiene una sub-LdM SAP. Consulta o actualiza su estructura para calcularla por descendientes.`,
          extensions: { sourceReadAt: timestampNow() },
        },
      })
      continue
    }
    refreshedLines.push(await refreshSapDraftLineCost(line))
  }
  const draft = {
    ...existing.draft,
    bomLines: refreshedLines,
  }
  draft.bomLines = await applyCurrentPhysicalWeightProfiles(draft.bomLines)
  applyPhysicalWeightEstimate(draft)
  await dbQuery(
    `UPDATE public.product_design_estimations
        SET draft_data_json = $1::jsonb,
            updated_by = $2::uuid
      WHERE id = $3::uuid`,
    [JSON.stringify(serializeEstimationDraft(draft)), access.user.id, id],
  )
  const saved = await getEstimationRecord(id)
  if (!saved) throw new Error('No fue posible releer los costos actualizados.')
  revalidatePath('/product-design/estimations')
  revalidatePath(`/product-design/estimations/${id}`)
  return saved
}

export async function searchEstimationHomologuesAction(query: string, colorCode?: string | null): Promise<EstimationHomologueCandidate[]> {
  await requireProductDesignAccess()
  const normalizedQuery = requiredText(query, 'Búsqueda de homólogo')
  const selectedColor = optionalText(colorCode)
  const [byCode, byDescription] = await Promise.all([
    searchSapItems({ code: normalizedQuery, color: selectedColor ?? undefined }, { limit: SAP_PAGE_LIMIT }),
    searchSapItems({ description: normalizedQuery, color: selectedColor ?? undefined }, { limit: SAP_PAGE_LIMIT }),
  ])
  const candidates = new Map<string, EstimationHomologueCandidate>()
  for (const item of [...byCode.items, ...byDescription.items]) {
    const itemCode = stringOrNull(item.ItemCode)
    if (!itemCode) continue
    candidates.set(itemCode, {
      itemCode,
      itemName: stringOrNull(item.ItemName) ?? '',
    })
  }
  return [...candidates.values()].toSorted((left, right) => left.itemCode.localeCompare(right.itemCode))
}

export async function listEstimationCommercialColorsAction(): Promise<EstimationCommercialColorCandidate[]> {
  await requireProductDesignAccess()
  const rows = await dbQuery(
    `SELECT code_4dig, name_color_sap
       FROM public.colors
      ORDER BY code_4dig ASC`,
  )
  return rows.flatMap((row: RawRow) => {
    const colorCode = stringOrNull(row.code_4dig)
    if (!colorCode) return []
    return [{
      colorCode,
      colorName: stringOrNull(row.name_color_sap) ?? '',
    }]
  })
}

function readDistinctTextValues(rows: RawRow[], field: string): string[] {
  return rows.flatMap(row => {
    const value = stringOrNull(row[field])
    return value ? [value] : []
  })
}

export async function getEstimationFamilyCreationOptionsAction(): Promise<EstimationFamilyCreationOptions> {
  await requireProductDesignAccess()
  const [productTypes, zoneHomes, useDestinations, lines, manufacturingProcesses] = await Promise.all([
    dbQuery(`SELECT DISTINCT product_type FROM public.families WHERE product_type IS NOT NULL AND product_type <> '' ORDER BY product_type ASC`),
    dbQuery(`SELECT DISTINCT zone_home FROM public.families WHERE zone_home IS NOT NULL AND zone_home <> '' ORDER BY zone_home ASC`),
    dbQuery(`SELECT DISTINCT use_destination FROM public.families WHERE use_destination IS NOT NULL AND use_destination <> '' ORDER BY use_destination ASC`),
    dbQuery(`SELECT DISTINCT line FROM public.product_references WHERE line IS NOT NULL AND line <> '' ORDER BY line ASC`),
    dbQuery(`SELECT DISTINCT manufacturing_process FROM public.families WHERE manufacturing_process IS NOT NULL AND manufacturing_process <> '' ORDER BY manufacturing_process ASC`),
  ])

  return {
    productTypes: readDistinctTextValues(productTypes, 'product_type'),
    zoneHomes: readDistinctTextValues(zoneHomes, 'zone_home'),
    useDestinations: readDistinctTextValues(useDestinations, 'use_destination'),
    lines: readDistinctTextValues(lines, 'line'),
    manufacturingProcesses: [...new Set([SYNTHETIC_MARBLE_PROCESS, ...readDistinctTextValues(manufacturingProcesses, 'manufacturing_process')])].toSorted(),
  }
}

export async function searchEstimationSapFamiliesAction(query: string): Promise<EstimationSapFamilyCandidate[]> {
  await requireProductDesignAccess()
  const normalizedQuery = requiredText(query, 'Búsqueda de familia SAP').toUpperCase()
  const compactQuery = normalizedQuery.replace(/[^A-Z0-9]/gu, '').replace(/^V/u, '')
  const [byCode, byDescription] = await Promise.all([
    searchSapItems({ code: `V${compactQuery}` }, { limit: SAP_PAGE_LIMIT }),
    searchSapItems({ code: 'V', description: normalizedQuery }, { limit: SAP_PAGE_LIMIT }),
  ])
  const candidates = new Map<string, Omit<EstimationSapFamilyCandidate, 'localFamilyName'>>()
  for (const item of [...byCode.items, ...byDescription.items]) {
    const itemCode = stringOrNull(item.ItemCode)?.toUpperCase()
    if (!itemCode) continue
    const sapPrefix = itemCode.split('-')[0] ?? ''
    if (!/^V[A-Z0-9]+$/u.test(sapPrefix)) continue
    const familyCode = deriveEstimationFamilyCode(sapPrefix)
    if (!candidates.has(familyCode)) {
      candidates.set(familyCode, {
        sapPrefix,
        familyCode,
        sampleItemCode: itemCode,
        sampleItemName: stringOrNull(item.ItemName) ?? '',
      })
    }
  }
  const familyCodes = [...candidates.keys()]
  if (familyCodes.length === 0) return []
  const placeholders = familyCodes.map((_, index) => `$${index + 1}`).join(', ')
  const localRows = await dbQuery(
    `SELECT family_code, family_name
       FROM public.families
      WHERE family_code IN (${placeholders})`,
    familyCodes,
  )
  const localNames = new Map<string, string>(localRows.flatMap((row: RawRow) => {
    const familyCode = stringOrNull(row.family_code)
    return familyCode ? [[familyCode, stringOrNull(row.family_name) ?? ''] as const] : []
  }))
  return [...candidates.values()].map(candidate => ({
    ...candidate,
    localFamilyName: localNames.has(candidate.familyCode) ? localNames.get(candidate.familyCode) ?? '' : null,
  })).toSorted((left, right) => left.familyCode.localeCompare(right.familyCode))
}

export async function getEstimationFamilyInferenceAction(input: {
  sapPrefix: string
  homologueItemCode: string
}): Promise<EstimationFamilyInference> {
  await requireProductDesignAccess()
  const sapPrefix = normalizeSapPrefix(input.sapPrefix)
  const homologueItemCode = requiredText(input.homologueItemCode, 'Código SAP del homólogo').toUpperCase()
  const salesItemPrefix = deriveEstimationSalesItemPrefix(homologueItemCode, sapPrefix)
  const homologueItem = await getSapItem(homologueItemCode, ['ItemsGroupCode'])
  const itemGroupCode = numberOrNull(homologueItem.ItemsGroupCode)
  const itemGroup = itemGroupCode === null
    ? null
    : await getSapItemGroup(itemGroupCode).catch(() => null)
  const itemNames: string[] = []
  let afterItemCode: string | null = null
  let hasMore = true
  let pagesRead = 0

  while (hasMore && pagesRead < SAP_REFERENCE_SCAN_MAX_PAGES) {
    const page = await searchSapItems({ code: salesItemPrefix }, { limit: SAP_PAGE_LIMIT, afterItemCode })
    for (const item of page.items) {
      const itemCode = stringOrNull(item.ItemCode)
      const itemName = stringOrNull(item.ItemName)
      if (itemCode?.startsWith(`${salesItemPrefix}-`) && itemName) itemNames.push(itemName)
    }
    afterItemCode = page.lastItemCode
    hasMore = page.hasMore && Boolean(afterItemCode)
    pagesRead += 1
  }

  if (hasMore) {
    throw new Error(`La consulta SAP de ${salesItemPrefix} superó ${SAP_REFERENCE_SCAN_MAX_PAGES} páginas; no se generará una sugerencia parcial de familia.`)
  }

  const descriptionInference = inferFamilyFromSapDescriptions(itemNames)
  const itemGroupName = itemGroup ? familyNameFromSapItemGroup(itemGroup.groupName) : ''
  return {
    ...descriptionInference,
    familyName: itemGroupName || descriptionInference.familyName,
    sapItemGroupCode: itemGroup?.groupCode ?? itemGroupCode,
    sapItemGroupName: itemGroup?.groupName ?? null,
    familyNameSource: itemGroupName ? 'sap_item_group' : 'description_terms',
  }
}

export async function getEstimationHomologueAction(itemCode: string): Promise<EstimationHomologue> {
  await requireProductDesignAccess()
  const normalizedItemCode = requiredText(itemCode, 'Código SAP del homólogo').toUpperCase()
  const [item, bomResult] = await Promise.all([
    getSapItem(normalizedItemCode),
    loadFullSapBomHierarchy(normalizedItemCode),
  ])
  const bomLeafCosts = await loadEstimationSapLeafCosts(bomResult.tree)
  const sapPrefix = stringOrNull(item.U_Prefijo)
  if (!sapPrefix) throw new Error(`El homólogo ${normalizedItemCode} no tiene U_Prefijo en SAP.`)
  return {
    itemCode: stringOrNull(item.ItemCode) ?? normalizedItemCode,
    itemName: stringOrNull(item.ItemName) ?? '',
    sapPrefix: normalizeSapPrefix(sapPrefix),
    colorCode: stringOrNull(item.U_Color) ?? sapItemColorCode(stringOrNull(item.ItemCode) ?? normalizedItemCode),
    bom: bomResult.tree,
    bomError: bomResult.tree ? null : bomResult.branchErrors[normalizedItemCode] ?? null,
    bomBranchErrors: bomResult.branchErrors,
    bomLeafCosts,
  }
}

export async function replaceEstimationGelcoatForColorAction(input: { id: string; colorCode: string }): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const color = await getExistingCommercialColor(optionalText(input.colorCode))
  if (!color) throw new Error('Selecciona un color comercial válido antes de actualizar el gelcoat.')
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('La cotización no existe.')
  const proposals = proposeGelcoatReplacements(existing.draft.bomLines, color.colorCode)
  if (proposals.length === 0) throw new Error('La LdM no tiene una línea PGEL que requiera cambio para ese color.')
  const sapItems = await Promise.all(proposals.map(proposal => getSapItem(proposal.proposedItemCode, ['ItemCode', 'ItemName', 'InventoryUOM', 'U_Color'])))
  const replacements = new Map(proposals.map((proposal, index) => [proposal.lineId, {
    itemCode: stringOrNull(sapItems[index]?.ItemCode) ?? proposal.proposedItemCode,
    itemName: stringOrNull(sapItems[index]?.ItemName),
    uom: stringOrNull(sapItems[index]?.InventoryUOM),
  }]))
  const draft = existing.draft
  draft.commercialColor = { ...draft.commercialColor, colorCode: color.colorCode, colorName: color.colorName, selectedAt: timestampNow() }
  draft.bomLines = draft.bomLines.map(line => {
    const replacement = replacements.get(line.id)
    return replacement ? {
      ...line,
      sapItemCode: replacement.itemCode,
      itemName: replacement.itemName ?? line.itemName,
      uom: replacement.uom ?? line.uom,
      unitCost: null,
      costEvidence: null,
      manualCostReason: null,
      physicalWeightSnapshot: null,
      notes: 'Gelcoat actualizado para el color comercial de la cotización.',
    } : line
  })
  draft.bomLines = await applyCurrentPhysicalWeightProfiles(draft.bomLines)
  applyPhysicalWeightEstimate(draft)
  await dbQuery(
    `UPDATE public.product_design_estimations
        SET color_code = $1, draft_data_json = $2::jsonb, updated_by = $3::uuid
      WHERE id = $4::uuid`,
    [color.colorCode, JSON.stringify(serializeEstimationDraft(draft)), access.user.id, id],
  )
  const saved = await getEstimationRecord(id)
  if (!saved) throw new Error('No fue posible releer la LdM después de actualizar el gelcoat.')
  revalidatePath('/product-design/estimations')
  revalidatePath(`/product-design/estimations/${id}`)
  return saved
}

export async function getEstimationSapSubtreeAction(itemCode: string): Promise<{
  tree: FullSapBomNode
  branchErrors: Record<string, string>
  leafCosts: Record<string, EstimationSapLeafCost>
}> {
  await requireProductDesignAccess()
  const normalizedItemCode = requiredText(itemCode, 'Código SAP de subestructura').toUpperCase()
  const result = await loadFullSapBomHierarchy(normalizedItemCode)
  if (result.tree) return {
    tree: result.tree,
    branchErrors: result.branchErrors,
    leafCosts: await loadEstimationSapLeafCosts(result.tree),
  }

  const itemMasters = await getSapItemsByCodes([normalizedItemCode], ['ItemCode', 'ItemName', 'InventoryUOM'])
  const item = itemMasters.get(normalizedItemCode)
  if (!item) throw new Error(`El artículo ${normalizedItemCode} no existe en SAP.`)
  return {
    tree: {
      itemCode: normalizedItemCode,
      itemName: stringOrNull(item.ItemName) ?? '',
      quantity: 1,
      inventoryUom: stringOrNull(item.InventoryUOM),
      bomQuantity: null,
      componentWarehouse: null,
      outputWarehouse: null,
      lines: [],
      cycleDetected: false,
    },
    branchErrors: result.branchErrors,
    leafCosts: await loadEstimationSapLeafCosts({
      itemCode: normalizedItemCode,
      itemName: stringOrNull(item.ItemName) ?? '',
      quantity: 1,
      inventoryUom: stringOrNull(item.InventoryUOM),
      bomQuantity: null,
      componentWarehouse: null,
      outputWarehouse: null,
      lines: [],
      cycleDetected: false,
    }),
  }
}

export async function getEstimationHomologueChildrenAction(itemCode: string): Promise<{
  lines: FullSapBomNode[]
  error: string | null
}> {
  const { tree, branchErrors } = await getEstimationSapSubtreeAction(itemCode)
  return {
    lines: tree.lines,
    error: branchErrors[tree.itemCode] ?? null,
  }
}

export async function suggestEstimationSubBomCodeAction(itemCode: string): Promise<{
  sourceItemCode: string
  familyPrefix: string
  suggestedItemCode: string
  reserved: false
}> {
  await requireProductDesignAccess()
  const sourceItemCode = requiredText(itemCode, 'Código SAP fuente').toUpperCase()
  const match = sourceItemCode.match(/^([A-Z0-9]+)-(\d+)-([A-Z0-9]+)-([A-Z0-9]+)$/u)
  if (!match) throw new Error(`El código ${sourceItemCode} no tiene el formato esperado para sugerir un consecutivo.`)
  const [, familyPrefix, sourceSequence, version, variant] = match
  let maximumSequence = 0
  let afterItemCode: string | null = null
  let hasMore = true
  let pagesRead = 0

  while (hasMore && pagesRead < SAP_REFERENCE_SCAN_MAX_PAGES) {
    const page = await searchSapItems({ code: familyPrefix }, { limit: SAP_PAGE_LIMIT, afterItemCode })
    page.items.forEach(item => {
      const candidateCode = stringOrNull(item.ItemCode)?.toUpperCase()
      const candidateMatch = candidateCode?.match(new RegExp(`^${familyPrefix}-(\\d+)-`, 'u'))
      if (!candidateMatch) return
      const sequence = Number(candidateMatch[1])
      if (Number.isSafeInteger(sequence)) maximumSequence = Math.max(maximumSequence, sequence)
    })
    afterItemCode = page.lastItemCode
    hasMore = page.hasMore && Boolean(afterItemCode)
    pagesRead += 1
  }
  if (hasMore) throw new Error(`La consulta SAP de ${familyPrefix} fue parcial; no se sugerirá un consecutivo incompleto.`)

  const nextSequence = String(Math.max(maximumSequence + 1, Number(sourceSequence) + 1)).padStart(sourceSequence.length, '0')
  return {
    sourceItemCode,
    familyPrefix,
    suggestedItemCode: `${familyPrefix}-${nextSequence}-${version}-${variant}`,
    reserved: false,
  }
}

async function proposeEstimationReferenceForPrefix(
  normalizedPrefix: string,
  salesItemPrefix: string,
) {
  const existingCodes: string[] = []
  let afterItemCode: string | null = null
  let hasMore = true
  let pagesRead = 0

  while (hasMore && pagesRead < SAP_REFERENCE_SCAN_MAX_PAGES) {
    const page = await searchSapItems(
      { code: salesItemPrefix },
      { limit: SAP_PAGE_LIMIT, afterItemCode },
    )
    existingCodes.push(
      ...page.items.flatMap(item => {
        const itemCode = stringOrNull(item.ItemCode)
        return itemCode?.startsWith(`${salesItemPrefix}-`) ? [itemCode] : []
      }),
    )
    afterItemCode = page.lastItemCode
    hasMore = page.hasMore && Boolean(afterItemCode)
    pagesRead += 1
  }

  if (hasMore) {
    throw new Error(`La consulta SAP de ${salesItemPrefix} superó ${SAP_REFERENCE_SCAN_MAX_PAGES} páginas; no se propondrá un consecutivo incompleto.`)
  }
  return proposeEstimationReference({
    sapPrefix: normalizedPrefix,
    salesItemPrefix,
    existingCodes,
  })
}

export async function proposeEstimationReferenceAction(input: { sapPrefix: string; homologueItemCode: string }) {
  await requireProductDesignAccess()
  const normalizedPrefix = normalizeSapPrefix(input.sapPrefix)
  const normalizedHomologueItemCode = requiredText(input.homologueItemCode, 'Código SAP del homólogo').toUpperCase()
  const salesItemPrefix = deriveEstimationSalesItemPrefix(normalizedHomologueItemCode, normalizedPrefix)
  return proposeEstimationReferenceForPrefix(normalizedPrefix, salesItemPrefix)
}

export async function proposeEstimationReferenceForFamilyAction(input: { sapPrefix: string }) {
  await requireProductDesignAccess()
  const normalizedPrefix = normalizeSapPrefix(input.sapPrefix)
  const familyCode = deriveEstimationFamilyCode(normalizedPrefix)
  return proposeEstimationReferenceForPrefix(normalizedPrefix, `V${familyCode}`)
}

export async function redefineEstimationFamilyAction(input: {
  id: string
  sapPrefix: string
}): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('La cotización no existe.')
  const normalizedPrefix = normalizeSapPrefix(input.sapPrefix)
  const familyCode = deriveEstimationFamilyCode(normalizedPrefix)
  await assertExistingFamily(familyCode)
  const proposal = await proposeEstimationReferenceForPrefix(normalizedPrefix, `V${familyCode}`)
  const draft = existing.draft
  if (draft.homologue) {
    draft.homologue.familyCode = familyCode
    draft.homologue.extensions = {
      ...draft.homologue.extensions,
      sourceSapPrefix: draft.homologue.extensions.sourceSapPrefix ?? draft.homologue.sapPrefix,
      workingSapPrefix: normalizedPrefix,
      workingFamilySelectedAt: timestampNow(),
    }
  }
  await dbQuery(
    `UPDATE public.product_design_estimations
        SET sap_prefix = $1,
            family_code = $2,
            proposed_reference_code = $3,
            draft_data_json = $4::jsonb,
            updated_by = $5::uuid
      WHERE id = $6::uuid`,
    [normalizedPrefix, familyCode, proposal.referenceCode, JSON.stringify(serializeEstimationDraft(draft)), access.user.id, id],
  )
  const saved = await getEstimationRecord(id)
  if (!saved || saved.familyCode !== familyCode || saved.proposedReferenceCode !== proposal.referenceCode) {
    throw new Error('La familia de trabajo no pudo verificarse después de guardar.')
  }
  revalidatePath('/product-design/estimations')
  revalidatePath(`/product-design/estimations/${id}`)
  return saved
}

export async function copyHomologueIntoEstimationAction(input: {
  id: string
  itemCode: string
}): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('La cotización no existe.')
  const homologue = await getEstimationHomologueAction(input.itemCode)
  const familyCode = deriveEstimationFamilyCode(homologue.sapPrefix)
  const familyRows = await dbQuery('SELECT family_code FROM public.families WHERE family_code = $1 LIMIT 1', [familyCode])
  const resolvedFamilyCode = familyRows.length > 0 ? familyCode : null
  const draft = existing.draft
  draft.homologue = {
    sapItemCode: homologue.itemCode,
    itemName: homologue.itemName || null,
    sapPrefix: homologue.sapPrefix,
    familyCode: resolvedFamilyCode,
    selectedAt: timestampNow(),
    bomReadAt: timestampNow(),
    extensions: {
      bomReadError: homologue.bomError,
      bomBranchErrors: homologue.bomBranchErrors,
      sourceBomQuantity: homologue.bom?.bomQuantity ?? null,
      suggestedFamilyCode: familyCode,
    },
  }
  draft.bomLines = homologue.bom
    ? toBomDraftLines(homologue.bom.lines, null, homologue.bomBranchErrors, 2, homologue.bom.bomQuantity ?? 1, homologue.bomLeafCosts)
    : []
  if (!draft.commercialColor.colorCode && homologue.colorCode) {
    const commercialColor = await getExistingCommercialColor(homologue.colorCode)
    if (commercialColor) draft.commercialColor = { ...draft.commercialColor, colorCode: commercialColor.colorCode, colorName: commercialColor.colorName, selectedAt: timestampNow() }
  }

  await dbQuery(
    `UPDATE public.product_design_estimations
        SET sap_prefix = $1,
            family_code = $2,
            homologue_sap_item_code = $3,
            draft_data_json = $4::jsonb,
            updated_by = $5::uuid
      WHERE id = $6::uuid`,
    [
      homologue.sapPrefix,
      resolvedFamilyCode,
      homologue.itemCode,
      JSON.stringify(serializeEstimationDraft(draft)),
      access.user.id,
      id,
    ],
  )
  const saved = await getEstimationRecord(id)
  if (!saved) throw new Error('No fue posible releer la LdM homóloga copiada.')
  revalidatePath('/product-design/estimations')
  revalidatePath(`/product-design/estimations/${id}`)
  return saved
}

export async function createEstimationFamilyAction(input: EstimationFamilyInput): Promise<{ familyCode: string; familyName: string }> {
  await requireProductDesignAccess()
  const sapPrefix = normalizeSapPrefix(input.sapPrefix)
  const familyCode = deriveEstimationFamilyCode(sapPrefix)
  const existingRows = await dbQuery('SELECT family_code FROM public.families WHERE family_code = $1 LIMIT 1', [familyCode])
  if (existingRows.length > 0) throw new Error(`La familia local ${familyCode} ya existe.`)

  const familyName = requiredText(input.familyName, 'Nombre de familia')
  const productType = requiredText(input.productType, 'Tipo de producto')
  const zoneHome = requiredText(input.zoneHome, 'Zona')
  const useDestination = requiredText(input.useDestination, 'Destino de uso')
  const line = requiredText(input.line, 'Línea comercial autorizada')
  const manufacturingProcess = optionalText(input.manufacturingProcess) ?? SYNTHETIC_MARBLE_PROCESS
  await dbQuery(
    `INSERT INTO public.families (
       family_code, family_name, product_type, zone_home, use_destination,
       manufacturing_process, allowed_lines, rh_default, assembled_default
     )
     VALUES ($1, $2, $3, $4, $5, $6, ARRAY[$7]::text[], false, false)`,
    [familyCode, familyName, productType, zoneHome, useDestination, manufacturingProcess, line],
  )
  const rows = await dbQuery(
    'SELECT family_code, family_name FROM public.families WHERE family_code = $1 LIMIT 1',
    [familyCode],
  )
  const saved = rows[0]
  if (!saved) throw new Error('No fue posible releer la familia local creada.')
  revalidatePath('/product-design/estimations')
  return {
    familyCode: requiredText(saved.family_code, 'Código de familia'),
    familyName: requiredText(saved.family_name, 'Nombre de familia'),
  }
}
