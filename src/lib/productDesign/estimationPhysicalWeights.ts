import type { EstimationDraftBomLine, EstimationDraftPhysicalWeightPolicy } from './estimationDraft'

export const DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT = 0.05

const WEIGHT_TO_KG: Record<string, number> = {
  KG: 1,
  KGS: 1,
  G: 0.001,
  GR: 0.001,
  GRAMO: 0.001,
  LB: 0.45359237,
  OZ: 0.028349523125,
}
const LINEAR_UOMS = new Set(['M', 'MT', 'METRO', 'CM', 'MM'])
const AREA_UOMS = new Set(['M2', 'M²', 'MT2', 'METRO2', 'CM2', 'CM²', 'MM2', 'MM²'])
const VOLUME_UOMS = new Set(['L', 'LT', 'LITRO', 'ML', 'M3', 'M³', 'CM3', 'CM³'])
const TIME_UOMS = new Set(['MIN', 'MINUTO', 'H', 'HR', 'HORA', 'HORAS', 'SEC', 'S'])

export type EstimationPhysicalWeightResult = {
  netWeightKg: number | null
  packagingWeightKg: number | null
  grossWeightKg: number | null
  missingLineIds: string[]
}

function uomKey(uom: string | null): string {
  return uom?.trim().toUpperCase().replace(/\s+/gu, '') ?? ''
}

function isCastPolymerOrGelcoat(line: EstimationDraftBomLine): boolean {
  const code = line.sapItemCode?.trim().toUpperCase() ?? ''
  const name = line.itemName?.trim().toUpperCase() ?? ''
  return code.startsWith('PINP') || code.startsWith('PGEL') || name.includes('MEZCLA POLIMERO') || name.includes('GELCOAT')
}

export function inferPhysicalWeightPolicy(line: EstimationDraftBomLine, hasChildren: boolean): EstimationDraftPhysicalWeightPolicy {
  const uom = uomKey(line.uom)
  if (TIME_UOMS.has(uom) || line.costCategory === 'mo' || line.costCategory === 'cif') return 'no_weight'
  if (Boolean(WEIGHT_TO_KG[uom])) return 'direct_weight'
  if (hasChildren) return 'sub_bom_weight'
  if (AREA_UOMS.has(uom)) return 'useful_weight'
  if (LINEAR_UOMS.has(uom) || VOLUME_UOMS.has(uom)) return 'direct_weight'
  return line.physicalWeightPolicy
}

export function isPhysicalWeightPolicyFixed(line: EstimationDraftBomLine, hasChildren: boolean): boolean {
  const uom = uomKey(line.uom)
  return TIME_UOMS.has(uom) || line.costCategory === 'mo' || line.costCategory === 'cif'
    || Boolean(WEIGHT_TO_KG[uom]) || (hasChildren && !WEIGHT_TO_KG[uom])
    || AREA_UOMS.has(uom) || LINEAR_UOMS.has(uom) || VOLUME_UOMS.has(uom)
}

function directKg(line: EstimationDraftBomLine): number | null {
  const quantity = line.quantity
  if (quantity === null || quantity < 0) return null
  const uom = uomKey(line.uom)
  if (WEIGHT_TO_KG[uom]) return quantity * WEIGHT_TO_KG[uom]
  const factor = line.physicalWeightSnapshot?.kgPerUom ?? null
  return factor === null || factor <= 0 ? null : quantity * factor
}

function usefulKg(line: EstimationDraftBomLine): number | null {
  const quantity = line.usefulQuantity ?? line.quantity
  if (quantity === null || quantity < 0) return null
  const factor = line.physicalWeightSnapshot?.kgPerUom ?? null
  return factor === null || factor <= 0 ? null : quantity * factor
}

export function calculateEstimationPhysicalWeights(input: {
  lines: readonly EstimationDraftBomLine[]
  estimatedMixtureKg?: number | null
  estimatedGelcoatKg?: number | null
  wastePct?: number | null
  castingWastePct?: number | null
  postDemoldWastePct?: number | null
}): EstimationPhysicalWeightResult {
  const wastePct = input.postDemoldWastePct !== undefined
    ? (input.postDemoldWastePct ?? 0)
    : input.wastePct ?? DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT
  if (!Number.isFinite(wastePct) || wastePct < 0 || wastePct >= 1) {
    throw new Error('El desperdicio de peso debe estar entre 0 % y 100 %.')
  }

  if (input.lines.length === 0) {
    if (input.estimatedMixtureKg !== null && input.estimatedMixtureKg !== undefined && input.estimatedGelcoatKg !== null && input.estimatedGelcoatKg !== undefined) {
      const netWeightKg = (input.estimatedMixtureKg + input.estimatedGelcoatKg) * (1 - wastePct)
      return { netWeightKg, packagingWeightKg: 0, grossWeightKg: netWeightKg, missingLineIds: [] }
    }
    return { netWeightKg: null, packagingWeightKg: null, grossWeightKg: null, missingLineIds: [] }
  }

  const children = new Map<string, EstimationDraftBomLine[]>()
  input.lines.forEach((line) => {
    if (line.parentId) children.set(line.parentId, [...(children.get(line.parentId) ?? []), line])
  })
  const knownIds = new Set(input.lines.map((line) => line.id))
  const roots = input.lines.filter((line) => !line.parentId || !knownIds.has(line.parentId))

  const hasCastLinesInBom = input.lines.some((line) => isCastPolymerOrGelcoat(line))
  let baseCadWeight = 0
  if (!hasCastLinesInBom && input.estimatedMixtureKg !== null && input.estimatedMixtureKg !== undefined && input.estimatedGelcoatKg !== null && input.estimatedGelcoatKg !== undefined) {
    baseCadWeight = (input.estimatedMixtureKg + input.estimatedGelcoatKg) * (1 - wastePct)
  }

  const missing = new Set<string>()
  let netWeightKg = baseCadWeight
  let packagingWeightKg = 0

  const visit = (
    line: EstimationDraftBomLine,
    multiplier: number,
    inheritedCategory: 'product' | 'packaging' | null = null,
  ): void => {
    const childLines = children.get(line.id) ?? []
    const hasChildren = childLines.length > 0
    const policy = inferPhysicalWeightPolicy(line, hasChildren)

    if (policy === 'no_weight') return

    if (policy === 'sub_bom_weight') {
      childLines.forEach((child) => {
        visit(child, multiplier * (line.quantity ?? 0), line.physicalWeightCategory ?? inheritedCategory)
      })
      return
    }

    const rawKg = policy === 'useful_weight' ? usefulKg(line) : directKg(line)
    if (rawKg === null) {
      missing.add(line.id)
      return
    }

    const effectiveKg = isCastPolymerOrGelcoat(line)
      ? rawKg * (1 - wastePct)
      : rawKg

    const totalLineKg = effectiveKg * multiplier
    const category = inheritedCategory ?? line.physicalWeightCategory

    if (category === 'packaging') {
      packagingWeightKg += totalLineKg
    } else {
      netWeightKg += totalLineKg
    }
  }

  roots.forEach((line) => visit(line, 1))

  return {
    netWeightKg,
    packagingWeightKg,
    grossWeightKg: netWeightKg + packagingWeightKg,
    missingLineIds: [...missing],
  }
}

export function suggestSyntheticMarbleWeightWastePct(input: {
  lines: readonly EstimationDraftBomLine[]
  actualMixtureKg: number | null
  actualGelcoatKg: number | null
  actualNetWeightKg: number | null
}): number | null {
  if (input.actualMixtureKg === null || input.actualGelcoatKg === null || input.actualNetWeightKg === null) return null
  const withoutWaste = calculateEstimationPhysicalWeights({
    lines: input.lines.filter((line) => !isCastPolymerOrGelcoat(line)),
    estimatedMixtureKg: 0,
    estimatedGelcoatKg: 0,
    wastePct: 0,
    postDemoldWastePct: 0,
  })
  if (withoutWaste.netWeightKg === null) return null
  const material = input.actualMixtureKg + input.actualGelcoatKg
  if (material <= 0) return null
  const otherComponentsWeight = withoutWaste.netWeightKg
  const castActualNet = input.actualNetWeightKg - otherComponentsWeight
  const result = 1 - (castActualNet / material)
  return Number.isFinite(result) && result >= 0 && result < 1 ? result : null
}
