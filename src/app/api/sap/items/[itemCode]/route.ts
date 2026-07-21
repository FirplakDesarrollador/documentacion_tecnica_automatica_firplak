import { NextResponse } from 'next/server'
import { apiGuard } from '@/utils/auth/access'
import { getSapItem, SapServiceLayerError } from '@/lib/sap/serviceLayer'
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

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ itemCode: string }> }
) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const params = await paramsPromise
    const item = await getSapItem(params.itemCode, parseSelectParam(request))
    return NextResponse.json({ success: true, item })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
