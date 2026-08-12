/** Matches the persisted cohort used for the initial Mármol Sintético samples. */
export const SYNTHETIC_MARBLE_CALIBRATION_GROUP = 'SYNTHETIC_MARBLE_GENERAL' as const

export type MeasurementEligibility = 'eligible' | 'draft' | 'excluded'

export type EstimationMeasurement = {
  id: string
  calibrationGroup: string
  eligibility: MeasurementEligibility
  volumeMm3: number | null
  paintAreaMm2: number | null
  mixtureKg: number | null
  gelcoatKg: number | null
}

export type CalibrationMetric = 'mixture' | 'gelcoat'

export type CalibrationFactor = {
  metric: CalibrationMetric
  sampleIds: string[]
  sampleCount: number
  driverTotal: number
  consumptionTotal: number
  factor: number
  simpleMeanRatio: number
  minRatio: number
  maxRatio: number
}

export type SyntheticMarbleCalibration = {
  mixture: CalibrationFactor | null
  gelcoat: CalibrationFactor | null
}

type MetricValues = {
  driver: number | null
  consumption: number | null
}

function finitePositive(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function metricValues(measurement: EstimationMeasurement, metric: CalibrationMetric): MetricValues {
  return metric === 'mixture'
    ? { driver: measurement.volumeMm3, consumption: measurement.mixtureKg }
    : { driver: measurement.paintAreaMm2, consumption: measurement.gelcoatKg }
}

function calculateFactor(measurements: EstimationMeasurement[], metric: CalibrationMetric): CalibrationFactor | null {
  const validSamples = measurements.flatMap(measurement => {
    const { driver, consumption } = metricValues(measurement, metric)
    if (
      measurement.calibrationGroup !== SYNTHETIC_MARBLE_CALIBRATION_GROUP ||
      measurement.eligibility !== 'eligible' ||
      !finitePositive(driver) ||
      !finitePositive(consumption)
    ) {
      return []
    }

    return [{ id: measurement.id, driver, consumption, ratio: consumption / driver }]
  })

  if (validSamples.length === 0) return null

  const driverTotal = validSamples.reduce((total, sample) => total + sample.driver, 0)
  const consumptionTotal = validSamples.reduce((total, sample) => total + sample.consumption, 0)
  const ratios = validSamples.map(sample => sample.ratio)

  return {
    metric,
    sampleIds: validSamples.map(sample => sample.id),
    sampleCount: validSamples.length,
    driverTotal,
    consumptionTotal,
    factor: consumptionTotal / driverTotal,
    simpleMeanRatio: ratios.reduce((total, ratio) => total + ratio, 0) / ratios.length,
    minRatio: Math.min(...ratios),
    maxRatio: Math.max(...ratios),
  }
}

export function calculateSyntheticMarbleCalibration(
  measurements: EstimationMeasurement[],
): SyntheticMarbleCalibration {
  return {
    mixture: calculateFactor(measurements, 'mixture'),
    gelcoat: calculateFactor(measurements, 'gelcoat'),
  }
}

export function estimateConsumption(
  driverValue: number | null,
  factor: CalibrationFactor | null,
): number | null {
  if (!finitePositive(driverValue) || !factor) return null
  return driverValue * factor.factor
}
