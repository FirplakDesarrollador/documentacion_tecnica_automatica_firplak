import { NextResponse } from 'next/server'

import { getSapTransferRequestPackagePattern } from '@/lib/sap/transferRequests'
import { apiGuard } from '@/utils/auth/access'

import { readRequiredText, transferRequestErrorResponse } from '../_utils'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response

  try {
    const url = new URL(request.url)
    const itemCode = readRequiredText(url.searchParams.get('itemCode'), 'El cÃ³digo de artÃ­culo', 100)
    const packagePattern = await getSapTransferRequestPackagePattern(itemCode)
    return NextResponse.json({ success: true, packagePattern })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
