import { buildSapItemCode } from './sapMapping'
import type {
  BomOverrideOperation,
  BomOverrides,
  BomStructure,
  BomStructureLine,
  Colorway,
  ComponentItem,
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
    || normalized === 'edge_band_body'
    || normalized === 'edge_band_front'
    || normalized === 'edge_band_inner'
    || normalized === 'edge_band_drawer_bottom'
    || normalized === 'NA'
  ) {
    return normalized
  }
  return 'NA'
}

export function normalizeBomStructure(value: unknown): BomStructure {
  const record = asRecord(value)
  const rawLines = Array.isArray(record.lines) ? record.lines : []

  return {
    schema_version: 1,
    structure_type: record.structure_type === 'sales_kit' || record.structure_type === 'component'
      ? record.structure_type
      : 'production',
    input_warehouse_code: stringValue(record.input_warehouse_code),
    output_warehouse_code: stringValue(record.output_warehouse_code),
    lines: rawLines.map((line, index) => {
      const lineRecord = asRecord(line)
      return {
        line_id: stringValue(lineRecord.line_id) ?? `ln_${String(index + 1).padStart(6, '0')}`,
        sort_order: numberValue(lineRecord.sort_order, (index + 1) * 10),
        base_item_code: stringValue(lineRecord.base_item_code) ?? '',
        product_application_scope: normalizeScope(lineRecord.product_application_scope),
        qty: numberValue(lineRecord.qty),
        input_warehouse_code: stringValue(lineRecord.input_warehouse_code),
        issue_method_override: stringValue(lineRecord.issue_method_override),
      }
    }).filter(line => line.base_item_code),
  }
}

export function normalizeBomOverrides(value: unknown): BomOverrides {
  const record = asRecord(value)
  const rawOperations = Array.isArray(record.operations) ? record.operations : []

  return {
    schema_version: 1,
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
        new_line: newLine
          ? {
              line_id: stringValue(newLine.line_id) ?? undefined,
              sort_order: newLine.sort_order === null ? undefined : numberValue(newLine.sort_order, Number.NaN),
              base_item_code: stringValue(newLine.base_item_code) ?? undefined,
              product_application_scope: newLine.product_application_scope
                ? normalizeScope(newLine.product_application_scope)
                : undefined,
              qty: newLine.qty === null ? undefined : numberValue(newLine.qty, Number.NaN),
              input_warehouse_code: stringValue(newLine.input_warehouse_code),
              issue_method_override: stringValue(newLine.issue_method_override),
            }
          : null,
        reason: stringValue(opRecord.reason),
      }
    }),
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

export function applyBomOverrides(
  structure: BomStructure,
  globalOverrides: BomOverrides,
  versionOverrides: BomOverrides
): BomStructure {
  const operations = [...globalOverrides.operations, ...versionOverrides.operations]
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
    .filter(operation => operation.operation_type === 'add_line' && operation.new_line?.base_item_code)
    .forEach((operation, index) => {
      const newLine = operation.new_line
      if (!newLine?.base_item_code) return

      result.push({
        line_id: newLine.line_id ?? `added_${operation.operation_id}`,
        sort_order: Number.isFinite(newLine.sort_order) ? Number(newLine.sort_order) : maxSortOrder + ((index + 1) * 10),
        base_item_code: newLine.base_item_code,
        product_application_scope: newLine.product_application_scope ?? 'NA',
        qty: Number.isFinite(newLine.qty) ? Number(newLine.qty) : 1,
        input_warehouse_code: newLine.input_warehouse_code ?? null,
        issue_method_override: newLine.issue_method_override ?? null,
      })
    })

  return {
    ...structure,
    lines: result.sort((a, b) => a.sort_order - b.sort_order || a.line_id.localeCompare(b.line_id)),
  }
}

function resolveVariant(colorway: Colorway | null, scope: ProductApplicationScope, skuColorCode: string | null): string {
  if (scope === 'NA') return '0000'
  if (colorway?.application_colors_json[scope]) return colorway.application_colors_json[scope]
  if (colorway?.application_colors_json.full_product) return colorway.application_colors_json.full_product
  return skuColorCode || '0000'
}

export function resolveBomForSku(input: {
  skuComplete: string
  skuColorCode: string | null
  structure: BomStructure
  globalOverrides: BomOverrides
  versionOverrides: BomOverrides
  colorway: Colorway | null
  componentItems: Map<string, ComponentItem>
}): ResolvedBomLine[] {
  const effective = applyBomOverrides(input.structure, input.globalOverrides, input.versionOverrides)

  return effective.lines.map((line) => {
    const variantCode = resolveVariant(input.colorway, line.product_application_scope, input.skuColorCode)
    const resolvedItemCode = buildSapItemCode(line.base_item_code, variantCode)
    const component = input.componentItems.get(resolvedItemCode)
      ?? input.componentItems.get(buildSapItemCode(line.base_item_code, '0000'))
      ?? null

    return {
      sku_complete: input.skuComplete,
      line_id: line.line_id,
      level: 1,
      sort_order: line.sort_order,
      base_item_code: line.base_item_code,
      resolved_item_code: component?.item_code ?? resolvedItemCode,
      resolved_item_name: component?.item_name ?? null,
      product_application_scope: line.product_application_scope,
      qty: line.qty,
      uom: component?.uom ?? null,
      input_warehouse_code: line.input_warehouse_code ?? effective.input_warehouse_code,
      output_warehouse_code: effective.output_warehouse_code,
      issue_method: line.issue_method_override ?? component?.default_issue_method ?? null,
      resolution_status: component ? 'resolved' : 'missing_component_item',
    }
  })
}
