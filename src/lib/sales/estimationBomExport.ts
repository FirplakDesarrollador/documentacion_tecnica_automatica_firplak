import { buildEstimationBomHierarchy, getEstimationBomDescendantIds } from '@/lib/productDesign/estimationBomHierarchy'
import { evaluateEstimationBomCosting, type EstimationBomCostLine, type EstimationBomCostingResult } from '@/lib/productDesign/estimationBomCosting'
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
  parentId: string | null
  level: number
  itemCode: string
  itemName: string
  costCategory: string
  quantity: number
  uom: string
  unitCost: number | null
  subtotalMP: number | null
  subtotalMO: number | null
  subtotalCIF: number | null
  effectiveQuantity?: number
  bomQuantity?: number | null
  isContainer: boolean
}

export type EstimationBomProductInfo = {
  itemCode: string
  itemName: string
}

function toCostLine(line: EstimationDraftBomLine): EstimationBomCostLine | null {
  if (line.quantity === null || line.costCategory === null || line.costStrategy === null) return null
  if (line.costEvidence?.source === 'manual' && !line.manualCostReason?.trim()) return null
  const rawBomQuantity = line.extensions.sapBomQuantity
  return {
    id: line.id,
    parentId: line.parentId,
    quantity: line.quantity,
    uom: line.uom,
    costCategory: line.costCategory,
    costStrategy: line.costStrategy,
    origin: line.origin,
    bomQuantity: typeof rawBomQuantity === 'number' && Number.isFinite(rawBomQuantity) && rawBomQuantity > 0 ? rawBomQuantity : null,
    unitCost: line.unitCost,
  }
}

/** Keeps the export and the Sales summary on the same costing input. */
export function buildEstimationBomCostLines(
  lines: readonly EstimationDraftBomLine[],
): (EstimationBomCostLine | null)[] {
  const ignoredLineIds = new Set<string>()
  lines.forEach(line => {
    if (line.origin === 'manual' && line.costStrategy === 'manual_override') {
      getEstimationBomDescendantIds(lines, line.id).forEach(id => ignoredLineIds.add(id))
    }
  })
  return lines.filter(line => !ignoredLineIds.has(line.id)).map(toCostLine)
}

export function evaluateEstimationBomExportCosting(
  lines: readonly EstimationDraftBomLine[],
): EstimationBomCostingResult {
  const costLines = buildEstimationBomCostLines(lines)
  if (costLines.some(line => line === null)) {
    return {
      ok: false,
      issues: [{
        code: 'quantity_invalid',
        lineId: null,
        relatedLineIds: [],
        message: 'Faltan cantidad, categoría o estrategia de costo en una o más líneas de la LdM.',
      }],
    }
  }
  return evaluateEstimationBomCosting({
    lines: costLines.filter((line): line is EstimationBomCostLine => line !== null),
  })
}

export function buildEstimationBomExportRows(
  lines: readonly EstimationDraftBomLine[],
  productInfo?: EstimationBomProductInfo,
): EstimationBomExportRow[] {
  const hierarchy = buildEstimationBomHierarchy(lines)
  const costing = evaluateEstimationBomExportCosting(lines)
  const valuations = costing.ok ? new Map(costing.lineValuations.map(valuation => [valuation.lineId, valuation])) : new Map()
  const bomRows = hierarchy.map(row => {
    const valuation = valuations.get(row.line.id)
    const subtotal = valuation && (!row.hasChildren || row.line.costStrategy !== 'expand_children')
      ? valuation.totalCost
      : null
    const category = row.line.costCategory
    const isContainer = row.hasChildren && row.line.costStrategy === 'expand_children'
    const rawBomQuantity = row.line.extensions.sapBomQuantity
    return {
      id: row.line.id,
      parentId: row.line.parentId,
      level: row.level + 2,
      itemCode: row.line.sapItemCode ?? '',
      itemName: row.line.itemName ?? '',
      costCategory: COST_CATEGORY_LABELS[category ?? ''] ?? category ?? '',
      quantity: row.line.quantity ?? 0,
      uom: row.line.uom ?? '',
      unitCost: isContainer ? null : valuation?.structuralUnitCost ?? null,
      subtotalMP: subtotal !== null && (category === 'material' || category === 'packaging') ? subtotal : null,
      subtotalMO: subtotal !== null && category === 'mo' ? subtotal : null,
      subtotalCIF: subtotal !== null && category === 'cif' ? subtotal : null,
      effectiveQuantity: valuation?.effectiveQuantity,
      bomQuantity: typeof rawBomQuantity === 'number' && Number.isFinite(rawBomQuantity) && rawBomQuantity > 0 ? rawBomQuantity : null,
      isContainer,
    }
  })
  if (productInfo) {
    const rootRow: EstimationBomExportRow = {
      id: 'root',
      parentId: null,
      level: 1,
      itemCode: productInfo.itemCode,
      itemName: productInfo.itemName,
      costCategory: '',
      quantity: 1,
      uom: 'UN',
      unitCost: null,
      subtotalMP: null,
      subtotalMO: null,
      subtotalCIF: null,
      isContainer: false,
    }
    return [rootRow, ...bomRows]
  }
  return bomRows
}

export function buildEstimationBomClipboardText(rows: EstimationBomExportRow[]): string {
  const header = ['Código', 'Descripción', 'Nivel', 'Categoría', 'Cantidad', 'Unidad', 'Costo unitario', 'Sub MP', 'Sub MO', 'Sub CIF']
  const decimal = (value: number): string => new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value)
  const clean = (value: string | number): string => String(value).replace(/[\t\r\n]+/g, ' ')
  const body = rows.map(row => [
    clean(row.itemCode),
    clean(row.itemName),
    clean(row.level),
    clean(row.costCategory),
    decimal(row.quantity),
    clean(row.uom),
    row.unitCost === null ? '' : decimal(row.unitCost),
    row.subtotalMP === null ? '' : decimal(row.subtotalMP),
    row.subtotalMO === null ? '' : decimal(row.subtotalMO),
    row.subtotalCIF === null ? '' : decimal(row.subtotalCIF),
  ].join('\t'))
  return [header.join('\t'), ...body].join('\n')
}
