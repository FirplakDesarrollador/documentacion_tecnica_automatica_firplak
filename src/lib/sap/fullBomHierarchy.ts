import {
  getSapItemBom,
  getSapItemBomsByCodes,
  getSapItemsByCodes,
  type SapItemBom,
} from './serviceLayer'
import {
  buildFullSapBomHierarchy,
  type FullSapBomHierarchyResult,
} from './fullBomHierarchyBuilder'
export type { FullSapBomHierarchyResult, FullSapBomNode } from './fullBomHierarchyBuilder'

function normalizedCode(value: string): string {
  return value.trim().toUpperCase()
}


async function loadBomBatch(
  itemCodes: string[],
  branchErrors: Record<string, string>,
): Promise<Map<string, SapItemBom>> {
  try {
    return await getSapItemBomsByCodes(itemCodes)
  } catch {
    const settled = await Promise.allSettled(itemCodes.map(itemCode => getSapItemBom(itemCode)))
    const result = new Map<string, SapItemBom>()
    settled.forEach((entry, index) => {
      const itemCode = itemCodes[index]
      if (entry.status === 'fulfilled') {
        if (entry.value) result.set(itemCode, entry.value)
        return
      }
      branchErrors[itemCode] = entry.reason instanceof Error
        ? entry.reason.message
        : 'No fue posible consultar esta sub-LdM SAP.'
    })
    return result
  }
}

/**
 * Loads a complete SAP ProductTree graph without using ProductTreeLines.Price.
 * A failed batch falls back to isolated reads so one branch does not erase the
 * usable structure returned by the remaining branches.
 */
export async function loadFullSapBomHierarchy(rootItemCode: string): Promise<FullSapBomHierarchyResult> {
  const rootCode = normalizedCode(rootItemCode)
  const bomsByCode = new Map<string, SapItemBom>()
  const checkedCodes = new Set<string>()
  const branchErrors: Record<string, string> = {}
  let pendingCodes = [rootCode]

  while (pendingCodes.length > 0) {
    const currentCodes = pendingCodes.filter(code => !checkedCodes.has(code))
    if (currentCodes.length === 0) break
    currentCodes.forEach(code => checkedCodes.add(code))

    const currentBoms = await loadBomBatch(currentCodes, branchErrors)
    currentBoms.forEach((bom, treeCode) => bomsByCode.set(treeCode, bom))

    const nextCodes = new Set<string>()
    currentBoms.forEach(bom => {
      bom.lines.forEach(line => {
        const childCode = normalizedCode(line.ItemCode)
        if (childCode && !checkedCodes.has(childCode)) nextCodes.add(childCode)
      })
    })
    pendingCodes = [...nextCodes]
  }

  const rootBom = bomsByCode.get(rootCode)
  if (!rootBom) return { tree: null, branchErrors }

  const itemCodes = [...new Set([
    ...bomsByCode.keys(),
    ...[...bomsByCode.values()].flatMap(bom => bom.lines.map(line => normalizedCode(line.ItemCode))),
  ])]
  const itemMasters = await getSapItemsByCodes(itemCodes, ['ItemCode', 'ItemName', 'InventoryUOM'])

  return buildFullSapBomHierarchy(rootCode, bomsByCode, itemMasters, branchErrors)
}
