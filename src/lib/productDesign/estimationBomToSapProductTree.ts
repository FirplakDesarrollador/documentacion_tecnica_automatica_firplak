import type { EstimationDraftBomLine } from './estimationDraft'

export type EstimationSapProductTreeLine = {
  ItemCode: string
  Quantity: number
  Warehouse: string | null
  IssueMethod: string | null
  Comment: string | null
}

export type EstimationSapSubBomPlan = {
  lineId: string
  itemCode: string
  reuseExisting: boolean
  sourceItemCode: string
  itemName: string
  lines: EstimationSapProductTreeLine[]
}

export type EstimationSapProductTreePlan = {
  finalItemLines: EstimationSapProductTreeLine[]
  subBoms: EstimationSapSubBomPlan[]
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function itemCode(line: EstimationDraftBomLine): string | null {
  // Older converted branches stored the recommendation only in extensions.
  // Treat it as the default effective code so saved quotations remain usable.
  return text(line.sapItemCode ?? line.extensions.suggestedSapItemCode)?.toUpperCase() ?? null
}

function treeLine(line: EstimationDraftBomLine): EstimationSapProductTreeLine {
  const code = itemCode(line)
  if (!code) throw new Error(`La línea ${line.itemName ?? line.id} no tiene un código SAP.`)
  if (line.quantity === null || !Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new Error(`La cantidad de ${line.itemName ?? code} debe ser mayor que cero.`)
  }

  return {
    ItemCode: code,
    Quantity: line.quantity,
    Warehouse: text(line.extensions.sapComponentWarehouse),
    IssueMethod: text(line.extensions.sapIssueMethod),
    Comment: text(line.notes),
  }
}

/**
 * A manual branch represents a new sub-LdM only when the user supplied the
 * literal SAP code to create. Manual leaves must already identify an item.
 */
export function estimationBomToSapProductTree(
  lines: EstimationDraftBomLine[],
  fallbackSourceItemCode: string,
): EstimationSapProductTreePlan {
  const byId = new Map(lines.map(line => [line.id, line]))
  const childrenByParent = new Map<string | null, EstimationDraftBomLine[]>()
  for (const line of lines) {
    if (line.parentId && !byId.has(line.parentId)) throw new Error(`La línea ${line.id} tiene un padre inexistente.`)
    const siblings = childrenByParent.get(line.parentId) ?? []
    siblings.push(line)
    childrenByParent.set(line.parentId, siblings)
  }

  const visited = new Set<string>()
  const visiting = new Set<string>()
  const subBoms: EstimationSapSubBomPlan[] = []

  function visit(line: EstimationDraftBomLine): void {
    if (visiting.has(line.id)) throw new Error(`La LdM tiene un ciclo en ${line.itemName ?? line.id}.`)
    if (visited.has(line.id)) return
    visiting.add(line.id)
    const children = childrenByParent.get(line.id) ?? []
    children.forEach(visit)

    if (line.origin === 'manual' && children.length > 0) {
      const code = itemCode(line)
      if (!code) throw new Error(`Escribe el código SAP literal para la sub-LdM manual ${line.itemName ?? line.id}.`)
      const sourceItemCode = text(line.extensions.sourceSapItemCode)?.toUpperCase() ?? fallbackSourceItemCode
      if (!sourceItemCode) throw new Error(`Define un homólogo SAP para crear la sub-LdM ${code}.`)
      subBoms.push({
        lineId: line.id,
        itemCode: code,
        reuseExisting: false,
        sourceItemCode,
        itemName: line.itemName?.trim() || code,
        lines: children.map(treeLine),
      })
    }

    visiting.delete(line.id)
    visited.add(line.id)
  }

  for (const root of childrenByParent.get(null) ?? []) visit(root)
  for (const line of lines) visit(line)

  const finalItemLines = (childrenByParent.get(null) ?? []).map(treeLine)
  if (finalItemLines.length === 0) throw new Error('La cotización no tiene componentes directos para la LdM final.')

  const seenCodes = new Set<string>()
  for (const plan of subBoms) {
    if (seenCodes.has(plan.itemCode)) throw new Error(`El código de sub-LdM ${plan.itemCode} se repite.`)
    seenCodes.add(plan.itemCode)
  }

  return { finalItemLines, subBoms }
}
