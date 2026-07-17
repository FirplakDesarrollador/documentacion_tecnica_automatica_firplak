import type { SapEntityPayload } from './serviceLayer'

export type ColorAuditDifferenceCategory =
  | 'match'
  | 'u_color_empty'
  | 'u_color_invalid'
  | 'u_color_different'
  | 'sku_color_invalid'

export type ColorAuditTreeCategory = 'productive' | 'kit' | 'other_tree' | 'no_bom'

export type ColorAuditStatus = 'active' | 'inactive' | 'frozen' | 'inactive_frozen' | 'unknown'

export type ColorAuditItem = {
  itemCode: string
  itemName: string
  familyCode: string
  referenceCode: string
  versionCode: string
  expectedColor: string | null
  declaredColor: string
  valid: boolean | null
  frozen: boolean | null
  status: ColorAuditStatus
  itemTreeType: string | null
  detailError: string | null
}

export type ColorAuditTree = {
  treeCode: string
  treeType: string | null
  productDescription: string | null
}

export type ColorAuditRow = ColorAuditItem & {
  treeType: string | null
  treeDescription: string | null
  treeCategory: ColorAuditTreeCategory
  differenceCategory: ColorAuditDifferenceCategory
  correctionTarget: string | null
}

export type ColorAuditSummary = {
  itemsRead: number
  skuCandidates: number
  treesRead: number
  rowsAudited: number
  compatible: number
  uColorEmpty: number
  uColorInvalid: number
  uColorDifferent: number
  skuColorInvalid: number
  inactiveOrFrozen: number
  kits: number
  productive: number
  otherTrees: number
  withoutBom: number
  errors: number
}

export type ColorAuditCorrectionGroup = {
  treeCategory: ColorAuditTreeCategory
  actual: string
  expected: string
  count: number
  examples: string[]
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCode(value: unknown): string {
  return readString(value).toUpperCase()
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  const normalized = normalizeCode(value)
  if (['TYES', 'YES', 'Y', 'TRUE', '1'].includes(normalized)) return true
  if (['TNO', 'NO', 'N', 'FALSE', '0'].includes(normalized)) return false
  return null
}

function normalizeColor(value: unknown): string {
  return readString(value).replace(/\s+/gu, '').toUpperCase()
}

function isValidColor(value: string): boolean {
  return /^[A-Z0-9]{4}$/u.test(value)
}

function statusFromFields(valid: boolean | null, frozen: boolean | null): ColorAuditStatus {
  if (valid === false && frozen === true) return 'inactive_frozen'
  if (frozen === true) return 'frozen'
  if (valid === false) return 'inactive'
  if (valid === true) return 'active'
  return 'unknown'
}

function treeCategoryFromTree(tree: ColorAuditTree | null): ColorAuditTreeCategory {
  if (!tree) return 'no_bom'
  if (tree.treeType === 'iProductionTree') return 'productive'
  if (tree.treeType === 'iSalesTree') return 'kit'
  return 'other_tree'
}

export function parseColorAuditItemCode(value: unknown): {
  itemCode: string
  familyCode: string
  referenceCode: string
  versionCode: string
  expectedColor: string | null
} | null {
  const itemCode = normalizeCode(value)
  const parts = itemCode.split('-')
  if (!itemCode.startsWith('V') || parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null

  const rawColor = parts[3] ?? ''
  return {
    itemCode,
    familyCode: parts[0],
    referenceCode: parts[1],
    versionCode: parts[2],
    expectedColor: isValidColor(rawColor) ? rawColor : null,
  }
}

export function isColorAuditCandidate(value: unknown): boolean {
  return parseColorAuditItemCode(value) !== null
}

export function normalizeColorAuditItem(value: unknown, detailError: string | null = null): ColorAuditItem | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const payload = value as SapEntityPayload
  const parsed = parseColorAuditItemCode(payload.ItemCode)
  if (!parsed) return null

  const valid = readBoolean(payload.Valid)
  const frozen = readBoolean(payload.Frozen)
  return {
    ...parsed,
    itemName: readString(payload.ItemName),
    declaredColor: normalizeColor(payload.U_Color),
    valid,
    frozen,
    status: statusFromFields(valid, frozen),
    itemTreeType: readString(payload.TreeType) || null,
    detailError,
  }
}

export function classifyColorAuditItem(item: ColorAuditItem, tree: ColorAuditTree | null): ColorAuditRow {
  const treeCategory = treeCategoryFromTree(tree)
  let differenceCategory: ColorAuditDifferenceCategory

  if (!item.expectedColor) differenceCategory = 'sku_color_invalid'
  else if (!item.declaredColor) differenceCategory = 'u_color_empty'
  else if (!isValidColor(item.declaredColor)) differenceCategory = 'u_color_invalid'
  else if (item.declaredColor !== item.expectedColor) differenceCategory = 'u_color_different'
  else differenceCategory = 'match'

  return {
    ...item,
    treeType: tree?.treeType ?? null,
    treeDescription: tree?.productDescription ?? null,
    treeCategory,
    differenceCategory,
    correctionTarget: item.expectedColor && differenceCategory !== 'match' ? item.expectedColor : null,
  }
}

export function emptyColorAuditSummary(): ColorAuditSummary {
  return {
    itemsRead: 0,
    skuCandidates: 0,
    treesRead: 0,
    rowsAudited: 0,
    compatible: 0,
    uColorEmpty: 0,
    uColorInvalid: 0,
    uColorDifferent: 0,
    skuColorInvalid: 0,
    inactiveOrFrozen: 0,
    kits: 0,
    productive: 0,
    otherTrees: 0,
    withoutBom: 0,
    errors: 0,
  }
}

export function summarizeColorAuditRows(rows: ColorAuditRow[]): ColorAuditSummary {
  const summary = emptyColorAuditSummary()
  summary.rowsAudited = rows.length
  summary.skuCandidates = rows.length
  for (const row of rows) {
    if (row.differenceCategory === 'match') summary.compatible += 1
    if (row.differenceCategory === 'u_color_empty') summary.uColorEmpty += 1
    if (row.differenceCategory === 'u_color_invalid') summary.uColorInvalid += 1
    if (row.differenceCategory === 'u_color_different') summary.uColorDifferent += 1
    if (row.differenceCategory === 'sku_color_invalid') summary.skuColorInvalid += 1
    if (['inactive', 'frozen', 'inactive_frozen'].includes(row.status)) summary.inactiveOrFrozen += 1
    if (row.treeCategory === 'kit') summary.kits += 1
    if (row.treeCategory === 'productive') summary.productive += 1
    if (row.treeCategory === 'other_tree') summary.otherTrees += 1
    if (row.treeCategory === 'no_bom') summary.withoutBom += 1
    if (row.detailError) summary.errors += 1
  }
  return summary
}

export function mergeColorAuditSummary(left: ColorAuditSummary, right: ColorAuditSummary): ColorAuditSummary {
  return Object.fromEntries(
    Object.keys(left).map(key => [key, (left[key as keyof ColorAuditSummary] + right[key as keyof ColorAuditSummary])]),
  ) as ColorAuditSummary
}

export function groupColorAuditCorrections(rows: ColorAuditRow[]): ColorAuditCorrectionGroup[] {
  const groups = new Map<string, ColorAuditCorrectionGroup>()
  for (const row of rows) {
    if (!row.correctionTarget || row.differenceCategory === 'match') continue
    const actual = row.declaredColor || 'VACIO'
    const key = `${row.treeCategory}:${actual}:${row.correctionTarget}`
    const current = groups.get(key) ?? {
      treeCategory: row.treeCategory,
      actual,
      expected: row.correctionTarget,
      count: 0,
      examples: [],
    }
    current.count += 1
    if (current.examples.length < 5) current.examples.push(row.itemCode)
    groups.set(key, current)
  }
  return [...groups.values()].sort((left, right) => right.count - left.count || left.expected.localeCompare(right.expected))
}

export function treePrefixForItemCode(itemCode: string): string {
  const parts = itemCode.split('-')
  return parts.slice(0, 3).join('-') + '-'
}
