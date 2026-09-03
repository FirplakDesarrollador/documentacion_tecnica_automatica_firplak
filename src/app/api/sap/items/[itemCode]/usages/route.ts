import { NextResponse } from 'next/server'
import { apiGuard } from '@/utils/auth/access'
import { getSapProductTreeUsages } from '@/lib/sap/serviceLayer'
import { sapApiErrorResponse } from '../../../_utils'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ itemCode: string }> }
) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const params = await paramsPromise
    const usages = await getSapProductTreeUsages(params.itemCode)
    return NextResponse.json({ success: true, usages })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
