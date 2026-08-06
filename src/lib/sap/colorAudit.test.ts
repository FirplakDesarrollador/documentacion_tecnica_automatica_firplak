import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSapAuditReport,
  classifyColorAuditItem,
  groupColorAuditCorrections,
  mergeColorAuditTrees,
  normalizeColorAuditItem,
  parseColorAuditItemCode,
  summarizeColorAuditRows,
} from './colorAudit'

test('acepta todas las versiones de un SKU V y extrae el cuarto bloque', () => {
  assert.deepEqual(parseColorAuditItemCode('VBAN05-0001-001-0439'), {
    itemCode: 'VBAN05-0001-001-0439',
    familyCode: 'VBAN05',
    referenceCode: '0001',
    versionCode: '001',
    expectedColor: '0439',
  })
})

test('rechaza componentes no V y conserva colores de SKU inválidos para auditarlos', () => {
  assert.equal(parseColorAuditItemCode('CMPD05-0001-000-0439'), null)
  assert.equal(parseColorAuditItemCode('CEMP05-0001-003-0439'), null)
  assert.equal(parseColorAuditItemCode('PZCO05-0001-000-0439'), null)
  assert.equal(parseColorAuditItemCode('VBAN05-0001-017-')?.expectedColor ?? null, null)
})

test('normaliza U_Color y clasifica vacío, inválido, diferente y compatible', () => {
  const base = { ItemName: 'Producto', Valid: 'tYES', Frozen: 'tNO', TreeType: 'iProductionTree' }
  const compatible = normalizeColorAuditItem({ ...base, ItemCode: 'VBAN05-0001-001-0439', U_Color: ' 04 39 ' })
  const empty = normalizeColorAuditItem({ ...base, ItemCode: 'VBAN05-0001-001-0439', U_Color: null })
  const invalid = normalizeColorAuditItem({ ...base, ItemCode: 'VBAN05-0001-001-0439', U_Color: '43' })
  const different = normalizeColorAuditItem({ ...base, ItemCode: 'VBAN05-0001-001-0439', U_Color: '0462' })

  assert.equal(compatible && classifyColorAuditItem(compatible, { treeCode: compatible.itemCode, treeType: 'iProductionTree', productDescription: 'Producto' }).differenceCategory, 'match')
  assert.equal(empty && classifyColorAuditItem(empty, null).differenceCategory, 'u_color_empty')
  assert.equal(invalid && classifyColorAuditItem(invalid, null).differenceCategory, 'u_color_invalid')
  assert.equal(different && classifyColorAuditItem(different, null).differenceCategory, 'u_color_different')
})

test('separa productivos, kits, otros árboles y ausencia de LdM', () => {
  const item = normalizeColorAuditItem({ ItemCode: 'VBAN05-0001-001-0439', ItemName: 'Producto', U_Color: '0439', Valid: 'tYES', Frozen: 'tNO' })
  assert.ok(item)
  assert.equal(classifyColorAuditItem(item, { treeCode: item.itemCode, treeType: 'iProductionTree', productDescription: null }).treeCategory, 'productive')
  assert.equal(classifyColorAuditItem(item, { treeCode: item.itemCode, treeType: 'iSalesTree', productDescription: null }).treeCategory, 'kit')
  assert.equal(classifyColorAuditItem(item, { treeCode: item.itemCode, treeType: 'P', productDescription: null }).treeCategory, 'productive')
  assert.equal(classifyColorAuditItem(item, { treeCode: item.itemCode, treeType: 'S', productDescription: null }).treeCategory, 'kit')
  assert.equal(classifyColorAuditItem(item, { treeCode: item.itemCode, treeType: 'iTemplateTree', productDescription: null }).treeCategory, 'other_tree')
  assert.equal(classifyColorAuditItem(item, null).treeCategory, 'no_bom')
})

test('mantiene evidencia exacta en los grupos de corrección', () => {
  const rows = ['VBAN05-0001-001-0439', 'VBAN05-0002-017-0439', 'VBAN05-0003-002-0439'].map(itemCode => {
    const item = normalizeColorAuditItem({ ItemCode: itemCode, ItemName: itemCode, U_Color: '0462', Valid: 'tYES', Frozen: 'tNO' })
    assert.ok(item)
    return classifyColorAuditItem(item, { treeCode: itemCode, treeType: 'iProductionTree', productDescription: null })
  })
  const groups = groupColorAuditCorrections(rows)
  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.count, 3)
  assert.deepEqual(groups[0]?.examples, rows.map(row => row.itemCode))
  assert.equal(summarizeColorAuditRows(rows).uColorDifferent, 3)
})

test('reutiliza las líneas directas y separa producto de kit al calcular mayorías', () => {
  const makeItem = (itemCode: string, defaultWarehouse: string) => {
    const item = normalizeColorAuditItem({
      ItemCode: itemCode,
      ItemName: itemCode,
      U_Color: '0001',
      SalesItem: 'tYES',
      DefaultWarehouse: defaultWarehouse,
      Valid: 'tYES',
      Frozen: 'tNO',
    })
    assert.ok(item)
    return item
  }
  const items = [
    makeItem('VAAA-0001-000-0001', 'PT-01'),
    makeItem('VAAA-0002-000-0001', 'PT-01'),
    makeItem('VAAA-0003-000-0001', 'PT-09'),
    makeItem('VAAA-0004-000-0001', 'PT-09'),
    makeItem('VAAA-0005-000-0001', 'PT-09'),
  ]
  const trees = [
    {
      treeCode: items[0].itemCode,
      treeType: 'iProductionTree',
      productDescription: 'Producto 1',
      lines: [{ childNum: 0, itemCode: 'CMPD-01', itemName: 'Tablero', warehouse: 'MP-04', issueMethod: 'im_Manual' }],
    },
    {
      treeCode: items[1].itemCode,
      treeType: 'iProductionTree',
      productDescription: 'Producto 2',
      lines: [{ childNum: 0, itemCode: 'CMPD-01', itemName: 'Tablero', warehouse: 'MP-04', issueMethod: 'im_Manual' }],
    },
    {
      treeCode: items[2].itemCode,
      treeType: 'iProductionTree',
      productDescription: 'Producto 3',
      lines: [{ childNum: 0, itemCode: 'CMPD-01', itemName: 'Tablero', warehouse: 'MP-12', issueMethod: 'im_Backflush' }],
    },
    {
      treeCode: items[3].itemCode,
      treeType: 'iSalesTree',
      productDescription: 'Kit 1',
      lines: [{ childNum: 0, itemCode: 'CMPD-01', itemName: 'Tablero', warehouse: 'MP-12', issueMethod: 'im_Backflush' }],
    },
    {
      treeCode: items[4].itemCode,
      treeType: 'iSalesTree',
      productDescription: 'Kit 2',
      lines: [{ childNum: 0, itemCode: 'CMPD-01', itemName: 'Tablero', warehouse: 'MP-12', issueMethod: 'im_Backflush' }],
    },
  ]

  const warehouseReport = buildSapAuditReport('bom_warehouse', items, trees)
  assert.equal(warehouseReport.groups.length, 1)
  assert.equal(warehouseReport.groups[0]?.treeCategory, 'productive')
  assert.equal(warehouseReport.groups[0]?.currentValue, 'MP-12')
  assert.equal(warehouseReport.groups[0]?.expectedValue, 'MP-04')
  assert.equal(warehouseReport.groups[0]?.evidence[0]?.childNum, 0)

  const methodReport = buildSapAuditReport('issue_method', items, trees)
  assert.equal(methodReport.groups[0]?.currentValue, 'im_Backflush')
  assert.equal(methodReport.groups[0]?.expectedValue, 'im_Manual')
})

test('marca empates como sin consenso y no los ofrece para normalizar', () => {
  const items = ['VAAA-0010-000-0001', 'VAAA-0011-000-0001'].map(itemCode => {
    const item = normalizeColorAuditItem({ ItemCode: itemCode, ItemName: itemCode, U_Color: '0001', SalesItem: 'tYES', Valid: 'tYES', Frozen: 'tNO' })
    assert.ok(item)
    return item
  })
  const report = buildSapAuditReport('bom_warehouse', items, [
    { treeCode: items[0].itemCode, treeType: 'iProductionTree', productDescription: null, lines: [{ childNum: 0, itemCode: 'CMPD-02', itemName: 'Canto', warehouse: 'MP-04', issueMethod: 'im_Manual' }] },
    { treeCode: items[1].itemCode, treeType: 'iProductionTree', productDescription: null, lines: [{ childNum: 0, itemCode: 'CMPD-02', itemName: 'Canto', warehouse: 'MP-12', issueMethod: 'im_Manual' }] },
  ])
  assert.equal(report.groups[0]?.status, 'no_consensus')
  assert.equal(report.groups[0]?.canNormalize, false)
  assert.deepEqual(report.groups[0]?.valueOptions, [
    { value: 'MP-04', count: 1 },
    { value: 'MP-12', count: 1 },
  ])
})

test('informa SKU de venta sin LdM u otro TreeType sin incluirlos en correcciones', () => {
  const withoutBom = normalizeColorAuditItem({
    ItemCode: 'VAAA-0020-000-0001',
    ItemName: 'Sin LdM',
    U_Color: '0001',
    SalesItem: 'tYES',
    Valid: 'tNO',
    Frozen: 'tYES',
  })
  const otherTree = normalizeColorAuditItem({
    ItemCode: 'VAAA-0021-000-0001',
    ItemName: 'Plantilla',
    U_Color: '0001',
    SalesItem: 'tYES',
    Valid: 'tYES',
    Frozen: 'tNO',
  })
  assert.ok(withoutBom)
  assert.ok(otherTree)

  const report = buildSapAuditReport('output_warehouse', [withoutBom, otherTree], [{
    treeCode: otherTree.itemCode,
    treeType: 'iTemplateTree',
    productDescription: null,
    lines: [],
  }])

  assert.equal(report.reviewed, 0)
  assert.equal(report.eligibleCount, 0)
  assert.deepEqual(report.excludedItems.map(item => [item.itemCode, item.treeCategory, item.productStatus]), [
    ['VAAA-0020-000-0001', 'no_bom', 'inactive_frozen'],
    ['VAAA-0021-000-0001', 'other_tree', 'active'],
  ])
})

test('calcula bodega de salida desde el encabezado de la LdM, no desde el Item', () => {
  const items = [
    ['VAAA-0030-000-0001', 'PT-01'],
    ['VAAA-0031-000-0001', 'PT-01'],
    ['VAAA-0032-000-0001', 'PT-09'],
  ].map(([itemCode, defaultWarehouse]) => {
    const item = normalizeColorAuditItem({
      ItemCode: itemCode,
      ItemName: itemCode,
      U_Color: '0001',
      SalesItem: 'tYES',
      DefaultWarehouse: defaultWarehouse,
      TreeType: 'iProductionTree',
      Valid: 'tYES',
      Frozen: 'tNO',
    })
    assert.ok(item)
    return item
  })

  const report = buildSapAuditReport('output_warehouse', items, [
    { treeCode: items[0].itemCode, treeType: 'iProductionTree', productDescription: null, headerWarehouse: 'PT-01', lines: [] },
    { treeCode: items[1].itemCode, treeType: 'iProductionTree', productDescription: null, headerWarehouse: 'PT-01', lines: [] },
    { treeCode: items[2].itemCode, treeType: 'iProductionTree', productDescription: null, headerWarehouse: 'PT-09', lines: [] },
  ])
  assert.equal(report.groups.length, 1)
  assert.equal(report.groups[0]?.currentValue, 'PT-09')
  assert.equal(report.groups[0]?.expectedValue, 'PT-01')
  assert.equal(report.groups[0]?.canNormalize, true)
})

test('reporta un almacén distinto dentro de una misma LdM con mayoría interna', () => {
  const item = normalizeColorAuditItem({
    ItemCode: 'VAAA-0050-000-0001',
    ItemName: 'Producto',
    U_Color: '0001',
    SalesItem: 'tYES',
    Valid: 'tYES',
    Frozen: 'tNO',
  })
  assert.ok(item)

  const report = buildSapAuditReport('bom_warehouse', [item], [{
    treeCode: item.itemCode,
    treeType: 'iProductionTree',
    productDescription: 'Producto',
    headerWarehouse: 'PT-02',
    lines: [
      { childNum: 0, itemCode: 'CMPD-01', itemName: 'Componente 1', warehouse: 'MP-04', issueMethod: 'im_Manual' },
      { childNum: 1, itemCode: 'CMPD-02', itemName: 'Componente 2', warehouse: 'MP-04', issueMethod: 'im_Manual' },
      { childNum: 2, itemCode: 'CMPD-03', itemName: 'Componente 3', warehouse: 'MP-12', issueMethod: 'im_Manual' },
    ],
  }])

  assert.equal(report.groups.length, 1)
  assert.equal(report.groups[0]?.rule, 'tree_line_uniformity')
  assert.equal(report.groups[0]?.currentValue, 'MP-12')
  assert.equal(report.groups[0]?.expectedValue, 'MP-04')
  assert.equal(report.groups[0]?.canNormalize, true)
})

test('no reporta una LdM como ausente mientras su lectura exacta sigue en cola', () => {
  const item = normalizeColorAuditItem({
    ItemCode: 'VAAA-0040-000-0001',
    ItemName: 'Pendiente',
    U_Color: '0001',
    SalesItem: 'tYES',
    TreeType: 'iProductionTree',
    Valid: 'tYES',
    Frozen: 'tNO',
  })
  assert.ok(item)

  const report = buildSapAuditReport('bom_warehouse', [item], [], { pendingTreeItemCodes: new Set([item.itemCode]) })
  assert.equal(report.excludedItems.length, 0)
  assert.equal(report.reviewed, 0)
})

test('reconstruye una LdM cuyas líneas directas llegan en páginas QueryService separadas', () => {
  const treeCode = 'VAAA-0060-000-0001'
  let trees = mergeColorAuditTrees([], [{
    treeCode,
    treeType: 'iProductionTree',
    productDescription: 'Producto paginado',
    headerWarehouse: 'PT-02',
    lines: [{ childNum: 0, itemCode: 'CMPD-01', itemName: 'Componente 1', warehouse: 'MP-04', issueMethod: 'im_Manual' }],
  }])
  trees = mergeColorAuditTrees(trees, [{
    treeCode,
    treeType: 'iProductionTree',
    productDescription: 'Producto paginado',
    headerWarehouse: 'PT-02',
    lines: [{ childNum: 1, itemCode: 'CMPD-02', itemName: 'Componente 2', warehouse: 'MP-04', issueMethod: 'im_Backflush' }],
  }])
  trees = mergeColorAuditTrees(trees, [{
    treeCode,
    treeType: 'iProductionTree',
    productDescription: 'Producto paginado',
    headerWarehouse: 'PT-02',
    lines: [],
  }])

  assert.equal(trees.length, 1)
  assert.equal(trees[0]?.headerWarehouse, 'PT-02')
  assert.deepEqual(trees[0]?.lines?.map(line => [line.childNum, line.itemCode]), [
    [0, 'CMPD-01'],
    [1, 'CMPD-02'],
  ])
})
