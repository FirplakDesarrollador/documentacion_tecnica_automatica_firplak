export const ESTIMATION_BOM_COST_CATEGORIES = [
  'material',
  'packaging',
  'mo',
  'cif',
  'other',
] as const

export type EstimationBomCostCategory = (typeof ESTIMATION_BOM_COST_CATEGORIES)[number]

export type EstimationBomCostStrategy = 'expand_children' | 'sap_direct' | 'manual_override'

/**
 * An editable quotation line. Its quantity is relative to its parent when it
 * has one, and relative to the quotation unit when it is a root.
 */
export type EstimationBomCostLine = {
  id: string
  parentId: string | null
  quantity: number
  uom: string | null
  costCategory: EstimationBomCostCategory
  costStrategy: EstimationBomCostStrategy
  origin?: 'sap' | 'manual'
  /** ProductTree output quantity. Only applies to expanded branches. */
  bomQuantity?: number | null
  /** Required for direct SAP costs and explicit manual overrides. */
  unitCost: number | null
}

export type EstimationBomCostingIssueCode =
  | 'line_id_invalid'
  | 'line_id_duplicate'
  | 'parent_not_found'
  | 'cycle_detected'
  | 'no_roots'
  | 'quantity_invalid'
  | 'uom_invalid'
  | 'cost_category_invalid'
  | 'cost_strategy_invalid'
  | 'unit_cost_invalid'
  | 'bom_quantity_invalid'
  | 'sap_direct_with_children'
  | 'sap_manual_override_forbidden'
  | 'expand_children_without_children'

export type EstimationBomCostingIssue = {
  code: EstimationBomCostingIssueCode
  lineId: string | null
  relatedLineIds: string[]
  message: string
}

export type EstimationBomCostBreakdown = Record<EstimationBomCostCategory, number>

export type EstimationBomCostTotals = {
  byCategory: EstimationBomCostBreakdown
  materialsAndPackaging: number
  expandedTotal: number
}

export type EstimationBomLineValuation = {
  lineId: string
  parentId: string | null
  costCategory: EstimationBomCostCategory
  costStrategy: EstimationBomCostStrategy
  uom: string
  quantity: number
  effectiveQuantity: number
  unitCost: number | null
  structuralUnitCost: number | null
  totalCost: number
  derivedFromLineIds: string[]
  ignoredChildLineIds: string[]
}

export type EstimationBomCostingSuccess = {
  ok: true
  totals: EstimationBomCostTotals
  lineValuations: EstimationBomLineValuation[]
  issues: []
}

export type EstimationBomCostingFailure = {
  ok: false
  issues: EstimationBomCostingIssue[]
}

export type EstimationBomCostingResult = EstimationBomCostingSuccess | EstimationBomCostingFailure

export type EstimationBomCostingInput = {
  lines: readonly EstimationBomCostLine[]
}

type IndexedLine = {
  id: string
  parentId: string | null
  line: EstimationBomCostLine
}

type VisitState = 'visiting' | 'visited'

function normalizedLineId(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function normalizedParentId(value: string | null | undefined): string | null {
  const normalized = normalizedLineId(value)
  return normalized || null
}

function finitePositive(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isCostCategory(value: string): value is EstimationBomCostCategory {
  return (ESTIMATION_BOM_COST_CATEGORIES as readonly string[]).includes(value)
}

function isCostStrategy(value: string): value is EstimationBomCostStrategy {
  return value === 'expand_children' || value === 'sap_direct' || value === 'manual_override'
}

function emptyBreakdown(): EstimationBomCostBreakdown {
  return {
    material: 0,
    packaging: 0,
    mo: 0,
    cif: 0,
    other: 0,
  }
}

function issue(
  code: EstimationBomCostingIssueCode,
  lineId: string | null,
  message: string,
  relatedLineIds: string[] = [],
): EstimationBomCostingIssue {
  return { code, lineId, relatedLineIds, message }
}

function buildIndexedLines(lines: readonly EstimationBomCostLine[]): {
  linesById: Map<string, IndexedLine>
  issues: EstimationBomCostingIssue[]
} {
  const linesById = new Map<string, IndexedLine>()
  const issues: EstimationBomCostingIssue[] = []

  for (const line of lines) {
    const id = normalizedLineId(line.id)
    if (!id) {
      issues.push(issue('line_id_invalid', null, 'Cada línea debe tener un identificador.'))
      continue
    }
    if (linesById.has(id)) {
      issues.push(issue('line_id_duplicate', id, `La línea ${id} está repetida.`, [id]))
      continue
    }

    linesById.set(id, {
      id,
      parentId: normalizedParentId(line.parentId),
      line,
    })
  }

  return { linesById, issues }
}

function validateLineValues(indexedLines: Iterable<IndexedLine>): EstimationBomCostingIssue[] {
  const issues: EstimationBomCostingIssue[] = []

  for (const { id, line } of indexedLines) {
    if (!finitePositive(line.quantity)) {
      issues.push(issue('quantity_invalid', id, `La cantidad de ${id} debe ser un número positivo.`))
    }
    if (!line.uom?.trim()) {
      issues.push(issue('uom_invalid', id, `La unidad de ${id} es obligatoria.`))
    }
    if (!isCostCategory(line.costCategory)) {
      issues.push(issue('cost_category_invalid', id, `La categoría de costo de ${id} no es válida.`))
    }
    if (!isCostStrategy(line.costStrategy)) {
      issues.push(issue('cost_strategy_invalid', id, `La estrategia de costo de ${id} no es válida.`))
      continue
    }
    if (line.costStrategy !== 'expand_children' && !finitePositive(line.unitCost)) {
      issues.push(issue('unit_cost_invalid', id, `El costo unitario de ${id} debe ser un número positivo.`))
    }
    if (line.costStrategy === 'expand_children' && line.bomQuantity !== null && line.bomQuantity !== undefined && !finitePositive(line.bomQuantity)) {
      issues.push(issue('bom_quantity_invalid', id, `La cantidad base de la sub-LdM ${id} debe ser positiva.`))
    }
    if (line.origin === 'sap' && line.costStrategy === 'manual_override') {
      issues.push(issue('sap_manual_override_forbidden', id, `La línea SAP ${id} no puede usar un costo manual.`))
    }
  }

  return issues
}

function validateParentsAndCycles(linesById: Map<string, IndexedLine>): EstimationBomCostingIssue[] {
  const issues: EstimationBomCostingIssue[] = []

  for (const { id, parentId } of linesById.values()) {
    if (parentId && !linesById.has(parentId)) {
      issues.push(issue('parent_not_found', id, `La línea padre ${parentId} de ${id} no existe.`, [parentId]))
    }
  }

  const visitState = new Map<string, VisitState>()
  const reportedCycles = new Set<string>()

  function visit(lineId: string, ancestry: string[]): void {
    const state = visitState.get(lineId)
    if (state === 'visited') return
    if (state === 'visiting') {
      const cycleStart = ancestry.indexOf(lineId)
      const cycleLineIds = ancestry.slice(cycleStart).concat(lineId)
      const cycleKey = [...new Set(cycleLineIds)].sort().join('|')
      if (!reportedCycles.has(cycleKey)) {
        reportedCycles.add(cycleKey)
        issues.push(issue('cycle_detected', lineId, `Se detectó un ciclo en la LdM: ${cycleLineIds.join(' → ')}.`, cycleLineIds))
      }
      return
    }

    visitState.set(lineId, 'visiting')
    const parentId = linesById.get(lineId)?.parentId
    if (parentId && linesById.has(parentId)) {
      visit(parentId, ancestry.concat(lineId))
    }
    visitState.set(lineId, 'visited')
  }

  for (const lineId of linesById.keys()) {
    visit(lineId, [])
  }

  return issues
}

function buildChildrenByParent(linesById: Map<string, IndexedLine>): Map<string, IndexedLine[]> {
  const childrenByParent = new Map<string, IndexedLine[]>()

  for (const indexedLine of linesById.values()) {
    if (!indexedLine.parentId) continue
    const children = childrenByParent.get(indexedLine.parentId) ?? []
    children.push(indexedLine)
    childrenByParent.set(indexedLine.parentId, children)
  }

  return childrenByParent
}

function validateExpandableLines(
  linesById: Map<string, IndexedLine>,
  childrenByParent: Map<string, IndexedLine[]>,
  ignoredLineIds: ReadonlySet<string>,
): EstimationBomCostingIssue[] {
  const issues: EstimationBomCostingIssue[] = []

  for (const { id, line } of linesById.values()) {
    if (ignoredLineIds.has(id)) continue
    if (line.costStrategy === 'expand_children' && (childrenByParent.get(id)?.length ?? 0) === 0) {
      issues.push(issue('expand_children_without_children', id, line.origin === 'sap'
        ? `La sub-LdM SAP ${id} está incompleta y debe volver a consultarse.`
        : `La línea ${id} debe tener hijos o usar un costo manual explícito.`))
    }
    if (line.costStrategy === 'sap_direct' && (childrenByParent.get(id)?.length ?? 0) > 0) {
      issues.push(issue('sap_direct_with_children', id, `La línea SAP ${id} tiene hijos y debe costearse por su sub-LdM.`))
    }
  }

  return issues
}

/**
 * Values only root lines. Expanded parents receive their value from descendants,
 * while a manual override is a cost boundary and intentionally skips all children.
 */
export function evaluateEstimationBomCosting(
  input: EstimationBomCostingInput,
): EstimationBomCostingResult {
  const { linesById, issues } = buildIndexedLines(input.lines)
  issues.push(...validateParentsAndCycles(linesById))

  const roots = [...linesById.values()].filter(indexedLine => indexedLine.parentId === null)
  if (linesById.size > 0 && roots.length === 0) {
    issues.push(issue('no_roots', null, 'La LdM no tiene una línea raíz.'))
  }

  const childrenByParent = buildChildrenByParent(linesById)
  const ignoredLineIds = new Set<string>()
  function ignoreDescendants(lineId: string): void {
    for (const child of childrenByParent.get(lineId) ?? []) {
      if (ignoredLineIds.has(child.id)) continue
      ignoredLineIds.add(child.id)
      ignoreDescendants(child.id)
    }
  }
  for (const { id, line } of linesById.values()) {
    if (line.origin !== 'sap' && line.costStrategy === 'manual_override') ignoreDescendants(id)
  }
  issues.push(...validateLineValues([...linesById.values()].filter(line => !ignoredLineIds.has(line.id))))
  issues.push(...validateExpandableLines(linesById, childrenByParent, ignoredLineIds))

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const byCategory = emptyBreakdown()
  const lineValuations: EstimationBomLineValuation[] = []

  function valueLine(indexedLine: IndexedLine, parentQuantity: number): number {
    const { id, parentId, line } = indexedLine
    const effectiveQuantity = parentQuantity * line.quantity
    const children = childrenByParent.get(id) ?? []

    if (line.costStrategy === 'manual_override' || line.costStrategy === 'sap_direct') {
      const unitCost = line.unitCost
      if (!finitePositive(unitCost)) {
        throw new Error(`La línea ${id} pasó la validación sin un costo unitario válido.`)
      }
      const totalCost = effectiveQuantity * unitCost
      byCategory[line.costCategory] += totalCost
      lineValuations.push({
        lineId: id,
        parentId,
        costCategory: line.costCategory,
        costStrategy: line.costStrategy,
        uom: line.uom?.trim() ?? '',
        quantity: line.quantity,
        effectiveQuantity,
        unitCost,
        structuralUnitCost: unitCost,
        totalCost,
        derivedFromLineIds: [],
        ignoredChildLineIds: children.map(child => child.id),
      })
      return totalCost
    }

    const bomQuantityCandidate = line.bomQuantity ?? null
    const bomQuantity = finitePositive(bomQuantityCandidate) ? bomQuantityCandidate : 1
    const totalCost = children.reduce(
      (total, child) => total + valueLine(child, effectiveQuantity / bomQuantity),
      0,
    )
    const structuralUnitCost = totalCost / effectiveQuantity
    lineValuations.push({
      lineId: id,
      parentId,
      costCategory: line.costCategory,
      costStrategy: line.costStrategy,
      uom: line.uom?.trim() ?? '',
      quantity: line.quantity,
      effectiveQuantity,
      unitCost: structuralUnitCost,
      structuralUnitCost,
      totalCost,
      derivedFromLineIds: children.map(child => child.id),
      ignoredChildLineIds: [],
    })
    return totalCost
  }

  roots.forEach(root => valueLine(root, 1))

  const materialsAndPackaging = byCategory.material + byCategory.packaging
  return {
    ok: true,
    totals: {
      byCategory,
      materialsAndPackaging,
      expandedTotal: materialsAndPackaging + byCategory.mo + byCategory.cif + byCategory.other,
    },
    lineValuations,
    issues: [],
  }
}
