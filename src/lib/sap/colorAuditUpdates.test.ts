import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildColorAuditUpdateConfirmation,
  normalizeSapAuditUpdateItems,
  normalizeColorAuditUpdateItems,
  normalizeColorAuditUpdateColor,
} from './colorAuditUpdateRules'

test('normalizes only valid u_color_different candidates', () => {
  const result = normalizeColorAuditUpdateItems([
    {
      itemCode: 'vban05-0001-001-0439',
      expectedColor: ' 0439 ',
      currentColor: ' 0100 ',
      differenceCategory: 'u_color_different',
    },
    {
      itemCode: 'VBAN05-0001-001-0100',
      expectedColor: '0100',
      currentColor: '0100',
      differenceCategory: 'u_color_different',
    },
    {
      itemCode: 'CMPD-0001-001-0439',
      expectedColor: '0439',
      currentColor: '0100',
      differenceCategory: 'u_color_different',
    },
  ])

  assert.deepEqual(result.items, [{
    itemCode: 'VBAN05-0001-001-0439',
    expectedColor: '0439',
    currentColor: '0100',
    differenceCategory: 'u_color_different',
  }])
  assert.deepEqual(result.invalidItemCodes, ['VBAN05-0001-001-0100', 'CMPD-0001-001-0439'])
})

test('allows empty current warehouses when a non-empty consensus is selected', () => {
  const result = normalizeSapAuditUpdateItems('bom_warehouse', [{
    itemCode: 'CMPD-01',
    treeCode: 'VAAA-0001-000-0001',
    childNum: 3,
    currentValue: '',
    expectedValue: ' MP-04 ',
  }])
  assert.deepEqual(result.invalidItemKeys, [])
  assert.deepEqual(result.items, [{
    auditKind: 'bom_warehouse',
    itemCode: 'CMPD-01',
    treeCode: 'VAAA-0001-000-0001',
    childNum: 3,
    currentValue: '',
    expectedValue: 'MP-04',
    decisionSource: 'majority',
  }])
})

test('requires the LdM header identity when normalizing an output warehouse', () => {
  const result = normalizeSapAuditUpdateItems('output_warehouse', [
    { itemCode: 'VAAA-01', treeCode: 'VAAA-01', childNum: null, currentValue: 'PT-02', expectedValue: 'PT-01' },
    { itemCode: 'VAAA-02', treeCode: null, childNum: null, currentValue: 'PT-02', expectedValue: 'PT-01' },
  ])
  assert.deepEqual(result.items, [{
    auditKind: 'output_warehouse',
    itemCode: 'VAAA-01',
    treeCode: 'VAAA-01',
    childNum: null,
    currentValue: 'PT-02',
    expectedValue: 'PT-01',
    decisionSource: 'majority',
  }])
  assert.equal(result.invalidItemKeys.length, 1)
})

test('requires a valid issue method and the exact LdM line identity', () => {
  const result = normalizeSapAuditUpdateItems('issue_method', [
    { itemCode: 'CMPD-01', treeCode: 'VAAA-0001-000-0001', childNum: 0, currentValue: 'im_Manual', expectedValue: 'im_Backflush' },
    { itemCode: 'CMPD-01', treeCode: 'VAAA-0001-000-0001', childNum: null, currentValue: 'im_Manual', expectedValue: 'im_Backflush' },
    { itemCode: 'CMPD-02', treeCode: 'VAAA-0001-000-0001', childNum: 1, currentValue: 'im_Manual', expectedValue: 'otro' },
  ])
  assert.equal(result.items.length, 1)
  assert.equal(result.invalidItemKeys.length, 2)
})

test('records whether a configuration target came from majority, minority, or no consensus', () => {
  const result = normalizeSapAuditUpdateItems('issue_method', [{
    itemCode: 'CMPD-01',
    treeCode: 'VAAA-0001-000-0001',
    childNum: 0,
    currentValue: 'im_Manual',
    expectedValue: 'im_Backflush',
    decisionSource: 'minority',
  }])
  assert.equal(result.items[0]?.decisionSource, 'minority')
})

test('rejects empty or invalid colors and duplicate candidates', () => {
  const result = normalizeColorAuditUpdateItems([
    { itemCode: 'VBAN05-0001-001-0439', expectedColor: '0439', currentColor: '', differenceCategory: 'u_color_different' },
    { itemCode: 'VBAN05-0001-001-0439', expectedColor: '0439', currentColor: '0100', differenceCategory: 'u_color_different' },
    { itemCode: 'VBAN05-0001-001-0439', expectedColor: '0439', currentColor: '0100', differenceCategory: 'match' },
  ])

  assert.equal(result.items.length, 1)
  assert.deepEqual(result.invalidItemCodes, [
    'VBAN05-0001-001-0439',
    'VBAN05-0001-001-0439',
  ])
  assert.equal(normalizeColorAuditUpdateColor(' 01 00 '), '0100')
})

test('builds an exact confirmation for the selected operation', () => {
  assert.equal(buildColorAuditUpdateConfirmation(313), 'CAMBIAR U_COLOR EN SAP PARA 313 SKU')
})
