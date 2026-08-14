import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createEmptyEstimationDraft,
  freezeSyntheticMarbleCalibration,
  hasFrozenSyntheticMarbleCalibration,
  normalizeEstimationDraft,
  serializeEstimationDraft,
  type EstimationDraftJsonObject,
} from './estimationDraft'
import type { SyntheticMarbleCalibration } from './estimationCalibration'

test('normaliza el borrador completo con homólogo, geometría, color, gelcoat, LdM y escenario comercial', () => {
  const draft = normalizeEstimationDraft({
    schemaVersion: 42,
    homologue: {
      sapItemCode: ' VBAN29-0048-000-0000 ',
      itemName: 'Lavarropas Versa 50x50',
      sapPrefix: 'VBAN29',
      familyCode: 'BAN29',
      selectedAt: '2026-08-11T10:00:00Z',
      bomReadAt: '2026-08-11T10:01:00Z',
    },
    syntheticMarbleCalibration: {
      calibrationGroup: 'SYNTHETIC_MARBLE_GENERAL',
      frozenAt: '2026-08-11T10:02:00Z',
      mixture: {
        factor: 0.0000026558,
        sampleIds: ['sample-a', 'sample-b'],
        sampleCount: 2,
        driverTotal: 1_000_000,
        consumptionTotal: 2.6558,
        simpleMeanRatio: 0.0000027,
        minRatio: 0.0000024,
        maxRatio: 0.000003,
      },
      gelcoat: {
        factor: 0.0000013378,
        sampleIds: ['sample-a', 'sample-b'],
        sampleCount: 2,
        driverTotal: 300_000,
        consumptionTotal: 0.40134,
        simpleMeanRatio: 0.0000014,
        minRatio: 0.0000012,
        maxRatio: 0.0000015,
      },
    },
    geometry: {
      source: 'fusion_360',
      capturedAt: '2026-08-11T10:03:00Z',
      volumeMm3: 3_131_000,
      paintAreaMm2: 432_900,
      estimatedMixtureKg: 8.31,
      estimatedGelcoatKg: 0.58,
    },
    commercialColor: {
      colorCode: '0100',
      colorName: 'Blanco',
      selectedAt: '2026-08-11T10:04:00Z',
    },
    gelcoatItem: {
      itemCode: 'GELC01-0001-000-0100',
      itemName: 'Gelcoat blanco',
      uom: 'KG',
      selectedAt: '2026-08-11T10:05:00Z',
    },
    bomLines: [
      {
        id: 'root',
        parentId: null,
        origin: 'sap',
        sapItemCode: 'SUBM01-0001-000-0000',
        itemName: 'Mezcla polimérica',
        quantity: 1,
        uom: 'KG',
        costCategory: 'material',
        costStrategy: 'expand_children',
        unitCost: null,
      },
      {
        id: 'gelcoat',
        parentId: 'root',
        origin: 'sap',
        sapItemCode: 'GELC01-0001-000-0100',
        itemName: 'Gelcoat blanco',
        quantity: 0.58,
        uom: 'KG',
        costCategory: 'material',
        costStrategy: 'manual_override',
        unitCost: 25_000,
        costEvidence: {
          source: 'receipt_verified',
          candidateId: 'receipt-9',
          documentType: 'PurchaseDeliveryNote',
          documentNumber: '12345',
          documentDate: '2026-08-10',
          warehouseCode: 'MP-01',
          originalCurrency: 'COP',
          sourceUom: 'KG',
          warning: null,
        },
      },
    ],
    commercialScenario: {
      currency: 'COP',
      contributionMarginPct: 35,
      minimumPrice: 180_000,
      discountPct: 10,
      maximumPrice: 230_000,
      pvp: 250_000,
      netWeightKg: 18,
      grossWeightKg: 21,
      notes: 'Escenario inicial para ventas',
    },
  })

  assert.equal(draft.schemaVersion, 2)
  assert.equal(draft.homologue?.sapItemCode, 'VBAN29-0048-000-0000')
  assert.equal(draft.syntheticMarbleCalibration?.mixture?.sampleCount, 2)
  assert.equal(draft.geometry.volumeMm3, 3_131_000)
  assert.equal(draft.commercialColor.colorCode, '0100')
  assert.equal(draft.gelcoatItem.itemCode, 'GELC01-0001-000-0100')
  assert.equal(draft.bomLines[1]?.parentId, 'root')
  assert.equal(draft.bomLines[1]?.costEvidence?.source, 'receipt_verified')
  assert.equal(draft.commercialScenario.pvp, 250_000)
})

test('normaliza JSON desconocido sin coerciones y deja el borrador incompleto pero editable', () => {
  const malformedValues: unknown[] = [null, [], 'no es un objeto', 7]
  for (const value of malformedValues) {
    assert.deepEqual(normalizeEstimationDraft(value), createEmptyEstimationDraft())
  }

  const draft = normalizeEstimationDraft({
    geometry: { source: 'cad_desconocido', volumeMm3: '3131000', paintAreaMm2: Number.NaN },
    commercialColor: 'blanco',
    gelcoatItem: [],
    bomLines: [
      null,
      {
        id: 'incomplete',
        quantity: '2',
        uom: 3,
        costCategory: 'not-a-category',
        costStrategy: 'not-a-strategy',
        unitCost: Number.POSITIVE_INFINITY,
      },
    ],
    commercialScenario: { currency: ' ', pvp: '250000' },
  })

  assert.equal(draft.geometry.source, null)
  assert.equal(draft.geometry.volumeMm3, null)
  assert.equal(draft.geometry.paintAreaMm2, null)
  assert.equal(draft.bomLines.length, 1)
  assert.equal(draft.bomLines[0]?.quantity, null)
  assert.equal(draft.bomLines[0]?.uom, null)
  assert.equal(draft.bomLines[0]?.costCategory, null)
  assert.equal(draft.bomLines[0]?.costStrategy, null)
  assert.equal(draft.bomLines[0]?.unitCost, null)
  assert.equal(draft.commercialScenario.currency, 'COP')
  assert.equal(draft.commercialScenario.pvp, null)
})

test('preserva extensiones desconocidas de raíz y anidadas después de serializar y volver a normalizar', () => {
  const raw = {
    futureRoot: { enabled: true, stages: ['draft', 'review'] },
    homologue: {
      sapItemCode: 'VBAN29-0048-000-0000',
      futureHomologueField: { source: 'future-service' },
    },
    geometry: {
      volumeMm3: 3_131_000,
      futureGeometryFlag: true,
    },
    bomLines: [{
      id: 'component-1',
      quantity: 1,
      uom: 'UN',
      futureLineField: ['keep', 2],
    }],
    commercialScenario: {
      futureScenarioField: { owner: 'Ventas' },
    },
  }

  const normalized = normalizeEstimationDraft(raw)
  assert.deepEqual(normalized.extensions.futureRoot, { enabled: true, stages: ['draft', 'review'] })
  assert.deepEqual(normalized.homologue?.extensions.futureHomologueField, { source: 'future-service' })
  assert.equal(normalized.geometry.extensions.futureGeometryFlag, true)
  assert.deepEqual(normalized.bomLines[0]?.extensions.futureLineField, ['keep', 2])
  assert.deepEqual(normalized.commercialScenario.extensions.futureScenarioField, { owner: 'Ventas' })

  const serialized = serializeEstimationDraft(normalized)
  const reparsed = normalizeEstimationDraft(serialized as EstimationDraftJsonObject)
  assert.deepEqual(reparsed.extensions.futureRoot, { enabled: true, stages: ['draft', 'review'] })
  assert.deepEqual(reparsed.homologue?.extensions.futureHomologueField, { source: 'future-service' })
  assert.equal(reparsed.geometry.extensions.futureGeometryFlag, true)
  assert.deepEqual(reparsed.bomLines[0]?.extensions.futureLineField, ['keep', 2])
  assert.deepEqual(reparsed.commercialScenario.extensions.futureScenarioField, { owner: 'Ventas' })
  assert.equal(Object.hasOwn(serialized, 'extensions'), false)
})

test('asigna IDs deterministas y únicos a líneas ausentes o duplicadas', () => {
  const draft = normalizeEstimationDraft({
    bomLines: [
      { id: ' duplicate ' },
      { id: 'duplicate' },
      { id: '' },
      {},
    ],
  })

  assert.deepEqual(draft.bomLines.map(line => line.id), [
    'duplicate',
    'duplicate-2',
    'line-3',
    'line-4',
  ])
  assert.equal(new Set(draft.bomLines.map(line => line.id)).size, draft.bomLines.length)
})

test('migra hojas SAP heredadas con evidencia MP-01 a costo SAP directo', () => {
  const migrated = normalizeEstimationDraft({
    bomLines: [{
      id: 'sap-leaf',
      origin: 'sap',
      sapItemCode: 'CMPD01-0022-000-0000',
      quantity: 1,
      uom: 'KG',
      costCategory: 'material',
      costStrategy: 'manual_override',
      unitCost: 18_687,
      costEvidence: { source: 'warehouse_average', warehouseCode: 'MP-01' },
    }],
  })
  assert.equal(migrated.bomLines[0]?.costStrategy, 'sap_direct')

  const pendingSap = normalizeEstimationDraft({
    bomLines: [{
      id: 'pending-sap',
      origin: 'sap',
      sapItemCode: 'PINP01-0006-000-0000',
      costStrategy: 'manual_override',
      costEvidence: { source: 'unavailable', warning: 'Registra un costo manual con motivo.' },
    }],
  })
  assert.equal(pendingSap.bomLines[0]?.costEvidence?.warning?.includes('costo manual'), false)

  const explicitManual = normalizeEstimationDraft({
    bomLines: [{
      id: 'legacy-manual',
      origin: 'sap',
      sapItemCode: 'LEGACY',
      costStrategy: 'manual_override',
      costEvidence: { source: 'manual' },
    }],
  })
  assert.equal(explicitManual.bomLines[0]?.costStrategy, 'manual_override')
})

test('congela los factores de MS y no cambia el snapshot si luego cambia el cálculo vivo', () => {
  const calibration: SyntheticMarbleCalibration = {
    mixture: {
      metric: 'mixture',
      sampleIds: ['real-1', 'real-2'],
      sampleCount: 2,
      driverTotal: 4_000_000,
      consumptionTotal: 11,
      factor: 11 / 4_000_000,
      simpleMeanRatio: 0.0000028,
      minRatio: 0.0000025,
      maxRatio: 0.000003,
    },
    gelcoat: null,
  }

  const frozen = freezeSyntheticMarbleCalibration(calibration, ' 2026-08-11T12:00:00Z ')
  assert.ok(frozen)
  if (!frozen) return

  calibration.mixture?.sampleIds.push('later-sample')
  calibration.mixture!.factor = 99

  assert.equal(frozen.frozenAt, '2026-08-11T12:00:00Z')
  assert.deepEqual(frozen.mixture?.sampleIds, ['real-1', 'real-2'])
  assert.equal(frozen.mixture?.factor, 11 / 4_000_000)
  assert.equal(frozen.gelcoat, null)

  const draft = createEmptyEstimationDraft()
  assert.equal(hasFrozenSyntheticMarbleCalibration(draft), false)
  draft.syntheticMarbleCalibration = frozen
  assert.equal(hasFrozenSyntheticMarbleCalibration(draft), true)
})
