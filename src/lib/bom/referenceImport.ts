import 'server-only'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'
import {
  getSapItemBom,
  getSapItemsByCodes,
  getSapItemsByPrefix,
  getSapProductTreesByPrefixes,
  productTreeLineFingerprint,
  productTreeStructureMatches,
  updateSapProductTreeIssueMethod,
  type BomLine,
  type SapEntityPayload,
} from '@/lib/sap/serviceLayer'
import {
  buildComponentTechnicalMetadata,
  inferBaseItemName,
  inferComponentCategory,
  parseSapItemCode,
  readSapFrozen,
  readSapInventoryItem,
  readSapItemName,
  readSapUom,
  readSapValid,
} from './sapMapping'
import { analyzeReferenceBom } from './referenceImportAnalysis'
import { normalizeBomOverrides } from './resolve'
import {
  isReferenceProductApplicationScope,
  type ReferenceProductApplicationScope,
} from './referenceImportScopes'
import {
  type ColorConfiguration,
  type ComponentBomLine,
  type ComponentTreeSnapshot,
  type DirectBomSnapshot,
  type JsonRecord,
  type JsonValue,
  type ReferenceBomLine,
  type ReferenceBomStructure,
  type ReferenceImportContext,
  type ReferenceImportCandidate,
  type ReferenceImportFinding,
  type ReferenceImportFindingDraft,
  type ReferenceImportRunSummary,
  type ReferenceImportSku,
  type ReferenceImportSnapshotSummary,
  type ReferenceImportWorkspace,
  type ReferenceImportActiveOverride,
} from './referenceImportTypes'
import type { BomColorMode, BomColorOverride, BomConsumptionStatus, ComponentTechnicalMetadata, HybridColorCase } from './types'

const ANALYZED_VERSION_CODE = '000'
const DIRECT_BOM_CONCURRENCY = 2
const DIRECT_BOM_TIMEOUT_MS = 12_000
const COMPONENT_TREE_CONCURRENCY = 2
const COMPONENT_TREE_TIMEOUT_MS = 8_000
const COMPONENT_TREE_MAX_DEPTH = 12
const COMPONENT_TREE_MAX_NODES = 150
const COMPONENT_METADATA_BATCH_SIZE = 24
const COMPONENT_METADATA_CONCURRENCY = 3
const COMPONENT_METADATA_TIMEOUT_MS = 8_000

const COMPONENT_ITEM_SELECT = [
  'ItemCode',
  'ItemName',
  'InventoryUOM',
  'SalesUnit',
  'Valid',
  'Frozen',
  'InventoryItem',
  'PurchaseUnitLength',
  'PurchaseLengthUnit',
  'PurchaseUnitWidth',
  'PurchaseWidthUnit',
  'PurchaseUnitHeight',
  'PurchaseHeightUnit',
]

type SapBom = {
  treeCode: string
  productDescription: string | null
  treeType: string | null
  quantity: number
  lines: BomLine[]
}

type ComponentTraversal = {
  treesByItemCode: Map<string, ComponentTreeSnapshot>
  sourceLinesByItemCode: Map<string, ComponentBomLine>
  findings: ReferenceImportFindingDraft[]
}

type ExistingComponentItem = {
  itemCode: string
  itemName: string
  baseItemName: string | null
  uom: string | null
  componentCategory: string
  defaultIssueMethod: string | null
  sapValid: boolean | null
  sapFrozen: boolean | null
  isInventoryItem: boolean | null
  itemBomStructure: JsonRecord
  technicalMetadata: JsonRecord
}

type ComponentUpsertResult = {
  count: number
  uomFindings: ReferenceImportFindingDraft[]
  metadataFindings: ReferenceImportFindingDraft[]
}

type SapReferenceSkuReconciliation = {
  sapActiveSkuCodes: string[]
  sapInactiveSkuCodes: string[]
  confirmedSkuCodes: Set<string>
  onlyInSupabaseSkuCodes: string[]
  notFoundInSapSkuCodes: string[]
  onlyInSapSkuCodes: string[]
}

type TransientReferenceImportRetry = {
  skuCompletes: string[]
  cachedSnapshots: unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function readNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, toJsonValue(nestedValue)]))
  }
  return String(value)
}

function jsonRecord(value: unknown): JsonRecord {
  if (typeof value === 'string') {
    try {
      return jsonRecord(JSON.parse(value) as unknown)
    } catch {
      return {}
    }
  }
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, toJsonValue(nestedValue)]))
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(item => readString(item) ?? [])
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized.startsWith('{') && normalized.endsWith('}')) {
      return normalized.slice(1, -1).split(',').flatMap(item => readString(item) ?? [])
    }
  }
  return []
}

function readHybridColorCases(value: JsonRecord): HybridColorCase[] {
  const rawCases = value.hybrid_color_cases
  if (!Array.isArray(rawCases)) return []

  const seenSkuSets = new Set<string>()
  return rawCases.flatMap((rawCase, index) => {
    const candidate = jsonRecord(rawCase)
    const colorMode = readString(candidate.color_mode)?.toLowerCase()
    if (colorMode !== 'dual' && colorMode !== 'balance') return []

    const skuCompletes = [...new Set(readStringArray(candidate.sku_completes)
      .map(skuComplete => skuComplete.toUpperCase()))]
      .sort()
    if (skuCompletes.length === 0) return []

    const applicationColors = Object.fromEntries(
      Object.entries(jsonRecord(candidate.application_colors))
        .flatMap(([scope, colorCode]) => {
          const normalizedColorCode = readString(colorCode)?.toUpperCase()
          return normalizedColorCode ? [[scope, normalizedColorCode] as const] : []
        })
    )
    if (Object.keys(applicationColors).length === 0) return []

    const skuSetKey = skuCompletes.join('|')
    if (seenSkuSets.has(skuSetKey)) return []
    seenSkuSets.add(skuSetKey)
    return [{
      case_id: readString(candidate.case_id) ?? `case_${String(index + 1).padStart(3, '0')}`,
      color_mode: colorMode,
      sku_completes: skuCompletes,
      application_colors: applicationColors,
    }]
  })
}

function asRunStatus(value: unknown): ReferenceImportRunSummary['status'] {
  if (value === 'draft' || value === 'needs_review' || value === 'published' || value === 'failed') return value
  return 'failed'
}

function asSnapshotStatus(value: unknown): ReferenceImportSnapshotSummary['status'] {
  return value === 'captured' ? 'captured' : 'failed'
}

function asFindingStatus(value: unknown): ReferenceImportFinding['status'] {
  if (value === 'accepted' || value === 'rejected' || value === 'resolved') return value
  return 'open'
}

function asFindingSeverity(value: unknown): ReferenceImportFinding['severity'] {
  if (value === 'blocker' || value === 'warning') return value
  return 'info'
}

function sqlPlaceholders(count: number, startAt = 1): string {
  return Array.from({ length: count }, (_, index) => `$${startAt + index}`).join(', ')
}

function cleanBomLine(value: unknown, index: number): ReferenceBomLine | null {
  const record = isRecord(value) ? value : {}
  const baseItemCode = readString(record.base_item_code)
  const lineKind = record.line_kind === 'material_group' ? 'material_group' : 'fixed'
  const alternatives = Array.isArray(record.alternatives)
    ? record.alternatives.flatMap((alternative, alternativeIndex) => {
        const candidate = isRecord(alternative) ? alternative : {}
        const alternativeBaseCode = readString(candidate.base_item_code)
        const materialProfile = readString(candidate.material_profile)
        if (!alternativeBaseCode || !materialProfile) return []
        return [{
          alternative_id: readString(candidate.alternative_id) ?? `alt_${String(alternativeIndex + 1).padStart(2, '0')}`,
          base_item_code: alternativeBaseCode,
          material_profile: materialProfile,
          is_default: candidate.is_default === true,
        }]
      })
    : []
  if (lineKind === 'fixed' && !baseItemCode) return null
  if (lineKind === 'material_group' && alternatives.length === 0) return null
  const scopeValue = record.product_application_scope
  const scope = isReferenceProductApplicationScope(scopeValue) ? scopeValue : 'NA'
  const lineId = readString(record.line_id) ?? `ln_${String(index + 1).padStart(6, '0')}`
  const consumptions = Array.isArray(record.consumptions)
    ? record.consumptions.flatMap((consumption) => {
        const candidate = isRecord(consumption) ? consumption : {}
        const colorMode = candidate.color_mode
        const consumptionScope = candidate.product_application_scope
        const materialProfile = readString(candidate.material_profile)
        if (
          (colorMode !== 'full' && colorMode !== 'dual' && colorMode !== 'balance')
          || !isReferenceProductApplicationScope(consumptionScope)
          || !materialProfile
        ) return []
        const normalizedColorMode = colorMode as BomColorMode
        const status: BomConsumptionStatus = candidate.status === 'confirmed' || candidate.status === 'observed'
          ? candidate.status
          : 'needs_definition'
        return [{
          color_mode: normalizedColorMode,
          product_application_scope: consumptionScope,
          material_profile: materialProfile,
          format_key: readString(candidate.format_key),
          qty: candidate.qty === null || candidate.qty === undefined ? null : readNumber(candidate.qty),
          status,
        }]
      })
    : []

  return {
    line_id: lineId,
    sort_order: readNumber(record.sort_order, index + 1),
    line_kind: lineKind,
    base_item_code: lineKind === 'fixed' ? baseItemCode : null,
    product_application_scope: scope,
    qty: lineKind === 'fixed' ? readNumber(record.qty) : null,
    uom: readString(record.uom),
    input_warehouse_code: readString(record.input_warehouse_code),
    issue_method_override: readString(record.issue_method_override),
    alternatives,
    consumptions,
  }
}

function cleanBomStructure(value: unknown): ReferenceBomStructure {
  const record = isRecord(value) ? value : {}
  const rawLines = Array.isArray(record.lines) ? record.lines : []
  const lines = rawLines
    .map(cleanBomLine)
    .filter((line): line is ReferenceBomLine => line !== null)
    .sort((left, right) => left.sort_order - right.sort_order || left.line_id.localeCompare(right.line_id))

  return {
    schema_version: 2,
    structure_type: record.structure_type === 'sales_kit' ? 'sales_kit' : 'production',
    input_warehouse_code: readString(record.input_warehouse_code),
    output_warehouse_code: readString(record.output_warehouse_code),
    lines,
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo consultar SAP.'
}

function salesSkuPrefix(context: ReferenceImportContext): string {
  const familyCode = context.familyCode?.trim().toUpperCase() ?? ''
  const salesFamilyCode = familyCode.startsWith('V') ? familyCode : `V${familyCode}`
  return `${salesFamilyCode}-${context.referenceCode}-000-`
}

function isSapItemActive(item: SapEntityPayload): boolean {
  return readSapValid(item) !== false && readSapFrozen(item) !== true
}

function skuColorCode(skuComplete: string): string | null {
  const parts = skuComplete.trim().toUpperCase().split('-')
  return parts.length >= 4 && parts[3] ? parts[3] : null
}

async function reconcileReferenceSkusWithSap(
  context: ReferenceImportContext,
  skus: ReferenceImportSku[]
): Promise<SapReferenceSkuReconciliation> {
  const sapItems = await getSapItemsByPrefix(
    salesSkuPrefix(context),
    ['ItemCode', 'ItemName', 'Valid', 'Frozen'],
    { timeoutMs: DIRECT_BOM_TIMEOUT_MS, top: 200 }
  )
  const sapActiveSkuCodes = [...new Set(sapItems.flatMap((item) => {
    const itemCode = readString(item.ItemCode)?.toUpperCase()
    return itemCode && isSapItemActive(item) ? [itemCode] : []
  }))].sort()
  const allSapInactiveSkuCodes = [...new Set(sapItems.flatMap((item) => {
    const itemCode = readString(item.ItemCode)?.toUpperCase()
    return itemCode && !isSapItemActive(item) ? [itemCode] : []
  }))].sort()
  const appSkuCodes = skus.map(sku => sku.skuComplete.toUpperCase())
  const sapActiveSkuSet = new Set(sapActiveSkuCodes)
  const sapInactiveSkuSet = new Set(allSapInactiveSkuCodes)
  const sapInactiveSkuCodes = appSkuCodes.filter(skuComplete => sapInactiveSkuSet.has(skuComplete)).sort()
  const sapMatchedSkuSet = new Set([...sapActiveSkuCodes, ...allSapInactiveSkuCodes])
  const appSkuSet = new Set(appSkuCodes)
  const notFoundInSapSkuCodes = appSkuCodes.filter(skuComplete => !sapMatchedSkuSet.has(skuComplete)).sort()

  return {
    sapActiveSkuCodes,
    sapInactiveSkuCodes,
    confirmedSkuCodes: new Set(appSkuCodes.filter(skuComplete => sapActiveSkuSet.has(skuComplete))),
    onlyInSupabaseSkuCodes: appSkuCodes.filter(skuComplete => !sapActiveSkuSet.has(skuComplete)).sort(),
    notFoundInSapSkuCodes,
    onlyInSapSkuCodes: sapActiveSkuCodes.filter(skuComplete => !appSkuSet.has(skuComplete)).sort(),
  }
}

function failedDirectSnapshot(sku: ReferenceImportSku, errorMessage: string): DirectBomSnapshot {
  return {
    skuComplete: sku.skuComplete,
    skuColorCode: sku.colorCode,
    sapItemName: sku.sapDescriptionOriginal,
    treeCode: null,
    treeType: null,
    lineCount: 0,
    status: 'failed',
    errorMessage,
    directBomJson: {
      schema_version: 2,
      source: 'sap_product_trees',
      lines: [],
      error: errorMessage,
    },
    normalizedLines: [],
  }
}

function errorFinding(input: {
  key: string
  type: string
  severity: ReferenceImportFindingDraft['severity']
  details: JsonRecord
  baseItemCode?: string | null
  occurrence?: number | null
}): ReferenceImportFindingDraft {
  return {
    findingKey: input.key,
    findingType: input.type,
    severity: input.severity,
    status: 'open',
    lineIdentity: null,
    baseItemCode: input.baseItemCode ?? null,
    occurrence: input.occurrence ?? null,
    proposedScope: null,
    proposedColorCode: null,
    detailsJson: input.details,
  }
}

async function mapWithConcurrency<T, TResult>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(values.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(values[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()))
  return results
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function normalizeDirectLines(lines: BomLine[]): DirectBomSnapshot['normalizedLines'] {
  const occurrences = new Map<string, number>()

  return lines.map((line, index) => {
    const parsed = parseSapItemCode(line.ItemCode)
    const occurrence = (occurrences.get(parsed.baseItemCode) ?? 0) + 1
    occurrences.set(parsed.baseItemCode, occurrence)

    return {
      itemCode: parsed.itemCode,
      itemName: line.ItemName?.trim() || parsed.itemCode,
      baseItemCode: parsed.baseItemCode,
      variantCode4: parsed.variantCode4,
      isSalesSku: parsed.isSalesSku,
      occurrence,
      lineIdentity: `${parsed.baseItemCode}#${occurrence}`,
      sourceOrder: index + 1,
      sapChildNum: Number.isFinite(line.ChildNum) ? line.ChildNum : null,
      qty: Number.isFinite(line.Quantity) ? line.Quantity : 0,
      warehouse: readString(line.Warehouse),
      issueMethod: readString(line.IssueMethod),
      inventoryUom: readString(line.InventoryUOM),
      technicalMetadata: null,
    }
  })
}

function buildDirectBomJson(bom: SapBom, normalizedLines: DirectBomSnapshot['normalizedLines']): JsonRecord {
  return {
    schema_version: 2,
    source: 'sap_product_trees',
    tree_code: bom.treeCode,
    product_description: bom.productDescription,
    tree_type: bom.treeType,
    tree_quantity: bom.quantity,
    lines: normalizedLines.map(line => ({
      visible_order: line.sourceOrder,
      child_num: line.sapChildNum,
      item_code: line.itemCode,
      item_name: line.itemName,
      base_item_code: line.baseItemCode,
      variant_code_4: line.variantCode4,
      occurrence: line.occurrence,
      qty: line.qty,
      warehouse: line.warehouse,
      issue_method: line.issueMethod,
      inventory_uom: line.inventoryUom,
      technical_metadata: line.technicalMetadata,
    })),
  }
}

function readNullableNumber(value: unknown): number | null {
  if (value === null) return null
  const number = readNumber(value, Number.NaN)
  return Number.isFinite(number) ? number : null
}

function cachedTechnicalMetadata(value: unknown): ComponentTechnicalMetadata | null {
  const metadata = jsonRecord(value)
  const materialKind = readString(metadata.material_kind)
  const metadataSource = readString(metadata.metadata_source)
  if (
    (materialKind !== 'board' && materialKind !== 'edge_band' && materialKind !== 'other')
    || (metadataSource !== 'sap_and_name' && metadataSource !== 'sap' && metadataSource !== 'name' && metadataSource !== 'unknown')
  ) return null

  return {
    material_kind: materialKind,
    material_profile: readString(metadata.material_profile),
    material_profile_source: readString(metadata.material_profile_source),
    thickness_mm: readNullableNumber(metadata.thickness_mm),
    purchase_length: readNullableNumber(metadata.purchase_length),
    purchase_length_unit: readNullableNumber(metadata.purchase_length_unit),
    purchase_length_mm: readNullableNumber(metadata.purchase_length_mm),
    purchase_width: readNullableNumber(metadata.purchase_width),
    purchase_width_unit: readNullableNumber(metadata.purchase_width_unit),
    purchase_width_mm: readNullableNumber(metadata.purchase_width_mm),
    purchase_height: readNullableNumber(metadata.purchase_height),
    purchase_height_unit: readNullableNumber(metadata.purchase_height_unit),
    purchase_height_mm: readNullableNumber(metadata.purchase_height_mm),
    format_key: readString(metadata.format_key),
    metadata_source: metadataSource,
  }
}

function normalizedLinesFromTransientData(directBomJson: JsonRecord): DirectBomSnapshot['normalizedLines'] | null {
  const rawLines = directBomJson.lines
  if (!Array.isArray(rawLines)) return null

  const occurrences = new Map<string, number>()
  const lines: DirectBomSnapshot['normalizedLines'] = []
  for (const [index, rawLine] of rawLines.entries()) {
    const line = jsonRecord(rawLine)
    const itemCode = readString(line.item_code)
    if (!itemCode) return null
    const parsed = parseSapItemCode(itemCode)
    const occurrence = (occurrences.get(parsed.baseItemCode) ?? 0) + 1
    occurrences.set(parsed.baseItemCode, occurrence)
    const sourceOrder = readNumber(line.visible_order, index + 1)
    if (!Number.isInteger(sourceOrder) || sourceOrder < 1) return null

    lines.push({
      itemCode: parsed.itemCode,
      itemName: readString(line.item_name) ?? parsed.itemCode,
      baseItemCode: parsed.baseItemCode,
      variantCode4: parsed.variantCode4,
      isSalesSku: parsed.isSalesSku,
      occurrence,
      lineIdentity: `${parsed.baseItemCode}#${occurrence}`,
      sourceOrder,
      sapChildNum: readNullableNumber(line.child_num),
      qty: readNumber(line.qty, 0),
      warehouse: readString(line.warehouse),
      issueMethod: readString(line.issue_method),
      inventoryUom: readString(line.inventory_uom),
      technicalMetadata: cachedTechnicalMetadata(line.technical_metadata),
    })
  }
  return lines
}

function cachedDirectSnapshot(value: unknown, sku: ReferenceImportSku): DirectBomSnapshot | null {
  const snapshot = jsonRecord(value)
  if (snapshot.status !== 'captured' || readString(snapshot.skuComplete)?.toUpperCase() !== sku.skuComplete.toUpperCase()) return null

  const transientData = jsonRecord(snapshot.transientData)
  const directBomJson = jsonRecord(transientData.directBomJson)
  const normalizedLines = normalizedLinesFromTransientData(directBomJson)
  const lineCount = readNumber(snapshot.lineCount, Number.NaN)
  if (!normalizedLines || !Number.isInteger(lineCount) || lineCount !== normalizedLines.length) return null

  return {
    skuComplete: sku.skuComplete,
    skuColorCode: sku.colorCode,
    sapItemName: readString(snapshot.sapItemName) ?? sku.sapDescriptionOriginal,
    treeCode: readString(transientData.treeCode),
    treeType: readString(snapshot.treeType),
    lineCount,
    status: 'captured',
    errorMessage: null,
    directBomJson,
    normalizedLines,
  }
}

function cachedDirectSnapshots(values: unknown[], skus: ReferenceImportSku[]): Map<string, DirectBomSnapshot> {
  const sourceBySku = new Map(skus.map(sku => [sku.skuComplete.toUpperCase(), sku]))
  const snapshots = new Map<string, DirectBomSnapshot>()
  for (const value of values) {
    const skuComplete = readString(jsonRecord(value).skuComplete)?.toUpperCase()
    if (!skuComplete) continue
    const sku = sourceBySku.get(skuComplete)
    if (!sku || snapshots.has(skuComplete)) continue
    const snapshot = cachedDirectSnapshot(value, sku)
    if (snapshot) snapshots.set(skuComplete, snapshot)
  }
  return snapshots
}

function directSnapshotFromBom(sku: ReferenceImportSku, bom: SapBom): DirectBomSnapshot {
  const normalizedLines = normalizeDirectLines(bom.lines)
  return {
    skuComplete: sku.skuComplete,
    skuColorCode: sku.colorCode,
    sapItemName: bom.productDescription ?? sku.sapDescriptionOriginal,
    treeCode: bom.treeCode,
    treeType: bom.treeType,
    lineCount: normalizedLines.length,
    status: 'captured',
    errorMessage: null,
    directBomJson: buildDirectBomJson(bom, normalizedLines),
    normalizedLines,
  }
}

function sapBomFromProductTree(tree: SapEntityPayload): SapBom | null {
  const treeCode = readString(tree.TreeCode)
  const rawLines = tree.ProductTreeLines
  if (!treeCode || !Array.isArray(rawLines)) return null

  const lines = rawLines.flatMap((value, index): BomLine[] => {
    const line = isRecord(value) ? value : {}
    const itemCode = readString(line.ItemCode)
    if (!itemCode) return []
    return [{
      ItemCode: itemCode,
      ItemName: readString(line.ItemName) ?? itemCode,
      Quantity: readNumber(line.Quantity, 0),
      Price: readNumber(line.Price, 0),
      Currency: readString(line.Currency) ?? '',
      IssueMethod: readString(line.IssueMethod) ?? '',
      InventoryUOM: readString(line.InventoryUOM),
      ChildNum: readNumber(line.ChildNum, index),
      ParentItem: readString(line.ParentItem) ?? treeCode,
      Warehouse: readString(line.Warehouse),
      Comment: readString(line.Comment),
    }]
  })

  return {
    treeCode,
    productDescription: readString(tree.ProductDescription),
    treeType: readString(tree.TreeType),
    quantity: readNumber(tree.Quantity, 1),
    lines,
  }
}

async function readDirectSnapshot(sku: ReferenceImportSku): Promise<DirectBomSnapshot> {
  try {
    const bom = await withTimeout(
      getSapItemBom(sku.skuComplete),
      DIRECT_BOM_TIMEOUT_MS,
      `SAP tardó demasiado consultando la LdM de ${sku.skuComplete}.`
    )
    if (!bom) {
      return {
        skuComplete: sku.skuComplete,
        skuColorCode: sku.colorCode,
        sapItemName: sku.sapDescriptionOriginal,
        treeCode: null,
        treeType: null,
        lineCount: 0,
        status: 'failed',
        errorMessage: 'SAP no devolvió ProductTree para este SKU.',
        directBomJson: { schema_version: 2, source: 'sap_product_trees', lines: [] },
        normalizedLines: [],
      }
    }

    return directSnapshotFromBom(sku, bom)
  } catch (error) {
    return {
      skuComplete: sku.skuComplete,
      skuColorCode: sku.colorCode,
      sapItemName: sku.sapDescriptionOriginal,
      treeCode: null,
      treeType: null,
      lineCount: 0,
      status: 'failed',
      errorMessage: getErrorMessage(error),
      directBomJson: {
        schema_version: 2,
        source: 'sap_product_trees',
        lines: [],
        error: getErrorMessage(error),
      },
      normalizedLines: [],
    }
  }
}

function componentLineFromNormalized(line: DirectBomSnapshot['normalizedLines'][number]): ComponentBomLine {
  return {
    itemCode: line.itemCode,
    itemName: line.itemName,
    baseItemCode: line.baseItemCode,
    variantCode4: line.variantCode4,
    isSalesSku: line.isSalesSku,
    sourceOrder: line.sourceOrder,
    sapChildNum: line.sapChildNum,
    qty: line.qty,
    warehouse: line.warehouse,
    issueMethod: line.issueMethod,
    inventoryUom: line.inventoryUom,
    technicalMetadata: line.technicalMetadata,
  }
}

function normalizeComponentLines(lines: BomLine[]): ComponentBomLine[] {
  return lines.map((line, index) => {
    const parsed = parseSapItemCode(line.ItemCode)
    return {
      itemCode: parsed.itemCode,
      itemName: line.ItemName?.trim() || parsed.itemCode,
      baseItemCode: parsed.baseItemCode,
      variantCode4: parsed.variantCode4,
      isSalesSku: parsed.isSalesSku,
      sourceOrder: index + 1,
      sapChildNum: Number.isFinite(line.ChildNum) ? line.ChildNum : null,
      qty: Number.isFinite(line.Quantity) ? line.Quantity : 0,
      warehouse: readString(line.Warehouse),
      issueMethod: readString(line.IssueMethod),
      inventoryUom: readString(line.InventoryUOM),
      technicalMetadata: null,
    }
  })
}

function addComponentSourceLine(sourceLines: Map<string, ComponentBomLine>, line: ComponentBomLine): void {
  if (line.isSalesSku || sourceLines.has(line.itemCode)) return
  sourceLines.set(line.itemCode, line)
}

function componentTreeStructure(tree: ComponentTreeSnapshot): JsonRecord {
  return {
    schema_version: 2,
    structure_type: 'component',
    input_warehouse_code: tree.inputWarehouseCode,
    output_warehouse_code: null,
    lines: tree.lines.map((line, index) => ({
      line_id: `ln_${String(index + 1).padStart(6, '0')}`,
      sort_order: index + 1,
      line_kind: 'fixed',
      base_item_code: line.baseItemCode,
      product_application_scope: 'NA',
      qty: line.qty,
      input_warehouse_code: line.warehouse,
      issue_method_override: line.issueMethod,
      alternatives: [],
      consumptions: [],
    })),
  }
}

async function readComponentTree(itemCode: string): Promise<ComponentTreeSnapshot> {
  try {
    const bom = await withTimeout(
      getSapItemBom(itemCode),
      COMPONENT_TREE_TIMEOUT_MS,
      `SAP tardó demasiado consultando la subestructura ${itemCode}.`
    )
    if (!bom) {
      return {
        itemCode,
        treeType: null,
        inputWarehouseCode: null,
        lines: [],
        readError: null,
      }
    }

    const lines = normalizeComponentLines(bom.lines)
    return {
      itemCode,
      treeType: bom.treeType,
      inputWarehouseCode: mostCommonLineWarehouse(lines),
      lines,
      readError: null,
    }
  } catch (error) {
    return {
      itemCode,
      treeType: null,
      inputWarehouseCode: null,
      lines: [],
      readError: getErrorMessage(error),
    }
  }
}

function mostCommonLineWarehouse(lines: ComponentBomLine[]): string | null {
  const counts = new Map<string, number>()
  for (const line of lines) {
    if (!line.warehouse) continue
    counts.set(line.warehouse, (counts.get(line.warehouse) ?? 0) + 1)
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
}

export async function expandComponentTrees(snapshots: DirectBomSnapshot[]): Promise<ComponentTraversal> {
  const treesByItemCode = new Map<string, ComponentTreeSnapshot>()
  const sourceLinesByItemCode = new Map<string, ComponentBomLine>()
  const findings: ReferenceImportFindingDraft[] = []
  const pending: Array<{ itemCode: string; depth: number; ancestors: string[] }> = []
  const queued = new Set<string>()
  const visited = new Set<string>()
  let nodeLimitReported = false

  for (const snapshot of snapshots) {
    if (snapshot.status !== 'captured') continue
    for (const line of snapshot.normalizedLines) {
      const componentLine = componentLineFromNormalized(line)
      addComponentSourceLine(sourceLinesByItemCode, componentLine)
      if (componentLine.isSalesSku || queued.has(componentLine.itemCode)) continue
      queued.add(componentLine.itemCode)
      pending.push({ itemCode: componentLine.itemCode, depth: 1, ancestors: [] })
    }
  }

  while (pending.length > 0) {
    const batch: Array<{ itemCode: string; depth: number; ancestors: string[] }> = []
    while (batch.length < COMPONENT_TREE_CONCURRENCY && pending.length > 0) {
      const candidate = pending.shift()
      if (!candidate || visited.has(candidate.itemCode)) continue
      if (visited.size >= COMPONENT_TREE_MAX_NODES) {
        if (!nodeLimitReported) {
          findings.push(errorFinding({
            key: 'component-tree:node-limit',
            type: 'component_tree_node_limit',
            severity: 'warning',
            details: { max_nodes: COMPONENT_TREE_MAX_NODES },
          }))
          nodeLimitReported = true
        }
        continue
      }
      visited.add(candidate.itemCode)
      batch.push(candidate)
    }

    if (batch.length === 0) continue
    const trees = await mapWithConcurrency(batch, COMPONENT_TREE_CONCURRENCY, async candidate => ({
      candidate,
      tree: await readComponentTree(candidate.itemCode),
    }))

    for (const { candidate, tree } of trees) {
      treesByItemCode.set(candidate.itemCode, tree)
      if (tree.readError) {
        findings.push(errorFinding({
          key: `component-tree:read:${candidate.itemCode}`,
          type: 'component_tree_read_failed',
          severity: 'warning',
          baseItemCode: parseSapItemCode(candidate.itemCode).baseItemCode,
          details: {
            item_code: candidate.itemCode,
            depth: candidate.depth,
            error: tree.readError,
          },
        }))
        continue
      }

      for (const child of tree.lines) {
        addComponentSourceLine(sourceLinesByItemCode, child)
        if (child.isSalesSku) continue

        const childAncestors = [...candidate.ancestors, candidate.itemCode]
        if (childAncestors.includes(child.itemCode)) {
          findings.push(errorFinding({
            key: `component-tree:cycle:${[...childAncestors, child.itemCode].join('>')}`,
            type: 'component_tree_cycle',
            severity: 'warning',
            baseItemCode: child.baseItemCode,
            details: {
              item_code: child.itemCode,
              path: [...childAncestors, child.itemCode],
            },
          }))
          continue
        }

        if (candidate.depth >= COMPONENT_TREE_MAX_DEPTH) {
          findings.push(errorFinding({
            key: `component-tree:depth:${candidate.itemCode}:${child.itemCode}`,
            type: 'component_tree_max_depth',
            severity: 'warning',
            baseItemCode: child.baseItemCode,
            details: {
              parent_item_code: candidate.itemCode,
              child_item_code: child.itemCode,
              max_depth: COMPONENT_TREE_MAX_DEPTH,
            },
          }))
          continue
        }

        if (queued.has(child.itemCode) || visited.has(child.itemCode)) continue
        queued.add(child.itemCode)
        pending.push({
          itemCode: child.itemCode,
          depth: candidate.depth + 1,
          ancestors: childAncestors,
        })
      }
    }
  }

  return { treesByItemCode, sourceLinesByItemCode, findings }
}

async function getExistingComponentItems(itemCodes: string[]): Promise<Map<string, ExistingComponentItem>> {
  const result = new Map<string, ExistingComponentItem>()
  const batchSize = 80

  for (let index = 0; index < itemCodes.length; index += batchSize) {
    const batch = itemCodes.slice(index, index + batchSize)
    const rows = await dbQuery(
      `SELECT
        item_code,
        item_name,
        base_item_name,
        uom,
        component_category,
        default_issue_method,
        sap_valid,
        sap_frozen,
        is_inventory_item,
        item_bom_structure,
        technical_metadata
      FROM public.component_items
      WHERE item_code IN (${sqlPlaceholders(batch.length)})`,
      batch
    )

    for (const row of rows) {
      const itemCode = readString(row.item_code)
      if (!itemCode) continue
      result.set(itemCode, {
        itemCode,
        itemName: readString(row.item_name) ?? itemCode,
        baseItemName: readString(row.base_item_name),
        uom: readString(row.uom),
        componentCategory: readString(row.component_category) ?? 'unknown',
        defaultIssueMethod: readString(row.default_issue_method),
        sapValid: readNullableBoolean(row.sap_valid),
        sapFrozen: readNullableBoolean(row.sap_frozen),
        isInventoryItem: readNullableBoolean(row.is_inventory_item),
        itemBomStructure: jsonRecord(row.item_bom_structure),
        technicalMetadata: jsonRecord(row.technical_metadata),
      })
    }
  }

  return result
}

async function getComponentMetadata(itemCodes: string[]): Promise<{
  itemsByCode: Map<string, SapEntityPayload | null>
  findings: ReferenceImportFindingDraft[]
}> {
  const batches: string[][] = []
  for (let index = 0; index < itemCodes.length; index += COMPONENT_METADATA_BATCH_SIZE) {
    batches.push(itemCodes.slice(index, index + COMPONENT_METADATA_BATCH_SIZE))
  }

  const outcomes = await mapWithConcurrency(batches, COMPONENT_METADATA_CONCURRENCY, async batch => {
    try {
      const items = await getSapItemsByCodes(batch, COMPONENT_ITEM_SELECT, {
        timeoutMs: COMPONENT_METADATA_TIMEOUT_MS,
      })
      return { batch, items, error: null as string | null }
    } catch (error) {
      return { batch, items: new Map<string, SapEntityPayload>(), error: getErrorMessage(error) }
    }
  })

  const itemsByCode = new Map<string, SapEntityPayload | null>()
  const findings: ReferenceImportFindingDraft[] = []
  for (const outcome of outcomes) {
    for (const itemCode of outcome.batch) {
      itemsByCode.set(itemCode, outcome.items.get(itemCode) ?? null)
    }
    if (outcome.error) {
      findings.push(errorFinding({
        key: `component-metadata:batch:${outcome.batch[0] ?? 'empty'}`,
        type: 'component_metadata_batch_failed',
        severity: 'warning',
        details: {
          item_codes: outcome.batch,
          error: outcome.error,
        },
      }))
    }
  }

  return { itemsByCode, findings }
}

export async function upsertExpandedComponents(traversal: ComponentTraversal): Promise<ComponentUpsertResult> {
  const itemCodes = [...traversal.sourceLinesByItemCode.keys()].sort()
  if (itemCodes.length === 0) {
    return { count: 0, uomFindings: [], metadataFindings: [] }
  }

  const [existingByItemCode, metadata] = await Promise.all([
    getExistingComponentItems(itemCodes),
    getComponentMetadata(itemCodes),
  ])
  const uomFindings: ReferenceImportFindingDraft[] = []
  const rows = itemCodes.map((itemCode) => {
    const source = traversal.sourceLinesByItemCode.get(itemCode)
    if (!source) throw new Error(`Falta la línea fuente para ${itemCode}.`)

    const existing = existingByItemCode.get(itemCode)
    const sapItem = metadata.itemsByCode.get(itemCode) ?? null
    const tree = traversal.treesByItemCode.get(itemCode)
    const itemName = sapItem
      ? readSapItemName(sapItem, source.itemName)
      : source.itemName || existing?.itemName || itemCode
    const uom = sapItem
      ? readSapUom(sapItem, source.inventoryUom)
      : source.inventoryUom ?? existing?.uom ?? null
    const itemBomStructure = tree && !tree.readError
      ? componentTreeStructure(tree)
      : existing?.itemBomStructure ?? {
          schema_version: 2,
          structure_type: 'component',
          input_warehouse_code: null,
          output_warehouse_code: null,
          lines: [],
        }
    const technicalMetadata = sapItem
      ? buildComponentTechnicalMetadata(sapItem, itemName)
      : source.technicalMetadata ?? existing?.technicalMetadata ?? {}

    if (!uom) {
      uomFindings.push(errorFinding({
        key: `component-metadata:uom:${itemCode}`,
        type: 'component_uom_missing',
        severity: 'warning',
        baseItemCode: source.baseItemCode,
        details: {
          item_code: itemCode,
          item_name: itemName,
        },
      }))
    }

    return {
      item_code: itemCode,
      base_item_code: source.baseItemCode,
      variant_code_4: source.variantCode4,
      item_name: itemName,
      base_item_name: inferBaseItemName(itemName, source.variantCode4),
      uom,
      component_category: tree && tree.lines.length > 0
        ? 'substructure'
        : inferComponentCategory(itemCode, itemName),
      default_issue_method: source.issueMethod ?? existing?.defaultIssueMethod ?? null,
      sap_valid: sapItem ? readSapValid(sapItem) : existing?.sapValid ?? null,
      sap_frozen: sapItem ? readSapFrozen(sapItem) : existing?.sapFrozen ?? null,
      is_inventory_item: sapItem ? readSapInventoryItem(sapItem) : existing?.isInventoryItem ?? null,
      item_bom_structure: itemBomStructure,
      technical_metadata: technicalMetadata,
    }
  })

  const { error } = await supabaseTable('component_items').upsert(rows, { onConflict: 'item_code' })
  if (error) throw new Error(`No se pudieron actualizar component_items: ${error.message}`)

  return {
    count: rows.length,
    uomFindings,
    metadataFindings: metadata.findings,
  }
}

async function enrichDirectComponents(snapshots: DirectBomSnapshot[]): Promise<{
  snapshots: DirectBomSnapshot[]
  componentResult: ComponentUpsertResult
}> {
  const sourceByItemCode = new Map<string, DirectBomSnapshot['normalizedLines'][number]>()
  for (const snapshot of snapshots) {
    if (snapshot.status !== 'captured') continue
    for (const line of snapshot.normalizedLines) {
      if (!line.isSalesSku && !sourceByItemCode.has(line.itemCode)) sourceByItemCode.set(line.itemCode, line)
    }
  }

  const itemCodes = [...sourceByItemCode.keys()].sort()
  if (itemCodes.length === 0) {
    return {
      snapshots,
      componentResult: { count: 0, uomFindings: [], metadataFindings: [] },
    }
  }

  const [existingByItemCode, metadata] = await Promise.all([
    getExistingComponentItems(itemCodes),
    getComponentMetadata(itemCodes),
  ])
  const uomFindings: ReferenceImportFindingDraft[] = []
  const metadataFindings = [...metadata.findings]
  const enrichedByItemCode = new Map<string, {
    itemName: string
    uom: string | null
    technicalMetadata: ReturnType<typeof buildComponentTechnicalMetadata>
  }>()

  const rows = itemCodes.map((itemCode) => {
    const source = sourceByItemCode.get(itemCode)
    if (!source) throw new Error(`Falta la linea fuente para ${itemCode}.`)
    const existing = existingByItemCode.get(itemCode)
    const sapItem = metadata.itemsByCode.get(itemCode) ?? null
    const itemName = sapItem
      ? readSapItemName(sapItem, source.itemName)
      : source.itemName || existing?.itemName || itemCode
    const uom = sapItem
      ? readSapUom(sapItem, source.inventoryUom)
      : source.inventoryUom ?? existing?.uom ?? null
    const technicalMetadata = sapItem
      ? buildComponentTechnicalMetadata(sapItem, itemName)
      : source.technicalMetadata ?? buildComponentTechnicalMetadata({}, itemName)

    enrichedByItemCode.set(itemCode, { itemName, uom, technicalMetadata })

    if (!uom) {
      uomFindings.push(errorFinding({
        key: `component-metadata:uom:${itemCode}`,
        type: 'component_uom_missing',
        severity: 'warning',
        baseItemCode: source.baseItemCode,
        details: { item_code: itemCode, item_name: itemName },
      }))
    }
    if (technicalMetadata.material_kind === 'board' && !technicalMetadata.material_profile) {
      metadataFindings.push(errorFinding({
        key: `component-metadata:profile:${itemCode}`,
        type: 'component_material_profile_unknown',
        severity: 'warning',
        baseItemCode: source.baseItemCode,
        details: { item_code: itemCode, item_name: itemName },
      }))
    }

    return {
      item_code: itemCode,
      base_item_code: source.baseItemCode,
      variant_code_4: source.variantCode4,
      item_name: itemName,
      base_item_name: inferBaseItemName(itemName, source.variantCode4),
      uom,
      component_category: inferComponentCategory(itemCode, itemName),
      default_issue_method: source.issueMethod ?? existing?.defaultIssueMethod ?? null,
      sap_valid: sapItem ? readSapValid(sapItem) : existing?.sapValid ?? null,
      sap_frozen: sapItem ? readSapFrozen(sapItem) : existing?.sapFrozen ?? null,
      is_inventory_item: sapItem ? readSapInventoryItem(sapItem) : existing?.isInventoryItem ?? null,
      item_bom_structure: existing?.itemBomStructure ?? {
        schema_version: 2,
        structure_type: 'component',
        input_warehouse_code: null,
        output_warehouse_code: null,
        lines: [],
      },
      technical_metadata: technicalMetadata,
    }
  })

  const { error } = await supabaseTable('component_items').upsert(rows, { onConflict: 'item_code' })
  if (error) throw new Error(`No se pudieron actualizar component_items: ${error.message}`)

  const enrichedSnapshots = snapshots.map((snapshot) => {
    if (snapshot.status !== 'captured') return snapshot
    const normalizedLines = snapshot.normalizedLines.map((line) => {
      const enriched = enrichedByItemCode.get(line.itemCode)
      return enriched
        ? {
            ...line,
            itemName: enriched.itemName,
            inventoryUom: enriched.uom,
            technicalMetadata: enriched.technicalMetadata,
          }
        : line
    })
    return {
      ...snapshot,
      normalizedLines,
      directBomJson: {
        ...snapshot.directBomJson,
        schema_version: 2,
        lines: normalizedLines.map(line => ({
          visible_order: line.sourceOrder,
          child_num: line.sapChildNum,
          item_code: line.itemCode,
          item_name: line.itemName,
          base_item_code: line.baseItemCode,
          variant_code_4: line.variantCode4,
          occurrence: line.occurrence,
          qty: line.qty,
          warehouse: line.warehouse,
          issue_method: line.issueMethod,
          inventory_uom: line.inventoryUom,
          technical_metadata: line.technicalMetadata,
        })),
      },
    }
  })

  return {
    snapshots: enrichedSnapshots,
    componentResult: {
      count: rows.length,
      uomFindings,
      metadataFindings,
    },
  }
}

async function getReferenceImportSource(referenceId: string): Promise<{
  context: ReferenceImportContext
  skus: ReferenceImportSku[]
}> {
  const referenceRows = await dbQuery(
    `SELECT
      r.id AS reference_id,
       r.family_code,
       r.reference_code,
       r.product_name,
       r.product_bom_structure,
       f.manufacturing_process,
      f.product_type
    FROM public.product_references r
    LEFT JOIN public.families f ON f.family_code = r.family_code
    WHERE r.id = $1
    LIMIT 1`,
    [referenceId]
  )
  const reference = referenceRows[0]
  const resolvedReferenceId = readString(reference?.reference_id)
  const referenceCode = readString(reference?.reference_code)
  const productName = readString(reference?.product_name)
  const existingBomStructure = cleanBomStructure(reference?.product_bom_structure)
  if (!resolvedReferenceId || !referenceCode || !productName) {
    throw new Error('La referencia seleccionada no existe o está incompleta.')
  }

  const skuRows: Record<string, unknown>[] = await dbQuery(
    `SELECT s.sku_complete, s.color_code, s.sap_description_original, s.bom_overrides
     FROM public.product_versions v
     JOIN public.product_skus s ON s.version_id = v.id
     WHERE v.reference_id = $1
       AND v.version_code = $2
       AND COALESCE(s.status, 'ACTIVO') = 'ACTIVO'
     ORDER BY s.sku_complete`,
    [resolvedReferenceId, ANALYZED_VERSION_CODE]
  )

  const skuColorOverrides = new Map(skuRows.flatMap((row) => {
    const skuComplete = readString(row.sku_complete)?.toUpperCase()
    return skuComplete
      ? [[skuComplete, normalizeBomOverrides(row.bom_overrides).color_overrides ?? []] as const]
      : []
  }))

  return {
    context: {
      referenceId: resolvedReferenceId,
      familyCode: readString(reference?.family_code),
      referenceCode,
      productName,
      manufacturingProcess: readString(reference?.manufacturing_process),
      productType: readString(reference?.product_type),
      existingBomStructure: existingBomStructure.lines.length > 0 ? existingBomStructure : null,
      skuColorOverrides,
    },
    skus: skuRows.flatMap((row) => {
      const skuComplete = readString(row.sku_complete)
      if (!skuComplete) return []
      return [{
        skuComplete,
        colorCode: readString(row.color_code),
        sapDescriptionOriginal: readString(row.sap_description_original),
      }]
    }),
  }
}

async function getColorConfigurations(colorCodes: string[]): Promise<Map<string, ColorConfiguration>> {
  const normalizedCodes = [...new Set(colorCodes.map(code => code.trim().toUpperCase()).filter(Boolean))]
  if (normalizedCodes.length === 0) return new Map()

  const rows: Record<string, unknown>[] = await dbQuery(
    `SELECT
      code_4dig,
      COALESCE(color_mode, 'full') AS color_mode,
      application_colors_json,
      application_material_profiles_json,
      allowed_product_types,
      allowed_manufacturing_processes
     FROM public.colors
     WHERE code_4dig IN (${sqlPlaceholders(normalizedCodes.length)})`,
    normalizedCodes
  )

  const configurations = new Map<string, ColorConfiguration>()
  for (const row of rows) {
    const code4dig = readString(row.code_4dig)
    if (!code4dig) continue
    const rawApplicationColors = jsonRecord(row.application_colors_json)
    const applicationColors = Object.fromEntries(
      Object.entries(rawApplicationColors)
        .flatMap(([key, value]) => typeof value === 'string' && value.trim() ? [[key, value.trim().toUpperCase()] as const] : [])
    )
    configurations.set(code4dig, {
      code4dig,
      colorMode: (() => {
        const colorMode = readString(row.color_mode)?.toLowerCase()
        return colorMode === 'dual' || colorMode === 'balance' || colorMode === 'equivalent'
          ? colorMode
          : 'full'
      })(),
      applicationColors,
      hybridColorCases: readHybridColorCases(rawApplicationColors),
      applicationMaterialProfiles: Object.fromEntries(
        Object.entries(jsonRecord(row.application_material_profiles_json))
          .flatMap(([key, value]) => typeof value === 'string' && value.trim()
            ? [[key, value.trim().toUpperCase()] as const]
            : [])
      ),
      allowedProductTypes: readStringArray(row.allowed_product_types),
      allowedManufacturingProcesses: readStringArray(row.allowed_manufacturing_processes),
    })
  }

  return configurations
}

async function createImportRun(input: {
  referenceId: string
  sourceSkuCount: number
  createdBy: string | null
}): Promise<string> {
  const rows = await dbQuery(
    `INSERT INTO public.product_bom_import_runs (
      reference_id,
      analyzed_version_code,
      status,
      source_sku_count,
      summary_json,
      created_by
    ) VALUES ($1, $2, 'draft', $3, $4::jsonb, $5)
    RETURNING id`,
    [
      input.referenceId,
      ANALYZED_VERSION_CODE,
      input.sourceSkuCount,
      JSON.stringify({ phase: 'analyzing' }),
      input.createdBy,
    ]
  )
  const runId = readString(rows[0]?.id)
  if (!runId) throw new Error('No se pudo crear la auditoría de importación.')
  return runId
}

async function persistSnapshots(runId: string, snapshots: DirectBomSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return
  const rows = snapshots.map(snapshot => ({
    run_id: runId,
    sku_complete: snapshot.skuComplete,
    sku_color_code: snapshot.skuColorCode,
    sap_item_name: snapshot.sapItemName,
    tree_type: snapshot.treeType,
    direct_bom_json: snapshot.directBomJson,
    line_count: snapshot.lineCount,
    status: snapshot.status,
    error_message: snapshot.errorMessage,
  }))
  const { error } = await supabaseTable('product_bom_import_sku_snapshots').insert(rows)
  if (error) throw new Error(`No se pudieron guardar snapshots SAP: ${error.message}`)
}

async function persistFindings(runId: string, findings: ReferenceImportFindingDraft[]): Promise<void> {
  const uniqueFindings = [...new Map(findings.map(finding => [finding.findingKey, finding])).values()]
  if (uniqueFindings.length === 0) return
  const rows = uniqueFindings.map(finding => ({
    run_id: runId,
    finding_key: finding.findingKey,
    finding_type: finding.findingType,
    severity: finding.severity,
    status: finding.status,
    line_identity: finding.lineIdentity,
    base_item_code: finding.baseItemCode,
    occurrence: finding.occurrence,
    proposed_scope: finding.proposedScope,
    proposed_color_code: finding.proposedColorCode,
    details_json: finding.detailsJson,
  }))
  const { error } = await supabaseTable('product_bom_import_findings').insert(rows)
  if (error) throw new Error(`No se pudieron guardar hallazgos BOM: ${error.message}`)
}

async function finalizeImportRun(input: {
  runId: string
  status: 'needs_review' | 'failed'
  summaryJson: JsonRecord
  proposedBomStructure: ReferenceBomStructure
}): Promise<void> {
  const { error } = await supabaseTable('product_bom_import_runs')
    .update({
      status: input.status,
      summary_json: input.summaryJson,
      proposed_bom_structure: input.proposedBomStructure,
      completed_at: new Date().toISOString(),
    })
    .eq('id', input.runId)
  if (error) throw new Error(`No se pudo finalizar la auditoría BOM: ${error.message}`)
}

export async function analyzeReferenceBomImport(input: {
  referenceId: string
  createdBy: string | null
}): Promise<ReferenceImportWorkspace> {
  const source = await getReferenceImportSource(input.referenceId)
  if (source.skus.length === 0) {
    throw new Error('Esta referencia no tiene SKU activos de versión 000 para analizar.')
  }

  const runId = await createImportRun({
    referenceId: source.context.referenceId,
    sourceSkuCount: source.skus.length,
    createdBy: input.createdBy,
  })

  try {
    const reconciliation = await reconcileReferenceSkusWithSap(source.context, source.skus)
    const inactiveSapSkuSet = new Set(reconciliation.sapInactiveSkuCodes)
    const confirmedSkus = source.skus.filter(sku => reconciliation.confirmedSkuCodes.has(sku.skuComplete.toUpperCase()))
    const directSnapshots = await readReferenceDirectSnapshots(source.context, confirmedSkus)
    const rawSnapshots = source.skus.map(sku => {
      const normalizedSku = sku.skuComplete.toUpperCase()
      const directSnapshot = directSnapshots.get(normalizedSku)
      if (directSnapshot) return directSnapshot
      if (inactiveSapSkuSet.has(normalizedSku)) {
        return failedDirectSnapshot(
          sku,
          'El código está inactivo en SAP. Confirma su estado en SAP o inactívalo en Supabase para continuar.'
        )
      }
      return failedDirectSnapshot(
        sku,
        'El código está activo en Supabase, pero no fue encontrado en el catálogo SAP de esta referencia.'
      )
    })
    const { snapshots, componentResult } = await enrichDirectComponents(rawSnapshots)
    await persistSnapshots(runId, snapshots)

    const colorCodes = snapshots.flatMap(snapshot => [
      snapshot.skuColorCode,
      ...snapshot.normalizedLines.map(line => line.variantCode4),
    ]).flatMap(code => code && code !== '0000' ? [code] : [])
    const colorConfigurations = await getColorConfigurations(colorCodes)
    const directAnalysis = analyzeReferenceBom({
      context: source.context,
      snapshots,
      colorConfigurations,
    })
    const reconciliationFindings = reconciliation.onlyInSapSkuCodes.map(skuComplete => errorFinding({
      key: `source:sap-extra:${skuComplete}`,
      type: 'sap_reference_sku_not_registered',
      severity: 'blocker',
      details: {
        sku_complete: skuComplete,
        color_code: skuColorCode(skuComplete),
        reason: 'SAP tiene un color activo que no está registrado como SKU activo de la referencia en Supabase.',
      },
    }))
    // The first pass intentionally stops at the reference's direct SAP BOM lines.
    // It does enrich direct components and UOMs, but leaves substructure expansion for a later review.
    const findings = [...new Map([
      ...directAnalysis.findings,
      ...reconciliationFindings,
      ...componentResult.metadataFindings,
      ...componentResult.uomFindings,
    ].map(finding => [finding.findingKey, finding])).values()]
    const blockerCount = findings.filter(finding => finding.severity === 'blocker' && finding.status === 'open').length
    const summaryJson: JsonRecord = {
      ...directAnalysis.summaryJson,
      source_sku_count: source.skus.length,
      sap_active_sku_count: reconciliation.sapActiveSkuCodes.length,
      sap_inactive_sku_count: reconciliation.sapInactiveSkuCodes.length,
      sap_confirmed_sku_count: reconciliation.confirmedSkuCodes.size,
      supabase_only_sku_colors: reconciliation.onlyInSupabaseSkuCodes.map(skuColorCode).filter((color): color is string => color !== null),
      sap_inactive_sku_codes: reconciliation.sapInactiveSkuCodes,
      sap_inactive_sku_colors: reconciliation.sapInactiveSkuCodes.map(skuColorCode).filter((color): color is string => color !== null),
      sap_missing_sku_codes: reconciliation.notFoundInSapSkuCodes,
      sap_missing_sku_colors: reconciliation.notFoundInSapSkuCodes.map(skuColorCode).filter((color): color is string => color !== null),
      sap_only_sku_colors: reconciliation.onlyInSapSkuCodes.map(skuColorCode).filter((color): color is string => color !== null),
      component_item_count: componentResult.count,
      component_tree_count: 0,
      open_blocker_count: blockerCount,
      open_warning_count: findings.filter(finding => finding.severity === 'warning' && finding.status === 'open').length,
      component_tree_max_depth: COMPONENT_TREE_MAX_DEPTH,
      component_tree_max_nodes: COMPONENT_TREE_MAX_NODES,
    }

    await persistFindings(runId, findings)
    await finalizeImportRun({
      runId,
      status: 'needs_review',
      summaryJson,
      proposedBomStructure: directAnalysis.proposedBomStructure,
    })
    revalidatePath('/product-design/bom')
    return getReferenceImportWorkspace(runId)
  } catch (error) {
    const message = getErrorMessage(error)
    await finalizeImportRun({
      runId,
      status: 'failed',
      summaryJson: { phase: 'failed', error: message },
      proposedBomStructure: {
        schema_version: 2,
        structure_type: 'production',
        input_warehouse_code: null,
        output_warehouse_code: null,
        lines: [],
      },
    })
    throw error
  }
}

function parseRun(row: Record<string, unknown>): ReferenceImportRunSummary {
  const id = readString(row.id)
  const referenceId = readString(row.reference_id)
  if (!id || !referenceId) throw new Error('La auditoría BOM no tiene identidad válida.')

  return {
    id,
    referenceId,
    analyzedVersionCode: readString(row.analyzed_version_code) ?? ANALYZED_VERSION_CODE,
    status: asRunStatus(row.status),
    sourceSkuCount: readNumber(row.source_sku_count),
    summaryJson: jsonRecord(row.summary_json),
    proposedBomStructure: cleanBomStructure(row.proposed_bom_structure),
    publishedBomStructure: row.published_bom_structure === null || row.published_bom_structure === undefined
      ? null
      : cleanBomStructure(row.published_bom_structure),
    createdAt: readString(row.created_at) ?? '',
    updatedAt: readString(row.updated_at) ?? '',
    completedAt: readString(row.completed_at),
    publishedAt: readString(row.published_at),
  }
}

function parseFinding(row: Record<string, unknown>): ReferenceImportFinding {
  const id = readString(row.id)
  const runId = readString(row.run_id)
  if (!id || !runId) throw new Error('El hallazgo BOM no tiene identidad válida.')
  const scope = isReferenceProductApplicationScope(row.proposed_scope) ? row.proposed_scope : null

  return {
    id,
    runId,
    findingKey: readString(row.finding_key) ?? id,
    findingType: readString(row.finding_type) ?? 'unknown',
    severity: asFindingSeverity(row.severity),
    status: asFindingStatus(row.status),
    lineIdentity: readString(row.line_identity),
    baseItemCode: readString(row.base_item_code),
    occurrence: row.occurrence === null ? null : readNumber(row.occurrence),
    proposedScope: scope,
    proposedColorCode: readString(row.proposed_color_code),
    detailsJson: jsonRecord(row.details_json),
    decisionJson: jsonRecord(row.decision_json),
    resolvedAt: readString(row.resolved_at),
    createdAt: readString(row.created_at) ?? '',
    updatedAt: readString(row.updated_at) ?? '',
  }
}

function transientSnapshot(snapshot: DirectBomSnapshot, referenceId: string, createdAt: string): ReferenceImportSnapshotSummary {
  return {
    id: `snapshot:${snapshot.skuComplete}`,
    runId: referenceId,
    skuComplete: snapshot.skuComplete,
    skuColorCode: snapshot.skuColorCode,
    sapItemName: snapshot.sapItemName,
    treeType: snapshot.treeType,
    lineCount: snapshot.lineCount,
    status: snapshot.status,
    errorMessage: snapshot.errorMessage,
    capturedAt: createdAt,
    ...(snapshot.status === 'captured' ? {
      transientData: {
        treeCode: snapshot.treeCode,
        directBomJson: snapshot.directBomJson,
      },
    } : {}),
  }
}

function transientFinding(finding: ReferenceImportFindingDraft, referenceId: string, createdAt: string): ReferenceImportFinding {
  return {
    ...finding,
    id: finding.findingKey,
    runId: referenceId,
    decisionJson: {},
    resolvedAt: null,
    createdAt,
    updatedAt: createdAt,
  }
}

function proposalItemNamesFromSnapshots(snapshots: DirectBomSnapshot[]): Record<string, string> {
  const names: Record<string, string> = {}
  for (const snapshot of snapshots) {
    for (const line of snapshot.normalizedLines) {
      if (!names[line.baseItemCode]) names[line.baseItemCode] = inferBaseItemName(line.itemName, line.variantCode4)
    }
  }
  return names
}

async function activeOverridesForReference(referenceId: string): Promise<ReferenceImportActiveOverride[]> {
  const rows: Record<string, unknown>[] = await dbQuery(
    `WITH override_sources AS (
       SELECT 'reference'::text AS level, NULL::text AS sku_complete, reference.bom_overrides
       FROM public.product_references reference WHERE reference.id = $1
       UNION ALL
       SELECT 'global_version'::text, NULL::text, global_rule.bom_overrides
       FROM public.global_version_rules global_rule WHERE global_rule.version_code = $2
       UNION ALL
       SELECT 'version'::text, NULL::text, version.bom_overrides
       FROM public.product_versions version WHERE version.reference_id = $1 AND version.version_code = $2
       UNION ALL
       SELECT 'sku'::text, sku.sku_complete, sku.bom_overrides
       FROM public.product_skus sku
       JOIN public.product_versions version ON version.id = sku.version_id
       WHERE version.reference_id = $1 AND version.version_code = $2
     )
     SELECT source.level, source.sku_complete, override.value AS override_json
     FROM override_sources source
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(source.bom_overrides -> 'color_overrides', '[]'::jsonb)) AS override(value)
     ORDER BY source.level, source.sku_complete, override.value ->> 'created_at'`,
    [referenceId, ANALYZED_VERSION_CODE]
  )
  return rows.flatMap((row) => {
    const override = parseActiveOverride(row)
    return override ? [override] : []
  })
}

export type ReferenceImportAnalysisProgress = {
  stage: 'source' | 'reconciliation' | 'bom_read' | 'component_metadata' | 'comparison' | 'complete'
  message: string
  current: number | null
  total: number | null
}

async function reportReferenceImportAnalysisProgress(
  onProgress: ((progress: ReferenceImportAnalysisProgress) => void | Promise<void>) | undefined,
  progress: ReferenceImportAnalysisProgress
): Promise<void> {
  if (!onProgress) return
  try {
    await onProgress(progress)
  } catch {
    // A disconnected progress client must not interrupt the SAP analysis.
  }
}

export async function analyzeReferenceBomImportTransient(input: {
  referenceId: string
  retry?: TransientReferenceImportRetry
  onProgress?: (progress: ReferenceImportAnalysisProgress) => void | Promise<void>
}): Promise<ReferenceImportWorkspace> {
  await reportReferenceImportAnalysisProgress(input.onProgress, {
    stage: 'source', message: 'Preparando los SKU activos de versión 000.', current: null, total: null,
  })
  const source = await getReferenceImportSource(input.referenceId)
  if (source.skus.length === 0) throw new Error('Esta referencia no tiene SKU activos de versión 000 para analizar.')
  const retrySkuCodes = new Set(
    (input.retry?.skuCompletes ?? [])
      .map(skuComplete => skuComplete.trim().toUpperCase())
      .filter(Boolean)
  )
  const isSelectiveRetry = retrySkuCodes.size > 0
  const cachedSnapshots = isSelectiveRetry
    ? cachedDirectSnapshots(input.retry?.cachedSnapshots ?? [], source.skus)
    : new Map<string, DirectBomSnapshot>()

  await reportReferenceImportAnalysisProgress(input.onProgress, {
    stage: 'reconciliation', message: 'Comparando el catálogo de la referencia con SAP.', current: 0, total: source.skus.length,
  })
  const reconciliation = await reconcileReferenceSkusWithSap(source.context, source.skus)
  await reportReferenceImportAnalysisProgress(input.onProgress, {
    stage: 'reconciliation', message: 'Catálogo comparado con SAP.', current: source.skus.length, total: source.skus.length,
  })
  const inactiveSapSkuSet = new Set(reconciliation.sapInactiveSkuCodes)
  const confirmedSkus = source.skus.filter(sku => reconciliation.confirmedSkuCodes.has(sku.skuComplete.toUpperCase()))
  const skusToRead = isSelectiveRetry
    ? confirmedSkus.filter(sku => retrySkuCodes.has(sku.skuComplete.toUpperCase()) && !cachedSnapshots.has(sku.skuComplete.toUpperCase()))
    : confirmedSkus
  const reusedSnapshotCount = isSelectiveRetry
    ? confirmedSkus.filter(sku => cachedSnapshots.has(sku.skuComplete.toUpperCase())).length
    : 0
  await reportReferenceImportAnalysisProgress(input.onProgress, {
    stage: 'bom_read',
    message: isSelectiveRetry
      ? `Reintentando solo ${skusToRead.length} LdM pendiente(s); ${reusedSnapshotCount} ya leída(s) se reutilizan.`
      : 'Leyendo las LdM activas en SAP.',
    current: 0,
    total: skusToRead.length,
  })
  const directSnapshots = await readReferenceDirectSnapshots(source.context, skusToRead, {
    preferIndividualReads: isSelectiveRetry,
  })
  await reportReferenceImportAnalysisProgress(input.onProgress, {
    stage: 'bom_read',
    message: isSelectiveRetry
      ? 'Reintento de LdM pendiente terminado.'
      : 'LdM activas leídas desde SAP.',
    current: skusToRead.length,
    total: skusToRead.length,
  })
  const rawSnapshots = source.skus.map(sku => {
    const normalizedSku = sku.skuComplete.toUpperCase()
    const snapshot = directSnapshots.get(normalizedSku) ?? cachedSnapshots.get(normalizedSku)
    if (snapshot) return snapshot
    return failedDirectSnapshot(
      sku,
      inactiveSapSkuSet.has(normalizedSku)
        ? 'El código está inactivo en SAP. Confirma su estado o inactívalo en la app para continuar.'
        : 'El código está activo en la app, pero no fue encontrado en SAP para esta referencia.'
    )
  })
  const snapshotsToEnrich = isSelectiveRetry
    ? rawSnapshots.filter(snapshot => !cachedSnapshots.has(snapshot.skuComplete.toUpperCase()))
    : rawSnapshots
  const metadataSkuCount = snapshotsToEnrich.filter(snapshot => snapshot.status === 'captured').length
  await reportReferenceImportAnalysisProgress(input.onProgress, {
    stage: 'component_metadata',
    message: isSelectiveRetry
      ? 'Actualizando la metadata técnica de las LdM reintentadas.'
      : 'Actualizando la metadata técnica de los componentes leídos.',
    current: 0,
    total: metadataSkuCount,
  })
  const { snapshots: enrichedSnapshots, componentResult } = await enrichDirectComponents(snapshotsToEnrich)
  const enrichedSnapshotsBySku = new Map(enrichedSnapshots.map(snapshot => [snapshot.skuComplete.toUpperCase(), snapshot]))
  const snapshots = rawSnapshots.map(snapshot => enrichedSnapshotsBySku.get(snapshot.skuComplete.toUpperCase()) ?? snapshot)
  await reportReferenceImportAnalysisProgress(input.onProgress, {
    stage: 'component_metadata',
    message: isSelectiveRetry
      ? 'Metadata de las LdM reintentadas actualizada.'
      : 'Metadata técnica de componentes actualizada.',
    current: metadataSkuCount,
    total: metadataSkuCount,
  })
  const colorCodes = snapshots.flatMap(snapshot => [
    snapshot.skuColorCode,
    ...snapshot.normalizedLines.map(line => line.variantCode4),
  ]).flatMap(code => code && code !== '0000' ? [code] : [])
  const colorConfigurations = await getColorConfigurations(colorCodes)
  await reportReferenceImportAnalysisProgress(input.onProgress, {
    stage: 'comparison', message: 'Comparando colores, materiales y consumos.', current: confirmedSkus.length, total: confirmedSkus.length,
  })
  const directAnalysis = analyzeReferenceBom({ context: source.context, snapshots, colorConfigurations })
  const reconciliationFindings = reconciliation.onlyInSapSkuCodes.map(skuComplete => errorFinding({
    key: `source:sap-extra:${skuComplete}`,
    type: 'sap_reference_sku_not_registered',
    severity: 'blocker',
    details: {
      sku_complete: skuComplete,
      color_code: skuColorCode(skuComplete),
      reason: 'SAP tiene un color activo que no está registrado como SKU activo de esta referencia en la app.',
    },
  }))
  const findings = [...new Map([
    ...directAnalysis.findings,
    ...reconciliationFindings,
    ...componentResult.metadataFindings,
    ...componentResult.uomFindings,
  ].map(finding => [finding.findingKey, finding])).values()]
  const blockerCount = findings.filter(finding => finding.severity === 'blocker' && finding.status === 'open').length
  const summaryJson: JsonRecord = {
    ...directAnalysis.summaryJson,
    source_sku_count: source.skus.length,
    sap_active_sku_count: reconciliation.sapActiveSkuCodes.length,
    sap_inactive_sku_count: reconciliation.sapInactiveSkuCodes.length,
    sap_confirmed_sku_count: reconciliation.confirmedSkuCodes.size,
    supabase_only_sku_colors: reconciliation.onlyInSupabaseSkuCodes.map(skuColorCode).filter((color): color is string => color !== null),
    sap_inactive_sku_codes: reconciliation.sapInactiveSkuCodes,
    sap_inactive_sku_colors: reconciliation.sapInactiveSkuCodes.map(skuColorCode).filter((color): color is string => color !== null),
    sap_missing_sku_codes: reconciliation.notFoundInSapSkuCodes,
    sap_missing_sku_colors: reconciliation.notFoundInSapSkuCodes.map(skuColorCode).filter((color): color is string => color !== null),
    sap_only_sku_colors: reconciliation.onlyInSapSkuCodes.map(skuColorCode).filter((color): color is string => color !== null),
    component_item_count: componentResult.count,
    component_tree_count: 0,
    open_blocker_count: blockerCount,
    open_warning_count: findings.filter(finding => finding.severity === 'warning' && finding.status === 'open').length,
  }
  const createdAt = new Date().toISOString()
  const workspace: ReferenceImportWorkspace = {
    run: {
      id: source.context.referenceId,
      referenceId: source.context.referenceId,
      analyzedVersionCode: ANALYZED_VERSION_CODE,
      status: 'needs_review',
      sourceSkuCount: source.skus.length,
      summaryJson,
      proposedBomStructure: directAnalysis.proposedBomStructure,
      publishedBomStructure: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: createdAt,
      publishedAt: null,
    },
    findings: findings.map(finding => transientFinding(finding, source.context.referenceId, createdAt)),
    snapshots: snapshots.map(snapshot => transientSnapshot(snapshot, source.context.referenceId, createdAt)),
    proposalItemNames: proposalItemNamesFromSnapshots(snapshots),
    activeOverrides: await activeOverridesForReference(source.context.referenceId),
  }
  await reportReferenceImportAnalysisProgress(input.onProgress, {
    stage: 'complete',
    message: isSelectiveRetry ? 'Reintento selectivo de LdM terminado.' : 'Análisis SAP terminado.',
    current: skusToRead.length,
    total: skusToRead.length,
  })
  return workspace
}

function parseSnapshot(row: Record<string, unknown>): ReferenceImportSnapshotSummary {
  const id = readString(row.id)
  const runId = readString(row.run_id)
  const skuComplete = readString(row.sku_complete)
  if (!id || !runId || !skuComplete) throw new Error('El snapshot BOM no tiene identidad válida.')

  return {
    id,
    runId,
    skuComplete,
    skuColorCode: readString(row.sku_color_code),
    sapItemName: readString(row.sap_item_name),
    treeType: readString(row.tree_type),
    lineCount: readNumber(row.line_count),
    status: asSnapshotStatus(row.status),
    errorMessage: readString(row.error_message),
    capturedAt: readString(row.captured_at) ?? '',
  }
}

function parseActiveOverride(row: Record<string, unknown>): ReferenceImportActiveOverride | null {
  const level = readString(row.level)
  if (level !== 'reference' && level !== 'global_version' && level !== 'version' && level !== 'sku') return null
  const override = jsonRecord(row.override_json)
  const colorCode = readString(override.color_code)
  const scope = override.product_application_scope
  const reason = readString(override.reason)
  if (!colorCode || !reason || !isReferenceProductApplicationScope(scope)) return null
  return {
    level,
    skuComplete: readString(row.sku_complete),
    colorCode,
    productApplicationScope: scope,
    baseItemCode: readString(override.base_item_code),
    targetColorCode: readString(override.target_color_code),
    materialProfile: readString(override.material_profile),
    reason,
    createdAt: readString(override.created_at),
  }
}

async function getProposalItemNames(runId: string, lines: ReferenceBomLine[]): Promise<Record<string, string>> {
  const baseItemCodes = [...new Set(lines.flatMap(line => [
    ...(line.base_item_code ? [line.base_item_code] : []),
    ...line.alternatives.map(alternative => alternative.base_item_code),
  ]))]
  if (baseItemCodes.length === 0) return {}

  const rows: Record<string, unknown>[] = await dbQuery(
    `SELECT
      lines.line ->> 'base_item_code' AS base_item_code,
      lines.line ->> 'item_name' AS item_name,
      lines.line ->> 'variant_code_4' AS variant_code_4
     FROM public.product_bom_import_sku_snapshots snapshot
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(snapshot.direct_bom_json -> 'lines', '[]'::jsonb)) AS lines(line)
     WHERE snapshot.run_id = $1
       AND lines.line ->> 'base_item_code' IN (${sqlPlaceholders(baseItemCodes.length, 2)})`,
    [runId, ...baseItemCodes]
  )

  const result: Record<string, string> = {}
  for (const row of rows) {
    const baseItemCode = readString(row.base_item_code)
    const itemName = readString(row.item_name)
    const variantCode4 = readString(row.variant_code_4)
    if (!baseItemCode || !itemName || !variantCode4 || result[baseItemCode]) continue
    result[baseItemCode] = inferBaseItemName(itemName, variantCode4)
  }

  return result
}

export async function getReferenceImportWorkspace(runId: string): Promise<ReferenceImportWorkspace> {
  const [runRows, findingRows, snapshotRows, overrideRows] = await Promise.all([
    dbQuery(
      `SELECT
        id,
        reference_id,
        analyzed_version_code,
        status,
        source_sku_count,
        summary_json,
        proposed_bom_structure,
        published_bom_structure,
        created_at,
        updated_at,
        completed_at,
        published_at
      FROM public.product_bom_import_runs
      WHERE id = $1
      LIMIT 1`,
      [runId]
    ),
    dbQuery(
      `SELECT *
       FROM public.product_bom_import_findings
       WHERE run_id = $1
       ORDER BY
         CASE severity WHEN 'blocker' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         created_at,
         finding_key`,
      [runId]
    ),
    dbQuery(
      `SELECT *
       FROM public.product_bom_import_sku_snapshots
       WHERE run_id = $1
       ORDER BY sku_complete`,
      [runId]
    ),
    dbQuery(
      `WITH run_scope AS (
         SELECT reference_id, analyzed_version_code
         FROM public.product_bom_import_runs
         WHERE id = $1
         LIMIT 1
       ), override_sources AS (
         SELECT 'reference'::text AS level, NULL::text AS sku_complete, reference.bom_overrides
         FROM public.product_references reference
         JOIN run_scope ON run_scope.reference_id = reference.id
         UNION ALL
         SELECT 'global_version'::text, NULL::text, global_rule.bom_overrides
         FROM public.global_version_rules global_rule
         JOIN run_scope ON global_rule.version_code = run_scope.analyzed_version_code
         UNION ALL
         SELECT 'version'::text, NULL::text, version.bom_overrides
         FROM public.product_versions version
         JOIN run_scope ON version.reference_id = run_scope.reference_id
           AND version.version_code = run_scope.analyzed_version_code
         UNION ALL
         SELECT 'sku'::text, sku.sku_complete, sku.bom_overrides
         FROM public.product_skus sku
         JOIN public.product_versions version ON version.id = sku.version_id
         JOIN run_scope ON version.reference_id = run_scope.reference_id
           AND version.version_code = run_scope.analyzed_version_code
       )
       SELECT source.level, source.sku_complete, override.value AS override_json
       FROM override_sources source
       CROSS JOIN LATERAL jsonb_array_elements(
         COALESCE(source.bom_overrides -> 'color_overrides', '[]'::jsonb)
       ) AS override(value)
       ORDER BY source.level, source.sku_complete, override.value ->> 'created_at'`,
      [runId]
    ),
  ])
  const runRow = runRows[0]
  if (!runRow) throw new Error('No existe la auditoría BOM seleccionada.')
  const run = parseRun(runRow)
  const proposalItemNames = await getProposalItemNames(runId, run.proposedBomStructure.lines)

  return {
    run,
    findings: findingRows.map(parseFinding),
    snapshots: snapshotRows.map(parseSnapshot),
    proposalItemNames,
    activeOverrides: overrideRows.flatMap(parseActiveOverride),
  }
}

export async function listReferenceImportCandidates(search = ''): Promise<ReferenceImportCandidate[]> {
  const normalizedSearch = search.trim()
  const salesReferenceCode = `concat_ws(
    '-',
    CASE
      WHEN r.family_code LIKE 'V%' THEN r.family_code
      ELSE 'V' || r.family_code
    END,
    r.reference_code
  )`
  const searchClause = normalizedSearch
    ? `WHERE ${salesReferenceCode} ILIKE $1
       OR r.product_name ILIKE $1`
    : ''
  const rows: Record<string, unknown>[] = await dbQuery(
    `SELECT
      r.id AS reference_id,
      r.family_code,
      r.reference_code,
      r.product_name,
      f.manufacturing_process,
      f.product_type,
      COUNT(s.id) FILTER (
        WHERE v.version_code = '000'
          AND COALESCE(s.status, 'ACTIVO') = 'ACTIVO'
      ) AS active_sku_count
    FROM public.product_references r
    LEFT JOIN public.families f ON f.family_code = r.family_code
    LEFT JOIN public.product_versions v ON v.reference_id = r.id
    LEFT JOIN public.product_skus s ON s.version_id = v.id
    ${searchClause}
    GROUP BY
      r.id,
      r.family_code,
      r.reference_code,
      r.product_name,
      f.manufacturing_process,
      f.product_type
    HAVING COUNT(s.id) FILTER (
      WHERE v.version_code = '000'
        AND COALESCE(s.status, 'ACTIVO') = 'ACTIVO'
    ) > 0
    ORDER BY r.family_code, r.reference_code
    LIMIT 100`,
    normalizedSearch ? [`%${normalizedSearch}%`] : []
  )

  return rows.flatMap((row) => {
    const referenceId = readString(row.reference_id)
    const referenceCode = readString(row.reference_code)
    const productName = readString(row.product_name)
    if (!referenceId || !referenceCode || !productName) return []
    return [{
      referenceId,
      familyCode: readString(row.family_code),
      referenceCode,
      productName,
      manufacturingProcess: readString(row.manufacturing_process),
      productType: readString(row.product_type),
      activeSkuCount: readNumber(row.active_sku_count),
      lastRunStatus: null,
      lastRunCreatedAt: null,
    }]
  })
}

export function colorRuleConfirmationText(input: {
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  targetColorCode: string
}): string {
  return `CONFIRMAR REGLA ${input.sourceColorCode} ${input.scope} ${input.targetColorCode}`
}

export type ColorRuleMatrixSelection = {
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  targetColorCode: string
  findingIds: string[]
}

export type ColorRuleCoverageMismatch = {
  skuComplete: string
  skuItemName: string | null
  baseItemCode: string
  itemCode: string | null
  itemName: string | null
  observedColorCode: string | null
  reason: 'missing_component' | 'unexpected_color'
  semanticScope?: ReferenceProductApplicationScope | null
}

export type EdgeDualCandidate = {
  structureColorCode: string
  frontColorCode: string
  evidenceSkuComplete: string
  structureQty: number
  frontQty: number
  evidenceSkuCount: number
  cases: Array<{
    skuComplete: string
    skuItemName: string | null
    structureQty: number
    frontQty: number
    edgeLines: Array<{
      itemCode: string
      itemName: string | null
      colorCode: string
      qty: number | null
    }>
  }>
}

export type ColorRuleCoverageResult = {
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  targetColorCode: string
  baseItemCodes: string[]
  catalogSkuCount: number
  excludedInactiveSapSkuCount: number
  excludedKitSkuCount: number
  acceptedMissingComponentCount: number
  checkedSkuCount: number
  matchingSkuCount: number
  sapReadErrors: Array<{ skuComplete: string; message: string }>
  mismatches: ColorRuleCoverageMismatch[]
  dualCandidates: EdgeDualCandidate[]
}

type CatalogColorSku = Omit<ReferenceImportSku, 'colorCode'> & {
  colorCode: string
  prefix: string
  referenceBomStructure: ReferenceBomStructure
  skuColorOverrides: BomColorOverride[]
}

type CatalogSapSkuStatus = {
  status: 'active' | 'inactive' | 'not_found'
  itemName: string | null
}

type CatalogSapBom = {
  treeType: string | null
  lines: Array<{ itemCode: string; itemName: string | null; qty: number | null }>
}

type EdgeColorTotal = {
  colorCode: string
  qty: number
}

function edgeBandLines(bom: CatalogSapBom): Array<{
  itemCode: string
  itemName: string | null
  colorCode: string
  qty: number | null
}> {
  return bom.lines.flatMap(line => {
    const parsed = parseSapItemCode(line.itemCode)
    const isEdgeBand = line.itemName?.toUpperCase().includes('CANTO') === true
    return (!isEdgeBand || parsed.variantCode4 === '0000')
      ? []
      : [{ itemCode: parsed.itemCode, itemName: line.itemName, colorCode: parsed.variantCode4, qty: line.qty }]
  })
}

function edgeColorTotals(bom: CatalogSapBom): EdgeColorTotal[] {
  const totals = new Map<string, number>()
  for (const line of edgeBandLines(bom)) {
    totals.set(line.colorCode, (totals.get(line.colorCode) ?? 0) + (line.qty ?? 0))
  }
  return [...totals.entries()]
    .map(([colorCode, qty]) => ({ colorCode, qty }))
    .sort((left, right) => right.qty - left.qty || left.colorCode.localeCompare(right.colorCode))
}

function hasPendingSemanticEdgeOverride(
  sku: CatalogColorSku,
  structure: EdgeColorTotal,
  front: EdgeColorTotal
): boolean {
  const sourceColorCode = sku.colorCode.trim().toUpperCase()
  const targetForScope = (scope: 'edge_band_body' | 'edge_band_front'): string | null => sku.skuColorOverrides
    .filter(override =>
      override.color_code.trim().toUpperCase() === sourceColorCode
      && override.product_application_scope === scope
      && !override.base_item_code
      && Boolean(override.target_color_code)
    )
    .at(-1)
    ?.target_color_code?.trim().toUpperCase() ?? null
  return targetForScope('edge_band_body') === structure.colorCode
    && targetForScope('edge_band_front') === front.colorCode
}

function detectedEdgeDualCandidates(input: {
  ruleSkus: CatalogColorSku[]
  sapBoms: Map<string, { bom: CatalogSapBom | null; error: string | null }>
  sapSkuStatuses: Map<string, CatalogSapSkuStatus>
}): EdgeDualCandidate[] {
  const candidates = new Map<string, EdgeDualCandidate>()
  for (const sku of input.ruleSkus) {
    const bom = input.sapBoms.get(sku.skuComplete)?.bom
    if (!bom || isSalesKitTree(bom.treeType)) continue
    const totals = edgeColorTotals(bom)
    if (totals.length !== 2 || totals[0]?.qty === totals[1]?.qty) continue
    const structure = totals[0]
    const front = totals[1]
    if (!structure || !front) continue
    if (hasPendingSemanticEdgeOverride(sku, structure, front)) continue
    const key = `${structure.colorCode}:${front.colorCode}`
    const candidateCase = {
      skuComplete: sku.skuComplete,
      skuItemName: input.sapSkuStatuses.get(sku.skuComplete)?.itemName ?? sku.sapDescriptionOriginal,
      structureQty: structure.qty,
      frontQty: front.qty,
      edgeLines: edgeBandLines(bom),
    }
    const current = candidates.get(key)
    candidates.set(key, current
      ? { ...current, evidenceSkuCount: current.evidenceSkuCount + 1, cases: [...current.cases, candidateCase] }
      : {
        structureColorCode: structure.colorCode,
        frontColorCode: front.colorCode,
        evidenceSkuComplete: sku.skuComplete,
        structureQty: structure.qty,
        frontQty: front.qty,
        evidenceSkuCount: 1,
        cases: [candidateCase],
      })
  }
  return [...candidates.values()]
    .map(candidate => ({ ...candidate, cases: candidate.cases.sort((left, right) => left.skuComplete.localeCompare(right.skuComplete)) }))
    .sort((left, right) => right.evidenceSkuCount - left.evidenceSkuCount
      || left.structureColorCode.localeCompare(right.structureColorCode)
      || left.frontColorCode.localeCompare(right.frontColorCode))
}

const COLOR_COVERAGE_PREFIX_BATCH_SIZE = 8
const COLOR_COVERAGE_ITEM_STATUS_BATCH_SIZE = 40
const COLOR_COVERAGE_ITEM_STATUS_CONCURRENCY = 3

type CatalogSapProgressReporter = (completedSkuCount: number) => void | Promise<void>

async function reportCatalogSapProgress(
  onProgress: CatalogSapProgressReporter | undefined,
  completedSkuCount: number
): Promise<void> {
  if (!onProgress) return
  try {
    await onProgress(completedSkuCount)
  } catch {
    // A disconnected progress client must not interrupt a read-only SAP verification.
  }
}

function catalogPrefixFromSku(skuComplete: string): string | null {
  const parts = skuComplete.trim().toUpperCase().split('-')
  return parts.length >= 4 && parts[0] && parts[1] && parts[2]
    ? `${parts[0]}-${parts[1]}-${parts[2]}-`
    : null
}

function catalogSapBomFromTree(tree: SapEntityPayload): CatalogSapBom | null {
  const rawLines = tree.ProductTreeLines
  if (!Array.isArray(rawLines)) return null
  return {
    treeType: readString(tree.TreeType),
    lines: rawLines.flatMap((value) => {
      const line = isRecord(value) ? value : {}
      const itemCode = readString(line.ItemCode)
      return itemCode ? [{ itemCode, itemName: readString(line.ItemName), qty: readNumber(line.Quantity) }] : []
    }),
  }
}

async function readReferenceDirectSnapshots(
  context: ReferenceImportContext,
  skus: ReferenceImportSku[],
  options?: { preferIndividualReads?: boolean }
): Promise<Map<string, DirectBomSnapshot>> {
  const snapshots = new Map<string, DirectBomSnapshot>()
  if (skus.length === 0) return snapshots

  if (!options?.preferIndividualReads) {
    try {
    const trees = await withTimeout(
      getSapProductTreesByPrefixes([salesSkuPrefix(context)], {
        select: ['TreeCode', 'TreeType', 'ProductDescription', 'Quantity'],
        expand: ['ProductTreeLines($select=ItemCode,ItemName,Quantity,Price,Currency,IssueMethod,InventoryUOM,ChildNum,ParentItem,Warehouse,Comment)'],
        top: 200,
        timeoutMs: DIRECT_BOM_TIMEOUT_MS,
      }),
      DIRECT_BOM_TIMEOUT_MS,
      `SAP tardÃ³ demasiado consultando las LdM de ${salesSkuPrefix(context)}.`
    )
    const treesByCode = new Map(trees.flatMap(tree => {
      const bom = sapBomFromProductTree(tree)
      return bom ? [[bom.treeCode.toUpperCase(), bom] as const] : []
    }))
    for (const sku of skus) {
      const bom = treesByCode.get(sku.skuComplete.toUpperCase())
      if (bom) snapshots.set(sku.skuComplete.toUpperCase(), directSnapshotFromBom(sku, bom))
    }
    } catch {
      // The individual fallback below keeps the import diagnosable if a collection query is rejected by SAP.
    }
  }

  const missingSkus = skus.filter(sku => !snapshots.has(sku.skuComplete.toUpperCase()))
  const fallbackSnapshots = await mapWithConcurrency(missingSkus, DIRECT_BOM_CONCURRENCY, readDirectSnapshot)
  for (const snapshot of fallbackSnapshots) snapshots.set(snapshot.skuComplete.toUpperCase(), snapshot)
  return snapshots
}

function catalogSapBomFromDirectBom(bom: SapBom): CatalogSapBom {
  return {
    treeType: bom.treeType,
    lines: bom.lines.map(line => ({ itemCode: line.ItemCode, itemName: line.ItemName?.trim() || null, qty: readNumber(line.Quantity) })),
  }
}

function isSalesKitTree(treeType: string | null): boolean {
  return treeType?.trim() === 'iSalesTree'
}

async function getCatalogColorSkus(colorCodes: string[]): Promise<CatalogColorSku[]> {
  const normalizedColors = [...new Set(colorCodes.map(color => color.trim().toUpperCase()).filter(Boolean))]
  if (normalizedColors.length === 0) return []
  const rows: Record<string, unknown>[] = await dbQuery(
    `SELECT s.sku_complete, s.color_code, s.sap_description_original,
            s.bom_overrides AS sku_bom_overrides,
            r.product_bom_structure
     FROM public.product_skus s
     JOIN public.product_versions v ON v.id = s.version_id
     JOIN public.product_references r ON r.id = v.reference_id
     LEFT JOIN public.families f ON f.family_code = r.family_code
     WHERE s.sku_complete LIKE 'V%'
       AND COALESCE(s.status, 'ACTIVO') = 'ACTIVO'
       AND v.version_code = '000'
       AND upper(trim(s.color_code)) IN (${sqlPlaceholders(normalizedColors.length)})
       AND upper(COALESCE(f.product_type, '')) NOT LIKE 'KIT%'
     ORDER BY s.sku_complete`,
    normalizedColors
  )
  return rows.flatMap(row => {
    const skuComplete = readString(row.sku_complete)
    const colorCode = readString(row.color_code)?.toUpperCase()
    const prefix = skuComplete ? catalogPrefixFromSku(skuComplete) : null
      return skuComplete && colorCode && prefix ? [{
        skuComplete,
        colorCode,
        sapDescriptionOriginal: readString(row.sap_description_original),
        prefix,
        referenceBomStructure: cleanBomStructure(row.product_bom_structure),
        skuColorOverrides: normalizeBomOverrides(row.sku_bom_overrides).color_overrides ?? [],
      }] : []
  })
}

async function getCatalogSapSkuStatuses(
  skus: CatalogColorSku[],
  onProgress?: CatalogSapProgressReporter
): Promise<Map<string, CatalogSapSkuStatus>> {
  const statuses = new Map<string, CatalogSapSkuStatus>()
  const batches = Array.from(
    { length: Math.ceil(skus.length / COLOR_COVERAGE_ITEM_STATUS_BATCH_SIZE) },
    (_, index) => skus.slice(index * COLOR_COVERAGE_ITEM_STATUS_BATCH_SIZE, (index + 1) * COLOR_COVERAGE_ITEM_STATUS_BATCH_SIZE)
  )
  let completedSkuCount = 0
  const batchStatuses = await mapWithConcurrency(batches, COLOR_COVERAGE_ITEM_STATUS_CONCURRENCY, async batch => {
    const items = await getSapItemsByCodes(batch.map(sku => sku.skuComplete), ['ItemCode', 'ItemName', 'Valid', 'Frozen'], { timeoutMs: 60_000 })
    const entries = batch.map((sku) => {
      const item = items.get(sku.skuComplete)
      const status: CatalogSapSkuStatus = item
        ? {
          status: readSapValid(item) !== false && readSapFrozen(item) !== true ? 'active' : 'inactive',
          itemName: readString(item.ItemName),
        }
        : { status: 'not_found', itemName: null }
      return [sku.skuComplete, status] as const
    })
    completedSkuCount += batch.length
    await reportCatalogSapProgress(onProgress, completedSkuCount)
    return entries
  })
  for (const entries of batchStatuses) {
    for (const [skuComplete, status] of entries) statuses.set(skuComplete, status)
  }
  return statuses
}

async function readCatalogSapBoms(
  skus: CatalogColorSku[],
  onProgress?: CatalogSapProgressReporter
): Promise<Map<string, { bom: CatalogSapBom | null; error: string | null }>> {
  const results = new Map<string, { bom: CatalogSapBom | null; error: string | null }>()
  const byPrefix = new Map<string, CatalogColorSku[]>()
  for (const sku of skus) {
    const group = byPrefix.get(sku.prefix) ?? []
    group.push(sku)
    byPrefix.set(sku.prefix, group)
  }
  const groups = [...byPrefix.values()]
  let completedSkuCount = 0
  for (let index = 0; index < groups.length; index += COLOR_COVERAGE_PREFIX_BATCH_SIZE) {
    const batch = groups.slice(index, index + COLOR_COVERAGE_PREFIX_BATCH_SIZE)
    const batchSkus = batch.flat()
    try {
      const trees = await getSapProductTreesByPrefixes(batch.map(group => group[0]?.prefix ?? ''), {
        select: ['TreeCode', 'TreeType', 'ProductDescription'],
        expand: ['ProductTreeLines($select=ItemCode,ItemName,Quantity,IssueMethod,ChildNum,Warehouse,InventoryUOM)'],
        top: 200,
        timeoutMs: 60_000,
      })
      const treesByCode = new Map(trees.flatMap(tree => {
        const treeCode = readString(tree.TreeCode)
        const bom = catalogSapBomFromTree(tree)
        return treeCode && bom ? [[treeCode, bom] as const] : []
      }))
      const missing = batchSkus.filter(sku => !treesByCode.has(sku.skuComplete))
      for (const sku of batchSkus) {
        const bom = treesByCode.get(sku.skuComplete)
        if (bom) results.set(sku.skuComplete, { bom, error: null })
      }
      const fallback = await mapWithConcurrency(missing, DIRECT_BOM_CONCURRENCY, async sku => {
        try {
          const bom = await getSapItemBom(sku.skuComplete)
          return { skuComplete: sku.skuComplete, bom: bom ? catalogSapBomFromDirectBom(bom) : null, error: bom ? null : 'SAP no devolvió la LdM.' }
        } catch (error) {
          return { skuComplete: sku.skuComplete, bom: null, error: getErrorMessage(error) }
        }
      })
      for (const item of fallback) results.set(item.skuComplete, { bom: item.bom, error: item.error })
    } catch (error) {
      const fallback = await mapWithConcurrency(batchSkus, DIRECT_BOM_CONCURRENCY, async sku => {
        try {
          const bom = await getSapItemBom(sku.skuComplete)
          return { skuComplete: sku.skuComplete, bom: bom ? catalogSapBomFromDirectBom(bom) : null, error: bom ? null : 'SAP no devolvió la LdM.' }
        } catch (fallbackError) {
          return { skuComplete: sku.skuComplete, bom: null, error: `${getErrorMessage(error)}; ${getErrorMessage(fallbackError)}` }
        }
      })
      for (const item of fallback) results.set(item.skuComplete, { bom: item.bom, error: item.error })
    } finally {
      completedSkuCount += batchSkus.length
      await reportCatalogSapProgress(onProgress, completedSkuCount)
    }
  }
  return results
}

export function colorRuleMatrixConfirmationText(ruleCount: number): string {
  return `CONFIRMAR MATRIZ DE COLOR ${ruleCount} REGLAS`
}

export async function confirmReferenceImportColorRulesMatrix(input: {
  runId: string
  actorId: string | null
  confirmationText: string
  selections: ColorRuleMatrixSelection[]
}): Promise<number> {
  const selections = input.selections.filter(selection => selection.findingIds.length > 0)
  const expectedConfirmation = colorRuleMatrixConfirmationText(selections.length)
  if (selections.length === 0 || input.confirmationText.trim() !== expectedConfirmation) {
    throw new Error(`Confirmación inválida. Escribe exactamente: ${expectedConfirmation}`)
  }

  let acceptedFindingCount = 0
  for (const selection of selections) {
    const sourceColorCode = selection.sourceColorCode.trim().toUpperCase()
    const targetColorCode = selection.targetColorCode.trim().toUpperCase()
    if (!sourceColorCode || !targetColorCode || !isReferenceProductApplicationScope(selection.scope)) {
      throw new Error('Una regla de la matriz está incompleta o tiene un alcance inválido.')
    }
    const findingRows: Record<string, unknown>[] = await dbQuery(
      `SELECT id, finding_type, status, proposed_scope, proposed_color_code, details_json
       FROM public.product_bom_import_findings
       WHERE run_id = $1
         AND id IN (SELECT value::uuid FROM jsonb_array_elements_text($2::jsonb))`,
      [input.runId, JSON.stringify(selection.findingIds)]
    )
    if (findingRows.length !== selection.findingIds.length) {
      throw new Error('Una regla de la matriz ya no pertenece a esta corrida.')
    }
    const allMatchSelection = findingRows.every((finding) =>
      readString(finding.finding_type) === 'color_rule_proposal'
      && readString(finding.status) === 'open'
      && finding.proposed_scope === selection.scope
      && readString(finding.proposed_color_code) === targetColorCode
      && readString(jsonRecord(finding.details_json).source_color_code) === sourceColorCode
    )
    if (!allMatchSelection) throw new Error('La matriz cambió desde que fue cargada. Vuelve a revisar la referencia.')

    const updatedColor = await dbQuery(
      `UPDATE public.colors
       SET application_colors_json = jsonb_set(
         COALESCE(application_colors_json, '{}'::jsonb),
         ARRAY[$1]::text[],
         to_jsonb($2::text),
         true
       )
       WHERE code_4dig = $3
       RETURNING code_4dig`,
      [selection.scope, targetColorCode, sourceColorCode]
    )
    if (!readString(updatedColor[0]?.code_4dig)) throw new Error(`No existe el color ${sourceColorCode} para guardar la regla.`)

    const updatedFindings = await dbQuery(
      `UPDATE public.product_bom_import_findings finding
       SET status = 'accepted',
           decision_json = jsonb_build_object(
             'decision', 'accepted_global_color_rule_matrix',
             'source_color_code', $1,
             'scope', $2,
             'target_color_code', $3,
             'confirmation_text', $4
           ),
           resolved_by = $5,
           resolved_at = now()
       WHERE finding.run_id = $6
         AND finding.finding_type = 'color_rule_proposal'
         AND finding.status = 'open'
         AND finding.proposed_scope = $2
         AND finding.proposed_color_code = $3
         AND finding.details_json ->> 'source_color_code' = $1
       RETURNING finding.id`,
      [sourceColorCode, selection.scope, targetColorCode, expectedConfirmation, input.actorId, input.runId]
    )
    acceptedFindingCount += updatedFindings.length
  }
  revalidatePath('/configuration/colors')
  revalidatePath('/product-design/bom')
  return acceptedFindingCount
}

export async function verifyReferenceImportColorRulesMatrix(input: {
  runId: string
  selections: ColorRuleMatrixSelection[]
}): Promise<ColorRuleCoverageResult[]> {
  const selections = input.selections.filter(selection => selection.findingIds.length > 0)
  if (selections.length === 0) throw new Error('Selecciona al menos una regla para verificar en SAP.')
  const rules = [] as Array<ColorRuleMatrixSelection & { baseItemCodes: string[]; acceptedMissingSkuKeys: Set<string> }>
  for (const selection of selections) {
    if (!isReferenceProductApplicationScope(selection.scope)) throw new Error('Una regla tiene un alcance inválido.')
    const sourceColorCode = selection.sourceColorCode.trim().toUpperCase()
    const targetColorCode = selection.targetColorCode.trim().toUpperCase()
    const findingRows: Record<string, unknown>[] = await dbQuery(
      `SELECT id, finding_type, status, base_item_code, proposed_scope, proposed_color_code, details_json, decision_json
       FROM public.product_bom_import_findings
       WHERE run_id = $1
         AND id IN (SELECT value::uuid FROM jsonb_array_elements_text($2::jsonb))`,
      [input.runId, JSON.stringify(selection.findingIds)]
    )
    if (findingRows.length !== selection.findingIds.length) throw new Error('Una regla ya no pertenece a esta corrida.')
    const baseItemCodes = findingRows.flatMap(row => {
      const baseItemCode = readString(row.base_item_code)
      const findingSourceColor = readString(jsonRecord(row.details_json).source_color_code)
      const matches = readString(row.finding_type) === 'color_rule_proposal'
        && readString(row.status) === 'open'
        && row.proposed_scope === selection.scope
        && readString(row.proposed_color_code) === targetColorCode
        && findingSourceColor === sourceColorCode
      return matches && baseItemCode ? [baseItemCode] : []
    })
    if (baseItemCodes.length !== findingRows.length) throw new Error('La matriz cambió desde que fue cargada. Vuelve a analizar la referencia.')
    const acceptedMissingSkuKeys = new Set(findingRows.flatMap((row) => {
      const baseItemCode = readString(row.base_item_code)
      const decision = jsonRecord(row.decision_json)
      const accepted = Array.isArray(decision.accepted_missing_skus) ? decision.accepted_missing_skus : []
      return accepted.flatMap((value) => {
        const skuComplete = readString(jsonRecord(value).sku_complete)
        return skuComplete && baseItemCode ? [`${skuComplete.toUpperCase()}:${baseItemCode}`] : []
      })
    }))
    rules.push({
      ...selection,
      sourceColorCode,
      targetColorCode,
      baseItemCodes: [...new Set(baseItemCodes)].sort(),
      acceptedMissingSkuKeys,
    })
  }

  const skuCodes = new Set(rules.map(rule => rule.sourceColorCode))
  const skus = await getCatalogColorSkus([...skuCodes])
  const sapSkuStatuses = await getCatalogSapSkuStatuses(skus)
  const activeSkus = skus.filter(sku => sapSkuStatuses.get(sku.skuComplete)?.status === 'active')
  const sapBoms = await readCatalogSapBoms(activeSkus)

  return rules.map(rule => {
    const catalogRuleSkus = skus.filter(sku => sku.colorCode.trim().toUpperCase() === rule.sourceColorCode)
    const ruleSkus = activeSkus.filter(sku => sku.colorCode.trim().toUpperCase() === rule.sourceColorCode)
    const inactiveRuleSkus = catalogRuleSkus.flatMap(sku => {
      const status = sapSkuStatuses.get(sku.skuComplete)
      return status?.status === 'inactive' ? [{ skuComplete: sku.skuComplete, itemName: status.itemName }] : []
    })
    const missingRuleSkus = catalogRuleSkus.filter(sku => sapSkuStatuses.get(sku.skuComplete)?.status === 'not_found')
    const mismatches: ColorRuleCoverageMismatch[] = []
    const sapReadErrors: Array<{ skuComplete: string; message: string }> = missingRuleSkus.map(sku => ({
      skuComplete: sku.skuComplete,
      message: 'SAP no devolviÃ³ el maestro del artÃ­culo.',
    }))
    let excludedKitSkuCount = 0
    let acceptedMissingComponentCount = 0
    let checkedSkuCount = 0
    let matchingSkuCount = 0
    for (const sku of ruleSkus) {
      const result = sapBoms.get(sku.skuComplete)
      const bom = result?.bom ?? null
      if (!bom) {
        sapReadErrors.push({ skuComplete: sku.skuComplete, message: result?.error ?? 'SAP no devolvió la LdM.' })
        continue
      }
      if (isSalesKitTree(bom.treeType)) {
        excludedKitSkuCount += 1
        continue
      }
      checkedSkuCount += 1
      let skuMatchesRule = true
      if (rule.scope === 'edge_band_body' || rule.scope === 'edge_band_front') {
        const edgeColors = edgeColorTotals(bom)
        const observed = rule.scope === 'edge_band_body' ? edgeColors[0] : edgeColors[1]
        if (edgeColors.length !== 2 || !observed || edgeColors[0]?.qty === edgeColors[1]?.qty) {
          mismatches.push({
            skuComplete: sku.skuComplete,
            skuItemName: sapSkuStatuses.get(sku.skuComplete)?.itemName ?? sku.sapDescriptionOriginal,
            baseItemCode: rule.baseItemCodes.join(' + '),
            itemCode: null,
            itemName: null,
            observedColorCode: null,
            reason: 'unexpected_color',
          })
          continue
        }
        if (observed.colorCode !== rule.targetColorCode) {
          mismatches.push({
            skuComplete: sku.skuComplete,
            skuItemName: sapSkuStatuses.get(sku.skuComplete)?.itemName ?? sku.sapDescriptionOriginal,
            baseItemCode: rule.baseItemCodes.join(' + '),
            itemCode: null,
            itemName: null,
            observedColorCode: observed.colorCode,
            reason: 'unexpected_color',
          })
          continue
        }
        matchingSkuCount += 1
        continue
      }
      for (const baseItemCode of rule.baseItemCodes) {
        const matchingLines = bom.lines.filter(line => parseSapItemCode(line.itemCode).baseItemCode === baseItemCode)
        if (matchingLines.length === 0) {
          if (rule.acceptedMissingSkuKeys.has(`${sku.skuComplete}:${baseItemCode}`)) {
            acceptedMissingComponentCount += 1
          } else {
            mismatches.push({
              skuComplete: sku.skuComplete,
              skuItemName: sapSkuStatuses.get(sku.skuComplete)?.itemName ?? sku.sapDescriptionOriginal,
              baseItemCode,
              itemCode: null,
              itemName: null,
              observedColorCode: null,
              reason: 'missing_component',
            })
            skuMatchesRule = false
          }
          continue
        }
        for (const line of matchingLines) {
          const parsed = parseSapItemCode(line.itemCode)
          if (parsed.variantCode4 === rule.targetColorCode) continue
          mismatches.push({
            skuComplete: sku.skuComplete,
            skuItemName: sapSkuStatuses.get(sku.skuComplete)?.itemName ?? sku.sapDescriptionOriginal,
            baseItemCode,
            itemCode: parsed.itemCode,
            itemName: line.itemName,
            observedColorCode: parsed.variantCode4,
            reason: 'unexpected_color',
          })
          skuMatchesRule = false
        }
      }
      if (skuMatchesRule) matchingSkuCount += 1
    }
    return {
      sourceColorCode: rule.sourceColorCode,
      scope: rule.scope,
      targetColorCode: rule.targetColorCode,
      baseItemCodes: rule.baseItemCodes,
      catalogSkuCount: catalogRuleSkus.length,
      excludedInactiveSapSkuCount: inactiveRuleSkus.length,
      excludedKitSkuCount,
      acceptedMissingComponentCount,
      checkedSkuCount,
      matchingSkuCount,
      sapReadErrors,
      mismatches,
      dualCandidates: [],
    }
  })
}

export type DirectColorRuleMatrixSelection = {
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  targetColorCode: string
  baseItemCodes: string[]
  materialKinds?: Array<'board' | 'edge_band' | 'other'>
}

function isCatalogEdgeBandLine(line: CatalogSapBom['lines'][number]): boolean {
  return line.itemName?.toUpperCase().includes('CANTO') === true
}

function isCatalogBoardLine(line: CatalogSapBom['lines'][number]): boolean {
  return line.itemName?.toUpperCase().includes('TABLERO') === true
}

function pendingCatalogEdgeScope(input: {
  sku: CatalogColorSku
  sourceColorCode: string
  line: CatalogSapBom['lines'][number]
}): ReferenceProductApplicationScope | null {
  if (!isCatalogEdgeBandLine(input.line)) return null
  const parsed = parseSapItemCode(input.line.itemCode)
  const observedScopes = new Set<ReferenceProductApplicationScope>()
  for (const override of input.sku.skuColorOverrides) {
    const scope = override.product_application_scope
    const targetColorCode = override.target_color_code?.trim().toUpperCase()
    if (
      (scope !== 'edge_band_body' && scope !== 'edge_band_front')
      || override.color_code.trim().toUpperCase() !== input.sourceColorCode
      || (override.base_item_code && override.base_item_code !== parsed.baseItemCode)
      || targetColorCode !== parsed.variantCode4
    ) continue
    observedScopes.add(scope)
  }
  return observedScopes.size === 1 ? [...observedScopes][0] ?? null : null
}

function catalogLineSemanticScope(input: {
  sku: CatalogColorSku
  bom: CatalogSapBom
  line: CatalogSapBom['lines'][number]
  sourceColorCode?: string
}): ReferenceProductApplicationScope | null {
  const baseItemCode = parseSapItemCode(input.line.itemCode).baseItemCode
  let occurrence = 0
  for (const candidate of input.bom.lines) {
    if (parseSapItemCode(candidate.itemCode).baseItemCode !== baseItemCode) continue
    occurrence += 1
    if (candidate !== input.line) continue
    const persistedLine = input.sku.referenceBomStructure.lines
      .filter(referenceLine => referenceLine.line_kind === 'fixed' && referenceLine.base_item_code === baseItemCode)[occurrence - 1]
    if (persistedLine?.product_application_scope) return persistedLine.product_application_scope
    break
  }
  const materialGroup = input.sku.referenceBomStructure.lines.find(referenceLine =>
    referenceLine.line_kind === 'material_group'
    && referenceLine.alternatives.some(alternative => alternative.base_item_code === baseItemCode)
  )
  if (materialGroup?.product_application_scope) return materialGroup.product_application_scope
  return input.sourceColorCode
    ? pendingCatalogEdgeScope({ sku: input.sku, sourceColorCode: input.sourceColorCode, line: input.line })
    : null
}

function skuOverrideTargetForCatalogLine(input: {
  sku: CatalogColorSku
  sourceColorCode: string
  baseItemCode: string
  semanticScope: ReferenceProductApplicationScope | null
}): string | null {
  if (!input.semanticScope) return null
  const override = input.sku.skuColorOverrides
    .filter(candidate =>
      candidate.color_code.trim().toUpperCase() === input.sourceColorCode
      && candidate.product_application_scope === input.semanticScope
      && (!candidate.base_item_code || candidate.base_item_code === input.baseItemCode)
    )
    .at(-1)
  return override?.target_color_code?.trim().toUpperCase() ?? null
}

function catalogLinesForSemanticRule(input: {
  rule: DirectColorRuleMatrixSelection
  bom: CatalogSapBom
}): CatalogSapBom['lines'] {
  const materialKinds = new Set(input.rule.materialKinds ?? [])
  if (input.rule.scope.startsWith('edge_band_') || materialKinds.has('edge_band')) {
    return input.bom.lines.filter(line => isCatalogEdgeBandLine(line) && parseSapItemCode(line.itemCode).variantCode4 !== '0000')
  }
  if (materialKinds.has('board')) {
    return input.bom.lines.filter(line => isCatalogBoardLine(line) && parseSapItemCode(line.itemCode).variantCode4 !== '0000')
  }
  const baseItemCodes = new Set(input.rule.baseItemCodes)
  return input.bom.lines.filter(line => baseItemCodes.has(parseSapItemCode(line.itemCode).baseItemCode))
}

function ruleUsesSemanticLineComparison(rule: DirectColorRuleMatrixSelection): boolean {
  return rule.scope.startsWith('edge_band_') || (rule.materialKinds ?? []).some(kind => kind === 'board' || kind === 'edge_band')
}

export type ColorMatrixVerificationProgress = {
  stage: 'catalog' | 'item_status' | 'bom_read' | 'comparison' | 'complete'
  message: string
  current: number | null
  total: number | null
}

async function reportColorMatrixVerificationProgress(
  onProgress: ((progress: ColorMatrixVerificationProgress) => void | Promise<void>) | undefined,
  progress: ColorMatrixVerificationProgress
): Promise<void> {
  if (!onProgress) return
  try {
    await onProgress(progress)
  } catch {
    // A disconnected progress client must not interrupt a read-only SAP verification.
  }
}

export async function verifyReferenceImportColorRulesMatrixDirect(input: {
  selections: DirectColorRuleMatrixSelection[]
  onProgress?: (progress: ColorMatrixVerificationProgress) => void | Promise<void>
}): Promise<ColorRuleCoverageResult[]> {
  const rules = input.selections.flatMap((selection) => {
    const sourceColorCode = selection.sourceColorCode.trim().toUpperCase()
    const targetColorCode = selection.targetColorCode.trim().toUpperCase()
    const baseItemCodes = [...new Set(selection.baseItemCodes.map(code => code.trim().toUpperCase()).filter(Boolean))].sort()
    const materialKinds = [...new Set((selection.materialKinds ?? []).filter(kind => kind === 'board' || kind === 'edge_band' || kind === 'other'))]
    return sourceColorCode && targetColorCode && baseItemCodes.length > 0 && isReferenceProductApplicationScope(selection.scope)
      ? [{ ...selection, sourceColorCode, targetColorCode, baseItemCodes, materialKinds, acceptedMissingSkuKeys: new Set<string>() }]
      : []
  })
  if (rules.length === 0) throw new Error('Selecciona al menos una regla completa para verificar en SAP.')

  await reportColorMatrixVerificationProgress(input.onProgress, {
    stage: 'catalog', message: 'Buscando los SKU de venta que aplican a las reglas seleccionadas.', current: null, total: null,
  })
  const colorCodes = [...new Set(rules.map(rule => rule.sourceColorCode))]
  const skus = await getCatalogColorSkus(colorCodes)
  await reportColorMatrixVerificationProgress(input.onProgress, {
    stage: 'item_status', message: 'Comprobando cuáles SKU están activos en SAP.', current: 0, total: skus.length,
  })
  const sapSkuStatuses = await getCatalogSapSkuStatuses(skus, completedSkuCount => reportColorMatrixVerificationProgress(input.onProgress, {
    stage: 'item_status', message: 'Comprobando estados en SAP.', current: completedSkuCount, total: skus.length,
  }))
  const activeSkus = skus.filter(sku => sapSkuStatuses.get(sku.skuComplete)?.status === 'active')
  await reportColorMatrixVerificationProgress(input.onProgress, {
    stage: 'bom_read', message: 'Leyendo las LdM activas en SAP para comparar los cantos.', current: 0, total: activeSkus.length,
  })
  const sapBoms = await readCatalogSapBoms(activeSkus, completedSkuCount => reportColorMatrixVerificationProgress(input.onProgress, {
    stage: 'bom_read', message: 'Leyendo las LdM activas en SAP.', current: completedSkuCount, total: activeSkus.length,
  }))

  await reportColorMatrixVerificationProgress(input.onProgress, {
    stage: 'comparison', message: 'Comparando colores internos y ausencias contra las reglas seleccionadas.', current: activeSkus.length, total: activeSkus.length,
  })
  const results = rules.map(rule => {
    const catalogRuleSkus = skus.filter(sku => sku.colorCode === rule.sourceColorCode)
    const ruleSkus = activeSkus.filter(sku => sku.colorCode === rule.sourceColorCode)
    const inactiveRuleSkus = catalogRuleSkus.filter(sku => sapSkuStatuses.get(sku.skuComplete)?.status === 'inactive')
    const missingRuleSkus = catalogRuleSkus.filter(sku => sapSkuStatuses.get(sku.skuComplete)?.status === 'not_found')
    const mismatches: ColorRuleCoverageMismatch[] = []
    const sapReadErrors = missingRuleSkus.map(sku => ({ skuComplete: sku.skuComplete, message: 'No existe en SAP: el maestro del artículo no devolvió este código.' }))
    let excludedKitSkuCount = 0
    let checkedSkuCount = 0
    let matchingSkuCount = 0
    for (const sku of ruleSkus) {
      const result = sapBoms.get(sku.skuComplete)
      const bom = result?.bom ?? null
      if (!bom) {
        sapReadErrors.push({ skuComplete: sku.skuComplete, message: result?.error ?? 'SAP no devolvió la LdM.' })
        continue
      }
      if (isSalesKitTree(bom.treeType)) {
        excludedKitSkuCount += 1
        continue
      }
      checkedSkuCount += 1
      let skuMatchesRule = true
      if (ruleUsesSemanticLineComparison(rule)) {
        const semanticLines = catalogLinesForSemanticRule({ rule, bom })
        const applicableLines = rule.scope === 'edge_band_body' || rule.scope === 'edge_band_front'
          ? semanticLines.filter(line => catalogLineSemanticScope({ sku, bom, line, sourceColorCode: rule.sourceColorCode }) === rule.scope)
          : semanticLines
        for (const line of applicableLines) {
          const parsed = parseSapItemCode(line.itemCode)
          const semanticScope = catalogLineSemanticScope({ sku, bom, line, sourceColorCode: rule.sourceColorCode })
          const targetColorCode = skuOverrideTargetForCatalogLine({
            sku,
            sourceColorCode: rule.sourceColorCode,
            baseItemCode: parsed.baseItemCode,
            semanticScope,
          }) ?? rule.targetColorCode
          if (parsed.variantCode4 === targetColorCode) continue
          mismatches.push({
            skuComplete: sku.skuComplete,
            skuItemName: sapSkuStatuses.get(sku.skuComplete)?.itemName ?? sku.sapDescriptionOriginal,
            baseItemCode: parsed.baseItemCode,
            itemCode: parsed.itemCode,
            itemName: line.itemName,
            observedColorCode: parsed.variantCode4,
            reason: 'unexpected_color',
            semanticScope,
          })
          skuMatchesRule = false
        }
        if (skuMatchesRule) matchingSkuCount += 1
        continue
      }
      for (const baseItemCode of rule.baseItemCodes) {
        const matchingLines = bom.lines.filter(line => parseSapItemCode(line.itemCode).baseItemCode === baseItemCode)
        if (matchingLines.length === 0) {
          mismatches.push({ skuComplete: sku.skuComplete, skuItemName: sapSkuStatuses.get(sku.skuComplete)?.itemName ?? sku.sapDescriptionOriginal, baseItemCode, itemCode: null, itemName: null, observedColorCode: null, reason: 'missing_component' })
          skuMatchesRule = false
          continue
        }
        for (const line of matchingLines) {
          const parsed = parseSapItemCode(line.itemCode)
          if (parsed.variantCode4 === rule.targetColorCode) continue
          mismatches.push({ skuComplete: sku.skuComplete, skuItemName: sapSkuStatuses.get(sku.skuComplete)?.itemName ?? sku.sapDescriptionOriginal, baseItemCode, itemCode: parsed.itemCode, itemName: line.itemName, observedColorCode: parsed.variantCode4, reason: 'unexpected_color' })
          skuMatchesRule = false
        }
      }
      if (skuMatchesRule) matchingSkuCount += 1
    }
    return {
      sourceColorCode: rule.sourceColorCode,
      scope: rule.scope,
      targetColorCode: rule.targetColorCode,
      baseItemCodes: rule.baseItemCodes,
      catalogSkuCount: catalogRuleSkus.length,
      excludedInactiveSapSkuCount: inactiveRuleSkus.length,
      excludedKitSkuCount,
      acceptedMissingComponentCount: 0,
      checkedSkuCount,
      matchingSkuCount,
      sapReadErrors,
      mismatches,
      dualCandidates: rule.scope === 'edge_band_full_product'
        ? detectedEdgeDualCandidates({ ruleSkus, sapBoms, sapSkuStatuses })
        : [],
    }
  })
  await reportColorMatrixVerificationProgress(input.onProgress, {
    stage: 'complete', message: 'Verificación de la matriz terminada.', current: activeSkus.length, total: activeSkus.length,
  })
  return results
}

export async function acceptReferenceImportColorRuleAbsence(input: {
  runId: string
  actorId: string | null
  skuComplete: string
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  baseItemCode: string
}): Promise<void> {
  const skuComplete = input.skuComplete.trim().toUpperCase()
  const sourceColorCode = input.sourceColorCode.trim().toUpperCase()
  const baseItemCode = input.baseItemCode.trim().toUpperCase()
  if (!skuComplete || !sourceColorCode || !baseItemCode || !isReferenceProductApplicationScope(input.scope)) {
    throw new Error('La ausencia a aceptar no tiene SKU, color, pieza o alcance vÃ¡lido.')
  }

  const findingRows: Record<string, unknown>[] = await dbQuery(
    `SELECT id
     FROM public.product_bom_import_findings
     WHERE run_id = $1
       AND finding_type = 'color_rule_proposal'
       AND base_item_code = $2
       AND proposed_scope = $3
       AND details_json ->> 'source_color_code' = $4
     LIMIT 1`,
    [input.runId, baseItemCode, input.scope, sourceColorCode]
  )
  if (!readString(findingRows[0]?.id)) throw new Error('La pieza no pertenece a una regla abierta de esta matriz.')

  const sapBom = await getSapItemBom(skuComplete)
  if (!sapBom) throw new Error(`SAP no devolviÃ³ la LdM de ${skuComplete}; no se puede aceptar la ausencia.`)
  const isPresent = sapBom.lines.some(line => parseSapItemCode(line.ItemCode).baseItemCode === baseItemCode)
  if (isPresent) throw new Error(`SAP sÃ­ incluye ${baseItemCode} en ${skuComplete}; vuelve a verificar la matriz.`)

  const operation = JSON.stringify({
    operation_type: 'remove_line',
    target_base_item_code: baseItemCode,
    target_product_application_scope: input.scope,
    reason: `SAP no incluye ${baseItemCode} en este SKU; ausencia validada desde la matriz de color.`,
    source: 'reference_import_color_matrix_absence',
    actor_id: input.actorId,
    created_at: new Date().toISOString(),
  })
  const updatedRows: Record<string, unknown>[] = await dbQuery(
    `UPDATE public.product_skus sku
     SET bom_overrides = jsonb_set(
       jsonb_set(COALESCE(sku.bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
       '{operations}',
       COALESCE(sku.bom_overrides -> 'operations', '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object('operation_id', gen_random_uuid()) || $1::jsonb),
       true
     ),
     updated_at = now()
     WHERE sku.sku_complete = $2
       AND upper(trim(COALESCE(sku.color_code, ''))) = $3
       AND NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(sku.bom_overrides -> 'operations', '[]'::jsonb)) existing(operation)
         WHERE existing.operation ->> 'operation_type' = 'remove_line'
           AND existing.operation ->> 'source' = 'reference_import_color_matrix_absence'
           AND existing.operation ->> 'target_base_item_code' = $4
           AND existing.operation ->> 'target_product_application_scope' = $5
       )
     RETURNING sku.id`,
    [operation, skuComplete, sourceColorCode, baseItemCode, input.scope]
  )
  if (!readString(updatedRows[0]?.id)) {
    const existingRows: Record<string, unknown>[] = await dbQuery(
      `SELECT sku.id
       FROM public.product_skus sku
       WHERE sku.sku_complete = $1
         AND upper(trim(COALESCE(sku.color_code, ''))) = $2
       LIMIT 1`,
      [skuComplete, sourceColorCode]
    )
    if (!readString(existingRows[0]?.id)) throw new Error('El SKU no existe en la app o no corresponde al color seleccionado.')
  }
  revalidatePath('/product-design/bom')
}

export async function acceptReferenceImportColorRuleAbsences(input: {
  runId: string
  actorId: string | null
  confirmationText: string
  items: Array<{ skuComplete: string; sourceColorCode: string; scope: ReferenceProductApplicationScope; baseItemCode: string }>
}): Promise<number> {
  const items = input.items.map(item => ({
    skuComplete: item.skuComplete.trim().toUpperCase(),
    sourceColorCode: item.sourceColorCode.trim().toUpperCase(),
    scope: item.scope,
    baseItemCode: item.baseItemCode.trim().toUpperCase(),
  }))
  const expectedConfirmation = `VALIDAR ${items.length} AUSENCIAS EN MATRIZ`
  if (items.length === 0 || input.confirmationText.trim() !== expectedConfirmation) {
    throw new Error(`Confirmación inválida. Escribe exactamente: ${expectedConfirmation}`)
  }

  for (const item of items) {
    if (!item.skuComplete || !item.sourceColorCode || !item.baseItemCode || !isReferenceProductApplicationScope(item.scope)) {
      throw new Error('Una ausencia seleccionada no tiene SKU, color, pieza o alcance válido.')
    }
    const sapBom = await getSapItemBom(item.skuComplete)
    if (!sapBom) throw new Error(`SAP no devolvió la LdM de ${item.skuComplete}.`)
    if (sapBom.lines.some(line => parseSapItemCode(line.ItemCode).baseItemCode === item.baseItemCode)) {
      throw new Error(`SAP sí incluye ${item.baseItemCode} en ${item.skuComplete}; vuelve a verificar la matriz.`)
    }
    const evidence = JSON.stringify({
      sku_complete: item.skuComplete,
      base_item_code: item.baseItemCode,
      accepted_by: input.actorId,
      accepted_at: new Date().toISOString(),
    })
    await dbQuery(
      `UPDATE public.product_bom_import_findings finding
       SET decision_json = jsonb_set(
         COALESCE(finding.decision_json, '{}'::jsonb),
         '{accepted_missing_skus}',
         COALESCE(finding.decision_json -> 'accepted_missing_skus', '[]'::jsonb)
           || jsonb_build_array($1::jsonb),
         true
       )
       WHERE finding.run_id = $2
         AND finding.finding_type = 'color_rule_proposal'
         AND finding.status = 'open'
         AND finding.base_item_code = $3
         AND finding.proposed_scope = $4
         AND finding.details_json ->> 'source_color_code' = $5
         AND NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(finding.decision_json -> 'accepted_missing_skus', '[]'::jsonb)) existing(value)
           WHERE existing.value ->> 'sku_complete' = $6
         )`,
      [evidence, input.runId, item.baseItemCode, item.scope, item.sourceColorCode, item.skuComplete]
    )
  }
  revalidatePath('/product-design/bom')
  return items.length
}

export function materialGroupConfirmationText(baseItemCodes: string[]): string {
  return `CONFIRMAR GRUPO ${[...new Set(baseItemCodes)].sort().join(' + ')}`
}

export function materialProfileConfirmationText(input: {
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  materialProfile: string
}): string {
  return `CONFIRMAR PERFIL ${input.sourceColorCode} ${input.scope} ${input.materialProfile}`
}

export async function confirmReferenceImportColorRule(input: {
  runId: string
  findingId: string
  actorId: string | null
  confirmationText: string
}): Promise<void> {
  const findingRows = await dbQuery(
    `SELECT id, run_id, finding_type, status, proposed_scope, proposed_color_code, details_json
     FROM public.product_bom_import_findings
     WHERE id = $1 AND run_id = $2
     LIMIT 1`,
    [input.findingId, input.runId]
  )
  const finding = findingRows[0]
  if (!finding) throw new Error('No existe la propuesta de regla de color.')
  if (readString(finding.finding_type) !== 'color_rule_proposal' || readString(finding.status) !== 'open') {
    throw new Error('Este hallazgo no admite una confirmación de regla global.')
  }

  const scopeValue = finding.proposed_scope
  if (!isReferenceProductApplicationScope(scopeValue)) throw new Error('El scope propuesto no es válido.')
  const targetColorCode = readString(finding.proposed_color_code)
  const sourceColorCode = readString(jsonRecord(finding.details_json).source_color_code)
  if (!sourceColorCode || !targetColorCode) throw new Error('La propuesta de color está incompleta.')

  const expectedConfirmation = colorRuleConfirmationText({
    sourceColorCode,
    scope: scopeValue,
    targetColorCode,
  })
  if (input.confirmationText.trim() !== expectedConfirmation) {
    throw new Error(`Confirmación inválida. Escribe exactamente: ${expectedConfirmation}`)
  }

  const rows = await dbQuery(
    `WITH updated_color AS (
      UPDATE public.colors
      SET application_colors_json = jsonb_set(
        COALESCE(application_colors_json, '{}'::jsonb),
        ARRAY[$1]::text[],
        to_jsonb($2::text),
        true
      )
      WHERE code_4dig = $3
      RETURNING code_4dig
    )
    UPDATE public.product_bom_import_findings finding
    SET
      status = 'accepted',
      decision_json = jsonb_build_object(
        'decision', 'accepted_global_color_rule',
        'source_color_code', $3,
        'scope', $1,
        'target_color_code', $2
      ),
      resolved_by = $4,
      resolved_at = now()
    FROM updated_color
    WHERE finding.id = $5
      AND finding.run_id = $6
    RETURNING finding.id`,
    [scopeValue, targetColorCode, sourceColorCode, input.actorId, input.findingId, input.runId]
  )
  if (!readString(rows[0]?.id)) {
    throw new Error('No se pudo guardar la regla global de color.')
  }
  revalidatePath('/product-design/bom')
}

export async function confirmReferenceImportMaterialGroup(input: {
  runId: string
  findingId: string
  actorId: string | null
  confirmationText: string
}): Promise<void> {
  const rows = await dbQuery(
    `SELECT id, finding_type, status, details_json
     FROM public.product_bom_import_findings
     WHERE id = $1 AND run_id = $2
     LIMIT 1`,
    [input.findingId, input.runId]
  )
  const finding = rows[0]
  if (!finding || readString(finding.finding_type) !== 'material_group_confirmation' || readString(finding.status) !== 'open') {
    throw new Error('Esta revision de grupo ya no esta disponible.')
  }
  const details = jsonRecord(finding.details_json)
  const alternatives = Array.isArray(details.alternatives)
    ? details.alternatives
    : []
  const baseItemCodes = alternatives.flatMap((alternative) => {
    const code = isRecord(alternative) ? readString(alternative.base_item_code) : null
    return code ? [code] : []
  })
  const expectedConfirmation = materialGroupConfirmationText(baseItemCodes)
  if (input.confirmationText.trim() !== expectedConfirmation) {
    throw new Error(`Confirmacion invalida. Escribe exactamente: ${expectedConfirmation}`)
  }
  const { error } = await supabaseTable('product_bom_import_findings')
    .update({
      status: 'accepted',
      decision_json: {
        decision: 'accepted_material_group',
        base_item_codes: baseItemCodes,
      },
      resolved_by: input.actorId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', input.findingId)
    .eq('run_id', input.runId)
  if (error) throw new Error(`No se pudo confirmar el grupo de materiales: ${error.message}`)
  revalidatePath('/product-design/bom')
}

export async function confirmReferenceImportMaterialProfile(input: {
  runId: string
  findingId: string
  actorId: string | null
  confirmationText: string
}): Promise<void> {
  const rows = await dbQuery(
    `SELECT id, finding_type, status, proposed_scope, proposed_color_code, details_json
     FROM public.product_bom_import_findings
     WHERE id = $1 AND run_id = $2
     LIMIT 1`,
    [input.findingId, input.runId]
  )
  const finding = rows[0]
  if (!finding || readString(finding.finding_type) !== 'material_profile_proposal' || readString(finding.status) !== 'open') {
    throw new Error('Esta propuesta de perfil ya no esta disponible.')
  }
  const scope = finding.proposed_scope
  const sourceColorCode = readString(jsonRecord(finding.details_json).source_color_code)
  const materialProfile = readString(jsonRecord(finding.details_json).material_profile)
  if (!isReferenceProductApplicationScope(scope) || !sourceColorCode || !materialProfile) {
    throw new Error('La propuesta de perfil esta incompleta.')
  }
  const expectedConfirmation = materialProfileConfirmationText({ sourceColorCode, scope, materialProfile })
  if (input.confirmationText.trim() !== expectedConfirmation) {
    throw new Error(`Confirmacion invalida. Escribe exactamente: ${expectedConfirmation}`)
  }
  const updated = await dbQuery(
    `WITH updated_color AS (
       UPDATE public.colors
       SET application_material_profiles_json = jsonb_set(
         COALESCE(application_material_profiles_json, '{}'::jsonb),
         ARRAY[$1]::text[],
         to_jsonb($2::text),
         true
       )
       WHERE code_4dig = $3
       RETURNING code_4dig
     )
     UPDATE public.product_bom_import_findings finding
     SET
       status = 'accepted',
       decision_json = jsonb_build_object(
         'decision', 'accepted_material_profile',
         'source_color_code', $3,
         'scope', $1,
         'material_profile', $2
       ),
       resolved_by = $4,
       resolved_at = now()
     FROM updated_color
     WHERE finding.id = $5 AND finding.run_id = $6
     RETURNING finding.id`,
    [scope, materialProfile, sourceColorCode, input.actorId, input.findingId, input.runId]
  )
  if (!readString(updated[0]?.id)) throw new Error('No se pudo guardar el perfil de material.')
  revalidatePath('/configuration/colors')
  revalidatePath('/product-design/bom')
}

export async function saveReferenceImportManualColorOverride(input: {
  runId: string
  findingId: string
  actorId: string | null
  level: 'reference' | 'version' | 'sku'
  skuComplete: string | null
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  targetColorCode: string | null
  materialProfile: string | null
  baseItemCode: string | null
  reason: string
}): Promise<void> {
  const reason = input.reason.trim()
  if (reason.length < 3) throw new Error('Explica brevemente por que se necesita este override.')
  if (!input.targetColorCode && !input.materialProfile) {
    throw new Error('Define un color de material, un perfil de material o ambos.')
  }
  const findingRows = await dbQuery(
    `SELECT finding.id
     FROM public.product_bom_import_findings finding
     JOIN public.product_bom_import_runs run ON run.id = finding.run_id
     WHERE finding.id = $1 AND finding.run_id = $2
     LIMIT 1`,
    [input.findingId, input.runId]
  )
  if (!readString(findingRows[0]?.id)) throw new Error('La revision no pertenece a esta corrida.')

  const override = {
    color_code: input.sourceColorCode.trim().toUpperCase(),
    product_application_scope: input.scope,
    base_item_code: input.baseItemCode?.trim().toUpperCase() || null,
    target_color_code: input.targetColorCode?.trim().toUpperCase() || null,
    material_profile: input.materialProfile?.trim().toUpperCase() || null,
    reason,
    source: 'reference_import',
    actor_id: input.actorId,
  }
  const serializedOverride = JSON.stringify(override)
  let result: Record<string, unknown>[]
  if (input.level === 'reference') {
    result = await dbQuery(
      `WITH run_scope AS (
         SELECT reference_id FROM public.product_bom_import_runs WHERE id = $1 LIMIT 1
       ), updated AS (
         UPDATE public.product_references reference
         SET bom_overrides = jsonb_set(
           jsonb_set(COALESCE(reference.bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
           '{color_overrides}',
           COALESCE(reference.bom_overrides -> 'color_overrides', '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('override_id', gen_random_uuid()) || $2::jsonb),
           true
         )
         FROM run_scope
         WHERE reference.id = run_scope.reference_id
         RETURNING reference.id
       )
       UPDATE public.product_bom_import_findings
       SET status = 'accepted',
           decision_json = jsonb_build_object('decision', 'manual_supabase_override', 'level', 'reference', 'override', $2::jsonb),
           resolved_by = $3,
           resolved_at = now()
       WHERE id = $4 AND run_id = $1 AND EXISTS (SELECT 1 FROM updated)
       RETURNING id`,
      [input.runId, serializedOverride, input.actorId, input.findingId]
    )
  } else if (input.level === 'version') {
    result = await dbQuery(
      `WITH run_scope AS (
         SELECT reference_id, analyzed_version_code FROM public.product_bom_import_runs WHERE id = $1 LIMIT 1
       ), updated AS (
         UPDATE public.product_versions version
         SET bom_overrides = jsonb_set(
           jsonb_set(COALESCE(version.bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
           '{color_overrides}',
           COALESCE(version.bom_overrides -> 'color_overrides', '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('override_id', gen_random_uuid()) || $2::jsonb),
           true
         )
         FROM run_scope
         WHERE version.reference_id = run_scope.reference_id
           AND version.version_code = run_scope.analyzed_version_code
         RETURNING version.id
       )
       UPDATE public.product_bom_import_findings
       SET status = 'accepted',
           decision_json = jsonb_build_object('decision', 'manual_supabase_override', 'level', 'version', 'override', $2::jsonb),
           resolved_by = $3,
           resolved_at = now()
       WHERE id = $4 AND run_id = $1 AND EXISTS (SELECT 1 FROM updated)
       RETURNING id`,
      [input.runId, serializedOverride, input.actorId, input.findingId]
    )
  } else {
    const skuComplete = input.skuComplete?.trim().toUpperCase()
    if (!skuComplete) throw new Error('Selecciona el SKU al que aplica el override.')
    result = await dbQuery(
      `WITH run_scope AS (
         SELECT reference_id, analyzed_version_code FROM public.product_bom_import_runs WHERE id = $1 LIMIT 1
       ), updated AS (
         UPDATE public.product_skus sku
         SET bom_overrides = jsonb_set(
           jsonb_set(COALESCE(sku.bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
           '{color_overrides}',
           COALESCE(sku.bom_overrides -> 'color_overrides', '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('override_id', gen_random_uuid()) || $2::jsonb),
           true
         )
         FROM public.product_versions version
         JOIN run_scope ON run_scope.reference_id = version.reference_id
         WHERE sku.version_id = version.id
           AND version.version_code = run_scope.analyzed_version_code
           AND sku.sku_complete = $3
         RETURNING sku.id
       )
       UPDATE public.product_bom_import_findings
       SET status = 'accepted',
           decision_json = jsonb_build_object('decision', 'manual_supabase_override', 'level', 'sku', 'override', $2::jsonb),
           resolved_by = $4,
           resolved_at = now()
       WHERE id = $5 AND run_id = $1 AND EXISTS (SELECT 1 FROM updated)
       RETURNING id`,
      [input.runId, serializedOverride, skuComplete, input.actorId, input.findingId]
    )
  }
  if (!readString(result[0]?.id)) throw new Error('No se pudo guardar el override en el alcance seleccionado.')
  revalidatePath('/product-design/bom')
}

type IssueMethodEvidence = {
  skuComplete: string
  childNum: number
  itemCode: string
  expectedIssueMethod: string | null
}

export type IssueMethodApplyResult = {
  dryRun: boolean
  confirmationRequired: string
  results: Array<{
    skuComplete: string
    childNum: number
    itemCode: string
    success: boolean
    changed: boolean
    message: string
  }>
}

function issueMethodConfirmationText(targetIssueMethod: string, changeCount: number): string {
  return `APLICAR METODO ${targetIssueMethod} EN SAP PARA ${changeCount} LINEAS`
}

function readIssueMethodEvidence(details: JsonRecord): IssueMethodEvidence[] {
  const bySku = Array.isArray(details.by_sku) ? details.by_sku : []
  return bySku.flatMap((value) => {
    const row = isRecord(value) ? value : {}
    const skuComplete = readString(row.sku_complete)
    const itemCode = readString(row.item_code)
    const childNum = row.sap_child_num === null ? null : readNumber(row.sap_child_num, Number.NaN)
    if (!skuComplete || !itemCode || childNum === null || !Number.isInteger(childNum)) return []
    return [{
      skuComplete,
      childNum,
      itemCode,
      expectedIssueMethod: readString(row.issue_method),
    }]
  })
}

export async function applyReferenceImportIssueMethod(input: {
  runId: string
  findingId: string
  actorId: string | null
  targetIssueMethod: string
  dryRun: boolean
  confirmationText: string
}): Promise<IssueMethodApplyResult> {
  const targetIssueMethod = input.targetIssueMethod.trim()
  if (targetIssueMethod !== 'im_Manual' && targetIssueMethod !== 'im_Backflush') {
    throw new Error('El metodo de salida debe ser Manual o Notificacion.')
  }
  const findingRows = await dbQuery(
    `SELECT id, status, finding_type, details_json
     FROM public.product_bom_import_findings
     WHERE id = $1 AND run_id = $2
     LIMIT 1`,
    [input.findingId, input.runId]
  )
  const finding = findingRows[0]
  if (!finding || readString(finding.finding_type) !== 'issue_method_review') {
    throw new Error('Esta revision no corresponde a un metodo de salida.')
  }
  if (readString(finding.status) !== 'open') {
    throw new Error('Esta revision ya fue cerrada.')
  }
  const evidence = readIssueMethodEvidence(jsonRecord(finding.details_json))
  if (evidence.length === 0) throw new Error('No hay lineas SAP validas para homologar.')
  const applicable = evidence.filter(item => item.expectedIssueMethod !== targetIssueMethod)
  const confirmationRequired = issueMethodConfirmationText(targetIssueMethod, applicable.length)
  if (!input.dryRun && input.confirmationText.trim() !== confirmationRequired) {
    throw new Error(`Confirmacion invalida. Escribe exactamente: ${confirmationRequired}`)
  }

  const results: IssueMethodApplyResult['results'] = []
  for (const item of applicable) {
    let success = false
    let changed = false
    let message = ''
    let beforePayload: JsonRecord = {}
    let responsePayload: JsonRecord = {}
    try {
      const beforeTree = await getSapItemBom(item.skuComplete)
      if (!beforeTree) throw new Error(`SAP no devolvio ProductTree para ${item.skuComplete}.`)
      const beforeLine = beforeTree.lines.find(line => line.ChildNum === item.childNum && line.ItemCode === item.itemCode)
      if (!beforeLine) throw new Error(`SAP no encontro la linea ${item.childNum}/${item.itemCode} en ${item.skuComplete}.`)
      beforePayload = {
        tree_code: beforeTree.treeCode,
        line_count: beforeTree.lines.length,
        target_before: productTreeLineFingerprint(beforeLine),
      }
      if (beforeLine.IssueMethod === targetIssueMethod) {
        success = true
        message = 'SAP ya tenia el metodo solicitado.'
      } else if (input.dryRun) {
        success = true
        message = `Dry-run listo: ${beforeLine.IssueMethod} cambiaria a ${targetIssueMethod}.`
      } else {
        const response = await updateSapProductTreeIssueMethod({
          treeCode: beforeTree.treeCode,
          childNum: item.childNum,
          itemCode: item.itemCode,
          issueMethod: targetIssueMethod,
        })
        responsePayload = jsonRecord(response)
        const afterTree = await getSapItemBom(item.skuComplete)
        if (!afterTree) throw new Error(`SAP no devolvio ProductTree despues de actualizar ${item.skuComplete}.`)
        if (!productTreeStructureMatches(beforeTree.lines, afterTree.lines, {
          childNum: item.childNum,
          itemCode: item.itemCode,
          issueMethod: targetIssueMethod,
        })) {
          throw new Error('La verificacion posterior detecto un cambio no esperado en la ProductTree.')
        }
        success = true
        changed = true
        message = 'Metodo actualizado y verificado en SAP.'
      }
    } catch (error) {
      message = getErrorMessage(error)
    } finally {
      if (!input.dryRun) {
        await supabaseTable('sap_operation_logs').insert({
          operation_type: 'product_tree_issue_method_update',
          item_code: item.skuComplete,
          requested_status: targetIssueMethod,
          dry_run: false,
          confirmation_text: input.confirmationText,
          sap_payload: {
            ...beforePayload,
            target: {
              child_num: item.childNum,
              item_code: item.itemCode,
              issue_method: targetIssueMethod,
            },
          },
          sap_response: responsePayload,
          success,
          error_message: success ? null : message,
          created_by: input.actorId,
        })
      }
    }
    results.push({
      skuComplete: item.skuComplete,
      childNum: item.childNum,
      itemCode: item.itemCode,
      success,
      changed,
      message,
    })
  }

  if (!input.dryRun && results.length > 0 && results.every(result => result.success)) {
    const { error } = await supabaseTable('product_bom_import_findings')
      .update({
        status: 'resolved',
        decision_json: {
          decision: 'sap_issue_method_homologated',
          target_issue_method: targetIssueMethod,
          results,
        },
        resolved_by: input.actorId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', input.findingId)
      .eq('run_id', input.runId)
    if (error) throw new Error(`SAP se actualizo, pero no se pudo registrar la verificacion: ${error.message}`)
    revalidatePath('/product-design/bom')
  }

  return { dryRun: input.dryRun, confirmationRequired, results }
}

export async function resolveReferenceImportFinding(input: {
  runId: string
  findingId: string
  actorId: string | null
  decisionNote: string
}): Promise<void> {
  const note = input.decisionNote.trim()
  if (note.length < 3) throw new Error('Registra una nota breve de la decisión humana.')

  const { error } = await supabaseTable('product_bom_import_findings')
    .update({
      status: 'resolved',
      decision_json: { decision: 'manual_resolution', note },
      resolved_by: input.actorId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', input.findingId)
    .eq('run_id', input.runId)
  if (error) throw new Error(`No se pudo registrar la decisión: ${error.message}`)
  revalidatePath('/product-design/bom')
}

export async function publishReferenceBomImportRun(input: {
  runId: string
  actorId: string | null
}): Promise<ReferenceImportWorkspace> {
  const workspace = await getReferenceImportWorkspace(input.runId)
  if (workspace.run.status !== 'needs_review') {
    throw new Error('Solo una auditoría en revisión puede publicarse.')
  }
  const unresolvedBlockers = workspace.findings.filter(finding => finding.severity === 'blocker' && finding.status === 'open')
  if (unresolvedBlockers.length > 0) {
    throw new Error(`La publicación está bloqueada por ${unresolvedBlockers.length} hallazgo(s) pendiente(s).`)
  }

  const cleanStructure = cleanBomStructure(workspace.run.proposedBomStructure)
  const rows = await dbQuery(
    `WITH updated_reference AS (
      UPDATE public.product_references
      SET product_bom_structure = $1::jsonb
      WHERE id = $2
      RETURNING id
    )
    UPDATE public.product_bom_import_runs run
    SET
      status = 'published',
      published_bom_structure = $1::jsonb,
      published_by = $3,
      published_at = now()
    FROM updated_reference
    WHERE run.id = $4
      AND run.reference_id = updated_reference.id
    RETURNING run.id`,
    [JSON.stringify(cleanStructure), workspace.run.referenceId, input.actorId, input.runId]
  )
  if (!readString(rows[0]?.id)) throw new Error('No se pudo publicar la BOM de referencia.')

  revalidatePath('/product-design')
  revalidatePath('/product-design/bom')
  revalidatePath('/product-design/route-sheets/cabinets')
  revalidatePath('/productive-modules/route-sheets/cabinets')
  return getReferenceImportWorkspace(input.runId)
}
