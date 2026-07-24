import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeReferenceBom } from './referenceImportAnalysis'
import { boardRoleFromReferenceContext } from './boardRoleInference'
import { assessBoardFullProductRuleCandidate, buildBoardMatrixRows, deriveBoardConditionalRuleStrategies, detectBoardDualCandidates, evaluateGlobalBoardDualCandidate, summarizeBoardEvidenceExamples, summarizeBoardProfileEvidence } from './boardMatrix'
import { canonicalBomStructureJson, resolveBomForSku } from './resolve'
import { isBoardMaterialApplicationScope } from './referenceImportScopes'
import { buildComponentTechnicalMetadata, inferBoardApplicationScope, inferMaterialProfile, normalizeSapLengthToMm } from './sapMapping'
import type {
  BomOverrides,
  BomStructure,
  Colorway,
  ComponentItem,
} from './types'
import type { BoardMatrixEvidence, ColorConfiguration, DirectBomSnapshot, NormalizedSapBomLine } from './referenceImportTypes'

const emptyOverrides: BomOverrides = { schema_version: 2, operations: [], color_overrides: [] }

function metadata(input: Partial<ReturnType<typeof buildComponentTechnicalMetadata>> = {}) {
  return {
    material_kind: 'other' as const,
    material_profile: null,
    material_profile_source: null,
    thickness_mm: null,
    purchase_length: null,
    purchase_length_unit: null,
    purchase_length_mm: null,
    purchase_width: null,
    purchase_width_unit: null,
    purchase_width_mm: null,
    purchase_height: null,
    purchase_height_unit: null,
    purchase_height_mm: null,
    format_key: null,
    metadata_source: 'unknown' as const,
    ...input,
  }
}

function line(input: {
  baseItemCode: string
  variantCode4?: string
  sourceOrder: number
  occurrence?: number
  itemName?: string
  qty?: number
  warehouse?: string | null
  technicalMetadata?: ReturnType<typeof metadata>
}): NormalizedSapBomLine {
  const variantCode4 = input.variantCode4 ?? '0000'
  return {
    itemCode: `${input.baseItemCode}-${variantCode4}`,
    itemName: input.itemName ?? input.baseItemCode,
    baseItemCode: input.baseItemCode,
    variantCode4,
    isSalesSku: false,
    occurrence: input.occurrence ?? 1,
    lineIdentity: `${input.baseItemCode}#${input.occurrence ?? 1}`,
    sourceOrder: input.sourceOrder,
    sapChildNum: input.sourceOrder - 1,
    qty: input.qty ?? 1,
    warehouse: input.warehouse ?? '01',
    issueMethod: 'im_Manual',
    inventoryUom: 'UND',
    technicalMetadata: input.technicalMetadata ?? metadata(),
  }
}

function snapshot(skuComplete: string, skuColorCode: string, lines: NormalizedSapBomLine[]): DirectBomSnapshot {
  return {
    skuComplete,
    skuColorCode,
    sapItemName: null,
    treeCode: skuComplete,
    treeType: 'iProductionTree',
    lineCount: lines.length,
    status: 'captured',
    errorMessage: null,
    directBomJson: {},
    normalizedLines: lines,
  }
}

function component(itemCode: string, itemName: string, technicalMetadata = metadata()): ComponentItem {
  const parts = itemCode.split('-')
  return {
    item_code: itemCode,
    base_item_code: parts.slice(0, 3).join('-'),
    variant_code_4: parts[3] ?? '0000',
    item_name: itemName,
    base_item_name: itemName,
    uom: 'M2',
    component_category: 'material',
    default_issue_method: 'im_Manual',
    sap_valid: true,
    sap_frozen: false,
    is_inventory_item: true,
    item_bom_structure: {
      schema_version: 2,
      structure_type: 'component',
      input_warehouse_code: null,
      output_warehouse_code: null,
      lines: [],
    },
    technical_metadata: technicalMetadata,
  }
}

function boardEvidence(input: Partial<BoardMatrixEvidence> & Pick<BoardMatrixEvidence, 'skuComplete' | 'boardColorCode' | 'role'>): BoardMatrixEvidence {
  return {
    skuItemName: null,
    lineIdentity: 'CMPD06-0001-000#1',
    baseItemCode: 'CMPD06-0001-000',
    itemCode: `CMPD06-0001-000-${input.boardColorCode}`,
    materialProfile: 'ST',
    thicknessMm: 15,
    formatKey: '1830x2440x15',
    qty: 0.89,
    roleSource: input.role === 'role_pending' ? 'pending' : 'published_bom',
    ...input,
  }
}

test('normalizes SAP purchase dimensions and CARB profiles', () => {
  assert.equal(normalizeSapLengthToMm(1.83, 4), 1830)
  assert.equal(normalizeSapLengthToMm(2.44, 4), 2440)
  assert.deepEqual(inferMaterialProfile('TABLERO CARB 15MM'), { normalized: 'CARB2', source: 'CARB' })

  const result = buildComponentTechnicalMetadata({
    PurchaseUnitLength: 1.83,
    PurchaseLengthUnit: 4,
    PurchaseUnitWidth: 2.44,
    PurchaseWidthUnit: 4,
    PurchaseUnitHeight: 15,
    PurchaseHeightUnit: 1,
  }, 'TABLERO CARB 15MM')
  assert.equal(result.format_key, '1830x2440x15')
  assert.equal(result.material_profile, 'CARB2')
})

test('infers CARB2 RH profile from "FONDO CARB RH" descriptions', () => {
  assert.deepEqual(inferMaterialProfile('FONDO CARB RH 4MM CINZA/GRIS CLARO'), { normalized: 'CARB2 RH', source: 'CARB2 RH' })
  assert.deepEqual(inferMaterialProfile('TABLERO CARB2 RH 15MM'), { normalized: 'CARB2 RH', source: 'CARB2 RH' })
  assert.deepEqual(inferMaterialProfile('TABLERO CARB 15MM'), { normalized: 'CARB2', source: 'CARB' })
  assert.deepEqual(inferMaterialProfile('TABLERO RH 15MM'), { normalized: 'RH', source: 'RH' })
  assert.deepEqual(inferMaterialProfile('TABLERO ST 15MM'), { normalized: 'ST', source: 'ST' })
  assert.deepEqual(inferMaterialProfile('TABLERO CARB2 18MM'), { normalized: 'CARB2', source: 'CARB2' })
  assert.deepEqual(inferMaterialProfile('TABLERO 15MM'), { normalized: null, source: null })
})

test('classifies only board fondo materials as drawer bottoms', () => {
  assert.equal(inferBoardApplicationScope({
    itemName: 'FONDO CARB RH 4MM CINZA/GRIS CLARO',
    baseItemCode: 'CMPD06-0030-000',
    materialKind: 'board',
  }), 'drawer_bottom')
  assert.equal(inferBoardApplicationScope({
    itemName: 'TABLERO ST 15MM',
    baseItemCode: 'CMPD06-0001-000',
    materialKind: 'board',
  }), null)
  assert.equal(inferBoardApplicationScope({
    itemName: 'FONDO CAJON SUP',
    baseItemCode: 'CMPD09-0015-000',
    materialKind: 'board',
  }), null)
  assert.equal(inferBoardApplicationScope({
    itemName: 'FONDO CARB RH 4MM',
    baseItemCode: 'CMPD06-0030-000',
    materialKind: 'other',
  }), null)
})

test('keeps the main board and drawer bottom in separate matrix roles', () => {
  const configuration: ColorConfiguration = {
    code4dig: '0437',
    colorMode: 'full',
    applicationColors: { full_product: '0437', drawer_bottom: '0467' },
    applicationMaterialProfiles: { full_product: 'ST', drawer_bottom: 'CARB2 RH' },
    allowedProductTypes: [],
    allowedManufacturingProcesses: [],
  }
  const rows = buildBoardMatrixRows({
    colorConfigurations: new Map([['0437', configuration]]),
    evidence: [
      { sourceColorCode: '0437', item: boardEvidence({ skuComplete: 'VBAN12-0081-000-0437', boardColorCode: '0437', materialProfile: 'ST', role: 'full_product' }) },
      { sourceColorCode: '0437', item: boardEvidence({ skuComplete: 'VBAN12-0081-000-0437', boardColorCode: '0467', materialProfile: 'CARB2 RH', role: 'drawer_bottom', baseItemCode: 'CMPD06-0030-000' }) },
    ],
  })

  assert.deepEqual(rows.map(row => [row.role, row.proposedColorCode, row.status]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))), [
    ['drawer_bottom', '0467', 'matches'],
    ['full_product', '0437', 'matches'],
  ])
  assert.equal(rows.some(row => row.status === 'variation_by_design'), false)
})

test('classifies the sole body board as full product when the only companion is a drawer bottom', () => {
  const mainBoard = line({
    baseItemCode: 'CMPD06-0001-000', variantCode4: '0437', sourceOrder: 1, qty: 1.47,
    itemName: 'TABLERO ST 15MM BLANCO',
    technicalMetadata: metadata({ material_kind: 'board', material_profile: 'ST', material_profile_source: 'ST', thickness_mm: 15, format_key: '2440x1530x15', metadata_source: 'sap_and_name' }),
  })
  const drawerBottom = line({
    baseItemCode: 'CMPD06-0030-000', variantCode4: '0467', sourceOrder: 2, qty: 0.16,
    itemName: 'FONDO CARB RH 4MM CINZA/GRIS CLARO',
    technicalMetadata: metadata({ material_kind: 'board', material_profile: 'CARB2 RH', material_profile_source: 'CARB2 RH', thickness_mm: 4, format_key: '2440x1220x4', metadata_source: 'sap_and_name' }),
  })
  const directSnapshot = snapshot('VBAN12-0081-000-0437', '0437', [mainBoard, drawerBottom])
  const context = {
    referenceId: 'reference', familyCode: 'BAN12', referenceCode: '0081', productName: 'Macao',
    manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
  }

  assert.deepEqual(boardRoleFromReferenceContext({ context, snapshot: directSnapshot, line: mainBoard }), {
    role: 'full_product', roleSource: 'evidence',
  })
  assert.deepEqual(boardRoleFromReferenceContext({ context, snapshot: directSnapshot, line: drawerBottom }), {
    role: 'drawer_bottom', roleSource: 'evidence',
  })
})

test('fresh SAP import classifies a fondo board as drawer bottom', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN12', referenceCode: '0081', productName: 'Macao',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [snapshot('VBAN12-0081-000-0437', '0437', [line({
      baseItemCode: 'CMPD06-0030-000', variantCode4: '0467', sourceOrder: 1, qty: 0.16,
      itemName: 'FONDO CARB RH 4MM CINZA/GRIS CLARO',
      technicalMetadata: metadata({ material_kind: 'board', material_profile: 'CARB2 RH', material_profile_source: 'CARB2 RH', thickness_mm: 4, format_key: '2440x1220x4', metadata_source: 'sap_and_name' }),
    })])],
    colorConfigurations: new Map([['0437', {
      code4dig: '0437', colorMode: 'full',
      applicationColors: { full_product: '0437', drawer_bottom: '0467' },
      applicationMaterialProfiles: { full_product: 'ST', drawer_bottom: 'CARB2 RH' },
      allowedProductTypes: [], allowedManufacturingProcesses: [],
    }]]),
  })

  assert.equal(analysis.proposedBomStructure.lines[0]?.product_application_scope, 'drawer_bottom')
  const fondo = component('CMPD06-0030-000-0467', 'FONDO CARB RH 4MM', metadata({ material_kind: 'board', material_profile: 'CARB2 RH' }))
  const resolved = resolveBomForSku({
    skuComplete: 'VBAN12-0081-000-0437', skuColorCode: '0437', structure: analysis.proposedBomStructure,
    globalOverrides: emptyOverrides, versionOverrides: emptyOverrides,
    colorway: {
      code_4dig: '0437', name_color_sap: 'BLANCO', color_mode: 'full',
      application_colors_json: { full_product: '0437', drawer_bottom: '0467' },
      application_material_profiles_json: { full_product: 'ST', drawer_bottom: 'CARB2 RH' },
      allowed_product_types: [], is_active: true,
    },
    componentItems: new Map([[fondo.item_code, fondo]]),
  })
  assert.deepEqual(resolved.map(item => `${item.product_application_scope}:${item.resolved_item_code}`), [
    'drawer_bottom:CMPD06-0030-000-0467',
  ])
})


test('groups mutually exclusive ST and CARB2 boards into one logical position', () => {
  const sharedLines = Array.from({ length: 16 }, (_, index) => line({
    baseItemCode: `CEMP03-${String(index + 1).padStart(4, '0')}-000`,
    sourceOrder: index < 3 ? index + 1 : index + 2,
  }))
  const boardSt = line({
    baseItemCode: 'CMPD06-0001-000',
    variantCode4: '0437',
    sourceOrder: 4,
    itemName: 'TABLERO ST 15MM BLANCO',
    qty: 0.89,
    technicalMetadata: metadata({
      material_kind: 'board',
      material_profile: 'ST',
      material_profile_source: 'ST',
      thickness_mm: 15,
      format_key: '1830x2440x15',
      metadata_source: 'sap_and_name',
    }),
  })
  const boardCarb = line({
    baseItemCode: 'CMPD06-0008-000',
    variantCode4: '0442',
    sourceOrder: 4,
    itemName: 'TABLERO CARB 15MM CENIZA',
    qty: 0.92,
    technicalMetadata: metadata({
      material_kind: 'board',
      material_profile: 'CARB2',
      material_profile_source: 'CARB',
      thickness_mm: 15,
      format_key: '1530x2440x15',
      metadata_source: 'sap_and_name',
    }),
  })
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference',
      familyCode: 'BAN05',
      referenceCode: '0001',
      productName: 'Prueba',
      manufacturingProcess: 'MUEBLES',
      productType: 'CABINET',
    },
    snapshots: [
      snapshot('VBAN05-0001-000-0437', '0437', [...sharedLines, boardSt]),
      snapshot('VBAN05-0001-000-0442', '0442', [...sharedLines, boardCarb]),
    ],
    colorConfigurations: new Map([
      ['0437', {
        code4dig: '0437',
        colorMode: 'full',
        applicationColors: { full_product: '0437' },
        applicationMaterialProfiles: { full_product: 'ST' },
        allowedProductTypes: [],
        allowedManufacturingProcesses: [],
      }],
      ['0442', {
        code4dig: '0442',
        colorMode: 'full',
        applicationColors: { full_product: '0442' },
        applicationMaterialProfiles: { full_product: 'CARB2' },
        allowedProductTypes: [],
        allowedManufacturingProcesses: [],
      }],
    ]),
  })
  assert.equal(analysis.proposedBomStructure.lines.length, 17)
  const materialGroup = analysis.proposedBomStructure.lines.find(item => item.line_kind === 'material_group')
  assert.ok(materialGroup)
  assert.deepEqual(materialGroup.alternatives.map(item => item.material_profile), ['CARB2'])
  assert.equal(materialGroup.alternatives[0]?.is_default, false)
  assert.deepEqual(materialGroup.board_physical_specification, { material_kind: 'board', thickness_mm: 15 })
  assert.deepEqual(materialGroup.consumptions
    .filter(item => item.color_mode === 'full' && item.product_application_scope === 'full_product')
    .map(item => [item.material_profile, item.format_key, item.qty, item.status])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0]))), [
    ['CARB2', null, 0.92, 'observed'],
  ])
  assert.equal(materialGroup.consumptions.some(item => item.status === 'needs_definition'), false)
  assert.equal(materialGroup.uom, 'UND')
  assert.equal(analysis.findings.some(finding => finding.findingType === 'board_default_profile_tie' && finding.severity === 'blocker'), true)
})

test('normalizes one board consumption to the highest value across physical formats', () => {
  const boardSmall = line({
    baseItemCode: 'CMPD06-0001-000', variantCode4: '0387', sourceOrder: 1, qty: 0.89,
    itemName: 'TABLERO ST 15MM',
    technicalMetadata: metadata({ material_kind: 'board', material_profile: 'ST', material_profile_source: 'ST', thickness_mm: 15, format_key: '1530x2440x15', metadata_source: 'sap_and_name' }),
  })
  const boardLarge = line({
    baseItemCode: 'CMPD06-0002-000', variantCode4: '0437', sourceOrder: 1, qty: 0.92,
    itemName: 'TABLERO ST 15MM',
    technicalMetadata: metadata({ material_kind: 'board', material_profile: 'ST', material_profile_source: 'ST', thickness_mm: 15, format_key: '1830x2440x15', metadata_source: 'sap_and_name' }),
  })
  const analysis = analyzeReferenceBom({
    context: { referenceId: 'reference', familyCode: 'BAN05', referenceCode: '0001', productName: 'Prueba', manufacturingProcess: 'MUEBLES', productType: 'CABINET' },
    snapshots: [
      snapshot('VBAN05-0001-000-0387', '0387', [boardSmall]),
      snapshot('VBAN05-0001-000-0437', '0437', [boardLarge]),
    ],
    colorConfigurations: new Map([
      ['0387', { code4dig: '0387', colorMode: 'full', applicationColors: { full_product: '0387' }, applicationMaterialProfiles: { full_product: 'ST' }, allowedProductTypes: [], allowedManufacturingProcesses: [] }],
      ['0437', { code4dig: '0437', colorMode: 'full', applicationColors: { full_product: '0437' }, applicationMaterialProfiles: { full_product: 'ST' }, allowedProductTypes: [], allowedManufacturingProcesses: [] }],
    ]),
  })
  const materialGroup = analysis.proposedBomStructure.lines.find(line => line.line_kind === 'material_group')
  const consumption = materialGroup?.consumptions.find(item => item.color_mode === 'full' && item.product_application_scope === 'full_product' && item.material_profile === 'ST')
  assert.deepEqual(consumption, { color_mode: 'full', product_application_scope: 'full_product', material_profile: 'ST', format_key: null, qty: 0.92, status: 'observed' })
})

test('does not propose an already configured edge color when other colors still need review', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN05', referenceCode: '0001', productName: 'Prueba',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [
      snapshot('VBAN05-0001-000-0439', '0439', [line({
        baseItemCode: 'CMPD06-0003-000', variantCode4: '0462', sourceOrder: 1, itemName: 'CANTO PVC 19X0,45MM',
      })]),
      snapshot('VBAN05-0001-000-0493', '0493', [line({
        baseItemCode: 'CMPD06-0003-000', variantCode4: '1371', sourceOrder: 1, itemName: 'CANTO PVC 19X0,45MM',
      })]),
    ],
    colorConfigurations: new Map<string, ColorConfiguration>([
      ['0439', {
        code4dig: '0439', colorMode: 'equivalent', applicationColors: { edge_band_full_product: '0462' }, applicationMaterialProfiles: {},
        allowedProductTypes: ['MUEBLE'], allowedManufacturingProcesses: ['MUEBLES NACIONAL'],
      }],
      ['0493', {
        code4dig: '0493', colorMode: 'full', applicationColors: {}, applicationMaterialProfiles: {},
        allowedProductTypes: ['MUEBLE'], allowedManufacturingProcesses: ['MUEBLES NACIONAL'],
      }],
    ]),
  })
  const colorRuleSources = analysis.findings
    .filter(finding => finding.findingType === 'color_rule_proposal')
    .map(finding => String(finding.detailsJson.source_color_code))
  assert.deepEqual(colorRuleSources, ['0493'])
  const review = analysis.findings.find(finding => finding.findingType === 'bom_line_review')
  assert.ok(review)
  const reviewColors = Array.isArray(review.detailsJson.by_sku)
    ? review.detailsJson.by_sku.map(item => String((item as { sku_color_code?: unknown }).sku_color_code))
    : []
  assert.deepEqual(reviewColors, ['0493'])
})

test('keeps same-color edge bands in one unicolor proposal before SAP verifies the catalog', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN05', referenceCode: '0122', productName: 'Prueba dual',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [
      snapshot('VBAN05-0122-000-0493', '0493', [
        line({ baseItemCode: 'CMPD06-0003-000', variantCode4: '1371', sourceOrder: 1, itemName: 'CANTO PVC 19X0,45MM NARDO' }),
        line({ baseItemCode: 'CMPD06-0005-000', variantCode4: '1371', sourceOrder: 2, itemName: 'CANTO PVC 19X2MM NARDO' }),
      ]),
    ],
    colorConfigurations: new Map<string, ColorConfiguration>([
      ['0493', {
        code4dig: '0493', colorMode: 'full', applicationColors: { full_product: '0493' }, applicationMaterialProfiles: {},
        allowedProductTypes: ['MUEBLE'], allowedManufacturingProcesses: ['MUEBLES NACIONAL'],
      }],
    ]),
  })
  const proposals = analysis.findings
    .filter(finding => finding.findingType === 'color_rule_proposal')
    .map(finding => `${finding.proposedScope}:${finding.proposedColorCode}`)
    .sort()
  assert.deepEqual([...new Set(proposals)], ['edge_band_full_product:1371'])
})

test('preserves a unicolor rule while accepting a Dual case only for its identified SKU', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN05', referenceCode: '0122', productName: 'Prueba híbrida',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [
      snapshot('VBAN05-0001-000-0493', '0493', [
        line({ baseItemCode: 'CMPD06-0003-000', variantCode4: '1371', sourceOrder: 1, itemName: 'CANTO PVC 19X0,45MM NARDO' }),
        line({ baseItemCode: 'CMPD06-0005-000', variantCode4: '1371', sourceOrder: 2, itemName: 'CANTO PVC 19X2MM NARDO' }),
      ]),
      snapshot('VBAN05-0122-000-0493', '0493', [
        line({ baseItemCode: 'CMPD06-0003-000', variantCode4: '1371', sourceOrder: 1, itemName: 'CANTO PVC 19X0,45MM NARDO' }),
        line({ baseItemCode: 'CMPD06-0005-000', variantCode4: '0467', sourceOrder: 2, itemName: 'CANTO PVC 19X2MM CINZA COBALTO' }),
      ]),
    ],
    colorConfigurations: new Map<string, ColorConfiguration>([
      ['0493', {
        code4dig: '0493', colorMode: 'full',
        applicationColors: { full_product: '1371', edge_band_full_product: '1371' },
        hybridColorCases: [{
          case_id: 'dual_0493_0122',
          color_mode: 'dual',
          sku_completes: ['VBAN05-0122-000-0493'],
          application_colors: { structure: '1371', front: '0467', edge_band_body: '1371', edge_band_front: '0467' },
        }],
        applicationMaterialProfiles: {}, allowedProductTypes: ['MUEBLE'], allowedManufacturingProcesses: ['MUEBLES NACIONAL'],
      }],
    ]),
  })
  assert.equal(analysis.findings.some(finding => finding.findingType === 'color_rule_proposal'), false)
  assert.equal(analysis.findings.some(finding => finding.findingType === 'bom_line_review'), false)
})

test('classifies configured dual edge colors by their configured colors, not by a base item code', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN05', referenceCode: '0122', productName: 'Prueba dual',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [
      snapshot('VBAN05-0122-000-0493', '0493', [
        line({ baseItemCode: 'CMPD06-0003-000', variantCode4: '1371', sourceOrder: 1, occurrence: 1, itemName: 'CANTO PVC 19X0,45MM NARDO' }),
        line({ baseItemCode: 'CMPD06-0003-000', variantCode4: '0467', sourceOrder: 2, occurrence: 2, itemName: 'CANTO PVC 19X0,45MM CINZA COBALTO' }),
      ]),
    ],
    colorConfigurations: new Map<string, ColorConfiguration>([
      ['0493', {
        code4dig: '0493', colorMode: 'dual',
        applicationColors: { structure: '1371', front: '0467', edge_band_body: '1371', edge_band_front: '0467' }, applicationMaterialProfiles: {},
        allowedProductTypes: ['MUEBLE'], allowedManufacturingProcesses: ['MUEBLES NACIONAL'],
      }],
    ]),
  })
  const edgeScopes = analysis.proposedBomStructure.lines
    .filter(item => item.base_item_code === 'CMPD06-0003-000')
    .map(item => item.product_application_scope)
    .sort()
  assert.deepEqual(edgeScopes, ['edge_band_body', 'edge_band_front'])
})

test('uses the confirmed dual edge mapping to classify direct board colors', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN05', referenceCode: '0122', productName: 'Prueba dual',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [
      snapshot('VBAN05-0122-000-0493', '0493', [
        line({
          baseItemCode: 'CMPD06-0008-000', variantCode4: '1371', sourceOrder: 1, itemName: 'TABLERO CARB 15MM NARDO',
          technicalMetadata: metadata({ material_kind: 'board', material_profile: 'CARB2', material_profile_source: 'CARB', thickness_mm: 15, format_key: '1830x2440x15', metadata_source: 'sap_and_name' }),
        }),
        line({
          baseItemCode: 'CMPD06-0004-000', variantCode4: '0467', sourceOrder: 2, itemName: 'TABLERO RH 15MM CINZA COBALTO SOFT',
          technicalMetadata: metadata({ material_kind: 'board', material_profile: 'RH', material_profile_source: 'RH', thickness_mm: 15, format_key: '2150x2440x15', metadata_source: 'sap_and_name' }),
        }),
      ]),
    ],
    colorConfigurations: new Map<string, ColorConfiguration>([
      ['0493', {
        code4dig: '0493', colorMode: 'dual',
        applicationColors: { structure: '1371', front: '0467', edge_band_body: '1371', edge_band_front: '0467' },
        applicationMaterialProfiles: { structure: 'CARB2', front: 'RH' },
        allowedProductTypes: ['MUEBLE'], allowedManufacturingProcesses: ['MUEBLES NACIONAL'],
      }],
    ]),
  })
  const boardScopes = analysis.proposedBomStructure.lines
    .filter(line => line.line_kind === 'material_group')
    .map(line => `${line.alternatives[0]?.base_item_code}:${line.product_application_scope}`)
    .sort()
  assert.deepEqual(boardScopes, ['CMPD06-0004-000:front', 'CMPD06-0008-000:structure'])
})

test('resolves dual structure and front colors for boards and edge bands', () => {
  const structure: BomStructure = {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: '01',
    output_warehouse_code: null,
    lines: [
      { line_id: 'ln_000001', sort_order: 1, line_kind: 'fixed', base_item_code: 'CMPD06-0008-000', product_application_scope: 'structure', qty: 0.74, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
      { line_id: 'ln_000002', sort_order: 2, line_kind: 'fixed', base_item_code: 'CMPD06-0004-000', product_application_scope: 'front', qty: 0.74, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
      { line_id: 'ln_000003', sort_order: 3, line_kind: 'fixed', base_item_code: 'CMPD06-0003-000', product_application_scope: 'edge_band_body', qty: 7.22, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
      { line_id: 'ln_000004', sort_order: 4, line_kind: 'fixed', base_item_code: 'CMPD06-0005-000', product_application_scope: 'edge_band_front', qty: 2.9, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
    ],
  }
  const components = new Map([
    ['CMPD06-0008-000-1371', component('CMPD06-0008-000-1371', 'TABLERO CARB 15MM NARDO')],
    ['CMPD06-0004-000-0467', component('CMPD06-0004-000-0467', 'TABLERO RH 15MM CINZA COBALTO SOFT')],
    ['CMPD06-0003-000-1371', component('CMPD06-0003-000-1371', 'CANTO PVC 19X0,45MM NARDO')],
    ['CMPD06-0005-000-0467', component('CMPD06-0005-000-0467', 'CANTO PVC 19X2MM CINZA COBALTO')],
  ])
  const resolved = resolveBomForSku({
    skuComplete: 'VBAN05-0122-000-0493',
    skuColorCode: '0493',
    structure,
    globalOverrides: emptyOverrides,
    versionOverrides: emptyOverrides,
    colorway: {
      code_4dig: '0493', name_color_sap: 'CINZA', color_mode: 'dual',
      application_colors_json: {
        structure: '1371', front: '0467', edge_band_body: '1371', edge_band_front: '0467',
      },
      application_material_profiles_json: {}, allowed_product_types: [], is_active: true,
    },
    componentItems: components,
  })
  assert.deepEqual(resolved.map(line => line.resolved_item_code), [
    'CMPD06-0008-000-1371',
    'CMPD06-0004-000-0467',
    'CMPD06-0003-000-1371',
    'CMPD06-0005-000-0467',
  ])
})

test('keeps the unicolor product mapping while explicit BOM roles use structure and front', () => {
  const unicolorStructure: BomStructure = {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: '01',
    output_warehouse_code: null,
    lines: [{ line_id: 'full', sort_order: 1, line_kind: 'fixed', base_item_code: 'CMPD06-0008-000', product_application_scope: 'full_product', qty: 1, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] }],
  }
  const dualStructure: BomStructure = {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: '01',
    output_warehouse_code: null,
    lines: [
      { line_id: 'structure', sort_order: 1, line_kind: 'fixed', base_item_code: 'CMPD06-0008-000', product_application_scope: 'structure', qty: 1, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
      { line_id: 'front', sort_order: 2, line_kind: 'fixed', base_item_code: 'CMPD06-0004-000', product_application_scope: 'front', qty: 1, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
    ],
  }
  const colorway: Colorway = {
    code_4dig: '0493', name_color_sap: 'AUSTRAL', color_mode: 'full',
    application_colors_json: { full_product: '0493', structure: '1375', front: '1371' },
    application_material_profiles_json: { structure: 'CARB2', front: 'CARB2' }, allowed_product_types: [], is_active: true,
  }
  const components = new Map([
    ['CMPD06-0008-000-0493', component('CMPD06-0008-000-0493', 'TABLERO AUSTRAL')],
    ['CMPD06-0008-000-1375', component('CMPD06-0008-000-1375', 'TABLERO BLANCO')],
    ['CMPD06-0004-000-1371', component('CMPD06-0004-000-1371', 'TABLERO NARDO')],
  ])
  const baseInput = { skuComplete: 'VCOC01-0155-000-0493', skuColorCode: '0493', globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway, componentItems: components }

  assert.deepEqual(resolveBomForSku({ ...baseInput, structure: unicolorStructure }).map(line => line.resolved_item_code), ['CMPD06-0008-000-0493'])
  assert.deepEqual(resolveBomForSku({ ...baseInput, structure: dualStructure }).map(line => line.resolved_item_code), ['CMPD06-0008-000-1375', 'CMPD06-0004-000-1371'])
})

test('uses a Dual case only for its complete SKU and preserves the unicolor default', () => {
  const structure: BomStructure = {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: '01',
    output_warehouse_code: null,
    lines: [
      { line_id: 'ln_000001', sort_order: 1, line_kind: 'fixed', base_item_code: 'CMPD06-0008-000', product_application_scope: 'structure', qty: 1, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
      { line_id: 'ln_000002', sort_order: 2, line_kind: 'fixed', base_item_code: 'CMPD06-0004-000', product_application_scope: 'front', qty: 1, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
      { line_id: 'ln_000003', sort_order: 3, line_kind: 'fixed', base_item_code: 'CMPD06-0003-000', product_application_scope: 'edge_band_body', qty: 1, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
      { line_id: 'ln_000004', sort_order: 4, line_kind: 'fixed', base_item_code: 'CMPD06-0005-000', product_application_scope: 'edge_band_front', qty: 1, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
    ],
  }
  const components = new Map([
    ['CMPD06-0008-000-1371', component('CMPD06-0008-000-1371', 'TABLERO CARB 15MM NARDO')],
    ['CMPD06-0004-000-1371', component('CMPD06-0004-000-1371', 'TABLERO RH 15MM NARDO')],
    ['CMPD06-0004-000-0467', component('CMPD06-0004-000-0467', 'TABLERO RH 15MM CINZA COBALTO')],
    ['CMPD06-0003-000-1371', component('CMPD06-0003-000-1371', 'CANTO PVC 19X0,45MM NARDO')],
    ['CMPD06-0005-000-1371', component('CMPD06-0005-000-1371', 'CANTO PVC 19X2MM NARDO')],
    ['CMPD06-0005-000-0467', component('CMPD06-0005-000-0467', 'CANTO PVC 19X2MM CINZA COBALTO')],
  ])
  const colorway: Colorway = {
    code_4dig: '0493', name_color_sap: 'CINZA', color_mode: 'full',
    application_colors_json: { full_product: '1371', edge_band_full_product: '1371' },
    hybrid_color_cases: [{
      case_id: 'dual_0493_0122', color_mode: 'dual', sku_completes: ['VBAN05-0122-000-0493'],
      application_colors: { structure: '1371', front: '0467', edge_band_body: '1371', edge_band_front: '0467' },
    }],
    application_material_profiles_json: {}, allowed_product_types: [], is_active: true,
  }

  const unicolor = resolveBomForSku({
    skuComplete: 'VBAN05-0001-000-0493', skuColorCode: '0493', structure,
    globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway, componentItems: components,
  })
  assert.deepEqual(unicolor.map(line => line.resolved_item_code), [
    'CMPD06-0008-000-1371', 'CMPD06-0004-000-1371', 'CMPD06-0003-000-1371', 'CMPD06-0005-000-1371',
  ])

  const dual = resolveBomForSku({
    skuComplete: 'VBAN05-0122-000-0493', skuColorCode: '0493', structure,
    globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway, componentItems: components,
  })
  assert.deepEqual(dual.map(line => line.resolved_item_code), [
    'CMPD06-0008-000-1371', 'CMPD06-0004-000-0467', 'CMPD06-0003-000-1371', 'CMPD06-0005-000-0467',
  ])
})

test('resolves full board by configured material profile and color mapping', () => {
  const structure: BomStructure = {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: '01',
    output_warehouse_code: null,
    lines: [{
      line_id: 'ln_000004',
      sort_order: 4,
      line_kind: 'material_group',
      base_item_code: null,
      product_application_scope: 'full_product',
      qty: null,
      input_warehouse_code: null,
      issue_method_override: null,
      alternatives: [
        { alternative_id: 'alt_01', base_item_code: 'CMPD06-0001-000', material_profile: 'ST', is_default: true },
        { alternative_id: 'alt_02', base_item_code: 'CMPD06-0008-000', material_profile: 'CARB2', is_default: false },
      ],
      consumptions: [
        { color_mode: 'full', product_application_scope: 'full_product', material_profile: 'ST', format_key: '1830x2440x15', qty: 0.89, status: 'confirmed' },
        { color_mode: 'full', product_application_scope: 'full_product', material_profile: 'CARB2', format_key: '1530x2440x15', qty: 0.92, status: 'confirmed' },
        { color_mode: 'dual', product_application_scope: 'structure', material_profile: 'ST', format_key: null, qty: null, status: 'needs_definition' },
        { color_mode: 'dual', product_application_scope: 'front', material_profile: 'ST', format_key: null, qty: null, status: 'needs_definition' },
      ],
    }, {
      line_id: 'ln_000005',
      sort_order: 5,
      line_kind: 'fixed',
      base_item_code: 'CEMP03-0001-000',
      product_application_scope: 'edge_band_full_product',
      qty: 4.2,
      input_warehouse_code: null,
      issue_method_override: null,
      alternatives: [],
      consumptions: [],
    }],
  }
  const stItem = component('CMPD06-0001-000-0435', 'TABLERO ST 15MM', metadata({
    material_kind: 'board', material_profile: 'ST', material_profile_source: 'ST', thickness_mm: 15, format_key: '1830x2440x15', metadata_source: 'sap_and_name',
  }))
  const carbItem = component('CMPD06-0008-000-0442', 'TABLERO CARB 15MM', metadata({
    material_kind: 'board', material_profile: 'CARB2', material_profile_source: 'CARB', thickness_mm: 15, format_key: '1530x2440x15', metadata_source: 'sap_and_name',
  }))
  const edgeItem = component('CEMP03-0001-000-0462', 'CANTO COMPLETO 0462')
  const components = new Map([[stItem.item_code, stItem], [carbItem.item_code, carbItem], [edgeItem.item_code, edgeItem]])
  const stColor: Colorway = {
    code_4dig: '0439',
    name_color_sap: 'TAMBO',
    color_mode: 'equivalent',
    application_colors_json: { full_product: '0435', edge_band_full_product: '0462' },
    application_material_profiles_json: { full_product: 'ST' },
    allowed_product_types: [],
    is_active: true,
  }
  const carbColor: Colorway = {
    ...stColor,
    code_4dig: '0442',
    application_colors_json: { full_product: '0442' },
    application_material_profiles_json: { full_product: 'CARB2' },
  }
  const stResolved = resolveBomForSku({
    skuComplete: 'VBAN05-0001-000-0439', skuColorCode: '0439', structure,
    globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway: stColor, componentItems: components,
  })
  assert.equal(stResolved[0]?.resolved_item_code, 'CMPD06-0001-000-0435')
  assert.equal(stResolved[0]?.qty, 0.89)
  assert.equal(stResolved[0]?.resolution_status, 'resolved')
  assert.equal(stResolved[1]?.resolved_item_code, 'CEMP03-0001-000-0462')

  const carbResolved = resolveBomForSku({
    skuComplete: 'VBAN05-0001-000-0442', skuColorCode: '0442', structure,
    globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway: carbColor, componentItems: components,
  })
  assert.equal(carbResolved[0]?.resolved_item_code, 'CMPD06-0008-000-0442')
  assert.equal(carbResolved[0]?.qty, 0.92)
})

test('SKU color overrides take precedence over reference, global and version overrides', () => {
  const structure: BomStructure = {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: null,
    output_warehouse_code: null,
    lines: [{
      line_id: 'ln_000001', sort_order: 1, line_kind: 'fixed', base_item_code: 'CMPD06-0001-000',
      product_application_scope: 'full_product', qty: 1, input_warehouse_code: null, issue_method_override: null,
      alternatives: [], consumptions: [],
    }],
  }
  const makeOverrides = (target: string): BomOverrides => ({
    schema_version: 2,
    operations: [],
    color_overrides: [{
      override_id: target,
      color_code: '0439',
      product_application_scope: 'full_product',
      target_color_code: target,
      material_profile: null,
      reason: 'Prueba',
      source: 'manual',
    }],
  })
  const skuItem = component('CMPD06-0001-000-0999', 'TABLERO ST 15MM')
  const resolved = resolveBomForSku({
    skuComplete: 'VBAN05-0001-000-0439',
    skuColorCode: '0439',
    structure,
    referenceOverrides: makeOverrides('0435'),
    globalOverrides: makeOverrides('0462'),
    versionOverrides: makeOverrides('0475'),
    skuOverrides: makeOverrides('0999'),
    colorway: {
      code_4dig: '0439', name_color_sap: 'TAMBO', color_mode: 'equivalent',
      application_colors_json: { full_product: '0435' }, application_material_profiles_json: {}, allowed_product_types: [], is_active: true,
    },
    componentItems: new Map([[skuItem.item_code, skuItem]]),
  })
  assert.equal(resolved[0]?.resolved_item_code, 'CMPD06-0001-000-0999')
})

test('preserves a reference edge format when a SKU override changes only its logical color', () => {
  const structure: BomStructure = {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: '01',
    output_warehouse_code: null,
    lines: [
      { line_id: 'ln_000001', sort_order: 1, line_kind: 'fixed', base_item_code: 'CMPD06-0003-000', product_application_scope: 'edge_band_body', qty: 7.2, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
      { line_id: 'ln_000002', sort_order: 2, line_kind: 'fixed', base_item_code: 'CMPD06-0014-000', product_application_scope: 'edge_band_front', qty: 2.4, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
    ],
  }
  const components = new Map([
    ['CMPD06-0003-000-1371', component('CMPD06-0003-000-1371', 'CANTO PVC 19X0,45MM NARDO')],
    ['CMPD06-0014-000-1371', component('CMPD06-0014-000-1371', 'CANTO PVC 19X1,5MM NARDO')],
    ['CMPD06-0014-000-0493', component('CMPD06-0014-000-0493', 'CANTO PVC 19X1,5MM AUSTRAL')],
  ])
  const skuOverrides: BomOverrides = {
    schema_version: 2,
    operations: [],
    color_overrides: [{
      override_id: 'greco-front-edge',
      color_code: '0493',
      product_application_scope: 'edge_band_front',
      base_item_code: null,
      target_color_code: '0493',
      material_profile: null,
      reason: 'El frente de esta referencia conserva el canto Austral de 1,5 mm.',
      source: 'reference_import',
    }],
  }

  const resolved = resolveBomForSku({
    skuComplete: 'VBAN12-0022-000-0493',
    skuColorCode: '0493',
    structure,
    globalOverrides: emptyOverrides,
    versionOverrides: emptyOverrides,
    skuOverrides,
    colorway: {
      code_4dig: '0493', name_color_sap: 'AUSTRAL', color_mode: 'full',
      application_colors_json: { full_product: '1371', edge_band_full_product: '1371' },
      application_material_profiles_json: {}, allowed_product_types: [], is_active: true,
    },
    componentItems: components,
  })

  assert.deepEqual(resolved.map(line => line.resolved_item_code), [
    'CMPD06-0003-000-1371',
    'CMPD06-0014-000-0493',
  ])
})

test('uses pending semantic SKU edge overrides before the reference BOM is published', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN12', referenceCode: '0022', productName: 'Prueba canto 1,5 mm',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
      skuColorOverrides: new Map([['VBAN12-0022-000-0493', [
        {
          override_id: 'greco-body-edge', color_code: '0493', product_application_scope: 'edge_band_body',
          base_item_code: null, target_color_code: '1371', material_profile: null,
          reason: 'La estructura conserva Nardo.', source: 'reference_import',
        },
        {
          override_id: 'greco-front-edge', color_code: '0493', product_application_scope: 'edge_band_front',
          base_item_code: null, target_color_code: '0493', material_profile: null,
          reason: 'El frente conserva Austral de 1,5 mm.', source: 'reference_import',
        },
      ]]]),
    },
    snapshots: [snapshot('VBAN12-0022-000-0493', '0493', [
      line({ baseItemCode: 'CMPD06-0003-000', variantCode4: '1371', sourceOrder: 1, itemName: 'CANTO PVC 19X0,45MM NARDO' }),
      line({ baseItemCode: 'CMPD06-0014-000', variantCode4: '0493', sourceOrder: 2, itemName: 'CANTO PVC 19X1,5MM AUSTRAL' }),
    ])],
    colorConfigurations: new Map<string, ColorConfiguration>([['0493', {
      code4dig: '0493', colorMode: 'full',
      applicationColors: { full_product: '1371', edge_band_full_product: '1371' },
      applicationMaterialProfiles: {}, allowedProductTypes: ['MUEBLE'], allowedManufacturingProcesses: ['MUEBLES NACIONAL'],
    }]]),
  })

  assert.deepEqual(analysis.proposedBomStructure.lines.map(line => line.product_application_scope), [
    'edge_band_body',
    'edge_band_front',
  ])
  assert.equal(analysis.findings.some(finding => finding.findingType === 'bom_line_review'), false)
})

test('uses current SKU color overrides during reanalysis', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN12', referenceCode: '0022', productName: 'Prueba canto 1,5 mm',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
      skuColorOverrides: new Map([['VBAN12-0022-000-0493', [{
        override_id: 'greco-front-edge', color_code: '0493', product_application_scope: 'edge_band_front',
        base_item_code: null, target_color_code: '0493', material_profile: null,
        reason: 'El frente conserva el canto Austral de 1,5 mm.', source: 'reference_import',
      }]]]),
    },
    snapshots: [snapshot('VBAN12-0022-000-0493', '0493', [
      line({ baseItemCode: 'CMPD06-0003-000', variantCode4: '1371', sourceOrder: 1, itemName: 'CANTO PVC 19X0,45MM NARDO' }),
      line({ baseItemCode: 'CMPD06-0014-000', variantCode4: '0493', sourceOrder: 2, itemName: 'CANTO PVC 19X1,5MM AUSTRAL' }),
    ])],
    colorConfigurations: new Map<string, ColorConfiguration>([['0493', {
      code4dig: '0493', colorMode: 'full',
      applicationColors: { full_product: '1371', edge_band_full_product: '1371' },
      applicationMaterialProfiles: {}, allowedProductTypes: ['MUEBLE'], allowedManufacturingProcesses: ['MUEBLES NACIONAL'],
    }]]),
  })

  assert.deepEqual(analysis.proposedBomStructure.lines.map(line => line.product_application_scope), [
    'edge_band_full_product',
    'edge_band_front',
  ])
  assert.equal(analysis.findings.some(finding => finding.findingType === 'bom_line_review'), false)
})

test('uses an explicit material-group role instead of expanding it to every Dual role', () => {
  const structure: BomStructure = {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: '01',
    output_warehouse_code: null,
    lines: [{
      line_id: 'ln_000001', sort_order: 1, line_kind: 'material_group', base_item_code: null,
      product_application_scope: 'front', qty: null, input_warehouse_code: null, issue_method_override: null,
      alternatives: [{ alternative_id: 'alt_01', base_item_code: 'CMPD06-0004-000', material_profile: 'RH', is_default: true }],
      consumptions: [{ color_mode: 'dual', product_application_scope: 'front', material_profile: 'RH', format_key: null, qty: 0.74, status: 'confirmed' }],
    }],
  }
  const board = component('CMPD06-0004-000-0467', 'TABLERO RH 15MM CINZA COBALTO', metadata({
    material_kind: 'board', material_profile: 'RH', material_profile_source: 'RH', thickness_mm: 15, format_key: '2150x2440x15', metadata_source: 'sap_and_name',
  }))
  const resolved = resolveBomForSku({
    skuComplete: 'VBAN05-0122-000-0493', skuColorCode: '0493', structure,
    globalOverrides: emptyOverrides, versionOverrides: emptyOverrides,
    colorway: {
      code_4dig: '0493', name_color_sap: 'AUSTRAL', color_mode: 'dual',
      application_colors_json: { structure: '1371', front: '0467' },
      application_material_profiles_json: { front: 'RH' }, allowed_product_types: [], is_active: true,
    },
    componentItems: new Map([[board.item_code, board]]),
  })

  assert.deepEqual(resolved.map(line => `${line.product_application_scope}:${line.resolved_item_code}`), [
    'front:CMPD06-0004-000-0467',
  ])
  assert.equal(resolved[0]?.resolution_status, 'resolved')
})

test('classifies a single current board as full product during reference reanalysis', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN05', referenceCode: '0122', productName: 'Prueba grupo frontal',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [snapshot('VBAN05-0122-000-0493', '0493', [line({
      baseItemCode: 'CMPD06-0004-000', variantCode4: '0467', sourceOrder: 1,
      itemName: 'TABLERO RH 15MM CINZA COBALTO',
      technicalMetadata: metadata({ material_kind: 'board', material_profile: 'RH', material_profile_source: 'RH', thickness_mm: 15, format_key: '2150x2440x15', metadata_source: 'sap_and_name' }),
    })])],
    colorConfigurations: new Map(),
  })

  assert.equal(analysis.proposedBomStructure.lines[0]?.product_application_scope, 'full_product')
})

test('keeps 0439 as an internal-color candidate and bases a 0494 profile candidate on SAP evidence', () => {
  const rows = buildBoardMatrixRows({
    colorConfigurations: new Map(),
    evidence: [
      { sourceColorCode: '0439', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0439', boardColorCode: '0435', role: 'full_product' }) },
      { sourceColorCode: '0439', item: boardEvidence({ skuComplete: 'VBAN05-0002-000-0439', boardColorCode: '0435', role: 'full_product' }) },
      { sourceColorCode: '0387', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0387', boardColorCode: '0387', role: 'full_product' }) },
      { sourceColorCode: '0387', item: boardEvidence({ skuComplete: 'VBAN05-0002-000-0387', boardColorCode: '0387', role: 'full_product' }) },
      { sourceColorCode: '0494', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0494', boardColorCode: '0494', materialProfile: 'CARB2', role: 'full_product' }) },
    ],
  })
  assert.deepEqual(rows
    .filter(row => row.sourceColorCode === '0439' || row.sourceColorCode === '0494')
    .map(row => `${row.sourceColorCode}:${row.observedColorCodes[0]}:${row.observedMaterialProfiles[0]}:${row.status}`), [
    '0439:0435:ST:color_override_candidate',
    '0494:0494:CARB2:profile_override_candidate',
  ])
  assert.equal(rows.find(row => row.sourceColorCode === '0494')?.recommendedMaterialProfile, 'CARB2')
})

test('keeps a configured 0439 internal board rule valid when SAP matches it', () => {
  const configuration: ColorConfiguration = {
    code4dig: '0439',
    colorMode: 'equivalent',
    applicationColors: { full_product: '0435' },
    applicationMaterialProfiles: { full_product: 'ST' },
    allowedProductTypes: [],
    allowedManufacturingProcesses: [],
  }
  const [row] = buildBoardMatrixRows({
    colorConfigurations: new Map([['0439', configuration]]),
    evidence: [
      { sourceColorCode: '0439', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0439', boardColorCode: '0435', role: 'full_product' }) },
      { sourceColorCode: '0439', item: boardEvidence({ skuComplete: 'VBAN05-0002-000-0439', boardColorCode: '0435', role: 'full_product' }) },
    ],
  })

  assert.equal(row?.status, 'matches')
  assert.equal(row?.proposedColorCode, '0435')
  assert.equal(row?.statusMessage, 'La configuración actual del color coincide con la evidencia SAP de este rol.')
})

test('treats a saved conditional board strategy as a resolved color decision', () => {
  const configuration: ColorConfiguration = {
    code4dig: '0493',
    colorMode: 'full',
    applicationColors: { full_product: '0493' },
    boardProfileConditions: [{
      rule_id: 'st_to_nardo_carb',
      product_application_scope: 'full_product',
      source_material_profile: 'ST',
      target_color_code: '1371',
      target_material_profile: 'CARB2',
    }],
    applicationMaterialProfiles: {},
    allowedProductTypes: [],
    allowedManufacturingProcesses: [],
  }
  const [row] = buildBoardMatrixRows({
    colorConfigurations: new Map([['0493', configuration]]),
    evidence: [
      { sourceColorCode: '0493', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', role: 'full_product' }) },
      { sourceColorCode: '0493', item: boardEvidence({ skuComplete: 'VBAN05-0022-000-0493', boardColorCode: '0493', materialProfile: 'RH', role: 'full_product' }) },
    ],
  })

  assert.equal(row?.status, 'matches')
  assert.equal(row?.hasConditionalBoardRule, true)
  assert.equal(row?.statusMessage, 'La estrategia condicional de tablero está guardada en la configuración de este color.')
})

test('keeps a conditional board color pending while SAP still has an unresolved Dual case', () => {
  const configuration: ColorConfiguration = {
    code4dig: '0493',
    colorMode: 'full',
    applicationColors: { full_product: '0493' },
    boardProfileConditions: [{
      rule_id: 'st_to_nardo_carb',
      product_application_scope: 'full_product',
      source_material_profile: 'ST',
      target_color_code: '1371',
      target_material_profile: 'CARB2',
    }],
    applicationMaterialProfiles: {},
    allowedProductTypes: [],
    allowedManufacturingProcesses: [],
  }
  const rows = buildBoardMatrixRows({
    colorConfigurations: new Map([['0493', configuration]]),
    evidence: [
      { sourceColorCode: '0493', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', role: 'full_product' }) },
      { sourceColorCode: '0493', item: boardEvidence({ skuComplete: 'VBAN05-0022-000-0493', boardColorCode: '0493', materialProfile: 'RH', role: 'full_product' }) },
      { sourceColorCode: '0493', item: boardEvidence({ skuComplete: 'VBAN05-0122-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', role: 'role_pending', qty: 0.76, itemCode: 'CMPD06-0008-000-1371', lineIdentity: 'CMPD06-0008-000#1' }) },
      { sourceColorCode: '0493', item: boardEvidence({ skuComplete: 'VBAN05-0122-000-0493', boardColorCode: '0467', materialProfile: 'RH', role: 'role_pending', qty: 0.21, itemCode: 'CMPD06-0004-000-0467', lineIdentity: 'CMPD06-0004-000#1' }) },
    ],
  })

  assert.equal(rows.find(row => row.role === 'full_product')?.status, 'variation_by_design')
})

test('does not pre-propose CARB2 for 0442 when SAP matches the reference pattern', () => {
  const rows = buildBoardMatrixRows({
    colorConfigurations: new Map(),
    evidence: [
      { sourceColorCode: '0387', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0387', boardColorCode: '0387', role: 'full_product' }) },
      { sourceColorCode: '0387', item: boardEvidence({ skuComplete: 'VBAN05-0002-000-0387', boardColorCode: '0387', role: 'full_product' }) },
      { sourceColorCode: '0442', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0442', boardColorCode: '0442', materialProfile: 'ST', role: 'full_product' }) },
    ],
  })
  const row = rows.find(candidate => candidate.sourceColorCode === '0442')
  assert.equal(row?.status, 'matches')
  assert.equal(row?.recommendedMaterialProfile, 'ST')
  assert.deepEqual(row?.referenceMaterialProfiles, ['ST'])
})

test('uses the SAP-evidenced RH profile without a color-specific rule', () => {
  const rows = buildBoardMatrixRows({
    colorConfigurations: new Map(),
    evidence: [
      { sourceColorCode: '0387', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0387', boardColorCode: '0387', materialProfile: 'RH', role: 'full_product' }) },
      { sourceColorCode: '0387', item: boardEvidence({ skuComplete: 'VBAN05-0002-000-0387', boardColorCode: '0387', materialProfile: 'RH', role: 'full_product' }) },
      { sourceColorCode: '0442', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0442', boardColorCode: '0442', materialProfile: 'RH', role: 'full_product' }) },
    ],
  })
  assert.equal(rows.find(candidate => candidate.sourceColorCode === '0442')?.recommendedMaterialProfile, 'RH')
})

test('keeps a board role pending instead of inferring front or structure from its physical data', () => {
  const [row] = buildBoardMatrixRows({
    colorConfigurations: new Map(),
    evidence: [{ sourceColorCode: '0493', item: boardEvidence({ skuComplete: 'VBAN05-0122-000-0493', boardColorCode: '1371', role: 'role_pending', qty: 0.76 }) }],
  })
  assert.equal(row?.role, 'role_pending')
  assert.equal(row?.status, 'role_pending')
})

test('summarizes each board profile with distinct SKU counts and SAP examples', () => {
  const summary = summarizeBoardProfileEvidence([
    boardEvidence({ skuComplete: 'VBAN05-0001-000-0442', skuItemName: 'BASICO 1', boardColorCode: '0442', materialProfile: 'CARB2', role: 'full_product' }),
    boardEvidence({ skuComplete: 'VBAN05-0002-000-0442', skuItemName: 'BASICO 2', boardColorCode: '0442', materialProfile: 'CARB2', role: 'full_product' }),
    boardEvidence({ skuComplete: 'VBAN05-0002-000-0442', skuItemName: 'BASICO 2', itemCode: 'CMPD06-0002-000-0442', boardColorCode: '0442', materialProfile: 'CARB2', role: 'full_product' }),
    boardEvidence({ skuComplete: 'VBAN05-0003-000-0442', skuItemName: 'BASICO RH', boardColorCode: '0442', materialProfile: 'RH', role: 'full_product' }),
  ])
  assert.deepEqual(summary.map(item => [item.materialProfile, item.skuCount, item.examples.map(example => example.skuComplete)]), [
    ['CARB2', 2, ['VBAN05-0001-000-0442', 'VBAN05-0002-000-0442']],
    ['RH', 1, ['VBAN05-0003-000-0442']],
  ])
})

test('keeps board evidence examples distinct by sales SKU and rejects edge-band scopes', () => {
  const examples = summarizeBoardEvidenceExamples([
    boardEvidence({ skuComplete: 'VBAN05-0002-000-0493', skuItemName: 'BASICO 2', itemCode: 'CMPD06-0002-000-1371', boardColorCode: '1371', role: 'full_product' }),
    boardEvidence({ skuComplete: 'VBAN05-0001-000-0493', skuItemName: 'BASICO 1', itemCode: 'CMPD06-0003-000-1371', boardColorCode: '1371', role: 'full_product' }),
    boardEvidence({ skuComplete: 'VBAN05-0001-000-0493', skuItemName: 'BASICO 1', itemCode: 'CMPD06-0001-000-1371', boardColorCode: '1371', role: 'full_product' }),
  ])

  assert.deepEqual(examples.map(item => [item.skuComplete, item.itemCode]), [
    ['VBAN05-0001-000-0493', 'CMPD06-0001-000-1371'],
    ['VBAN05-0002-000-0493', 'CMPD06-0002-000-1371'],
  ])
  assert.equal(isBoardMaterialApplicationScope('edge_band_front'), false)
  assert.equal(isBoardMaterialApplicationScope('front'), true)
})

test('prioritizes every observed board and profile pattern in the SAP review examples', () => {
  const examples = summarizeBoardEvidenceExamples([
    boardEvidence({ skuComplete: 'VBAN05-0001-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', role: 'full_product' }),
    boardEvidence({ skuComplete: 'VBAN05-0002-000-0493', boardColorCode: '0493', materialProfile: 'CARB2', role: 'full_product' }),
    boardEvidence({ skuComplete: 'VBAN05-0003-000-0493', boardColorCode: '1371', materialProfile: 'RH', role: 'full_product' }),
    boardEvidence({ skuComplete: 'VBAN05-0004-000-0493', boardColorCode: '1375', materialProfile: 'CARB2', role: 'role_pending' }),
    boardEvidence({ skuComplete: 'VBAN05-0004-000-0493', itemCode: 'CMPD06-0004-000-0467', boardColorCode: '0467', materialProfile: 'RH', role: 'role_pending' }),
  ])

  assert.deepEqual(examples.map(item => `${item.boardColorCode}:${item.materialProfile}`).sort(), [
    '0467:RH',
    '0493:CARB2',
    '1371:CARB2',
    '1371:RH',
    '1375:CARB2',
  ])
  assert.deepEqual(examples.find(item => item.skuComplete === 'VBAN05-0004-000-0493')?.skuBoardPatterns, ['0467 · RH', '1375 · CARB2'])
})

test('allows a global full-product rule only with complete uniform SAP coverage', () => {
  const rows = buildBoardMatrixRows({
    colorConfigurations: new Map(),
    evidence: [
      { sourceColorCode: '0494', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0494', boardColorCode: '0494', materialProfile: 'CARB2', role: 'full_product' }) },
      { sourceColorCode: '0494', item: boardEvidence({ skuComplete: 'VBAN05-0002-000-0494', boardColorCode: '0494', materialProfile: 'CARB2', role: 'full_product' }) },
    ],
  })
  const eligible = {
    colorMode: 'full' as const,
    sapActiveSkuCount: 2,
    sapActiveSkus: [],
    checkedSkuCount: 2,
    excludedKitSkuCount: 0,
    sapReadErrors: [],
    rows,
  }
  assert.deepEqual(assessBoardFullProductRuleCandidate(eligible), {
    candidate: { boardColorCode: '0494', materialProfile: 'CARB2', evidenceSkuCount: 2 },
    blockers: [],
  })
  const unreadBomBlocksRule = assessBoardFullProductRuleCandidate({
    ...eligible,
    sapReadErrors: [{ skuComplete: 'VBAN05-0003-000-0494', message: 'SAP no devolvió la LdM.' }],
  })
  assert.equal(unreadBomBlocksRule.candidate, null)
  assert.match(unreadBomBlocksRule.blockers.join(' '), /LdM/i)
})

test('keeps CMPD09 manufactured pieces outside board application roles', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN05', referenceCode: '0001', productName: 'Prueba',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [snapshot('VBAN05-0001-000-0494', '0494', [line({
      baseItemCode: 'CMPD09-0031-000', variantCode4: '0494', sourceOrder: 1, itemName: 'PUERTA',
    })])],
    colorConfigurations: new Map([['0494', {
      code4dig: '0494', colorMode: 'dual', applicationColors: { structure: '0494', front: '0494' }, applicationMaterialProfiles: {},
      allowedProductTypes: [], allowedManufacturingProcesses: [],
    }]]),
  })
  const door = analysis.proposedBomStructure.lines.find(line => line.base_item_code === 'CMPD09-0031-000')
  assert.equal(door?.product_application_scope, 'NA')
})

test('does not promote a per-SKU 0493 Dual pattern to global when another active SKU differs', () => {
  const evidence = [
    boardEvidence({ skuComplete: 'VBAN05-0122-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', role: 'structure' }),
    boardEvidence({ skuComplete: 'VBAN05-0122-000-0493', boardColorCode: '0467', materialProfile: 'RH', role: 'front' }),
    boardEvidence({ skuComplete: 'VBAN05-0001-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', role: 'structure' }),
    boardEvidence({ skuComplete: 'VBAN05-0001-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', role: 'front' }),
  ]
  const result = evaluateGlobalBoardDualCandidate({
    checkedSkuCompletes: ['VBAN05-0122-000-0493', 'VBAN05-0001-000-0493'],
    sapReadErrorCount: 0,
    evidence,
  })
  assert.equal(result.candidate, false)
})

test('normalizes board consumption to the highest observation and reserves blocker for a real physical conflict', () => {
  const variationRows = buildBoardMatrixRows({
    colorConfigurations: new Map(),
    evidence: [
      { sourceColorCode: '0439', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0439', boardColorCode: '0435', role: 'full_product', qty: 0.89 }) },
      { sourceColorCode: '0439', item: boardEvidence({ skuComplete: 'VBAN05-0002-000-0439', boardColorCode: '0435', role: 'full_product', qty: 0.76 }) },
    ],
  })
  assert.equal(variationRows[0]?.status, 'color_override_candidate')
  assert.equal(variationRows[0]?.normalizedConsumptionQty, 0.89)
  const conflictRows = buildBoardMatrixRows({
    colorConfigurations: new Map(),
    evidence: [
      { sourceColorCode: '0439', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0439', boardColorCode: '0435', role: 'full_product', qty: 0.89 }) },
      { sourceColorCode: '0439', item: boardEvidence({ skuComplete: 'VBAN05-0001-000-0439', boardColorCode: '0435', role: 'full_product', qty: 0.76 }) },
    ],
  })
  assert.equal(conflictRows[0]?.status, 'conflict_real')
})

test('consolidates identical SAP board rows before normalizing their consumption', () => {
  const rows = buildBoardMatrixRows({
    colorConfigurations: new Map(),
    evidence: [
      {
        sourceColorCode: '0493',
        item: boardEvidence({
          skuComplete: 'VBAN12-0043-000-0493', boardColorCode: '1371', role: 'full_product', qty: 0.22,
          lineIdentity: 'CMPD06-0008-000#1', itemCode: 'CMPD06-0008-000-1371', materialProfile: 'CARB2',
        }),
      },
      {
        sourceColorCode: '0493',
        item: boardEvidence({
          skuComplete: 'VBAN12-0043-000-0493', boardColorCode: '1371', role: 'full_product', qty: 0.34,
          lineIdentity: 'CMPD06-0008-000#2', itemCode: 'CMPD06-0008-000-1371', materialProfile: 'CARB2',
        }),
      },
    ],
  })
  const [row] = rows
  assert.equal(row?.evidence.length, 1)
  assert.equal(row?.evidence[0]?.qty, 0.56)
  assert.equal(row?.evidence[0]?.sourceLineCount, 2)
  assert.equal(row?.normalizedConsumptionQty, 0.56)
})

test('uses the consolidated board quantity in the proposed BOM base', () => {
  const boardMetadata = metadata({ material_kind: 'board', material_profile: 'CARB2', material_profile_source: 'CARB', thickness_mm: 15, format_key: '1830x2440x15', metadata_source: 'sap_and_name' })
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN12', referenceCode: '0043', productName: 'Prueba consolidación',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [snapshot('VBAN12-0043-000-0493', '0493', [
      line({ baseItemCode: 'CMPD06-0008-000', variantCode4: '1371', sourceOrder: 1, occurrence: 1, qty: 0.22, technicalMetadata: boardMetadata }),
      line({ baseItemCode: 'CMPD06-0008-000', variantCode4: '1371', sourceOrder: 2, occurrence: 2, qty: 0.34, technicalMetadata: boardMetadata }),
    ])],
    colorConfigurations: new Map(),
  })
  const boardLine = analysis.proposedBomStructure.lines[0]
  assert.equal(boardLine?.line_kind, 'material_group')
  assert.equal(boardLine?.consumptions[0]?.qty, 0.56)
})

test('applies a 0493 board condition only when the reference profile is ST', () => {
  const stStructure: BomStructure = {
    schema_version: 2, structure_type: 'production', input_warehouse_code: '01', output_warehouse_code: null,
    lines: [
      {
        line_id: 'board', sort_order: 1, line_kind: 'material_group', base_item_code: null, product_application_scope: 'full_product', qty: null,
        input_warehouse_code: null, issue_method_override: null,
        alternatives: [
          { alternative_id: 'st', base_item_code: 'CMPD06-0001-000', material_profile: 'ST', is_default: true },
          { alternative_id: 'carb', base_item_code: 'CMPD06-0008-000', material_profile: 'CARB2', is_default: false },
          { alternative_id: 'rh', base_item_code: 'CMPD06-0004-000', material_profile: 'RH', is_default: false },
        ],
        consumptions: [
          { color_mode: 'full', product_application_scope: 'full_product', material_profile: 'CARB2', format_key: null, qty: 0.92, status: 'confirmed' },
          { color_mode: 'full', product_application_scope: 'full_product', material_profile: 'RH', format_key: null, qty: 0.92, status: 'confirmed' },
        ],
      },
      { line_id: 'edge', sort_order: 2, line_kind: 'fixed', base_item_code: 'CMPD06-0003-000', product_application_scope: 'edge_band_full_product', qty: 1, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
    ],
  }
  const rhStructure: BomStructure = {
    ...stStructure,
    lines: [{
      ...stStructure.lines[0]!,
      alternatives: [{ alternative_id: 'rh', base_item_code: 'CMPD06-0004-000', material_profile: 'RH', is_default: true }],
      consumptions: [{ color_mode: 'full', product_application_scope: 'full_product', material_profile: 'RH', format_key: null, qty: 0.92, status: 'confirmed' }],
    }],
  }
  const components = new Map([
    ['CMPD06-0001-000-0493', component('CMPD06-0001-000-0493', 'TABLERO ST 15MM AUSTRAL', metadata({ material_kind: 'board', material_profile: 'ST' }))],
    ['CMPD06-0008-000-1371', component('CMPD06-0008-000-1371', 'TABLERO CARB 15MM NARDO', metadata({ material_kind: 'board', material_profile: 'CARB2' }))],
    ['CMPD06-0004-000-0493', component('CMPD06-0004-000-0493', 'TABLERO RH 15MM AUSTRAL', metadata({ material_kind: 'board', material_profile: 'RH' }))],
    ['CMPD06-0003-000-0493', component('CMPD06-0003-000-0493', 'CANTO PVC AUSTRAL', metadata({ material_kind: 'edge_band' }))],
  ])
  const colorway: Colorway = {
    code_4dig: '0493', name_color_sap: 'AUSTRAL', color_mode: 'full', application_colors_json: { full_product: '0493', edge_band_full_product: '0493' },
    board_profile_conditions: [{ rule_id: 'st_to_nardo_carb', product_application_scope: 'full_product', source_material_profile: 'ST', target_color_code: '1371', target_material_profile: 'CARB2' }],
    application_material_profiles_json: {}, allowed_product_types: [], is_active: true,
  }
  const st = resolveBomForSku({ skuComplete: 'VBAN05-0001-000-0493', skuColorCode: '0493', structure: stStructure, globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway, componentItems: components })
  assert.deepEqual(st.map(item => item.resolved_item_code), ['CMPD06-0008-000-1371', 'CMPD06-0003-000-0493'])
  const rh = resolveBomForSku({ skuComplete: 'VBAN05-0022-000-0493', skuColorCode: '0493', structure: rhStructure, globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway, componentItems: components })
  assert.deepEqual(rh.map(item => item.resolved_item_code), ['CMPD06-0004-000-0493'])

  const versionSelectingRh: BomOverrides = {
    schema_version: 2,
    color_overrides: [],
    operations: [{
      operation_id: 'mrh_board_profile',
      operation_type: 'replace_line',
      target_line_id: 'board',
      new_line: rhStructure.lines[0],
    }],
  }
  const rhFromVersion = resolveBomForSku({ skuComplete: 'VBAN05-0001-MRH-0493', skuColorCode: '0493', structure: stStructure, globalOverrides: emptyOverrides, versionOverrides: versionSelectingRh, colorway, componentItems: components })
  assert.deepEqual(rhFromVersion.map(item => item.resolved_item_code), ['CMPD06-0004-000-0493', 'CMPD06-0003-000-0493'])

  const versionProfileOverride: BomOverrides = {
    schema_version: 2,
    operations: [],
    color_overrides: [{
      override_id: 'mrh_profile',
      color_code: '0493',
      product_application_scope: 'full_product',
      base_item_code: null,
      target_color_code: '0493',
      material_profile: 'RH',
      reason: 'La versión MRH usa tablero RH.',
      source: 'manual',
      actor_id: null,
      created_at: null,
    }],
  }
  const rhFromVersionProfile = resolveBomForSku({ skuComplete: 'VBAN05-0001-MRH-0493', skuColorCode: '0493', structure: stStructure, globalOverrides: emptyOverrides, versionOverrides: versionProfileOverride, colorway, componentItems: components })
  assert.deepEqual(rhFromVersionProfile.map(item => item.resolved_item_code), ['CMPD06-0004-000-0493', 'CMPD06-0003-000-0493'])

  const nardoDefaultColorway: Colorway = {
    ...colorway,
    application_colors_json: { full_product: '1371', edge_band_full_product: '0493' },
    application_material_profiles_json: { full_product: 'CARB2' },
    board_profile_conditions: [{ rule_id: 'rh_to_austral', product_application_scope: 'full_product', source_material_profile: 'RH', target_color_code: '0493', target_material_profile: 'RH' }],
  }
  const rhWithNardoDefault = resolveBomForSku({ skuComplete: 'VBAN05-0022-000-0493', skuColorCode: '0493', structure: rhStructure, globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway: nardoDefaultColorway, componentItems: components })
  assert.deepEqual(rhWithNardoDefault.map(item => item.resolved_item_code), ['CMPD06-0004-000-0493'])
})

test('infers the two edge-band roles from consumption and does not create a drawer-bottom role', () => {
  const edgeMetadata = metadata({ material_kind: 'edge_band', material_profile: 'PVC', thickness_mm: 0.45, metadata_source: 'sap_and_name' })
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN05', referenceCode: '0001', productName: 'Prueba cantos',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [snapshot('VBAN05-0001-000-0493', '0493', [
      line({ baseItemCode: 'CMPD06-0003-000', variantCode4: '0493', sourceOrder: 1, itemName: 'CANTO PVC 19X0,45MM', qty: 6.72, technicalMetadata: edgeMetadata }),
      line({ baseItemCode: 'CMPD06-0005-000', variantCode4: '0493', sourceOrder: 2, itemName: 'CANTO PVC 19X2MM CAJON', qty: 2.03, technicalMetadata: edgeMetadata }),
    ])],
    colorConfigurations: new Map(),
  })
  const lines = analysis.proposedBomStructure.lines
  assert.equal(lines.find(line => line.base_item_code === 'CMPD06-0003-000')?.product_application_scope, 'edge_band_body')
  assert.equal(lines.find(line => line.base_item_code === 'CMPD06-0005-000')?.product_application_scope, 'edge_band_front')
  assert.equal(lines.some(line => line.product_application_scope === 'edge_band_inner' || line.product_application_scope === 'edge_band_drawer_bottom'), false)
})

test('derives a missing board base from the target profile when the reference keeps only ST', () => {
  const structure: BomStructure = {
    schema_version: 2, structure_type: 'production', input_warehouse_code: '01', output_warehouse_code: null,
    lines: [{
      line_id: 'board', sort_order: 1, line_kind: 'material_group', base_item_code: null, product_application_scope: 'full_product', qty: null,
      input_warehouse_code: null, issue_method_override: null,
      alternatives: [{ alternative_id: 'st', base_item_code: 'CMPD06-0001-000', material_profile: 'ST', is_default: true }],
      consumptions: [{ color_mode: 'full', product_application_scope: 'full_product', material_profile: 'CARB2', format_key: null, qty: 0.92, status: 'confirmed' }],
    }],
  }
  const components = new Map([
    ['CMPD06-0001-000-0493', component('CMPD06-0001-000-0493', 'TABLERO ST 15MM AUSTRAL', metadata({ material_kind: 'board', material_profile: 'ST' }))],
    ['CMPD06-0008-000-1371', component('CMPD06-0008-000-1371', 'TABLERO CARB 15MM AUSTRAL', metadata({ material_kind: 'board', material_profile: 'CARB2' }))],
  ])
  const colorway: Colorway = {
    code_4dig: '0493', name_color_sap: 'AUSTRAL', color_mode: 'full', application_colors_json: { full_product: '0493' },
    board_profile_conditions: [{ rule_id: 'st_to_carb2', product_application_scope: 'full_product', source_material_profile: 'ST', target_color_code: '1371', target_material_profile: 'CARB2' }],
    application_material_profiles_json: {}, allowed_product_types: [], is_active: true,
  }
  const resolved = resolveBomForSku({ skuComplete: 'VBAN05-0001-000-0493', skuColorCode: '0493', structure, globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway, componentItems: components })
  assert.deepEqual(resolved.map(item => item.resolved_item_code), ['CMPD06-0008-000-1371'])
})

test('separates quantity and warehouse findings and proposes the highest fixed consumption', () => {
  const analysis = analyzeReferenceBom({
    context: {
      referenceId: 'reference', familyCode: 'BAN12', referenceCode: '0081', productName: 'Macao',
      manufacturingProcess: 'MUEBLES NACIONAL', productType: 'MUEBLE',
    },
    snapshots: [
      snapshot('VBAN12-0081-000-0439', '0439', [line({ baseItemCode: 'CEMP03-0001-000', sourceOrder: 1, qty: 0.42, warehouse: 'MP-04' })]),
      snapshot('VBAN12-0081-000-0493', '0493', [line({ baseItemCode: 'CEMP03-0001-000', sourceOrder: 1, qty: 0.56, warehouse: 'MP-01' })]),
      snapshot('VBAN12-0081-000-0494', '0494', [line({ baseItemCode: 'CEMP03-0001-000', sourceOrder: 1, qty: 0.56, warehouse: 'MP-01' })]),
    ],
    colorConfigurations: new Map(),
  })

  assert.equal(analysis.proposedBomStructure.lines[0]?.qty, 0.56)
  const quantityFinding = analysis.findings.find(finding => finding.findingType === 'line_quantity_conflict')
  assert.deepEqual(quantityFinding?.detailsJson.observed_quantities, [0.42, 0.56])
  assert.equal(quantityFinding?.detailsJson.proposed_qty, 0.56)
  const warehouseFinding = analysis.findings.find(finding => finding.findingType === 'line_warehouse_conflict')
  assert.equal(warehouseFinding?.detailsJson.recommended_warehouse, 'MP-01')
  assert.equal(analysis.findings.some(finding => finding.findingType === 'bom_line_review'), false)
})

test('compares a persisted JSONB BOM semantically instead of by object-key order', () => {
  const proposed = {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: 'MP-04',
    output_warehouse_code: null,
    lines: [{
      line_id: 'ln_000001', sort_order: 1, line_kind: 'fixed', base_item_code: 'CMPD06-0003-000',
      product_application_scope: 'edge_band_body', qty: 11.41, uom: 'MT', input_warehouse_code: 'MP-04',
      issue_method_override: 'im_Manual', alternatives: [], consumptions: [],
    }],
  }
  const persistedWithDifferentKeyOrder = {
    lines: [{
      consumptions: [], alternatives: [], issue_method_override: 'im_Manual', input_warehouse_code: 'MP-04',
      uom: 'MT', qty: 11.41, product_application_scope: 'edge_band_body', base_item_code: 'CMPD06-0003-000',
      line_kind: 'fixed', sort_order: 1, line_id: 'ln_000001',
    }],
    output_warehouse_code: null,
    input_warehouse_code: 'MP-04',
    structure_type: 'production',
    schema_version: 2,
  }

  assert.notEqual(JSON.stringify(proposed), JSON.stringify(persistedWithDifferentKeyOrder))
  assert.equal(canonicalBomStructureJson(proposed), canonicalBomStructureJson(persistedWithDifferentKeyOrder))
})

test('resolves CARB2 equivalents by profile and thickness, not by the board base code or purchase format', () => {
  const structure: BomStructure = {
    schema_version: 2, structure_type: 'production', input_warehouse_code: '01', output_warehouse_code: null,
    lines: [
      {
        line_id: 'board_15', sort_order: 1, line_kind: 'material_group', base_item_code: null, product_application_scope: 'full_product', qty: null,
        input_warehouse_code: null, issue_method_override: null,
        alternatives: [{ alternative_id: 'st_15', base_item_code: 'CMPD06-0001-000', material_profile: 'ST', is_default: true }],
        consumptions: [{ color_mode: 'full', product_application_scope: 'full_product', material_profile: 'ST', format_key: null, qty: 0.92, status: 'confirmed' }],
        board_physical_specification: { material_kind: 'board', thickness_mm: 15 },
      },
      {
        line_id: 'board_18', sort_order: 2, line_kind: 'material_group', base_item_code: null, product_application_scope: 'inner_structure', qty: null,
        input_warehouse_code: null, issue_method_override: null,
        alternatives: [{ alternative_id: 'st_18', base_item_code: 'CMPD06-0011-000', material_profile: 'ST', is_default: true }],
        consumptions: [{ color_mode: 'full', product_application_scope: 'inner_structure', material_profile: 'ST', format_key: null, qty: 0.54, status: 'confirmed' }],
        board_physical_specification: { material_kind: 'board', thickness_mm: 18 },
      },
    ],
  }
  const components = new Map([
    ['CMPD06-0001-000-0493', component('CMPD06-0001-000-0493', 'TABLERO ST 15MM AUSTRAL', metadata({ material_kind: 'board', material_profile: 'ST', thickness_mm: 15, format_key: '1830x2440x15' }))],
    ['CMPD06-0011-000-0493', component('CMPD06-0011-000-0493', 'TABLERO ST 18MM AUSTRAL', metadata({ material_kind: 'board', material_profile: 'ST', thickness_mm: 18, format_key: '1830x2440x18' }))],
    ['CMPD06-0008-000-1371', component('CMPD06-0008-000-1371', 'TABLERO CARB 15MM NARDO', metadata({ material_kind: 'board', material_profile: 'CARB2', thickness_mm: 15, format_key: '1530x2440x15' }))],
    ['CMPD06-0018-000-1371', component('CMPD06-0018-000-1371', 'TABLERO CARB 18MM NARDO', metadata({ material_kind: 'board', material_profile: 'CARB2', thickness_mm: 18, format_key: '1220x2440x18' }))],
  ])
  const resolved = resolveBomForSku({
    skuComplete: 'VBAN05-0001-000-0493', skuColorCode: '0493', structure,
    globalOverrides: emptyOverrides, versionOverrides: emptyOverrides,
    colorway: {
      code_4dig: '0493', name_color_sap: 'AUSTRAL', color_mode: 'full',
      application_colors_json: { full_product: '1371', inner_structure: '1371' },
      application_material_profiles_json: { full_product: 'CARB2', inner_structure: 'CARB2' }, allowed_product_types: [], is_active: true,
    }, componentItems: components,
  })
  assert.deepEqual(resolved.map(line => [line.product_application_scope, line.resolved_item_code, line.qty]), [
    ['full_product', 'CMPD06-0008-000-1371', 0.92],
    ['inner_structure', 'CMPD06-0018-000-1371', 0.54],
  ])
})

test('blocks an ambiguous physical board equivalent instead of selecting one arbitrarily', () => {
  const structure: BomStructure = {
    schema_version: 2, structure_type: 'production', input_warehouse_code: '01', output_warehouse_code: null,
    lines: [{
      line_id: 'board', sort_order: 1, line_kind: 'material_group', base_item_code: null, product_application_scope: 'full_product', qty: null,
      input_warehouse_code: null, issue_method_override: null,
      alternatives: [{ alternative_id: 'st', base_item_code: 'CMPD06-0001-000', material_profile: 'ST', is_default: true }],
      consumptions: [{ color_mode: 'full', product_application_scope: 'full_product', material_profile: 'ST', format_key: null, qty: 0.92, status: 'confirmed' }],
      board_physical_specification: { material_kind: 'board', thickness_mm: 15 },
    }],
  }
  const components = new Map([
    ['CMPD06-0008-000-1371', component('CMPD06-0008-000-1371', 'TABLERO CARB 15MM NARDO', metadata({ material_kind: 'board', material_profile: 'CARB2', thickness_mm: 15 }))],
    ['CMPD06-0038-000-1371', component('CMPD06-0038-000-1371', 'TABLERO CARB 15MM NARDO ALT', metadata({ material_kind: 'board', material_profile: 'CARB2', thickness_mm: 15 }))],
  ])
  const [resolved] = resolveBomForSku({
    skuComplete: 'VBAN05-0001-000-0493', skuColorCode: '0493', structure,
    globalOverrides: emptyOverrides, versionOverrides: emptyOverrides,
    colorway: { code_4dig: '0493', name_color_sap: 'AUSTRAL', color_mode: 'full', application_colors_json: { full_product: '1371' }, application_material_profiles_json: { full_product: 'CARB2' }, allowed_product_types: [], is_active: true },
    componentItems: components,
  })
  assert.equal(resolved?.resolution_status, 'ambiguous_board_equivalent')
})

test('derives reusable unicolor strategies from SAP board evidence and reference profiles', () => {
  const strategies = deriveBoardConditionalRuleStrategies({
    sourceColorCode: '0493',
    evidence: [
      boardEvidence({ skuComplete: 'VBAN05-0001-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', referenceMaterialProfile: 'ST', role: 'full_product' }),
      boardEvidence({ skuComplete: 'VBAN05-0002-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', referenceMaterialProfile: 'ST', role: 'full_product' }),
      boardEvidence({ skuComplete: 'VBAN05-0022-000-0493', boardColorCode: '0493', materialProfile: 'RH', referenceMaterialProfile: 'RH', role: 'full_product' }),
    ],
  })
  assert.deepEqual(strategies[0], {
    strategyId: 'keep_product_color',
    kind: 'keep_product_color',
    defaultBoardColorCode: '0493',
    defaultMaterialProfile: null,
    conditions: [{ sourceMaterialProfile: 'ST', targetBoardColorCode: '1371', targetMaterialProfile: 'CARB2', evidenceSkuCount: 2 }],
    evidenceSkuCount: 3,
  })
  assert.deepEqual(strategies[1], {
    strategyId: 'internal_default_1371_carb2',
    kind: 'use_internal_default',
    defaultBoardColorCode: '1371',
    defaultMaterialProfile: 'CARB2',
    conditions: [{ sourceMaterialProfile: 'RH', targetBoardColorCode: '0493', targetMaterialProfile: 'RH', evidenceSkuCount: 1 }],
    evidenceSkuCount: 3,
  })

  const strategiesUsingSelectedReferenceHint = deriveBoardConditionalRuleStrategies({
    sourceColorCode: '0493',
    referenceMaterialProfileHint: 'ST',
    evidence: [
      boardEvidence({ skuComplete: 'VBAN05-0001-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', role: 'full_product' }),
      boardEvidence({ skuComplete: 'VBAN05-0002-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', role: 'full_product' }),
      boardEvidence({ skuComplete: 'VBAN05-0022-000-0493', boardColorCode: '0493', materialProfile: 'RH', role: 'full_product' }),
    ],
  })
  assert.deepEqual(strategiesUsingSelectedReferenceHint, strategies)
})

test('derives unicolor profile alternatives when the board keeps the product color', () => {
  const strategies = deriveBoardConditionalRuleStrategies({
    sourceColorCode: '0442',
    evidence: [
      boardEvidence({ skuComplete: 'VBAN05-0001-000-0442', boardColorCode: '0442', materialProfile: 'CARB2', referenceMaterialProfile: 'ST', role: 'full_product' }),
      boardEvidence({ skuComplete: 'VBAN05-0002-000-0442', boardColorCode: '0442', materialProfile: 'CARB2', referenceMaterialProfile: 'ST', role: 'full_product' }),
      boardEvidence({ skuComplete: 'VBAN05-0022-000-0442', boardColorCode: '0442', materialProfile: 'RH', referenceMaterialProfile: 'RH', role: 'full_product' }),
    ],
  })
  assert.deepEqual(strategies, [
    {
      strategyId: 'keep_product_color',
      kind: 'keep_product_color',
      defaultBoardColorCode: '0442',
      defaultMaterialProfile: null,
      conditions: [{ sourceMaterialProfile: 'ST', targetBoardColorCode: '0442', targetMaterialProfile: 'CARB2', evidenceSkuCount: 2 }],
      evidenceSkuCount: 3,
    },
    {
      strategyId: 'internal_default_0442_carb2',
      kind: 'use_internal_default',
      defaultBoardColorCode: '0442',
      defaultMaterialProfile: 'CARB2',
      conditions: [{ sourceMaterialProfile: 'RH', targetBoardColorCode: '0442', targetMaterialProfile: 'RH', evidenceSkuCount: 1 }],
      evidenceSkuCount: 3,
    },
  ])
})

test('uses the selected reference profile when SAP exposes only effective profiles for the same board color', () => {
  const strategies = deriveBoardConditionalRuleStrategies({
    sourceColorCode: '0442',
    referenceMaterialProfileHint: 'ST',
    evidence: [
      boardEvidence({ skuComplete: 'VBAN05-0001-000-0442', boardColorCode: '0442', materialProfile: 'CARB2', referenceMaterialProfile: 'CARB2', role: 'full_product' }),
      boardEvidence({ skuComplete: 'VBAN05-0002-000-0442', boardColorCode: '0442', materialProfile: 'CARB2', referenceMaterialProfile: 'CARB2', role: 'full_product' }),
      boardEvidence({ skuComplete: 'VBAN05-0022-000-0442', boardColorCode: '0442', materialProfile: 'RH', referenceMaterialProfile: 'RH', role: 'full_product' }),
    ],
  })
  assert.deepEqual(strategies, [
    {
      strategyId: 'keep_product_color',
      kind: 'keep_product_color',
      defaultBoardColorCode: '0442',
      defaultMaterialProfile: null,
      conditions: [{ sourceMaterialProfile: 'ST', targetBoardColorCode: '0442', targetMaterialProfile: 'CARB2', evidenceSkuCount: 2 }],
      evidenceSkuCount: 3,
    },
    {
      strategyId: 'internal_default_0442_carb2',
      kind: 'use_internal_default',
      defaultBoardColorCode: '0442',
      defaultMaterialProfile: 'CARB2',
      conditions: [{ sourceMaterialProfile: 'RH', targetBoardColorCode: '0442', targetMaterialProfile: 'RH', evidenceSkuCount: 1 }],
      evidenceSkuCount: 3,
    },
  ])
})

test('detects a SAP-backed board Dual candidate without promoting it globally', () => {
  const candidates = detectBoardDualCandidates({
    evidence: [
      boardEvidence({ skuComplete: 'VBAN05-0122-000-0493', boardColorCode: '1371', materialProfile: 'CARB2', qty: 0.76, role: 'role_pending', itemCode: 'CMPD06-0008-000-1371', lineIdentity: 'CMPD06-0008-000#1' }),
      boardEvidence({ skuComplete: 'VBAN05-0122-000-0493', boardColorCode: '0467', materialProfile: 'RH', qty: 0.21, role: 'role_pending', itemCode: 'CMPD06-0004-000-0467', lineIdentity: 'CMPD06-0004-000#1' }),
    ],
  })
  assert.equal(candidates.length, 1)
  assert.deepEqual(candidates[0] && {
    structureColorCode: candidates[0].structureColorCode,
    structureMaterialProfile: candidates[0].structureMaterialProfile,
    frontColorCode: candidates[0].frontColorCode,
    frontMaterialProfile: candidates[0].frontMaterialProfile,
    evidenceSkuCount: candidates[0].evidenceSkuCount,
  }, {
    structureColorCode: '1371', structureMaterialProfile: 'CARB2', frontColorCode: '0467', frontMaterialProfile: 'RH', evidenceSkuCount: 1,
  })
})

test('keeps edge bands untouched by a board-only Dual color case', () => {
  const structure: BomStructure = {
    schema_version: 2, structure_type: 'production', input_warehouse_code: '01', output_warehouse_code: null,
    lines: [
      {
        line_id: 'board', sort_order: 1, line_kind: 'material_group', base_item_code: null, product_application_scope: 'full_product', qty: null,
        input_warehouse_code: null, issue_method_override: null,
        alternatives: [
          { alternative_id: 'st', base_item_code: 'CMPD06-0001-000', material_profile: 'ST', is_default: true },
          { alternative_id: 'carb', base_item_code: 'CMPD06-0008-000', material_profile: 'CARB2', is_default: false },
          { alternative_id: 'rh', base_item_code: 'CMPD06-0004-000', material_profile: 'RH', is_default: false },
        ],
        consumptions: [
          { color_mode: 'dual', product_application_scope: 'structure', material_profile: 'CARB2', format_key: null, qty: 0.76, status: 'confirmed' },
          { color_mode: 'dual', product_application_scope: 'front', material_profile: 'RH', format_key: null, qty: 0.21, status: 'confirmed' },
        ],
      },
      { line_id: 'edge', sort_order: 2, line_kind: 'fixed', base_item_code: 'CMPD06-0003-000', product_application_scope: 'edge_band_full_product', qty: 1, input_warehouse_code: null, issue_method_override: null, alternatives: [], consumptions: [] },
    ],
  }
  const components = new Map([
    ['CMPD06-0008-000-1371', component('CMPD06-0008-000-1371', 'TABLERO CARB 15MM NARDO', metadata({ material_kind: 'board', material_profile: 'CARB2' }))],
    ['CMPD06-0004-000-0467', component('CMPD06-0004-000-0467', 'TABLERO RH 15MM CINZA', metadata({ material_kind: 'board', material_profile: 'RH' }))],
    ['CMPD06-0003-000-0493', component('CMPD06-0003-000-0493', 'CANTO PVC AUSTRAL', metadata({ material_kind: 'edge_band' }))],
  ])
  const colorway: Colorway = {
    code_4dig: '0493', name_color_sap: 'AUSTRAL', color_mode: 'full', application_colors_json: { full_product: '0493', edge_band_full_product: '0493' },
    hybrid_color_cases: [{
      case_id: 'board_dual', color_mode: 'dual', material_kind: 'board', sku_completes: ['VBAN05-0122-000-0493'],
      application_colors: { structure: '1371', front: '0467' },
      application_material_profiles: { structure: 'CARB2', front: 'RH' },
    }],
    application_material_profiles_json: {}, allowed_product_types: [], is_active: true,
  }
  const resolved = resolveBomForSku({ skuComplete: 'VBAN05-0122-000-0493', skuColorCode: '0493', structure, globalOverrides: emptyOverrides, versionOverrides: emptyOverrides, colorway, componentItems: components })
  assert.deepEqual(resolved.map(item => item.resolved_item_code), ['CMPD06-0008-000-1371', 'CMPD06-0004-000-0467', 'CMPD06-0003-000-0493'])
})
