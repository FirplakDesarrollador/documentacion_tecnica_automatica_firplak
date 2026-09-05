import { NextResponse } from 'next/server'
import { previewSapTransferRequestBomExplosion } from '@/lib/sap/transferRequests'
import { apiGuard } from '@/utils/auth/access'
import { isRecord, transferRequestErrorResponse } from '../../_utils'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response
  try {
    const raw: unknown = await request.json().catch(() => null)
    if (!isRecord(raw)) throw new Error('Payload inválido.')
    const result = await previewSapTransferRequestBomExplosion({
      itemCode: typeof raw.itemCode === 'string' ? raw.itemCode : '',
      quantity: typeof raw.quantity === 'number' ? raw.quantity : Number(raw.quantity),
      sourceWarehouseCode: typeof raw.sourceWarehouseCode === 'string' ? raw.sourceWarehouseCode : '',
      visitedItemCodes: Array.isArray(raw.visitedItemCodes) ? raw.visitedItemCodes.filter((value): value is string => typeof value === 'string') : [],
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
