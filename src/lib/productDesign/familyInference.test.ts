import assert from 'node:assert/strict'
import test from 'node:test'

import { familyNameFromSapItemGroup, inferFamilyFromSapDescriptions } from './familyInference'

test('infers a Versa washing-area family from recurring SAP descriptions', () => {
  const result = inferFamilyFromSapDescriptions([
    'LAVARROPAS VERSA 50X50 BRILLANTE BLANCO',
    'LAVARROPAS VERSA 55X50 BRILLANTE MARFIL',
    'LAVARROPAS VERSA 60X50 NEGRO',
  ])

  assert.equal(result.familyName, 'LAVARROPAS VERSA')
  assert.equal(result.productType, 'LAVARROPAS')
  assert.equal(result.zoneHome, 'ROPAS')
  assert.equal(result.useDestination, 'LAVARROPAS')
})

test('removes the SAP article-group code from the suggested family name', () => {
  assert.equal(familyNameFromSapItemGroup('ROP01-LVR AQUA-const'), 'LVR AQUA-const')
})

test('does not invent a zone when SAP descriptions have no known product class', () => {
  const result = inferFamilyFromSapDescriptions(['PRODUCTO ALFA 40X50', 'PRODUCTO ALFA 50X50'])

  assert.equal(result.productType, 'ALFA')
  assert.equal(result.zoneHome, '')
  assert.equal(result.useDestination, '')
})
