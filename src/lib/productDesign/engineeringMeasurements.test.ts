import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ENGINEERING_MEASUREMENT_LIST_DEFAULT_LIMIT,
  measurementEligibilityFromStatus,
  missingFieldsForValidEngineeringMeasurement,
  parseEngineeringMeasurementDraft,
  parseEngineeringMeasurementListOptions,
  parseEngineeringMeasurementRecord,
  toEstimationMeasurement,
} from './engineeringMeasurements'

test('normaliza una medición editable sin inferir unidades ni datos faltantes', () => {
  const draft = parseEngineeringMeasurementDraft({
    sampleLabel: '  LVM Oslo  ',
    sapPrefix: 'vban29',
    familyCode: 'ban29',
    sapItemCode: 'vban29-0001-000-0100',
    colorCode: '0100',
    cadVolumeMm3: '2270000',
    paintAreaMm2: 355800,
    mixtureKg: '6.2',
    gelcoatKg: 0.4,
    measuredAt: '2026-08-11',
    sourceEvidenceJson: '{"workbook":"costeo.xlsx","row":3}',
  })

  assert.equal(draft.calibrationGroup, 'SYNTHETIC_MARBLE_GENERAL')
  assert.equal(draft.sampleLabel, 'LVM Oslo')
  assert.equal(draft.sapPrefix, 'VBAN29')
  assert.equal(draft.familyCode, 'BAN29')
  assert.equal(draft.sapItemCode, 'VBAN29-0001-000-0100')
  assert.equal(draft.mixtureKg, 6.2)
  assert.deepEqual(draft.sourceEvidenceJson, { workbook: 'costeo.xlsx', row: 3 })
})

test('rechaza valores que la tabla no debe aceptar', () => {
  assert.throws(
    () => parseEngineeringMeasurementDraft({ sampleLabel: 'Muestra', cadVolumeMm3: 0 }),
    /cadVolumeMm3 debe ser un número positivo/,
  )
  assert.throws(
    () => parseEngineeringMeasurementDraft({ sampleLabel: 'Muestra', colorCode: '100' }),
    /colorCode no tiene el formato esperado/,
  )
  assert.throws(
    () => parseEngineeringMeasurementDraft({ sampleLabel: 'Muestra', measuredAt: '2026-02-30' }),
    /measuredAt no es una fecha válida/,
  )
})

test('expone la condición de validación y traduce estado persistido a elegibilidad de calibración', () => {
  const incomplete = parseEngineeringMeasurementDraft({ sampleLabel: 'Incompleta', mixtureKg: 2 })
  assert.deepEqual(
    missingFieldsForValidEngineeringMeasurement(incomplete).sort(),
    ['cadVolumeMm3', 'gelcoatKg', 'paintAreaMm2'].sort(),
  )
  assert.equal(measurementEligibilityFromStatus('pending'), 'draft')
  assert.equal(measurementEligibilityFromStatus('valid'), 'eligible')
  assert.equal(measurementEligibilityFromStatus('excluded'), 'excluded')
})

test('convierte una fila SQL normalizada a la medición usada por calibración', () => {
  const measurement = parseEngineeringMeasurementRecord({
    id: '550e8400-e29b-41d4-a716-446655440000',
    schema_version: '1',
    measurement_status: 'valid',
    calibration_group: 'SYNTHETIC_MARBLE_GENERAL',
    sample_label: 'OSLO REAL',
    sap_prefix: 'VBAN29',
    family_code: 'BAN29',
    product_reference_id: null,
    product_version_id: null,
    product_sku_id: null,
    sap_item_code: null,
    legacy_product_name: null,
    color_code: null,
    cad_volume_mm3: '2270000',
    paint_area_mm2: '355800',
    mixture_kg: '6.2',
    gelcoat_kg: '0.4',
    measured_at: '2026-08-11',
    production_lot: null,
    source_type: 'historical_excel',
    source_file: 'artifacts/costeo.xlsx',
    source_sheet: 'Mármol Sintético',
    source_row: 3,
    source_evidence_json: { workbook_sha256: 'abc' },
    notes: null,
    recorded_by: null,
    verified_by: '550e8400-e29b-41d4-a716-446655440001',
    verified_at: '2026-08-11T12:00:00.000Z',
    created_at: '2026-08-11T12:00:00.000Z',
    updated_at: '2026-08-11T12:00:00.000Z',
  })

  assert.deepEqual(toEstimationMeasurement(measurement), {
    id: measurement.id,
    calibrationGroup: 'SYNTHETIC_MARBLE_GENERAL',
    eligibility: 'eligible',
    volumeMm3: 2_270_000,
    paintAreaMm2: 355_800,
    mixtureKg: 6.2,
    gelcoatKg: 0.4,
  })
})

test('limita el listado sin consultar la base en las pruebas', () => {
  assert.deepEqual(parseEngineeringMeasurementListOptions(undefined), {
    calibrationGroup: null,
    limit: ENGINEERING_MEASUREMENT_LIST_DEFAULT_LIMIT,
  })
  assert.throws(
    () => parseEngineeringMeasurementListOptions({ limit: 251 }),
    /limit debe ser un entero entre 1 y 250/,
  )
})
