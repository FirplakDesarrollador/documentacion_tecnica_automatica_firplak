type SapEntityPayload = Record<string, unknown>

export type SapItemTargetStatus = 'ACTIVO' | 'INACTIVO'

export type SapItemLifecycleState = {
  itemCode: string
  itemName: string
  valid: boolean | null
  frozen: boolean | null
}

export type SapDeletionBlockReason =
  | 'SUPERIOR_BOM'
  | 'PRODUCTION_ORDER'
  | 'DOCUMENT_ASSOCIATION'
  | 'UNKNOWN'

function readSapBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (['tyes', 'yes', 'true', '1'].includes(normalized)) return true
  if (['tno', 'no', 'false', '0'].includes(normalized)) return false
  return null
}

export function readSapItemLifecycleState(item: SapEntityPayload): SapItemLifecycleState {
  return {
    itemCode: typeof item.ItemCode === 'string' ? item.ItemCode.trim().toUpperCase() : '',
    itemName: typeof item.ItemName === 'string' ? item.ItemName.trim() : '',
    valid: readSapBoolean(item.Valid),
    frozen: readSapBoolean(item.Frozen),
  }
}

export function sapPayloadForTargetStatus(targetStatus: SapItemTargetStatus): SapEntityPayload {
  return targetStatus === 'ACTIVO'
    ? { Valid: 'tYES', Frozen: 'tNO' }
    : { Valid: 'tNO', Frozen: 'tYES' }
}

export function isSapLifecycleState(state: SapItemLifecycleState, targetStatus: SapItemTargetStatus): boolean {
  return targetStatus === 'ACTIVO'
    ? state.valid === true && state.frozen === false
    : state.valid === false && state.frozen === true
}

export function statusConfirmation(itemCode: string, targetStatus: SapItemTargetStatus): string {
  return `ACTUALIZAR ${itemCode.trim().toUpperCase()} ${targetStatus}`
}

export function deleteConfirmation(itemCode: string): string {
  return `ELIMINAR SAP ${itemCode.trim().toUpperCase()}`
}

export function createConfirmation(itemCode: string): string {
  return `CREAR SAP ${itemCode.trim().toUpperCase()}`
}

export function classifySapDeletionBlockReason(message: string): SapDeletionBlockReason {
  const normalized = message.trim().toLowerCase()
  if (/(producttree|bom|lista de materiales|ldm|estructura)/.test(normalized)) return 'SUPERIOR_BOM'
  if (/(production order|productionorder|orden de fabricaci[oó]n|\bof\b)/.test(normalized)) return 'PRODUCTION_ORDER'
  if (/(association|associated|document|movimiento|transacci[oó]n|referenc)/.test(normalized)) return 'DOCUMENT_ASSOCIATION'
  return 'UNKNOWN'
}

export function deletionBlockLabel(reason: SapDeletionBlockReason): string {
  if (reason === 'SUPERIOR_BOM') return 'El artículo está asociado a una LdM superior.'
  if (reason === 'PRODUCTION_ORDER') return 'El artículo está asociado a una orden de fabricación (OF).'
  if (reason === 'DOCUMENT_ASSOCIATION') return 'El artículo tiene documentos o movimientos asociados.'
  return 'SAP rechazó la eliminación por una asociación no clasificada.'
}
