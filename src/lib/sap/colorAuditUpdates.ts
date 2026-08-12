import 'server-only'

import {
  assertSapWritesEnabled,
  getSapItem,
  getSapItemBom,
  SapServiceLayerError,
  updateSapProductTreeHeaderWarehouse,
  updateSapProductTreeLines,
  updateSapItem,
  type BomLine,
  type SapEntityPayload,
} from './serviceLayer'
import { supabaseTable } from '@/lib/supabaseDynamic'
import { parseColorAuditItemCode } from './colorAudit'
import {
  buildColorAuditUpdateConfirmation,
  normalizeColorAuditUpdateColor,
  normalizeColorAuditUpdateItems,
  normalizeSapAuditUpdateItems,
  type ColorAuditUpdateItem,
  type SapAuditUpdateItem,
  type SapAuditUpdateKind,
} from './colorAuditUpdateRules'

export { buildColorAuditUpdateConfirmation, normalizeColorAuditUpdateColor, normalizeColorAuditUpdateItems, normalizeSapAuditUpdateItems }
export type { ColorAuditUpdateItem, SapAuditUpdateItem, SapAuditUpdateKind }

export type ColorAuditUpdateMode = 'dry-run' | 'apply'

export type ColorAuditUpdateResult = {
  itemCode: string
  expectedColor: string
  beforeColor: string
  afterColor: string | null
  eligible: boolean
  changed: boolean
  skipped: boolean
  stale: boolean
  success: boolean
  message: string
}

export type ColorAuditUpdateBatch = {
  results: ColorAuditUpdateResult[]
  counts: {
    processed: number
    eligible: number
    alreadyCorrect: number
    changed: number
    verified: number
    stale: number
    failed: number
  }
}

const ITEM_SELECT = ['ItemCode', 'U_Color']

function readSapColor(payload: SapEntityPayload): string {
  return normalizeColorAuditUpdateColor(payload.U_Color)
}

function readSapItemCode(payload: SapEntityPayload): string {
  return typeof payload.ItemCode === 'string' ? payload.ItemCode.trim().toUpperCase() : ''
}

function resultFor(item: ColorAuditUpdateItem, overrides: Partial<ColorAuditUpdateResult>): ColorAuditUpdateResult {
  return {
    itemCode: item.itemCode,
    expectedColor: item.expectedColor,
    beforeColor: item.currentColor,
    afterColor: null,
    eligible: false,
    changed: false,
    skipped: false,
    stale: false,
    success: false,
    message: 'Sin procesar.',
    ...overrides,
  }
}

export async function processColorAuditUpdateBatch(input: {
  mode: ColorAuditUpdateMode
  items: ColorAuditUpdateItem[]
}): Promise<ColorAuditUpdateBatch> {
  if (input.mode === 'apply') await assertSapWritesEnabled()

  const results: ColorAuditUpdateResult[] = []
  for (const item of input.items) {
    try {
      const parsed = parseColorAuditItemCode(item.itemCode)
      if (!parsed?.expectedColor || parsed.expectedColor !== item.expectedColor) {
        results.push(resultFor(item, { message: 'El color esperado ya no coincide con el ItemCode.', stale: true }))
        continue
      }

      const before = await getSapItem(item.itemCode, ITEM_SELECT)
      const sapItemCode = readSapItemCode(before)
      const beforeColor = readSapColor(before)

      if (sapItemCode !== item.itemCode) {
        results.push(resultFor(item, { beforeColor, stale: true, message: 'SAP devolvió un ItemCode diferente al solicitado.' }))
        continue
      }

      if (beforeColor === item.expectedColor) {
        results.push(resultFor(item, {
          beforeColor,
          afterColor: beforeColor,
          skipped: true,
          success: true,
          message: 'Ya estaba correcto en SAP; no se escribió.',
        }))
        continue
      }

      if (beforeColor !== item.currentColor) {
        results.push(resultFor(item, {
          beforeColor,
          stale: true,
          message: 'El U_Color cambió desde el informe; se omitió para evitar sobrescribirlo.',
        }))
        continue
      }

      if (input.mode === 'dry-run') {
        results.push(resultFor(item, {
          beforeColor,
          eligible: true,
          success: true,
          message: 'Dry-run listo: se actualizaría y luego se verificaría en SAP.',
        }))
        continue
      }

      await updateSapItem(item.itemCode, { U_Color: item.expectedColor })
      const after = await getSapItem(item.itemCode, ITEM_SELECT)
      const afterColor = readSapColor(after)
      if (readSapItemCode(after) !== item.itemCode || afterColor !== item.expectedColor) {
        results.push(resultFor(item, {
          beforeColor,
          afterColor,
          changed: true,
          message: 'SAP no confirmó el U_Color esperado después de escribir.',
        }))
        continue
      }

      results.push(resultFor(item, {
        beforeColor,
        afterColor,
        eligible: true,
        changed: true,
        success: true,
        message: 'Actualizado y verificado en SAP.',
      }))
    } catch (error: unknown) {
      results.push(resultFor(item, {
        message: error instanceof Error ? error.message : 'No se pudo procesar el SKU en SAP.',
      }))
    }
  }

  return {
    results,
    counts: {
      processed: results.length,
      eligible: results.filter(result => result.eligible).length,
      alreadyCorrect: results.filter(result => result.skipped).length,
      changed: results.filter(result => result.changed).length,
      verified: results.filter(result => result.success && result.changed).length,
      stale: results.filter(result => result.stale).length,
      failed: results.filter(result => !result.success).length,
    },
  }
}

export function colorAuditUpdateErrorStatus(error: unknown): number {
  return error instanceof SapServiceLayerError ? error.statusCode : 502
}

export type SapAuditUpdateResult = {
  auditKind: SapAuditUpdateKind
  itemCode: string
  treeCode: string | null
  childNum: number | null
  expectedValue: string
  decisionSource: SapAuditUpdateItem['decisionSource']
  beforeValue: string
  afterValue: string | null
  eligible: boolean
  changed: boolean
  skipped: boolean
  stale: boolean
  success: boolean
  message: string
}

export type SapAuditUpdateBatch = {
  results: SapAuditUpdateResult[]
  counts: {
    processed: number
    eligible: number
    changed: number
    verified: number
    alreadyCorrect: number
    stale: number
    failed: number
  }
}

function normalizeWarehouse(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function normalizeIssueMethod(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (normalized === 'M' || normalized === 'IM_MANUAL') return 'im_Manual'
  if (normalized === 'B' || normalized === 'IM_BACKFLUSH') return 'im_Backflush'
  return normalized
}

function updateResultFor(item: SapAuditUpdateItem, overrides: Partial<SapAuditUpdateResult>): SapAuditUpdateResult {
  return {
    auditKind: item.auditKind,
    itemCode: item.itemCode,
    treeCode: item.treeCode,
    childNum: item.childNum,
    expectedValue: item.expectedValue,
    decisionSource: item.decisionSource,
    beforeValue: item.currentValue,
    afterValue: null,
    eligible: false,
    changed: false,
    skipped: false,
    stale: false,
    success: false,
    message: 'Sin procesar.',
    ...overrides,
  }
}

function lineMatchesWarehouseUpdate(
  before: BomLine[],
  after: BomLine[],
  item: SapAuditUpdateItem,
): boolean {
  if (before.length !== after.length || item.childNum === null) return false
  const afterByIdentity = new Map(after.map(line => [`${line.ChildNum}:${line.ItemCode}`, line]))
  return before.every(line => {
    const afterLine = afterByIdentity.get(`${line.ChildNum}:${line.ItemCode}`)
    if (!afterLine || afterLine.Quantity !== line.Quantity || afterLine.IssueMethod !== line.IssueMethod) return false
    const isTarget = line.ChildNum === item.childNum && line.ItemCode === item.itemCode
    return isTarget
      ? normalizeWarehouse(afterLine.Warehouse) === item.expectedValue
      : afterLine.Warehouse === line.Warehouse
  })
}

function lineMatchesIssueMethodUpdate(
  before: BomLine[],
  after: BomLine[],
  item: SapAuditUpdateItem,
): boolean {
  if (before.length !== after.length || item.childNum === null) return false
  const afterByIdentity = new Map(after.map(line => [`${line.ChildNum}:${line.ItemCode}`, line]))
  return before.every(line => {
    const afterLine = afterByIdentity.get(`${line.ChildNum}:${line.ItemCode}`)
    if (!afterLine || afterLine.Quantity !== line.Quantity || afterLine.Warehouse !== line.Warehouse) return false
    const isTarget = line.ChildNum === item.childNum && line.ItemCode === item.itemCode
    return isTarget
      ? normalizeIssueMethod(afterLine.IssueMethod) === item.expectedValue
      : afterLine.IssueMethod === line.IssueMethod
  })
}

async function logSapAuditOperation(input: {
  item: SapAuditUpdateItem
  dryRun: boolean
  confirmed: boolean
  result: SapAuditUpdateResult
  userId: string | null
}): Promise<void> {
  const operationType = {
    color: 'item_status_update',
    output_warehouse: 'product_tree_header_warehouse_update',
    bom_warehouse: 'product_tree_line_warehouse_update',
    issue_method: 'product_tree_issue_method_update',
  }[input.item.auditKind]
  const { error } = await supabaseTable('sap_operation_logs').insert({
    operation_type: operationType,
    item_code: input.item.treeCode ?? input.item.itemCode,
    requested_status: input.item.expectedValue,
    dry_run: input.dryRun,
    confirmation_text: input.confirmed ? 'CHECKED' : '',
    sap_payload: {
      audit_kind: input.item.auditKind,
      item_code: input.item.itemCode,
      tree_code: input.item.treeCode,
      child_num: input.item.childNum,
      current_value: input.item.currentValue,
      expected_value: input.item.expectedValue,
      decision_source: input.item.decisionSource,
    },
    sap_response: {
      before_value: input.result.beforeValue,
      after_value: input.result.afterValue,
      verification: input.dryRun ? 'dry_run_pre_read' : 'sap_re_read_after_write',
      changed: input.result.changed,
      stale: input.result.stale,
      message: input.result.message,
    },
    success: input.result.success,
    error_message: input.result.success ? null : input.result.message,
    created_by: input.userId,
  })
  if (error) throw new Error(`No se pudo registrar la operación SAP: ${error.message}`)
}

async function processSapAuditItem(input: {
  mode: ColorAuditUpdateMode
  item: SapAuditUpdateItem
}): Promise<SapAuditUpdateResult> {
  const { item, mode } = input
  if (item.auditKind === 'color') {
    const before = await getSapItem(item.itemCode, ['ItemCode', 'U_Color'])
    const sapItemCode = readSapItemCode(before)
    const beforeValue = normalizeColorAuditUpdateColor(before.U_Color)
    if (sapItemCode !== item.itemCode) {
      return updateResultFor(item, { beforeValue, stale: true, message: 'SAP devolvió un ItemCode diferente al solicitado.' })
    }
    if (beforeValue === item.expectedValue) {
      return updateResultFor(item, { beforeValue, afterValue: beforeValue, skipped: true, success: true, message: 'SAP ya tenía el valor solicitado; no se escribió.' })
    }
    if (beforeValue !== item.currentValue) {
      return updateResultFor(item, { beforeValue, stale: true, message: 'El valor cambió desde la auditoría; se omitió para no sobrescribirlo.' })
    }
    if (mode === 'dry-run') {
      return updateResultFor(item, { beforeValue, eligible: true, success: true, message: 'Dry-run listo: se actualizaría y luego se verificaría en SAP.' })
    }
    await updateSapItem(item.itemCode, { U_Color: item.expectedValue })
    const after = await getSapItem(item.itemCode, ['ItemCode', 'U_Color'])
    const afterValue = normalizeColorAuditUpdateColor(after.U_Color)
    if (readSapItemCode(after) !== item.itemCode || afterValue !== item.expectedValue) {
      return updateResultFor(item, { beforeValue, afterValue, changed: true, message: 'SAP no confirmó el valor esperado después de escribir.' })
    }
    return updateResultFor(item, { beforeValue, afterValue, eligible: true, changed: true, success: true, message: 'Actualizado y verificado en SAP.' })
  }

  if (item.auditKind === 'output_warehouse') {
    if (!item.treeCode) return updateResultFor(item, { message: 'Falta el TreeCode del encabezado de LdM.' })
    const beforeTree = await getSapItemBom(item.treeCode)
    if (!beforeTree || beforeTree.treeCode.trim().toUpperCase() !== item.treeCode) {
      return updateResultFor(item, { stale: true, message: `SAP no devolvió el encabezado LdM ${item.treeCode}.` })
    }
    const beforeValue = normalizeWarehouse(beforeTree.warehouse)
    if (beforeValue === item.expectedValue) {
      return updateResultFor(item, { beforeValue, afterValue: beforeValue, skipped: true, success: true, message: 'SAP ya tenía el almacén de encabezado solicitado; no se escribió.' })
    }
    if (beforeValue !== item.currentValue) {
      return updateResultFor(item, { beforeValue, stale: true, message: 'El almacén del encabezado LdM cambió desde la auditoría; se omitió para no sobrescribirlo.' })
    }
    if (mode === 'dry-run') {
      return updateResultFor(item, { beforeValue, eligible: true, success: true, message: 'Dry-run listo: se actualizaría el almacén del encabezado LdM y luego se verificaría en SAP.' })
    }
    await updateSapProductTreeHeaderWarehouse(item.treeCode, item.expectedValue)
    const afterTree = await getSapItemBom(item.treeCode)
    const afterValue = normalizeWarehouse(afterTree?.warehouse)
    if (!afterTree || afterTree.treeCode.trim().toUpperCase() !== item.treeCode || afterValue !== item.expectedValue) {
      return updateResultFor(item, { beforeValue, afterValue, changed: true, message: 'SAP no confirmó el almacén esperado en el encabezado LdM después de escribir.' })
    }
    return updateResultFor(item, { beforeValue, afterValue, eligible: true, changed: true, success: true, message: 'Encabezado LdM actualizado y verificado en SAP.' })
  }

  if (!item.treeCode || item.childNum === null) {
    return updateResultFor(item, { message: 'Faltan identificadores de la línea de LdM.' })
  }
  const beforeTree = await getSapItemBom(item.treeCode)
  if (!beforeTree) return updateResultFor(item, { message: `SAP no devolvió la LdM ${item.treeCode}.` })
  const beforeLine = beforeTree.lines.filter(line => line.ChildNum === item.childNum && line.ItemCode === item.itemCode)
  if (beforeLine.length !== 1) return updateResultFor(item, { message: 'SAP no encontró la línea de LdM de forma única.' })
  const beforeValue = item.auditKind === 'bom_warehouse'
    ? normalizeWarehouse(beforeLine[0].Warehouse)
    : normalizeIssueMethod(beforeLine[0].IssueMethod)
  if (beforeValue === item.expectedValue) {
    return updateResultFor(item, { beforeValue, afterValue: beforeValue, skipped: true, success: true, message: 'SAP ya tenía el valor solicitado; no se escribió.' })
  }
  if (beforeValue !== item.currentValue) {
    return updateResultFor(item, { beforeValue, stale: true, message: 'La línea cambió desde la auditoría; se omitió para no sobrescribirla.' })
  }
  if (mode === 'dry-run') {
    return updateResultFor(item, { beforeValue, eligible: true, success: true, message: 'Dry-run listo: se actualizaría y luego se verificaría en SAP.' })
  }

  const patch = item.auditKind === 'bom_warehouse'
    ? { ChildNum: item.childNum, ItemCode: item.itemCode, Warehouse: item.expectedValue }
    : { ChildNum: item.childNum, ItemCode: item.itemCode, IssueMethod: item.expectedValue }
  await updateSapProductTreeLines(item.treeCode, [patch])
  const afterTree = await getSapItemBom(item.treeCode)
  const structureMatches = afterTree && (item.auditKind === 'bom_warehouse'
    ? lineMatchesWarehouseUpdate(beforeTree.lines, afterTree.lines, item)
    : lineMatchesIssueMethodUpdate(beforeTree.lines, afterTree.lines, item))
  const afterLine = afterTree?.lines.find(line => line.ChildNum === item.childNum && line.ItemCode === item.itemCode)
  const afterValue = item.auditKind === 'bom_warehouse'
    ? normalizeWarehouse(afterLine?.Warehouse)
    : normalizeIssueMethod(afterLine?.IssueMethod)
  if (!structureMatches || afterValue !== item.expectedValue) {
    return updateResultFor(item, { beforeValue, afterValue, changed: true, message: 'SAP no confirmó la línea esperada después de escribir.' })
  }
  return updateResultFor(item, { beforeValue, afterValue, eligible: true, changed: true, success: true, message: 'Actualizado y verificado en SAP.' })
}

export async function processSapAuditUpdateBatch(input: {
  mode: ColorAuditUpdateMode
  items: SapAuditUpdateItem[]
  confirmed: boolean
  userId: string | null
}): Promise<SapAuditUpdateBatch> {
  if (input.mode === 'apply') await assertSapWritesEnabled()
  const results: SapAuditUpdateResult[] = []
  for (const item of input.items) {
    let result: SapAuditUpdateResult
    try {
      result = await processSapAuditItem({ mode: input.mode, item })
    } catch (error) {
      result = updateResultFor(item, { message: error instanceof Error ? error.message : 'No se pudo procesar la actualización SAP.' })
    }
    try {
      await logSapAuditOperation({ item, dryRun: input.mode === 'dry-run', confirmed: input.confirmed, result, userId: input.userId })
    } catch (error) {
      if (result.success) {
        result = { ...result, success: false, message: error instanceof Error ? error.message : 'La operación SAP no quedó registrada.' }
      }
    }
    results.push(result)
  }
  return {
    results,
    counts: {
      processed: results.length,
      eligible: results.filter(result => result.eligible).length,
      changed: results.filter(result => result.changed).length,
      verified: results.filter(result => result.success && result.changed).length,
      alreadyCorrect: results.filter(result => result.skipped).length,
      stale: results.filter(result => result.stale).length,
      failed: results.filter(result => !result.success).length,
    },
  }
}
