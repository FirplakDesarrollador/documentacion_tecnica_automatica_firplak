import 'server-only'

import ExcelJS from 'exceljs'
import type { EstimationBomCostingSuccess } from '@/lib/productDesign/estimationBomCosting'
import type { SalesPricingFormulaConfig, SalesPricingResult } from '@/lib/productDesign/salesPricingFormulas'
import type { EstimationBomExportRow } from './estimationBomExport'

export type EstimationBomWorkbookPricing = {
  currency: string
  contributionMarginPct: number | null
  discountPct: number | null
  formulaConfig: SalesPricingFormulaConfig
  totals: EstimationBomCostingSuccess['totals'] | null
  calculated: SalesPricingResult | null
}

type FormulaCellValue = { formula: string; result?: number | string }

function formulaNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '0'
}

function setFormula(cell: ExcelJS.Cell, formula: string, result: number | string | null): void {
  const value: FormulaCellValue = { formula: formula.startsWith('=') ? formula.slice(1) : formula }
  if (result !== null) value.result = result
  cell.value = value
}

type QuantityFormulaParts = {
  ownQuantity: string
  ancestorQuantities: string[]
}

function effectiveQuantityFormulaParts(
  row: EstimationBomExportRow,
  rowsById: ReadonlyMap<string, EstimationBomExportRow>,
  excelRows: ReadonlyMap<string, number>,
): QuantityFormulaParts {
  const ownQuantity = `E${excelRows.get(row.id) ?? 0}`
  const ancestorQuantities: string[] = []
  const visited = new Set<string>()
  let parentId = row.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = rowsById.get(parentId)
    const parentExcelRow = parent ? excelRows.get(parent.id) : undefined
    if (!parent || parentExcelRow === undefined) break
    let ancestorQuantity = `E${parentExcelRow}`
    if (parent.bomQuantity !== null && parent.bomQuantity !== undefined && parent.bomQuantity !== 1) {
      ancestorQuantity += `/${formulaNumber(parent.bomQuantity)}`
    }
    ancestorQuantities.push(ancestorQuantity)
    parentId = parent.parentId
  }
  return { ownQuantity, ancestorQuantities }
}

function replacePricingIdentifiers(expression: string, references: Record<string, string>): string {
  return expression.replace(/[a-z_][a-z0-9_]*/giu, identifier => references[identifier.toLowerCase()] ?? identifier)
}

function styleSectionHeader(row: ExcelJS.Row, lastColumn: number): void {
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = row.getCell(column)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  }
}

function styleTotalRow(row: ExcelJS.Row, lastColumn: number): void {
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = row.getCell(column)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  }
}

export async function buildEstimationBomWorkbook(
  estimationName: string,
  rows: EstimationBomExportRow[],
  pricing: EstimationBomWorkbookPricing,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SamiGen'
  workbook.created = new Date()
  workbook.calcProperties.fullCalcOnLoad = true
  const worksheet = workbook.addWorksheet('LdM')
  worksheet.columns = [
    { header: 'Código', key: 'itemCode', width: 26 },
    { header: 'Descripción', key: 'itemName', width: 48 },
    { header: 'Nivel', key: 'level', width: 9 },
    { header: 'Categoría', key: 'costCategory', width: 18 },
    { header: 'Cantidad', key: 'quantity', width: 14 },
    { header: 'Unidad', key: 'uom', width: 12 },
    { header: 'Costo Und.', key: 'unitCost', width: 18 },
    { header: 'Sub MP', key: 'subtotalMP', width: 16 },
    { header: 'Sub MO', key: 'subtotalMO', width: 16 },
    { header: 'Sub CIF', key: 'subtotalCIF', width: 16 },
  ]

  const excelRows = new Map<string, number>()
  rows.forEach(row => {
    const excelRow = worksheet.addRow({
      level: row.level,
      itemCode: row.itemCode,
      itemName: row.itemName,
      costCategory: row.costCategory,
      quantity: row.quantity,
      uom: row.uom,
      unitCost: row.unitCost,
      subtotalMP: null,
      subtotalMO: null,
      subtotalCIF: null,
    }).number
    excelRows.set(row.id, excelRow)
  })

  styleSectionHeader(worksheet.getRow(1), 10)
  const rowsById = new Map(rows.map(row => [row.id, row]))
  rows.forEach(row => {
    const excelRow = excelRows.get(row.id) ?? 0
    const worksheetRow = worksheet.getRow(excelRow)
    if (row.isContainer) return
    const quantity = effectiveQuantityFormulaParts(row, rowsById, excelRows)
    const subtotalFormula = `=${quantity.ownQuantity}*G${excelRow}${quantity.ancestorQuantities.map(factor => `*${factor}`).join('')}`
    if (row.subtotalMP !== null) setFormula(worksheetRow.getCell('H'), subtotalFormula, row.subtotalMP)
    if (row.subtotalMO !== null) setFormula(worksheetRow.getCell('I'), subtotalFormula, row.subtotalMO)
    if (row.subtotalCIF !== null) setFormula(worksheetRow.getCell('J'), subtotalFormula, row.subtotalCIF)
  })

  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.getColumn('quantity').numFmt = '#,##0.####'
  worksheet.getColumn('unitCost').numFmt = '#,##0.00'
  worksheet.getColumn('subtotalMP').numFmt = '#,##0.00'
  worksheet.getColumn('subtotalMO').numFmt = '#,##0.00'
  worksheet.getColumn('subtotalCIF').numFmt = '#,##0.00'

  worksheet.addRow({})
  const totalsHeader = worksheet.addRow({})
  totalsHeader.getCell('A').value = `Totales — ${estimationName}`
  totalsHeader.getCell('B').value = 'Total'
  styleSectionHeader(totalsHeader, 2)
  const firstDataRow = 2
  const lastDataRow = Math.max(firstDataRow, rows.length + 1)
  const totalRows = new Map<string, number>()
  const totalDefinitions = [
    ['Total MP sin empaque', `=SUMIF($D$${firstDataRow}:$D$${lastDataRow},"Material",$H$${firstDataRow}:$H$${lastDataRow})`, pricing.totals?.byCategory.material ?? null],
    ['Total MP Empaque', `=SUMIF($D$${firstDataRow}:$D$${lastDataRow},"Empaque",$H$${firstDataRow}:$H$${lastDataRow})`, pricing.totals?.byCategory.packaging ?? null],
    ['Total MO', `=SUMIF($D$${firstDataRow}:$D$${lastDataRow},"Mano de obra",$I$${firstDataRow}:$I$${lastDataRow})`, pricing.totals?.byCategory.mo ?? null],
    ['Total CIF', `=SUMIF($D$${firstDataRow}:$D$${lastDataRow},"CIF",$J$${firstDataRow}:$J$${lastDataRow})`, pricing.totals?.byCategory.cif ?? null],
  ] as const
  totalDefinitions.forEach(([label, formula, result]) => {
    const row = worksheet.addRow({})
    row.getCell('A').value = label
    setFormula(row.getCell('B'), formula, result)
    totalRows.set(label, row.number)
  })
  if ((pricing.totals?.byCategory.other ?? 0) !== 0) {
    const row = worksheet.addRow({})
    row.getCell('A').value = 'Total Otros'
    setFormula(row.getCell('B'), `=${formulaNumber(pricing.totals?.byCategory.other ?? 0)}`, pricing.totals?.byCategory.other ?? null)
    totalRows.set('Total Otros', row.number)
  }
  const generalRow = worksheet.addRow({})
  generalRow.getCell('A').value = 'Total General'
  const totalStart = totalRows.get('Total MP sin empaque') ?? generalRow.number
  setFormula(generalRow.getCell('B'), `=SUM(B${totalStart}:B${generalRow.number - 1})`, pricing.totals?.expandedTotal ?? null)
  styleTotalRow(generalRow, 2)
  totalRows.set('Total General', generalRow.number)

  worksheet.addRow({})
  const pricingHeader = worksheet.addRow({})
  pricingHeader.getCell('A').value = 'Pricing'
  pricingHeader.getCell('B').value = 'Valor'
  styleSectionHeader(pricingHeader, 2)
  const pricingRows = new Map<string, number>()
  const addPricingRow = (label: string, value: number | null, formula?: string, editable = false) => {
    const row = worksheet.addRow({})
    row.getCell('A').value = label
    row.getCell('B').value = value
    if (formula) setFormula(row.getCell('B'), formula, value)
    if (editable) row.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
    pricingRows.set(label, row.number)
    return row.number
  }
  const mcRow = addPricingRow('MC %', pricing.contributionMarginPct, undefined, true)
  const discountRow = addPricingRow('Descuento %', pricing.discountPct, undefined, true)
  const materialTotalRow = totalRows.get('Total MP sin empaque') ?? generalRow.number
  const packagingTotalRow = totalRows.get('Total MP Empaque') ?? generalRow.number
  const expandedTotalRow = totalRows.get('Total General') ?? generalRow.number
  const materialCostRow = addPricingRow('Costo MP Total', pricing.totals?.materialsAndPackaging ?? null, `=B${materialTotalRow}+B${packagingTotalRow}`)
  const expandedCostRow = addPricingRow('Costo Ampliado', pricing.totals?.expandedTotal ?? null, `=B${expandedTotalRow}`)
  const references: Record<string, string> = {
    costo_materia_prima: `B${materialCostRow}`,
    costo_ampliado: `B${expandedCostRow}`,
    mc_pct: `B${mcRow}`,
    descuento_pct: `B${discountRow}`,
    precio_minimo: `B${pricingRows.get('Precio Mínimo') ?? expandedCostRow}`,
    precio_maximo: `B${pricingRows.get('Precio Máximo') ?? expandedCostRow}`,
  }
  const minimumFormula = `=${replacePricingIdentifiers(pricing.formulaConfig.minimumPrice, references)}`
  const minimumRow = addPricingRow('Precio Mínimo', pricing.calculated?.minimumPrice ?? null, minimumFormula)
  references.precio_minimo = `B${minimumRow}`
  const maximumFormula = `=${replacePricingIdentifiers(pricing.formulaConfig.maximumPrice, references)}`
  const maximumRow = addPricingRow('Precio Máximo', pricing.calculated?.maximumPrice ?? null, maximumFormula)
  references.precio_maximo = `B${maximumRow}`
  addPricingRow('PVP', pricing.calculated?.pvp ?? null, `=${replacePricingIdentifiers(pricing.formulaConfig.pvp, references)}`)
  worksheet.getColumn('B').numFmt = '#,##0.00'
  worksheet.getCell(`B${mcRow}`).numFmt = '0.00%'
  worksheet.getCell(`B${discountRow}`).numFmt = '0.00%'

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
