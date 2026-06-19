import type { PrintColorMode } from '@/lib/printSettings'
import type { ThermalRotation } from '@/lib/printLayout'

export const TSPL_DOTS_PER_MM = 8
export const TSPL_MAX_WIDTH_DOTS = 832
export const TSPL_THRESHOLD = 128

export type TsplMetadata = {
  finalWidthMm: number
  finalHeightMm: number
  dotsWidth: number
  dotsHeight: number
  gapMm: number
  rotated: ThermalRotation | 'legacy'
}

export type TsplBitmapInput = {
  grayscale: Uint8Array | Uint8ClampedArray
  widthPx: number
  heightPx: number
  widthMm: number
  heightMm: number
  gapMm: number
  copies: number
  colorMode: PrintColorMode
  rotationApplied: ThermalRotation | 'legacy'
}

export type TsplBitmapResult = {
  bytes: Uint8Array
  metadata: TsplMetadata
  bytesPerRow: number
  blackPercent: number
}

function normalizeCopies(value: number) {
  return Math.max(1, Math.trunc(value) || 1)
}

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

function asciiBytes(value: string) {
  return new TextEncoder().encode(value)
}

export function packTsplBitmap(input: TsplBitmapInput): TsplBitmapResult {
  const widthPx = Math.trunc(input.widthPx)
  const heightPx = Math.trunc(input.heightPx)

  if (widthPx <= 0 || heightPx <= 0) {
    throw new Error('La imagen de impresion tiene dimensiones invalidas.')
  }
  if (widthPx > TSPL_MAX_WIDTH_DOTS) {
    throw new Error(`El ancho final ${widthPx} dots supera el maximo ${TSPL_MAX_WIDTH_DOTS} dots.`)
  }
  if (input.grayscale.length < widthPx * heightPx) {
    throw new Error('La imagen de impresion no contiene suficientes pixeles.')
  }

  const bytesPerRow = Math.ceil(widthPx / 8)
  const packed = new Uint8Array(bytesPerRow * heightPx)
  const isInverted = input.colorMode === 'inverted'
  let blackPixels = 0

  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < widthPx; x += 8) {
      let byteValue = 0

      for (let bit = 0; bit < 8; bit += 1) {
        const pixelX = x + bit
        if (pixelX >= widthPx) continue

        const gray = input.grayscale[y * widthPx + pixelX]
        if (gray < TSPL_THRESHOLD) blackPixels += 1

        const shouldSetBit = isInverted ? gray < TSPL_THRESHOLD : gray >= TSPL_THRESHOLD
        if (shouldSetBit) {
          byteValue |= 1 << (7 - bit)
        }
      }

      packed[y * bytesPerRow + Math.floor(x / 8)] = byteValue
    }
  }

  const safeCopies = normalizeCopies(input.copies)
  const blackPercent = widthPx && heightPx ? (blackPixels / (widthPx * heightPx)) * 100 : 0
  if (blackPercent < 0.05) {
    throw new Error('La imagen generada esta practicamente en blanco. Revisa el render antes de imprimir.')
  }

  const header = asciiBytes(
    `<xpml><page quantity='0' pitch='${input.heightMm.toFixed(1)} mm'></xpml>` +
    `SIZE ${input.widthMm.toFixed(1)} mm, ${input.heightMm.toFixed(1)} mm\r\n` +
    `GAP ${input.gapMm.toFixed(1)} mm, 0 mm\r\n` +
    `DIRECTION 0,0\r\n` +
    `REFERENCE 0,0\r\n` +
    `OFFSET 0 mm\r\n` +
    `SET PEEL OFF\r\n` +
    `SET CUTTER OFF\r\n` +
    `<xpml></page></xpml><xpml><page quantity='${safeCopies}' pitch='${input.heightMm.toFixed(1)} mm'></xpml>` +
    `SET TEAR ON\r\n` +
    `CLS\r\n` +
    `BITMAP 0,0,${bytesPerRow},${heightPx},1,`
  )
  const footer = asciiBytes(`\r\nPRINT 1,${safeCopies}\r\n<xpml></page></xpml>`)

  return {
    bytes: concatBytes([header, packed, footer]),
    metadata: {
      finalWidthMm: Number(input.widthMm.toFixed(1)),
      finalHeightMm: Number(input.heightMm.toFixed(1)),
      dotsWidth: widthPx,
      dotsHeight: heightPx,
      gapMm: Number(input.gapMm.toFixed(1)),
      rotated: input.rotationApplied,
    },
    bytesPerRow,
    blackPercent,
  }
}
