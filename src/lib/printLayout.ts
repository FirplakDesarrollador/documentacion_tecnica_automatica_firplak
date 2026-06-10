export const PRINT_TARGET_STANDARD = 'standard_browser'
export const PRINT_TARGET_3NSTAR = 'agent_3nstar'
export const DEFAULT_MEDIA_GAP_MM = 3
export const THREE_NSTAR_MAX_WIDTH_MM = 104

export type PrintTarget = typeof PRINT_TARGET_STANDARD | typeof PRINT_TARGET_3NSTAR
export type ThermalRotation = 'none' | 'rotate_90'

export type ThermalPrintLayout =
  | {
      ok: true
      rotation: ThermalRotation
      mediaWidthMm: number
      mediaLengthMm: number
      mediaGapMm: number
      message: string
    }
  | {
      ok: false
      message: string
    }

const MATCH_TOLERANCE_MM = 0.5

export function normalizePrintTarget(value: unknown): PrintTarget {
  return value === PRINT_TARGET_3NSTAR ? PRINT_TARGET_3NSTAR : PRINT_TARGET_STANDARD
}

export function parsePositiveMillimeters(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function closeEnough(a: number, b: number) {
  return Math.abs(a - b) <= MATCH_TOLERANCE_MM
}

export function suggestThreeNStarMedia(widthMm: number, heightMm: number) {
  if (widthMm <= THREE_NSTAR_MAX_WIDTH_MM) {
    return { widthMm, lengthMm: heightMm }
  }
  if (heightMm <= THREE_NSTAR_MAX_WIDTH_MM) {
    return { widthMm: heightMm, lengthMm: widthMm }
  }
  return null
}

export function resolveThermalPrintLayout(input: {
  designWidthMm: unknown
  designHeightMm: unknown
  mediaWidthMm: unknown
  mediaLengthMm: unknown
  mediaGapMm?: unknown
}): ThermalPrintLayout {
  const designWidthMm = parsePositiveMillimeters(input.designWidthMm)
  const designHeightMm = parsePositiveMillimeters(input.designHeightMm)
  const mediaWidthMm = parsePositiveMillimeters(input.mediaWidthMm)
  const mediaLengthMm = parsePositiveMillimeters(input.mediaLengthMm)
  const mediaGapMm = parsePositiveMillimeters(input.mediaGapMm) ?? DEFAULT_MEDIA_GAP_MM

  if (!designWidthMm || !designHeightMm) {
    return { ok: false, message: 'La plantilla no tiene dimensiones de diseno validas.' }
  }
  if (!mediaWidthMm || !mediaLengthMm) {
    return { ok: false, message: 'Define ancho fisico y largo fisico de la etiqueta.' }
  }
  if (mediaWidthMm > THREE_NSTAR_MAX_WIDTH_MM) {
    return { ok: false, message: `El ancho fisico supera ${THREE_NSTAR_MAX_WIDTH_MM} mm para la 3nStar.` }
  }

  const direct =
    closeEnough(designWidthMm, mediaWidthMm) &&
    closeEnough(designHeightMm, mediaLengthMm)
  if (direct) {
    return {
      ok: true,
      rotation: 'none',
      mediaWidthMm,
      mediaLengthMm,
      mediaGapMm,
      message: 'Sin rotacion',
    }
  }

  const rotated =
    closeEnough(designWidthMm, mediaLengthMm) &&
    closeEnough(designHeightMm, mediaWidthMm)
  if (rotated) {
    return {
      ok: true,
      rotation: 'rotate_90',
      mediaWidthMm,
      mediaLengthMm,
      mediaGapMm,
      message: 'Rotara 90 grados',
    }
  }

  return {
    ok: false,
    message: `El diseno ${designWidthMm}x${designHeightMm} mm no encaja con la etiqueta fisica ${mediaWidthMm}x${mediaLengthMm} mm.`,
  }
}
