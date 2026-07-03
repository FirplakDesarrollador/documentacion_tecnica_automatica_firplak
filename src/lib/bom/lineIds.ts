const NUMERIC_LINE_ID = /^ln_(\d{6})$/
const ALPHA_LINE_ID = /^ln_([a-z])(\d{5})$/

function parseLineId(lineId: string): number | null {
  const numeric = lineId.match(NUMERIC_LINE_ID)
  if (numeric) return Number(numeric[1])

  const alpha = lineId.match(ALPHA_LINE_ID)
  if (!alpha) return null

  const prefixOffset = alpha[1].charCodeAt(0) - 'a'.charCodeAt(0) + 1
  return 999_999 + ((prefixOffset - 1) * 99_999) + Number(alpha[2])
}

function formatLineId(sequence: number): string {
  if (sequence <= 999_999) {
    return `ln_${String(sequence).padStart(6, '0')}`
  }

  const shifted = sequence - 999_999
  const prefixIndex = Math.floor((shifted - 1) / 99_999)
  if (prefixIndex > 25) {
    throw new Error('BOM line id sequence exceeded supported range')
  }

  const prefix = String.fromCharCode('a'.charCodeAt(0) + prefixIndex)
  const number = ((shifted - 1) % 99_999) + 1
  return `ln_${prefix}${String(number).padStart(5, '0')}`
}

export function nextBomLineId(existingLineIds: string[]): string {
  const maxSequence = existingLineIds
    .map(parseLineId)
    .filter((value): value is number => value !== null)
    .reduce((max, value) => Math.max(max, value), 0)

  return formatLineId(maxSequence + 1)
}

export function assignSequentialBomLineIds<T extends { line_id?: string | null }>(lines: T[]): Array<T & { line_id: string }> {
  const assigned: Array<T & { line_id: string }> = []
  const usedIds: string[] = []

  for (const line of lines) {
    const lineId = line.line_id?.trim() || nextBomLineId(usedIds)
    usedIds.push(lineId)
    assigned.push({ ...line, line_id: lineId })
  }

  return assigned
}
