import { parseColorAuditItemCode } from './colorAudit'

export type ColorAuditUpdateItem = {
  itemCode: string
  expectedColor: string
  currentColor: string
  differenceCategory: 'u_color_different'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeColorAuditUpdateColor(value: unknown): string {
  return readString(value).replace(/\s+/gu, '').toUpperCase()
}

function isValidColor(value: string): boolean {
  return /^[A-Z0-9]{4}$/u.test(value)
}

export function buildColorAuditUpdateConfirmation(total: number): string {
  return `CAMBIAR U_COLOR EN SAP PARA ${total} SKU`
}

export function normalizeColorAuditUpdateItems(value: unknown): {
  items: ColorAuditUpdateItem[]
  invalidItemCodes: string[]
} {
  const rawItems = Array.isArray(value) ? value : []
  const items: ColorAuditUpdateItem[] = []
  const invalidItemCodes: string[] = []
  const seen = new Set<string>()

  for (const rawItem of rawItems) {
    if (!isRecord(rawItem)) {
      invalidItemCodes.push('ITEM_INVALIDO')
      continue
    }

    const itemCode = readString(rawItem.itemCode).toUpperCase()
    const parsed = parseColorAuditItemCode(itemCode)
    const expectedColor = normalizeColorAuditUpdateColor(rawItem.expectedColor)
    const currentColor = normalizeColorAuditUpdateColor(rawItem.currentColor)
    const valid = Boolean(
      parsed
      && parsed.expectedColor
      && parsed.expectedColor === expectedColor
      && isValidColor(currentColor)
      && currentColor !== expectedColor
      && rawItem.differenceCategory === 'u_color_different',
    )

    if (!valid || seen.has(itemCode)) {
      invalidItemCodes.push(itemCode || 'ITEM_INVALIDO')
      continue
    }

    seen.add(itemCode)
    items.push({
      itemCode,
      expectedColor,
      currentColor,
      differenceCategory: 'u_color_different',
    })
  }

  return { items, invalidItemCodes }
}
