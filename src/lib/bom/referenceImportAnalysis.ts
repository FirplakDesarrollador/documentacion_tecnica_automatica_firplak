import {
  type ColorConfiguration,
  type DirectBomSnapshot,
  type JsonRecord,
  type NormalizedSapBomLine,
  type ReferenceBomLine,
  type ReferenceBomStructure,
  type ReferenceImportAnalysis,
  type ReferenceImportContext,
  type ReferenceImportFindingDraft,
} from './referenceImportTypes'
import type { ReferenceProductApplicationScope } from './referenceImportScopes'

type LineEvidence = {
  snapshot: DirectBomSnapshot
  line: NormalizedSapBomLine
}

type ColorPattern =
  | 'primary_sku_color'
  | 'neutral_component'
  | 'constant_internal_color'
  | 'productive_scope_pattern'
  | 'variation_without_pattern'

type ScopeAssessment = {
  scope: ReferenceProductApplicationScope
  pattern: ColorPattern
  requiresHumanReview: boolean
}

type RuleProposal = {
  sourceColorCode: string
  targetColorCode: string
  scope: ReferenceProductApplicationScope
  lineIdentities: Set<string>
  baseItemCodes: Set<string>
}

const SCOPE_BY_BASE_ITEM_CODE: Record<string, ReferenceProductApplicationScope> = {
  'CMPD06-0030-000': 'drawer_bottom',
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
  return values.every(value => Math.abs(value - values[0]) < 0.000001)
}

function allSameText(values: Array<string | null>): boolean {
  return new Set(values.map(value => value?.trim() ?? '')).size <= 1
}

function skuVariantMap(evidence: LineEvidence[]): JsonRecord {
  const result: JsonRecord = {}
  for (const item of evidence) {
    result[item.snapshot.skuComplete] = item.line.variantCode4
  }
  return result
}

function scopeFromSemantics(line: NormalizedSapBomLine): ReferenceProductApplicationScope | null {
  const fromCode = SCOPE_BY_BASE_ITEM_CODE[line.baseItemCode]
  if (fromCode) return fromCode

  const name = normalizedText(line.itemName)
  if (name.includes('FONDO') && (name.includes('CAJON') || name.includes('DRAWER'))) return 'drawer_bottom'

  if (name.includes('CANTO')) {
    if (name.includes('FRENTE') || name.includes('PUERTA') || name.includes('FRONTAL')) return 'edge_band_front'
    if (name.includes('INTERIOR') || name.includes('INTERNA') || name.includes('CAJON')) return 'edge_band_inner'
    return 'edge_band_body'
  }

  if (name.includes('ESTRUCTURA') || name.includes('COSTADO') || name.includes('LATERAL')) return 'structure'
  if (name.includes('INTERIOR') || name.includes('INTERNA')) return 'inner_structure'
  if (name.includes('FRENTE') || name.includes('PUERTA') || name.includes('FRONTAL')) return 'front'

  return null
}

function assessScope(evidence: LineEvidence[]): ScopeAssessment {
  const variants = evidence.map(item => item.line.variantCode4)
  if (variants.every(variant => variant === '0000')) {
    return { scope: 'NA', pattern: 'neutral_component', requiresHumanReview: false }
  }

  if (evidence.every(item => item.snapshot.skuColorCode && item.line.variantCode4 === item.snapshot.skuColorCode)) {
    return { scope: 'full_product', pattern: 'primary_sku_color', requiresHumanReview: false }
  }

  const semanticScope = scopeFromSemantics(evidence[0].line)
  const variantsBySkuColor = new Map<string, Set<string>>()
  for (const item of evidence) {
    const skuColor = item.snapshot.skuColorCode
    if (!skuColor) return { scope: 'full_product', pattern: 'variation_without_pattern', requiresHumanReview: true }

    const variantsForColor = variantsBySkuColor.get(skuColor) ?? new Set<string>()
    variantsForColor.add(item.line.variantCode4)
    variantsBySkuColor.set(skuColor, variantsForColor)
  }

  if (!semanticScope || [...variantsBySkuColor.values()].some(variantsForColor => variantsForColor.size > 1)) {
    return { scope: 'full_product', pattern: 'variation_without_pattern', requiresHumanReview: true }
  }

  const internalVariants = evidence
    .filter(item => item.snapshot.skuColorCode && item.line.variantCode4 !== item.snapshot.skuColorCode && item.line.variantCode4 !== '0000')
    .map(item => item.line.variantCode4)

  if (internalVariants.length === 0 || evidence.some(item => item.line.variantCode4 === '0000')) {
    return { scope: 'full_product', pattern: 'variation_without_pattern', requiresHumanReview: true }
  }

  return {
    scope: semanticScope,
    pattern: new Set(internalVariants).size === 1 ? 'constant_internal_color' : 'productive_scope_pattern',
    requiresHumanReview: false,
  }
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
  return {
    ...input,
    status: input.status ?? 'open',
  }
}

function proposedLine(input: {
  line: NormalizedSapBomLine
  scope: ReferenceProductApplicationScope
  sortOrder: number
  qty: number
  warehouse: string | null
  issueMethod: string | null
}): ReferenceBomLine {
  return {
    line_id: `ln_${String(input.sortOrder).padStart(6, '0')}`,
    sort_order: input.sortOrder,
    base_item_code: input.line.baseItemCode,
    product_application_scope: input.scope,
    qty: input.qty,
    input_warehouse_code: input.warehouse,
    issue_method_override: input.issueMethod,
  }
}

function asLineDetails(evidence: LineEvidence[]): JsonRecord {
  return {
    by_sku: evidence.map(item => ({
      sku_complete: item.snapshot.skuComplete,
      sku_color_code: item.snapshot.skuColorCode,
      item_code: item.line.itemCode,
      qty: item.line.qty,
      warehouse: item.line.warehouse,
      issue_method: item.line.issueMethod,
      visible_order: item.line.sourceOrder,
      sap_child_num: item.line.sapChildNum,
    })),
  }
}

export function analyzeReferenceBom(input: {
  context: ReferenceImportContext
  snapshots: DirectBomSnapshot[]
  colorConfigurations: Map<string, ColorConfiguration>
}): ReferenceImportAnalysis {
  const findings: ReferenceImportFindingDraft[] = []
  const capturedSnapshots = input.snapshots.filter(snapshot => snapshot.status === 'captured')
  const failedSnapshots = input.snapshots.filter(snapshot => snapshot.status === 'failed')

  if (failedSnapshots.length > 0) {
    const sourceFindings = failedSnapshots.map(snapshot => createFinding({
      findingKey: `source:sap-bom:${snapshot.skuComplete}`,
      findingType: 'sap_bom_unavailable',
      severity: 'blocker',
      lineIdentity: null,
      baseItemCode: null,
      occurrence: null,
      proposedScope: null,
      proposedColorCode: null,
      detailsJson: {
        sku_complete: snapshot.skuComplete,
        error: snapshot.errorMessage,
      },
    }))

    return {
      proposedBomStructure: {
        schema_version: 1,
        structure_type: capturedSnapshots.some(snapshot => snapshot.treeType === 'iSalesTree') ? 'sales_kit' : 'production',
        input_warehouse_code: null,
        output_warehouse_code: null,
        lines: [],
      },
      findings: sourceFindings,
      summaryJson: {
        captured_sku_count: capturedSnapshots.length,
        failed_sku_count: failedSnapshots.length,
        source_analysis_complete: false,
        proposed_line_count: 0,
        blocker_count: sourceFindings.length,
        warning_count: 0,
        color_pattern_counts: {},
        target_color_codes: [],
      },
    }
  }

  const evidenceByIdentity = new Map<string, LineEvidence[]>()

  for (const snapshot of capturedSnapshots) {
    for (const line of snapshot.normalizedLines) {
      const evidence = evidenceByIdentity.get(line.lineIdentity) ?? []
      evidence.push({ snapshot, line })
      evidenceByIdentity.set(line.lineIdentity, evidence)
    }
  }

  const proposals: Array<{
    line: NormalizedSapBomLine
    consensusOrder: number
    scope: ReferenceProductApplicationScope
    qty: number
    warehouse: string | null
    issueMethod: string | null
  }> = []
  const ruleProposals = new Map<string, RuleProposal>()
  const targetCodes = new Set<string>()

  for (const [lineIdentity, evidence] of [...evidenceByIdentity.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const first = [...evidence].sort((left, right) => left.snapshot.skuComplete.localeCompare(right.snapshot.skuComplete))[0]
    const line = first.line
    const capturedSkuCodes = new Set(evidence.map(item => item.snapshot.skuComplete))
    const absentSkuCodes = capturedSnapshots
      .map(snapshot => snapshot.skuComplete)
      .filter(skuComplete => !capturedSkuCodes.has(skuComplete))

    if (absentSkuCodes.length > 0) {
      findings.push(createFinding({
        findingKey: `structure:presence:${lineIdentity}`,
        findingType: 'line_presence_conflict',
        severity: 'blocker',
        lineIdentity,
        baseItemCode: line.baseItemCode,
        occurrence: line.occurrence,
        proposedScope: null,
        proposedColorCode: null,
        detailsJson: {
          expected_sku_count: capturedSnapshots.length,
          present_skus: [...capturedSkuCodes].sort(),
          absent_skus: absentSkuCodes,
          ...asLineDetails(evidence),
        },
      }))
    }

    const quantities = evidence.map(item => item.line.qty)
    if (!allSameNumber(quantities)) {
      findings.push(createFinding({
        findingKey: `structure:quantity:${lineIdentity}`,
        findingType: 'line_quantity_conflict',
        severity: 'blocker',
        lineIdentity,
        baseItemCode: line.baseItemCode,
        occurrence: line.occurrence,
        proposedScope: null,
        proposedColorCode: null,
        detailsJson: asLineDetails(evidence),
      }))
    }

    const warehouses = evidence.map(item => item.line.warehouse)
    if (!allSameText(warehouses)) {
      findings.push(createFinding({
        findingKey: `structure:warehouse:${lineIdentity}`,
        findingType: 'line_warehouse_conflict',
        severity: 'blocker',
        lineIdentity,
        baseItemCode: line.baseItemCode,
        occurrence: line.occurrence,
        proposedScope: null,
        proposedColorCode: null,
        detailsJson: asLineDetails(evidence),
      }))
    }

    const issueMethods = evidence.map(item => item.line.issueMethod)
    if (!allSameText(issueMethods)) {
      findings.push(createFinding({
        findingKey: `diagnostic:issue-method:${lineIdentity}`,
        findingType: 'line_issue_method_variation',
        severity: 'warning',
        lineIdentity,
        baseItemCode: line.baseItemCode,
        occurrence: line.occurrence,
        proposedScope: null,
        proposedColorCode: null,
        detailsJson: asLineDetails(evidence),
      }))
    }

    const visibleOrders = evidence.map(item => item.line.sourceOrder)
    if (new Set(visibleOrders).size > 1) {
      findings.push(createFinding({
        findingKey: `diagnostic:order:${lineIdentity}`,
        findingType: 'line_visible_order_variation',
        severity: 'info',
        lineIdentity,
        baseItemCode: line.baseItemCode,
        occurrence: line.occurrence,
        proposedScope: null,
        proposedColorCode: null,
        detailsJson: asLineDetails(evidence),
      }))
    }

    const assessment = assessScope(evidence)
    findings.push(createFinding({
      findingKey: `color:pattern:${lineIdentity}`,
      findingType: 'color_pattern_classification',
      severity: assessment.requiresHumanReview ? 'blocker' : 'info',
      lineIdentity,
      baseItemCode: line.baseItemCode,
      occurrence: line.occurrence,
      proposedScope: assessment.scope,
      proposedColorCode: null,
      detailsJson: {
        classification: assessment.pattern,
        sku_variant_map: skuVariantMap(evidence),
      },
    }))

    if (assessment.requiresHumanReview) {
      findings.push(createFinding({
        findingKey: `color:unclassified:${lineIdentity}`,
        findingType: 'color_variation_without_pattern',
        severity: 'blocker',
        lineIdentity,
        baseItemCode: line.baseItemCode,
        occurrence: line.occurrence,
        proposedScope: null,
        proposedColorCode: null,
        detailsJson: {
          sku_variant_map: skuVariantMap(evidence),
          reason: 'No se pudo inferir un scope productivo global para la variacion SAP.',
        },
      }))
    } else if (assessment.scope !== 'NA' && assessment.scope !== 'full_product') {
      for (const item of evidence) {
        const sourceColorCode = item.snapshot.skuColorCode
        const targetColorCode = item.line.variantCode4
        if (!sourceColorCode || targetColorCode === '0000' || targetColorCode === sourceColorCode) continue

        const key = `${sourceColorCode}:${assessment.scope}:${targetColorCode}`
        const proposal = ruleProposals.get(key) ?? {
          sourceColorCode,
          targetColorCode,
          scope: assessment.scope,
          lineIdentities: new Set<string>(),
          baseItemCodes: new Set<string>(),
        }
        proposal.lineIdentities.add(lineIdentity)
        proposal.baseItemCodes.add(line.baseItemCode)
        ruleProposals.set(key, proposal)
        targetCodes.add(targetColorCode)
      }
    }

    proposals.push({
      line,
      consensusOrder: mostCommonNumber(visibleOrders),
      scope: assessment.scope,
      qty: mostCommonNumber(quantities),
      warehouse: mostCommonString(warehouses),
      issueMethod: allSameText(issueMethods) ? mostCommonString(issueMethods) : null,
    })
  }

  const targetsBySourceAndScope = new Map<string, Set<string>>()
  for (const proposal of ruleProposals.values()) {
    const key = `${proposal.sourceColorCode}:${proposal.scope}`
    const targets = targetsBySourceAndScope.get(key) ?? new Set<string>()
    targets.add(proposal.targetColorCode)
    targetsBySourceAndScope.set(key, targets)
  }

  for (const [key, targets] of targetsBySourceAndScope) {
    if (targets.size <= 1) continue
    const [sourceColorCode, scope] = key.split(':')
    findings.push(createFinding({
      findingKey: `color:scope-conflict:${key}`,
      findingType: 'color_scope_target_conflict',
      severity: 'blocker',
      lineIdentity: null,
      baseItemCode: null,
      occurrence: null,
      proposedScope: scope as ReferenceProductApplicationScope,
      proposedColorCode: null,
      detailsJson: {
        source_color_code: sourceColorCode,
        target_color_codes: [...targets].sort(),
        reason: 'Un mismo color base y scope no puede resolver a dos colores globales distintos.',
      },
    }))
  }

  for (const proposal of [...ruleProposals.values()].sort((left, right) => {
    const leftKey = `${left.sourceColorCode}:${left.scope}:${left.targetColorCode}`
    const rightKey = `${right.sourceColorCode}:${right.scope}:${right.targetColorCode}`
    return leftKey.localeCompare(rightKey)
  })) {
    const configuration = input.colorConfigurations.get(proposal.sourceColorCode)
    const scopeKey = `${proposal.sourceColorCode}:${proposal.scope}`
    const hasConflictingTarget = (targetsBySourceAndScope.get(scopeKey)?.size ?? 0) > 1
    const details: JsonRecord = {
      source_color_code: proposal.sourceColorCode,
      target_color_code: proposal.targetColorCode,
      scope: proposal.scope,
      line_identities: [...proposal.lineIdentities].sort(),
      base_item_codes: [...proposal.baseItemCodes].sort(),
    }

    if (!configuration) {
      findings.push(createFinding({
        findingKey: `color:source-missing:${proposal.sourceColorCode}:${proposal.scope}`,
        findingType: 'color_configuration_missing',
        severity: 'blocker',
        lineIdentity: null,
        baseItemCode: null,
        occurrence: null,
        proposedScope: proposal.scope,
        proposedColorCode: proposal.targetColorCode,
        detailsJson: details,
      }))
      continue
    }

    if (!input.colorConfigurations.has(proposal.targetColorCode)) {
      findings.push(createFinding({
        findingKey: `color:target-missing:${proposal.targetColorCode}`,
        findingType: 'target_color_configuration_missing',
        severity: 'warning',
        lineIdentity: null,
        baseItemCode: null,
        occurrence: null,
        proposedScope: proposal.scope,
        proposedColorCode: proposal.targetColorCode,
        detailsJson: details,
      }))
    }

    if (!isColorApplicable(configuration, input.context)) {
      findings.push(createFinding({
        findingKey: `color:applicability:${proposal.sourceColorCode}:${proposal.scope}`,
        findingType: 'color_context_applicability_warning',
        severity: 'warning',
        lineIdentity: null,
        baseItemCode: null,
        occurrence: null,
        proposedScope: proposal.scope,
        proposedColorCode: proposal.targetColorCode,
        detailsJson: {
          ...details,
          manufacturing_process: input.context.manufacturingProcess,
          product_type: input.context.productType,
          allowed_manufacturing_processes: configuration.allowedManufacturingProcesses,
          allowed_product_types: configuration.allowedProductTypes,
        },
      }))
    }

    const currentValue = configuration.applicationColors[proposal.scope] ?? null
    if (currentValue === proposal.targetColorCode) {
      findings.push(createFinding({
        findingKey: `color:existing:${proposal.sourceColorCode}:${proposal.scope}:${proposal.targetColorCode}`,
        findingType: 'color_mapping_already_matches',
        severity: 'info',
        status: 'resolved',
        lineIdentity: null,
        baseItemCode: null,
        occurrence: null,
        proposedScope: proposal.scope,
        proposedColorCode: proposal.targetColorCode,
        detailsJson: details,
      }))
      continue
    }

    findings.push(createFinding({
      findingKey: `color:proposal:${proposal.sourceColorCode}:${proposal.scope}:${proposal.targetColorCode}`,
      findingType: hasConflictingTarget ? 'color_scope_target_conflict_member' : 'color_rule_proposal',
      severity: 'blocker',
      lineIdentity: null,
      baseItemCode: null,
      occurrence: null,
      proposedScope: proposal.scope,
      proposedColorCode: proposal.targetColorCode,
      detailsJson: {
        ...details,
        current_scope_value: currentValue,
      },
    }))
  }

  const sortedProposals = proposals
    .sort((left, right) => left.consensusOrder - right.consensusOrder || left.line.lineIdentity.localeCompare(right.line.lineIdentity))
    .map((proposal, index) => proposedLine({
      ...proposal,
      sortOrder: index + 1,
    }))

  const structureType = capturedSnapshots.some(snapshot => snapshot.treeType === 'iSalesTree') ? 'sales_kit' : 'production'
  const proposedBomStructure: ReferenceBomStructure = {
    schema_version: 1,
    structure_type: structureType,
    input_warehouse_code: mostCommonString(sortedProposals.map(line => line.input_warehouse_code)),
    output_warehouse_code: structureType === 'sales_kit' ? 'PT-02' : 'PT-01',
    lines: sortedProposals,
  }

  const patternCounts = new Map<ColorPattern, number>()
  for (const finding of findings.filter(finding => finding.findingType === 'color_pattern_classification')) {
    const classification = finding.detailsJson.classification
    if (typeof classification !== 'string') continue
    patternCounts.set(classification as ColorPattern, (patternCounts.get(classification as ColorPattern) ?? 0) + 1)
  }

  return {
    proposedBomStructure,
    findings,
    summaryJson: {
      captured_sku_count: capturedSnapshots.length,
      failed_sku_count: 0,
      source_analysis_complete: true,
      proposed_line_count: sortedProposals.length,
      blocker_count: findings.filter(finding => finding.severity === 'blocker' && finding.status === 'open').length,
      warning_count: findings.filter(finding => finding.severity === 'warning' && finding.status === 'open').length,
      color_pattern_counts: Object.fromEntries(patternCounts.entries()),
      target_color_codes: [...targetCodes].sort(),
    },
  }
}
