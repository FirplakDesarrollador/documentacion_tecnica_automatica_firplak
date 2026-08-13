import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { getSapCostedBom, SAP_MP01_COST_CACHE_TAG } from '@/lib/sap/consultaCostedBom'
import { flattenCostedBomTree } from '@/lib/sap/costedBom'
import { apiGuard } from '@/utils/auth/access'
import { sapApiErrorResponse } from '../../../_utils'

export const runtime = 'nodejs'
export const maxDuration = 60

async function getCostedBomResponse(itemCode: string, refreshCosts = false) {
  const result = await getSapCostedBom(itemCode, { refreshCosts })
  if (!result) return NextResponse.json({ success: true, hasBom: false })
  return NextResponse.json({
    success: true,
    hasBom: true,
    tree: result.tree,
    rows: flattenCostedBomTree(result.tree),
    costsAsOf: result.costsAsOf,
    costCacheTtlSeconds: result.costCacheTtlSeconds,
    queryTiming: result.queryTiming,
  })
}

export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ itemCode: string }> },
) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const { itemCode } = await paramsPromise
    return await getCostedBomResponse(itemCode)
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}

export async function POST(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ itemCode: string }> },
) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const { itemCode } = await paramsPromise
    revalidateTag(SAP_MP01_COST_CACHE_TAG, { expire: 0 })
    return await getCostedBomResponse(itemCode, true)
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
