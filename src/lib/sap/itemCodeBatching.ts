export const SAP_ITEM_QUERY_BATCH_SIZE = 20

export function splitSapItemCodeBatches(itemCodes: readonly string[]): string[][] {
  return Array.from(
    { length: Math.ceil(itemCodes.length / SAP_ITEM_QUERY_BATCH_SIZE) },
    (_, index) => itemCodes.slice(
      index * SAP_ITEM_QUERY_BATCH_SIZE,
      index * SAP_ITEM_QUERY_BATCH_SIZE + SAP_ITEM_QUERY_BATCH_SIZE,
    ),
  )
}

export function buildSapItemCodeFilter(itemCodes: readonly string[]): string {
  return itemCodes
    .map(code => `ItemCode eq '${code.replace(/'/g, "''")}'`)
    .join(' or ')
}
