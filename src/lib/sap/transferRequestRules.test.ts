import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateProratedTransferQuantity, canUseStockOverride, isSyncableTransferRequestItem } from './transferRequestRules'

test('prorratea BOM y redondea a dos decimales', () => {
  assert.equal(calculateProratedTransferQuantity(2, 0.8, 1), 1.6)
  assert.equal(calculateProratedTransferQuantity(1, 1 / 3, 1), 0.33)
})

test('solo permite override con inventario físico positivo', () => {
  assert.equal(canUseStockOverride(10, 0, 2, true), true)
  assert.equal(canUseStockOverride(10, 1, 2, false), false)
  assert.equal(canUseStockOverride(0, 0, 2, true), false)
  assert.equal(canUseStockOverride(10, 2, 2, false), false)
})

test('excluye productos terminados V del sync de componentes', () => {
  assert.equal(isSyncableTransferRequestItem('VABC-001'), false)
  assert.equal(isSyncableTransferRequestItem('CABC-001'), true)
})
