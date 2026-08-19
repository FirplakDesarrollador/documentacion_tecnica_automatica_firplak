import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateEstimationBomCosting,
  type EstimationBomCostLine,
} from './estimationBomCosting'
import { inferEstimationSapCostCategory } from './estimationSapClassification'

function line({ id, ...overrides }: Partial<EstimationBomCostLine> & Pick<EstimationBomCostLine, 'id'>): EstimationBomCostLine {
  return {
    id,
    parentId: null,
    quantity: 1,
    uom: 'UN',
    costCategory: 'material',
    costStrategy: 'manual_override',
    origin: 'manual',
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

test('los descendientes excluidos por un override manual no bloquean el total aunque estén incompletos', () => {
  const result = evaluateEstimationBomCosting({
    lines: [
      line({ id: 'manual-boundary', origin: 'manual', costStrategy: 'manual_override', unitCost: 25 }),
      line({ id: 'pending-child', parentId: 'manual-boundary', quantity: 0, uom: null, unitCost: null }),
    ],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.totals.expandedTotal, 25)
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

test('PGEL01-0003-000-0100 totaliza 19.650 únicamente desde sus hojas SAP', () => {
  const result = evaluateEstimationBomCosting({
    lines: [
      line({ id: 'PGEL01-0003-000-0100', origin: 'sap', costStrategy: 'expand_children', unitCost: 12_327.89, bomQuantity: 1 }),
      line({ id: 'CMPD01-0022-000-0000', parentId: 'PGEL01-0003-000-0100', origin: 'sap', costStrategy: 'sap_direct', unitCost: 18_687 }),
      line({ id: 'PZCO01-0001-000-0000', parentId: 'PGEL01-0003-000-0100', origin: 'sap', costStrategy: 'sap_direct', unitCost: 405, costCategory: 'mo' }),
      line({ id: 'PZCO01-0002-000-0000', parentId: 'PGEL01-0003-000-0100', origin: 'sap', costStrategy: 'sap_direct', unitCost: 558, costCategory: 'cif' }),
    ],
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.totals.expandedTotal, 19_650)
  assert.equal(result.lineValuations.find(valuation => valuation.lineId === 'PGEL01-0003-000-0100')?.structuralUnitCost, 19_650)
})

test('normaliza cantidades anidadas por la cantidad base de cada ProductTree', () => {
  const result = evaluateEstimationBomCosting({
    lines: [
      line({ id: 'root', quantity: 2, costStrategy: 'expand_children', bomQuantity: 2 }),
      line({ id: 'leaf', parentId: 'root', quantity: 3, origin: 'sap', costStrategy: 'sap_direct', unitCost: 10 }),
    ],
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.totals.expandedTotal, 30)
  assert.equal(result.lineValuations.find(valuation => valuation.lineId === 'root')?.structuralUnitCost, 15)
})

test('una cabecera SAP no admite un override manual', () => {
  const result = evaluateEstimationBomCosting({
    lines: [line({ id: 'sap-header', origin: 'sap', costStrategy: 'manual_override', unitCost: 100 })],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some(issue => issue.code === 'sap_manual_override_forbidden'))
})

test('una sub-LdM SAP anidada se calcula sin pedir costo a sus cabeceras', () => {
  const result = evaluateEstimationBomCosting({
    lines: [
      line({ id: 'PINP01-0006-000-0000', origin: 'sap', costStrategy: 'expand_children', unitCost: null }),
      line({ id: 'CMPD02-0011-000-0000', parentId: 'PINP01-0006-000-0000', origin: 'sap', costStrategy: 'expand_children', unitCost: null }),
      line({ id: 'leaf-a', parentId: 'CMPD02-0011-000-0000', origin: 'sap', costStrategy: 'sap_direct', unitCost: 4 }),
      line({ id: 'leaf-b', parentId: 'CMPD02-0011-000-0000', origin: 'sap', costStrategy: 'sap_direct', unitCost: 6 }),
    ],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.totals.expandedTotal, 10)
})

test('clasifica las líneas operativas SAP de mano de obra y CIF', () => {
  assert.equal(inferEstimationSapCostCategory('PZCO01-0001-000-0000', 'MANO OBRA POR MINUTO'), 'mo')
  assert.equal(inferEstimationSapCostCategory('PZCO01-0002-000-0000', 'CIF POR MINUTO'), 'cif')
  assert.equal(inferEstimationSapCostCategory('CMPD01-0022-000-0000', 'GELCOAT'), 'material')
})

test('clasifica como empaque los códigos EMP y los nombres de empaque', () => {
  assert.equal(inferEstimationSapCostCategory('EMP01-0001-000-0000', 'CAJA DE CARTÓN'), 'packaging')
  assert.equal(inferEstimationSapCostCategory('CEMP01-0002-000-0000', 'EMPACADO POLIETILENO'), 'packaging')
  assert.equal(inferEstimationSapCostCategory('VEMP02-0001-000-0000', 'CINTA ADHESIVA'), 'packaging')
  assert.equal(inferEstimationSapCostCategory('PEMP03-0001-000-0000', 'EMBALAJE CORRUGADO'), 'packaging')
  assert.equal(inferEstimationSapCostCategory('CMPD01-0023-000-0000', 'CAJAS CORRUGADAS 40X40'), 'packaging')
  assert.equal(inferEstimationSapCostCategory('CMPD01-0024-000-0000', 'CARTÓN FLETE'), 'material')
  assert.equal(inferEstimationSapCostCategory('PZCO01-0001-000-0000', 'CAJA'), 'mo')
})
