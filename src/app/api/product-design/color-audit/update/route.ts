import { NextRequest, NextResponse } from 'next/server'

import {
  buildColorAuditUpdateConfirmation,
  colorAuditUpdateErrorStatus,
  normalizeColorAuditUpdateItems,
  processColorAuditUpdateBatch,
  type ColorAuditUpdateMode,
} from '@/lib/sap/colorAuditUpdates'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_BATCH_SIZE = 25

type UpdateRequest = {
  mode: ColorAuditUpdateMode
  items: unknown
  operationTotal: number
  confirmationText: string
}

function readRequestBody(value: unknown): UpdateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { mode: 'dry-run', items: [], operationTotal: 0, confirmationText: '' }
  }
  const record = value as Record<string, unknown>
  const mode = record.mode === 'apply' ? 'apply' : 'dry-run'
  const operationTotal = typeof record.operationTotal === 'number'
    && Number.isInteger(record.operationTotal)
    && record.operationTotal > 0
    ? record.operationTotal
    : 0
  return {
    mode,
    items: record.items,
    operationTotal,
    confirmationText: typeof record.confirmationText === 'string' ? record.confirmationText : '',
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await apiGuard('module:product-design')
  if (guard.response) return guard.response

  try {
    const body = readRequestBody(await request.json())
    const normalized = normalizeColorAuditUpdateItems(body.items)
    if (normalized.invalidItemCodes.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Solo se pueden procesar discrepancias u_color_different con color válido. SKU inválidos: ${normalized.invalidItemCodes.slice(0, 5).join(', ')}`,
      }, { status: 400 })
    }
    if (normalized.items.length === 0 || normalized.items.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ success: false, error: `El lote debe contener entre 1 y ${MAX_BATCH_SIZE} SKU.` }, { status: 400 })
    }
    if (body.operationTotal < normalized.items.length) {
      return NextResponse.json({ success: false, error: 'El total de la operación no puede ser menor que el lote.' }, { status: 400 })
    }

    const confirmationRequired = buildColorAuditUpdateConfirmation(body.operationTotal)
    if (body.mode === 'apply' && body.confirmationText.trim() !== confirmationRequired) {
      return NextResponse.json({
        success: false,
        error: `Confirmación inválida. Escribe exactamente: ${confirmationRequired}`,
        confirmationRequired,
      }, { status: 400 })
    }

    const batch = await processColorAuditUpdateBatch({ mode: body.mode, items: normalized.items })
    return NextResponse.json({ success: batch.counts.failed === 0, mode: body.mode, confirmationRequired, ...batch })
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'No se pudo procesar el lote SAP.' }, { status: colorAuditUpdateErrorStatus(error) })
  }
}
