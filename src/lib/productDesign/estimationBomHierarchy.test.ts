import assert from 'node:assert/strict'
import test from 'node:test'

import type { EstimationDraftBomLine } from './estimationDraft'
import {
  assertValidEstimationBomLinks,
  buildEstimationBomHierarchy,
  canAssignEstimationBomParent,
  getEstimationBomDisplayLevel,
  getEstimationBomDescendantIds,
  moveEstimationBomBranch,
  removeEstimationBomBranch,
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
    physicalWeightPolicy: 'direct_weight',
    physicalWeightCategory: 'product',
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

test('muestra la raíz presentacional en nivel 1 y sus componentes directos en nivel 2', () => {
  const rows = buildEstimationBomHierarchy([line('root-line', null), line('child', 'root-line')])
  assert.deepEqual(rows.map(row => getEstimationBomDisplayLevel(row.level)), [2, 3])
})

test('mueve una rama completa dentro y entre contenedores conservando su orden', () => {
  const lines = [line('a', null), line('a-child', 'a'), line('b', null), line('c', null)]
  const inside = moveEstimationBomBranch(lines, 'a', 'b', 'inside')
  assert.deepEqual(inside.map(item => [item.id, item.parentId]), [
    ['b', null], ['a', 'b'], ['a-child', 'a'], ['c', null],
  ])
  const between = moveEstimationBomBranch(inside, 'a', 'c', 'before')
  assert.deepEqual(between.map(item => [item.id, item.parentId]), [
    ['b', null], ['a', null], ['a-child', 'a'], ['c', null],
  ])
})

test('bloquea ciclos y elimina una rama completa', () => {
  const lines = [line('root', null), line('child', 'root'), line('grandchild', 'child')]
  assert.throws(() => moveEstimationBomBranch(lines, 'root', 'grandchild', 'inside'), /descendientes/u)
  assert.deepEqual(removeEstimationBomBranch(lines, 'child').map(item => item.id), ['root'])
  assert.throws(() => assertValidEstimationBomLinks([
    line('a', 'b'), line('b', 'a'),
  ]), /ciclo/u)
})
