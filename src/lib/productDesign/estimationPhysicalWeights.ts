import type { EstimationDraftBomLine } from './estimationDraft'

export const DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT = 0.05

export type EstimationPhysicalWeightResult = {
  netWeightKg: number | null
  packagingWeightKg: number | null
  grossWeightKg: number | null
  missingLineIds: string[]
}

function childrenByParent(lines: readonly EstimationDraftBomLine[]): Map<string, EstimationDraftBomLine[]> {
  const result = new Map<string, EstimationDraftBomLine[]>()
  for (const line of lines) {
    if (!line.parentId) continue
    result.set(line.parentId, [...(result.get(line.parentId) ?? []), line])
  }
  return result
}

function isSyntheticMarbleIntermediate(line: EstimationDraftBomLine): boolean {
  const code = line.sapItemCode?.trim().toUpperCase() ?? ''
  return code.startsWith('PINP') || code.startsWith('PGEL')
}

function lineWeightKg(line: EstimationDraftBomLine): number | null {
  if (line.physicalWeightPolicy === 'exclude' || line.physicalWeightPolicy === 'derive_children') return 0
  if (line.physicalWeightPolicy === 'fixed_weight') return line.fixedWeightKg
  const quantity = line.physicalWeightPolicy === 'useful_quantity' ? line.usefulQuantity : line.quantity
  const kgPerUom = line.physicalWeightSnapshot?.kgPerUom ?? null
  return quantity === null || quantity < 0 || kgPerUom === null || kgPerUom <= 0
    ? null
    : quantity * kgPerUom
}

/**
 * Resolves only physical leaves or explicit line overrides. Parents configured
 * to derive children never contribute themselves, so a substructure cannot be
 * counted twice.
 */
export function calculateEstimationPhysicalWeights(input: {
  lines: readonly EstimationDraftBomLine[]
  estimatedMixtureKg: number | null
  estimatedGelcoatKg: number | null
  wastePct?: number | null
}): EstimationPhysicalWeightResult {
  const wastePct = input.wastePct ?? DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT
  if (!Number.isFinite(wastePct) || wastePct < 0 || wastePct >= 1) {
    throw new Error('El desperdicio de peso debe estar entre 0 % y 100 %.')
  }
  const children = childrenByParent(input.lines)
  const roots = input.lines.filter(line => !line.parentId || !input.lines.some(candidate => candidate.id === line.parentId))
  const missingLineIds = new Set<string>()
  let otherNetWeightKg = 0
  let packagingWeightKg = 0

  const visit = (line: EstimationDraftBomLine): void => {
    const lineChildren = children.get(line.id) ?? []
    const inheritsChildrenByDefault = lineChildren.length > 0
      && line.physicalWeightPolicy === 'from_quantity'
      && line.physicalWeightSnapshot === null
      && line.usefulQuantity === null
      && line.fixedWeightKg === null
    if (line.physicalWeightPolicy === 'derive_children' || inheritsChildrenByDefault) {
      lineChildren.forEach(visit)
      return
    }
    if (isSyntheticMarbleIntermediate(line)) return
    const weight = lineWeightKg(line)
    if (weight === null) {
      if (line.physicalWeightPolicy !== 'exclude') missingLineIds.add(line.id)
      return
    }
    if (line.costCategory === 'mo' || line.costCategory === 'cif') return
    if (line.costCategory === 'packaging') packagingWeightKg += weight
    else otherNetWeightKg += weight
  }
  roots.forEach(visit)

  const mixtureAndGelcoat = input.estimatedMixtureKg === null || input.estimatedGelcoatKg === null
    ? null
    : (input.estimatedMixtureKg + input.estimatedGelcoatKg) * (1 - wastePct)
  if (mixtureAndGelcoat === null) {
    return { netWeightKg: null, packagingWeightKg: null, grossWeightKg: null, missingLineIds: [...missingLineIds] }
  }
  const netWeightKg = mixtureAndGelcoat + otherNetWeightKg
  return {
    netWeightKg,
    packagingWeightKg,
    grossWeightKg: netWeightKg + packagingWeightKg,
    missingLineIds: [...missingLineIds],
  }
}

/**
 * Derives a per-sample waste suggestion without changing any quotation. The
 * caller must only pass an Engineering-validated sample with its frozen BOM.
 */
export function suggestSyntheticMarbleWeightWastePct(input: {
  lines: readonly EstimationDraftBomLine[]
  actualMixtureKg: number | null
  actualGelcoatKg: number | null
  actualNetWeightKg: number | null
}): number | null {
  if (input.actualMixtureKg === null || input.actualGelcoatKg === null || input.actualNetWeightKg === null) return null
  const physicalWithoutMixture = calculateEstimationPhysicalWeights({
    lines: input.lines,
    estimatedMixtureKg: 0,
    estimatedGelcoatKg: 0,
    wastePct: 0,
  })
  if (physicalWithoutMixture.netWeightKg === null) return null
  const resinAndGelcoat = input.actualMixtureKg + input.actualGelcoatKg
  if (resinAndGelcoat <= 0) return null
  const suggested = 1 - ((input.actualNetWeightKg - physicalWithoutMixture.netWeightKg) / resinAndGelcoat)
  return Number.isFinite(suggested) && suggested >= 0 && suggested < 1 ? suggested : null
}
