import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyColorAuditItem,
  groupColorAuditCorrections,
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
