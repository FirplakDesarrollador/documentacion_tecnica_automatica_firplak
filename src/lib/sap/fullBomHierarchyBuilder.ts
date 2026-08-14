import type { SapItemBom } from './serviceLayer'

export type FullSapBomNode = {
  itemCode: string
  itemName: string
  quantity: number
  inventoryUom: string | null
  bomQuantity: number | null
  componentWarehouse: string | null
  outputWarehouse: string | null
  lines: FullSapBomNode[]
  cycleDetected: boolean
}

export type FullSapBomHierarchyResult = {
  tree: FullSapBomNode | null
  branchErrors: Record<string, string>
}

function normalizedCode(value: string): string {
  return value.trim().toUpperCase()
}

function textField(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function buildFullSapBomHierarchy(
  rootItemCode: string,
  bomsByCode: ReadonlyMap<string, SapItemBom>,
  itemMasters: ReadonlyMap<string, Record<string, unknown>>,
  branchErrors: Record<string, string> = {},
): FullSapBomHierarchyResult {
  const rootCode = normalizedCode(rootItemCode)
  const rootBom = bomsByCode.get(rootCode)
  if (!rootBom) return { tree: null, branchErrors }

  function buildNode(
    itemCode: string,
    fallbackName: string,
    quantity: number,
    fallbackUom: string | null,
    componentWarehouse: string | null,
    ancestry: Set<string>,
  ): FullSapBomNode {
    const code = normalizedCode(itemCode)
    const itemMaster = itemMasters.get(code)
    const itemName = textField(itemMaster, 'ItemName') ?? fallbackName
    const inventoryUom = textField(itemMaster, 'InventoryUOM') ?? fallbackUom

    if (ancestry.has(code)) {
      return {
        itemCode: code,
        itemName,
        quantity,
        inventoryUom,
        bomQuantity: null,
        componentWarehouse,
        outputWarehouse: null,
        lines: [],
        cycleDetected: true,
      }
    }

    const bom = bomsByCode.get(code)
    if (!bom) {
      return {
        itemCode: code,
        itemName,
        quantity,
        inventoryUom,
        bomQuantity: null,
        componentWarehouse,
        outputWarehouse: null,
        lines: [],
        cycleDetected: false,
      }
    }

    const nextAncestry = new Set(ancestry)
    nextAncestry.add(code)
    return {
      itemCode: code,
      itemName: bom.productDescription ?? itemName,
      quantity,
      inventoryUom,
      bomQuantity: bom.quantity,
      componentWarehouse,
      outputWarehouse: bom.warehouse,
      lines: bom.lines.map(line => buildNode(
        line.ItemCode,
        line.ItemName,
        line.Quantity,
        line.InventoryUOM,
        line.Warehouse,
        nextAncestry,
      )),
      cycleDetected: false,
    }
  }

  return {
    tree: buildNode(rootCode, rootBom.productDescription ?? '', rootBom.quantity, null, null, new Set()),
    branchErrors,
  }
}
