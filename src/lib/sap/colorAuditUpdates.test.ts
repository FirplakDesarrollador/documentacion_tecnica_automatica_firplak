import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildColorAuditUpdateConfirmation,
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
