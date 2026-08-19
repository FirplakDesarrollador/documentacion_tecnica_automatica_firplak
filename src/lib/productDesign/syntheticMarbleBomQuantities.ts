import type { EstimationDraftBomLine } from './estimationDraft'

export function roundUpSapQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('La cantidad debe ser un número no negativo.')
  return Math.ceil((value - Number.EPSILON) * 100) / 100
}

function isSyntheticMarbleMixture(line: EstimationDraftBomLine): boolean {
  return line.sapItemCode?.trim().toUpperCase().startsWith('PINP') ?? false
}

function isSyntheticMarbleGelcoat(line: EstimationDraftBomLine): boolean {
  return line.sapItemCode?.trim().toUpperCase().startsWith('PGEL') ?? false
}

function isSyntheticMarblePeroxide(line: EstimationDraftBomLine): boolean {
  const itemCode = line.sapItemCode?.trim().toUpperCase() ?? ''
  const itemName = line.itemName?.trim().toUpperCase() ?? ''
  return itemCode === 'CMPD01-0016-000-0000'
    || itemCode === 'CMPD01-0017-000-0000'
    || itemCode === 'CMPD01-0048-000-0000'
    || itemName.includes('PEROX')
    || itemName.includes('NOROX')
    || itemName.includes('LUPEROX')
    || itemName.includes('REVOX')
}

function peroxideQuantityForUom(estimatedGelcoatKg: number, uom: string | null): number {
  const peroxideGrams = estimatedGelcoatKg * 1_000 * 0.025
  return uom?.trim().toUpperCase() === 'KG' ? peroxideGrams / 1_000 : peroxideGrams
}

export type AppliedSyntheticMarbleBomQuantities = {
  lines: EstimationDraftBomLine[]
  mixtureLineIds: string[]
  gelcoatLineIds: string[]
  peroxideLineIds: string[]
}

/**
 * The MS canvas is deliberately changed at the identifiable intermediate
 * items (PINP, PGEL and peroxide); their descendants keep the copied SAP
 * structure. Peroxide follows the 2.5% gelcoat rule and respects its SAP UoM.
 */
export function applySyntheticMarbleBomQuantities(
  lines: readonly EstimationDraftBomLine[],
  estimatedMixtureKg: number | null,
  estimatedGelcoatKg: number | null,
): AppliedSyntheticMarbleBomQuantities {
  const mixtureQuantity = estimatedMixtureKg === null ? null : roundUpSapQuantity(estimatedMixtureKg)
  const gelcoatQuantity = estimatedGelcoatKg === null ? null : roundUpSapQuantity(estimatedGelcoatKg)
  const mixtureLineIds: string[] = []
  const gelcoatLineIds: string[] = []
  const peroxideLineIds: string[] = []

  const nextLines = lines.map(line => {
    if (mixtureQuantity !== null && isSyntheticMarbleMixture(line)) {
      mixtureLineIds.push(line.id)
      return { ...line, quantity: mixtureQuantity }
    }
    if (gelcoatQuantity !== null && isSyntheticMarbleGelcoat(line)) {
      gelcoatLineIds.push(line.id)
      return { ...line, quantity: gelcoatQuantity }
    }
    if (estimatedGelcoatKg !== null && isSyntheticMarblePeroxide(line) && line.parentId && lines.some(parent => parent.id === line.parentId && isSyntheticMarbleGelcoat(parent))) {
      peroxideLineIds.push(line.id)
      return { ...line, quantity: roundUpSapQuantity(peroxideQuantityForUom(estimatedGelcoatKg, line.uom)) }
    }
    return line
  })

  return { lines: nextLines, mixtureLineIds, gelcoatLineIds, peroxideLineIds }
}
