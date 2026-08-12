import { NextResponse } from 'next/server'

import { getSapTransferRequestAvailability } from '@/lib/sap/transferRequests'
import { apiGuard } from '@/utils/auth/access'

import { isRecord, readRequiredText, transferRequestErrorResponse } from '../_utils'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response

  try {
    const raw = await request.json().catch(() => null)
    if (!isRecord(raw)) throw new Error('Payload inválido.')
    const itemCode = readRequiredText(raw.itemCode, 'El código de artículo', 100)
    const sourceWarehouseCode = readRequiredText(raw.sourceWarehouseCode, 'La bodega de origen', 50)
    const result = await getSapTransferRequestAvailability(itemCode, sourceWarehouseCode)
    return NextResponse.json({
      success: true,
      availability: {
        itemCode: result.item.itemCode,
        itemName: result.item.itemName,
        inventoryUom: result.item.inventoryUom,
        management: result.item.management,
        availability: result.sourceAvailability,
        warehouseAvailability: result.item.warehouseAvailability,
        allocation: result.item.allocation,
      },
    })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
