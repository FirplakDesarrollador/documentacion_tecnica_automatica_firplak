import assert from 'node:assert/strict'

import {
  DEFAULT_MEDIA_GAP_MM,
  PRINT_TARGET_3NSTAR,
  PRINT_TARGET_STANDARD,
  normalizePrintTarget,
  resolveThermalPrintLayout,
  suggestThreeNStarMedia,
} from '../src/lib/printLayout'
import { packTsplBitmap } from '../src/lib/print/tspl'

function findByteSequence(haystack: Uint8Array, needle: Uint8Array) {
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let matched = true
    for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1) {
      if (haystack[index + needleIndex] !== needle[needleIndex]) {
        matched = false
        break
      }
    }
    if (matched) return index
  }
  return -1
}

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

const grayscale = new Uint8Array([
  0, 255, 0, 255, 0, 255, 0, 255,
  0, 0, 0, 0, 0, 0, 0, 0,
])
const packed = packTsplBitmap({
  grayscale,
  widthPx: 8,
  heightPx: 2,
  widthMm: 1,
  heightMm: 2,
  gapMm: 3,
  copies: 2,
  colorMode: 'normal',
  rotationApplied: 'none',
})
const text = new TextDecoder().decode(packed.bytes)
assert.match(text, /SIZE 1\.0 mm, 2\.0 mm/)
assert.match(text, /GAP 3\.0 mm, 0 mm/)
assert.match(text, /PRINT 1,2/)
assert.equal(packed.bytesPerRow, 1)
assert.equal(packed.metadata.dotsWidth, 8)

const marker = new TextEncoder().encode('BITMAP 0,0,1,2,1,')
const bitmapStart = findByteSequence(packed.bytes, marker) + marker.length
assert.equal(bitmapStart >= marker.length, true)
assert.equal(packed.bytes[bitmapStart], 0b01010101)
assert.equal(packed.bytes[bitmapStart + 1], 0)

const inverted = packTsplBitmap({
  grayscale,
  widthPx: 8,
  heightPx: 2,
  widthMm: 1,
  heightMm: 2,
  gapMm: 3,
  copies: 1,
  colorMode: 'inverted',
  rotationApplied: 'none',
})
const invertedStart = findByteSequence(inverted.bytes, marker) + marker.length
assert.equal(inverted.bytes[invertedStart], 0b10101010)
assert.equal(inverted.bytes[invertedStart + 1], 0b11111111)

console.log('print layout checks passed')
