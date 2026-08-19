import { NextResponse } from 'next/server'
import { buildEstimationBomWorkbook } from '@/lib/sales/estimationBomWorkbook'
import { getEstimationBomLinesForExport } from '@/app/sales/estimations/actions'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await paramsPromise
    const data = await getEstimationBomLinesForExport(id)
    const workbook = await buildEstimationBomWorkbook(data.name, data.rows)
    const filename = `LDM_${data.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
    return new NextResponse(workbook as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al exportar la LdM.'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
