import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeSapBomCostCategoryMapping, resolveSapBomCostCategory } from './costCategoryResolver'

test('uses material as the safe default when no mapping applies', () => {
  const category = resolveSapBomCostCategory(
    { itemsGroupCode: null, materialGroup: null, family: null, group: null },
    normalizeSapBomCostCategoryMapping({}),
  )
  assert.equal(category, 'material')
})

test('uses SAP source priority and normalized mapping keys', () => {
  const mapping = normalizeSapBomCostCategoryMapping({
    itemsGroupCode: { ' 100 ': 'mo' },
    materialGroup: { '100': 'cif' },
  })
  const category = resolveSapBomCostCategory(
    { itemsGroupCode: '100', materialGroup: '100', family: null, group: null },
    mapping,
  )
  assert.equal(category, 'mo')
})

test('inherits the parent category when the item has no configured classification', () => {
  const category = resolveSapBomCostCategory(
    { itemsGroupCode: null, materialGroup: null, family: null, group: null },
    normalizeSapBomCostCategoryMapping({}),
    'cif',
  )
  assert.equal(category, 'cif')
})
