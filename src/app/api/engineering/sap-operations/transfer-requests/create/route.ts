import { NextResponse } from 'next/server'

import {
  getSapOperationByIdempotencyKey,
  markSapOperationAmbiguous,
  markSapOperationFailed,
  markSapOperationVerified,
  SAP_TRANSFER_REQUEST_CREATE_OPERATION_TYPE,
  SAP_TRANSFER_REQUEST_SUBJECT_TYPE,
  startSapOperation,
  type SapOperationLog,
} from '@/lib/sap/operationAudit'
import {
  createAndVerifySapTransferRequestWithoutRefresh,
  getSapTransferRequestByDocEntry,
  SapTransferRequestCreationAmbiguousError,
  SapTransferRequestValidationError,
  type SapTransferRequestDocument,
  type SapTransferRequestPreparedDraft,
} from '@/lib/sap/transferRequests'
import { SapServiceLayerError } from '@/lib/sap/serviceLayer'
import { dbQuery } from '@/lib/supabase'
import { apiGuard } from '@/utils/auth/access'

import {
  isRecord,
  readRequiredText,
  serializeOperation,
  transferRequestErrorResponse,
} from '../_utils'

export const runtime = 'nodejs'
export const maxDuration = 120

type CreateInput = {
  idempotencyKey: string
  responsibleUserId: string
  draft: Record<string, unknown>
}

type ResponsibleUser = {
  id: string
  email: string
  role: string | null
}

class ExistingIdempotentOperationError extends Error {
  readonly operation: SapOperationLog

  constructor(operation: SapOperationLog) {
    super('Ya existe una operación con la misma clave de idempotencia.')
    this.name = 'ExistingIdempotentOperationError'
    this.operation = operation
  }
}

function parseCreateInput(value: unknown): CreateInput {
  if (!isRecord(value)) {
    throw new SapServiceLayerError('Payload inválido.', { statusCode: 400, sapCode: 'SAP_VALIDATION_ERROR' })
  }
  if (value.confirmed !== true) {
    throw new SapServiceLayerError('Confirme la casilla antes de crear la solicitud en SAP.', {
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
  return {
    id: row.id,
    email: row.email,
    role: typeof row.role === 'string' ? row.role : null,
  }
}

function operationItemsFromPreparedDraft(prepared: SapTransferRequestPreparedDraft): Array<Record<string, unknown>> {
  return prepared.lines.map(line => ({
    itemCode: line.itemCode,
    quantity: line.quantity,
    transferType: line.transferType,
    sourceWarehouseCode: prepared.sourceWarehouseCode,
    destinationWarehouseCode: prepared.destinationWarehouseCode,
    batchNumbers: line.batchNumbers,
    serialNumbers: line.serialNumbers,
  }))
}

function auditResponseFromDocument(document: SapTransferRequestDocument): Record<string, unknown> {
  return {
    docEntry: document.docEntry,
    docNum: document.docNum,
    documentStatus: document.documentStatus,
    docDate: document.docDate,
    dueDate: document.dueDate,
    taxDate: document.taxDate,
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

function errorStatus(error: unknown): number {
  if (error instanceof SapServiceLayerError) return error.statusCode
  return 500
}

function errorBody(error: unknown, operation: SapOperationLog) {
  if (error instanceof SapTransferRequestValidationError) {
    return {
      success: false,
      error: error.message,
      sapCode: error.sapCode,
      issues: error.issues.map(issue => ({
        code: issue.code,
        message: issue.message,
        lineIndex: issue.lineIndex ?? null,
      })),
      operation: serializeOperation(operation),
    }
  }
  if (error instanceof SapServiceLayerError) {
    return {
      success: false,
      error: error.message,
      sapCode: error.sapCode,
      operation: serializeOperation(operation),
    }
  }
  return {
    success: false,
    error: error instanceof Error ? error.message : 'No fue posible crear la solicitud.',
    operation: serializeOperation(operation),
  }
}

async function responseForExistingOperation(operation: SapOperationLog): Promise<NextResponse> {
  if (operation.operationStatus === 'verified' && operation.sapDocEntry) {
    const request = await getSapTransferRequestByDocEntry(operation.sapDocEntry)
    return NextResponse.json({
      success: true,
      idempotent: true,
      operation: serializeOperation(operation),
      request,
    })
  }

  const error = operation.operationStatus === 'failed'
    ? 'La operación anterior falló antes de completarse. Genere una nueva solicitud para volver a intentarlo.'
    : 'Ya existe una operación pendiente o de resultado ambiguo con esta clave. Revise el historial antes de reintentar.'
  return NextResponse.json({
    success: false,
    error,
    operation: serializeOperation(operation),
  }, { status: 409 })
}

export async function POST(request: Request) {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response

  const auditState: { pendingOperation: SapOperationLog | null } = { pendingOperation: null }
  let operationContext: Record<string, unknown> = {}

  try {
    const input = parseCreateInput(await request.json().catch(() => null))
    const existing = await getSapOperationByIdempotencyKey(input.idempotencyKey)
    if (existing) return responseForExistingOperation(existing)
    const responsible = await resolveResponsibleUser(input.responsibleUserId)

    const result = await createAndVerifySapTransferRequestWithoutRefresh(input.draft, {
      beforeCreate: async ({ prepared, payload }) => {
        operationContext = {
          workflow: 'engineering.sap-operations.transfer-requests',
          workflowVersion: 1,
          validationSource: 'availability-consulted-while-adding-lines',
          automaticComment: payload.Comments,
          cardCode: prepared.defaults.cardCode,
          contactPerson: prepared.defaults.contactPerson,
          shipToCode: prepared.defaults.shipToCode,
          series: prepared.defaults.series,
          priceList: prepared.defaults.priceList,
          responsible,
        }
        const started = await startSapOperation({
          operationType: SAP_TRANSFER_REQUEST_CREATE_OPERATION_TYPE,
          idempotencyKey: input.idempotencyKey,
          subjectType: SAP_TRANSFER_REQUEST_SUBJECT_TYPE,
          itemCode: prepared.lines.length === 1 ? prepared.lines[0]?.itemCode ?? null : null,
          confirmationText: 'CHECKED',
          sapPayload: payload,
          operationItems: operationItemsFromPreparedDraft(prepared),
          operationContext,
          businessComment: prepared.businessComment,
          actor: {
            id: guard.access?.user?.id ?? null,
            email: guard.access?.user?.email ?? null,
            role: guard.access?.role ?? null,
          },
          sourceWarehouse: prepared.sourceWarehouseCode,
          destinationWarehouse: prepared.destinationWarehouseCode,
        })
        if (!started.created) throw new ExistingIdempotentOperationError(started.operation)
        auditState.pendingOperation = started.operation
      },
    })

    const pendingOperation = auditState.pendingOperation
    if (!pendingOperation) {
      throw new Error('No se pudo registrar la operación pendiente antes de enviar a SAP.')
    }
    if (result.document.docNum === null) {
      const ambiguous = await markSapOperationAmbiguous({
        operationId: pendingOperation.id,
        errorMessage: 'SAP creó o devolvió la solicitud sin DocNum verificable.',
        sapResponse: auditResponseFromDocument(result.document),
        sapDocEntry: result.document.docEntry,
        subjectKey: String(result.document.docEntry),
      })
      return NextResponse.json({
        success: false,
        error: 'SAP devolvió la solicitud sin número de documento. Revise el historial antes de reintentar.',
        operation: serializeOperation(ambiguous),
      }, { status: 502 })
    }

    const operation = await markSapOperationVerified({
      operationId: pendingOperation.id,
      sapResponse: auditResponseFromDocument(result.document),
      sapDocEntry: result.document.docEntry,
      sapDocNum: result.document.docNum,
      subjectKey: String(result.document.docEntry),
      operationContext: {
        ...operationContext,
        verifiedAt: new Date().toISOString(),
        documentStatus: result.document.documentStatus,
      },
    })
    return NextResponse.json({
      success: true,
      idempotent: false,
      operation: serializeOperation(operation),
      request: result.document,
    })
  } catch (error) {
    if (error instanceof ExistingIdempotentOperationError) {
      try {
        return await responseForExistingOperation(error.operation)
      } catch (existingReadError) {
        return transferRequestErrorResponse(existingReadError)
      }
    }

    const pendingOperation = auditState.pendingOperation
    if (!pendingOperation) return transferRequestErrorResponse(error)

    if (error instanceof SapTransferRequestCreationAmbiguousError) {
      try {
        const operation = await markSapOperationAmbiguous({
          operationId: pendingOperation.id,
          errorMessage: error.message,
          sapDocEntry: error.docEntry,
          subjectKey: error.docEntry === null ? null : String(error.docEntry),
          operationContext: {
            ...operationContext,
            ambiguityDetectedAt: new Date().toISOString(),
          },
        })
        return NextResponse.json(errorBody(error, operation), { status: error.statusCode })
      } catch (auditError) {
        return NextResponse.json({
          success: false,
          error: 'SAP puede haber creado la solicitud, pero no se pudo finalizar su auditoría. No reintente: consulte SAP e historial.',
          operation: serializeOperation(pendingOperation),
          auditError: auditError instanceof Error ? auditError.message : 'Error de auditoría.',
        }, { status: 502 })
      }
    }

    try {
      const operation = await markSapOperationFailed({
        operationId: pendingOperation.id,
        errorMessage: error instanceof Error ? error.message : 'Error desconocido al crear la solicitud.',
        operationContext: {
          ...operationContext,
          failedAt: new Date().toISOString(),
        },
      })
      return NextResponse.json(errorBody(error, operation), { status: errorStatus(error) })
    } catch (auditError) {
      return NextResponse.json({
        success: false,
        error: 'No se pudo finalizar la auditoría después del intento SAP. No reintente con la misma solicitud hasta revisar el historial.',
        operation: serializeOperation(pendingOperation),
        auditError: auditError instanceof Error ? auditError.message : 'Error de auditoría.',
      }, { status: 502 })
    }
  }
}
