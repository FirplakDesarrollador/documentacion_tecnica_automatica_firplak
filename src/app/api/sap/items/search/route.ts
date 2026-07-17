import { NextRequest, NextResponse } from 'next/server'
import { apiGuard } from '@/utils/auth/access'
import {
  searchSapItems,
} from '@/lib/sap/serviceLayer'
import { sapApiErrorResponse } from '../../_utils'

export const runtime = 'nodejs'

const PAGE_SIZE = 20

function parseNonNegativeInteger(value: string | null): number {
  if (!value) return 0
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

export async function GET(request: NextRequest) {
  const guard = await apiGuard('module:consulta-sap')
  if (guard.response) return guard.response

  try {
    const code = request.nextUrl.searchParams.get('code') ?? ''
    const description = request.nextUrl.searchParams.get('description') ?? ''
    const color = request.nextUrl.searchParams.get('color') ?? ''
    const skip = parseNonNegativeInteger(request.nextUrl.searchParams.get('skip'))
    const result = await searchSapItems({ code, description, color }, { skip, limit: PAGE_SIZE })

    return NextResponse.json({
      success: true,
      items: result.items
        .filter(item => typeof item.ItemCode === 'string')
        .map(item => ({
          itemCode: String(item.ItemCode),
          itemName: typeof item.ItemName === 'string' ? item.ItemName : '',
        })),
      hasMore: result.hasMore,
      nextSkip: result.nextSkip,
    })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
