const DECIMAL_INPUT_PATTERN = /^\d*(?:[.,]\d*)?$/

export function isDecimalInput(value: string): boolean {
  return DECIMAL_INPUT_PATTERN.test(value.trim())
}

export function parseDecimalInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized || !isDecimalInput(value)) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}
