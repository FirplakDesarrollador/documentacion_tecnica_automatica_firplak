/**
 * Resolves a unit cost from already-normalized SAP evidence. This module never
 * reads SAP, converts units, or infers a movement purpose from free text.
 */

export type EstimationCostSource =
  | 'receipt_verified'
  | 'inventory_gen_entry_temporary'
  | 'warehouse_average'
  | 'manual'
  | 'unavailable'

export type InventoryEntryPurpose =
  | 'purchase_like'
  | 'production'
  | 'reclassification'
  | 'sample'
  | 'compensation'
  | 'unknown'

export type CostCandidateRejectionReason =
  | 'item_mismatch'
  | 'warehouse_mismatch'
  | 'uom_mismatch'
  | 'currency_mismatch'
  | 'unit_cost_not_positive'
  | 'date_invalid'
  | 'receipt_not_verified'
  | 'inventory_entry_quantity_not_positive'
  | 'inventory_entry_excluded_purpose'
  | 'manual_reason_required'

export interface EstimationCostTarget {
  itemCode: string
  uom: string
  currency: string
}

interface CostCandidateBase {
  candidateId: string
  itemCode: string
  warehouseCode: string
  unitCost: number
  currency: string
  uom: string
  documentType: string
  documentNumber: string | null
  occurredAt: string
  note?: string | null
}

export interface VerifiedPurchaseReceiptCostCandidate extends CostCandidateBase {
  verificationStatus: 'verified' | 'unverified'
}

export interface InventoryGenEntryCostCandidate extends CostCandidateBase {
  quantity: number
  purpose: InventoryEntryPurpose
}

export interface WarehouseAverageCostCandidate {
  candidateId: string
  itemCode: string
  warehouseCode: string
  unitCost: number
  currency: string
  uom: string
  asOf: string
  note?: string | null
}

export interface ManualEstimationCost {
  unitCost: number
  currency: string
  uom: string
  reason: string
  enteredAt?: string | null
}

export interface EstimationCostCandidateRejection {
  candidateId: string
  candidateType: 'receipt' | 'inventory_entry' | 'warehouse_average' | 'manual'
  reasons: CostCandidateRejectionReason[]
  inventoryEntryPurpose?: InventoryEntryPurpose
}

export interface EstimationCostProvenance {
  candidateId: string | null
  itemCode: string
  warehouseCode: string | null
  documentType: string | null
  documentNumber: string | null
  documentDate: string | null
  originalCurrency: string | null
  sourceUom: string | null
  note: string | null
  warning: string | null
}

export interface EstimationCostResolution {
  source: EstimationCostSource
  unitCost: number | null
  currency: string
  uom: string
  provenance: EstimationCostProvenance
  rejectedCandidates: EstimationCostCandidateRejection[]
}

export interface ResolveEstimationCostInput {
  target: EstimationCostTarget
  verifiedReceipts?: VerifiedPurchaseReceiptCostCandidate[]
  inventoryEntries?: InventoryGenEntryCostCandidate[]
  warehouseAverage?: WarehouseAverageCostCandidate | null
  manualCost?: ManualEstimationCost | null
}

const DEFAULT_WAREHOUSE_CODE = 'MP-01'

function normalizeIdentifier(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? ''
}

function hasPositiveFiniteValue(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function hasValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

function sameIdentifier(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeIdentifier(left) === normalizeIdentifier(right)
}

function candidateRejectionReasons(
  candidate: Pick<CostCandidateBase, 'itemCode' | 'warehouseCode' | 'unitCost' | 'currency' | 'uom' | 'occurredAt'>,
  target: EstimationCostTarget,
  warehouseCode: string,
): CostCandidateRejectionReason[] {
  const reasons: CostCandidateRejectionReason[] = []

  if (!sameIdentifier(candidate.itemCode, target.itemCode)) {
    reasons.push('item_mismatch')
  }
  if (!sameIdentifier(candidate.warehouseCode, warehouseCode)) {
    reasons.push('warehouse_mismatch')
  }
  if (!sameIdentifier(candidate.uom, target.uom)) {
    reasons.push('uom_mismatch')
  }
  if (!sameIdentifier(candidate.currency, target.currency)) {
    reasons.push('currency_mismatch')
  }
  if (!hasPositiveFiniteValue(candidate.unitCost)) {
    reasons.push('unit_cost_not_positive')
  }
  if (!hasValidDate(candidate.occurredAt)) {
    reasons.push('date_invalid')
  }

  return reasons
}

function warehouseAverageRejectionReasons(
  candidate: WarehouseAverageCostCandidate,
  target: EstimationCostTarget,
  warehouseCode: string,
): CostCandidateRejectionReason[] {
  const reasons: CostCandidateRejectionReason[] = []

  if (!sameIdentifier(candidate.itemCode, target.itemCode)) {
    reasons.push('item_mismatch')
  }
  if (!sameIdentifier(candidate.warehouseCode, warehouseCode)) {
    reasons.push('warehouse_mismatch')
  }
  if (!sameIdentifier(candidate.uom, target.uom)) {
    reasons.push('uom_mismatch')
  }
  if (!sameIdentifier(candidate.currency, target.currency)) {
    reasons.push('currency_mismatch')
  }
  if (!hasPositiveFiniteValue(candidate.unitCost)) {
    reasons.push('unit_cost_not_positive')
  }
  if (!hasValidDate(candidate.asOf)) {
    reasons.push('date_invalid')
  }

  return reasons
}

function manualCostRejectionReasons(
  candidate: ManualEstimationCost,
  target: EstimationCostTarget,
): CostCandidateRejectionReason[] {
  const reasons: CostCandidateRejectionReason[] = []

  if (!sameIdentifier(candidate.uom, target.uom)) {
    reasons.push('uom_mismatch')
  }
  if (!sameIdentifier(candidate.currency, target.currency)) {
    reasons.push('currency_mismatch')
  }
  if (!hasPositiveFiniteValue(candidate.unitCost)) {
    reasons.push('unit_cost_not_positive')
  }
  if (!candidate.reason.trim()) {
    reasons.push('manual_reason_required')
  }

  return reasons
}

function newestFirst<T extends { candidateId: string; occurredAt: string }>(candidates: T[]): T[] {
  return [...candidates].sort((left, right) => {
    const dateDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
    if (dateDifference !== 0) {
      return dateDifference
    }
    return left.candidateId.localeCompare(right.candidateId)
  })
}

function buildResolution(
  source: Exclude<EstimationCostSource, 'manual' | 'unavailable'>,
  target: EstimationCostTarget,
  candidate: CostCandidateBase | WarehouseAverageCostCandidate,
  rejectedCandidates: EstimationCostCandidateRejection[],
): EstimationCostResolution {
  const isWarehouseAverage = source === 'warehouse_average'
  const documentDate = isWarehouseAverage
    ? (candidate as WarehouseAverageCostCandidate).asOf
    : (candidate as CostCandidateBase).occurredAt

  const warning = source === 'inventory_gen_entry_temporary'
    ? 'Costo temporal: proviene de una entrada de inventario elegible, no de una recepción de compra verificada.'
    : source === 'warehouse_average'
      ? 'Costo promedio de MP-01: no se encontró una recepción ni una entrada elegible con el mismo artículo, unidad y moneda.'
      : null

  return {
    source,
    unitCost: candidate.unitCost,
    currency: normalizeIdentifier(candidate.currency),
    uom: normalizeIdentifier(candidate.uom),
    provenance: {
      candidateId: candidate.candidateId,
      itemCode: normalizeIdentifier(candidate.itemCode),
      warehouseCode: normalizeIdentifier(candidate.warehouseCode),
      documentType: isWarehouseAverage ? 'WarehouseAverage' : (candidate as CostCandidateBase).documentType,
      documentNumber: isWarehouseAverage ? null : (candidate as CostCandidateBase).documentNumber,
      documentDate,
      originalCurrency: normalizeIdentifier(candidate.currency),
      sourceUom: normalizeIdentifier(candidate.uom),
      note: candidate.note?.trim() || null,
      warning,
    },
    rejectedCandidates,
  }
}

function buildManualResolution(
  target: EstimationCostTarget,
  candidate: ManualEstimationCost,
  rejectedCandidates: EstimationCostCandidateRejection[],
): EstimationCostResolution {
  return {
    source: 'manual',
    unitCost: candidate.unitCost,
    currency: normalizeIdentifier(candidate.currency),
    uom: normalizeIdentifier(candidate.uom),
    provenance: {
      candidateId: null,
      itemCode: normalizeIdentifier(target.itemCode),
      warehouseCode: DEFAULT_WAREHOUSE_CODE,
      documentType: 'Manual',
      documentNumber: null,
      documentDate: candidate.enteredAt?.trim() || null,
      originalCurrency: normalizeIdentifier(candidate.currency),
      sourceUom: normalizeIdentifier(candidate.uom),
      note: candidate.reason.trim(),
      warning: 'Costo manual: no existe una fuente automática utilizable con la misma unidad y moneda.',
    },
    rejectedCandidates,
  }
}

function buildUnavailableResolution(
  target: EstimationCostTarget,
  rejectedCandidates: EstimationCostCandidateRejection[],
): EstimationCostResolution {
  return {
    source: 'unavailable',
    unitCost: null,
    currency: normalizeIdentifier(target.currency),
    uom: normalizeIdentifier(target.uom),
    provenance: {
      candidateId: null,
      itemCode: normalizeIdentifier(target.itemCode),
      warehouseCode: DEFAULT_WAREHOUSE_CODE,
      documentType: null,
      documentNumber: null,
      documentDate: null,
      originalCurrency: null,
      sourceUom: null,
      note: null,
      warning: 'No hay una fuente de costo utilizable. Registre un costo manual con motivo.',
    },
    rejectedCandidates,
  }
}

/**
 * Applies the quotation cost policy without side effects. Inputs must already
 * carry a deterministic movement purpose from the SAP adapter.
 */
export function resolveEstimationCost(input: ResolveEstimationCostInput): EstimationCostResolution {
  const warehouseCode = DEFAULT_WAREHOUSE_CODE
  const rejectedCandidates: EstimationCostCandidateRejection[] = []

  const eligibleReceipts = newestFirst(input.verifiedReceipts ?? []).filter(candidate => {
    const reasons = candidateRejectionReasons(candidate, input.target, warehouseCode)
    if (candidate.verificationStatus !== 'verified') {
      reasons.push('receipt_not_verified')
    }
    if (reasons.length > 0) {
      rejectedCandidates.push({ candidateId: candidate.candidateId, candidateType: 'receipt', reasons })
      return false
    }
    return true
  })
  const latestReceipt = eligibleReceipts[0]
  if (latestReceipt) {
    return buildResolution('receipt_verified', input.target, latestReceipt, rejectedCandidates)
  }

  const eligibleInventoryEntries = newestFirst(input.inventoryEntries ?? []).filter(candidate => {
    const reasons = candidateRejectionReasons(candidate, input.target, warehouseCode)
    if (!hasPositiveFiniteValue(candidate.quantity)) {
      reasons.push('inventory_entry_quantity_not_positive')
    }
    if (candidate.purpose !== 'purchase_like') {
      reasons.push('inventory_entry_excluded_purpose')
    }
    if (reasons.length > 0) {
      rejectedCandidates.push({
        candidateId: candidate.candidateId,
        candidateType: 'inventory_entry',
        reasons,
        inventoryEntryPurpose: candidate.purpose,
      })
      return false
    }
    return true
  })
  const latestInventoryEntry = eligibleInventoryEntries[0]
  if (latestInventoryEntry) {
    return buildResolution('inventory_gen_entry_temporary', input.target, latestInventoryEntry, rejectedCandidates)
  }

  if (input.warehouseAverage) {
    const reasons = warehouseAverageRejectionReasons(input.warehouseAverage, input.target, warehouseCode)
    if (reasons.length === 0) {
      return buildResolution('warehouse_average', input.target, input.warehouseAverage, rejectedCandidates)
    }
    rejectedCandidates.push({
      candidateId: input.warehouseAverage.candidateId,
      candidateType: 'warehouse_average',
      reasons,
    })
  }

  if (input.manualCost) {
    const reasons = manualCostRejectionReasons(input.manualCost, input.target)
    if (reasons.length === 0) {
      return buildManualResolution(input.target, input.manualCost, rejectedCandidates)
    }
    rejectedCandidates.push({ candidateId: 'manual', candidateType: 'manual', reasons })
  }

  return buildUnavailableResolution(input.target, rejectedCandidates)
}
