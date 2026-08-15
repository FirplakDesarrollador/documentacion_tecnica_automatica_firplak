export type EstimationMaterialBalance = {
  gelcoatKg: number | null
  gelcoatBasis: 'actual' | 'theoretical' | null
  totalMaterialKg: number | null
  calculatedPostDemoldWasteKg: number | null
  effectivePostDemoldWasteKg: number | null
  totalWasteKg: number | null
  unmappedWasteKg: number | null
  castingWastePct: number | null
  postDemoldWastePct: number | null
  totalWastePct: number | null
  yieldPct: number | null
  calculatedGrossWeightKg: number | null
  effectiveGrossWeightKg: number | null
}

function cleanDecimal(value: number | null): number | null {
  if (value === null) return null
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return Object.is(rounded, -0) ? 0 : rounded
}

export function calculateEstimationMaterialBalance(input: {
  actualMixtureKg: number | null
  actualGelcoatKg: number | null
  theoreticalGelcoatKg: number | null
  actualCastingWasteKg: number | null
  actualPostDemoldWasteOverrideKg: number | null
  actualNetWeightKg: number | null
  actualPackagingWeightKg: number | null
  actualGrossWeightKg: number | null
}): EstimationMaterialBalance {
  const gelcoatKg = input.actualGelcoatKg ?? input.theoreticalGelcoatKg
  const gelcoatBasis = input.actualGelcoatKg !== null ? 'actual' : input.theoreticalGelcoatKg !== null ? 'theoretical' : null
  const totalMaterialKg = input.actualMixtureKg !== null && gelcoatKg !== null ? input.actualMixtureKg + gelcoatKg : null
  const rawCalculatedPostDemoldWasteKg = totalMaterialKg !== null && input.actualCastingWasteKg !== null && input.actualNetWeightKg !== null
    ? totalMaterialKg - input.actualCastingWasteKg - input.actualNetWeightKg
    : null
  const calculatedPostDemoldWasteKg = cleanDecimal(rawCalculatedPostDemoldWasteKg)
  const effectivePostDemoldWasteKg = input.actualPostDemoldWasteOverrideKg ?? calculatedPostDemoldWasteKg
  const totalWasteKg = cleanDecimal(totalMaterialKg !== null && input.actualNetWeightKg !== null ? totalMaterialKg - input.actualNetWeightKg : null)
  const unmappedWasteKg = cleanDecimal(totalWasteKg !== null && input.actualCastingWasteKg !== null && effectivePostDemoldWasteKg !== null
    ? totalWasteKg - input.actualCastingWasteKg - effectivePostDemoldWasteKg
    : null)
  const castingWastePct = totalMaterialKg && input.actualCastingWasteKg !== null ? input.actualCastingWasteKg / totalMaterialKg : null
  const postDemoldWastePct = totalMaterialKg && effectivePostDemoldWasteKg !== null ? effectivePostDemoldWasteKg / totalMaterialKg : null
  const totalWastePct = totalMaterialKg && totalWasteKg !== null ? totalWasteKg / totalMaterialKg : null
  const yieldPct = totalWastePct === null ? null : 1 - totalWastePct
  const calculatedGrossWeightKg = input.actualNetWeightKg !== null && input.actualPackagingWeightKg !== null
    ? input.actualNetWeightKg + input.actualPackagingWeightKg
    : null
  return {
    gelcoatKg, gelcoatBasis, totalMaterialKg, calculatedPostDemoldWasteKg, effectivePostDemoldWasteKg,
    totalWasteKg, unmappedWasteKg, castingWastePct, postDemoldWastePct, totalWastePct, yieldPct,
    calculatedGrossWeightKg,
    effectiveGrossWeightKg: input.actualGrossWeightKg ?? calculatedGrossWeightKg,
  }
}
