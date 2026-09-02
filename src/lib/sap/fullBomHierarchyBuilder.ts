import type { SapItemBom } from './serviceLayer'

export type FullSapBomNode = {
  itemCode: string
  itemName: string
  quantity: number
  inventoryUom: string | null
  bomQuantity: number | null
  componentWarehouse: string | null
  outputWarehouse: string | null
  itemsGroupCode?: string | null
  materialGroup?: string | null
  family?: string | null
  group?: string | null
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
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
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
    const itemsGroupCode = textField(itemMaster, 'ItemsGroupCode')
    const materialGroup = textField(itemMaster, 'MaterialGroup')
    const family = textField(itemMaster, 'U_Familia')
    const group = textField(itemMaster, 'U_Grupo')

    if (ancestry.has(code)) {
      return {
        itemCode: code,
        itemName,
        quantity,
        inventoryUom,
        bomQuantity: null,
        componentWarehouse,
        outputWarehouse: null,
        itemsGroupCode,
        materialGroup,
        family,
        group,
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
        itemsGroupCode,
        materialGroup,
        family,
        group,
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
      itemsGroupCode,
      materialGroup,
      family,
      group,
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
