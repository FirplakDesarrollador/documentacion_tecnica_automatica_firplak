import { NextRequest, NextResponse } from 'next/server'

import {
  colorAuditUpdateErrorStatus,
  normalizeSapAuditUpdateItems,
  processSapAuditUpdateBatch,
  type ColorAuditUpdateMode,
  type SapAuditUpdateKind,
} from '@/lib/sap/colorAuditUpdates'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_BATCH_SIZE = 25

type UpdateRequest = {
  auditKind: SapAuditUpdateKind
  mode: ColorAuditUpdateMode
  items: unknown
  confirmed: boolean
}

type ColorAuditPermission = 'module:product-design' | 'module:engineering' | 'module:engineering:sap-auditories'

function readRequestBody(value: unknown): UpdateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { auditKind: 'color', mode: 'dry-run', items: [], confirmed: false }
  }
  const record = value as Record<string, unknown>
  const auditKind = record.auditKind === 'output_warehouse'
    || record.auditKind === 'bom_warehouse'
    || record.auditKind === 'issue_method'
    ? record.auditKind
    : 'color'
  return {
    auditKind,
    mode: record.mode === 'apply' ? 'apply' : 'dry-run',
    items: record.items,
    confirmed: record.confirmed === true,
  }
}

export async function handleColorAuditUpdateRequest(request: NextRequest, permission: ColorAuditPermission): Promise<Response> {
  const guard = await apiGuard(permission)
  if (guard.response) return guard.response

  try {
    const body = readRequestBody(await request.json())
    const normalized = normalizeSapAuditUpdateItems(body.auditKind, body.items)
    if (normalized.invalidItemKeys.length > 0) {
      return NextResponse.json({
        success: false,
        error: `La selección contiene filas no normalizables: ${normalized.invalidItemKeys.slice(0, 5).join(', ')}`,
      }, { status: 400 })
    }
    if (normalized.items.length === 0 || normalized.items.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ success: false, error: `El lote debe contener entre 1 y ${MAX_BATCH_SIZE} filas.` }, { status: 400 })
    }
    if (body.mode === 'apply' && !body.confirmed) {
      return NextResponse.json({ success: false, error: 'Confirma la acción con la casilla antes de modificar SAP.' }, { status: 400 })
    }

    const batch = await processSapAuditUpdateBatch({
      mode: body.mode,
      items: normalized.items,
      confirmed: body.confirmed,
      userId: guard.access?.user?.id ?? null,
    })
    return NextResponse.json({ success: batch.counts.failed === 0, mode: body.mode, auditKind: body.auditKind, ...batch })
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'No se pudo procesar el lote SAP.' }, { status: colorAuditUpdateErrorStatus(error) })
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleColorAuditUpdateRequest(request, 'module:engineering:sap-auditories')
}
