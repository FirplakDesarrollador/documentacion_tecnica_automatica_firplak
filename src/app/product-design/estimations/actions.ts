'use server'

import { revalidatePath } from 'next/cache'

import {
  getSapItem,
  getSapItemBomChildren,
  getSapItemBomTree,
  getSapWarehouseAverageCost,
  searchSapItems,
  type BomNode,
} from '@/lib/sap/serviceLayer'
import { dbQuery } from '@/lib/supabase'
import {
  calculateSyntheticMarbleCalibration,
  type EstimationMeasurement,
} from '@/lib/productDesign/estimationCalibration'
import {
  createEmptyEstimationDraft,
  freezeSyntheticMarbleCalibration,
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

export type EstimationCommercialColorCandidate = {
  colorCode: string
  colorName: string
}

export type EstimationHomologue = {
  itemCode: string
  itemName: string
  sapPrefix: string
  bom: BomNode | null
  bomError: string | null
}

export type EstimationFamilyInput = {
  sapPrefix: string
  familyName: string
  productType: string
  zoneHome: string
  useDestination: string
  manufacturingProcess?: string | null
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

function asCommercialOutcome(value: unknown): ProductDesignCommercialOutcome {
  const normalized = requiredText(value, 'Resultado comercial')
  if (!(COMMERCIAL_OUTCOMES as readonly string[]).includes(normalized)) {
    throw new Error('El resultado comercial no es válido.')
  }
  return normalized as ProductDesignCommercialOutcome
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

function toBomDraftLines(nodes: readonly BomNode[], parentId: string | null = null): EstimationDraftBomLine[] {
  return nodes.flatMap((node, index) => {
    const id = `${parentId ?? 'root'}-${node.itemCode}-${index + 1}`
    const line: EstimationDraftBomLine = {
      id,
      parentId,
      origin: 'sap',
      sapItemCode: node.itemCode,
      itemName: node.itemName || null,
      quantity: node.quantity,
      uom: node.inventoryUom,
      costCategory: 'material',
      costStrategy: node.lines.length > 0 ? 'expand_children' : 'manual_override',
      unitCost: null,
      costEvidence: null,
      manualCostReason: null,
      notes: null,
      extensions: {
        sapLevel: node.level,
        sapLoaded: node.loaded,
      },
    }
    return [line, ...toBomDraftLines(node.lines, id)]
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

function timestampNow(): string {
  return new Date().toISOString()
}

async function refreshSapDraftLineCost(
  line: EstimationDraftBomLine,
  currency: string,
): Promise<EstimationDraftBomLine> {
  const itemCode = line.sapItemCode?.trim().toUpperCase() ?? null
  if (!itemCode || line.origin !== 'sap' || line.costStrategy !== 'manual_override') return line
  if (line.unitCost && line.manualCostReason) return {
    ...line,
    costEvidence: line.costEvidence ?? {
      source: 'manual',
      candidateId: null,
      warehouseCode: 'MP-01',
      documentType: 'Manual',
      documentNumber: null,
      documentDate: timestampNow(),
      originalCurrency: currency,
      sourceUom: line.uom,
      warning: 'Costo manual conservado por decisión explícita de Diseño.',
      extensions: {},
    },
  }

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
          warning: 'No se pudo comprobar la unidad de inventario SAP; registre un costo manual con motivo.',
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
          warning: `El promedio MP-01 está en ${sourceUom} y la línea usa ${targetUom}. No se aplicó una conversión implícita; registra un costo manual con motivo.`,
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
          warning: 'SAP no reporta un promedio/estándar positivo en MP-01. Registra un costo manual con motivo.',
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

export async function recordEstimationCommercialOutcomeAction(input: {
  id: string
  outcome: ProductDesignCommercialOutcome
  contactName?: string | null
  note?: string | null
}): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const outcome = asCommercialOutcome(input.outcome)
  await dbQuery(
    `UPDATE public.product_design_estimations
        SET commercial_outcome = $1,
            commercial_contact_name = $2,
            commercial_outcome_at = now(),
            commercial_recorded_by = $3::uuid,
            commercial_recorded_at = now(),
            commercial_note = $4,
            updated_by = $3::uuid
      WHERE id = $5::uuid`,
    [outcome, optionalText(input.contactName), access.user.id, optionalText(input.note), id],
  )
  const saved = await getEstimationRecord(id)
  if (!saved) throw new Error('No fue posible releer el resultado comercial guardado.')
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
}): Promise<ProductDesignEstimation> {
  const access = await requireProductDesignAccess()
  const id = requiredUuid(input.id, 'Cotización')
  const existing = await getEstimationRecord(id)
  if (!existing) throw new Error('La cotización no existe.')
  const calibration = await getCurrentSyntheticMarbleCalibration()
  const frozen = freezeSyntheticMarbleCalibration(calibration, timestampNow())
  const draft = existing.draft
  draft.syntheticMarbleCalibration = frozen
  draft.geometry = {
    ...draft.geometry,
    source: 'fusion_360',
    capturedAt: timestampNow(),
    volumeMm3: optionalPositiveNumber(input.volumeMm3, 'Volumen CAD'),
    paintAreaMm2: optionalPositiveNumber(input.paintAreaMm2, 'Área de pintura'),
    estimatedMixtureKg: frozen?.mixture && input.volumeMm3 && input.volumeMm3 > 0
      ? input.volumeMm3 * frozen.mixture.factor
      : null,
    estimatedGelcoatKg: frozen?.gelcoat && input.paintAreaMm2 && input.paintAreaMm2 > 0
      ? input.paintAreaMm2 * frozen.gelcoat.factor
      : null,
  }
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

  const currency = existing.draft.commercialScenario.currency.trim().toUpperCase() || ESTIMATION_COST_CURRENCY
  const refreshedLines: EstimationDraftBomLine[] = []
  for (const line of existing.draft.bomLines) {
    refreshedLines.push(await refreshSapDraftLineCost(line, currency))
  }
  const draft = {
    ...existing.draft,
    bomLines: refreshedLines,
  }
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

export async function searchEstimationHomologuesAction(query: string): Promise<EstimationHomologueCandidate[]> {
  await requireProductDesignAccess()
  const normalizedQuery = requiredText(query, 'Búsqueda de homólogo')
  const [byCode, byDescription] = await Promise.all([
    searchSapItems({ code: normalizedQuery }, { limit: SAP_PAGE_LIMIT }),
    searchSapItems({ description: normalizedQuery }, { limit: SAP_PAGE_LIMIT }),
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

export async function getEstimationHomologueAction(itemCode: string): Promise<EstimationHomologue> {
  await requireProductDesignAccess()
  const normalizedItemCode = requiredText(itemCode, 'Código SAP del homólogo').toUpperCase()
  const [item, bomResult] = await Promise.all([
    getSapItem(normalizedItemCode),
    getSapItemBomTree(normalizedItemCode),
  ])
  const sapPrefix = stringOrNull(item.U_Prefijo)
  if (!sapPrefix) throw new Error(`El homólogo ${normalizedItemCode} no tiene U_Prefijo en SAP.`)
  return {
    itemCode: stringOrNull(item.ItemCode) ?? normalizedItemCode,
    itemName: stringOrNull(item.ItemName) ?? '',
    sapPrefix: normalizeSapPrefix(sapPrefix),
    bom: bomResult.tree,
    bomError: bomResult.error,
  }
}

export async function getEstimationHomologueChildrenAction(itemCode: string): Promise<{ lines: BomNode[]; error: string | null }> {
  await requireProductDesignAccess()
  return getSapItemBomChildren(requiredText(itemCode, 'Código SAP de subestructura').toUpperCase())
}

export async function proposeEstimationReferenceAction(input: { sapPrefix: string; homologueItemCode: string }) {
  await requireProductDesignAccess()
  const normalizedPrefix = normalizeSapPrefix(input.sapPrefix)
  const normalizedHomologueItemCode = requiredText(input.homologueItemCode, 'Código SAP del homólogo').toUpperCase()
  const salesItemPrefix = deriveEstimationSalesItemPrefix(normalizedHomologueItemCode, normalizedPrefix)
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
      suggestedFamilyCode: familyCode,
    },
  }
  draft.bomLines = homologue.bom ? toBomDraftLines(homologue.bom.lines) : []

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
  const manufacturingProcess = optionalText(input.manufacturingProcess) ?? SYNTHETIC_MARBLE_PROCESS
  await dbQuery(
    `INSERT INTO public.families (
       family_code, family_name, product_type, zone_home, use_destination,
       manufacturing_process, allowed_lines, rh_default, assembled_default
     )
     VALUES ($1, $2, $3, $4, $5, $6, '{}'::text[], false, false)`,
    [familyCode, familyName, productType, zoneHome, useDestination, manufacturingProcess],
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
