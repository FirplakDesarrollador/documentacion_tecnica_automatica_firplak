export type SapCostSource =
  | 'last_purchase_receipt_warehouse_average'
  | 'mp01_warehouse_average'
  | 'unavailable'
  | 'bom_rollup'

export type DirectSapCost = {
  unitCost: number | null
  source: Exclude<SapCostSource, 'bom_rollup'>
  warehouseCode: string | null
  documentEntry: number | null
  documentNumber: number | null
  documentDate: string | null
  warning: string | null
}

export type CostedBomCategory = 'material' | 'packaging' | 'mo' | 'cif'

export type CostedBomInputNode = {
  itemCode: string
  itemName: string
  quantity: number
  inventoryUom: string | null
  bomQuantity: number | null
  componentWarehouse: string | null
  outputWarehouse: string | null
  lines: CostedBomInputNode[]
  directCost: DirectSapCost
  costCategory: CostedBomCategory
}

export type CostedBomNode = Omit<CostedBomInputNode, 'lines'> & {
  lines: CostedBomNode[]
  level: number
  structuralUnitCost: number | null
  knownStructuralUnitCost: number
  lineSubtotalCost: number | null
  knownLineSubtotalCost: number
  pendingCostCount: number
  isPartial: boolean
  costSource: SapCostSource
}

function positiveFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0
}

function safeQuantity(value: number | null): number {
  return positiveFinite(value) ? value : 1
}

function costedNode(input: CostedBomInputNode, level: number): CostedBomNode {
  const lines = input.lines.map(line => costedNode(line, level + 1))

  if (lines.length === 0) {
    const directUnitCost = input.directCost.unitCost
    const knownStructuralUnitCost = positiveFinite(directUnitCost) ? directUnitCost : 0
    const hasCost = knownStructuralUnitCost > 0
    return {
      ...input,
      lines,
      level,
      structuralUnitCost: hasCost ? knownStructuralUnitCost : null,
      knownStructuralUnitCost,
      lineSubtotalCost: hasCost ? knownStructuralUnitCost * input.quantity : null,
      knownLineSubtotalCost: knownStructuralUnitCost * input.quantity,
      pendingCostCount: hasCost ? 0 : 1,
      isPartial: !hasCost,
      costSource: input.directCost.source,
    }
  }

  const bomQuantity = safeQuantity(input.bomQuantity)
  const knownStructuralUnitCost = lines.reduce(
    (total, line) => total + line.knownStructuralUnitCost * line.quantity,
    0,
  ) / bomQuantity
  const pendingCostCount = lines.reduce((total, line) => total + line.pendingCostCount, 0)
  const isPartial = pendingCostCount > 0

  return {
    ...input,
    lines,
    level,
    structuralUnitCost: isPartial ? null : knownStructuralUnitCost,
    knownStructuralUnitCost,
    lineSubtotalCost: isPartial ? null : knownStructuralUnitCost * input.quantity,
    knownLineSubtotalCost: knownStructuralUnitCost * input.quantity,
    pendingCostCount,
    isPartial,
    costSource: 'bom_rollup',
  }
}

export function buildCostedBomTree(input: CostedBomInputNode): CostedBomNode {
  return costedNode(input, 1)
}

export type CostedBomExportRow = {
  level: number
  itemCode: string
  itemName: string
  quantity: number
  accumulatedQuantity: number
  inventoryUom: string | null
  componentWarehouse: string | null
  outputWarehouse: string | null
  warehouseCode: string | null
  receiptDate: string | null
  receiptDocument: number | null
  costSource: SapCostSource
  unitCost: number | null
  subtotalCost: number | null
  knownSubtotalCost: number
  isPartial: boolean
  pendingCostCount: number
  warning: string | null
  costCategory: CostedBomCategory
  subtotalMP: number | null
  subtotalMO: number | null
  subtotalCIF: number | null
}

export function flattenCostedBomTree(tree: CostedBomNode): CostedBomExportRow[] {
  const rows: CostedBomExportRow[] = []

  function visit(node: CostedBomNode, accumulatedQuantity: number, parentBomQuantity: number | null) {
    const normalizedAccumulatedQuantity = parentBomQuantity === null
      ? 1
      : accumulatedQuantity * node.quantity / safeQuantity(parentBomQuantity)
    const knownSubtotal = node.knownLineSubtotalCost
    const categorizedSubtotal = node.level === 1 || node.lines.length > 0 ? null : knownSubtotal
    rows.push({
      level: node.level,
      itemCode: node.itemCode,
      itemName: node.itemName,
      quantity: node.quantity,
      accumulatedQuantity: normalizedAccumulatedQuantity,
      inventoryUom: node.inventoryUom,
      componentWarehouse: node.componentWarehouse,
      outputWarehouse: node.outputWarehouse,
      warehouseCode: node.directCost.warehouseCode,
      receiptDate: node.directCost.documentDate,
      receiptDocument: node.directCost.documentNumber,
      costSource: node.costSource,
      unitCost: node.structuralUnitCost,
      subtotalCost: node.lineSubtotalCost,
      knownSubtotalCost: knownSubtotal,
      isPartial: node.isPartial,
      pendingCostCount: node.pendingCostCount,
      warning: node.directCost.warning,
      costCategory: node.costCategory,
      subtotalMP: categorizedSubtotal !== null && (node.costCategory === 'material' || node.costCategory === 'packaging') ? categorizedSubtotal : null,
      subtotalMO: categorizedSubtotal !== null && node.costCategory === 'mo' ? categorizedSubtotal : null,
      subtotalCIF: categorizedSubtotal !== null && node.costCategory === 'cif' ? categorizedSubtotal : null,
    })
    for (const line of node.lines) visit(line, normalizedAccumulatedQuantity, node.bomQuantity)
  }

  visit(tree, 1, null)
  return rows
}
