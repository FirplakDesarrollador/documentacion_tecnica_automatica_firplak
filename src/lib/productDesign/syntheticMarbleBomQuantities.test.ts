import assert from 'node:assert/strict'
import test from 'node:test'

import { applySyntheticMarbleBomQuantities, roundUpSapQuantity } from './syntheticMarbleBomQuantities'
import type { EstimationDraftBomLine } from './estimationDraft'

function line(id: string, sapItemCode: string, uom = 'KG'): EstimationDraftBomLine {
  return { id, parentId: null, origin: 'sap', sapItemCode, itemName: null, quantity: 1, uom, costCategory: 'material', costStrategy: 'manual_override', unitCost: null, costEvidence: null, manualCostReason: null, notes: null, physicalWeightPolicy: 'direct_weight', physicalWeightCategory: 'product', usefulQuantity: null, fixedWeightKg: null, physicalWeightSnapshot: null, extensions: {} }
}

test('redondea cantidades SAP hacia arriba a dos decimales', () => {
  assert.equal(roundUpSapQuantity(6.902553), 6.91)
  assert.equal(roundUpSapQuantity(0.4172735), 0.42)
})

test('actualiza sólo mezcla PINP y gelcoat PGEL del lienzo', () => {
  const result = applySyntheticMarbleBomQuantities([
    line('mix', 'PINP01-0006-000-0000'),
    line('gel', 'PGEL01-0003-000-0100'),
    line('peroxide-grams', 'CMPD01-0048-000-0000', 'GR'),
    line('peroxide-kilos', 'CMPD01-0016-000-0000', 'KG'),
    line('other', 'CMPD01-0022-000-0000'),
  ], 6.902553, 0.4172735)
  assert.deepEqual(result.mixtureLineIds, ['mix'])
  assert.deepEqual(result.gelcoatLineIds, ['gel'])
  assert.deepEqual(result.peroxideLineIds, ['peroxide-grams', 'peroxide-kilos'])
  assert.equal(result.lines[0].quantity, 6.91)
  assert.equal(result.lines[1].quantity, 0.42)
  assert.equal(result.lines[2].quantity, 10.44)
  assert.equal(result.lines[3].quantity, 0.02)
  assert.equal(result.lines[4].quantity, 1)
})
