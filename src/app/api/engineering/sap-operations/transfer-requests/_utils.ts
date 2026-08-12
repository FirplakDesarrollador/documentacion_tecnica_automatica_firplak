import { NextResponse } from 'next/server'

import {
  SapOperationAuditSchemaError,
  type SapOperationLog,
} from '@/lib/sap/operationAudit'
import {
  SapTransferRequestCreationAmbiguousError,
  SapTransferRequestUpdateAmbiguousError,
  SapTransferRequestValidationError,
  type SapTransferRequestValidationIssue,
} from '@/lib/sap/transferRequests'
import { SapServiceLayerError } from '@/lib/sap/serviceLayer'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readRequiredText(value: unknown, label: string, maxLength = 160): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new SapServiceLayerError(`${label} es obligatorio.`, {
    statusCode: 400,
    sapCode: 'SAP_VALIDATION_ERROR',
  })
  if (normalized.length > maxLength) {
    throw new SapServiceLayerError(`${label} no puede superar ${maxLength} caracteres.`, {
      statusCode: 400,
      sapCode: 'SAP_VALIDATION_ERROR',
    })
  }
  return normalized
}

export function readDocEntry(value: string): number {
  const docEntry = Number(value)
  if (!Number.isSafeInteger(docEntry) || docEntry <= 0) {
    throw new SapServiceLayerError('DocEntry inválido.', {
      statusCode: 400,
      sapCode: 'SAP_VALIDATION_ERROR',
    })
  }
  return docEntry
}

export function serializeOperation(operation: SapOperationLog) {
  return {
    id: operation.id,
    operationType: operation.operationType,
    operationStatus: operation.operationStatus,
    sapDocEntry: operation.sapDocEntry,
    sapDocNum: operation.sapDocNum,
    createdAt: operation.createdAt,
    actorEmail: operation.actorEmail,
    actorRole: operation.actorRole,
    sourceWarehouse: operation.sourceWarehouse,
    destinationWarehouse: operation.destinationWarehouse,
    businessComment: operation.businessComment,
    operationItems: operation.operationItems,
    operationContext: operation.operationContext,
    errorMessage: operation.errorMessage,
  }
}

function serializeValidationIssues(issues: SapTransferRequestValidationIssue[]) {
  return issues.map(issue => ({
    code: issue.code,
    message: issue.message,
    lineIndex: issue.lineIndex ?? null,
    ...(issue.availableQuantity === undefined ? {} : { availableQuantity: issue.availableQuantity }),
    ...(issue.requestedQuantity === undefined ? {} : { requestedQuantity: issue.requestedQuantity }),
  }))
}

export function transferRequestErrorResponse(error: unknown): NextResponse {
  if (error instanceof SapTransferRequestValidationError) {
    return NextResponse.json({
      success: false,
      error: error.message,
      sapCode: error.sapCode,
      issues: serializeValidationIssues(error.issues),
    }, { status: error.statusCode })
  }

  if (error instanceof SapTransferRequestCreationAmbiguousError || error instanceof SapTransferRequestUpdateAmbiguousError) {
    return NextResponse.json({
      success: false,
      error: error.message,
      sapCode: error.sapCode,
      docEntry: error.docEntry,
    }, { status: error.statusCode })
  }

  if (error instanceof SapOperationAuditSchemaError) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
    }, { status: 409 })
  }

  if (error instanceof SapServiceLayerError) {
    return NextResponse.json({
      success: false,
      error: error.message,
      sapCode: error.sapCode,
    }, { status: error.statusCode })
  }

  const message = error instanceof Error ? error.message : 'No fue posible completar la operación SAP.'
  return NextResponse.json({ success: false, error: message }, { status: 500 })
}
