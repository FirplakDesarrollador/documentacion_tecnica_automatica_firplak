import { NextResponse } from 'next/server'
import { buildCostedBomWorkbook } from '@/lib/sap/costedBomExport'
import { flattenCostedBomTree } from '@/lib/sap/costedBom'
import { getSapCostedBom } from '@/lib/sap/consultaCostedBom'
import { apiGuard } from '@/utils/auth/access'
import { sapApiErrorResponse } from '../../../../_utils'

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
    if (!result) return NextResponse.json({ success: false, error: 'Este artículo no tiene LdM en SAP.' }, { status: 404 })
    const workbook = await buildCostedBomWorkbook(result.tree.itemCode, flattenCostedBomTree(result.tree))
    const filename = `LDM_COSTADA_${result.tree.itemCode}_${new Date().toISOString().slice(0, 10)}.xlsx`
    return new NextResponse(workbook as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
