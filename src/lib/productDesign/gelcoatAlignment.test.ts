import assert from 'node:assert/strict'
import test from 'node:test'

import { proposeGelcoatReplacements, sapItemColorCode } from './gelcoatAlignment'
import type { EstimationDraftBomLine } from './estimationDraft'

const line = (sapItemCode: string): EstimationDraftBomLine => ({ id: sapItemCode, parentId: null, origin: 'sap', sapItemCode, itemName: null, quantity: 1, uom: 'KG', costCategory: 'material', costStrategy: 'manual_override', unitCost: null, costEvidence: null, manualCostReason: null, notes: null, physicalWeightPolicy: 'from_quantity', usefulQuantity: null, fixedWeightKg: null, physicalWeightSnapshot: null, extensions: {} })

test('deriva el color desde el último bloque del SKU SAP', () => {
  assert.equal(sapItemColorCode('PGEL01-0003-000-0100'), '0100')
  assert.equal(sapItemColorCode('CMPD01-0022-000-0000'), '0000')
})

test('propone cambiar sólo las líneas PGEL sin alterar otros componentes', () => {
  const proposal = proposeGelcoatReplacements([line('PGEL01-0003-000-0100'), line('CMPD01-0022-000-0000')], '0103')
  assert.deepEqual(proposal.map(item => item.proposedItemCode), ['PGEL01-0003-000-0103'])
})
