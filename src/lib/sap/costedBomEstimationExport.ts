import type { EstimationBomCostingSuccess } from '@/lib/productDesign/estimationBomCosting'
import type { EstimationBomExportRow } from '@/lib/sales/estimationBomExport'
import type { CostedBomNode } from './costedBom'

const CATEGORY_LABELS = {
  material: 'Material',
  packaging: 'Empaque',
  mo: 'Mano de obra',
  cif: 'CIF',
} as const

export type SapCostedBomEstimationExport = {
  rows: EstimationBomExportRow[]
  totals: EstimationBomCostingSuccess['totals']
}

function createTotals(rows: readonly EstimationBomExportRow[]): EstimationBomCostingSuccess['totals'] {
  const material = rows.reduce((total, row) => total + (row.costCategory === 'Material' ? row.subtotalMP ?? 0 : 0), 0)
  const packaging = rows.reduce((total, row) => total + (row.costCategory === 'Empaque' ? row.subtotalMP ?? 0 : 0), 0)
  const mo = rows.reduce((total, row) => total + (row.subtotalMO ?? 0), 0)
  const cif = rows.reduce((total, row) => total + (row.subtotalCIF ?? 0), 0)
  return {
    byCategory: { material, packaging, mo, cif, other: 0 },
    materialsAndPackaging: material + packaging,
    expandedTotal: material + packaging + mo + cif,
  }
}

/** Converts the read-only SAP hierarchy to the established estimation workbook contract. */
export function convertSapCostedBomToEstimationExport(tree: CostedBomNode): SapCostedBomEstimationExport {
  const rows: EstimationBomExportRow[] = []

  function visit(node: CostedBomNode, id: string, parentId: string | null) {
    const isContainer = node.lines.length > 0
    const subtotal = isContainer ? null : node.knownLineSubtotalCost
    rows.push({
      id,
      parentId,
      level: node.level,
      itemCode: node.itemCode,
      itemName: node.itemName,
      costCategory: node.level === 1 ? '' : CATEGORY_LABELS[node.costCategory],
      quantity: node.quantity,
      uom: node.inventoryUom ?? '',
      unitCost: isContainer ? null : node.structuralUnitCost,
      subtotalMP: subtotal !== null && (node.costCategory === 'material' || node.costCategory === 'packaging') ? subtotal : null,
      subtotalMO: subtotal !== null && node.costCategory === 'mo' ? subtotal : null,
      subtotalCIF: subtotal !== null && node.costCategory === 'cif' ? subtotal : null,
      bomQuantity: node.bomQuantity,
      isContainer,
    })
    node.lines.forEach((line, index) => visit(line, `${id}.${index + 1}`, id))
  }

  visit(tree, 'root', null)
  return { rows, totals: createTotals(rows) }
}
