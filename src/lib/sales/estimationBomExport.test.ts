import assert from 'node:assert/strict'
import test from 'node:test'

import type { EstimationDraftBomLine } from '@/lib/productDesign/estimationDraft'
import { buildEstimationBomClipboardText, buildEstimationBomExportRows } from './estimationBomExport'

function line(id: string, overrides: Partial<EstimationDraftBomLine> = {}): EstimationDraftBomLine {
  return {
    id,
    parentId: null,
    origin: 'manual',
    sapItemCode: id,
    itemName: id,
    quantity: 1,
    uom: 'UN',
    costCategory: 'material',
    costStrategy: 'manual_override',
    unitCost: 1,
    costEvidence: null,
    manualCostReason: null,
    notes: null,
    physicalWeightPolicy: 'direct_weight',
    physicalWeightCategory: null,
    usefulQuantity: null,
    fixedWeightKg: null,
    physicalWeightSnapshot: null,
    extensions: {},
    ...overrides,
  }
}

function fixtureLines(): EstimationDraftBomLine[] {
  return [
    line('root', { costStrategy: 'expand_children', unitCost: null }),
    line('substructure', { parentId: 'root', quantity: 0.2, costStrategy: 'expand_children', unitCost: null }),
    line('material', { parentId: 'substructure', quantity: 6.91, unitCost: 10.282 }),
    line('packaging', { parentId: 'root', costCategory: 'packaging', unitCost: 5 }),
    line('labor', { parentId: 'root', costCategory: 'mo', unitCost: 3 }),
    line('cif', { parentId: 'root', costCategory: 'cif', unitCost: 2 }),
  ]
}

test('construye subtotales por categoría con cantidades efectivas', () => {
  const rows = buildEstimationBomExportRows(fixtureLines(), { itemCode: 'PRODUCTO', itemName: 'Producto de prueba' })
  const container = rows.find(row => row.id === 'substructure')
  const material = rows.find(row => row.id === 'material')

  assert.equal(container?.level, 3)
  assert.equal(container?.subtotalMP, null)
  assert.equal(container?.unitCost, null)
  assert.equal(material?.level, 4)
  assert.equal(material?.parentId, 'substructure')
  assert.ok(Math.abs((material?.effectiveQuantity ?? 0) - 1.382) < 1e-12)
  assert.ok(Math.abs((material?.subtotalMP ?? 0) - 1.382 * 10.282) < 1e-12)
  assert.equal(rows.find(row => row.id === 'packaging')?.subtotalMP, 5)
  assert.equal(rows.find(row => row.id === 'labor')?.subtotalMO, 3)
  assert.equal(rows.find(row => row.id === 'cif')?.subtotalCIF, 2)
})

test('el portapapeles usa coma decimal, dos decimales y no agrega moneda', () => {
  const rows = buildEstimationBomExportRows([
    line('root', { costStrategy: 'expand_children', unitCost: null }),
    line('leaf', { parentId: 'root', quantity: 1, unitCost: 390.6648 }),
  ])
  const clipboard = buildEstimationBomClipboardText(rows)

  assert.match(clipboard, /390,66/u)
  assert.doesNotMatch(clipboard, /390\.66/u)
  assert.doesNotMatch(clipboard, /\$/u)
  assert.equal(clipboard.split('\n')[1]?.split('\t').length, 10)
})
