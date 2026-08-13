import 'server-only'

import { unstable_cache } from 'next/cache'
import {
  getSapItemBomsByCodes,
  getSapItemsByCodes,
  getSapItemsWithWarehouseAverage,
  type SapItemBom,
  type SapItemWarehouseAverage,
} from './serviceLayer'
import {
  buildCostedBomTree,
  type CostedBomInputNode,
  type CostedBomNode,
  type DirectSapCost,
} from './costedBom'

export const SAP_MP01_COST_CACHE_SECONDS = 60 * 60 * 48

type ExpandedBomNode = {
  itemCode: string
  itemName: string
  quantity: number
  inventoryUom: string | null
  bomQuantity: number | null
  componentWarehouse: string | null
  outputWarehouse: string | null
  lines: ExpandedBomNode[]
  cycleDetected: boolean
}

type CachedMp01CostSnapshot = {
  capturedAt: string
  averages: SapItemWarehouseAverage[]
  itemMasters: Array<{
    itemCode: string
    itemName: string | null
    inventoryUom: string | null
  }>
}

export type SapCostedBomResult = {
  tree: CostedBomNode
  costsAsOf: string
  costCacheTtlSeconds: number
  queryTiming: {
    hierarchyMs: number
    costAndMasterSnapshotMs: number
    totalMs: number
  }
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function positiveFinite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0
}

function collectNodes(node: ExpandedBomNode, nodes: ExpandedBomNode[] = []): ExpandedBomNode[] {
  nodes.push(node)
  for (const line of node.lines) collectNodes(line, nodes)
  return nodes
}

function normalizeItemCodes(itemCodes: string[]): string[] {
  return [...new Set(itemCodes.map(code => code.trim().toUpperCase()).filter(Boolean))].toSorted()
}

const getCachedMp01CostSnapshot = unstable_cache(
  async (itemCodesKey: string): Promise<CachedMp01CostSnapshot> => {
    const itemCodes = itemCodesKey.split('|').filter(Boolean)
    const [averages, itemMasters] = await Promise.all([
      getSapItemsWithWarehouseAverage(itemCodes, 'MP-01'),
      getSapItemsByCodes(itemCodes, ['ItemCode', 'ItemName', 'InventoryUOM']),
    ])
    return {
      capturedAt: new Date().toISOString(),
      averages: [...averages.values()],
      itemMasters: [...itemMasters].map(([itemCode, item]) => ({
        itemCode,
        itemName: textValue(item.ItemName),
        inventoryUom: textValue(item.InventoryUOM),
      })),
    }
  },
  ['consulta-sap-mp01-costs-v3'],
  { revalidate: SAP_MP01_COST_CACHE_SECONDS },
)

async function loadFullBomHierarchy(rootItemCode: string): Promise<ExpandedBomNode | null> {
  const rootCode = rootItemCode.trim().toUpperCase()
  const bomsByCode = new Map<string, SapItemBom>()
  const checkedCodes = new Set<string>()
  let pendingCodes = [rootCode]

  while (pendingCodes.length > 0) {
    const currentCodes = pendingCodes.filter(code => !checkedCodes.has(code))
    if (currentCodes.length === 0) break
    for (const code of currentCodes) checkedCodes.add(code)

    const currentBoms = await getSapItemBomsByCodes(currentCodes)
    for (const [treeCode, bom] of currentBoms) bomsByCode.set(treeCode, bom)

    const nextCodes = new Set<string>()
    for (const bom of currentBoms.values()) {
      for (const line of bom.lines) {
        const childCode = line.ItemCode.trim().toUpperCase()
        if (childCode && !checkedCodes.has(childCode)) nextCodes.add(childCode)
      }
    }
    pendingCodes = [...nextCodes]
  }

  const rootBom = bomsByCode.get(rootCode)
  if (!rootBom) return null

  function buildNode(
    itemCode: string,
    itemName: string,
    quantity: number,
    inventoryUom: string | null,
    componentWarehouse: string | null,
    ancestry: Set<string>,
  ): ExpandedBomNode {
    const normalizedCode = itemCode.trim().toUpperCase()
    if (ancestry.has(normalizedCode)) {
      return {
        itemCode: normalizedCode,
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

    const bom = bomsByCode.get(normalizedCode)
    if (!bom) {
      return {
        itemCode: normalizedCode,
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
    nextAncestry.add(normalizedCode)
    return {
      itemCode: bom.treeCode,
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

  return buildNode(
    rootBom.treeCode,
    rootBom.productDescription ?? '',
    rootBom.quantity,
    null,
    null,
    new Set(),
  )
}

function resolveDirectCost(
  average: SapItemWarehouseAverage | undefined,
  cycleDetected: boolean,
): DirectSapCost {
  if (cycleDetected) {
    return {
      unitCost: null,
      source: 'unavailable',
      warehouseCode: null,
      documentEntry: null,
      documentNumber: null,
      documentDate: null,
      warning: 'Se detectó una referencia circular en la LdM; esta rama no se costea para evitar un total incorrecto.',
    }
  }

  if (positiveFinite(average?.standardAveragePrice)) {
    return {
      unitCost: average.standardAveragePrice,
      source: 'mp01_warehouse_average',
      warehouseCode: 'MP-01',
      documentEntry: null,
      documentNumber: null,
      documentDate: null,
      warning: null,
    }
  }

  return {
    unitCost: null,
    source: 'unavailable',
    warehouseCode: 'MP-01',
    documentEntry: null,
    documentNumber: null,
    documentDate: null,
    warning: 'MP-01 no reporta un promedio positivo; el costo queda pendiente.',
  }
}

export async function getSapCostedBom(itemCode: string): Promise<SapCostedBomResult | null> {
  const totalStartedAt = performance.now()
  const hierarchyStartedAt = performance.now()
  const root = await loadFullBomHierarchy(itemCode)
  if (!root) return null
  const hierarchyMs = Math.round(performance.now() - hierarchyStartedAt)

  const itemCodes = normalizeItemCodes(collectNodes(root).map(node => node.itemCode))
  const itemCodesKey = itemCodes.join('|')
  const costSnapshotStartedAt = performance.now()
  const costSnapshot = await getCachedMp01CostSnapshot(itemCodesKey)
  const costSnapshotMs = Math.round(performance.now() - costSnapshotStartedAt)
  const itemMasterByCode = new Map(costSnapshot.itemMasters.map(item => [item.itemCode, item]))
  const averagesByCode = new Map(costSnapshot.averages.map(average => [average.itemCode, average]))

  function toCostedInput(node: ExpandedBomNode): CostedBomInputNode {
    const itemMaster = itemMasterByCode.get(node.itemCode)
    const average = averagesByCode.get(node.itemCode)
    return {
      itemCode: node.itemCode,
      itemName: itemMaster?.itemName ?? average?.itemName ?? node.itemName,
      quantity: node.quantity,
      inventoryUom: itemMaster?.inventoryUom ?? average?.inventoryUom ?? node.inventoryUom,
      bomQuantity: node.bomQuantity,
      componentWarehouse: node.componentWarehouse,
      outputWarehouse: node.outputWarehouse,
      lines: node.lines.map(toCostedInput),
      directCost: resolveDirectCost(average, node.cycleDetected),
    }
  }

  return {
    tree: buildCostedBomTree(toCostedInput(root)),
    costsAsOf: costSnapshot.capturedAt,
    costCacheTtlSeconds: SAP_MP01_COST_CACHE_SECONDS,
    queryTiming: {
      hierarchyMs,
      costAndMasterSnapshotMs: costSnapshotMs,
      totalMs: Math.round(performance.now() - totalStartedAt),
    },
  }
}
