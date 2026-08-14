import assert from 'node:assert/strict'
import test from 'node:test'

import type { EstimationDraftBomLine } from './estimationDraft'
import {
  buildEstimationBomHierarchy,
  canAssignEstimationBomParent,
  getEstimationBomDescendantIds,
} from './estimationBomHierarchy'

function line(id: string, parentId: string | null): EstimationDraftBomLine {
  return {
    id,
    parentId,
    origin: 'manual',
    sapItemCode: null,
    itemName: id,
    quantity: 1,
    uom: 'UN',
    costCategory: 'material',
    costStrategy: 'manual_override',
    unitCost: 1,
    costEvidence: null,
    manualCostReason: 'prueba',
    notes: null,
    physicalWeightPolicy: 'from_quantity',
    usefulQuantity: null,
    fixedWeightKg: null,
    physicalWeightSnapshot: null,
    extensions: {},
  }
}

test('orders flat lines by hierarchy and calculates levels', () => {
  const rows = buildEstimationBomHierarchy([
    line('grandchild', 'child'),
    line('root', null),
    line('child', 'root'),
    line('other-root', null),
  ])

  assert.deepEqual(rows.map(row => [row.line.id, row.level]), [
    ['root', 0],
    ['child', 1],
    ['grandchild', 2],
    ['other-root', 0],
  ])
})

test('prevents assigning a line below itself or one of its descendants', () => {
  const lines = [line('root', null), line('child', 'root'), line('grandchild', 'child')]

  assert.deepEqual([...getEstimationBomDescendantIds(lines, 'root')], ['child', 'grandchild'])
  assert.equal(canAssignEstimationBomParent(lines, 'root', 'grandchild'), false)
  assert.equal(canAssignEstimationBomParent(lines, 'child', 'child'), false)
  assert.equal(canAssignEstimationBomParent(lines, 'grandchild', 'root'), true)
})

test('keeps orphaned lines visible at root level', () => {
  const rows = buildEstimationBomHierarchy([line('orphan', 'missing')])
  assert.deepEqual(rows.map(row => [row.line.id, row.level]), [['orphan', 0]])
})
