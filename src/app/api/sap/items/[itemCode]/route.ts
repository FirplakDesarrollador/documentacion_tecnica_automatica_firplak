import { NextResponse } from 'next/server'
import { apiGuard } from '@/utils/auth/access'
import { getSapActiveWarehouses, getSapItem, SapEntityPayload, SapServiceLayerError } from '@/lib/sap/serviceLayer'
import { sapApiErrorResponse } from '../../_utils'

export const runtime = 'nodejs'

function parseSelectParam(request: Request): string[] | undefined {
  const url = new URL(request.url)
  const rawSelect = url.searchParams.get('select')
  if (!rawSelect) return undefined

  const fields = rawSelect
    .split(',')
    .map(field => field.trim())
    .filter(Boolean)

  const invalidField = fields.find(field => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field))
  if (invalidField) {
    throw new SapServiceLayerError(`Invalid SAP select field: ${invalidField}`, {
      statusCode: 400,
      sapCode: 'SAP_INVALID_SELECT_FIELD',
    })
  }

  return fields.length > 0 ? fields : undefined
}

function shouldIncludeWarehouseNames(request: Request): boolean {
  return new URL(request.url).searchParams.get('includeWarehouseNames') === 'true'
}

function withWarehouseNames(item: SapEntityPayload, warehouses: SapEntityPayload[]): SapEntityPayload {
  if (!Array.isArray(item.ItemWarehouseInfoCollection)) return item

  const namesByCode = new Map(warehouses.flatMap(warehouse => {
    const code = typeof warehouse.WarehouseCode === 'string' ? warehouse.WarehouseCode.trim().toUpperCase() : ''
    const name = typeof warehouse.WarehouseName === 'string' ? warehouse.WarehouseName.trim() : ''
    return code && name ? [[code, name] as const] : []
  }))

  if (namesByCode.size === 0) return item

  return {
    ...item,
    ItemWarehouseInfoCollection: item.ItemWarehouseInfoCollection.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
      const warehouse = entry as SapEntityPayload
      const code = typeof warehouse.WarehouseCode === 'string' ? warehouse.WarehouseCode.trim().toUpperCase() : ''
      const name = code ? namesByCode.get(code) : undefined
      return name ? { ...warehouse, WarehouseName: name } : warehouse
    }),
  }
}

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ itemCode: string }> }
) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const params = await paramsPromise
    const item = await getSapItem(params.itemCode, parseSelectParam(request))
    const warehouses = shouldIncludeWarehouseNames(request) && Array.isArray(item.ItemWarehouseInfoCollection)
      ? await getSapActiveWarehouses()
      : []
    return NextResponse.json({ success: true, item: withWarehouseNames(item, warehouses) })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
