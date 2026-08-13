import { NextResponse } from 'next/server'
import { getSapCostedBom } from '@/lib/sap/consultaCostedBom'
import { flattenCostedBomTree } from '@/lib/sap/costedBom'
import { apiGuard } from '@/utils/auth/access'
import { sapApiErrorResponse } from '../../../_utils'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ itemCode: string }> },
) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const { itemCode } = await paramsPromise
    const result = await getSapCostedBom(itemCode)
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
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
