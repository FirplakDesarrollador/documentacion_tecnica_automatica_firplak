import { NextResponse } from 'next/server'
import { getSapSalesOrder, SapServiceLayerError } from '@/lib/sap/serviceLayer'
import { apiGuard } from '@/utils/auth/access'
import { sapApiErrorResponse } from '../../_utils'

export const runtime = 'nodejs'

function parseEntry(value: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new SapServiceLayerError('Invalid sales order entry', { statusCode: 400, sapCode: 'SAP_INVALID_DOCUMENT_NUMBER' })
  }
  return parsed
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentEntry: string }> },
) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const { documentEntry } = await params
    const order = await getSapSalesOrder(parseEntry(documentEntry))
    return NextResponse.json({ success: true, order })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
