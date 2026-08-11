import { NextResponse } from 'next/server'

import { getSapTransferRequestOperationByDocEntry } from '@/lib/sap/operationAudit'
import { getSapTransferRequestByDocEntry } from '@/lib/sap/transferRequests'
import { apiGuard } from '@/utils/auth/access'

import { readDocEntry, serializeOperation, transferRequestErrorResponse } from '../_utils'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ docEntry: string }> },
) {
  const guard = await apiGuard('module:engineering')
  if (guard.response) return guard.response

  try {
    const { docEntry: rawDocEntry } = await params
    const docEntry = readDocEntry(rawDocEntry)
    const operation = await getSapTransferRequestOperationByDocEntry(docEntry)
    if (!operation) {
      return NextResponse.json({ success: false, error: 'La solicitud no fue creada desde esta aplicación.' }, { status: 404 })
    }
    const request = await getSapTransferRequestByDocEntry(docEntry)
    return NextResponse.json({ success: true, operation: serializeOperation(operation), request })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
