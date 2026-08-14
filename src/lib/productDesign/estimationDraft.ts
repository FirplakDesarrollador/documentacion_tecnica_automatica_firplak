import {
  SYNTHETIC_MARBLE_CALIBRATION_GROUP,
  type CalibrationFactor,
  type SyntheticMarbleCalibration,
} from './estimationCalibration'
import type {
  EstimationBomCostCategory,
  EstimationBomCostStrategy,
} from './estimationBomCosting'
import type { EstimationCostSource } from './estimationCosts'

export const ESTIMATION_DRAFT_SCHEMA_VERSION = 1 as const

export type EstimationDraftJsonValue =
  | string
  | number
  | boolean
  | null
  | EstimationDraftJsonValue[]
  | { [key: string]: EstimationDraftJsonValue }

export type EstimationDraftJsonObject = { [key: string]: EstimationDraftJsonValue }
export type EstimationDraftExtensions = EstimationDraftJsonObject

export const ESTIMATION_DRAFT_LINE_ORIGINS = ['sap', 'manual'] as const
export type EstimationDraftLineOrigin = (typeof ESTIMATION_DRAFT_LINE_ORIGINS)[number]

export const ESTIMATION_DRAFT_GEOMETRY_SOURCES = ['fusion_360', 'manual'] as const
export type EstimationDraftGeometrySource = (typeof ESTIMATION_DRAFT_GEOMETRY_SOURCES)[number]

export const ESTIMATION_DRAFT_PHYSICAL_WEIGHT_POLICIES = [
  'from_quantity',
  'useful_quantity',
  'fixed_weight',
  'derive_children',
  'exclude',
] as const
export type EstimationDraftPhysicalWeightPolicy = (typeof ESTIMATION_DRAFT_PHYSICAL_WEIGHT_POLICIES)[number]

export type EstimationDraftHomologue = {
  sapItemCode: string | null
  itemName: string | null
  sapPrefix: string | null
  familyCode: string | null
  selectedAt: string | null
  bomReadAt: string | null
  extensions: EstimationDraftExtensions
}

export type FrozenCalibrationFactor = {
  factor: number
  sampleIds: string[]
  sampleCount: number
  driverTotal: number | null
  consumptionTotal: number | null
  simpleMeanRatio: number | null
  minRatio: number | null
  maxRatio: number | null
  extensions: EstimationDraftExtensions
}

export type FrozenSyntheticMarbleCalibration = {
  calibrationGroup: string
  frozenAt: string | null
  mixture: FrozenCalibrationFactor | null
  gelcoat: FrozenCalibrationFactor | null
  extensions: EstimationDraftExtensions
}

export type EstimationDraftGeometry = {
  source: EstimationDraftGeometrySource | null
  capturedAt: string | null
  volumeMm3: number | null
  paintAreaMm2: number | null
  estimatedMixtureKg: number | null
  estimatedGelcoatKg: number | null
  actualMixtureKg: number | null
  actualGelcoatKg: number | null
  weightWastePct: number | null
  estimatedNetWeightKg: number | null
  estimatedPackagingWeightKg: number | null
  estimatedGrossWeightKg: number | null
  actualNetWeightKg: number | null
  actualGrossWeightKg: number | null
  extensions: EstimationDraftExtensions
}

export type EstimationDraftPhysicalWeightSnapshot = {
  kgPerUom: number | null
  source: string | null
  note: string | null
  capturedAt: string | null
  extensions: EstimationDraftExtensions
}

export type EstimationDraftCommercialColor = {
  colorCode: string | null
  colorName: string | null
  selectedAt: string | null
  extensions: EstimationDraftExtensions
}

/** Technical identity data belongs to the quotation canvas, not to Sales. */
export type EstimationDraftProvisionalIdentity = {
  netWeightKg: number | null
  grossWeightKg: number | null
  extensions: EstimationDraftExtensions
}

export type EstimationDraftGelcoatItem = {
  itemCode: string | null
  itemName: string | null
  uom: string | null
  selectedAt: string | null
  extensions: EstimationDraftExtensions
}

export type EstimationDraftCostEvidence = {
  source: EstimationCostSource | null
  candidateId: string | null
  warehouseCode: string | null
  documentType: string | null
  documentNumber: string | null
  documentDate: string | null
  originalCurrency: string | null
  sourceUom: string | null
  warning: string | null
  extensions: EstimationDraftExtensions
}

/**
 * Unlike the cost evaluator input, draft lines intentionally allow nulls: a
 * designer can leave an incomplete row in the editable quotation canvas.
 */
export type EstimationDraftBomLine = {
  id: string
  parentId: string | null
  origin: EstimationDraftLineOrigin
  sapItemCode: string | null
  itemName: string | null
  quantity: number | null
  uom: string | null
  costCategory: EstimationBomCostCategory | null
  costStrategy: EstimationBomCostStrategy | null
  unitCost: number | null
  costEvidence: EstimationDraftCostEvidence | null
  manualCostReason: string | null
  notes: string | null
  physicalWeightPolicy: EstimationDraftPhysicalWeightPolicy
  usefulQuantity: number | null
  fixedWeightKg: number | null
  physicalWeightSnapshot: EstimationDraftPhysicalWeightSnapshot | null
  extensions: EstimationDraftExtensions
}

export type EstimationDraftCommercialScenario = {
  currency: string
  contributionMarginPct: number | null
  minimumPrice: number | null
  discountPct: number | null
  maximumPrice: number | null
  pvp: number | null
  netWeightKg: number | null
  grossWeightKg: number | null
  notes: string | null
  extensions: EstimationDraftExtensions
}

export type EstimationDraft = {
  schemaVersion: typeof ESTIMATION_DRAFT_SCHEMA_VERSION
  homologue: EstimationDraftHomologue | null
  syntheticMarbleCalibration: FrozenSyntheticMarbleCalibration | null
  geometry: EstimationDraftGeometry
  provisionalIdentity: EstimationDraftProvisionalIdentity
  commercialColor: EstimationDraftCommercialColor
  gelcoatItem: EstimationDraftGelcoatItem
  bomLines: EstimationDraftBomLine[]
  commercialScenario: EstimationDraftCommercialScenario
  extensions: EstimationDraftExtensions
}

type UnknownRecord = Record<string, unknown>

const COST_SOURCES: readonly EstimationCostSource[] = [
  'receipt_verified',
  'inventory_gen_entry_temporary',
  'warehouse_average',
  'manual',
  'unavailable',
]

const COST_CATEGORIES: readonly EstimationBomCostCategory[] = [
  'material',
  'packaging',
  'mo',
  'cif',
  'other',
]

const COST_STRATEGIES: readonly EstimationBomCostStrategy[] = [
  'expand_children',
  'manual_override',
]

const ROOT_KEYS = [
  'schemaVersion',
  'homologue',
  'syntheticMarbleCalibration',
  'geometry',
  'provisionalIdentity',
  'commercialColor',
  'gelcoatItem',
  'bomLines',
  'commercialScenario',
  'extensions',
] as const

const HOMOLOGUE_KEYS = [
  'sapItemCode',
  'itemName',
  'sapPrefix',
  'familyCode',
  'selectedAt',
  'bomReadAt',
  'extensions',
] as const

const CALIBRATION_KEYS = [
  'calibrationGroup',
  'frozenAt',
  'mixture',
  'gelcoat',
  'extensions',
] as const

const CALIBRATION_FACTOR_KEYS = [
  'factor',
  'sampleIds',
  'sampleCount',
  'driverTotal',
  'consumptionTotal',
  'simpleMeanRatio',
  'minRatio',
  'maxRatio',
  'extensions',
] as const

const GEOMETRY_KEYS = [
  'source',
  'capturedAt',
  'volumeMm3',
  'paintAreaMm2',
  'estimatedMixtureKg',
  'estimatedGelcoatKg',
  'actualMixtureKg',
  'actualGelcoatKg',
  'weightWastePct',
  'estimatedNetWeightKg',
  'estimatedPackagingWeightKg',
  'estimatedGrossWeightKg',
  'actualNetWeightKg',
  'actualGrossWeightKg',
  'extensions',
] as const

const COMMERCIAL_COLOR_KEYS = ['colorCode', 'colorName', 'selectedAt', 'extensions'] as const
const PROVISIONAL_IDENTITY_KEYS = ['netWeightKg', 'grossWeightKg', 'extensions'] as const
const GELCOAT_ITEM_KEYS = ['itemCode', 'itemName', 'uom', 'selectedAt', 'extensions'] as const

const COST_EVIDENCE_KEYS = [
  'source',
  'candidateId',
  'warehouseCode',
  'documentType',
  'documentNumber',
  'documentDate',
  'originalCurrency',
  'sourceUom',
  'warning',
  'extensions',
] as const

const PHYSICAL_WEIGHT_SNAPSHOT_KEYS = ['kgPerUom', 'source', 'note', 'capturedAt', 'extensions'] as const

const BOM_LINE_KEYS = [
  'id',
  'parentId',
  'origin',
  'sapItemCode',
  'itemName',
  'quantity',
  'uom',
  'costCategory',
  'costStrategy',
  'unitCost',
  'costEvidence',
  'manualCostReason',
  'notes',
  'physicalWeightPolicy',
  'usefulQuantity',
  'fixedWeightKg',
  'physicalWeightSnapshot',
  'extensions',
] as const

const COMMERCIAL_SCENARIO_KEYS = [
  'currency',
  'contributionMarginPct',
  'minimumPrice',
  'discountPct',
  'maximumPrice',
  'pvp',
  'netWeightKg',
  'grossWeightKg',
  'notes',
  'extensions',
] as const

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function toJsonValue(value: unknown, ancestry: Set<object> = new Set()): EstimationDraftJsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (!Array.isArray(value) && !isRecord(value)) return undefined
  if (ancestry.has(value)) return null

  ancestry.add(value)
  if (Array.isArray(value)) {
    const normalized = value.map(item => toJsonValue(item, ancestry) ?? null)
    ancestry.delete(value)
    return normalized
  }

  const normalized: EstimationDraftJsonObject = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    const jsonValue = toJsonValue(nestedValue, ancestry)
    if (jsonValue !== undefined) normalized[key] = jsonValue
  }
  ancestry.delete(value)
  return normalized
}

function jsonObject(value: unknown): EstimationDraftJsonObject {
  const normalized = toJsonValue(value)
  return isRecord(normalized) ? normalized : {}
}

function readRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null
}

function readString(record: UnknownRecord, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readFiniteNumber(record: UnknownRecord, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStringArray(record: UnknownRecord, key: string): string[] {
  const value = record[key]
  if (!Array.isArray(value)) return []
  return value.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim()] : [])
}

function readAllowedValue<T extends string>(
  record: UnknownRecord,
  key: string,
  values: readonly T[],
): T | null {
  const value = readString(record, key)
  return value === null ? null : values.find(candidate => candidate === value) ?? null
}

function collectExtensions(record: UnknownRecord, knownKeys: readonly string[]): EstimationDraftExtensions {
  const extensions = jsonObject(record.extensions)
  const knownKeySet = new Set(knownKeys)

  for (const [key, value] of Object.entries(record)) {
    if (knownKeySet.has(key)) continue
    const jsonValue = toJsonValue(value)
    if (jsonValue !== undefined) extensions[key] = jsonValue
  }

  return extensions
}

function hasExtensions(extensions: EstimationDraftExtensions): boolean {
  return Object.keys(extensions).length > 0
}

function normalizeHomologue(value: unknown): EstimationDraftHomologue | null {
  const record = readRecord(value)
  if (!record) return null

  const homologue: EstimationDraftHomologue = {
    sapItemCode: readString(record, 'sapItemCode'),
    itemName: readString(record, 'itemName'),
    sapPrefix: readString(record, 'sapPrefix'),
    familyCode: readString(record, 'familyCode'),
    selectedAt: readString(record, 'selectedAt'),
    bomReadAt: readString(record, 'bomReadAt'),
    extensions: collectExtensions(record, HOMOLOGUE_KEYS),
  }

  return homologue.sapItemCode || homologue.itemName || homologue.sapPrefix || homologue.familyCode || hasExtensions(homologue.extensions)
    ? homologue
    : null
}

function normalizeFrozenCalibrationFactor(value: unknown): FrozenCalibrationFactor | null {
  const record = readRecord(value)
  if (!record) return null

  const factor = readFiniteNumber(record, 'factor')
  if (factor === null || factor <= 0) return null

  const sampleIds = readStringArray(record, 'sampleIds')
  const sampleCount = readFiniteNumber(record, 'sampleCount')
  return {
    factor,
    sampleIds,
    sampleCount: sampleCount !== null && Number.isSafeInteger(sampleCount) && sampleCount >= 0
      ? sampleCount
      : sampleIds.length,
    driverTotal: readFiniteNumber(record, 'driverTotal'),
    consumptionTotal: readFiniteNumber(record, 'consumptionTotal'),
    simpleMeanRatio: readFiniteNumber(record, 'simpleMeanRatio'),
    minRatio: readFiniteNumber(record, 'minRatio'),
    maxRatio: readFiniteNumber(record, 'maxRatio'),
    extensions: collectExtensions(record, CALIBRATION_FACTOR_KEYS),
  }
}

function normalizeSyntheticMarbleCalibration(value: unknown): FrozenSyntheticMarbleCalibration | null {
  const record = readRecord(value)
  if (!record) return null

  const calibration: FrozenSyntheticMarbleCalibration = {
    calibrationGroup: readString(record, 'calibrationGroup') ?? SYNTHETIC_MARBLE_CALIBRATION_GROUP,
    frozenAt: readString(record, 'frozenAt'),
    mixture: normalizeFrozenCalibrationFactor(record.mixture),
    gelcoat: normalizeFrozenCalibrationFactor(record.gelcoat),
    extensions: collectExtensions(record, CALIBRATION_KEYS),
  }

  return calibration.mixture || calibration.gelcoat || calibration.frozenAt || hasExtensions(calibration.extensions)
    ? calibration
    : null
}

function normalizeGeometry(value: unknown): EstimationDraftGeometry {
  const record = readRecord(value) ?? {}
  return {
    source: readAllowedValue(record, 'source', ESTIMATION_DRAFT_GEOMETRY_SOURCES),
    capturedAt: readString(record, 'capturedAt'),
    volumeMm3: readFiniteNumber(record, 'volumeMm3'),
    paintAreaMm2: readFiniteNumber(record, 'paintAreaMm2'),
    estimatedMixtureKg: readFiniteNumber(record, 'estimatedMixtureKg'),
    estimatedGelcoatKg: readFiniteNumber(record, 'estimatedGelcoatKg'),
    actualMixtureKg: readFiniteNumber(record, 'actualMixtureKg'),
    actualGelcoatKg: readFiniteNumber(record, 'actualGelcoatKg'),
    weightWastePct: readFiniteNumber(record, 'weightWastePct'),
    estimatedNetWeightKg: readFiniteNumber(record, 'estimatedNetWeightKg'),
    estimatedPackagingWeightKg: readFiniteNumber(record, 'estimatedPackagingWeightKg'),
    estimatedGrossWeightKg: readFiniteNumber(record, 'estimatedGrossWeightKg'),
    actualNetWeightKg: readFiniteNumber(record, 'actualNetWeightKg'),
    actualGrossWeightKg: readFiniteNumber(record, 'actualGrossWeightKg'),
    extensions: collectExtensions(record, GEOMETRY_KEYS),
  }
}

function normalizePhysicalWeightSnapshot(value: unknown): EstimationDraftPhysicalWeightSnapshot | null {
  const record = readRecord(value)
  if (!record) return null
  const snapshot: EstimationDraftPhysicalWeightSnapshot = {
    kgPerUom: readFiniteNumber(record, 'kgPerUom'),
    source: readString(record, 'source'),
    note: readString(record, 'note'),
    capturedAt: readString(record, 'capturedAt'),
    extensions: collectExtensions(record, PHYSICAL_WEIGHT_SNAPSHOT_KEYS),
  }
  return snapshot.kgPerUom !== null || snapshot.source || snapshot.note || snapshot.capturedAt || hasExtensions(snapshot.extensions)
    ? snapshot
    : null
}

function normalizeCommercialColor(value: unknown): EstimationDraftCommercialColor {
  const record = readRecord(value) ?? {}
  return {
    colorCode: readString(record, 'colorCode'),
    colorName: readString(record, 'colorName'),
    selectedAt: readString(record, 'selectedAt'),
    extensions: collectExtensions(record, COMMERCIAL_COLOR_KEYS),
  }
}

function normalizeProvisionalIdentity(value: unknown, legacyScenario?: unknown): EstimationDraftProvisionalIdentity {
  const record = readRecord(value) ?? {}
  const legacy = readRecord(legacyScenario) ?? {}
  return {
    netWeightKg: readFiniteNumber(record, 'netWeightKg') ?? readFiniteNumber(legacy, 'netWeightKg'),
    grossWeightKg: readFiniteNumber(record, 'grossWeightKg') ?? readFiniteNumber(legacy, 'grossWeightKg'),
    extensions: collectExtensions(record, PROVISIONAL_IDENTITY_KEYS),
  }
}

function normalizeGelcoatItem(value: unknown): EstimationDraftGelcoatItem {
  const record = readRecord(value) ?? {}
  return {
    itemCode: readString(record, 'itemCode'),
    itemName: readString(record, 'itemName'),
    uom: readString(record, 'uom'),
    selectedAt: readString(record, 'selectedAt'),
    extensions: collectExtensions(record, GELCOAT_ITEM_KEYS),
  }
}

function normalizeCostEvidence(value: unknown): EstimationDraftCostEvidence | null {
  const record = readRecord(value)
  if (!record) return null

  const evidence: EstimationDraftCostEvidence = {
    source: readAllowedValue(record, 'source', COST_SOURCES),
    candidateId: readString(record, 'candidateId'),
    warehouseCode: readString(record, 'warehouseCode'),
    documentType: readString(record, 'documentType'),
    documentNumber: readString(record, 'documentNumber'),
    documentDate: readString(record, 'documentDate'),
    originalCurrency: readString(record, 'originalCurrency'),
    sourceUom: readString(record, 'sourceUom'),
    warning: readString(record, 'warning'),
    extensions: collectExtensions(record, COST_EVIDENCE_KEYS),
  }

  return evidence.source
    || evidence.candidateId
    || evidence.warehouseCode
    || evidence.documentType
    || evidence.documentNumber
    || evidence.documentDate
    || evidence.originalCurrency
    || evidence.sourceUom
    || evidence.warning
    || hasExtensions(evidence.extensions)
    ? evidence
    : null
}

function normalizedUniqueLineId(value: string | null, index: number, seenIds: Set<string>): string {
  const base = value ?? `line-${index + 1}`
  let candidate = base
  let duplicateCounter = 2
  while (seenIds.has(candidate)) {
    candidate = `${base}-${duplicateCounter}`
    duplicateCounter += 1
  }
  seenIds.add(candidate)
  return candidate
}

function normalizeBomLines(value: unknown): EstimationDraftBomLine[] {
  if (!Array.isArray(value)) return []

  const seenIds = new Set<string>()
  return value.flatMap((rawLine, index) => {
    const record = readRecord(rawLine)
    if (!record) return []

    const sapItemCode = readString(record, 'sapItemCode')
    const origin = readAllowedValue(record, 'origin', ESTIMATION_DRAFT_LINE_ORIGINS)
      ?? (sapItemCode ? 'sap' : 'manual')

    return [{
      id: normalizedUniqueLineId(readString(record, 'id'), index, seenIds),
      parentId: readString(record, 'parentId'),
      origin,
      sapItemCode,
      itemName: readString(record, 'itemName'),
      quantity: readFiniteNumber(record, 'quantity'),
      uom: readString(record, 'uom'),
      costCategory: readAllowedValue(record, 'costCategory', COST_CATEGORIES),
      costStrategy: readAllowedValue(record, 'costStrategy', COST_STRATEGIES),
      unitCost: readFiniteNumber(record, 'unitCost'),
      costEvidence: normalizeCostEvidence(record.costEvidence),
      manualCostReason: readString(record, 'manualCostReason'),
      notes: readString(record, 'notes'),
      physicalWeightPolicy: readAllowedValue(record, 'physicalWeightPolicy', ESTIMATION_DRAFT_PHYSICAL_WEIGHT_POLICIES)
        ?? 'from_quantity',
      usefulQuantity: readFiniteNumber(record, 'usefulQuantity'),
      fixedWeightKg: readFiniteNumber(record, 'fixedWeightKg'),
      physicalWeightSnapshot: normalizePhysicalWeightSnapshot(record.physicalWeightSnapshot),
      extensions: collectExtensions(record, BOM_LINE_KEYS),
    }]
  })
}

function normalizeCommercialScenario(value: unknown): EstimationDraftCommercialScenario {
  const record = readRecord(value) ?? {}
  return {
    currency: readString(record, 'currency') ?? 'COP',
    contributionMarginPct: readFiniteNumber(record, 'contributionMarginPct'),
    minimumPrice: readFiniteNumber(record, 'minimumPrice'),
    discountPct: readFiniteNumber(record, 'discountPct'),
    maximumPrice: readFiniteNumber(record, 'maximumPrice'),
    pvp: readFiniteNumber(record, 'pvp'),
    netWeightKg: readFiniteNumber(record, 'netWeightKg'),
    grossWeightKg: readFiniteNumber(record, 'grossWeightKg'),
    notes: readString(record, 'notes'),
    extensions: collectExtensions(record, COMMERCIAL_SCENARIO_KEYS),
  }
}

export function createEmptyEstimationDraft(): EstimationDraft {
  return {
    schemaVersion: ESTIMATION_DRAFT_SCHEMA_VERSION,
    homologue: null,
    syntheticMarbleCalibration: null,
    geometry: normalizeGeometry(null),
    provisionalIdentity: normalizeProvisionalIdentity(null),
    commercialColor: normalizeCommercialColor(null),
    gelcoatItem: normalizeGelcoatItem(null),
    bomLines: [],
    commercialScenario: normalizeCommercialScenario(null),
    extensions: {},
  }
}

/**
 * Converts unknown JSONB data into a stable, editable in-memory draft. Invalid
 * known values become null; future/unknown JSON fields are retained as extensions.
 */
export function normalizeEstimationDraft(value: unknown): EstimationDraft {
  const record = readRecord(value)
  if (!record) return createEmptyEstimationDraft()

  return {
    schemaVersion: ESTIMATION_DRAFT_SCHEMA_VERSION,
    homologue: normalizeHomologue(record.homologue),
    syntheticMarbleCalibration: normalizeSyntheticMarbleCalibration(record.syntheticMarbleCalibration),
    geometry: normalizeGeometry(record.geometry),
    provisionalIdentity: normalizeProvisionalIdentity(record.provisionalIdentity, record.commercialScenario),
    commercialColor: normalizeCommercialColor(record.commercialColor),
    gelcoatItem: normalizeGelcoatItem(record.gelcoatItem),
    bomLines: normalizeBomLines(record.bomLines),
    commercialScenario: normalizeCommercialScenario(record.commercialScenario),
    extensions: collectExtensions(record, ROOT_KEYS),
  }
}

function serializeHomologue(value: EstimationDraftHomologue): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    sapItemCode: value.sapItemCode,
    itemName: value.itemName,
    sapPrefix: value.sapPrefix,
    familyCode: value.familyCode,
    selectedAt: value.selectedAt,
    bomReadAt: value.bomReadAt,
  }
}

function serializeFrozenCalibrationFactor(value: FrozenCalibrationFactor): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    factor: value.factor,
    sampleIds: value.sampleIds,
    sampleCount: value.sampleCount,
    driverTotal: value.driverTotal,
    consumptionTotal: value.consumptionTotal,
    simpleMeanRatio: value.simpleMeanRatio,
    minRatio: value.minRatio,
    maxRatio: value.maxRatio,
  }
}

function serializeSyntheticMarbleCalibration(value: FrozenSyntheticMarbleCalibration): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    calibrationGroup: value.calibrationGroup,
    frozenAt: value.frozenAt,
    mixture: value.mixture ? serializeFrozenCalibrationFactor(value.mixture) : null,
    gelcoat: value.gelcoat ? serializeFrozenCalibrationFactor(value.gelcoat) : null,
  }
}

function serializeGeometry(value: EstimationDraftGeometry): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    source: value.source,
    capturedAt: value.capturedAt,
    volumeMm3: value.volumeMm3,
    paintAreaMm2: value.paintAreaMm2,
    estimatedMixtureKg: value.estimatedMixtureKg,
    estimatedGelcoatKg: value.estimatedGelcoatKg,
    actualMixtureKg: value.actualMixtureKg,
    actualGelcoatKg: value.actualGelcoatKg,
    weightWastePct: value.weightWastePct,
    estimatedNetWeightKg: value.estimatedNetWeightKg,
    estimatedPackagingWeightKg: value.estimatedPackagingWeightKg,
    estimatedGrossWeightKg: value.estimatedGrossWeightKg,
    actualNetWeightKg: value.actualNetWeightKg,
    actualGrossWeightKg: value.actualGrossWeightKg,
  }
}

function serializePhysicalWeightSnapshot(value: EstimationDraftPhysicalWeightSnapshot): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    kgPerUom: value.kgPerUom,
    source: value.source,
    note: value.note,
    capturedAt: value.capturedAt,
  }
}

function serializeCommercialColor(value: EstimationDraftCommercialColor): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    colorCode: value.colorCode,
    colorName: value.colorName,
    selectedAt: value.selectedAt,
  }
}

function serializeProvisionalIdentity(value: EstimationDraftProvisionalIdentity): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    netWeightKg: value.netWeightKg,
    grossWeightKg: value.grossWeightKg,
  }
}

function serializeGelcoatItem(value: EstimationDraftGelcoatItem): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    itemCode: value.itemCode,
    itemName: value.itemName,
    uom: value.uom,
    selectedAt: value.selectedAt,
  }
}

function serializeCostEvidence(value: EstimationDraftCostEvidence): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    source: value.source,
    candidateId: value.candidateId,
    warehouseCode: value.warehouseCode,
    documentType: value.documentType,
    documentNumber: value.documentNumber,
    documentDate: value.documentDate,
    originalCurrency: value.originalCurrency,
    sourceUom: value.sourceUom,
    warning: value.warning,
  }
}

function serializeBomLine(value: EstimationDraftBomLine): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    id: value.id,
    parentId: value.parentId,
    origin: value.origin,
    sapItemCode: value.sapItemCode,
    itemName: value.itemName,
    quantity: value.quantity,
    uom: value.uom,
    costCategory: value.costCategory,
    costStrategy: value.costStrategy,
    unitCost: value.unitCost,
    costEvidence: value.costEvidence ? serializeCostEvidence(value.costEvidence) : null,
    manualCostReason: value.manualCostReason,
    notes: value.notes,
    physicalWeightPolicy: value.physicalWeightPolicy,
    usefulQuantity: value.usefulQuantity,
    fixedWeightKg: value.fixedWeightKg,
    physicalWeightSnapshot: value.physicalWeightSnapshot ? serializePhysicalWeightSnapshot(value.physicalWeightSnapshot) : null,
  }
}

function serializeCommercialScenario(value: EstimationDraftCommercialScenario): EstimationDraftJsonObject {
  return {
    ...value.extensions,
    currency: value.currency,
    contributionMarginPct: value.contributionMarginPct,
    minimumPrice: value.minimumPrice,
    discountPct: value.discountPct,
    maximumPrice: value.maximumPrice,
    pvp: value.pvp,
    netWeightKg: value.netWeightKg,
    grossWeightKg: value.grossWeightKg,
    notes: value.notes,
  }
}

/** Serializes the normalized draft back to JSONB-compatible data. */
export function serializeEstimationDraft(draft: EstimationDraft): EstimationDraftJsonObject {
  return {
    ...draft.extensions,
    schemaVersion: ESTIMATION_DRAFT_SCHEMA_VERSION,
    homologue: draft.homologue ? serializeHomologue(draft.homologue) : null,
    syntheticMarbleCalibration: draft.syntheticMarbleCalibration
      ? serializeSyntheticMarbleCalibration(draft.syntheticMarbleCalibration)
      : null,
    geometry: serializeGeometry(draft.geometry),
    provisionalIdentity: serializeProvisionalIdentity(draft.provisionalIdentity),
    commercialColor: serializeCommercialColor(draft.commercialColor),
    gelcoatItem: serializeGelcoatItem(draft.gelcoatItem),
    bomLines: draft.bomLines.map(serializeBomLine),
    commercialScenario: serializeCommercialScenario(draft.commercialScenario),
  }
}

function freezeCalibrationFactor(value: CalibrationFactor | null): FrozenCalibrationFactor | null {
  if (!value) return null
  return {
    factor: value.factor,
    sampleIds: [...value.sampleIds],
    sampleCount: value.sampleCount,
    driverTotal: value.driverTotal,
    consumptionTotal: value.consumptionTotal,
    simpleMeanRatio: value.simpleMeanRatio,
    minRatio: value.minRatio,
    maxRatio: value.maxRatio,
    extensions: {},
  }
}

/**
 * Copies the measured cohort factors into the draft so later measurements do
 * not retroactively change an existing quotation.
 */
export function freezeSyntheticMarbleCalibration(
  calibration: SyntheticMarbleCalibration,
  frozenAt: string | null,
): FrozenSyntheticMarbleCalibration | null {
  const mixture = freezeCalibrationFactor(calibration.mixture)
  const gelcoat = freezeCalibrationFactor(calibration.gelcoat)
  if (!mixture && !gelcoat) return null

  return {
    calibrationGroup: SYNTHETIC_MARBLE_CALIBRATION_GROUP,
    frozenAt: frozenAt?.trim() || null,
    mixture,
    gelcoat,
    extensions: {},
  }
}

export function hasFrozenSyntheticMarbleCalibration(draft: EstimationDraft): boolean {
  const calibration = draft.syntheticMarbleCalibration
  return calibration !== null && (calibration.mixture !== null || calibration.gelcoat !== null)
}
