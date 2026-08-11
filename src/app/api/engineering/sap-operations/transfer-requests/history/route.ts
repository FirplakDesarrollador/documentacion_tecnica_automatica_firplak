import { NextResponse } from 'next/server'

import { listSapTransferRequestOperations } from '@/lib/sap/operationAudit'
import { apiGuard } from '@/utils/auth/access'

import { serializeOperation, transferRequestErrorResponse } from '../_utils'

export const runtime = 'nodejs'

export async function GET() {
  const guard = await apiGuard('module:engineering')
  if (guard.response) return guard.response

  try {
    const operations = await listSapTransferRequestOperations()
    return NextResponse.json({ success: true, operations: operations.map(serializeOperation) })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
