import { NextResponse } from 'next/server'

import { syncTransferRequestItemsToCatalog } from '@/lib/sap/transferRequests'
import { apiGuard } from '@/utils/auth/access'

import { isRecord, transferRequestErrorResponse } from '../../_utils'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response
  try {
    const raw: unknown = await request.json().catch(() => null)
    if (!isRecord(raw) || !Array.isArray(raw.itemCodes)) throw new Error('Envíe una lista de códigos SAP.')
    const itemCodes = raw.itemCodes.filter((value): value is string => typeof value === 'string')
    const result = await syncTransferRequestItemsToCatalog(itemCodes)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
