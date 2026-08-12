import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveEstimationCost,
  type InventoryGenEntryCostCandidate,
  type ResolveEstimationCostInput,
  type VerifiedPurchaseReceiptCostCandidate,
} from './estimationCosts'

const target = {
  itemCode: 'CMPD01-0048-000-0000',
  warehouseCode: 'MP-01',
  uom: 'KG',
  currency: 'COP',
}

function receipt(overrides: Partial<VerifiedPurchaseReceiptCostCandidate> = {}): VerifiedPurchaseReceiptCostCandidate {
  return {
    candidateId: 'receipt-1',
    itemCode: target.itemCode,
    warehouseCode: target.warehouseCode,
    unitCost: 10_000,
    currency: target.currency,
    uom: target.uom,
    documentType: 'PurchaseDeliveryNote',
    documentNumber: 'GR-001',
    occurredAt: '2026-08-01T00:00:00.000Z',
    verificationStatus: 'verified',
    ...overrides,
  }
}

function inventoryEntry(overrides: Partial<InventoryGenEntryCostCandidate> = {}): InventoryGenEntryCostCandidate {
  return {
    candidateId: 'inventory-1',
    itemCode: target.itemCode,
    warehouseCode: target.warehouseCode,
    unitCost: 8_000,
    currency: target.currency,
    uom: target.uom,
    documentType: 'InventoryGenEntry',
    documentNumber: 'IGE-001',
    occurredAt: '2026-08-02T00:00:00.000Z',
    quantity: 4,
    purpose: 'purchase_like',
    ...overrides,
  }
}

function resolve(overrides: Partial<ResolveEstimationCostInput> = {}) {
  return resolveEstimationCost({
    target,
    ...overrides,
  })
}

test('prioriza la última recepción de compra verificada sobre las demás fuentes', () => {
  const result = resolve({
    verifiedReceipts: [
      receipt({ candidateId: 'receipt-old', documentNumber: 'GR-010', occurredAt: '2026-08-01T00:00:00.000Z', unitCost: 9_000 }),
      receipt({ candidateId: 'receipt-new', documentNumber: 'GR-011', occurredAt: '2026-08-05T00:00:00.000Z', unitCost: 11_000 }),
    ],
    inventoryEntries: [inventoryEntry({ unitCost: 7_000 })],
    warehouseAverage: {
      candidateId: 'average-1',
      itemCode: target.itemCode,
      warehouseCode: target.warehouseCode,
      unitCost: 6_000,
      currency: target.currency,
      uom: target.uom,
      asOf: '2026-08-06T00:00:00.000Z',
    },
    manualCost: { unitCost: 5_000, currency: 'COP', uom: 'KG', reason: 'Cotización de proveedor' },
  })

  assert.equal(result.source, 'receipt_verified')
  assert.equal(result.unitCost, 11_000)
  assert.equal(result.provenance.documentNumber, 'GR-011')
  assert.equal(result.provenance.warning, null)
})

test('descarta entradas de producción, reclasificación, muestra y compensación antes de usar una entrada elegible', () => {
  const result = resolve({
    verifiedReceipts: [receipt({ verificationStatus: 'unverified' })],
    inventoryEntries: [
      inventoryEntry({ candidateId: 'production', purpose: 'production' }),
      inventoryEntry({ candidateId: 'reclassification', purpose: 'reclassification' }),
      inventoryEntry({ candidateId: 'sample', purpose: 'sample' }),
      inventoryEntry({ candidateId: 'compensation', purpose: 'compensation' }),
      inventoryEntry({ candidateId: 'eligible', purpose: 'purchase_like', documentNumber: 'IGE-099', unitCost: 8_500 }),
    ],
  })

  assert.equal(result.source, 'inventory_gen_entry_temporary')
  assert.equal(result.unitCost, 8_500)
  assert.equal(result.provenance.documentNumber, 'IGE-099')
  assert.match(result.provenance.warning ?? '', /temporal/i)
  const rejectedInventoryEntries = result.rejectedCandidates.filter(candidate => candidate.candidateType === 'inventory_entry')
  assert.deepEqual(
    rejectedInventoryEntries.map(candidate => candidate.inventoryEntryPurpose).sort(),
    ['production', 'reclassification', 'sample', 'compensation'].sort(),
  )
  assert.ok(rejectedInventoryEntries.every(candidate => candidate.reasons.includes('inventory_entry_excluded_purpose')))
})

test('no adivina conversiones de unidad ni moneda al resolver fuentes automáticas', () => {
  const result = resolve({
    inventoryEntries: [inventoryEntry({ uom: 'G', currency: 'USD' })],
    warehouseAverage: {
      candidateId: 'average-wrong-unit',
      itemCode: target.itemCode,
      warehouseCode: target.warehouseCode,
      unitCost: 4,
      currency: 'USD',
      uom: 'G',
      asOf: '2026-08-06T00:00:00.000Z',
    },
    manualCost: { unitCost: 4, currency: 'USD', uom: 'G', reason: 'Proveedor en dólares por gramo' },
  })

  assert.equal(result.source, 'unavailable')
  assert.equal(result.unitCost, null)
  assert.equal(result.provenance.sourceUom, null)
  assert.ok(result.rejectedCandidates.every(candidate => candidate.reasons.includes('uom_mismatch')))
  assert.ok(result.rejectedCandidates.every(candidate => candidate.reasons.includes('currency_mismatch')))
})

test('usa el promedio de MP-01 sólo cuando no hay una fuente más fuerte utilizable', () => {
  const result = resolve({
    warehouseAverage: {
      candidateId: 'average-1',
      itemCode: target.itemCode,
      warehouseCode: target.warehouseCode,
      unitCost: 7_250,
      currency: target.currency,
      uom: target.uom,
      asOf: '2026-08-06T00:00:00.000Z',
      note: 'AveragePrice de la bodega',
    },
  })

  assert.equal(result.source, 'warehouse_average')
  assert.equal(result.unitCost, 7_250)
  assert.equal(result.provenance.documentType, 'WarehouseAverage')
  assert.match(result.provenance.warning ?? '', /MP-01/)
})

test('no usa movimientos ni promedio de una bodega distinta a MP-01', () => {
  const result = resolve({
    inventoryEntries: [inventoryEntry({ candidateId: 'inventory-mp-02', warehouseCode: 'MP-02' })],
    warehouseAverage: {
      candidateId: 'average-mp-02',
      itemCode: target.itemCode,
      warehouseCode: 'MP-02',
      unitCost: 7_250,
      currency: target.currency,
      uom: target.uom,
      asOf: '2026-08-06T00:00:00.000Z',
    },
  })

  assert.equal(result.source, 'unavailable')
  assert.equal(result.provenance.warehouseCode, 'MP-01')
  assert.ok(result.rejectedCandidates.every(candidate => candidate.reasons.includes('warehouse_mismatch')))
})

test('usa costo manual con motivo y deja el costo como no disponible cuando tampoco es válido', () => {
  const manual = resolve({
    manualCost: { unitCost: 12_300, currency: 'COP', uom: 'KG', reason: 'Cotización vigente del proveedor', enteredAt: '2026-08-10' },
  })
  assert.equal(manual.source, 'manual')
  assert.equal(manual.unitCost, 12_300)
  assert.equal(manual.provenance.note, 'Cotización vigente del proveedor')

  const unavailable = resolve({
    manualCost: { unitCost: 12_300, currency: 'COP', uom: 'KG', reason: '   ' },
  })
  assert.equal(unavailable.source, 'unavailable')
  assert.deepEqual(unavailable.rejectedCandidates[0]?.reasons, ['manual_reason_required'])
})
