import {
  SYNTHETIC_MARBLE_CALIBRATION_GROUP,
  type EstimationMeasurement,
  type MeasurementEligibility,
} from './estimationCalibration'

export const ENGINEERING_MEASUREMENT_STATUSES = ['pending', 'valid', 'excluded'] as const

export type EngineeringMeasurementStatus = (typeof ENGINEERING_MEASUREMENT_STATUSES)[number]

export type EngineeringMeasurementDraftInput = {
  calibrationGroup?: string | null
  sampleLabel: string
  sapPrefix?: string | null
  familyCode?: string | null
  productReferenceId?: string | null
  productVersionId?: string | null
  productSkuId?: string | null
  sapItemCode?: string | null
  legacyProductName?: string | null
  colorCode?: string | null
  cadVolumeMm3?: number | string | null
  paintAreaMm2?: number | string | null
  mixtureKg?: number | string | null
  gelcoatKg?: number | string | null
  actualNetWeightKg?: number | string | null
  actualGrossWeightKg?: number | string | null
  measuredAt?: string | null
  productionLot?: string | null
  sourceType?: string | null
  sourceFile?: string | null
  sourceSheet?: string | null
  sourceRow?: number | string | null
  sourceEvidenceJson?: Record<string, unknown> | string | null
  notes?: string | null
}

export type EngineeringMeasurementDraft = {
  calibrationGroup: string
  sampleLabel: string
  sapPrefix: string | null
  familyCode: string | null
  productReferenceId: string | null
  productVersionId: string | null
  productSkuId: string | null
  sapItemCode: string | null
  legacyProductName: string | null
  colorCode: string | null
  cadVolumeMm3: number | null
  paintAreaMm2: number | null
  mixtureKg: number | null
  gelcoatKg: number | null
  actualNetWeightKg: number | null
  actualGrossWeightKg: number | null
  measuredAt: string | null
  productionLot: string | null
  sourceType: string
  sourceFile: string | null
  sourceSheet: string | null
  sourceRow: number | null
  sourceEvidenceJson: Record<string, unknown>
  notes: string | null
}

export type EngineeringMeasurement = EngineeringMeasurementDraft & {
  id: string
  schemaVersion: number
  measurementStatus: EngineeringMeasurementStatus
  recordedBy: string | null
  verifiedBy: string | null
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export type EngineeringMeasurementListInput = {
  calibrationGroup?: string | null
  limit?: number | null
}

export type EngineeringMeasurementListOptions = {
  calibrationGroup: string | null
  limit: number
}

export const ENGINEERING_MEASUREMENT_LIST_DEFAULT_LIMIT = 100
export const ENGINEERING_MEASUREMENT_LIST_MAX_LIMIT = 250

const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const SAP_PREFIX_FORMAT = /^[A-Z][A-Z0-9]*$/u
const SAP_ITEM_CODE_FORMAT = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/u
const COLOR_CODE_FORMAT = /^\d{4}$/u
const ISO_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/u

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} debe ser un objeto.`)
  }
  return value as Record<string, unknown>
}

function nullableText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new Error(`${field} debe ser texto.`)
  return value.trim() || null
}

function requiredText(value: unknown, field: string): string {
  const normalized = nullableText(value, field)
  if (!normalized) throw new Error(`${field} es obligatorio.`)
  return normalized
}

function normalizedCode(value: unknown, field: string, format: RegExp): string | null {
  const normalized = nullableText(value, field)?.toUpperCase() ?? null
  if (normalized !== null && !format.test(normalized)) {
    throw new Error(`${field} no tiene el formato esperado.`)
  }
  return normalized
}

function nullableUuid(value: unknown, field: string): string | null {
  const normalized = nullableText(value, field)
  if (normalized !== null && !UUID_FORMAT.test(normalized)) {
    throw new Error(`${field} debe ser un UUID válido.`)
  }
  return normalized
}

function requiredUuid(value: unknown, field: string): string {
  const normalized = nullableUuid(value, field)
  if (!normalized) throw new Error(`${field} es obligatorio.`)
  return normalized
}

function nullablePositiveNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error(`${field} debe ser un número positivo.`)
  }
  return numericValue
}

function nullablePositiveInteger(value: unknown, field: string): number | null {
  const numericValue = nullablePositiveNumber(value, field)
  if (numericValue !== null && !Number.isSafeInteger(numericValue)) {
    throw new Error(`${field} debe ser un entero positivo.`)
  }
  return numericValue
}

function nullableIsoDate(value: unknown, field: string): string | null {
  const normalized = nullableText(value, field)
  if (!normalized) return null
  if (!ISO_DATE_FORMAT.test(normalized)) {
    throw new Error(`${field} debe usar el formato AAAA-MM-DD.`)
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${field} no es una fecha válida.`)
  }
  return normalized
}

function jsonObject(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {}

  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      throw new Error(`${field} debe contener JSON válido.`)
    }
  }

  const object = asRecord(parsed, field)
  try {
    const serialized = JSON.stringify(object)
    const normalized = serialized ? JSON.parse(serialized) as unknown : null
    return asRecord(normalized, field)
  } catch {
    throw new Error(`${field} debe ser serializable como JSON.`)
  }
}

function schemaVersion(value: unknown): number {
  const parsed = nullablePositiveInteger(value, 'schemaVersion')
  if (parsed === null) throw new Error('schemaVersion es obligatorio.')
  return parsed
}

function requiredTimestamp(value: unknown, field: string): string {
  return requiredText(value, field)
}

export function parseEngineeringMeasurementStatus(value: unknown): EngineeringMeasurementStatus {
  const normalized = nullableText(value, 'measurementStatus')?.toLowerCase()
  if (!normalized || !(ENGINEERING_MEASUREMENT_STATUSES as readonly string[]).includes(normalized)) {
    throw new Error('measurementStatus debe ser pending, valid o excluded.')
  }
  return normalized as EngineeringMeasurementStatus
}

export function parseEngineeringMeasurementDraft(value: unknown): EngineeringMeasurementDraft {
  const input = asRecord(value, 'medición')
  const calibrationGroup = nullableText(input.calibrationGroup, 'calibrationGroup')?.toUpperCase()
    ?? SYNTHETIC_MARBLE_CALIBRATION_GROUP
  const sourceType = nullableText(input.sourceType, 'sourceType')?.toLowerCase() ?? 'manual'

  const actualNetWeightKg = nullablePositiveNumber(input.actualNetWeightKg, 'actualNetWeightKg')
  const actualGrossWeightKg = nullablePositiveNumber(input.actualGrossWeightKg, 'actualGrossWeightKg')
  if (actualNetWeightKg !== null && actualGrossWeightKg !== null && actualGrossWeightKg < actualNetWeightKg) {
    throw new Error('actualGrossWeightKg no puede ser menor que actualNetWeightKg.')
  }

  return {
    calibrationGroup,
    sampleLabel: requiredText(input.sampleLabel, 'sampleLabel'),
    sapPrefix: normalizedCode(input.sapPrefix, 'sapPrefix', SAP_PREFIX_FORMAT),
    familyCode: normalizedCode(input.familyCode, 'familyCode', SAP_PREFIX_FORMAT),
    productReferenceId: nullableUuid(input.productReferenceId, 'productReferenceId'),
    productVersionId: nullableUuid(input.productVersionId, 'productVersionId'),
    productSkuId: nullableUuid(input.productSkuId, 'productSkuId'),
    sapItemCode: normalizedCode(input.sapItemCode, 'sapItemCode', SAP_ITEM_CODE_FORMAT),
    legacyProductName: nullableText(input.legacyProductName, 'legacyProductName'),
    colorCode: normalizedCode(input.colorCode, 'colorCode', COLOR_CODE_FORMAT),
    cadVolumeMm3: nullablePositiveNumber(input.cadVolumeMm3, 'cadVolumeMm3'),
    paintAreaMm2: nullablePositiveNumber(input.paintAreaMm2, 'paintAreaMm2'),
    mixtureKg: nullablePositiveNumber(input.mixtureKg, 'mixtureKg'),
    gelcoatKg: nullablePositiveNumber(input.gelcoatKg, 'gelcoatKg'),
    actualNetWeightKg,
    actualGrossWeightKg,
    measuredAt: nullableIsoDate(input.measuredAt, 'measuredAt'),
    productionLot: nullableText(input.productionLot, 'productionLot'),
    sourceType,
    sourceFile: nullableText(input.sourceFile, 'sourceFile'),
    sourceSheet: nullableText(input.sourceSheet, 'sourceSheet'),
    sourceRow: nullablePositiveInteger(input.sourceRow, 'sourceRow'),
    sourceEvidenceJson: jsonObject(input.sourceEvidenceJson, 'sourceEvidenceJson'),
    notes: nullableText(input.notes, 'notes'),
  }
}

export function parseEngineeringMeasurementId(value: unknown): string {
  return requiredUuid(value, 'id')
}

export function parseEngineeringMeasurementListOptions(
  input: EngineeringMeasurementListInput | undefined,
): EngineeringMeasurementListOptions {
  const calibrationGroup = nullableText(input?.calibrationGroup, 'calibrationGroup')?.toUpperCase() ?? null
  const limit = input?.limit ?? ENGINEERING_MEASUREMENT_LIST_DEFAULT_LIMIT
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ENGINEERING_MEASUREMENT_LIST_MAX_LIMIT) {
    throw new Error(`limit debe ser un entero entre 1 y ${ENGINEERING_MEASUREMENT_LIST_MAX_LIMIT}.`)
  }

  return { calibrationGroup, limit }
}

export function missingFieldsForValidEngineeringMeasurement(
  measurement: Pick<EngineeringMeasurementDraft, 'cadVolumeMm3' | 'paintAreaMm2' | 'mixtureKg' | 'gelcoatKg'>,
): string[] {
  return [
    measurement.cadVolumeMm3 === null ? 'cadVolumeMm3' : null,
    measurement.paintAreaMm2 === null ? 'paintAreaMm2' : null,
    measurement.mixtureKg === null ? 'mixtureKg' : null,
    measurement.gelcoatKg === null ? 'gelcoatKg' : null,
  ].flatMap(field => field ? [field] : [])
}

export function measurementEligibilityFromStatus(status: EngineeringMeasurementStatus): MeasurementEligibility {
  if (status === 'valid') return 'eligible'
  return status === 'excluded' ? 'excluded' : 'draft'
}

/** Maps the persisted state to the narrow input accepted by calibration. */
export function toEstimationMeasurement(measurement: EngineeringMeasurement): EstimationMeasurement {
  return {
    id: measurement.id,
    calibrationGroup: measurement.calibrationGroup,
    eligibility: measurementEligibilityFromStatus(measurement.measurementStatus),
    volumeMm3: measurement.cadVolumeMm3,
    paintAreaMm2: measurement.paintAreaMm2,
    mixtureKg: measurement.mixtureKg,
    gelcoatKg: measurement.gelcoatKg,
  }
}

export function parseEngineeringMeasurementRecord(value: unknown): EngineeringMeasurement {
  const row = asRecord(value, 'fila de medición')
  const draft = parseEngineeringMeasurementDraft({
    calibrationGroup: row.calibration_group,
    sampleLabel: row.sample_label,
    sapPrefix: row.sap_prefix,
    familyCode: row.family_code,
    productReferenceId: row.product_reference_id,
    productVersionId: row.product_version_id,
    productSkuId: row.product_sku_id,
    sapItemCode: row.sap_item_code,
    legacyProductName: row.legacy_product_name,
    colorCode: row.color_code,
    cadVolumeMm3: row.cad_volume_mm3,
    paintAreaMm2: row.paint_area_mm2,
    mixtureKg: row.mixture_kg,
    gelcoatKg: row.gelcoat_kg,
    actualNetWeightKg: row.actual_net_weight_kg,
    actualGrossWeightKg: row.actual_gross_weight_kg,
    measuredAt: row.measured_at,
    productionLot: row.production_lot,
    sourceType: row.source_type,
    sourceFile: row.source_file,
    sourceSheet: row.source_sheet,
    sourceRow: row.source_row,
    sourceEvidenceJson: row.source_evidence_json,
    notes: row.notes,
  })

  return {
    ...draft,
    id: requiredUuid(row.id, 'id'),
    schemaVersion: schemaVersion(row.schema_version),
    measurementStatus: parseEngineeringMeasurementStatus(row.measurement_status),
    recordedBy: nullableUuid(row.recorded_by, 'recordedBy'),
    verifiedBy: nullableUuid(row.verified_by, 'verifiedBy'),
    verifiedAt: nullableText(row.verified_at, 'verifiedAt'),
    createdAt: requiredTimestamp(row.created_at, 'createdAt'),
    updatedAt: requiredTimestamp(row.updated_at, 'updatedAt'),
  }
}
