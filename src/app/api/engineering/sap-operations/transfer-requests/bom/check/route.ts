import { NextResponse } from 'next/server'
import { getSapItemBom } from '@/lib/sap/serviceLayer'
import { apiGuard } from '@/utils/auth/access'
import { transferRequestErrorResponse } from '../../_utils'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response
  try {
    const itemCode = new URL(request.url).searchParams.get('itemCode') ?? ''
    const bom = await getSapItemBom(itemCode)
    return NextResponse.json({ success: true, hasBom: Boolean(bom && bom.lines.length > 0) })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
