import type { EstimationDraftBomLine } from './estimationDraft'

export type EstimationBomHierarchyRow = {
  line: EstimationDraftBomLine
  level: number
  hasChildren: boolean
}

export type EstimationBomDropPosition = 'inside' | 'before' | 'after'

export function getEstimationBomDisplayLevel(internalLevel: number): number {
  return internalLevel + 2
}

export function assertValidEstimationBomLinks(lines: readonly EstimationDraftBomLine[]): void {
  const byId = new Map(lines.map(line => [line.id, line]))
  for (const line of lines) {
    if (line.parentId && !byId.has(line.parentId)) {
      throw new Error(`La línea ${line.id} apunta a un contenedor que no existe.`)
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  function visit(lineId: string): void {
    if (visiting.has(lineId)) throw new Error(`La jerarquía contiene un ciclo en ${lineId}.`)
    if (visited.has(lineId)) return
    visiting.add(lineId)
    const parentId = byId.get(lineId)?.parentId
    if (parentId) visit(parentId)
    visiting.delete(lineId)
    visited.add(lineId)
  }
  lines.forEach(line => visit(line.id))
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

/** Moves one complete branch while preserving the stored flat preorder. */
export function moveEstimationBomBranch(
  lines: readonly EstimationDraftBomLine[],
  lineId: string,
  targetId: string,
  position: EstimationBomDropPosition,
): EstimationDraftBomLine[] {
  if (lineId === targetId) throw new Error('Una rama no se puede mover sobre sí misma.')
  const ordered = buildEstimationBomHierarchy(lines).map(row => row.line)
  const movingLine = ordered.find(line => line.id === lineId)
  const targetLine = ordered.find(line => line.id === targetId)
  if (!movingLine || !targetLine) throw new Error('No se encontró la rama o el destino del movimiento.')

  const branchIds = getEstimationBomDescendantIds(ordered, lineId)
  branchIds.add(lineId)
  if (branchIds.has(targetId)) throw new Error('Una rama no se puede mover dentro de uno de sus descendientes.')

  const branch = ordered.filter(line => branchIds.has(line.id))
  const remaining = ordered.filter(line => !branchIds.has(line.id))
  const nextParentId = position === 'inside' ? targetId : targetLine.parentId
  if (!canAssignEstimationBomParent(lines, lineId, nextParentId)) throw new Error('El movimiento produciría un ciclo en la LdM.')

  const movedBranch = branch.map(line => line.id === lineId ? { ...line, parentId: nextParentId } : line)
  let insertionIndex = remaining.findIndex(line => line.id === targetId)
  if (insertionIndex < 0) throw new Error('No se encontró la posición de destino de la rama.')

  if (position === 'inside' || position === 'after') {
    const targetDescendants = getEstimationBomDescendantIds(remaining, targetId)
    insertionIndex += 1
    while (insertionIndex < remaining.length && targetDescendants.has(remaining[insertionIndex].id)) {
      insertionIndex += 1
    }
  }

  return [
    ...remaining.slice(0, insertionIndex),
    ...movedBranch,
    ...remaining.slice(insertionIndex),
  ]
}

export function removeEstimationBomBranch(
  lines: readonly EstimationDraftBomLine[],
  lineId: string,
): EstimationDraftBomLine[] {
  const removedIds = getEstimationBomDescendantIds(lines, lineId)
  removedIds.add(lineId)
  return lines.filter(line => !removedIds.has(line.id))
}
