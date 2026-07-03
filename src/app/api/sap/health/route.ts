import { NextResponse } from 'next/server'
import { apiGuard } from '@/utils/auth/access'
import { checkSapServiceLayerHealth, sapWritesEnabled } from '@/lib/sap/serviceLayer'
import { sapApiErrorResponse } from '../_utils'

export const runtime = 'nodejs'

export async function GET() {
  const guard = await apiGuard('admin')
  if (guard.response) return guard.response

  try {
    const health = await checkSapServiceLayerHealth()
    return NextResponse.json({
      success: true,
      ...health,
      writesEnabled: await sapWritesEnabled(),
    })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
