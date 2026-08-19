import { buildEstimationBomHierarchy } from '@/lib/productDesign/estimationBomHierarchy'
import type { EstimationDraftBomLine } from '@/lib/productDesign/estimationDraft'

const COST_CATEGORY_LABELS: Record<string, string> = {
  material: 'Material',
  packaging: 'Empaque',
  mo: 'Mano de obra',
  cif: 'CIF',
  other: 'Otro',
}

export type EstimationBomExportRow = {
  id: string
  level: number
  itemCode: string
  itemName: string
  costCategory: string
  quantity: number
  uom: string
  unitCost: number | null
  subtotal: number | null
}

export type EstimationBomProductInfo = {
  itemCode: string
  itemName: string
}

export function buildEstimationBomExportRows(
  lines: readonly EstimationDraftBomLine[],
  productInfo?: EstimationBomProductInfo,
): EstimationBomExportRow[] {
  const hierarchy = buildEstimationBomHierarchy(lines)
  const bomRows = hierarchy.map(row => {
    const qty = row.line.quantity ?? 0
    const cost = row.line.unitCost
    const subtotal = cost !== null ? qty * cost : null
    return {
      id: row.line.id,
      level: row.level + 2,
      itemCode: row.line.sapItemCode ?? '',
      itemName: row.line.itemName ?? '',
      costCategory: COST_CATEGORY_LABELS[row.line.costCategory ?? ''] ?? row.line.costCategory ?? '',
      quantity: qty,
      uom: row.line.uom ?? '',
      unitCost: cost,
      subtotal,
    }
  })
  if (productInfo) {
    const rootRow: EstimationBomExportRow = {
      id: 'root',
      level: 1,
      itemCode: productInfo.itemCode,
      itemName: productInfo.itemName,
      costCategory: '',
      quantity: 1,
      uom: 'UN',
      unitCost: null,
      subtotal: null,
    }
    return [rootRow, ...bomRows]
  }
  return bomRows
}

export function buildEstimationBomClipboardText(rows: EstimationBomExportRow[]): string {
  const header = ['Nivel', 'Código', 'Descripción', 'Categoría', 'Cantidad', 'Unidad', 'Costo unitario', 'Subtotal']
  const body = rows.map(row => [
    row.level,
    row.itemCode,
    row.itemName,
    row.costCategory,
    row.quantity,
    row.uom,
    row.unitCost ?? '',
    row.subtotal ?? '',
  ].map(value => String(value).replace(/[\t\r\n]+/g, ' ')).join('\t'))
  return [header.join('\t'), ...body].join('\n')
}
