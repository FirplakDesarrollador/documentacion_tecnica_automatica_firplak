import { NextRequest, NextResponse } from 'next/server'

import { searchSapTransferRequestItems } from '@/lib/sap/transferRequests'
import { apiGuard } from '@/utils/auth/access'

import { transferRequestErrorResponse } from '../_utils'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response

  try {
    const query = request.nextUrl.searchParams.get('query') ?? ''
    const result = await searchSapTransferRequestItems(query)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
