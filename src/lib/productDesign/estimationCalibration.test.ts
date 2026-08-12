import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateSyntheticMarbleCalibration,
  estimateConsumption,
  SYNTHETIC_MARBLE_CALIBRATION_GROUP,
  type EstimationMeasurement,
} from './estimationCalibration'

function measurement(overrides: Partial<EstimationMeasurement>): EstimationMeasurement {
  return {
    id: 'sample-1',
    calibrationGroup: SYNTHETIC_MARBLE_CALIBRATION_GROUP,
    eligibility: 'eligible',
    volumeMm3: 1_000_000,
    paintAreaMm2: 500_000,
    mixtureKg: 2.5,
    gelcoatKg: 0.65,
    ...overrides,
  }
}

test('uses the ratio of totals for eligible synthetic-marble measurements', () => {
  const calibration = calculateSyntheticMarbleCalibration([
    measurement({ id: 'small', volumeMm3: 1_000_000, mixtureKg: 2, paintAreaMm2: 500_000, gelcoatKg: 0.5 }),
    measurement({ id: 'large', volumeMm3: 3_000_000, mixtureKg: 9, paintAreaMm2: 1_500_000, gelcoatKg: 2.25 }),
  ])

  assert.equal(calibration.mixture?.sampleCount, 2)
  assert.deepEqual(calibration.mixture?.sampleIds, ['small', 'large'])
  assert.equal(calibration.mixture?.factor, 11 / 4_000_000)
  assert.equal(calibration.gelcoat?.factor, 2.75 / 2_000_000)
})

test('excludes draft, excluded, incomplete, and other-group measurements', () => {
  const calibration = calculateSyntheticMarbleCalibration([
    measurement({ id: 'eligible' }),
    measurement({ id: 'draft', eligibility: 'draft' }),
    measurement({ id: 'excluded', eligibility: 'excluded' }),
    measurement({ id: 'missing', mixtureKg: null, gelcoatKg: null }),
    measurement({ id: 'other-group', calibrationGroup: 'fiberglass' }),
  ])

  assert.deepEqual(calibration.mixture?.sampleIds, ['eligible'])
  assert.deepEqual(calibration.gelcoat?.sampleIds, ['eligible'])
})

test('returns null when the driver or calibration factor is unavailable', () => {
  assert.equal(estimateConsumption(null, null), null)
  assert.equal(estimateConsumption(0, null), null)
  assert.equal(estimateConsumption(1_000_000, null), null)
})

test('estimates consumption from the frozen ratio-of-totals factor', () => {
  const calibration = calculateSyntheticMarbleCalibration([measurement({ mixtureKg: 3 })])
  assert.equal(estimateConsumption(2_000_000, calibration.mixture), 6)
})

test('calibra Mármol Sintético con las nueve tomas REAL históricas, no con un caso Oasis', () => {
  const historicalRealMeasurements: EstimationMeasurement[] = [
    measurement({ id: 'excel-row-3', volumeMm3: 2_270_000, mixtureKg: 6.2, paintAreaMm2: 355_800, gelcoatKg: 0.4 }),
    measurement({ id: 'excel-row-5', volumeMm3: 1_439_000, mixtureKg: 4, paintAreaMm2: 257_700, gelcoatKg: 0.4 }),
    measurement({ id: 'excel-row-7', volumeMm3: 1_928_000, mixtureKg: 6, paintAreaMm2: 279_000, gelcoatKg: 0.46 }),
    measurement({ id: 'excel-row-9', volumeMm3: 1_850_000, mixtureKg: 4, paintAreaMm2: 238_200, gelcoatKg: 0.37 }),
    measurement({ id: 'excel-row-16', volumeMm3: 3_416_000, mixtureKg: 9.5, paintAreaMm2: 482_700, gelcoatKg: 0.6 }),
    measurement({ id: 'excel-row-17', volumeMm3: 3_131_000, mixtureKg: 8, paintAreaMm2: 432_900, gelcoatKg: 0.42 }),
    measurement({ id: 'excel-row-20', volumeMm3: 6_596_000, mixtureKg: 19.8, paintAreaMm2: 1_055_000, gelcoatKg: 1.4 }),
    measurement({ id: 'excel-row-24', volumeMm3: 9_743_000, mixtureKg: 20, paintAreaMm2: 1_078_000, gelcoatKg: 1.45 }),
    measurement({ id: 'excel-row-26', volumeMm3: 7_468_000, mixtureKg: 23, paintAreaMm2: 1_053_000, gelcoatKg: 1.5 }),
  ]

  const calibration = calculateSyntheticMarbleCalibration(historicalRealMeasurements)

  assert.equal(calibration.mixture?.sampleCount, 9)
  assert.equal(calibration.gelcoat?.sampleCount, 9)
  assert.ok(Math.abs((calibration.mixture?.factor ?? 0) - 0.0000026558494754366955) < 1e-20)
  assert.ok(Math.abs((calibration.gelcoat?.factor ?? 0) - 0.0000013378437780708292) < 1e-20)
})
