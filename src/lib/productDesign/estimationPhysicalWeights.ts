import type { EstimationDraftBomLine, EstimationDraftPhysicalWeightPolicy } from './estimationDraft'

export const DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT = 0.05

const WEIGHT_TO_KG: Record<string, number> = { KG: 1, KGS: 1, G: 0.001, GR: 0.001, GRAMO: 0.001, LB: 0.45359237, OZ: 0.028349523125 }
const LINEAR_UOMS = new Set(['M', 'MT', 'METRO', 'CM', 'MM'])
const AREA_UOMS = new Set(['M2', 'M²', 'MT2', 'METRO2', 'CM2', 'CM²', 'MM2', 'MM²'])
const VOLUME_UOMS = new Set(['L', 'LT', 'LITRO', 'ML', 'M3', 'M³', 'CM3', 'CM³'])
const TIME_UOMS = new Set(['MIN', 'MINUTO', 'H', 'HR', 'HORA', 'HORAS', 'SEC', 'S'])

export type EstimationPhysicalWeightResult = { netWeightKg: number | null; packagingWeightKg: number | null; grossWeightKg: number | null; missingLineIds: string[] }

function uomKey(uom: string | null): string { return uom?.trim().toUpperCase().replace(/\s+/gu, '') ?? '' }

export function inferPhysicalWeightPolicy(line: EstimationDraftBomLine, hasChildren: boolean): EstimationDraftPhysicalWeightPolicy {
  if (hasChildren) return 'sub_bom_weight'
  const uom = uomKey(line.uom)
  if (TIME_UOMS.has(uom) || line.costCategory === 'mo' || line.costCategory === 'cif') return 'no_weight'
  if (AREA_UOMS.has(uom)) return 'useful_weight'
  if (WEIGHT_TO_KG[uom] || LINEAR_UOMS.has(uom) || VOLUME_UOMS.has(uom)) return 'direct_weight'
  return line.physicalWeightPolicy
}

export function isPhysicalWeightPolicyFixed(line: EstimationDraftBomLine, hasChildren: boolean): boolean {
  const uom = uomKey(line.uom)
  return hasChildren || TIME_UOMS.has(uom) || line.costCategory === 'mo' || line.costCategory === 'cif'
    || AREA_UOMS.has(uom) || Boolean(WEIGHT_TO_KG[uom]) || LINEAR_UOMS.has(uom) || VOLUME_UOMS.has(uom)
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
  const quantity = line.usefulQuantity
  const factor = line.physicalWeightSnapshot?.kgPerUom ?? null
  return quantity === null || quantity < 0 || factor === null || factor <= 0 ? null : quantity * factor
}

export function calculateEstimationPhysicalWeights(input: { lines: readonly EstimationDraftBomLine[]; estimatedMixtureKg: number | null; estimatedGelcoatKg: number | null; wastePct?: number | null; castingWastePct?: number | null; postDemoldWastePct?: number | null }): EstimationPhysicalWeightResult {
  const wastePct = input.castingWastePct !== undefined || input.postDemoldWastePct !== undefined ? (input.castingWastePct ?? 0) + (input.postDemoldWastePct ?? 0) : input.wastePct ?? DEFAULT_SYNTHETIC_MARBLE_WEIGHT_WASTE_PCT
  if (!Number.isFinite(wastePct) || wastePct < 0 || wastePct >= 1) throw new Error('El desperdicio de peso debe estar entre 0 % y 100 %.')
  const children = new Map<string, EstimationDraftBomLine[]>()
  input.lines.forEach(line => { if (line.parentId) children.set(line.parentId, [...(children.get(line.parentId) ?? []), line]) })
  const knownIds = new Set(input.lines.map(line => line.id))
  const roots = input.lines.filter(line => !line.parentId || !knownIds.has(line.parentId))
  const missing = new Set<string>(); let otherNet = 0; let packaging = 0
  const visit = (line: EstimationDraftBomLine, multiplier: number, inheritedCategory: 'product' | 'packaging' | null = null): void => {
    const childLines = children.get(line.id) ?? []
    const policy = inferPhysicalWeightPolicy(line, childLines.length > 0)
    if (policy === 'no_weight') return
    if (policy === 'sub_bom_weight') { childLines.forEach(child => visit(child, multiplier * (line.quantity ?? 0), line.physicalWeightCategory ?? inheritedCategory)); return }
    if (line.sapItemCode?.trim().toUpperCase().startsWith('PINP') || line.sapItemCode?.trim().toUpperCase().startsWith('PGEL')) return
    const kg = policy === 'useful_weight' ? usefulKg(line) : directKg(line)
    if (kg === null) { missing.add(line.id); return }
    if ((inheritedCategory ?? line.physicalWeightCategory) === 'packaging') packaging += kg * multiplier
    else otherNet += kg * multiplier
  }
  roots.forEach(line => visit(line, 1))
  if (input.estimatedMixtureKg === null || input.estimatedGelcoatKg === null) return { netWeightKg: null, packagingWeightKg: null, grossWeightKg: null, missingLineIds: [...missing] }
  const netWeightKg = (input.estimatedMixtureKg + input.estimatedGelcoatKg) * (1 - wastePct) + otherNet
  return { netWeightKg, packagingWeightKg: packaging, grossWeightKg: netWeightKg + packaging, missingLineIds: [...missing] }
}

export function suggestSyntheticMarbleWeightWastePct(input: { lines: readonly EstimationDraftBomLine[]; actualMixtureKg: number | null; actualGelcoatKg: number | null; actualNetWeightKg: number | null }): number | null {
  if (input.actualMixtureKg === null || input.actualGelcoatKg === null || input.actualNetWeightKg === null) return null
  const withoutWaste = calculateEstimationPhysicalWeights({ lines: input.lines, estimatedMixtureKg: 0, estimatedGelcoatKg: 0, wastePct: 0 })
  if (withoutWaste.netWeightKg === null) return null
  const material = input.actualMixtureKg + input.actualGelcoatKg
  const result = 1 - ((input.actualNetWeightKg - withoutWaste.netWeightKg) / material)
  return Number.isFinite(result) && result >= 0 && result < 1 ? result : null
}
