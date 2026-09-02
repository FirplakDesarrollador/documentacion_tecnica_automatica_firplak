import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCostedBomTree, flattenCostedBomTree, type CostedBomInputNode, type DirectSapCost } from './costedBom'

const directCost = (unitCost: number | null): DirectSapCost => ({
  unitCost,
  source: unitCost === null ? 'unavailable' : 'last_purchase_receipt_warehouse_average',
  warehouseCode: unitCost === null ? 'MP-01' : 'MP-02',
  documentEntry: null,
  documentNumber: null,
  documentDate: null,
  warning: unitCost === null ? 'Costo pendiente.' : null,
})

function node(overrides: Partial<CostedBomInputNode> = {}): CostedBomInputNode {
  return {
    itemCode: 'ROOT',
    itemName: 'Producto',
    quantity: 1,
    inventoryUom: 'UN',
    bomQuantity: 1,
    componentWarehouse: null,
    outputWarehouse: null,
    lines: [],
    directCost: directCost(null),
    costCategory: 'material',
    ...overrides,
  }
}

test('rollup costs sub-BOM children once and multiplies by parent quantity', () => {
  const tree = buildCostedBomTree(node({
    lines: [
      node({
        itemCode: 'SUB',
        quantity: 2,
        lines: [
          node({ itemCode: 'A', quantity: 3, directCost: directCost(10) }),
          node({ itemCode: 'B', quantity: 1, directCost: directCost(5) }),
        ],
      }),
      node({ itemCode: 'C', quantity: 1, directCost: directCost(7) }),
    ],
  }))

  assert.equal(tree.structuralUnitCost, 77)
  assert.equal(tree.lines[0]?.structuralUnitCost, 35)
  assert.equal(tree.lines[0]?.lineSubtotalCost, 70)
  assert.equal(tree.lines[1]?.lineSubtotalCost, 7)
})

test('assigns leaf subtotals only to their configured cost category', () => {
  const tree = buildCostedBomTree(node({
    lines: [
      node({ itemCode: 'MP', directCost: directCost(10), costCategory: 'material' }),
      node({ itemCode: 'MO', directCost: directCost(5), costCategory: 'mo' }),
      node({ itemCode: 'CIF', directCost: directCost(2), costCategory: 'cif' }),
    ],
  }))
  const rows = flattenCostedBomTree(tree)

  assert.deepEqual(rows.map(row => [row.itemCode, row.subtotalMP, row.subtotalMO, row.subtotalCIF]), [
    ['ROOT', null, null, null],
    ['MP', 10, null, null],
    ['MO', null, 5, null],
    ['CIF', null, null, 2],
  ])
})

test('marks root totals partial when a leaf cost is unavailable', () => {
  const tree = buildCostedBomTree(node({
    lines: [
      node({ itemCode: 'A', directCost: directCost(10) }),
      node({ itemCode: 'B', directCost: directCost(null) }),
    ],
  }))

  assert.equal(tree.structuralUnitCost, null)
  assert.equal(tree.knownStructuralUnitCost, 10)
  assert.equal(tree.pendingCostCount, 1)
  assert.equal(tree.isPartial, true)
})

test('flattens the full hierarchy with levels and accumulated quantities', () => {
  const tree = buildCostedBomTree(node({
    bomQuantity: 2,
    outputWarehouse: 'PT-01',
    lines: [node({ itemCode: 'A', quantity: 4, componentWarehouse: 'MP-04', directCost: directCost(10) })],
  }))
  const rows = flattenCostedBomTree(tree)

  assert.deepEqual(rows.map(row => [row.level, row.itemCode, row.accumulatedQuantity]), [
    [1, 'ROOT', 1],
    [2, 'A', 2],
  ])
  assert.equal(rows[0]?.outputWarehouse, 'PT-01')
  assert.equal(rows[1]?.componentWarehouse, 'MP-04')
})
