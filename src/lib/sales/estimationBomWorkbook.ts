import 'server-only'

import ExcelJS from 'exceljs'
import type { EstimationBomExportRow } from './estimationBomExport'

export async function buildEstimationBomWorkbook(estimationName: string, rows: EstimationBomExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SamiGen'
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet('LdM')
  worksheet.columns = [
    { header: 'Nivel', key: 'level', width: 9 },
    { header: 'Código', key: 'itemCode', width: 26 },
    { header: 'Descripción', key: 'itemName', width: 48 },
    { header: 'Categoría', key: 'costCategory', width: 18 },
    { header: 'Cantidad', key: 'quantity', width: 14 },
    { header: 'Unidad', key: 'uom', width: 12 },
    { header: 'Costo unitario', key: 'unitCost', width: 18 },
    { header: 'Subtotal', key: 'subtotal', width: 18 },
  ]

  for (const row of rows) {
    worksheet.addRow({
      level: row.level,
      itemCode: row.itemCode,
      itemName: row.itemName,
      costCategory: row.costCategory,
      quantity: row.quantity,
      uom: row.uom,
      unitCost: row.unitCost,
      subtotal: row.subtotal,
    })
  }

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.getColumn('quantity').numFmt = '#,##0.####'
  worksheet.getColumn('unitCost').numFmt = '$#,##0.00'
  worksheet.getColumn('subtotal').numFmt = '$#,##0.00'

  const totalSubtotal = rows.reduce((sum, row) => sum + (row.subtotal ?? 0), 0)
  worksheet.addRow({})
  const summary = worksheet.addRow({
    itemName: `Total LdM — ${estimationName}`,
    subtotal: totalSubtotal,
  })
  summary.font = { bold: true }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
