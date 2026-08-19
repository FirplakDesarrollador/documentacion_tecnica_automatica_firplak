import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateEstimationPhysicalWeights, inferPhysicalWeightPolicy, suggestSyntheticMarbleWeightWastePct } from './estimationPhysicalWeights'
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
    physicalWeightPolicy: 'direct_weight',
    physicalWeightCategory: 'product',
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
    wastePct: 0.05,
    lines: [
      line({ id: 'mix', sapItemCode: 'PINP01-0006-000-0000', quantity: 6, uom: 'KG' }),
      line({ id: 'mix-child-1', parentId: 'mix', sapItemCode: 'CMPD01-0020-000-0000', quantity: 1.2, uom: 'KG' }),
      line({ id: 'gel', sapItemCode: 'PGEL01-0003-000-0100', quantity: 0.4, uom: 'KG' }),
      line({ id: 'gel-child-1', parentId: 'gel', sapItemCode: 'CMPD01-0022-000-0000', quantity: 0.4, uom: 'KG' }),
      line({ id: 'peroxide', quantity: 10, uom: 'GR', physicalWeightSnapshot: { kgPerUom: 0.001, source: 'prueba', note: null, capturedAt: null, extensions: {} } }),
      line({ id: 'box', quantity: 2, costCategory: 'packaging', physicalWeightCategory: 'packaging', physicalWeightSnapshot: { kgPerUom: 0.3, source: 'prueba', note: null, capturedAt: null, extensions: {} } }),
      line({ id: 'parent', quantity: 1, uom: 'UN' }),
      line({ id: 'child', parentId: 'parent', quantity: 4, physicalWeightSnapshot: { kgPerUom: 0.2, source: 'prueba', note: null, capturedAt: null, extensions: {} } }),
    ],
  })
  // mix: 6 * 0.95 = 5.7 kg (mix-child-1 no se suma dos veces)
  // gel: 0.4 * 0.95 = 0.38 kg (gel-child-1 no se suma dos veces)
  // peroxide: 10 GR = 0.01 kg
  // parent (1 UN) -> child (4 * 0.2 kg) = 0.8 kg
  // Total net = 5.7 + 0.38 + 0.01 + 0.8 = 6.89 kg
  // Packaging = 2 * 0.3 = 0.6 kg
  // Gross = 6.89 + 0.6 = 7.49 kg
  assert.ok(Math.abs((result.netWeightKg ?? 0) - 6.89) < 0.000_001)
  assert.ok(Math.abs((result.packagingWeightKg ?? 0) - 0.6) < 0.000_001)
  assert.ok(Math.abs((result.grossWeightKg ?? 0) - 7.49) < 0.000_001)
})

test('conserva un peso inicial y marca las líneas que todavía no tienen factor', () => {
  const result = calculateEstimationPhysicalWeights({
    estimatedMixtureKg: 1,
    estimatedGelcoatKg: 1,
    wastePct: 0.05,
    lines: [line({ id: 'missing', uom: 'M', physicalWeightSnapshot: null })],
  })
  assert.ok(Math.abs((result.netWeightKg ?? 0) - 1.9) < 0.000_001)
  assert.equal(result.packagingWeightKg, 0)
  assert.ok(Math.abs((result.grossWeightKg ?? 0) - 1.9) < 0.000_001)
  assert.deepEqual(result.missingLineIds, ['missing'])
})

test('asigna las cuatro categorías por unidad y estructura', () => {
  assert.equal(inferPhysicalWeightPolicy(line({ id: 'weight', uom: 'G' }), false), 'direct_weight')
  assert.equal(inferPhysicalWeightPolicy(line({ id: 'weight-with-children', uom: 'KG' }), true), 'direct_weight')
  assert.equal(inferPhysicalWeightPolicy(line({ id: 'linear', uom: 'M' }), false), 'direct_weight')
  assert.equal(inferPhysicalWeightPolicy(line({ id: 'area', uom: 'M2' }), false), 'useful_weight')
  assert.equal(inferPhysicalWeightPolicy(line({ id: 'volume', uom: 'L' }), false), 'direct_weight')
  assert.equal(inferPhysicalWeightPolicy(line({ id: 'time', uom: 'MIN' }), false), 'no_weight')
  assert.equal(inferPhysicalWeightPolicy(line({ id: 'sub-bom', uom: 'UN' }), true), 'sub_bom_weight')
})

test('normaliza peso, usa cantidad útil y aplica densidad por volumen', () => {
  const result = calculateEstimationPhysicalWeights({
    estimatedMixtureKg: 0,
    estimatedGelcoatKg: 0,
    wastePct: 0,
    lines: [
      line({ id: 'grams', quantity: 500, uom: 'G', physicalWeightSnapshot: null }),
      line({ id: 'pounds', quantity: 2, uom: 'LB', physicalWeightSnapshot: null }),
      line({ id: 'surface', quantity: 10, uom: 'M2', usefulQuantity: 2.5, physicalWeightSnapshot: { kgPerUom: 0.4, source: 'prueba', note: null, capturedAt: null, extensions: {} } }),
      line({ id: 'liquid', quantity: 3, uom: 'L', physicalWeightSnapshot: { kgPerUom: 1.2, source: 'densidad', note: null, capturedAt: null, extensions: {} } }),
      line({ id: 'labor', quantity: 30, uom: 'MIN', costCategory: 'mo', physicalWeightSnapshot: null }),
    ],
  })
  assert.ok(Math.abs((result.netWeightKg ?? 0) - 6.007_184_74) < 0.000_001)
  assert.equal(result.packagingWeightKg, 0)
  assert.deepEqual(result.missingLineIds, [])
})

test('calcula una Sub-LdM por unidad y la multiplica sin contar su cabecera', () => {
  const result = calculateEstimationPhysicalWeights({
    estimatedMixtureKg: 0,
    estimatedGelcoatKg: 0,
    wastePct: 0,
    lines: [
      line({ id: 'sub-bom', quantity: 3, uom: 'UN', physicalWeightSnapshot: { kgPerUom: 99, source: 'ignorado', note: null, capturedAt: null, extensions: {} } }),
      line({ id: 'component', parentId: 'sub-bom', quantity: 2, uom: 'M', physicalWeightSnapshot: { kgPerUom: 0.5, source: 'prueba', note: null, capturedAt: null, extensions: {} } }),
      line({ id: 'nested', parentId: 'sub-bom', quantity: 2, uom: 'UN' }),
      line({ id: 'nested-component', parentId: 'nested', quantity: 0.25, uom: 'KG', physicalWeightSnapshot: null }),
    ],
  })
  assert.equal(result.netWeightKg, 4.5)
  assert.deepEqual(result.missingLineIds, [])
})

test('propone desperdicio desde una toma física completa', () => {
  const suggested = suggestSyntheticMarbleWeightWastePct({
    actualMixtureKg: 6,
    actualGelcoatKg: 0.4,
    actualNetWeightKg: 6.15,
    lines: [
      line({ id: 'mix', sapItemCode: 'PINP01-0006-000-0000', quantity: 6, uom: 'KG' }),
      line({ id: 'gel', sapItemCode: 'PGEL01-0003-000-0100', quantity: 0.4, uom: 'KG' }),
      line({ id: 'other', quantity: 1, physicalWeightSnapshot: { kgPerUom: 0.07, source: 'prueba', note: null, capturedAt: null, extensions: {} } }),
    ],
  })
  assert.ok(Math.abs((suggested ?? 0) - 0.05) < 0.000_001)
})
