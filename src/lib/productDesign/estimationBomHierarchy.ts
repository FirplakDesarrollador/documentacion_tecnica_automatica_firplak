import type { EstimationDraftBomLine } from './estimationDraft'

export type EstimationBomHierarchyRow = {
  line: EstimationDraftBomLine
  level: number
  hasChildren: boolean
}

function childrenByParent(lines: readonly EstimationDraftBomLine[]): Map<string | null, EstimationDraftBomLine[]> {
  const result = new Map<string | null, EstimationDraftBomLine[]>()
  for (const line of lines) {
    const siblings = result.get(line.parentId) ?? []
    siblings.push(line)
    result.set(line.parentId, siblings)
  }
  return result
}

export function getEstimationBomDescendantIds(
  lines: readonly EstimationDraftBomLine[],
  lineId: string,
): Set<string> {
  const byParent = childrenByParent(lines)
  const descendants = new Set<string>()
  const pending = [...(byParent.get(lineId) ?? [])]

  while (pending.length > 0) {
    const child = pending.pop()
    if (!child || descendants.has(child.id)) continue
    descendants.add(child.id)
    pending.push(...(byParent.get(child.id) ?? []))
  }
  return descendants
}

export function canAssignEstimationBomParent(
  lines: readonly EstimationDraftBomLine[],
  lineId: string,
  parentId: string | null,
): boolean {
  if (parentId === null) return true
  if (lineId === parentId) return false
  if (!lines.some(line => line.id === parentId)) return false
  return !getEstimationBomDescendantIds(lines, lineId).has(parentId)
}

/** Orders the editable flat snapshot as a tree without mutating its stored shape. */
export function buildEstimationBomHierarchy(
  lines: readonly EstimationDraftBomLine[],
): EstimationBomHierarchyRow[] {
  const byParent = childrenByParent(lines)
  const lineIds = new Set(lines.map(line => line.id))
  const rows: EstimationBomHierarchyRow[] = []
  const visited = new Set<string>()

  function visit(line: EstimationDraftBomLine, level: number): void {
    if (visited.has(line.id)) return
    visited.add(line.id)
    const children = byParent.get(line.id) ?? []
    rows.push({ line, level, hasChildren: children.length > 0 })
    children.forEach(child => visit(child, level + 1))
  }

  lines
    .filter(line => line.parentId === null || !lineIds.has(line.parentId))
    .forEach(line => visit(line, 0))

  // Cyclic or otherwise unreachable legacy rows remain visible for correction.
  lines.filter(line => !visited.has(line.id)).forEach(line => visit(line, 0))
  return rows
}

export function getEstimationBomParentCandidates(
  lines: readonly EstimationDraftBomLine[],
  lineId: string,
): EstimationDraftBomLine[] {
  return buildEstimationBomHierarchy(lines)
    .map(row => row.line)
    .filter(candidate => canAssignEstimationBomParent(lines, lineId, candidate.id))
}
