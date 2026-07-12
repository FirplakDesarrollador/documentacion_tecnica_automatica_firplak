import type { BomLine, SapEntityPayload } from './serviceLayer'

export type ColorAnalysisMaterialLine = {
  itemCode: string
  itemName: string
  colorCode: string | null
  quantity: number
  category: 'board' | 'edge' | 'other'
  childNum: number | null
  issueMethod: string | null
  warehouse: string | null
  inventoryUom: string | null
}

export type ColorAnalysisMaterialSummary = {
  colorCode: string
  totalQuantity: number
  lineCount: number
  materialCodes: string[]
  materialNames: string[]
  quantityShare: number
}

export type ColorAnalysisSku = {
  skuComplete: string
  colorCode: string
  colorName: string | null
  familyCode: string | null
  referenceCode: string | null
  productType: string | null
  manufacturingProcess: string | null
}

export type ColorModeCandidate = 'full' | 'dual' | 'balance' | 'equivalent' | 'review'
export type ColorScopeKey =
  | 'full_product'
  | 'structure'
  | 'front'
  | 'inner_structure'
  | 'drawer_bottom'
  | 'edge_band_body'
  | 'edge_band_front'
  | 'edge_band_inner'
  | 'edge_band_drawer_bottom'

export type ColorScopeCandidate = {
  suggestedCode: string | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  evidence: string[]
}

export type ColorConfigurationEvidence = {
  recommendedColorMode: ColorModeCandidate
  confidence: 'high' | 'medium' | 'low' | 'none'
  requiresReview: boolean
  reasons: string[]
  scopes: Record<ColorScopeKey, ColorScopeCandidate>
  applicationColorsDraft: Partial<Record<ColorScopeKey, string>>
}

export type ColorAnalysisSkuResult = ColorAnalysisSku & {
  sapFound: boolean
  sapItemName: string | null
  materialLines: ColorAnalysisMaterialLine[]
  boardLines: ColorAnalysisMaterialLine[]
  edgeLines: ColorAnalysisMaterialLine[]
  otherLines: ColorAnalysisMaterialLine[]
  boardPattern: string
  edgePattern: string
  boardColors: string[]
  edgeColors: string[]
  totalBoardQuantity: number
  totalEdgeQuantity: number
  boardConsumption: ColorAnalysisMaterialSummary[]
  edgeConsumption: ColorAnalysisMaterialSummary[]
  configurationEvidence: ColorConfigurationEvidence
  anomalies: string[]
}

export type ColorConfigurationSnapshot = {
  colorMode: string
  applicationColorsJson: Record<string, unknown>
  allowedProductTypes: string[]
  allowedManufacturingProcesses: string[]
  isActive: boolean
  notes: string | null
}

export type ColorAnalysisCombination = {
  boardColors: string[]
  edgeColors: string[]
  skuCount: number
  skuExamples: string[]
}

export type ColorAnalysisColorResult = {
  colorCode: string
  colorName: string | null
  productTypes: string[]
  manufacturingProcesses: string[]
  currentConfiguration: ColorConfigurationSnapshot | null
  skuCount: number
  referenceCount: number
  sapSkuCount: number
  missingSapSkuCount: number
  boardPatterns: Record<string, number>
  edgePatterns: Record<string, number>
  inferredBoardPattern: string
  inferredEdgePattern: string
  observedBoardColors: string[]
  observedEdgeColors: string[]
  boardConsumption: ColorAnalysisMaterialSummary[]
  edgeConsumption: ColorAnalysisMaterialSummary[]
  combinations: ColorAnalysisCombination[]
  configurationEvidence: ColorConfigurationEvidence
  anomalies: string[]
  sampleSkus: Array<{
    skuComplete: string
    referenceCode: string | null
    boardPattern: string
    edgePattern: string
    boardColors: string[]
    edgeColors: string[]
    boardConsumption: ColorAnalysisMaterialSummary[]
    edgeConsumption: ColorAnalysisMaterialSummary[]
    anomalies: string[]
  }>
  skuDetails: ColorAnalysisSkuResult[]
}

const SAP_CODE_SUFFIX = /-([A-Z0-9]{4})$/i
const COLOR_SCOPE_KEYS: ColorScopeKey[] = [
  'full_product',
  'structure',
  'front',
  'inner_structure',
  'drawer_bottom',
  'edge_band_body',
  'edge_band_front',
  'edge_band_inner',
  'edge_band_drawer_bottom',
]

function asRecord(value: unknown): SapEntityPayload | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as SapEntityPayload
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value)
  return 0
}

function readNullableNumber(value: unknown): number | null {
  const parsed = readNumber(value)
  return typeof value === 'number' || typeof value === 'string' ? parsed : null
}

function colorCodeFromItemCode(itemCode: string): string | null {
  return itemCode.match(SAP_CODE_SUFFIX)?.[1]?.toUpperCase() ?? null
}

function materialCategory(itemName: string): ColorAnalysisMaterialLine['category'] {
  const normalizedName = itemName.toUpperCase()
  if (normalizedName.includes('TABLERO')) return 'board'
  if (normalizedName.includes('CANTO')) return 'edge'
  return 'other'
}

function normalizeLine(value: unknown): ColorAnalysisMaterialLine | null {
  const line = asRecord(value)
  if (!line) return null
  const itemCode = readString(line.ItemCode)
  if (!itemCode) return null
  const itemName = readString(line.ItemName) ?? ''
  return {
    itemCode,
    itemName,
    colorCode: colorCodeFromItemCode(itemCode),
    quantity: readNumber(line.Quantity),
    category: materialCategory(itemName),
    childNum: readNullableNumber(line.ChildNum),
    issueMethod: readString(line.IssueMethod),
    warehouse: readString(line.Warehouse),
    inventoryUom: readString(line.InventoryUOM),
  }
}

export function extractColorAnalysisLines(lines: unknown): ColorAnalysisMaterialLine[] {
  if (!Array.isArray(lines)) return []
  return lines.flatMap(line => {
    const normalized = normalizeLine(line)
    return normalized ? [normalized] : []
  })
}

export function materialLinesFromSapBom(bom: { lines: BomLine[] }): ColorAnalysisMaterialLine[] {
  return extractColorAnalysisLines(bom.lines)
}

export function materialLinesFromProductTree(tree: SapEntityPayload): ColorAnalysisMaterialLine[] {
  return extractColorAnalysisLines(tree.ProductTreeLines)
}

function distinctCodes(lines: ColorAnalysisMaterialLine[]): string[] {
  return [...new Set(lines.flatMap(line => line.colorCode ? [line.colorCode] : []))]
}

function patternForBoards(lines: ColorAnalysisMaterialLine[]): string {
  const colors = distinctCodes(lines)
  if (colors.length === 0) return 'SIN_TABLERO'
  if (colors.length === 1) return 'UNICOLOR'
  if (colors.length === 2) return 'DUAL'
  if (colors.length === 3) return 'BALANCE'
  return 'REVISAR_MAS_DE_TRES_COLORES'
}

function patternForEdges(lines: ColorAnalysisMaterialLine[]): string {
  const colors = distinctCodes(lines)
  if (colors.length === 0) return 'SIN_CANTO'
  if (colors.length === 1) return 'UNIFORME'
  return 'CANTO_MIXTO'
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.flatMap(value => value ? [value] : []))].sort()
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function consumptionByColor(lines: ColorAnalysisMaterialLine[]): ColorAnalysisMaterialSummary[] {
  const totalQuantity = lines.reduce((total, line) => total + Math.max(0, line.quantity), 0)
  const byColor = new Map<string, { totalQuantity: number; lineCount: number; materialCodes: Set<string>; materialNames: Set<string> }>()

  for (const line of lines) {
    if (!line.colorCode) continue
    const current = byColor.get(line.colorCode) ?? {
      totalQuantity: 0,
      lineCount: 0,
      materialCodes: new Set<string>(),
      materialNames: new Set<string>(),
    }
    current.totalQuantity += Math.max(0, line.quantity)
    current.lineCount += 1
    current.materialCodes.add(line.itemCode)
    if (line.itemName) current.materialNames.add(line.itemName)
    byColor.set(line.colorCode, current)
  }

  return [...byColor.entries()]
    .map(([colorCode, value]) => ({
      colorCode,
      totalQuantity: round(value.totalQuantity),
      lineCount: value.lineCount,
      materialCodes: [...value.materialCodes].sort(),
      materialNames: [...value.materialNames].sort(),
      quantityShare: totalQuantity > 0 ? round(value.totalQuantity / totalQuantity, 6) : 0,
    }))
    .sort((left, right) => right.totalQuantity - left.totalQuantity || left.colorCode.localeCompare(right.colorCode))
}

function emptyScopes(): Record<ColorScopeKey, ColorScopeCandidate> {
  return Object.fromEntries(COLOR_SCOPE_KEYS.map(scope => [scope, {
    suggestedCode: null,
    confidence: 'none',
    evidence: [],
  }])) as unknown as Record<ColorScopeKey, ColorScopeCandidate>
}

function scopeCandidate(
  suggestedCode: string | null,
  confidence: ColorScopeCandidate['confidence'],
  ...evidence: string[]
): ColorScopeCandidate {
  return { suggestedCode, confidence, evidence }
}

function applicationColorsDraft(scopes: Record<ColorScopeKey, ColorScopeCandidate>): Partial<Record<ColorScopeKey, string>> {
  return Object.fromEntries(
    COLOR_SCOPE_KEYS.flatMap(scope => {
      const code = scopes[scope].suggestedCode
      return code ? [[scope, code] as const] : []
    }),
  )
}

function configurationEvidenceForSku(
  colorCode: string,
  boardConsumption: ColorAnalysisMaterialSummary[],
  edgeConsumption: ColorAnalysisMaterialSummary[],
  boardPattern: string,
  edgePattern: string,
  sapFound: boolean,
): ColorConfigurationEvidence {
  const scopes = emptyScopes()
  const reasons: string[] = []
  const boardCodes = boardConsumption.map(item => item.colorCode)
  const edgeCodes = edgeConsumption.map(item => item.colorCode)
  const boardCount = boardCodes.length
  let recommendedColorMode: ColorModeCandidate = 'review'
  let confidence: ColorConfigurationEvidence['confidence'] = 'none'

  if (!sapFound) {
    reasons.push('SKU_NO_ENCONTRADO_EN_SAP')
  } else if (boardCount === 1 && boardCodes[0] === colorCode) {
    recommendedColorMode = 'full'
    confidence = 'high'
    scopes.full_product = scopeCandidate(colorCode, 'high', 'El unico tablero encontrado coincide con el color comercial del SKU.')
  } else if (boardCount === 1) {
    recommendedColorMode = 'equivalent'
    confidence = 'medium'
    scopes.full_product = scopeCandidate(boardCodes[0], 'medium', 'El unico tablero encontrado es distinto al color comercial del SKU.', 'Candidato a Color interno diferente; confirmar con el negocio.')
    reasons.push('TABLERO_UNICO_DIFERENTE_AL_COLOR_DEL_SKU')
  } else if (boardCount === 2) {
    recommendedColorMode = 'dual'
    confidence = 'medium'
    scopes.structure = scopeCandidate(boardConsumption[0]?.colorCode ?? null, 'low', 'Hipotesis: mayor consumo de tablero se propone como estructura.')
    scopes.front = scopeCandidate(boardConsumption[1]?.colorCode ?? null, 'low', 'Hipotesis: segundo consumo de tablero se propone como frente.')
    reasons.push('DUAL_REQUIERE_VALIDAR_ROLES_POR_CONSUMO')
  } else if (boardCount === 3) {
    recommendedColorMode = 'balance'
    confidence = 'medium'
    scopes.structure = scopeCandidate(boardConsumption[0]?.colorCode ?? null, 'low', 'Hipotesis: mayor consumo se propone como estructura.')
    scopes.front = scopeCandidate(boardConsumption[1]?.colorCode ?? null, 'low', 'Hipotesis: consumo intermedio se propone como frente.')
    scopes.inner_structure = scopeCandidate(boardConsumption[2]?.colorCode ?? null, 'low', 'Hipotesis: menor consumo se propone como estructura interna.')
    reasons.push('BALANCE_REQUIERE_VALIDAR_ROLES_POR_CONSUMO')
  } else if (boardCount > 3) {
    reasons.push('MAS_DE_TRES_COLORES_DE_TABLERO')
  } else {
    reasons.push('SIN_TABLERO')
  }

  if (boardPattern !== 'UNICOLOR' && boardPattern !== 'DUAL' && boardPattern !== 'BALANCE') {
    reasons.push(`PATRON_TABLERO_${boardPattern}`)
  }
  if (edgePattern === 'CANTO_MIXTO') {
    reasons.push('CANTOS_DE_VARIOS_COLORES_SIN_ROL_DE_COMPONENTE_CONFIRMADO')
  }
  if (edgeCodes.length === 1) {
    scopes.edge_band_body = scopeCandidate(edgeCodes[0], edgeCodes[0] === colorCode ? 'medium' : 'low', 'Unico color de canto encontrado; el rol exacto del canto no se puede confirmar solo con el consumo.')
    if (edgeCodes[0] !== colorCode) reasons.push('CANTO_UNICO_DIFERENTE_AL_COLOR_DEL_SKU')
  } else if (edgeCodes.length > 1) {
    reasons.push('CANTOS_MULTICOLOR_REQUIEREN_IDENTIFICAR_COMPONENTE')
  }
  if (edgeCodes.length === 0) reasons.push('SIN_CANTO')

  return {
    recommendedColorMode,
    confidence,
    requiresReview: confidence === 'none' || reasons.length > 0,
    reasons: [...new Set(reasons)],
    scopes,
    applicationColorsDraft: applicationColorsDraft(scopes),
  }
}

export function classifyColorAnalysisSku(input: {
  sku: ColorAnalysisSku
  sapFound: boolean
  sapItemName: string | null
  lines: ColorAnalysisMaterialLine[]
}): ColorAnalysisSkuResult {
  const boardLines = input.lines.filter(line => line.category === 'board')
  const edgeLines = input.lines.filter(line => line.category === 'edge')
  const otherLines = input.lines.filter(line => line.category === 'other')
  const boardColors = distinctCodes(boardLines)
  const edgeColors = distinctCodes(edgeLines)
  const boardConsumption = consumptionByColor(boardLines)
  const edgeConsumption = consumptionByColor(edgeLines)
  const anomalies: string[] = []

  if (!input.sapFound) anomalies.push('SKU_NO_ENCONTRADO_EN_SAP')
  if (boardColors.length === 1 && boardColors[0] !== input.sku.colorCode) {
    anomalies.push('TABLERO_CON_COLOR_DIFERENTE_AL_SKU')
  }
  if (edgeColors.length === 1 && edgeColors[0] !== input.sku.colorCode) {
    anomalies.push('CANTO_CON_COLOR_DIFERENTE_AL_SKU')
  }
  if (boardColors.length > 1 && edgeColors.length > 1) {
    anomalies.push('TABLEROS_Y_CANTOS_MULTICOLOR')
  }

  return {
    ...input.sku,
    sapFound: input.sapFound,
    sapItemName: input.sapItemName,
    materialLines: input.lines,
    boardLines,
    edgeLines,
    otherLines,
    boardPattern: patternForBoards(boardLines),
    edgePattern: patternForEdges(edgeLines),
    boardColors,
    edgeColors,
    totalBoardQuantity: round(boardLines.reduce((total, line) => total + Math.max(0, line.quantity), 0)),
    totalEdgeQuantity: round(edgeLines.reduce((total, line) => total + Math.max(0, line.quantity), 0)),
    boardConsumption,
    edgeConsumption,
    configurationEvidence: configurationEvidenceForSku(
      input.sku.colorCode,
      boardConsumption,
      edgeConsumption,
      patternForBoards(boardLines),
      patternForEdges(edgeLines),
      input.sapFound,
    ),
    anomalies,
  }
}

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1
}

function inferredPattern(patterns: Record<string, number>): string {
  const entries = Object.entries(patterns).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  if (entries.length === 0) return 'SIN_DATOS_SAP'
  if (entries.length === 1) return entries[0][0]
  return 'MIXTO_ENTRE_REFERENCIAS'
}

function aggregateConsumption(results: ColorAnalysisSkuResult[], category: 'board' | 'edge'): ColorAnalysisMaterialSummary[] {
  const totalQuantity = results.reduce((total, result) => total + (category === 'board' ? result.totalBoardQuantity : result.totalEdgeQuantity), 0)
  const byColor = new Map<string, { totalQuantity: number; lineCount: number; skuCodes: Set<string>; materialCodes: Set<string>; materialNames: Set<string> }>()

  for (const result of results) {
    const summaries = category === 'board' ? result.boardConsumption : result.edgeConsumption
    for (const summary of summaries) {
      const current = byColor.get(summary.colorCode) ?? {
        totalQuantity: 0,
        lineCount: 0,
        skuCodes: new Set<string>(),
        materialCodes: new Set<string>(),
        materialNames: new Set<string>(),
      }
      current.totalQuantity += summary.totalQuantity
      current.lineCount += summary.lineCount
      current.skuCodes.add(result.skuComplete)
      for (const code of summary.materialCodes) current.materialCodes.add(code)
      for (const name of summary.materialNames) current.materialNames.add(name)
      byColor.set(summary.colorCode, current)
    }
  }

  return [...byColor.entries()]
    .map(([colorCode, value]) => ({
      colorCode,
      totalQuantity: round(value.totalQuantity),
      lineCount: value.lineCount,
      materialCodes: [...value.materialCodes].sort(),
      materialNames: [...value.materialNames].sort(),
      quantityShare: totalQuantity > 0 ? round(value.totalQuantity / totalQuantity, 6) : 0,
      skuCount: value.skuCodes.size,
    } as ColorAnalysisMaterialSummary & { skuCount: number }))
    .sort((left, right) => right.totalQuantity - left.totalQuantity || left.colorCode.localeCompare(right.colorCode))
}

function aggregateConfigurationEvidence(results: ColorAnalysisSkuResult[], colorCode: string): ColorConfigurationEvidence {
  const scopes = emptyScopes()
  const modeCounts = new Map<ColorModeCandidate, number>()
  const scopeCounts = new Map<ColorScopeKey, Map<string, number>>()
  const reasons = new Set<string>()

  for (const result of results) {
    const evidence = result.configurationEvidence
    modeCounts.set(evidence.recommendedColorMode, (modeCounts.get(evidence.recommendedColorMode) ?? 0) + 1)
    for (const reason of evidence.reasons) reasons.add(reason)
    for (const scope of COLOR_SCOPE_KEYS) {
      const code = evidence.scopes[scope].suggestedCode
      if (!code) continue
      const values = scopeCounts.get(scope) ?? new Map<string, number>()
      values.set(code, (values.get(code) ?? 0) + 1)
      scopeCounts.set(scope, values)
    }
  }

  const modeEntries = [...modeCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  const topMode = modeEntries[0]?.[0] ?? 'review'
  const topModeCount = modeEntries[0]?.[1] ?? 0
  const modeIsConsistent = topModeCount === results.length
  const confidence: ColorConfigurationEvidence['confidence'] = modeIsConsistent && topMode !== 'review'
    ? (topMode === 'full' ? 'high' : 'medium')
    : topModeCount > results.length / 2 ? 'low' : 'none'

  for (const scope of COLOR_SCOPE_KEYS) {
    const candidates = [...(scopeCounts.get(scope) ?? new Map<string, number>()).entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    const [code, count] = candidates[0] ?? []
    if (!code) continue
    const scopeConfidence = count === results.length && confidence !== 'none'
      ? (scope === 'full_product' && topMode === 'full' ? 'high' : 'medium')
      : 'low'
    scopes[scope] = scopeCandidate(
      code,
      scopeConfidence,
      `${count} de ${results.length} SKU analizados proponen este codigo para ${scope}.`,
      ...(candidates.length > 1 ? [`Hay ${candidates.length} candidatos distintos para este scope.`] : []),
    )
  }

  if (results.some(result => result.colorCode !== colorCode)) reasons.add('COLOR_CODE_INCONSISTENTE')
  return {
    recommendedColorMode: topMode,
    confidence,
    requiresReview: !modeIsConsistent || reasons.size > 0 || confidence === 'low' || confidence === 'none',
    reasons: [...reasons],
    scopes,
    applicationColorsDraft: applicationColorsDraft(scopes),
  }
}

function aggregateCombinations(results: ColorAnalysisSkuResult[]): ColorAnalysisCombination[] {
  const combinations = new Map<string, { boardColors: string[]; edgeColors: string[]; skuCount: number; skuExamples: string[] }>()
  for (const result of results) {
    const boardColors = [...result.boardColors].sort()
    const edgeColors = [...result.edgeColors].sort()
    const key = `${boardColors.join(',')}|${edgeColors.join(',')}`
    const current = combinations.get(key) ?? { boardColors, edgeColors, skuCount: 0, skuExamples: [] }
    current.skuCount += 1
    if (current.skuExamples.length < 20) current.skuExamples.push(result.skuComplete)
    combinations.set(key, current)
  }

  return [...combinations.entries()]
    .map(([, value]) => value)
    .sort((left, right) => right.skuCount - left.skuCount || left.boardColors.join(',').localeCompare(right.boardColors.join(',')))
}

function configurationSnapshot(value: unknown): ColorConfigurationSnapshot | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    colorMode: readString(record.colorMode) ?? 'full',
    applicationColorsJson: asRecord(record.applicationColorsJson) ?? {},
    allowedProductTypes: Array.isArray(record.allowedProductTypes) ? record.allowedProductTypes.filter((item): item is string => typeof item === 'string') : [],
    allowedManufacturingProcesses: Array.isArray(record.allowedManufacturingProcesses) ? record.allowedManufacturingProcesses.filter((item): item is string => typeof item === 'string') : [],
    isActive: record.isActive !== false,
    notes: readString(record.notes),
  }
}

export function aggregateColorAnalysis(
  results: ColorAnalysisSkuResult[],
  configurationByColor: Map<string, ColorConfigurationSnapshot | null> = new Map(),
): ColorAnalysisColorResult[] {
  const byColor = new Map<string, ColorAnalysisSkuResult[]>()
  for (const result of results) {
    const group = byColor.get(result.colorCode) ?? []
    group.push(result)
    byColor.set(result.colorCode, group)
  }

  return [...byColor.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([colorCode, colorResults]) => {
    const boardPatterns: Record<string, number> = {}
    const edgePatterns: Record<string, number> = {}
    const anomalies = new Set<string>()
    for (const result of colorResults) {
      increment(boardPatterns, result.boardPattern)
      increment(edgePatterns, result.edgePattern)
      for (const anomaly of result.anomalies) anomalies.add(anomaly)
    }

    const boardColors = uniqueSorted(colorResults.flatMap(result => result.boardColors))
    const edgeColors = uniqueSorted(colorResults.flatMap(result => result.edgeColors))
    if (boardColors.length === 1 && boardColors[0] !== colorCode) anomalies.add('CANDIDATO_COLOR_INTERNO_DIFERENTE')
    if (edgeColors.length === 1 && edgeColors[0] !== colorCode) anomalies.add('CANDIDATO_CANTO_DIFERENTE')

    const boardConsumption = aggregateConsumption(colorResults, 'board')
    const edgeConsumption = aggregateConsumption(colorResults, 'edge')
    const configuration = aggregateConfigurationEvidence(colorResults, colorCode)
    const currentConfiguration = configurationByColor.get(colorCode) ?? null

    return {
      colorCode,
      colorName: colorResults.find(result => result.colorName)?.colorName ?? null,
      productTypes: uniqueSorted(colorResults.map(result => result.productType)),
      manufacturingProcesses: uniqueSorted(colorResults.map(result => result.manufacturingProcess)),
      currentConfiguration,
      skuCount: colorResults.length,
      referenceCount: new Set(colorResults.map(result => result.referenceCode).filter(Boolean)).size,
      sapSkuCount: colorResults.filter(result => result.sapFound).length,
      missingSapSkuCount: colorResults.filter(result => !result.sapFound).length,
      boardPatterns,
      edgePatterns,
      inferredBoardPattern: inferredPattern(boardPatterns),
      inferredEdgePattern: inferredPattern(edgePatterns),
      observedBoardColors: boardColors,
      observedEdgeColors: edgeColors,
      boardConsumption,
      edgeConsumption,
      combinations: aggregateCombinations(colorResults),
      configurationEvidence: configuration,
      anomalies: [...anomalies].sort(),
      sampleSkus: colorResults.slice(0, 10).map(result => ({
        skuComplete: result.skuComplete,
        referenceCode: result.referenceCode,
        boardPattern: result.boardPattern,
        edgePattern: result.edgePattern,
        boardColors: result.boardColors,
        edgeColors: result.edgeColors,
        boardConsumption: result.boardConsumption,
        edgeConsumption: result.edgeConsumption,
        anomalies: result.anomalies,
      })),
      skuDetails: colorResults,
    }
  })
}

export { configurationSnapshot }
