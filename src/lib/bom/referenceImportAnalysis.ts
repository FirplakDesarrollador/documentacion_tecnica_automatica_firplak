import type {
  BomColorMode,
  BomConsumption,
  BomMaterialAlternative,
  ComponentTechnicalMetadata,
  MaterialProfile,
} from './types'
import {
  type ColorConfiguration,
  type DirectBomSnapshot,
  type JsonRecord,
  type NormalizedSapBomLine,
  type ReferenceBomLine,
  type ReferenceImportAnalysis,
  type ReferenceImportContext,
  type ReferenceImportFindingDraft,
} from './referenceImportTypes'
import type { ReferenceProductApplicationScope } from './referenceImportScopes'
import { inferBoardApplicationScope } from './sapMapping'

type LineEvidence = {
  snapshot: DirectBomSnapshot
  line: NormalizedSapBomLine
}

type LogicalEvidence = {
  key: string
  lines: Array<{ lineIdentity: string; evidence: LineEvidence[] }>
  isMaterialGroup: boolean
  alternatives: BomMaterialAlternative[]
  sortOrder: number
  scope: ReferenceProductApplicationScope
}

type QuantityObservation = {
  colorMode: BomColorMode
  scope: ReferenceProductApplicationScope
  profile: MaterialProfile
  formatKey: string | null
  qty: number
  skuComplete: string
}

const EPSILON = 0.000001
const BOARD_THICKNESS_TOLERANCE_MM = 0.5

function consolidatedSnapshotLines(snapshot: DirectBomSnapshot): NormalizedSapBomLine[] {
  const linesByKey = new Map<string, NormalizedSapBomLine>()
  for (const line of snapshot.normalizedLines) {
    if (line.technicalMetadata?.material_kind !== 'board') {
      linesByKey.set(`line:${line.lineIdentity}`, line)
      continue
    }
    const key = [
      line.baseItemCode,
      line.itemCode,
      line.variantCode4,
      line.technicalMetadata.material_profile ?? 'none',
      line.technicalMetadata.format_key ?? 'none',
      line.warehouse ?? 'none',
      line.issueMethod ?? 'none',
      line.inventoryUom ?? 'none',
    ].join('|')
    const existing = linesByKey.get(key)
    if (!existing) {
      linesByKey.set(key, { ...line, sourceLineCount: line.sourceLineCount ?? 1 })
      continue
    }
    linesByKey.set(key, {
      ...existing,
      qty: existing.qty + line.qty,
      sourceLineCount: (existing.sourceLineCount ?? 1) + (line.sourceLineCount ?? 1),
    })
  }
  return [...linesByKey.values()]
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? ''
}

function mostCommonString(values: Array<string | null>): string | null {
  const counts = new Map<string, number>()
  for (const value of values) {
    const normalized = value?.trim() ?? ''
    if (!normalized) continue
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
}

function mostCommonNumber(values: number[]): number {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? 0
}

function allSameNumber(values: number[]): boolean {
  return values.every(value => Math.abs(value - values[0]) < EPSILON)
}

function allSameText(values: Array<string | null>): boolean {
  return new Set(values.map(value => value?.trim() ?? '')).size <= 1
}

function asColorMode(configuration: ColorConfiguration | undefined): BomColorMode {
  if (configuration?.colorMode === 'dual' || configuration?.colorMode === 'balance') return configuration.colorMode
  return 'full'
}

function isEdgeBandScope(scope: ReferenceProductApplicationScope): boolean {
  return scope.startsWith('edge_band_')
}

function configuredScopeForColor(configuration: ColorConfiguration, scope: ReferenceProductApplicationScope): ReferenceProductApplicationScope {
  return (configuration.colorMode === 'full' || configuration.colorMode === 'equivalent') && isEdgeBandScope(scope)
    ? 'edge_band_full_product'
    : scope
}

function dualBoardScopeFromEvidence(
  evidence: LineEvidence[],
  colorConfigurations: Map<string, ColorConfiguration>
): ReferenceProductApplicationScope | null {
  const observedScopes = new Set<ReferenceProductApplicationScope>()
  for (const item of evidence) {
    const colorCode = item.snapshot.skuColorCode
    const configuration = colorCode ? colorConfigurations.get(colorCode) : undefined
    if (configuration?.colorMode !== 'dual') continue
    if (item.line.variantCode4 === configuration.applicationColors.structure) observedScopes.add('structure')
    if (item.line.variantCode4 === configuration.applicationColors.front) observedScopes.add('front')
  }
  return observedScopes.size === 1 ? [...observedScopes][0] ?? null : null
}

function dualEdgeScopeFromEvidence(
  evidence: LineEvidence[],
  colorConfigurations: Map<string, ColorConfiguration>
): ReferenceProductApplicationScope | null {
  const observedScopes = new Set<ReferenceProductApplicationScope>()
  for (const item of evidence) {
    const colorCode = item.snapshot.skuColorCode
    const configuration = colorCode ? colorConfigurations.get(colorCode) : undefined
    if (configuration?.colorMode !== 'dual') continue
    if (item.line.variantCode4 === configuration.applicationColors.structure) observedScopes.add('edge_band_body')
    if (item.line.variantCode4 === configuration.applicationColors.front) observedScopes.add('edge_band_front')
  }
  return observedScopes.size === 1 ? [...observedScopes][0] ?? null : null
}

function metadataFor(line: NormalizedSapBomLine): ComponentTechnicalMetadata | null {
  return line.technicalMetadata
}

function explicitSemanticScope(
  scope: ReferenceProductApplicationScope | null | undefined
): ReferenceProductApplicationScope | null {
  if (
    scope === 'structure'
    || scope === 'front'
    || scope === 'inner_structure'
    || scope === 'drawer_bottom'
    || scope === 'edge_band_body'
    || scope === 'edge_band_front'
    || scope === 'edge_band_inner'
    || scope === 'edge_band_drawer_bottom'
  ) return scope
  return null
}

function pendingEdgeScopeFromSkuOverrides(
  line: NormalizedSapBomLine,
  evidence: LineEvidence[],
  context: ReferenceImportContext
): ReferenceProductApplicationScope | null {
  if (!normalizedText(line.itemName).includes('CANTO')) return null
  const observedScopes = new Set<ReferenceProductApplicationScope>()
  for (const item of evidence) {
    if (item.line.baseItemCode !== line.baseItemCode) continue
    const skuColorCode = item.snapshot.skuColorCode?.trim().toUpperCase()
    if (!skuColorCode) continue
    const overrides = context.skuColorOverrides?.get(item.snapshot.skuComplete.trim().toUpperCase()) ?? []
    for (const override of overrides) {
      const scope = explicitSemanticScope(override.product_application_scope)
      const targetColorCode = override.target_color_code?.trim().toUpperCase()
      if (
        (scope !== 'edge_band_body' && scope !== 'edge_band_front')
        || override.color_code.trim().toUpperCase() !== skuColorCode
        || (override.base_item_code && override.base_item_code !== item.line.baseItemCode)
        || targetColorCode !== item.line.variantCode4
      ) continue
      observedScopes.add(scope)
    }
  }
  return observedScopes.size === 1 ? [...observedScopes][0] ?? null : null
}

function scopeFromSemantics(
  line: NormalizedSapBomLine,
  evidence: LineEvidence[],
  colorConfigurations: Map<string, ColorConfiguration>,
  context: ReferenceImportContext
): ReferenceProductApplicationScope {
  // CMPD09 is a manufactured piece (for example, PUERTA), never a color
  // application role. A word in its name must not turn it into a board front.
  if (line.baseItemCode.trim().toUpperCase().startsWith('CMPD09')) return 'NA'

  const boardNameScope = inferBoardApplicationScope({
    itemName: line.itemName,
    baseItemCode: line.baseItemCode,
    materialKind: line.technicalMetadata?.material_kind,
  })
  if (boardNameScope) return boardNameScope

  const fromPendingSkuOverride = pendingEdgeScopeFromSkuOverrides(line, evidence, context)
  if (fromPendingSkuOverride) return fromPendingSkuOverride

  const materialKind = line.technicalMetadata?.material_kind
  if (materialKind === 'board') {
    return dualBoardScopeFromEvidence(evidence, colorConfigurations) ?? 'full_product'
  }

  const name = normalizedText(line.itemName)
  // Some older SAP snapshots have not yet classified CANTO as edge_band in
  // technical metadata. Its own semantic name remains enough evidence; no
  // analogous inference is allowed for manufactured pieces such as PUERTA.
  if (materialKind !== 'edge_band' && !name.includes('CANTO')) return 'NA'
  // Los fondos de cajón se fabrican sin canto. No convertir una mención a
  // cajón en un rol de canto interno: los únicos roles automáticos de canto
  // son estructura y frentes, y cuando hay dos referencias se resuelven por
  // consumo más abajo.
  if (name.includes('INTERIOR') || name.includes('INTERNA')) return 'edge_band_full_product'
  return dualEdgeScopeFromEvidence(evidence, colorConfigurations) ?? 'edge_band_full_product'
}

function isEdgeBandEvidence(evidence: LineEvidence[]): boolean {
  const line = evidence[0]?.line
  return line?.technicalMetadata?.material_kind === 'edge_band'
    || normalizedText(line?.itemName).includes('CANTO')
}

function inferTwoEdgeBandRoles(logicals: LogicalEvidence[]): LogicalEvidence[] {
  const candidates = logicals.filter(logical =>
    logical.scope === 'edge_band_full_product'
    && logical.lines.length === 1
    && isEdgeBandEvidence(logical.lines[0]?.evidence ?? [])
  )
  if (candidates.length !== 2) return logicals

  const representativeQty = (logical: LogicalEvidence): number => {
    const quantities = logical.lines[0]?.evidence.map(item => item.line.qty) ?? []
    return mostCommonNumber(quantities)
  }
  const [first, second] = candidates
  if (!first || !second) return logicals
  const firstQty = representativeQty(first)
  const secondQty = representativeQty(second)
  if (Math.abs(firstQty - secondQty) < EPSILON) return logicals
  const structure = firstQty > secondQty ? first : second
  const front = structure === first ? second : first
  const roleByKey = new Map([
    [structure.key, 'edge_band_body' as const],
    [front.key, 'edge_band_front' as const],
  ])
  return logicals.map(logical => ({
    ...logical,
    scope: roleByKey.get(logical.key) ?? logical.scope,
  }))
}

function isColorApplicable(configuration: ColorConfiguration, context: ReferenceImportContext): boolean {
  const processApplies = configuration.allowedManufacturingProcesses.length === 0
    || (context.manufacturingProcess !== null && configuration.allowedManufacturingProcesses.includes(context.manufacturingProcess))
  const typeApplies = configuration.allowedProductTypes.length === 0
    || (context.productType !== null && configuration.allowedProductTypes.includes(context.productType))
  return processApplies && typeApplies
}

function createFinding(input: Omit<ReferenceImportFindingDraft, 'status'> & {
  status?: ReferenceImportFindingDraft['status']
}): ReferenceImportFindingDraft {
  return { ...input, status: input.status ?? 'open' }
}

function lineDetails(evidence: LineEvidence[]): JsonRecord {
  return {
    by_sku: evidence.map(item => ({
      sku_complete: item.snapshot.skuComplete,
      sku_color_code: item.snapshot.skuColorCode,
      item_code: item.line.itemCode,
      item_name: item.line.itemName,
      material_color: item.line.variantCode4,
      qty: item.line.qty,
      source_line_count: item.line.sourceLineCount ?? 1,
      warehouse: item.line.warehouse,
      issue_method: item.line.issueMethod,
      visible_order: item.line.sourceOrder,
      sap_child_num: item.line.sapChildNum,
      technical_metadata: item.line.technicalMetadata,
    })),
  }
}

function candidateColorForScope(
  configuration: ColorConfiguration | undefined,
  scope: ReferenceProductApplicationScope,
  skuColorCode: string | null
): string | null {
  if (!configuration || !skuColorCode) return skuColorCode
  const mappedScope = configuredScopeForColor(configuration, scope)
  return configuration.applicationColors[mappedScope]
    ?? configuration.applicationColors.full_product
    ?? skuColorCode
}

function hybridColorCaseForSku(
  configuration: ColorConfiguration | undefined,
  skuComplete: string
) {
  const normalizedSkuComplete = skuComplete.trim().toUpperCase()
  return configuration?.hybridColorCases?.find(hybridCase =>
    hybridCase.sku_completes.includes(normalizedSkuComplete)
  ) ?? null
}

function configuredColorsForEvidence(
  evidence: LineEvidence,
  scope: ReferenceProductApplicationScope,
  configuration: ColorConfiguration | undefined,
  skuColorCode: string
): string[] {
  const hybridCase = hybridColorCaseForSku(configuration, evidence.snapshot.skuComplete)
  if (hybridCase) {
    const itemName = normalizedText(evidence.line.itemName)
    const isBoard = evidence.line.technicalMetadata?.material_kind === 'board'
    const isEdgeBand = evidence.line.technicalMetadata?.material_kind === 'edge_band' || itemName.includes('CANTO')
    const hybridScopes = isBoard && scope === 'full_product'
      ? hybridCase.color_mode === 'balance'
        ? ['structure', 'front', 'inner_structure']
        : ['structure', 'front']
      : isEdgeBand && scope === 'edge_band_full_product'
        ? hybridCase.color_mode === 'balance'
          ? ['edge_band_body', 'edge_band_front', 'edge_band_inner']
          : ['edge_band_body', 'edge_band_front']
        : [scope]
    const hybridColors = hybridScopes
      .map(hybridScope => hybridCase.application_colors[hybridScope])
      .filter((colorCode): colorCode is string => Boolean(colorCode))
    if (hybridColors.length > 0) return [...new Set(hybridColors)]
  }
  const candidate = candidateColorForScope(configuration, scope, skuColorCode)
  return candidate ? [candidate] : []
}

function skuOverrideColorForEvidence(
  evidence: LineEvidence,
  scope: ReferenceProductApplicationScope,
  context: ReferenceImportContext
): string | null {
  const skuColorCode = evidence.snapshot.skuColorCode?.trim().toUpperCase()
  if (!skuColorCode) return null
  const overrides = context.skuColorOverrides?.get(evidence.snapshot.skuComplete.trim().toUpperCase()) ?? []
  const override = overrides
    .filter(candidate =>
      candidate.color_code.trim().toUpperCase() === skuColorCode
      && candidate.product_application_scope === scope
      && (!candidate.base_item_code || candidate.base_item_code === evidence.line.baseItemCode)
      && Boolean(candidate.target_color_code)
    )
    .at(-1)
  return override?.target_color_code?.trim().toUpperCase() ?? null
}

function evidenceUsesConfiguredColor(
  evidence: LineEvidence,
  scope: ReferenceProductApplicationScope,
  configurations: Map<string, ColorConfiguration>,
  context: ReferenceImportContext
): boolean {
  const skuColorCode = evidence.snapshot.skuColorCode
  if (!skuColorCode || evidence.line.variantCode4 === '0000') return true
  const overrideColor = skuOverrideColorForEvidence(evidence, scope, context)
  if (overrideColor) return evidence.line.variantCode4 === overrideColor
  const configuration = configurations.get(skuColorCode)
  if (!configuration || !isColorApplicable(configuration, context)) return evidence.line.variantCode4 === skuColorCode
  return configuredColorsForEvidence(evidence, scope, configuration, skuColorCode)
    .includes(evidence.line.variantCode4)
}

function lineUsesConfiguredColor(
  evidence: LineEvidence[],
  scope: ReferenceProductApplicationScope,
  configurations: Map<string, ColorConfiguration>,
  context: ReferenceImportContext
): boolean {
  return evidence.every(item => evidenceUsesConfiguredColor(item, scope, configurations, context))
}

function metadataCompatible(
  left: ComponentTechnicalMetadata | null,
  right: ComponentTechnicalMetadata | null
): boolean {
  if (!left || !right) return false
  if (left.material_kind !== right.material_kind || left.material_kind === 'other') return false
  if (left.thickness_mm === null || right.thickness_mm === null) return false
  return Math.abs(left.thickness_mm - right.thickness_mm) <= BOARD_THICKNESS_TOLERANCE_MM
}

function medianOrder(evidence: LineEvidence[]): number {
  const orders = evidence.map(item => item.line.sourceOrder).sort((left, right) => left - right)
  return orders[Math.floor(orders.length / 2)] ?? 0
}

function areMutuallyExclusive(left: LineEvidence[], right: LineEvidence[]): boolean {
  const leftSkus = new Set(left.map(item => item.snapshot.skuComplete))
  return !right.some(item => leftSkus.has(item.snapshot.skuComplete))
}

function canFormMaterialGroup(
  left: LineEvidence[],
  right: LineEvidence[],
  snapshotCount: number
): boolean {
  const leftMetadata = metadataFor(left[0]?.line)
  const rightMetadata = metadataFor(right[0]?.line)
  if (!metadataCompatible(leftMetadata, rightMetadata) || !areMutuallyExclusive(left, right)) return false
  const coverage = new Set([...left, ...right].map(item => item.snapshot.skuComplete))
  if (coverage.size !== snapshotCount) return false
  return Math.abs(medianOrder(left) - medianOrder(right)) <= 1
}

function profileAlternatives(groups: Array<{ lineIdentity: string; evidence: LineEvidence[] }>): BomMaterialAlternative[] {
  const alternatives = groups.flatMap(({ evidence }) => {
    const first = evidence[0]?.line
    const profile = first?.technicalMetadata?.material_profile
    return first && profile ? [{ baseItemCode: first.baseItemCode, profile }] : []
  })
  const defaultProfile = alternatives.some(item => item.profile === 'ST') ? 'ST' : alternatives[0]?.profile ?? null
  return alternatives
    .sort((left, right) => left.baseItemCode.localeCompare(right.baseItemCode))
    .map((alternative, index) => ({
      alternative_id: `alt_${String(index + 1).padStart(2, '0')}`,
      base_item_code: alternative.baseItemCode,
      material_profile: alternative.profile,
      is_default: alternative.profile === defaultProfile,
    }))
}

function findLogicalEvidence(
  evidenceByIdentity: Map<string, LineEvidence[]>,
  snapshotCount: number,
  colorConfigurations: Map<string, ColorConfiguration>,
  context: ReferenceImportContext
): LogicalEvidence[] {
  const pending = [...evidenceByIdentity.entries()]
    .map(([lineIdentity, evidence]) => ({ lineIdentity, evidence }))
    .sort((left, right) => medianOrder(left.evidence) - medianOrder(right.evidence) || left.lineIdentity.localeCompare(right.lineIdentity))
  const result: LogicalEvidence[] = []

  while (pending.length > 0) {
    const current = pending.shift()
    if (!current) continue
    const compatibleIndex = pending.findIndex(candidate => canFormMaterialGroup(current.evidence, candidate.evidence, snapshotCount))
    const groups = compatibleIndex >= 0
      ? [current, pending.splice(compatibleIndex, 1)[0]]
      : [current]
    const firstLine = groups[0]?.evidence[0]?.line
    if (!firstLine) continue
    const joinedEvidence = groups.flatMap(group => group.evidence)
    const isMaterialGroup = groups.length > 1
    result.push({
      key: isMaterialGroup
        ? `material-group:${groups.map(group => group.lineIdentity).sort().join('|')}`
        : `line:${current.lineIdentity}`,
      lines: groups,
      isMaterialGroup,
      alternatives: isMaterialGroup ? profileAlternatives(groups) : [],
      sortOrder: mostCommonNumber(joinedEvidence.map(item => item.line.sourceOrder)),
      scope: scopeFromSemantics(firstLine, joinedEvidence, colorConfigurations, context),
    })
  }

  return inferTwoEdgeBandRoles(result)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key))
}

function buildConsumptions(
  logical: LogicalEvidence,
  colorConfigurations: Map<string, ColorConfiguration>
): {
  consumptions: BomConsumption[]
  contradictions: QuantityObservation[][]
} {
  const observations: QuantityObservation[] = []
  for (const groupedLine of logical.lines) {
    for (const item of groupedLine.evidence) {
      const profile = item.line.technicalMetadata?.material_profile
      if (!profile) continue
      const configuration = item.snapshot.skuColorCode ? colorConfigurations.get(item.snapshot.skuColorCode) : undefined
      const colorMode = asColorMode(configuration)
      const semanticScope = logical.scope === 'NA' ? null : logical.scope
      const scope = colorMode === 'full'
        ? 'full_product'
        : semanticScope && semanticScope !== 'full_product'
          ? semanticScope
          : null
      if (!scope) continue
      observations.push({
        colorMode,
        scope,
        profile,
        formatKey: item.line.technicalMetadata?.format_key ?? null,
        qty: item.line.qty,
        skuComplete: item.snapshot.skuComplete,
      })
    }
  }

  const observationByKey = new Map<string, QuantityObservation[]>()
  const maxQtyByModeAndScope = new Map<string, number>()
  for (const observation of observations) {
    const key = [observation.colorMode, observation.scope, observation.profile].join('|')
    const values = observationByKey.get(key) ?? []
    values.push(observation)
    observationByKey.set(key, values)
    const modeAndScopeKey = [observation.colorMode, observation.scope].join('|')
    maxQtyByModeAndScope.set(modeAndScopeKey, Math.max(maxQtyByModeAndScope.get(modeAndScopeKey) ?? 0, observation.qty))
  }

  const contradictions: QuantityObservation[][] = []
  const consumptions: BomConsumption[] = []
  for (const values of [...observationByKey.values()]) {
    const representative = values[0]
    if (!representative) continue
    const valuesByPhysicalKey = new Map<string, QuantityObservation[]>()
    for (const value of values) {
      const physicalKey = [value.skuComplete, value.profile, value.formatKey ?? 'none'].join('|')
      valuesByPhysicalKey.set(physicalKey, [...(valuesByPhysicalKey.get(physicalKey) ?? []), value])
    }
    const physicalContradictions = [...valuesByPhysicalKey.values()]
      .filter(physicalValues => !allSameNumber(physicalValues.map(value => value.qty)))
    contradictions.push(...physicalContradictions)
    consumptions.push({
      color_mode: representative.colorMode,
      product_application_scope: representative.scope,
      material_profile: representative.profile,
      format_key: null,
      qty: maxQtyByModeAndScope.get([representative.colorMode, representative.scope].join('|')) ?? null,
      status: 'observed',
    })
  }

  return { consumptions, contradictions }
}

function issueMethodAssessment(evidence: LineEvidence[]): {
  proposed: string | null
  isTie: boolean
  hasVariation: boolean
  majoritySkus: string[]
  minoritySkus: string[]
} {
  const counts = new Map<string, string[]>()
  for (const item of evidence) {
    const method = item.line.issueMethod?.trim() ?? ''
    if (!method) continue
    const skus = counts.get(method) ?? []
    skus.push(item.snapshot.skuComplete)
    counts.set(method, skus)
  }
  const sorted = [...counts.entries()].sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
  const winner = sorted[0]
  const isTie = Boolean(winner && sorted[1] && winner[1].length === sorted[1][1].length)
  const proposed = winner && !isTie ? winner[0] : null
  return {
    proposed,
    isTie,
    hasVariation: sorted.length > 1,
    majoritySkus: proposed ? winner?.[1] ?? [] : [],
    minoritySkus: proposed ? sorted.slice(1).flatMap(([, skus]) => skus) : [],
  }
}

function fixedProposedLine(input: {
  line: NormalizedSapBomLine
  scope: ReferenceProductApplicationScope
  sortOrder: number
  qty: number
  uom: string | null
  warehouse: string | null
  issueMethod: string | null
}): ReferenceBomLine {
  return {
    line_id: `ln_${String(input.sortOrder).padStart(6, '0')}`,
    sort_order: input.sortOrder,
    line_kind: 'fixed',
    base_item_code: input.line.baseItemCode,
    product_application_scope: input.scope,
    qty: input.qty,
    uom: input.uom,
    input_warehouse_code: input.warehouse,
    issue_method_override: input.issueMethod,
    alternatives: [],
    consumptions: [],
  }
}

function materialProposedLine(input: {
  logical: LogicalEvidence
  warehouse: string | null
  uom: string | null
  issueMethod: string | null
  consumptions: BomConsumption[]
}): ReferenceBomLine {
  return {
    line_id: `ln_${String(input.logical.sortOrder).padStart(6, '0')}`,
    sort_order: input.logical.sortOrder,
    line_kind: 'material_group',
    base_item_code: null,
    product_application_scope: input.logical.scope,
    qty: null,
    uom: input.uom,
    input_warehouse_code: input.warehouse,
    issue_method_override: input.issueMethod,
    alternatives: input.logical.alternatives,
    consumptions: input.consumptions,
  }
}

function profileProposalFinding(input: {
  logical: LogicalEvidence
  sourceColorCode: string
  profile: MaterialProfile
  evidence: LineEvidence[]
}): ReferenceImportFindingDraft {
  return createFinding({
    findingKey: `material-profile:${input.logical.key}:${input.sourceColorCode}:${input.logical.scope}`,
    findingType: 'material_profile_proposal',
    severity: 'warning',
    lineIdentity: input.logical.key,
    baseItemCode: input.logical.alternatives[0]?.base_item_code ?? null,
    occurrence: null,
    proposedScope: input.logical.scope,
    proposedColorCode: input.sourceColorCode,
    detailsJson: {
      source_color_code: input.sourceColorCode,
      material_profile: input.profile,
      product_application_scope: input.logical.scope,
      alternatives: input.logical.alternatives,
      ...lineDetails(input.evidence),
    },
  })
}

export function analyzeReferenceBom(input: {
  context: ReferenceImportContext
  snapshots: DirectBomSnapshot[]
  colorConfigurations: Map<string, ColorConfiguration>
}): ReferenceImportAnalysis {
  const capturedSnapshots = input.snapshots.filter(snapshot => snapshot.status === 'captured')
  const failedSnapshots = input.snapshots.filter(snapshot => snapshot.status === 'failed')
  if (failedSnapshots.length > 0) {
    const findings = failedSnapshots.map(snapshot => createFinding({
      findingKey: `source:sap-bom:${snapshot.skuComplete}`,
      findingType: 'sap_bom_unavailable',
      severity: 'blocker',
      lineIdentity: null,
      baseItemCode: null,
      occurrence: null,
      proposedScope: null,
      proposedColorCode: null,
      detailsJson: { sku_complete: snapshot.skuComplete, error: snapshot.errorMessage },
    }))
    return {
      proposedBomStructure: {
        schema_version: 2,
        structure_type: capturedSnapshots.some(snapshot => snapshot.treeType === 'iSalesTree') ? 'sales_kit' : 'production',
        input_warehouse_code: null,
        output_warehouse_code: null,
        lines: [],
      },
      findings,
      summaryJson: {
        captured_sku_count: capturedSnapshots.length,
        failed_sku_count: failedSnapshots.length,
        source_analysis_complete: false,
        proposed_line_count: 0,
        blocker_count: findings.length,
        warning_count: 0,
      },
    }
  }

  const evidenceByIdentity = new Map<string, LineEvidence[]>()
  for (const snapshot of capturedSnapshots) {
    for (const line of consolidatedSnapshotLines(snapshot)) {
      const evidence = evidenceByIdentity.get(line.lineIdentity) ?? []
      evidence.push({ snapshot, line })
      evidenceByIdentity.set(line.lineIdentity, evidence)
    }
  }

  const logicalLines = findLogicalEvidence(
    evidenceByIdentity,
    capturedSnapshots.length,
    input.colorConfigurations,
    input.context
  )
  const findings: ReferenceImportFindingDraft[] = []
  const proposals: ReferenceBomLine[] = []

  for (const logical of logicalLines) {
    const evidence = logical.lines.flatMap(group => group.evidence)
    const primary = evidence[0]?.line
    if (!primary) continue
    const presentSkuCodes = new Set(evidence.map(item => item.snapshot.skuComplete))
    const absentSkuCodes = capturedSnapshots
      .map(snapshot => snapshot.skuComplete)
      .filter(skuComplete => !presentSkuCodes.has(skuComplete))
    const warehouse = mostCommonString(evidence.map(item => item.line.warehouse))
    const uom = mostCommonString(evidence.map(item => item.line.inventoryUom))
    const issueMethod = issueMethodAssessment(evidence)

    if (logical.isMaterialGroup) {
      const { consumptions, contradictions } = buildConsumptions(logical, input.colorConfigurations)
      proposals.push(materialProposedLine({ logical, warehouse, uom, issueMethod: issueMethod.proposed, consumptions }))
      findings.push(createFinding({
        findingKey: `material-group:${logical.key}`,
        findingType: 'material_group_confirmation',
        severity: 'info',
        lineIdentity: logical.key,
        baseItemCode: logical.alternatives[0]?.base_item_code ?? null,
        occurrence: null,
        proposedScope: logical.scope,
        proposedColorCode: null,
        detailsJson: {
          message: 'Estas alternativas representan una sola posicion logica y deben confirmarse antes de publicar.',
          alternatives: logical.alternatives,
          ...lineDetails(evidence),
        },
      }))
      for (const contradiction of contradictions) {
        findings.push(createFinding({
          findingKey: `material-consumption:${logical.key}:${contradiction[0]?.colorMode}:${contradiction[0]?.scope}:${contradiction[0]?.profile}:${contradiction[0]?.formatKey ?? 'none'}`,
          findingType: 'material_consumption_conflict',
          severity: 'blocker',
          lineIdentity: logical.key,
          baseItemCode: logical.alternatives[0]?.base_item_code ?? null,
          occurrence: null,
          proposedScope: contradiction[0]?.scope ?? null,
          proposedColorCode: null,
          detailsJson: {
            message: 'La misma clave física de SKU, uso, perfil y formato tiene consumos incompatibles.',
            observations: contradiction.map(item => ({
              sku_complete: item.skuComplete,
              qty: item.qty,
              format_key: item.formatKey,
              material_profile: item.profile,
            })),
          },
        }))
      }

      for (const item of evidence) {
        const colorCode = item.snapshot.skuColorCode
        const profile = item.line.technicalMetadata?.material_profile
        if (!colorCode || !profile) continue
        const configuration = input.colorConfigurations.get(colorCode)
        if (!configuration || !isColorApplicable(configuration, input.context)) continue
        const configuredProfile = configuration.applicationMaterialProfiles[logical.scope]
          ?? configuration.applicationMaterialProfiles.full_product
        if (configuredProfile !== profile) {
          findings.push(profileProposalFinding({
            logical,
            sourceColorCode: colorCode,
            profile,
            evidence: [item],
          }))
        }
      }
    } else {
      const quantities = evidence.map(item => item.line.qty)
      const lineScope = logical.scope
      proposals.push(fixedProposedLine({
        line: primary,
        scope: lineScope,
        sortOrder: logical.sortOrder,
        qty: mostCommonNumber(quantities),
        uom,
        warehouse,
        issueMethod: issueMethod.proposed,
      }))
      const absentSkusHaveConfiguredColor = absentSkuCodes.every((skuComplete) => {
        const colorCode = skuComplete.split('-')[3]
        const configuration = colorCode ? input.colorConfigurations.get(colorCode) : undefined
        if (!configuration) return false
        const mappedScope = configuredScopeForColor(configuration, lineScope)
        return Boolean(configuration.applicationColors[mappedScope] ?? configuration.applicationColors.full_product)
      })
      const hasStructuralVariation = (absentSkuCodes.length > 0 && !absentSkusHaveConfiguredColor)
        || !allSameNumber(quantities)
        || !allSameText(evidence.map(item => item.line.warehouse))
      const configuredColor = lineUsesConfiguredColor(evidence, lineScope, input.colorConfigurations, input.context)
      const unresolvedColorEvidence = evidence.filter(item => !evidenceUsesConfiguredColor(
        item,
        lineScope,
        input.colorConfigurations,
        input.context
      ))
      const hasColorVariation = unresolvedColorEvidence.some(item => {
        const skuColorCode = item.snapshot.skuColorCode
        return skuColorCode && item.line.variantCode4 !== '0000' && item.line.variantCode4 !== skuColorCode
      })
      if (hasStructuralVariation || (hasColorVariation && !configuredColor)) {
        findings.push(createFinding({
          findingKey: `business-review:${logical.key}`,
          findingType: 'bom_line_review',
          severity: 'blocker',
          lineIdentity: logical.key,
          baseItemCode: primary.baseItemCode,
          occurrence: primary.occurrence,
          proposedScope: lineScope,
          proposedColorCode: null,
          detailsJson: {
            message: 'Esta pieza tiene una diferencia de color, presencia, cantidad o bodega que necesita una regla explicita o una correccion en SAP.',
            absent_skus: absentSkuCodes,
            configured_color_mapping_recognized: configuredColor,
            ...lineDetails(hasStructuralVariation ? evidence : unresolvedColorEvidence),
          },
        }))
      }

      if (!configuredColor && hasColorVariation) {
        const targetBySkuColor = new Map<string, Set<string>>()
        for (const item of evidence) {
          const colorCode = item.snapshot.skuColorCode
          if (!colorCode || item.line.variantCode4 === colorCode || item.line.variantCode4 === '0000') continue
          const targets = targetBySkuColor.get(colorCode) ?? new Set<string>()
          targets.add(item.line.variantCode4)
          targetBySkuColor.set(colorCode, targets)
        }
        for (const [sourceColorCode, targets] of targetBySkuColor) {
          if (targets.size !== 1) continue
          const sourceEvidence = evidence.filter(item => item.snapshot.skuColorCode === sourceColorCode)
          if (lineUsesConfiguredColor(sourceEvidence, lineScope, input.colorConfigurations, input.context)) continue
          const targetColorCode = [...targets][0]
          findings.push(createFinding({
            findingKey: `color-rule:${logical.key}:${sourceColorCode}:${lineScope}:${targetColorCode}`,
            findingType: 'color_rule_proposal',
            severity: 'warning',
            lineIdentity: logical.key,
            baseItemCode: primary.baseItemCode,
            occurrence: primary.occurrence,
            proposedScope: lineScope,
            proposedColorCode: targetColorCode,
            detailsJson: {
              source_color_code: sourceColorCode,
              target_color_code: targetColorCode,
              ...lineDetails(evidence.filter(item => item.snapshot.skuColorCode === sourceColorCode)),
            },
          }))
        }
      }
    }

    if (issueMethod.hasVariation) {
      findings.push(createFinding({
        findingKey: `issue-method:${logical.key}`,
        findingType: 'issue_method_review',
        severity: 'warning',
        lineIdentity: logical.key,
        baseItemCode: logical.isMaterialGroup ? logical.alternatives[0]?.base_item_code ?? null : primary.baseItemCode,
        occurrence: primary.occurrence,
        proposedScope: logical.scope,
        proposedColorCode: null,
        detailsJson: {
          message: issueMethod.isTie
            ? 'No hay una mayoria para proponer el metodo de salida.'
            : `La mayoria usa ${issueMethod.proposed}; los SKU minoritarios pueden homologarse en SAP tras confirmar.`,
          proposed_issue_method: issueMethod.proposed,
          majority_skus: issueMethod.majoritySkus,
          minority_skus: issueMethod.minoritySkus,
          is_tie: issueMethod.isTie,
          ...lineDetails(evidence),
        },
      }))
    }
  }

  const uniqueFindings = [...new Map(findings.map(finding => [finding.findingKey, finding])).values()]
  const orderedProposals = proposals
    .sort((left, right) => left.sort_order - right.sort_order || left.line_id.localeCompare(right.line_id))
    .map((line, index) => ({
      ...line,
      line_id: `ln_${String(index + 1).padStart(6, '0')}`,
      sort_order: index + 1,
    }))
  const blockerCount = uniqueFindings.filter(finding => finding.severity === 'blocker' && finding.status === 'open').length
  const warningCount = uniqueFindings.filter(finding => finding.severity === 'warning' && finding.status === 'open').length

  return {
    proposedBomStructure: {
      schema_version: 2,
      structure_type: capturedSnapshots.some(snapshot => snapshot.treeType === 'iSalesTree') ? 'sales_kit' : 'production',
      input_warehouse_code: null,
      output_warehouse_code: null,
      lines: orderedProposals,
    },
    findings: uniqueFindings,
    summaryJson: {
      captured_sku_count: capturedSnapshots.length,
      failed_sku_count: 0,
      source_analysis_complete: true,
      proposed_line_count: orderedProposals.length,
      technical_line_count: evidenceByIdentity.size,
      material_group_count: logicalLines.filter(line => line.isMaterialGroup).length,
      blocker_count: blockerCount,
      warning_count: warningCount,
    },
  }
}
