import assert from 'node:assert/strict'
import test from 'node:test'

import { isDecimalInput, parseDecimalInput } from './decimalInput'

test('normaliza separadores decimales con coma y punto', () => {
  const cases: Array<[string, number]> = [
    ['6,531', 6.531],
    ['6.531', 6.531],
    [' 0,4 ', 0.4],
    ['0.', 0],
    ['0,', 0],
  ]
  cases.forEach(([input, expected]) => assert.equal(parseDecimalInput(input), expected))
})

test('rechaza formatos no admitidos', () => {
  ['', '1,2.3', '1.2,3', 'texto', '-1'].forEach(input => assert.equal(parseDecimalInput(input), null))
})

test('permite estados intermedios para que el usuario complete el decimal', () => {
  assert.equal(isDecimalInput('0,'), true)
  assert.equal(isDecimalInput('0.'), true)
  assert.equal(isDecimalInput('1,2.3'), false)
})
