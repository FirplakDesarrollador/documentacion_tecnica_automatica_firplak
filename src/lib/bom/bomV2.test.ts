import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeReferenceBom } from './referenceImportAnalysis'
import { resolveBomForSku } from './resolve'
import { buildComponentTechnicalMetadata, inferMaterialProfile, normalizeSapLengthToMm } from './sapMapping'
import type {
  BomOverrides,
  BomStructure,
  Colorway,
  ComponentItem,
} from './types'
import type { ColorConfiguration, DirectBomSnapshot, NormalizedSapBomLine } from './referenceImportTypes'

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
    warehouse: '01',
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
  assert.deepEqual(materialGroup.alternatives.map(item => item.material_profile).sort(), ['CARB2', 'ST'])
  assert.equal(materialGroup.uom, 'UND')
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
    .filter(line => line.base_item_code === 'CMPD06-0008-000' || line.base_item_code === 'CMPD06-0004-000')
    .map(line => `${line.base_item_code}:${line.product_application_scope}`)
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
