import { NextRequest, NextResponse } from 'next/server'
import { SapServiceLayerError, searchSapProductionOrders, type SapProductionOrderStatus } from '@/lib/sap/serviceLayer'
import { apiGuard } from '@/utils/auth/access'
import { sapApiErrorResponse } from '../../_utils'

export const runtime = 'nodejs'

const PAGE_SIZE = 20
const PRODUCTION_STATUSES = new Set<SapProductionOrderStatus>(['P', 'R', 'L', 'C'])

function parseNonNegativeInteger(value: string | null, field: string): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new SapServiceLayerError(`Invalid ${field}`, { statusCode: 400, sapCode: 'SAP_INVALID_DOCUMENT_NUMBER' })
  }
  return parsed
}

export async function GET(request: NextRequest) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const status = request.nextUrl.searchParams.get('status')?.trim().toUpperCase() ?? ''
    if (status && !PRODUCTION_STATUSES.has(status as SapProductionOrderStatus)) {
      return NextResponse.json({ success: false, error: 'Estado de OF inválido.' }, { status: 400 })
    }
    const skip = parseNonNegativeInteger(request.nextUrl.searchParams.get('skip'), 'skip') ?? 0
    const result = await searchSapProductionOrders({
      documentNumber: parseNonNegativeInteger(request.nextUrl.searchParams.get('number'), 'number'),
      itemCode: request.nextUrl.searchParams.get('itemCode') ?? '',
      itemDescription: request.nextUrl.searchParams.get('description') ?? '',
      status: status ? status as SapProductionOrderStatus : undefined,
      dateFrom: request.nextUrl.searchParams.get('dateFrom') ?? '',
      dateTo: request.nextUrl.searchParams.get('dateTo') ?? '',
      overdue: request.nextUrl.searchParams.get('overdue') === 'true',
    }, { skip, limit: PAGE_SIZE })

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
