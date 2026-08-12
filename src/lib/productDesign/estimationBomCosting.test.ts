import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateEstimationBomCosting,
  type EstimationBomCostLine,
} from './estimationBomCosting'

function line({ id, ...overrides }: Partial<EstimationBomCostLine> & Pick<EstimationBomCostLine, 'id'>): EstimationBomCostLine {
  return {
    id,
    parentId: null,
    quantity: 1,
    uom: 'UN',
    costCategory: 'material',
    costStrategy: 'manual_override',
    unitCost: 1,
    ...overrides,
  }
}

test('suma sólo desde raíces, propaga cantidades anidadas y separa los dos totales', () => {
  const result = evaluateEstimationBomCosting({
    lines: [
      line({ id: 'root', costStrategy: 'expand_children', unitCost: 999_999 }),
      line({ id: 'mix', parentId: 'root', quantity: 2, costStrategy: 'expand_children', unitCost: 99_999 }),
      line({ id: 'resin', parentId: 'mix', quantity: 3, unitCost: 10, costCategory: 'material' }),
      line({ id: 'box', parentId: 'root', unitCost: 5, costCategory: 'packaging' }),
      line({ id: 'labor', parentId: 'root', unitCost: 7, costCategory: 'mo' }),
      line({ id: 'factory', parentId: 'root', unitCost: 2, costCategory: 'cif' }),
      line({ id: 'extra', parentId: 'root', unitCost: 1, costCategory: 'other' }),
    ],
  })

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.totals.byCategory, {
    material: 60,
    packaging: 5,
    mo: 7,
    cif: 2,
    other: 1,
  })
  assert.equal(result.totals.materialsAndPackaging, 65)
  assert.equal(result.totals.expandedTotal, 75)
  assert.equal(result.lineValuations.filter(valuation => valuation.lineId === 'resin')[0]?.effectiveQuantity, 6)
  assert.equal(result.lineValuations.filter(valuation => valuation.lineId === 'root')[0]?.totalCost, 75)
})

test('un override manual en un padre reemplaza totalmente el costo de sus hijos', () => {
  const result = evaluateEstimationBomCosting({
    lines: [
      line({ id: 'root', costStrategy: 'expand_children' }),
      line({ id: 'substructure', parentId: 'root', quantity: 2, unitCost: 12, costCategory: 'material' }),
      line({ id: 'ignored-child', parentId: 'substructure', quantity: 4, unitCost: 100, costCategory: 'packaging' }),
      line({ id: 'box', parentId: 'root', unitCost: 1, costCategory: 'packaging' }),
    ],
  })

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.totals.byCategory.material, 24)
  assert.equal(result.totals.byCategory.packaging, 1)
  assert.equal(result.totals.expandedTotal, 25)
  assert.equal(result.lineValuations.some(valuation => valuation.lineId === 'ignored-child'), false)
  assert.deepEqual(
    result.lineValuations.find(valuation => valuation.lineId === 'substructure')?.ignoredChildLineIds,
    ['ignored-child'],
  )
})

test('detecta padres inexistentes, ciclos y valores de cantidad, costo o unidad inválidos', () => {
  const result = evaluateEstimationBomCosting({
    lines: [
      line({ id: 'cycle-a', parentId: 'cycle-b' }),
      line({ id: 'cycle-b', parentId: 'cycle-a' }),
      line({ id: 'missing-parent', parentId: 'not-found' }),
      line({ id: 'bad-quantity', quantity: 0 }),
      line({ id: 'bad-cost', unitCost: 0 }),
      line({ id: 'bad-uom', uom: ' ' }),
    ],
  })

  assert.equal(result.ok, false)
  if (result.ok) return

  const codes = result.issues.map(issue => issue.code)
  assert.ok(codes.includes('parent_not_found'))
  assert.ok(codes.includes('cycle_detected'))
  assert.ok(codes.includes('quantity_invalid'))
  assert.ok(codes.includes('unit_cost_invalid'))
  assert.ok(codes.includes('uom_invalid'))
})

test('un nodo expandible sin hijos no oculta un costo ni una unidad faltante', () => {
  const result = evaluateEstimationBomCosting({
    lines: [
      line({ id: 'empty-expand', costStrategy: 'expand_children', unitCost: null, uom: null }),
    ],
  })

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.deepEqual(
    result.issues.map(issue => issue.code).sort(),
    ['expand_children_without_children', 'uom_invalid'].sort(),
  )
})
