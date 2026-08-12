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
  salesItem: boolean | null
  defaultWarehouse: string
  detailError: string | null
}

export type SapAuditTreeLine = {
  childNum: number
  itemCode: string
  itemName: string
  warehouse: string
  issueMethod: string
}

export type ColorAuditTree = {
  treeCode: string
  treeType: string | null
  productDescription: string | null
  /** Almacén del encabezado de la LdM; es distinto del almacén de cada línea. */
  headerWarehouse?: string
  lines?: SapAuditTreeLine[]
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

export type SapConfigurationAuditKind = 'output_warehouse' | 'bom_warehouse' | 'issue_method'

export type SapAuditEvidence = {
  auditKind: SapConfigurationAuditKind
  treeCategory: Extract<ColorAuditTreeCategory, 'productive' | 'kit'>
  treeCode: string
  productName: string
  productStatus: ColorAuditStatus
  itemCode: string
  itemName: string
  childNum: number | null
  currentValue: string
  expectedValue: string | null
}

export type SapAuditValueOption = {
  value: string
  count: number
}

export type SapAuditGroup = {
  id: string
  auditKind: SapConfigurationAuditKind
  treeCategory: Extract<ColorAuditTreeCategory, 'productive' | 'kit'>
  subjectCode: string
  subjectName: string
  currentValue: string
  expectedValue: string | null
  totalObservations: number
  expectedCount: number
  support: number
  valueOptions: SapAuditValueOption[]
  status: 'discrepancy' | 'no_consensus'
  canNormalize: boolean
  rule: 'common_value' | 'tree_line_uniformity'
  /** Todas las observaciones del mismo sujeto, para que una excepción a la mayoría pueda recalcular el impacto completo. */
  allEvidence: SapAuditEvidence[]
  evidence: SapAuditEvidence[]
}

export type SapAuditExcludedItem = {
  auditKind: SapConfigurationAuditKind
  itemCode: string
  itemName: string
  itemTreeType: string | null
  productStatus: ColorAuditStatus
  treeCategory: Extract<ColorAuditTreeCategory, 'other_tree' | 'no_bom'> | 'unresolved_tree'
}

export type SapAuditReport = {
  auditKind: SapConfigurationAuditKind
  reviewed: number
  discrepancyCount: number
  noConsensusCount: number
  eligibleCount: number
  groups: SapAuditGroup[]
  excludedItems: SapAuditExcludedItem[]
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

function normalizeWarehouse(value: unknown): string {
  return readString(value).toUpperCase()
}

function normalizeIssueMethod(value: unknown): string {
  const normalized = normalizeCode(value)
  if (normalized === 'M' || normalized === 'IM_MANUAL') return 'im_Manual'
  if (normalized === 'B' || normalized === 'IM_BACKFLUSH') return 'im_Backflush'
  return normalized
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
  return treeCategoryFromTreeType(tree?.treeType ?? null)
}

function treeCategoryFromTreeType(treeType: string | null): ColorAuditTreeCategory {
  const normalized = normalizeCode(treeType)
  if (!normalized) return 'no_bom'
  if (normalized === 'IPRODUCTIONTREE' || normalized === 'P') return 'productive'
  if (normalized === 'ISALESTREE' || normalized === 'S') return 'kit'
  return 'other_tree'
}

export function declaresProductOrSalesTree(treeType: string | null): boolean {
  const category = treeCategoryFromTreeType(treeType)
  return category === 'productive' || category === 'kit'
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
    salesItem: readBoolean(payload.SalesItem),
    defaultWarehouse: normalizeWarehouse(payload.DefaultWarehouse),
    detailError,
  }
}

export function normalizeColorAuditTree(value: unknown): ColorAuditTree | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const payload = value as SapEntityPayload
  const treeCode = normalizeCode(payload.TreeCode)
  if (!treeCode) return null

  const rawLines = Array.isArray(payload.ProductTreeLines) ? payload.ProductTreeLines : []
  const lines = rawLines.flatMap((rawLine): SapAuditTreeLine[] => {
    if (typeof rawLine !== 'object' || rawLine === null || Array.isArray(rawLine)) return []
    const line = rawLine as SapEntityPayload
    const itemCode = normalizeCode(line.ItemCode)
    const childNum = typeof line.ChildNum === 'number' && Number.isInteger(line.ChildNum) && line.ChildNum >= 0
      ? line.ChildNum
      : null
    if (!itemCode || childNum === null) return []
    return [{
      childNum,
      itemCode,
      itemName: readString(line.ItemName),
      warehouse: normalizeWarehouse(line.Warehouse),
      issueMethod: normalizeIssueMethod(line.IssueMethod),
    }]
  })

  return {
    treeCode,
    treeType: readString(payload.TreeType) || null,
    productDescription: readString(payload.ProductDescription) || null,
    headerWarehouse: normalizeWarehouse(payload.Warehouse),
    lines,
  }
}

function mergeColorAuditTree(existing: ColorAuditTree, incoming: ColorAuditTree): ColorAuditTree {
  const incomingLines = incoming.lines ?? []
  const linesByKey = new Map((existing.lines ?? []).map(line => [`${line.childNum}:${line.itemCode}`, line]))
  for (const line of incomingLines) linesByKey.set(`${line.childNum}:${line.itemCode}`, line)
  return {
    ...existing,
    ...incoming,
    treeType: incoming.treeType ?? existing.treeType,
    productDescription: incoming.productDescription ?? existing.productDescription,
    headerWarehouse: incoming.headerWarehouse === undefined ? existing.headerWarehouse : incoming.headerWarehouse,
    lines: incomingLines.length > 0 ? [...linesByKey.values()] : existing.lines ?? incomingLines,
  }
}

/** Combines QueryService pages without dropping direct lines from a repeated LdM header. */
export function mergeColorAuditTrees(current: ColorAuditTree[], incoming: ColorAuditTree[]): ColorAuditTree[] {
  const treesByCode = new Map(current.map(tree => [tree.treeCode, tree]))
  for (const tree of incoming) {
    const existing = treesByCode.get(tree.treeCode)
    treesByCode.set(tree.treeCode, existing ? mergeColorAuditTree(existing, tree) : tree)
  }
  return [...treesByCode.values()]
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

function configurationTreeCategory(tree: ColorAuditTree | null): Extract<ColorAuditTreeCategory, 'productive' | 'kit'> | null {
  const category = treeCategoryFromTree(tree)
  return category === 'productive' || category === 'kit' ? category : null
}

function issueMethodIsNormalizable(value: string): boolean {
  return value === 'im_Manual' || value === 'im_Backflush'
}

function labelForIssueMethod(value: string): string {
  if (value === 'im_Manual') return 'Manual'
  if (value === 'im_Backflush') return 'Notificación (Backflush)'
  return value || 'VACÍO'
}

function groupObservations(
  auditKind: SapConfigurationAuditKind,
  observations: SapAuditEvidence[],
): SapAuditGroup[] {
  const bySubject = new Map<string, SapAuditEvidence[]>()
  for (const observation of observations) {
    const subject = auditKind === 'output_warehouse'
      ? `${observation.treeCategory}:SALIDA`
      : `${observation.treeCategory}:${observation.itemCode}`
    bySubject.set(subject, [...(bySubject.get(subject) ?? []), observation])
  }

  const groups: SapAuditGroup[] = []
  for (const [subject, subjectObservations] of bySubject) {
    const counts = new Map<string, number>()
    for (const observation of subjectObservations) {
      counts.set(observation.currentValue, (counts.get(observation.currentValue) ?? 0) + 1)
    }
    const ranked = [...counts.entries()].toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    const valueOptions = ranked.map(([value, count]) => ({ value, count }))
    const winner = ranked[0]
    const expectedValue = winner && winner[1] > subjectObservations.length / 2 ? winner[0] : null
    const [treeCategory, subjectCode] = subject.split(':') as [Extract<ColorAuditTreeCategory, 'productive' | 'kit'>, string]
    const subjectName = auditKind === 'output_warehouse'
      ? 'Bodega de salida'
      : subjectObservations[0]?.itemName || subjectCode
    const targetIsValid = Boolean(expectedValue)
      && (auditKind !== 'issue_method' || issueMethodIsNormalizable(expectedValue ?? ''))

    if (!expectedValue) {
      groups.push({
        id: `${auditKind}:${subject}:no_consensus`,
        auditKind,
        treeCategory,
        subjectCode,
        subjectName,
        currentValue: 'MÚLTIPLES',
        expectedValue: null,
        totalObservations: subjectObservations.length,
        expectedCount: winner?.[1] ?? 0,
        support: winner ? winner[1] / subjectObservations.length : 0,
        valueOptions,
        status: 'no_consensus',
        canNormalize: false,
        rule: 'common_value',
        allEvidence: subjectObservations.map(observation => ({ ...observation, expectedValue: null })),
        evidence: subjectObservations.map(observation => ({ ...observation, expectedValue: null })),
      })
      continue
    }

    for (const [currentValue] of ranked) {
      if (currentValue === expectedValue) continue
      const evidence = subjectObservations
        .filter(observation => observation.currentValue === currentValue)
        .map(observation => ({ ...observation, expectedValue }))
      groups.push({
        id: `${auditKind}:${subject}:${currentValue || 'EMPTY'}:${expectedValue}`,
        auditKind,
        treeCategory,
        subjectCode,
        subjectName,
        currentValue,
        expectedValue,
        totalObservations: subjectObservations.length,
        expectedCount: winner?.[1] ?? 0,
        support: winner ? winner[1] / subjectObservations.length : 0,
        valueOptions,
        status: 'discrepancy',
        canNormalize: targetIsValid,
        rule: 'common_value',
        allEvidence: subjectObservations.map(observation => ({ ...observation, expectedValue })),
        evidence,
      })
    }
  }

  return groups.toSorted((left, right) => right.evidence.length - left.evidence.length || left.subjectCode.localeCompare(right.subjectCode))
}

function directLineEvidence(
  treeCategory: Extract<ColorAuditTreeCategory, 'productive' | 'kit'>,
  tree: ColorAuditTree,
  item: ColorAuditItem,
): SapAuditEvidence[] {
  return (tree.lines ?? []).map(line => ({
    auditKind: 'bom_warehouse',
    treeCategory,
    treeCode: tree.treeCode,
    productName: tree.productDescription || item.itemName,
    productStatus: item.status,
    itemCode: line.itemCode,
    itemName: line.itemName,
    childNum: line.childNum,
    currentValue: line.warehouse,
    expectedValue: null,
  }))
}

function buildTreeLineUniformityGroups(items: ColorAuditItem[], trees: ColorAuditTree[]): SapAuditGroup[] {
  const itemsByCode = new Map(items.filter(item => item.salesItem === true).map(item => [item.itemCode, item]))
  const groups: SapAuditGroup[] = []

  for (const tree of trees) {
    const item = itemsByCode.get(tree.treeCode)
    const treeCategory = configurationTreeCategory(tree)
    if (!item || !treeCategory) continue
    const evidence = directLineEvidence(treeCategory, tree, item)
    if (evidence.length < 2) continue

    const counts = new Map<string, number>()
    for (const line of evidence) counts.set(line.currentValue, (counts.get(line.currentValue) ?? 0) + 1)
    if (counts.size < 2) continue

    const ranked = [...counts.entries()].toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    const valueOptions = ranked.map(([value, count]) => ({ value, count }))
    const winner = ranked[0]
    const expectedValue = winner && winner[1] > evidence.length / 2 ? winner[0] : null
    if (!expectedValue) {
      groups.push({
        id: `bom_warehouse:tree:${tree.treeCode}:no_consensus`,
        auditKind: 'bom_warehouse',
        treeCategory,
        subjectCode: tree.treeCode,
        subjectName: 'Almacén uniforme dentro de la misma LdM',
        currentValue: 'MÚLTIPLES',
        expectedValue: null,
        totalObservations: evidence.length,
        expectedCount: winner?.[1] ?? 0,
        support: winner ? winner[1] / evidence.length : 0,
        valueOptions,
        status: 'no_consensus',
        canNormalize: false,
        rule: 'tree_line_uniformity',
        allEvidence: evidence.map(line => ({ ...line, expectedValue: null })),
        evidence: evidence.map(line => ({ ...line, expectedValue: null })),
      })
      continue
    }

    for (const [currentValue] of ranked) {
      if (currentValue === expectedValue) continue
      const outliers = evidence
        .filter(line => line.currentValue === currentValue)
        .map(line => ({ ...line, expectedValue }))
      groups.push({
        id: `bom_warehouse:tree:${tree.treeCode}:${currentValue || 'EMPTY'}:${expectedValue}`,
        auditKind: 'bom_warehouse',
        treeCategory,
        subjectCode: tree.treeCode,
        subjectName: 'Almacén uniforme dentro de la misma LdM',
        currentValue,
        expectedValue,
        totalObservations: evidence.length,
        expectedCount: winner[1],
        support: winner[1] / evidence.length,
        valueOptions,
        status: 'discrepancy',
        canNormalize: true,
        rule: 'tree_line_uniformity',
        allEvidence: evidence.map(line => ({ ...line, expectedValue })),
        evidence: outliers,
      })
    }
  }

  return groups
}

export function buildSapAuditReport(
  auditKind: SapConfigurationAuditKind,
  items: ColorAuditItem[],
  trees: ColorAuditTree[],
  options: { pendingTreeItemCodes?: ReadonlySet<string> } = {},
): SapAuditReport {
  const treesByCode = new Map(trees.map(tree => [tree.treeCode, tree]))
  const observations: SapAuditEvidence[] = []
  const excludedItems: SapAuditExcludedItem[] = []

  for (const item of items) {
    if (item.salesItem !== true) continue
    const tree = treesByCode.get(item.itemCode) ?? null
    const treeCategory = configurationTreeCategory(tree)
    if (!treeCategory) {
      if (options.pendingTreeItemCodes?.has(item.itemCode)) continue
      const excludedCategory = treeCategoryFromTree(tree)
      const itemDeclaresTree = declaresProductOrSalesTree(item.itemTreeType)
      if (excludedCategory === 'other_tree' || excludedCategory === 'no_bom') {
        excludedItems.push({
          auditKind,
          itemCode: item.itemCode,
          itemName: item.itemName,
          itemTreeType: tree?.treeType ?? item.itemTreeType,
          productStatus: item.status,
          treeCategory: itemDeclaresTree && !tree ? 'unresolved_tree' : excludedCategory,
        })
      }
      continue
    }

    if (auditKind === 'output_warehouse') {
      observations.push({
        auditKind,
        treeCategory,
        treeCode: item.itemCode,
        productName: tree?.productDescription || item.itemName,
        productStatus: item.status,
        itemCode: item.itemCode,
        itemName: item.itemName,
        childNum: null,
        currentValue: normalizeWarehouse(tree?.headerWarehouse),
        expectedValue: null,
      })
      continue
    }

    for (const line of tree?.lines ?? []) {
      observations.push({
        auditKind,
        treeCategory,
        treeCode: item.itemCode,
        productName: tree?.productDescription || item.itemName,
        productStatus: item.status,
        itemCode: line.itemCode,
        itemName: line.itemName,
        childNum: line.childNum,
        currentValue: auditKind === 'bom_warehouse' ? line.warehouse : line.issueMethod,
        expectedValue: null,
      })
    }
  }

  const groups = [
    ...groupObservations(auditKind, observations),
    ...(auditKind === 'bom_warehouse' ? buildTreeLineUniformityGroups(items, trees) : []),
  ].toSorted((left, right) => right.evidence.length - left.evidence.length || left.subjectCode.localeCompare(right.subjectCode))
  return {
    auditKind,
    reviewed: observations.length,
    discrepancyCount: groups.filter(group => group.status === 'discrepancy').reduce((total, group) => total + group.evidence.length, 0),
    noConsensusCount: groups.filter(group => group.status === 'no_consensus').reduce((total, group) => total + group.evidence.length, 0),
    eligibleCount: groups.filter(group => group.canNormalize).reduce((total, group) => total + group.evidence.length, 0),
    groups,
    excludedItems,
  }
}

export function sapAuditValueLabel(auditKind: SapConfigurationAuditKind, value: string | null): string {
  if (!value) return 'VACÍO'
  return auditKind === 'issue_method' ? labelForIssueMethod(value) : value
}
