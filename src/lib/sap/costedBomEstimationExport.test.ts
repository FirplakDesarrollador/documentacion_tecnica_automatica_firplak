import assert from 'node:assert/strict'
import test from 'node:test'

import type { CostedBomInputNode, DirectSapCost } from './costedBom'
import { buildCostedBomTree } from './costedBom'
import { convertSapCostedBomToEstimationExport } from './costedBomEstimationExport'

const directCost = (unitCost: number): DirectSapCost => ({ unitCost, source: 'mp01_warehouse_average', warehouseCode: 'MP-01', documentEntry: null, documentNumber: null, documentDate: null, warning: null })
const node = (overrides: Partial<CostedBomInputNode> = {}): CostedBomInputNode => ({ itemCode: 'ROOT', itemName: 'Root', quantity: 1, inventoryUom: 'UN', bomQuantity: 1, componentWarehouse: null, outputWarehouse: null, lines: [], directCost: directCost(1), costCategory: 'material', ...overrides })

test('converts SAP costs to estimation rows and category totals', () => {
  const tree = buildCostedBomTree(node({ lines: [
    node({ itemCode: 'MP', directCost: directCost(10) }),
    node({ itemCode: 'MO', directCost: directCost(5), costCategory: 'mo' }),
  ] }))
  const result = convertSapCostedBomToEstimationExport(tree)

  assert.equal(result.rows[0]?.isContainer, true)
  assert.equal(result.rows[1]?.subtotalMP, 10)
  assert.equal(result.rows[2]?.subtotalMO, 5)
  assert.equal(result.totals.expandedTotal, 15)
  assert.equal(result.totals.materialsAndPackaging, 10)
})
