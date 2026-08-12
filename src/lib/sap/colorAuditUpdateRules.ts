import { parseColorAuditItemCode } from './colorAudit'

export type ColorAuditUpdateItem = {
  itemCode: string
  expectedColor: string
  currentColor: string
  differenceCategory: 'u_color_different'
}

export type SapAuditUpdateKind = 'color' | 'output_warehouse' | 'bom_warehouse' | 'issue_method'
export type SapAuditDecisionSource = 'majority' | 'minority' | 'no_consensus'

export type SapAuditUpdateItem = {
  auditKind: SapAuditUpdateKind
  itemCode: string
  treeCode: string | null
  childNum: number | null
  expectedValue: string
  currentValue: string
  decisionSource: SapAuditDecisionSource
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readChildNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function readDecisionSource(value: unknown): SapAuditDecisionSource {
  return value === 'minority' || value === 'no_consensus' ? value : 'majority'
}

function normalizeWarehouse(value: unknown): string {
  return readString(value).toUpperCase()
}

function normalizeIssueMethod(value: unknown): string {
  const normalized = readString(value).toUpperCase()
  if (normalized === 'M' || normalized === 'IM_MANUAL') return 'im_Manual'
  if (normalized === 'B' || normalized === 'IM_BACKFLUSH') return 'im_Backflush'
  return normalized
}

function isValidIssueMethod(value: string): boolean {
  return value === 'im_Manual' || value === 'im_Backflush'
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

export function normalizeSapAuditUpdateItems(auditKind: SapAuditUpdateKind, value: unknown): {
  items: SapAuditUpdateItem[]
  invalidItemKeys: string[]
} {
  const rawItems = Array.isArray(value) ? value : []
  const items: SapAuditUpdateItem[] = []
  const invalidItemKeys: string[] = []
  const seen = new Set<string>()

  for (const rawItem of rawItems) {
    if (!isRecord(rawItem)) {
      invalidItemKeys.push('ITEM_INVALIDO')
      continue
    }
    const itemCode = readString(rawItem.itemCode).toUpperCase()
    const treeCode = readString(rawItem.treeCode).toUpperCase() || null
    const childNum = readChildNum(rawItem.childNum)
    const decisionSource = readDecisionSource(rawItem.decisionSource)
    const currentValue = auditKind === 'issue_method'
      ? normalizeIssueMethod(rawItem.currentValue)
      : auditKind === 'color'
        ? normalizeColorAuditUpdateColor(rawItem.currentValue)
        : normalizeWarehouse(rawItem.currentValue)
    const expectedValue = auditKind === 'issue_method'
      ? normalizeIssueMethod(rawItem.expectedValue)
      : auditKind === 'color'
        ? normalizeColorAuditUpdateColor(rawItem.expectedValue)
        : normalizeWarehouse(rawItem.expectedValue)
    const requiresTree = auditKind === 'output_warehouse' || auditKind === 'bom_warehouse' || auditKind === 'issue_method'
    const requiresLine = auditKind === 'bom_warehouse' || auditKind === 'issue_method'
    const parsedColor = auditKind === 'color' ? parseColorAuditItemCode(itemCode) : null
    const valid = Boolean(
      itemCode
      && expectedValue
      && currentValue !== expectedValue
      && (!requiresTree || treeCode)
      && (!requiresLine || childNum !== null)
      && (auditKind !== 'issue_method' || isValidIssueMethod(expectedValue))
      && (auditKind !== 'color' || (parsedColor?.expectedColor === expectedValue && isValidColor(currentValue))),
    )
    const key = `${auditKind}:${treeCode ?? itemCode}:${childNum ?? '-'}:${itemCode}`
    if (!valid || seen.has(key)) {
      invalidItemKeys.push(key)
      continue
    }
    seen.add(key)
    items.push({ auditKind, itemCode, treeCode, childNum, expectedValue, currentValue, decisionSource })
  }

  return { items, invalidItemKeys }
}
