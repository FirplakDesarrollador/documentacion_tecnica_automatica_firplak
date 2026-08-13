import 'server-only'

import ExcelJS from 'exceljs'
import type { CostedBomExportRow } from './costedBom'

const COST_SOURCE_LABELS: Record<CostedBomExportRow['costSource'], string> = {
  last_purchase_receipt_warehouse_average: 'Promedio de bodega de última entrada de compra',
  mp01_warehouse_average: 'Promedio vigente MP-01',
  unavailable: 'Costo pendiente',
  bom_rollup: 'Sub-LdM calculada por componentes',
}

export function costSourceLabel(source: CostedBomExportRow['costSource']): string {
  return COST_SOURCE_LABELS[source]
}

export function buildCostedBomClipboardText(rows: CostedBomExportRow[]): string {
  const header = [
    'Nivel',
    'Código',
    'Descripción',
    'Cantidad',
    'Cantidad acumulada',
    'Unidad',
    'Bodega descarga componente',
    'Bodega destino LdM',
    'Bodega costo',
    'Fecha última entrada',
    'Documento entrada',
    'Fuente costo',
    'Costo unitario',
    'Subtotal',
    'Estado',
    'Advertencia',
  ]
  const body = rows.map(row => [
    row.level,
    row.itemCode,
    row.itemName,
    row.quantity,
    row.accumulatedQuantity,
    row.inventoryUom ?? '',
    row.componentWarehouse ?? '',
    row.outputWarehouse ?? '',
    row.warehouseCode ?? '',
    row.receiptDate ?? '',
    row.receiptDocument ?? '',
    costSourceLabel(row.costSource),
    row.unitCost ?? '',
    row.subtotalCost ?? row.knownSubtotalCost,
    row.isPartial ? 'Parcial' : 'Completo',
    row.warning ?? '',
  ].map(value => String(value).replace(/[\t\r\n]+/g, ' ')).join('\t'))
  return [header.join('\t'), ...body].join('\n')
}

export async function buildCostedBomWorkbook(itemCode: string, rows: CostedBomExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SamiGen'
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet('LdM costada')
  worksheet.columns = [
    { header: 'Nivel', key: 'level', width: 9 },
    { header: 'Código', key: 'itemCode', width: 26 },
    { header: 'Descripción', key: 'itemName', width: 48 },
    { header: 'Cantidad', key: 'quantity', width: 14 },
    { header: 'Cantidad acumulada', key: 'accumulatedQuantity', width: 20 },
    { header: 'Unidad', key: 'inventoryUom', width: 12 },
    { header: 'Bodega descarga componente', key: 'componentWarehouse', width: 28 },
    { header: 'Bodega destino LdM', key: 'outputWarehouse', width: 24 },
    { header: 'Bodega costo', key: 'warehouseCode', width: 16 },
    { header: 'Fecha última entrada', key: 'receiptDate', width: 20 },
    { header: 'Documento entrada', key: 'receiptDocument', width: 20 },
    { header: 'Fuente costo', key: 'costSource', width: 42 },
    { header: 'Costo unitario', key: 'unitCost', width: 18 },
    { header: 'Subtotal', key: 'subtotalCost', width: 18 },
    { header: 'Estado', key: 'state', width: 14 },
    { header: 'Advertencia', key: 'warning', width: 70 },
  ]

  for (const row of rows) {
    worksheet.addRow({
      level: row.level,
      itemCode: row.itemCode,
      itemName: row.itemName,
      quantity: row.quantity,
      accumulatedQuantity: row.accumulatedQuantity,
      inventoryUom: row.inventoryUom ?? '',
      componentWarehouse: row.componentWarehouse ?? '',
      outputWarehouse: row.outputWarehouse ?? '',
      warehouseCode: row.warehouseCode ?? '',
      receiptDate: row.receiptDate ?? '',
      receiptDocument: row.receiptDocument ?? '',
      costSource: costSourceLabel(row.costSource),
      unitCost: row.unitCost,
      subtotalCost: row.subtotalCost ?? row.knownSubtotalCost,
      state: row.isPartial ? 'Parcial' : 'Completo',
      warning: row.warning ?? '',
    })
  }

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.getColumn('quantity').numFmt = '#,##0.####'
  worksheet.getColumn('accumulatedQuantity').numFmt = '#,##0.####'
  worksheet.getColumn('unitCost').numFmt = '$#,##0.00'
  worksheet.getColumn('subtotalCost').numFmt = '$#,##0.00'

  const root = rows[0]
  if (root) {
    worksheet.addRow({})
    const summary = worksheet.addRow({
      itemName: `Costo ${root.isPartial ? 'parcial' : 'total'} por unidad final de ${itemCode}`,
      subtotalCost: root.unitCost ?? root.knownSubtotalCost,
      state: root.isPartial ? `${root.pendingCostCount} costos pendientes` : 'Completo',
    })
    summary.font = { bold: true }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
