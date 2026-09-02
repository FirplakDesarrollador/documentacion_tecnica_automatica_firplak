import assert from 'node:assert/strict'
import test from 'node:test'

import { estimationBomToBomV2 } from './estimationBomToBomV2'
import { estimationBomToSapProductTree } from './estimationBomToSapProductTree'
import type { EstimationDraftBomLine } from './estimationDraft'

function line(overrides: Partial<EstimationDraftBomLine> = {}): EstimationDraftBomLine {
  return {
    id: 'root', parentId: null, origin: 'sap', sapItemCode: 'CMPD01-0001-000-0000', itemName: 'Componente', quantity: 2, uom: 'UND',
    costCategory: 'material', costStrategy: 'sap_direct', unitCost: 1, costEvidence: null, manualCostReason: null, notes: null,
    physicalWeightPolicy: 'direct_weight', physicalWeightCategory: 'product', usefulQuantity: null, fixedWeightKg: null, physicalWeightSnapshot: null, extensions: {},
    ...overrides,
  }
}

test('traduce raíces como ProductTree y BOM V2 fixed', () => {
  const lines = [line({ extensions: { sapComponentWarehouse: 'MP-01', sapIssueMethod: 'im_Backflush' } })]
  const tree = estimationBomToSapProductTree(lines, 'VABC01-0001-000-0100')
  const bom = estimationBomToBomV2(lines)

  assert.deepEqual(tree.finalItemLines, [{ ItemCode: 'CMPD01-0001-000-0000', Quantity: 2, Warehouse: 'MP-01', IssueMethod: 'im_Backflush', Comment: null }])
  assert.equal(bom.lines[0]?.line_kind, 'fixed')
  assert.equal(bom.lines[0]?.base_item_code, 'CMPD01-0001-000-0000')
})

test('crea primero una sub-LdM manual con el código escrito', () => {
  const lines = [
    line({ id: 'sub', origin: 'manual', sapItemCode: 'MANUAL-01', itemName: 'Subconjunto' }),
    line({ id: 'child', parentId: 'sub', sapItemCode: 'CMPD01-0002-000-0000', quantity: 3 }),
  ]
  const tree = estimationBomToSapProductTree(lines, 'VABC01-0001-000-0100')

  assert.equal(tree.subBoms.length, 1)
  assert.equal(tree.subBoms[0]?.lineId, 'sub')
  assert.equal(tree.subBoms[0]?.reuseExisting, false)
  assert.equal(tree.subBoms[0]?.itemCode, 'MANUAL-01')
  assert.equal(tree.subBoms[0]?.sourceItemCode, 'VABC01-0001-000-0100')
})

test('bloquea sub-LdM manual sin código literal', () => {
  const lines = [line({ id: 'sub', origin: 'manual', sapItemCode: null }), line({ id: 'child', parentId: 'sub' })]
  assert.throws(() => estimationBomToSapProductTree(lines, 'VABC01-0001-000-0100'), /código SAP literal/u)
})

test('usa la recomendación guardada por una sub-LdM convertida antes de este flujo', () => {
  const lines = [
    line({ id: 'sub', origin: 'manual', sapItemCode: null, extensions: { suggestedSapItemCode: 'MANUAL-RECOMENDADO' } }),
    line({ id: 'child', parentId: 'sub', sapItemCode: 'CMPD01-0002-000-0000' }),
  ]

  const tree = estimationBomToSapProductTree(lines, 'VABC01-0001-000-0100')
  assert.equal(tree.subBoms[0]?.itemCode, 'MANUAL-RECOMENDADO')
})

test('usa la recomendación guardada para el BOM V2 de una raíz manual', () => {
  const lines = [line({ origin: 'manual', sapItemCode: null, extensions: { suggestedSapItemCode: 'MANUAL-RECOMENDADO' } })]

  const bom = estimationBomToBomV2(lines)
  assert.equal(bom.lines[0]?.base_item_code, 'MANUAL-RECOMENDADO')
})
