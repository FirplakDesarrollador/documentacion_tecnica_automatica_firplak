import 'server-only'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'
import {
  getSapItemBom,
  getSapItemsByCodes,
  getSapItemsByPrefix,
  type BomLine,
  type SapEntityPayload,
} from '@/lib/sap/serviceLayer'
import {
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
} from './referenceImportTypes'

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
  if (!baseItemCode) return null
  const scopeValue = record.product_application_scope
  const scope = isReferenceProductApplicationScope(scopeValue) ? scopeValue : 'NA'
  const lineId = readString(record.line_id) ?? `ln_${String(index + 1).padStart(6, '0')}`

  return {
    line_id: lineId,
    sort_order: readNumber(record.sort_order, index + 1),
    base_item_code: baseItemCode,
    product_application_scope: scope,
    qty: readNumber(record.qty),
    input_warehouse_code: readString(record.input_warehouse_code),
    issue_method_override: readString(record.issue_method_override),
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
    schema_version: 1,
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
      schema_version: 1,
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
    }
  })
}

function buildDirectBomJson(bom: SapBom, normalizedLines: DirectBomSnapshot['normalizedLines']): JsonRecord {
  return {
    schema_version: 1,
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
    })),
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
        directBomJson: { schema_version: 1, source: 'sap_product_trees', lines: [] },
        normalizedLines: [],
      }
    }

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
        schema_version: 1,
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
      item_code: line.itemCode,
      base_item_code: line.baseItemCode,
      variant_code_4: line.variantCode4,
      product_application_scope: 'NA',
      qty: line.qty,
      input_warehouse_code: line.warehouse,
      issue_method_override: line.issueMethod,
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
        item_bom_structure
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
  if (!resolvedReferenceId || !referenceCode || !productName) {
    throw new Error('La referencia seleccionada no existe o está incompleta.')
  }

  const skuRows: Record<string, unknown>[] = await dbQuery(
    `SELECT s.sku_complete, s.color_code, s.sap_description_original
     FROM public.product_versions v
     JOIN public.product_skus s ON s.version_id = v.id
     WHERE v.reference_id = $1
       AND v.version_code = $2
       AND COALESCE(s.status, 'ACTIVO') = 'ACTIVO'
     ORDER BY s.sku_complete`,
    [resolvedReferenceId, ANALYZED_VERSION_CODE]
  )

  return {
    context: {
      referenceId: resolvedReferenceId,
      familyCode: readString(reference?.family_code),
      referenceCode,
      productName,
      manufacturingProcess: readString(reference?.manufacturing_process),
      productType: readString(reference?.product_type),
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
      application_colors_json,
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
    const applicationColors = Object.fromEntries(
      Object.entries(jsonRecord(row.application_colors_json))
        .flatMap(([key, value]) => typeof value === 'string' && value.trim() ? [[key, value.trim().toUpperCase()] as const] : [])
    )
    configurations.set(code4dig, {
      code4dig,
      applicationColors,
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
    const snapshots = await mapWithConcurrency(source.skus, DIRECT_BOM_CONCURRENCY, async sku => {
      const normalizedSku = sku.skuComplete.toUpperCase()
      if (reconciliation.confirmedSkuCodes.has(normalizedSku)) return readDirectSnapshot(sku)
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
    // Substructure expansion is a separate, explicit review after the base BOM is approved.
    const componentResult: ComponentUpsertResult = {
      count: 0,
      uomFindings: [],
      metadataFindings: [],
    }
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
        schema_version: 1,
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

async function getProposalItemNames(runId: string, lines: ReferenceBomLine[]): Promise<Record<string, string>> {
  const baseItemCodes = [...new Set(lines.map(line => line.base_item_code))]
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
  const [runRows, findingRows, snapshotRows] = await Promise.all([
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
      ) AS active_sku_count,
      latest.status AS last_run_status,
      latest.created_at AS last_run_created_at
    FROM public.product_references r
    LEFT JOIN public.families f ON f.family_code = r.family_code
    LEFT JOIN public.product_versions v ON v.reference_id = r.id
    LEFT JOIN public.product_skus s ON s.version_id = v.id
    LEFT JOIN LATERAL (
      SELECT status, created_at
      FROM public.product_bom_import_runs run
      WHERE run.reference_id = r.id
      ORDER BY run.created_at DESC
      LIMIT 1
    ) latest ON true
    ${searchClause}
    GROUP BY
      r.id,
      r.family_code,
      r.reference_code,
      r.product_name,
      f.manufacturing_process,
      f.product_type,
      latest.status,
      latest.created_at
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
      lastRunStatus: readString(row.last_run_status),
      lastRunCreatedAt: readString(row.last_run_created_at),
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
