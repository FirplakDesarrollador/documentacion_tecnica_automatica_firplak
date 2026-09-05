import { NextResponse } from 'next/server'

import {
  getSapOperationByIdempotencyKey,
  getSapTransferRequestCreationOperationByDocEntry,
  markSapOperationAmbiguous,
  markSapOperationFailed,
  markSapOperationVerified,
  prepareSapOperationUpdate,
  type SapOperationLog,
} from '@/lib/sap/operationAudit'
import {
  getSapTransferRequestByDocEntry,
  SapTransferRequestUpdateAmbiguousError,
  SapTransferRequestValidationError,
  type SapTransferRequestDocument,
  type SapTransferRequestValidationSuccess,
  updateAndVerifySapTransferRequest,
} from '@/lib/sap/transferRequests'
import { SapServiceLayerError } from '@/lib/sap/serviceLayer'
import { dbQuery } from '@/lib/supabase'
import { apiGuard } from '@/utils/auth/access'

import { isRecord, readDocEntry, readRequiredText, serializeOperation, transferRequestErrorResponse } from '../../_utils'

export const runtime = 'nodejs'
export const maxDuration = 120

type UpdateInput = {
  idempotencyKey: string
  responsibleUserId: string
  draft: Record<string, unknown>
}

type ResponsibleUser = {
  id: string
  email: string
  role: string | null
}

function parseUpdateInput(value: unknown): UpdateInput {
  if (!isRecord(value)) {
    throw new SapServiceLayerError('Payload inválido.', { statusCode: 400, sapCode: 'SAP_VALIDATION_ERROR' })
  }
  if (value.confirmed !== true) {
    throw new SapServiceLayerError('Confirme la casilla antes de modificar la solicitud en SAP.', {
      statusCode: 400,
      sapCode: 'SAP_CONFIRMATION_REQUIRED',
    })
  }
  return {
    idempotencyKey: readRequiredText(value.idempotencyKey, 'La clave de idempotencia'),
    responsibleUserId: readRequiredText(value.responsibleUserId, 'El responsable'),
    draft: {
      sourceWarehouseCode: value.sourceWarehouseCode,
      destinationWarehouseCode: value.destinationWarehouseCode,
      businessComment: value.businessComment,
      lines: value.lines,
    },
  }
}

async function resolveResponsibleUser(userId: string): Promise<ResponsibleUser> {
  const rows = await dbQuery(
    `SELECT id, email, role
       FROM public.user_profiles
      WHERE id = $1
        AND email IS NOT NULL
      LIMIT 1`,
    [userId],
  )
  const row = rows[0]
  if (!row || typeof row.id !== 'string' || typeof row.email !== 'string') {
    throw new SapServiceLayerError('El responsable seleccionado ya no está disponible en el aplicativo.', {
      statusCode: 400,
      sapCode: 'SAP_VALIDATION_ERROR',
    })
  }
  return { id: row.id, email: row.email, role: typeof row.role === 'string' ? row.role : null }
}

function operationItemsFromValidation(validation: SapTransferRequestValidationSuccess): Array<Record<string, unknown>> {
  return validation.lines.map(line => ({
    itemCode: line.itemCode,
    itemName: line.itemName,
    quantity: line.quantity,
    inventoryUom: line.inventoryUom,
    transferType: line.transferType,
    sourceWarehouseCode: line.sourceWarehouseCode,
    destinationWarehouseCode: line.destinationWarehouseCode,
    availableQuantityAtValidation: line.availability.availableQuantity,
    itemManagement: line.management,
    batchNumbers: line.batchNumbers,
    serialNumbers: line.serialNumbers,
    allowZeroAvailable: line.allowZeroAvailable,
    explodedFrom: line.explodedFrom,
  }))
}

function documentSummary(document: SapTransferRequestDocument): Record<string, unknown> {
  return {
    docEntry: document.docEntry,
    docNum: document.docNum,
    documentStatus: document.documentStatus,
    sourceWarehouseCode: document.fromWarehouse,
    destinationWarehouseCode: document.toWarehouse,
    businessComment: document.businessComment,
    lines: document.lines.map(line => ({
      lineNumber: line.lineNumber,
      itemCode: line.itemCode,
      quantity: line.quantity,
      fromWarehouseCode: line.fromWarehouseCode,
      warehouseCode: line.warehouseCode,
      transferType: line.transferType,
    })),
  }
}

function modificationHistory(operation: SapOperationLog): Array<Record<string, unknown>> {
  const history = operation.operationContext.modificationHistory
  return Array.isArray(history)
    ? history.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : []
}

async function responseForExistingOperation(operation: SapOperationLog): Promise<NextResponse> {
  if (operation.operationStatus === 'verified' && operation.sapDocEntry) {
    const request = await getSapTransferRequestByDocEntry(operation.sapDocEntry)
    return NextResponse.json({ success: true, idempotent: true, operation: serializeOperation(operation), request })
  }
  const error = operation.operationStatus === 'failed'
    ? 'La modificación anterior falló antes de completarse. Genere una nueva modificación para volver a intentarlo.'
    : 'Ya existe una modificación pendiente o de resultado ambiguo con esta clave. Consulte el detalle antes de reintentar.'
  return NextResponse.json({ success: false, error, operation: serializeOperation(operation) }, { status: 409 })
}

function errorStatus(error: unknown): number {
  return error instanceof SapServiceLayerError ? error.statusCode : 500
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ docEntry: string }> },
) {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response

  const auditState: { pendingOperation: SapOperationLog | null } = { pendingOperation: null }
  let operationContext: Record<string, unknown> = {}
  let docEntry: number | null = null

  try {
    const routeParams = await params
    docEntry = readDocEntry(routeParams.docEntry)
    const existingDocumentOperation = await getSapTransferRequestCreationOperationByDocEntry(docEntry)
    if (!existingDocumentOperation) {
      throw new SapServiceLayerError('La solicitud no fue creada desde esta aplicación y no se puede modificar aquí.', {
        statusCode: 404,
        sapCode: 'SAP_TRANSFER_REQUEST_NOT_MANAGED_BY_APP',
      })
    }
    const input = parseUpdateInput(await request.json().catch(() => null))
    const existing = await getSapOperationByIdempotencyKey(input.idempotencyKey)
    if (existing) return responseForExistingOperation(existing)
    const responsible = await resolveResponsibleUser(input.responsibleUserId)

    const result = await updateAndVerifySapTransferRequest(docEntry, input.draft, {
      beforeUpdate: async ({ validation, payload, previousDocument }) => {
        operationContext = {
          ...existingDocumentOperation.operationContext,
          responsible,
          stockOverrides: validation.lines
            .map(line => line.allowZeroAvailable ? { lineIndex: line.lineIndex, itemCode: line.itemCode } : null)
            .filter((entry): entry is { lineIndex: number; itemCode: string } => entry !== null),
          modificationHistory: [
            ...modificationHistory(existingDocumentOperation),
            {
              idempotencyKey: input.idempotencyKey,
              requestedAt: validation.checkedAt,
              actor: {
                id: guard.access?.user?.id ?? null,
                email: guard.access?.user?.email ?? null,
                role: guard.access?.role ?? null,
              },
              responsible,
              previousDocument: documentSummary(previousDocument),
            },
          ],
        }
        const prepared = await prepareSapOperationUpdate({
          operationId: existingDocumentOperation.id,
          idempotencyKey: input.idempotencyKey,
          sapPayload: payload,
          operationItems: operationItemsFromValidation(validation),
          operationContext,
          businessComment: validation.businessComment,
          sourceWarehouse: validation.sourceWarehouseCode,
          destinationWarehouse: validation.destinationWarehouseCode,
        })
        auditState.pendingOperation = prepared
      },
    })

    const pendingOperation = auditState.pendingOperation
    if (!pendingOperation) {
      throw new Error('No se pudo verificar y registrar la modificación de SAP.')
    }
    if (result.document.docNum === null) {
      const operation = await markSapOperationAmbiguous({
        operationId: pendingOperation.id,
        errorMessage: 'SAP modificó o devolvió la solicitud sin DocNum verificable.',
        sapResponse: documentSummary(result.document),
        sapDocEntry: result.document.docEntry,
        subjectKey: String(result.document.docEntry),
      })
      return NextResponse.json({
        success: false,
        error: 'SAP devolvió la solicitud sin número de documento verificable. Consulte el detalle antes de reintentar.',
        operation: serializeOperation(operation),
      }, { status: 502 })
    }
    const operation = await markSapOperationVerified({
      operationId: pendingOperation.id,
      sapResponse: documentSummary(result.document),
      sapDocEntry: result.document.docEntry,
      sapDocNum: result.document.docNum,
      subjectKey: String(result.document.docEntry),
      operationContext: { ...operationContext, verifiedAt: new Date().toISOString() },
    })
    return NextResponse.json({ success: true, idempotent: false, operation: serializeOperation(operation), request: result.document })
  } catch (error) {
    const pendingOperation = auditState.pendingOperation
    if (!pendingOperation) return transferRequestErrorResponse(error)

    if (error instanceof SapTransferRequestUpdateAmbiguousError) {
      try {
        const operation = await markSapOperationAmbiguous({
          operationId: pendingOperation.id,
          errorMessage: error.message,
          sapDocEntry: error.docEntry,
          subjectKey: String(error.docEntry),
          operationContext: { ...operationContext, ambiguityDetectedAt: new Date().toISOString() },
        })
        return NextResponse.json({ success: false, error: error.message, sapCode: error.sapCode, operation: serializeOperation(operation) }, { status: error.statusCode })
      } catch (auditError) {
        return NextResponse.json({
          success: false,
          error: 'SAP puede haber modificado la solicitud, pero no se pudo finalizar su auditoría. Consulte el detalle antes de reintentar.',
          operation: serializeOperation(pendingOperation),
          auditError: auditError instanceof Error ? auditError.message : 'Error de auditoría.',
        }, { status: 502 })
      }
    }

    try {
      const operation = await markSapOperationFailed({
        operationId: pendingOperation.id,
        errorMessage: error instanceof Error ? error.message : 'Error desconocido al modificar la solicitud.',
        sapDocEntry: docEntry,
        subjectKey: docEntry === null ? null : String(docEntry),
        operationContext: { ...operationContext, failedAt: new Date().toISOString() },
      })
      if (error instanceof SapTransferRequestValidationError) {
        return NextResponse.json({ success: false, error: error.message, sapCode: error.sapCode, issues: error.issues, operation: serializeOperation(operation) }, { status: error.statusCode })
      }
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'No fue posible modificar la solicitud.', operation: serializeOperation(operation) }, { status: errorStatus(error) })
    } catch (auditError) {
      return NextResponse.json({
        success: false,
        error: 'No se pudo finalizar la auditoría después del intento SAP. Consulte el detalle antes de reintentar.',
        operation: serializeOperation(pendingOperation),
        auditError: auditError instanceof Error ? auditError.message : 'Error de auditoría.',
      }, { status: 502 })
    }
  }
}
