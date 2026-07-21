import { NextRequest, NextResponse } from 'next/server'
import { apiGuard } from '@/utils/auth/access'
import { getSapItemBomTree, getSapItemBomChildren } from '@/lib/sap/serviceLayer'
import { sapApiErrorResponse } from '../../../_utils'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ itemCode: string }> }
) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const params = await paramsPromise
    const isChildren = request.nextUrl.searchParams.get('children') === 'true'

    if (isChildren) {
      const result = await getSapItemBomChildren(params.itemCode)
      if (result.error) {
        return NextResponse.json({ success: false, error: result.error }, { status: 500 })
      }
      return NextResponse.json({ success: true, lines: result.lines })
    }

    const result = await getSapItemBomTree(params.itemCode)

    if (!result.tree && !result.error) {
      return NextResponse.json({ success: true, hasBom: false })
    }

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, hasBom: true, tree: result.tree })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
