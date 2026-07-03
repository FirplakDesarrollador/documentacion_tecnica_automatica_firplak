import 'server-only'

import { revalidatePath } from 'next/cache'

import { getSapItem, getSapItemBom, type BomLine, type SapEntityPayload } from '@/lib/sap/serviceLayer'
import { supabaseTable } from '@/lib/supabaseDynamic'
import { assignSequentialBomLineIds } from './lineIds'
import {
  inferBaseItemName,
  inferComponentCategory,
  inferProductApplicationScope,
  parseSalesSku,
  parseSapItemCode,
  readSapFrozen,
  readSapItemName,
  readSapValid,
} from './sapMapping'
import type { BomStructure, BomStructureLine, ComponentItem } from './types'

type CatalogScope = {
  referenceId: string
  versionId: string
}

type ImportResult = {
  skuComplete: string
  referenceId: string
  versionId: string
  importedLineCount: number
  componentUpsertCount: number
  treeType: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function statusFromSap(item: SapEntityPayload): 'ACTIVO' | 'INACTIVO' {
  const valid = readSapValid(item)
  const frozen = readSapFrozen(item)
  return valid === false || frozen === true ? 'INACTIVO' : 'ACTIVO'
}

function mostCommon(values: Array<string | null>): string | null {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function structureTypeFromSap(treeType: string | null): BomStructure['structure_type'] {
  if (treeType === 'iSalesTree') return 'sales_kit'
  return 'production'
}

function getDefaultOutputWarehouse(structureType: BomStructure['structure_type']): string | null {
  return structureType === 'sales_kit' ? 'PT-02' : 'PT-01'
}

function lineToStructureLine(line: BomLine, defaultWarehouse: string | null, index: number): Omit<BomStructureLine, 'line_id'> {
  return {
    sort_order: Number.isFinite(line.ChildNum) ? line.ChildNum : (index + 1) * 10,
    base_item_code: parseSapItemCode(line.ItemCode).baseItemCode,
    product_application_scope: inferProductApplicationScope(line),
    qty: Number.isFinite(line.Quantity) ? line.Quantity : 0,
    input_warehouse_code: line.Warehouse && line.Warehouse !== defaultWarehouse ? line.Warehouse : null,
    issue_method_override: null,
  }
}

function mapLineToComponent(line: BomLine): ComponentItem | null {
  const parsed = parseSapItemCode(line.ItemCode)
  if (parsed.isSalesSku) return null

  return {
    item_code: parsed.itemCode,
    base_item_code: parsed.baseItemCode,
    variant_code_4: parsed.variantCode4,
    item_name: line.ItemName || parsed.itemCode,
    base_item_name: inferBaseItemName(line.ItemName || parsed.itemCode, parsed.variantCode4),
    uom: line.InventoryUOM,
    component_category: inferComponentCategory(parsed.itemCode, line.ItemName || ''),
    default_issue_method: line.IssueMethod || null,
    sap_valid: null,
    sap_frozen: null,
    is_inventory_item: null,
    item_bom_structure: {
      schema_version: 1,
      structure_type: 'component',
      input_warehouse_code: line.Warehouse,
      output_warehouse_code: null,
      lines: [],
    },
  }
}

async function ensureGlobalVersionRule(versionCode: string) {
  const { error } = await supabaseTable('global_version_rules')
    .upsert({
      version_code: versionCode,
      version_description: versionCode === '000' ? 'VERSION BASE' : `VERSION ${versionCode}`,
      product_types: [],
      status: 'ACTIVO',
      automatic_version_rules: {},
      bom_overrides: { schema_version: 1, operations: [] },
    }, { onConflict: 'version_code', ignoreDuplicates: true })

  if (error) throw new Error(`No se pudo asegurar global_version_rules: ${error.message}`)
}

async function ensureCatalogForSapSku(itemCode: string, item: SapEntityPayload): Promise<CatalogScope> {
  const parsed = parseSalesSku(itemCode)
  await ensureGlobalVersionRule(parsed.versionCode)

  const { data: existingReference, error: referenceReadError } = await supabaseTable('product_references')
    .select('id')
    .eq('family_code', parsed.familyCode)
    .eq('reference_code', parsed.referenceCode)
    .maybeSingle()

  if (referenceReadError) throw new Error(`No se pudo leer referencia: ${referenceReadError.message}`)

  let referenceId = readString((existingReference as Record<string, unknown> | null)?.id)
  if (!referenceId) {
    const { data: createdReference, error: createReferenceError } = await supabaseTable('product_references')
      .insert({
        family_code: parsed.familyCode,
        reference_code: parsed.referenceCode,
        product_name: readSapItemName(item, parsed.skuComplete),
        status: statusFromSap(item),
        ref_attrs: {},
        product_bom_structure: {
          schema_version: 1,
          structure_type: 'production',
          input_warehouse_code: null,
          output_warehouse_code: null,
          lines: [],
        },
      })
      .select('id')
      .single()

    if (createReferenceError) throw new Error(`No se pudo crear referencia: ${createReferenceError.message}`)
    referenceId = readString((createdReference as Record<string, unknown>).id)
  }

  if (!referenceId) throw new Error('La referencia no devolvió id')

  const { data: existingVersion, error: versionReadError } = await supabaseTable('product_versions')
    .select('id')
    .eq('reference_id', referenceId)
    .eq('version_code', parsed.versionCode)
    .maybeSingle()

  if (versionReadError) throw new Error(`No se pudo leer versión: ${versionReadError.message}`)

  let versionId = readString((existingVersion as Record<string, unknown> | null)?.id)
  if (!versionId) {
    const { data: createdVersion, error: createVersionError } = await supabaseTable('product_versions')
      .insert({
        reference_id: referenceId,
        version_code: parsed.versionCode,
        sku_base: parsed.skuBase,
        final_base_name_es: readSapItemName(item, parsed.skuBase),
        status: statusFromSap(item),
        version_attrs: {},
        bom_overrides: { schema_version: 1, operations: [] },
      })
      .select('id')
      .single()

    if (createVersionError) throw new Error(`No se pudo crear versión: ${createVersionError.message}`)
    versionId = readString((createdVersion as Record<string, unknown>).id)
  }

  if (!versionId) throw new Error('La versión no devolvió id')

  const { error: skuError } = await supabaseTable('product_skus')
    .upsert({
      version_id: versionId,
      sku_complete: parsed.skuComplete,
      sap_description_original: readSapItemName(item, parsed.skuComplete),
      color_code: parsed.colorCode,
      status: statusFromSap(item),
      sku_attrs: {},
    }, { onConflict: 'sku_complete' })

  if (skuError) throw new Error(`No se pudo crear/actualizar SKU: ${skuError.message}`)

  return { referenceId, versionId }
}

async function upsertComponentItems(lines: BomLine[]): Promise<number> {
  const components = lines
    .map(mapLineToComponent)
    .filter((component): component is ComponentItem => component !== null)

  const uniqueComponents = [...new Map(components.map(component => [component.item_code, component])).values()]
  if (uniqueComponents.length === 0) return 0

  const { error } = await supabaseTable('component_items')
    .upsert(uniqueComponents, { onConflict: 'item_code' })

  if (error) throw new Error(`No se pudieron guardar componentes: ${error.message}`)
  return uniqueComponents.length
}

export async function importSapBomForSku(skuComplete: string): Promise<ImportResult> {
  const item = await getSapItem(skuComplete)
  const bom = await getSapItemBom(skuComplete)
  if (!bom) throw new Error(`SAP no devolvió LdM para ${skuComplete}`)

  const catalog = await ensureCatalogForSapSku(skuComplete, item)
  const componentUpsertCount = await upsertComponentItems(bom.lines)
  const structureType = structureTypeFromSap(bom.treeType)
  const inputWarehouse = mostCommon(bom.lines.map(line => line.Warehouse))
  const rawLines: Array<Omit<BomStructureLine, 'line_id'> & { line_id?: string | null }> = bom.lines.map((line, index) => lineToStructureLine(line, inputWarehouse, index))
  const lines = assignSequentialBomLineIds(rawLines)

  const structure: BomStructure = {
    schema_version: 1,
    structure_type: structureType,
    input_warehouse_code: inputWarehouse,
    output_warehouse_code: getDefaultOutputWarehouse(structureType),
    lines,
  }

  const { error: updateReferenceError } = await supabaseTable('product_references')
    .update({ product_bom_structure: structure })
    .eq('id', catalog.referenceId)

  if (updateReferenceError) throw new Error(`No se pudo actualizar product_bom_structure: ${updateReferenceError.message}`)

  revalidatePath('/product-design')
  revalidatePath('/product-design/route-sheets/furniture')
  revalidatePath('/productive-modules/route-sheets/furniture')

  return {
    skuComplete,
    referenceId: catalog.referenceId,
    versionId: catalog.versionId,
    importedLineCount: lines.length,
    componentUpsertCount,
    treeType: bom.treeType,
  }
}

export async function importPilotSapBoms(skus: string[]) {
  const results = []
  for (const sku of skus) {
    results.push(await importSapBomForSku(sku))
  }
  return results
}

export function isRouteDocument(value: unknown): value is { route_data_json: unknown } {
  return isRecord(value) && 'route_data_json' in value
}
