export function calculateProratedTransferQuantity(parentQuantity: number, childQuantity: number, bomQuantity: number): number {
  const raw = childQuantity * (parentQuantity / (bomQuantity > 0 ? bomQuantity : 1))
  return Math.round(raw * 100) / 100
}

export function canUseStockOverride(inventoryQuantity: number, availableQuantity: number, requestedQuantity: number, allowOverride: boolean): boolean {
  return requestedQuantity > availableQuantity && inventoryQuantity > 0 && allowOverride
}

export function isSyncableTransferRequestItem(itemCode: string): boolean {
  const normalized = itemCode.trim().toUpperCase()
  return normalized.length > 0 && !normalized.startsWith('V')
}
