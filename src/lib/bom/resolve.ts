import { buildSapItemCode } from './sapMapping'
import type {
  BomColorMode,
  BomColorOverride,
  BomConsumption,
  BomMaterialAlternative,
  BomOverrideOperation,
  BomOverrides,
  BomStructure,
  BomStructureLine,
  Colorway,
  ComponentItem,
  HybridColorCase,
  MaterialProfile,
  ProductApplicationScope,
  ResolvedBomLine,
} from './types'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function normalizeScope(value: unknown): ProductApplicationScope {
  const normalized = stringValue(value)
  if (
    normalized === 'full_product'
    || normalized === 'front'
    || normalized === 'structure'
    || normalized === 'inner_structure'
    || normalized === 'drawer_bottom'
    || normalized === 'edge_band_full_product'
    || normalized === 'edge_band_body'
    || normalized === 'edge_band_front'
    || normalized === 'edge_band_inner'
    || normalized === 'edge_band_drawer_bottom'
    || normalized === 'NA'
  ) return normalized
  return 'NA'
}

function normalizeColorMode(value: unknown): BomColorMode {
  return value === 'dual' || value === 'balance' ? value : 'full'
}

function normalizeAlternatives(value: unknown): BomMaterialAlternative[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((alternative, index) => {
    const record = asRecord(alternative)
    const baseItemCode = stringValue(record.base_item_code)
    const materialProfile = stringValue(record.material_profile)
    if (!baseItemCode || !materialProfile) return []
    return [{
      alternative_id: stringValue(record.alternative_id) ?? `alt_${String(index + 1).padStart(2, '0')}`,
      base_item_code: baseItemCode,
      material_profile: materialProfile,
      is_default: record.is_default === true,
    }]
  })
}

function normalizeConsumptions(value: unknown): BomConsumption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((consumption) => {
    const record = asRecord(consumption)
    const materialProfile = stringValue(record.material_profile)
    const scope = normalizeScope(record.product_application_scope)
    if (!materialProfile || scope === 'NA' && record.product_application_scope !== 'NA') return []
    const rawStatus = record.status
    const status: BomConsumption['status'] = rawStatus === 'confirmed' || rawStatus === 'observed'
      ? rawStatus
      : 'needs_definition'
    return [{
      color_mode: normalizeColorMode(record.color_mode),
      product_application_scope: scope,
      material_profile: materialProfile,
      format_key: stringValue(record.format_key),
      qty: record.qty === null || record.qty === undefined ? null : numberValue(record.qty, Number.NaN),
      status,
    }].filter(consumption => consumption.qty === null || !Number.isNaN(consumption.qty))
  })
}

function normalizeLine(value: unknown, index: number): BomStructureLine | null {
  const record = asRecord(value)
  const lineKind = record.line_kind === 'material_group' ? 'material_group' : 'fixed'
  const baseItemCode = stringValue(record.base_item_code)
  const alternatives = normalizeAlternatives(record.alternatives)
  if (lineKind === 'fixed' && !baseItemCode) return null
  if (lineKind === 'material_group' && alternatives.length === 0) return null
  return {
    line_id: stringValue(record.line_id) ?? `ln_${String(index + 1).padStart(6, '0')}`,
    sort_order: numberValue(record.sort_order, index + 1),
    line_kind: lineKind,
    base_item_code: lineKind === 'fixed' ? baseItemCode : null,
    product_application_scope: normalizeScope(record.product_application_scope),
    qty: lineKind === 'fixed' ? numberValue(record.qty) : null,
    uom: stringValue(record.uom),
    input_warehouse_code: stringValue(record.input_warehouse_code),
    issue_method_override: stringValue(record.issue_method_override),
    alternatives,
    consumptions: normalizeConsumptions(record.consumptions),
  }
}

export function normalizeBomStructure(value: unknown): BomStructure {
  const record = asRecord(value)
  const rawLines = Array.isArray(record.lines) ? record.lines : []
  return {
    schema_version: 2,
    structure_type: record.structure_type === 'sales_kit' || record.structure_type === 'component'
      ? record.structure_type
      : 'production',
    input_warehouse_code: stringValue(record.input_warehouse_code),
    output_warehouse_code: stringValue(record.output_warehouse_code),
    lines: rawLines
      .map(normalizeLine)
      .filter((line): line is BomStructureLine => line !== null)
      .sort((left, right) => left.sort_order - right.sort_order || left.line_id.localeCompare(right.line_id)),
  }
}

export function normalizeBomOverrides(value: unknown): BomOverrides {
  const record = asRecord(value)
  const rawOperations = Array.isArray(record.operations) ? record.operations : []
  const rawColorOverrides = Array.isArray(record.color_overrides) ? record.color_overrides : []
  const colorOverrides = rawColorOverrides.flatMap((override, index) => {
    const overrideRecord = asRecord(override)
    const colorCode = stringValue(overrideRecord.color_code)
    const scope = normalizeScope(overrideRecord.product_application_scope)
    const reason = stringValue(overrideRecord.reason)
    if (!colorCode || !reason || scope === 'NA' && overrideRecord.product_application_scope !== 'NA') return []
    return [{
      override_id: stringValue(overrideRecord.override_id) ?? `color_override_${index + 1}`,
      color_code: colorCode,
      product_application_scope: scope,
      base_item_code: stringValue(overrideRecord.base_item_code),
      target_color_code: stringValue(overrideRecord.target_color_code),
      material_profile: stringValue(overrideRecord.material_profile),
      reason,
      source: (overrideRecord.source === 'reference_import' ? 'reference_import' : 'manual') as BomColorOverride['source'],
      actor_id: stringValue(overrideRecord.actor_id),
      created_at: stringValue(overrideRecord.created_at),
    }]
  })
  return {
    schema_version: 2,
    operations: rawOperations.map((operation, index) => {
      const opRecord = asRecord(operation)
      const newLine = opRecord.new_line ? asRecord(opRecord.new_line) : null
      return {
        operation_id: stringValue(opRecord.operation_id) ?? `op_${index + 1}`,
        operation_type: opRecord.operation_type === 'add_line' || opRecord.operation_type === 'remove_line'
          ? opRecord.operation_type
          : 'replace_line',
        target_line_id: stringValue(opRecord.target_line_id),
        target_base_item_code: stringValue(opRecord.target_base_item_code),
        target_product_application_scope: opRecord.target_product_application_scope
          ? normalizeScope(opRecord.target_product_application_scope)
          : null,
        new_line: newLine ? normalizeLine(newLine, index) ?? undefined : null,
        reason: stringValue(opRecord.reason),
        source: stringValue(opRecord.source),
        actor_id: stringValue(opRecord.actor_id),
        created_at: stringValue(opRecord.created_at),
      }
    }),
    color_overrides: colorOverrides,
  }
}

function matchesOperationTarget(line: BomStructureLine, operation: BomOverrideOperation): boolean {
  if (operation.target_line_id && operation.target_line_id === line.line_id) return true
  if (!operation.target_base_item_code) return false
  if (operation.target_base_item_code !== line.base_item_code) return false
  if (!operation.target_product_application_scope) return true
  return operation.target_product_application_scope === line.product_application_scope
}

function mergeLine(line: BomStructureLine, patch: Partial<BomStructureLine> | null | undefined): BomStructureLine {
  if (!patch) return line
  return {
    ...line,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined && !(typeof value === 'number' && Number.isNaN(value)))
    ),
  }
}

export function applyBomOverrides(structure: BomStructure, ...layers: BomOverrides[]): BomStructure {
  const operations = layers.flatMap(layer => layer.operations)
  const result: BomStructureLine[] = []
  for (const baseLine of structure.lines) {
    const shouldRemove = operations.some(operation =>
      operation.operation_type === 'remove_line' && matchesOperationTarget(baseLine, operation)
    )
    if (shouldRemove) continue
    const replacement = operations
      .filter(operation => operation.operation_type === 'replace_line' && matchesOperationTarget(baseLine, operation))
      .at(-1)
    result.push(mergeLine(baseLine, replacement?.new_line))
  }

  const maxSortOrder = result.reduce((max, line) => Math.max(max, line.sort_order), 0)
  operations
    .filter(operation => operation.operation_type === 'add_line' && operation.new_line)
    .forEach((operation, index) => {
      const newLine = operation.new_line
      if (!newLine) return
      result.push({
        ...newLine,
        line_id: newLine.line_id ?? `added_${operation.operation_id}`,
        sort_order: Number.isFinite(newLine.sort_order) ? Number(newLine.sort_order) : maxSortOrder + ((index + 1) * 10),
        line_kind: newLine.line_kind ?? 'fixed',
        base_item_code: newLine.base_item_code ?? null,
        product_application_scope: newLine.product_application_scope ?? 'NA',
        qty: newLine.line_kind === 'material_group' ? null : (Number.isFinite(newLine.qty) ? Number(newLine.qty) : 1),
        input_warehouse_code: newLine.input_warehouse_code ?? null,
        issue_method_override: newLine.issue_method_override ?? null,
        alternatives: newLine.alternatives ?? [],
        consumptions: newLine.consumptions ?? [],
      })
    })

  return {
    ...structure,
    lines: result.sort((left, right) => left.sort_order - right.sort_order || left.line_id.localeCompare(right.line_id)),
  }
}

function hybridColorCasesForSku(input: {
  colorway: Colorway | null
  skuComplete: string
  skuColorCode: string | null
}): HybridColorCase[] {
  if (!input.colorway || input.skuColorCode !== input.colorway.code_4dig) return []
  const normalizedSkuComplete = input.skuComplete.trim().toUpperCase()
  return input.colorway.hybrid_color_cases?.filter(hybridCase =>
    hybridCase.sku_completes.includes(normalizedSkuComplete)
  ) ?? []
}

function effectiveScope(
  colorway: Colorway | null,
  scope: ProductApplicationScope,
  colorMode: BomColorMode
): ProductApplicationScope {
  if (
    (colorMode === 'full' || colorway?.color_mode === 'equivalent')
    && scope.startsWith('edge_band_')
  ) {
    return 'edge_band_full_product'
  }
  return scope
}

function matchingColorOverride(input: {
  layers: BomOverrides[]
  skuColorCode: string | null
  scope: ProductApplicationScope
  baseItemCode: string
}): BomColorOverride | null {
  if (!input.skuColorCode) return null
  const matches = input.layers.flatMap(layer => layer.color_overrides ?? [])
    .filter(override =>
      override.color_code === input.skuColorCode
      && override.product_application_scope === input.scope
      && (!override.base_item_code || override.base_item_code === input.baseItemCode)
    )
  return matches.at(-1) ?? null
}

function resolveVariant(input: {
  colorway: Colorway | null
  hybridColorCase: HybridColorCase | null
  colorMode: BomColorMode
  scope: ProductApplicationScope
  skuColorCode: string | null
  colorOverride: BomColorOverride | null
}): string {
  const { colorway, hybridColorCase, colorMode, scope, skuColorCode, colorOverride } = input
  if (scope === 'NA') return '0000'
  if (colorOverride?.target_color_code) return colorOverride.target_color_code
  const configuredScope = effectiveScope(colorway, scope, colorMode)
  return hybridColorCase?.application_colors[configuredScope]
    ?? hybridColorCase?.application_colors[scope]
    ?? colorway?.application_colors_json[configuredScope]
    ?? colorway?.application_colors_json.full_product
    ?? skuColorCode
    ?? '0000'
}

function resolveMaterialProfile(
  colorway: Colorway | null,
  hybridColorCase: HybridColorCase | null,
  scope: ProductApplicationScope,
  colorOverride: BomColorOverride | null,
  colorMode: BomColorMode
): MaterialProfile | null {
  if (colorOverride?.material_profile) return colorOverride.material_profile
  const configuredScope = effectiveScope(colorway, scope, colorMode)
  return hybridColorCase?.application_material_profiles?.[configuredScope]
    ?? hybridColorCase?.application_material_profiles?.[scope]
    ?? colorway?.application_material_profiles_json[configuredScope]
    ?? colorway?.application_material_profiles_json.full_product
    ?? null
}

function requiredScopes(colorMode: BomColorMode): ProductApplicationScope[] {
  if (colorMode === 'dual') return ['structure', 'front']
  if (colorMode === 'balance') return ['structure', 'front', 'inner_structure']
  return ['full_product']
}

function materialGroupScopes(line: BomStructureLine, colorMode: BomColorMode): ProductApplicationScope[] {
  return line.product_application_scope !== 'full_product' && line.product_application_scope !== 'NA'
    ? [line.product_application_scope]
    : requiredScopes(colorMode)
}

function hasBoardDualSkuOverrides(input: {
  skuOverrides: BomOverrides
  skuColorCode: string | null
}): boolean {
  if (!input.skuColorCode) return false
  const scopes = new Set((input.skuOverrides.color_overrides ?? [])
    .filter(override => override.color_code === input.skuColorCode)
    .map(override => override.product_application_scope))
  return scopes.has('structure') && scopes.has('front')
}

function selectedAlternative(
  line: BomStructureLine,
  materialProfile: MaterialProfile | null
): BomMaterialAlternative | null {
  if (materialProfile) {
    return line.alternatives.find(alternative => alternative.material_profile === materialProfile) ?? null
  }
  return line.alternatives.find(alternative => alternative.is_default) ?? null
}

function boardAlternativeFromComponents(input: {
  materialProfile: MaterialProfile | null
  variantCode: string
  componentItems: Map<string, ComponentItem>
}): BomMaterialAlternative | null {
  if (!input.materialProfile) return null
  const candidates = [...input.componentItems.values()]
    .filter(component =>
      component.technical_metadata?.material_kind === 'board'
      && component.technical_metadata.material_profile === input.materialProfile
      && (component.variant_code_4 === input.variantCode || component.variant_code_4 === '0000')
    )
  const baseItemCodes = [...new Set(candidates.map(component => component.base_item_code))]
  if (baseItemCodes.length !== 1) return null
  return {
    alternative_id: `derived_${input.materialProfile}`,
    base_item_code: baseItemCodes[0] ?? '',
    material_profile: input.materialProfile,
    is_default: false,
  }
}

function materialGroupIsBoard(
  line: BomStructureLine,
  componentItems: Map<string, ComponentItem>
): boolean {
  const baseItemCodes = new Set(line.alternatives.map(alternative => alternative.base_item_code))
  return [...componentItems.values()].some(component =>
    baseItemCodes.has(component.base_item_code)
    && component.technical_metadata?.material_kind === 'board'
  )
}

function matchingBoardProfileCondition(input: {
  colorway: Colorway | null
  hybridColorCase: HybridColorCase | null
  colorMode: BomColorMode
  scope: ProductApplicationScope
  baselineProfile: MaterialProfile | null
  isBoardMaterial: boolean
}) {
  if (
    !input.colorway
    || input.hybridColorCase
    || input.colorMode !== 'full'
    || input.scope !== 'full_product'
    || !input.baselineProfile
    || !input.isBoardMaterial
  ) return null
  const baselineProfile = input.baselineProfile.trim().toUpperCase()
  return input.colorway.board_profile_conditions?.find(rule =>
    rule.product_application_scope === 'full_product'
    && rule.source_material_profile.trim().toUpperCase() === baselineProfile
  ) ?? null
}

function resolveComponent(
  baseItemCode: string,
  variantCode: string,
  componentItems: Map<string, ComponentItem>
): ComponentItem | null {
  return componentItems.get(buildSapItemCode(baseItemCode, variantCode))
    ?? componentItems.get(buildSapItemCode(baseItemCode, '0000'))
    ?? null
}

function selectedConsumption(input: {
  line: BomStructureLine
  colorMode: BomColorMode
  scope: ProductApplicationScope
  profile: MaterialProfile
  formatKey: string | null
}): BomConsumption | null {
  const matching = input.line.consumptions.filter(consumption =>
    consumption.color_mode === input.colorMode
    && consumption.product_application_scope === input.scope
    && consumption.material_profile === input.profile
  )
  const exactMatch = matching.find(consumption => consumption.format_key === input.formatKey)
    ?? matching.find(consumption => consumption.format_key === null)
  if (exactMatch) return exactMatch
  if (input.colorMode !== 'full' || input.scope === 'full_product') return null
  const fullProductMatching = input.line.consumptions.filter(consumption =>
    consumption.color_mode === 'full'
    && consumption.product_application_scope === 'full_product'
    && consumption.material_profile === input.profile
  )
  return fullProductMatching.find(consumption => consumption.format_key === input.formatKey)
    ?? fullProductMatching.find(consumption => consumption.format_key === null)
    ?? null
}

export function resolveBomForSku(input: {
  skuComplete: string
  skuColorCode: string | null
  structure: BomStructure
  referenceOverrides?: BomOverrides
  globalOverrides: BomOverrides
  versionOverrides: BomOverrides
  skuOverrides?: BomOverrides
  colorway: Colorway | null
  componentItems: Map<string, ComponentItem>
}): ResolvedBomLine[] {
  const effective = applyBomOverrides(
    input.structure,
    input.referenceOverrides ?? { schema_version: 2, operations: [] },
    input.globalOverrides,
    input.versionOverrides,
    input.skuOverrides ?? { schema_version: 2, operations: [] }
  )
  const hybridColorCases = hybridColorCasesForSku({
    colorway: input.colorway,
    skuComplete: input.skuComplete,
    skuColorCode: input.skuColorCode,
  })
  const genericHybridColorCase = hybridColorCases.find(hybridCase => !hybridCase.material_kind) ?? null
  const boardHybridColorCase = hybridColorCases.find(hybridCase => hybridCase.material_kind === 'board') ?? null
  const colorMode = genericHybridColorCase?.color_mode
    ?? (input.colorway?.color_mode === 'dual' || input.colorway?.color_mode === 'balance'
      ? input.colorway.color_mode
      : 'full')

  return effective.lines.flatMap((line) => {
    if (line.line_kind === 'fixed') {
      const baseItemCode = line.base_item_code
      if (!baseItemCode) return []
      const colorOverride = matchingColorOverride({
        layers: [
          input.referenceOverrides ?? { schema_version: 2, operations: [] },
          input.globalOverrides,
          input.versionOverrides,
          input.skuOverrides ?? { schema_version: 2, operations: [] },
        ],
        skuColorCode: input.skuColorCode,
        scope: line.product_application_scope,
        baseItemCode,
      })
      const variantCode = resolveVariant({
        colorway: input.colorway,
        hybridColorCase: genericHybridColorCase,
        colorMode,
        scope: line.product_application_scope,
        skuColorCode: input.skuColorCode,
        colorOverride,
      })
      const component = resolveComponent(baseItemCode, variantCode, input.componentItems)
      return [{
        sku_complete: input.skuComplete,
        line_id: line.line_id,
        level: 1,
        sort_order: line.sort_order,
        base_item_code: baseItemCode,
        resolved_item_code: component?.item_code ?? buildSapItemCode(baseItemCode, variantCode),
        resolved_item_name: component?.item_name ?? null,
        product_application_scope: line.product_application_scope,
        qty: line.qty ?? 0,
        uom: component?.uom ?? null,
        input_warehouse_code: line.input_warehouse_code ?? effective.input_warehouse_code,
        output_warehouse_code: effective.output_warehouse_code,
        issue_method: line.issue_method_override ?? component?.default_issue_method ?? null,
        resolution_status: component ? 'resolved' : 'missing_component_item',
        alternative_id: null,
        material_profile: null,
        format_key: component?.technical_metadata?.format_key ?? null,
      }]
    }

    const isBoardMaterial = materialGroupIsBoard(line, input.componentItems)
    const lineHybridColorCase = isBoardMaterial
      ? boardHybridColorCase ?? genericHybridColorCase
      : genericHybridColorCase
    const lineColorMode = lineHybridColorCase?.color_mode
      ?? (isBoardMaterial && hasBoardDualSkuOverrides({
        skuOverrides: input.skuOverrides ?? { schema_version: 2, operations: [] },
        skuColorCode: input.skuColorCode,
      }) ? 'dual' : colorMode)
    return materialGroupScopes(line, lineColorMode).map((scope) => {
      const fallbackBaseItemCode = line.alternatives[0]?.base_item_code ?? ''
      const colorOverride = matchingColorOverride({
        layers: [
          input.referenceOverrides ?? { schema_version: 2, operations: [] },
          input.globalOverrides,
          input.versionOverrides,
          input.skuOverrides ?? { schema_version: 2, operations: [] },
        ],
        skuColorCode: input.skuColorCode,
        scope,
        baseItemCode: fallbackBaseItemCode,
      })
      const configuredProfile = resolveMaterialProfile(input.colorway, lineHybridColorCase, scope, colorOverride, lineColorMode)
      // The color condition must inspect the material profile that remains
      // after reference, version and SKU overrides have shaped this line.
      // Colorway-level profiles are intentionally excluded here: they are the
      // result of the color rule, not its source condition.
      const effectiveSourceAlternative = selectedAlternative(line, colorOverride?.material_profile ?? null)
      const effectiveSourceProfile = colorOverride?.material_profile
        ?? effectiveSourceAlternative?.material_profile
        ?? null
      const boardProfileCondition = matchingBoardProfileCondition({
        colorway: input.colorway,
        hybridColorCase: lineHybridColorCase,
        colorMode: lineColorMode,
        scope,
        baselineProfile: effectiveSourceProfile,
        isBoardMaterial,
      })
      const profile = boardProfileCondition?.target_material_profile ?? configuredProfile
      const proposedVariantCode = boardProfileCondition?.target_color_code
        ?? resolveVariant({ colorway: input.colorway, hybridColorCase: lineHybridColorCase, colorMode: lineColorMode, scope, skuColorCode: input.skuColorCode, colorOverride })
      const alternative = selectedAlternative(line, profile)
        ?? (isBoardMaterial
          ? boardAlternativeFromComponents({
            materialProfile: profile,
            variantCode: proposedVariantCode,
            componentItems: input.componentItems,
          })
          : null)
      const resolvedProfile = profile ?? alternative?.material_profile ?? null
      const variantCode = alternative ? proposedVariantCode : '0000'
      const component = alternative
        ? resolveComponent(alternative.base_item_code, variantCode, input.componentItems)
        : null
      const consumption = alternative && resolvedProfile
        ? selectedConsumption({
            line,
            colorMode: lineColorMode,
            scope,
            profile: resolvedProfile,
            formatKey: component?.technical_metadata?.format_key ?? null,
          })
        : null
      const status = !profile || !alternative
        ? 'missing_material_profile'
        : !consumption || consumption.qty === null || consumption.status === 'needs_definition'
          ? 'missing_consumption'
          : !component
            ? 'missing_component_item'
            : 'resolved'
      const baseItemCode = alternative?.base_item_code ?? line.alternatives[0]?.base_item_code ?? ''
      return {
        sku_complete: input.skuComplete,
        line_id: `${line.line_id}:${scope}`,
        level: 1,
        sort_order: line.sort_order,
        base_item_code: baseItemCode,
        resolved_item_code: component?.item_code ?? buildSapItemCode(baseItemCode, variantCode),
        resolved_item_name: component?.item_name ?? null,
        product_application_scope: scope,
        qty: consumption?.qty ?? 0,
        uom: component?.uom ?? null,
        input_warehouse_code: line.input_warehouse_code ?? effective.input_warehouse_code,
        output_warehouse_code: effective.output_warehouse_code,
        issue_method: line.issue_method_override ?? component?.default_issue_method ?? null,
        resolution_status: status,
        alternative_id: alternative?.alternative_id ?? null,
        material_profile: resolvedProfile,
        format_key: component?.technical_metadata?.format_key ?? null,
      }
    })
  })
}
