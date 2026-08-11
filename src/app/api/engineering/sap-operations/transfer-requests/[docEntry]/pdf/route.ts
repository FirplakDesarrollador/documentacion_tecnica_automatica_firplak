import { NextResponse } from 'next/server'

import { launchBrowser } from '@/lib/export/launchBrowser'
import { getSapTransferRequestOperationByDocEntry } from '@/lib/sap/operationAudit'
import { getSapTransferRequestByDocEntry } from '@/lib/sap/transferRequests'
import { buildTransferRequestPdfHtml } from '@/lib/sap/transferRequestPdf'
import { apiGuard } from '@/utils/auth/access'

import { readDocEntry, transferRequestErrorResponse } from '../../_utils'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ docEntry: string }> },
) {
  const guard = await apiGuard('module:engineering')
  if (guard.response) return guard.response

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null

  try {
    const { docEntry: rawDocEntry } = await params
    const docEntry = readDocEntry(rawDocEntry)
    const operation = await getSapTransferRequestOperationByDocEntry(docEntry)
    if (!operation) {
      return NextResponse.json({ success: false, error: 'La solicitud no fue creada desde esta aplicación.' }, { status: 404 })
    }

    const request = await getSapTransferRequestByDocEntry(docEntry)
    const docNum = request.docNum ?? operation.sapDocNum
    if (docNum === null) {
      return NextResponse.json({ success: false, error: 'SAP no devolvió DocNum para generar el comprobante.' }, { status: 409 })
    }

    const html = buildTransferRequestPdfHtml({
      docNum,
      documentDate: request.docDate,
      dueDate: request.dueDate,
      sourceWarehouse: request.fromWarehouse ?? operation.sourceWarehouse ?? '-',
      destinationWarehouse: request.toWarehouse ?? operation.destinationWarehouse ?? '-',
      businessComment: request.businessComment ?? operation.businessComment ?? 'No disponible',
      lines: request.lines.map(line => ({
        itemCode: line.itemCode,
        itemName: line.itemDescription,
        unitOfMeasure: line.unitOfMeasure,
        quantity: line.quantity,
      })),
    })

    browser = await launchBrowser()
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.evaluateHandle('document.fonts.ready')
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="solicitud-traslado-${docNum}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return transferRequestErrorResponse(error)
  } finally {
    if (browser) await browser.close()
  }
}
