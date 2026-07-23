import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  splitBomByRole,
  buildReferenceCode,
  buildSkuPrefix,
} from '../cabinetBomReader'
import type { BomStructure } from '../../bom/types'

const VBAN05_BOM: BomStructure = {
  schema_version: 2,
  structure_type: 'production',
  input_warehouse_code: null,
  output_warehouse_code: null,
  lines: [
    { line_id: 'L1', sort_order: 1, line_kind: 'fixed', base_item_code: 'CEMP03-0001-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L2', sort_order: 2, line_kind: 'fixed', base_item_code: 'CMPD06-0003-000', product_application_scope: 'edge_band_body', qty: 6.72, uom: 'MT', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L3', sort_order: 3, line_kind: 'fixed', base_item_code: 'CMPD06-0005-000', product_application_scope: 'edge_band_front', qty: 2.03, uom: 'MT', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    {
      line_id: 'L4', sort_order: 4, line_kind: 'material_group', base_item_code: null, product_application_scope: 'full_product', qty: null, uom: 'M2', alternatives: [], consumptions: [
        { color_mode: 'full', status: 'observed', format_key: null, material_profile: 'ST', product_application_scope: 'full_product', qty: 0.92 },
        { color_mode: 'full', status: 'observed', format_key: null, material_profile: 'CARB2', product_application_scope: 'full_product', qty: 0.92 },
      ], input_warehouse_code: null, issue_method_override: null,
    },
    { line_id: 'L5', sort_order: 5, line_kind: 'fixed', base_item_code: 'CMPD09-0001-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L6', sort_order: 6, line_kind: 'fixed', base_item_code: 'CMPD09-0002-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L7', sort_order: 7, line_kind: 'fixed', base_item_code: 'CMPD09-0003-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L8', sort_order: 8, line_kind: 'fixed', base_item_code: 'CMPD09-0006-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L9', sort_order: 9, line_kind: 'fixed', base_item_code: 'CMPD09-0007-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L10', sort_order: 10, line_kind: 'fixed', base_item_code: 'CMPD09-0031-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L11', sort_order: 11, line_kind: 'fixed', base_item_code: 'CEMP02-0354-000', product_application_scope: 'NA', qty: 20, uom: 'CMS', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L12', sort_order: 12, line_kind: 'fixed', base_item_code: 'CEMP03-0050-000', product_application_scope: 'NA', qty: 16, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L13', sort_order: 13, line_kind: 'fixed', base_item_code: 'CEMP02-0375-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L14', sort_order: 14, line_kind: 'fixed', base_item_code: 'CMPD07-0070-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L15', sort_order: 15, line_kind: 'fixed', base_item_code: 'PZCO01-0014-000', product_application_scope: 'NA', qty: 21.97, uom: 'MIN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L16', sort_order: 16, line_kind: 'fixed', base_item_code: 'PZCO01-0015-000', product_application_scope: 'NA', qty: 21.97, uom: 'MIN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
    { line_id: 'L17', sort_order: 17, line_kind: 'fixed', base_item_code: 'CEMP03-0061-000', product_application_scope: 'NA', qty: 1, uom: 'UN', alternatives: [], consumptions: [], input_warehouse_code: null, issue_method_override: null },
  ],
}

describe('buildReferenceCode', () => {
  it('BAN05 + 0001 = VBAN05-0001', () => {
    assert.equal(buildReferenceCode('BAN05', '0001'), 'VBAN05-0001')
  })

  it('BAN12 + 0081 = VBAN12-0081', () => {
    assert.equal(buildReferenceCode('BAN12', '0081'), 'VBAN12-0081')
  })
})

describe('buildSkuPrefix', () => {
  it('VBAN05-0001-000', () => {
    assert.equal(buildSkuPrefix('BAN05', '0001', '000'), 'VBAN05-0001-000')
  })
})

describe('splitBomByRole — VBAN05-0001', () => {
  const bom = VBAN05_BOM
  const result = splitBomByRole(bom)

  it('detects 6 board items (BASE, LAT IZQ, LAT DER, REF DEL, REF TRAS, PUERTA)', () => {
    assert.equal(result.boardItems.length, 6)
    const names = result.boardItems.map(i => i.itemCode)
    assert.ok(names.some(n => n.includes('CMPD09-0001')), 'BASE not found')
    assert.ok(names.some(n => n.includes('CMPD09-0031')), 'PUERTA not found')
  })

  it('detects 2 edge items (0.45mm body=6.72, 2mm front=2.03)', () => {
    assert.equal(result.edgeItems.length, 2)
    const edge045 = result.edgeItems.find(e => e.itemCode.includes('CMPD06-0003'))
    const edge2 = result.edgeItems.find(e => e.itemCode.includes('CMPD06-0005'))
    assert.ok(edge045, 'Edge 0.45mm not found')
    assert.ok(edge2, 'Edge 2mm not found')
    assert.equal(edge045?.qty, 6.72)
    assert.equal(edge2?.qty, 2.03)
  })

  it('detects 1 material_group (full_product, 0.92 M2)', () => {
    assert.equal(result.materialGroups.length, 1)
    assert.equal(result.materialGroups[0].scope, 'full_product')
    assert.equal(result.materialGroups[0].consumptions.length, 2)
    assert.equal(result.materialGroups[0].defaultProfile, 'ST')
  })

  it('extracts default profiles from material_group', () => {
    assert.equal(result.defaultProfiles.structure, 'ST')
    assert.equal(result.defaultProfiles.inner_structure, 'ST')
    assert.equal(result.defaultProfiles.drawer_bottom, 'ST')
    assert.equal(result.defaultProfiles.front, 'ST')
  })

  it('detects packaging items', () => {
    assert.ok(result.packagingItems.length >= 5)
    const hasCaja = result.packagingItems.some(p => p.itemCode.includes('CEMP03-0001'))
    const hasGrapas = result.packagingItems.some(p => p.itemCode.includes('CEMP03-0050'))
    assert.ok(hasCaja, 'CAJA not found')
    assert.ok(hasGrapas, 'GRAPAS not found')
  })

  it('detects process items (MO + CIF)', () => {
    assert.equal(result.processItems.length, 2)
  })

  it('detects kitting item (CMPD07-0070)', () => {
    assert.equal(result.kittingItems.length, 1)
    assert.ok(result.kittingItems[0].itemCode.includes('CMPD07-0070'))
  })

  it('detects the correct total line count', () => {
    const totalLines =
      result.boardItems.length +
      result.edgeItems.length +
      result.materialGroups.length +
      result.packagingItems.length +
      result.processItems.length +
      result.kittingItems.length

    assert.equal(totalLines, 17)
  })
})
