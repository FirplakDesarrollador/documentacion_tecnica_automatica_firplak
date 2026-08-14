import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateEstimationPhysicalWeights, suggestSyntheticMarbleWeightWastePct } from './estimationPhysicalWeights'
import type { EstimationDraftBomLine } from './estimationDraft'

function line(overrides: Partial<EstimationDraftBomLine> & Pick<EstimationDraftBomLine, 'id'>): EstimationDraftBomLine {
  const { id, ...rest } = overrides
  return {
    id,
    parentId: null,
    origin: 'sap',
    sapItemCode: null,
    itemName: null,
    quantity: 1,
    uom: 'UN',
    costCategory: 'material',
    costStrategy: 'manual_override',
    unitCost: null,
    costEvidence: null,
    manualCostReason: null,
    notes: null,
    physicalWeightPolicy: 'from_quantity',
    usefulQuantity: null,
    fixedWeightKg: null,
    physicalWeightSnapshot: { kgPerUom: 1, source: 'prueba', note: null, capturedAt: null, extensions: {} },
    extensions: {},
    ...rest,
  }
}

test('separa peso neto, empaque y evita contar dos veces una subestructura', () => {
  const result = calculateEstimationPhysicalWeights({
    estimatedMixtureKg: 6,
    estimatedGelcoatKg: 0.4,
    lines: [
      line({ id: 'mix', sapItemCode: 'PINP01-0006-000-0000' }),
      line({ id: 'gel', sapItemCode: 'PGEL01-0003-000-0100' }),
      line({ id: 'peroxide', quantity: 10, uom: 'GR', physicalWeightSnapshot: { kgPerUom: 0.001, source: 'prueba', note: null, capturedAt: null, extensions: {} } }),
      line({ id: 'box', quantity: 2, costCategory: 'packaging', physicalWeightSnapshot: { kgPerUom: 0.3, source: 'prueba', note: null, capturedAt: null, extensions: {} } }),
      line({ id: 'parent', physicalWeightPolicy: 'derive_children' }),
      line({ id: 'child', parentId: 'parent', quantity: 4, physicalWeightSnapshot: { kgPerUom: 0.2, source: 'prueba', note: null, capturedAt: null, extensions: {} } }),
    ],
  })
  assert.ok(Math.abs((result.netWeightKg ?? 0) - 6.89) < 0.000_001)
  assert.ok(Math.abs((result.packagingWeightKg ?? 0) - 0.6) < 0.000_001)
  assert.ok(Math.abs((result.grossWeightKg ?? 0) - 7.49) < 0.000_001)
})

test('conserva un peso inicial y marca las líneas que todavía no tienen factor', () => {
  const result = calculateEstimationPhysicalWeights({
    estimatedMixtureKg: 1,
    estimatedGelcoatKg: 1,
    lines: [line({ id: 'missing', physicalWeightSnapshot: null })],
  })
  assert.ok(Math.abs((result.netWeightKg ?? 0) - 1.9) < 0.000_001)
  assert.equal(result.packagingWeightKg, 0)
  assert.ok(Math.abs((result.grossWeightKg ?? 0) - 1.9) < 0.000_001)
  assert.deepEqual(result.missingLineIds, ['missing'])
})

test('propone desperdicio a partir de una toma física completa sin modificar la cotización', () => {
  const suggested = suggestSyntheticMarbleWeightWastePct({
    actualMixtureKg: 6,
    actualGelcoatKg: 0.4,
    actualNetWeightKg: 6.15,
    lines: [line({ id: 'mix', sapItemCode: 'PINP01-0006-000-0000' }), line({ id: 'gel', sapItemCode: 'PGEL01-0003-000-0100' }), line({ id: 'other', quantity: 1, physicalWeightSnapshot: { kgPerUom: 0.07, source: 'prueba', note: null, capturedAt: null, extensions: {} } })],
  })
  assert.ok(Math.abs((suggested ?? 0) - 0.05) < 0.000_001)
})
