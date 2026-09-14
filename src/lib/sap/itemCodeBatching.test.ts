import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSapItemCodeFilter,
  SAP_ITEM_QUERY_BATCH_SIZE,
  splitSapItemCodeBatches,
} from './itemCodeBatching'

test('splits empty, boundary, and over-boundary item-code batches', () => {
  assert.deepEqual(splitSapItemCodeBatches([]), [])
  assert.deepEqual(splitSapItemCodeBatches(['A']), [['A']])

  const exactCodes = Array.from({ length: SAP_ITEM_QUERY_BATCH_SIZE }, (_, index) => `CODE-${index}`)
  assert.deepEqual(splitSapItemCodeBatches(exactCodes), [exactCodes])

  const overBoundaryCodes = [...exactCodes, 'CODE-20']
  const batches = splitSapItemCodeBatches(overBoundaryCodes)
  assert.deepEqual(batches, [exactCodes, ['CODE-20']])
  assert.ok(batches.every(batch => batch.length <= SAP_ITEM_QUERY_BATCH_SIZE))
})

test('builds an OData filter for each requested code and escapes apostrophes', () => {
  assert.equal(
    buildSapItemCodeFilter(["A'1", 'B2']),
    "ItemCode eq 'A''1' or ItemCode eq 'B2'",
  )
})
