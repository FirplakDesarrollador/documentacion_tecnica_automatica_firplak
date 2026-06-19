import type { PrintColorMode } from '@/lib/printSettings'
import type { ThermalRotation } from '@/lib/printLayout'
import { packTsplBitmap, TSPL_DOTS_PER_MM } from '@/lib/print/tspl'

type BrowserImageSource = {
  source: CanvasImageSource
  close?: () => void
}

export type BrowserTsplOptions = {
  copies: number
  colorMode: PrintColorMode
  mediaWidthMm: number
  mediaLengthMm: number
  mediaGapMm: number
  rotation: ThermalRotation
}

async function loadImageSource(blob: Blob): Promise<BrowserImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      return { source: bitmap, close: () => bitmap.close() }
    } catch {
      // Some corporate browsers disable createImageBitmap for blobs.
    }
  }

  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = 'async'

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('No se pudo cargar la imagen generada para WebUSB.'))
      image.src = url
    })

    return { source: image, close: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

export async function convertImageBlobToTspl(blob: Blob, options: BrowserTsplOptions) {
  const image = await loadImageSource(blob)
  const widthPx = Math.round(options.mediaWidthMm * TSPL_DOTS_PER_MM)
  const heightPx = Math.round(options.mediaLengthMm * TSPL_DOTS_PER_MM)
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    image.close?.()
    throw new Error('El navegador no pudo preparar la imagen para WebUSB.')
  }

  context.fillStyle = '#fff'
  context.fillRect(0, 0, widthPx, heightPx)

  if (options.rotation === 'rotate_90') {
    context.save()
    context.translate(widthPx, 0)
    context.rotate(Math.PI / 2)
    context.drawImage(image.source, 0, 0, heightPx, widthPx)
    context.restore()
  } else {
    context.drawImage(image.source, 0, 0, widthPx, heightPx)
  }

  image.close?.()

  const pixels = context.getImageData(0, 0, widthPx, heightPx).data
  const grayscale = new Uint8Array(widthPx * heightPx)

  for (let pixelIndex = 0, grayIndex = 0; pixelIndex < pixels.length; pixelIndex += 4, grayIndex += 1) {
    const red = pixels[pixelIndex]
    const green = pixels[pixelIndex + 1]
    const blue = pixels[pixelIndex + 2]
    grayscale[grayIndex] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114)
  }

  return packTsplBitmap({
    grayscale,
    widthPx,
    heightPx,
    widthMm: options.mediaWidthMm,
    heightMm: options.mediaLengthMm,
    gapMm: options.mediaGapMm,
    copies: options.copies,
    colorMode: options.colorMode,
    rotationApplied: options.rotation,
  })
}
