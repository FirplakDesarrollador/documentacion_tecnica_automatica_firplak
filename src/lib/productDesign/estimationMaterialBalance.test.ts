import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateEstimationMaterialBalance } from './estimationMaterialBalance'

test('calcula el balance Oslo y permite sobrescribir pos-desmolde y peso bruto', () => {
  const base = { actualMixtureKg: 6.6, actualGelcoatKg: 0.46, theoreticalGelcoatKg: null, actualCastingWasteKg: 0.462, actualPostDemoldWasteOverrideKg: null, actualNetWeightKg: 5.6, actualPackagingWeightKg: 0.4, actualGrossWeightKg: null }
  const result = calculateEstimationMaterialBalance(base)
  assert.ok(Math.abs((result.calculatedPostDemoldWasteKg ?? 0) - 0.998) < 1e-9)
  assert.ok(Math.abs((result.totalWasteKg ?? 0) - 1.46) < 1e-9)
  assert.ok(Math.abs((result.totalWastePct ?? 0) - (1.46 / 7.06)) < 1e-9)
  assert.equal(result.effectiveGrossWeightKg, 6)
  const overridden = calculateEstimationMaterialBalance({ ...base, actualPostDemoldWasteOverrideKg: 0.9, actualGrossWeightKg: 6.2 })
  assert.equal(overridden.effectivePostDemoldWasteKg, 0.9)
  assert.ok(Math.abs((overridden.unmappedWasteKg ?? 0) - 0.098) < 1e-9)
  assert.equal(overridden.effectiveGrossWeightKg, 6.2)
})

test('usa gelcoat teórico sin presentarlo como real', () => {
  const result = calculateEstimationMaterialBalance({ actualMixtureKg: 6.6, actualGelcoatKg: null, theoreticalGelcoatKg: 0.46, actualCastingWasteKg: null, actualPostDemoldWasteOverrideKg: null, actualNetWeightKg: null, actualPackagingWeightKg: null, actualGrossWeightKg: null })
  assert.equal(result.totalMaterialKg, 7.06)
  assert.equal(result.gelcoatBasis, 'theoretical')
})
