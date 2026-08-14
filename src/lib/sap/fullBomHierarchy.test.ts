import assert from 'node:assert/strict'
import test from 'node:test'

import type { BomLine, SapItemBom } from './serviceLayer'
import { buildFullSapBomHierarchy } from './fullBomHierarchyBuilder'

function component(ItemCode: string, Quantity: number, ChildNum: number): BomLine {
  return {
    ItemCode,
    ItemName: `Nombre ${ItemCode}`,
    Quantity,
    Price: 999_999,
    Currency: 'COP',
    IssueMethod: 'im_Backflush',
    InventoryUOM: 'UN',
    ChildNum,
    ParentItem: '',
    Warehouse: 'MP-01',
    Comment: null,
  }
}

function bom(treeCode: string, quantity: number, lines: BomLine[]): SapItemBom {
  return {
    treeCode,
    productDescription: `Árbol ${treeCode}`,
    treeType: 'iProductionTree',
    warehouse: 'PT-01',
    quantity,
    lines,
  }
}

test('construye todos los niveles en orden, conserva UOM/cantidades y detecta ciclos', () => {
  const boms = new Map<string, SapItemBom>([
    ['ROOT', bom('ROOT', 2, [component('A', 4, 0), component('B', 1, 1)])],
    ['A', bom('A', 1, [component('C', 3, 0)])],
    ['C', bom('C', 1, [component('A', 1, 0)])],
  ])
  const itemMasters = new Map<string, Record<string, unknown>>([
    ['ROOT', { ItemName: 'Producto raíz', InventoryUOM: 'UN' }],
    ['A', { ItemName: 'Subestructura A', InventoryUOM: 'KG' }],
    ['B', { ItemName: 'Hoja B', InventoryUOM: 'M' }],
    ['C', { ItemName: 'Subestructura C', InventoryUOM: 'L' }],
  ])
  const result = buildFullSapBomHierarchy('root', boms, itemMasters)

  assert.ok(result.tree)
  assert.equal(result.tree.bomQuantity, 2)
  assert.deepEqual(result.tree.lines.map(line => line.itemCode), ['A', 'B'])
  assert.equal(result.tree.lines[0]?.quantity, 4)
  assert.equal(result.tree.lines[0]?.inventoryUom, 'KG')
  assert.equal(result.tree.lines[0]?.lines[0]?.inventoryUom, 'L')
  assert.equal(result.tree.lines[0]?.lines[0]?.lines[0]?.cycleDetected, true)
})

test('conserva los errores aislados por rama sin descartar la estructura utilizable', () => {
  const errors = { A: 'Rama temporalmente no disponible' }
  const result = buildFullSapBomHierarchy(
    'ROOT',
    new Map([['ROOT', bom('ROOT', 1, [component('A', 1, 0), component('B', 2, 1)])]]),
    new Map(),
    errors,
  )
  assert.deepEqual(result.tree?.lines.map(line => line.itemCode), ['A', 'B'])
  assert.deepEqual(result.branchErrors, errors)
})
