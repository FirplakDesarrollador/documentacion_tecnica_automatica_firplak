import assert from 'node:assert/strict'

import {
  DEFAULT_MEDIA_GAP_MM,
  PRINT_TARGET_3NSTAR,
  PRINT_TARGET_STANDARD,
  normalizePrintTarget,
  resolveThermalPrintLayout,
  suggestThreeNStarMedia,
} from '../src/lib/printLayout'

const direct = resolveThermalPrintLayout({
  designWidthMm: 100,
  designHeightMm: 80,
  mediaWidthMm: 100,
  mediaLengthMm: 80,
})

assert.equal(direct.ok, true)
if (direct.ok) {
  assert.equal(direct.rotation, 'none')
  assert.equal(direct.mediaGapMm, DEFAULT_MEDIA_GAP_MM)
}

const rotated = resolveThermalPrintLayout({
  designWidthMm: 200,
  designHeightMm: 100,
  mediaWidthMm: 100,
  mediaLengthMm: 200,
  mediaGapMm: 2.5,
})

assert.equal(rotated.ok, true)
if (rotated.ok) {
  assert.equal(rotated.rotation, 'rotate_90')
  assert.equal(rotated.mediaWidthMm, 100)
  assert.equal(rotated.mediaLengthMm, 200)
  assert.equal(rotated.mediaGapMm, 2.5)
}

const incompatible = resolveThermalPrintLayout({
  designWidthMm: 120,
  designHeightMm: 70,
  mediaWidthMm: 100,
  mediaLengthMm: 80,
})

assert.equal(incompatible.ok, false)

const tooWide = resolveThermalPrintLayout({
  designWidthMm: 110,
  designHeightMm: 80,
  mediaWidthMm: 110,
  mediaLengthMm: 80,
})

assert.equal(tooWide.ok, false)
assert.deepEqual(suggestThreeNStarMedia(200, 100), { widthMm: 100, lengthMm: 200 })
assert.equal(normalizePrintTarget(PRINT_TARGET_3NSTAR), PRINT_TARGET_3NSTAR)
assert.equal(normalizePrintTarget('legacy'), PRINT_TARGET_STANDARD)

console.log('print layout checks passed')
