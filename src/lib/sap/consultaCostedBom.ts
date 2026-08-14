import 'server-only'

import { unstable_cache } from 'next/cache'
import {
  getSapItemsByCodes,
  getSapItemsWithWarehouseAverage,
  type SapItemWarehouseAverage,
} from './serviceLayer'
import { loadFullSapBomHierarchy, type FullSapBomNode } from './fullBomHierarchy'
import {
  buildCostedBomTree,
  type CostedBomInputNode,
  type CostedBomNode,
  type DirectSapCost,
} from './costedBom'

export const SAP_MP01_COST_CACHE_SECONDS = 60 * 60 * 48
export const SAP_MP01_COST_CACHE_TAG = 'consulta-sap-mp01-costs'

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

function collectNodes(node: FullSapBomNode, nodes: FullSapBomNode[] = []): FullSapBomNode[] {
  nodes.push(node)
  for (const line of node.lines) collectNodes(line, nodes)
  return nodes
}

function normalizeItemCodes(itemCodes: string[]): string[] {
  return [...new Set(itemCodes.map(code => code.trim().toUpperCase()).filter(Boolean))].toSorted()
}

async function loadMp01CostSnapshot(itemCodesKey: string): Promise<CachedMp01CostSnapshot> {
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
}

const getCachedMp01CostSnapshot = unstable_cache(
  loadMp01CostSnapshot,
  ['consulta-sap-mp01-costs-v3'],
  {
    revalidate: SAP_MP01_COST_CACHE_SECONDS,
    tags: [SAP_MP01_COST_CACHE_TAG],
  },
)

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

export async function getSapCostedBom(
  itemCode: string,
  options: { refreshCosts?: boolean } = {},
): Promise<SapCostedBomResult | null> {
  const totalStartedAt = performance.now()
  const hierarchyStartedAt = performance.now()
  const { tree: root } = await loadFullSapBomHierarchy(itemCode)
  if (!root) return null
  const hierarchyMs = Math.round(performance.now() - hierarchyStartedAt)

  const itemCodes = normalizeItemCodes(collectNodes(root).map(node => node.itemCode))
  const itemCodesKey = itemCodes.join('|')
  const costSnapshotStartedAt = performance.now()
  const costSnapshot = options.refreshCosts
    ? await loadMp01CostSnapshot(itemCodesKey)
    : await getCachedMp01CostSnapshot(itemCodesKey)
  const costSnapshotMs = Math.round(performance.now() - costSnapshotStartedAt)
  const itemMasterByCode = new Map(costSnapshot.itemMasters.map(item => [item.itemCode, item]))
  const averagesByCode = new Map(costSnapshot.averages.map(average => [average.itemCode, average]))

  function toCostedInput(node: FullSapBomNode): CostedBomInputNode {
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
