import 'server-only'

import {
  assertSapWritesEnabled,
  getSapItem,
  SapServiceLayerError,
  updateSapItem,
  type SapEntityPayload,
} from './serviceLayer'
import { parseColorAuditItemCode } from './colorAudit'
import {
  buildColorAuditUpdateConfirmation,
  normalizeColorAuditUpdateColor,
  normalizeColorAuditUpdateItems,
  type ColorAuditUpdateItem,
} from './colorAuditUpdateRules'

export { buildColorAuditUpdateConfirmation, normalizeColorAuditUpdateColor, normalizeColorAuditUpdateItems }
export type { ColorAuditUpdateItem }

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
