import { NextResponse } from 'next/server'

import { apiGuard } from '@/utils/auth/access'
import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'
import { normalizeBomStructure, resolveBomForSku } from '@/lib/bom/resolve'
import type { BomOverrides, Colorway, ComponentItem } from '@/lib/bom/types'
import { validateBarcodeValue } from '@/lib/export/barcodeUtils'
import {
  syncMissingSapComponentsToCatalog,
  type SapComponentCatalogSyncResult,
} from '@/lib/sap/componentCatalogSync'
import {
  assertSapWritesEnabled,
  createSapItem,
  createSapProductTree,
  deleteSapItem,
  deleteSapProductTree,
  getSapItem,
  getSapItemBom,
  getSapProductTreeUsages,
  getSapProductionOrderUsages,
  SapServiceLayerError,
  updateSapItem,
  type SapEntityPayload,
} from '@/lib/sap/serviceLayer'
import { isPlainObject, sapApiErrorResponse } from '@/app/api/sap/_utils'
import { updateSapItemStatusAction } from '@/app/product-design/actions'
import {
  classifySapDeletionBlockReason,
  createConfirmation,
  deleteConfirmation,
  deletionBlockLabel,
  readSapItemLifecycleState,
  type SapItemTargetStatus,
} from '@/lib/sap/itemLifecycle'
import { SAP_CODE_MANAGEMENT_PERMISSION } from '@/types/auth'

export const runtime = 'nodejs'

type CreationRequest = {
  action: 'prepare' | 'compare' | 'create' | 'inspect' | 'status' | 'delete'
  referenceId: string
  versionId: string
  colorCode: string
  barcodeIntent: 'none' | 'provided'
  barcodeValue?: string
  itemCode: string
  targetStatus?: SapItemTargetStatus
  dryRun: boolean
  confirmationText: string
}

type AssociationReport = {
  parentTrees: Array<{ treeCode: string; treeType: string | null; productDescription: string | null }>
  productionOrders: Array<{ absoluteEntry: number | null; documentNumber: number | null; itemNo: string | null; status: string | null }>
  complete: boolean
  warnings: string[]
}

type CreationContext = {
  referenceId: string
  versionId: string
  familyCode: string
  referenceCode: string
  versionCode: string
  colorCode: string
  colorName: string
  targetItemCode: string
  sourceItemCode: string
  sourceItem: SapEntityPayload
  structure: ReturnType<typeof normalizeBomStructure>
  resolvedLines: ReturnType<typeof resolveBomForSku>
  itemPayload: SapEntityPayload
  treePayload: { treeCode: string; lines: Array<{ ItemCode: string; Quantity: number; Warehouse?: string | null; IssueMethod?: string | null }> }
  missing: string[]
  warnings: string[]
  componentSync: SapComponentCatalogSyncResult
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function emptyOverrides(value: unknown): BomOverrides {
  const record = jsonObject(value)
  return {
    schema_version: record.schema_version === 1 ? 1 : 2,
    operations: jsonArray(record.operations) as BomOverrides['operations'],
    color_overrides: jsonArray(record.color_overrides) as BomOverrides['color_overrides'],
  }
}

function componentItemsFromRows(componentRows: Record<string, unknown>[]): Map<string, ComponentItem> {
  return new Map<string, ComponentItem>(componentRows.map(component => {
    const itemCode = text(component.item_code)
    return [itemCode, {
      item_code: itemCode,
      base_item_code: text(component.base_item_code),
      variant_code_4: text(component.variant_code_4),
      item_name: text(component.item_name),
      base_item_name: text(component.base_item_name) || null,
      uom: text(component.uom) || null,
      component_category: (text(component.component_category) || 'unknown') as ComponentItem['component_category'],
      default_issue_method: text(component.default_issue_method) || null,
      sap_valid: typeof component.sap_valid === 'boolean' ? component.sap_valid : null,
      sap_frozen: typeof component.sap_frozen === 'boolean' ? component.sap_frozen : null,
      is_inventory_item: typeof component.is_inventory_item === 'boolean' ? component.is_inventory_item : null,
      item_bom_structure: normalizeBomStructure(component.item_bom_structure),
      technical_metadata: component.technical_metadata && typeof component.technical_metadata === 'object' ? component.technical_metadata as ComponentItem['technical_metadata'] : null,
    }]
  }))
}

function referenceDefaultProfileForColor(structure: ReturnType<typeof normalizeBomStructure>, colorway: Colorway): string | null {
  if (colorway.color_mode !== 'full' || colorway.application_material_profiles_json.full_product) return null
  const profiles = structure.lines.flatMap(line => {
    if (line.line_kind !== 'material_group' || line.product_application_scope !== 'full_product') return []
    const alternative = line.alternatives.find(candidate => candidate.is_default)
    if (!alternative) return []
    const hasUsableConsumption = line.consumptions.some(consumption =>
      consumption.color_mode === 'full'
      && consumption.product_application_scope === 'full_product'
      && consumption.material_profile === alternative.material_profile
      && consumption.qty !== null
      && consumption.status !== 'needs_definition'
    )
    return hasUsableConsumption ? [alternative.material_profile] : []
  })
  const uniqueProfiles = [...new Set(profiles)]
  return uniqueProfiles.length === 1 ? uniqueProfiles[0] ?? null : null
}

async function loadComponentItemRows(): Promise<Record<string, unknown>[]> {
  return dbQuery(
    `SELECT item_code, base_item_code, variant_code_4, item_name, base_item_name, uom, component_category,
            default_issue_method, sap_valid, sap_frozen, is_inventory_item, item_bom_structure, technical_metadata
       FROM public.component_items`,
  )
}

function parseRequest(value: unknown): CreationRequest {
  const body = isPlainObject(value) ? value : {}
  const supportedActions = new Set<CreationRequest['action']>(['prepare', 'compare', 'create', 'inspect', 'status', 'delete'])
  const requestedAction = text(body.action) as CreationRequest['action']
  const action = supportedActions.has(requestedAction) ? requestedAction : 'prepare'
  const barcodeIntent = body.barcodeIntent === 'provided' ? 'provided' : 'none'
  const targetStatus = body.targetStatus === 'INACTIVO' ? 'INACTIVO' : body.targetStatus === 'ACTIVO' ? 'ACTIVO' : undefined
  return {
    action,
    referenceId: text(body.referenceId),
    versionId: text(body.versionId),
    colorCode: text(body.colorCode).toUpperCase().padStart(4, '0'),
    barcodeIntent,
    barcodeValue: text(body.barcodeValue),
    itemCode: text(body.itemCode).toUpperCase(),
    targetStatus,
    dryRun: body.dryRun !== false,
    confirmationText: text(body.confirmationText),
  }
}

function buildItemPayload(source: SapEntityPayload, targetItemCode: string, itemName: string, barcode: string | null): SapEntityPayload {
  const blocked = new Set([
    'ItemCode', 'ItemName', 'ForeignName', 'BarCode', 'U_CodBarras', 'U_Color', 'U_PLU', 'U_TypeOC',
    'odata.metadata', 'odata.etag', 'UpdateDate', 'CreateDate', 'User_Text',
  ])
  const payload: SapEntityPayload = {}
  for (const [key, value] of Object.entries(source)) {
    if (!blocked.has(key) && value !== undefined) payload[key] = value
  }
  payload.ItemCode = targetItemCode
  payload.ItemName = itemName
  payload.ForeignName = itemName
  payload.U_Color = targetItemCode.split('-').at(-1)
  payload.U_TypeOC = 'MTOSTD'
  payload.U_CodBarras = barcode ? 'SI' : 'NO'
  payload.BarCode = barcode
  payload.U_PLU = targetItemCode
  payload.Valid = 'tYES'
  payload.Frozen = 'tNO'
  return payload
}

function diffValues(expected: SapEntityPayload, actual: SapEntityPayload): Array<{ field: string; expected: unknown; actual: unknown }> {
  const fields = ['ItemCode', 'ItemName', 'ForeignName', 'U_Color', 'U_TypeOC', 'U_CodBarras', 'BarCode', 'U_PLU', 'Valid', 'Frozen']
  return fields.filter(field => JSON.stringify(expected[field] ?? null) !== JSON.stringify(actual[field] ?? null))
    .map(field => ({ field, expected: expected[field] ?? null, actual: actual[field] ?? null }))
}

async function getOptionalSapItem(itemCode: string): Promise<SapEntityPayload | null> {
  try { return await getSapItem(itemCode) }
  catch (error) {
    if (error instanceof SapServiceLayerError && error.statusCode === 404) return null
    throw error
  }
}

async function inspectAssociations(itemCode: string): Promise<AssociationReport> {
  const warnings: string[] = []
  let complete = true
  let parentTrees: AssociationReport['parentTrees'] = []
  let productionOrders: AssociationReport['productionOrders'] = []

  try {
    parentTrees = await getSapProductTreeUsages(itemCode)
  } catch (error) {
    complete = false
    warnings.push(`No se pudieron consultar las LdM superiores: ${error instanceof Error ? error.message : 'error desconocido'}`)
  }

  try {
    productionOrders = await getSapProductionOrderUsages(itemCode)
  } catch (error) {
    complete = false
    warnings.push(`No se pudieron consultar las OF asociadas: ${error instanceof Error ? error.message : 'error desconocido'}`)
  }

  return { parentTrees, productionOrders, complete, warnings }
}

async function inspectSapItem(itemCode: string) {
  const normalizedCode = text(itemCode).toUpperCase()
  if (!normalizedCode) throw new Error('El ItemCode SAP es obligatorio.')
  const item = await getSapItem(normalizedCode)
  const bom = await getSapItemBom(normalizedCode)
  const associations = await inspectAssociations(normalizedCode)
  const mirrorRows = await dbQuery(
    `SELECT sku_complete, status FROM public.product_skus WHERE sku_complete = $1 LIMIT 1`,
    [normalizedCode],
  )

  return {
    itemCode: normalizedCode,
    item,
    lifecycle: readSapItemLifecycleState(item),
    bom: bom
      ? { treeCode: bom.treeCode, treeType: bom.treeType, lineCount: bom.lines.length, lines: bom.lines }
      : null,
    associations,
    supabaseMirror: mirrorRows[0]
      ? { found: true, skuComplete: text(mirrorRows[0].sku_complete), status: text(mirrorRows[0].status) || null }
      : { found: false, skuComplete: null, status: null },
  }
}

async function executeSapItemDeletion(input: CreationRequest) {
  const inspection = await inspectSapItem(input.itemCode)
  const expectedConfirmation = deleteConfirmation(inspection.itemCode)
  const deletionPlan = {
    itemCode: inspection.itemCode,
    itemExists: true,
    treeExists: Boolean(inspection.bom),
    treeCode: inspection.bom?.treeCode ?? null,
    treeLineCount: inspection.bom?.lineCount ?? 0,
    parentTrees: inspection.associations.parentTrees,
    productionOrders: inspection.associations.productionOrders,
    associationCheckComplete: inspection.associations.complete,
    warnings: inspection.associations.warnings,
  }

  if (input.dryRun) {
    await logOperation('sap_code_delete_dry_run', inspection.itemCode, deletionPlan, inspection, true, null, { dryRun: true })
    return {
      success: true,
      mode: 'delete',
      dryRun: true,
      confirmationRequired: expectedConfirmation,
      plan: deletionPlan,
      message: 'Dry-run listo. Ningún registro de SAP fue modificado.',
    }
  }

  if (input.confirmationText !== expectedConfirmation) {
    throw new Error(`ConfirmaciÃ³n invÃ¡lida. Escribe exactamente: ${expectedConfirmation}`)
  }

  if (!inspection.associations.complete) {
    await logOperation('sap_code_delete_blocked', inspection.itemCode, deletionPlan, inspection, false, 'No se pudo completar la consulta de asociaciones.')
    return {
      success: false,
      mode: 'delete',
      blocked: true,
      confirmationRequired: expectedConfirmation,
      plan: deletionPlan,
      message: 'Eliminación bloqueada: no se pudieron verificar todas las asociaciones SAP. Puedes inactivar el artículo.',
    }
  }

  if (inspection.associations.parentTrees.length > 0 || inspection.associations.productionOrders.length > 0) {
    const reason = inspection.associations.parentTrees.length > 0 ? 'SUPERIOR_BOM' : 'PRODUCTION_ORDER'
    const message = deletionBlockLabel(reason)
    await logOperation('sap_code_delete_blocked', inspection.itemCode, deletionPlan, inspection, false, message)
    return {
      success: false,
      mode: 'delete',
      blocked: true,
      confirmationRequired: expectedConfirmation,
      plan: deletionPlan,
      blockReason: reason,
      message: `${message} Puedes inactivar el artículo sin modificar sus componentes.`,
    }
  }

  await assertSapWritesEnabled()
  let treeDeleted = false
  let itemDeleted = false
  try {
    if (inspection.bom) {
      const treeCode = inspection.bom.treeCode || inspection.itemCode
      await deleteSapProductTree(treeCode)
      const treeAfter = await getSapItemBom(treeCode)
      if (treeAfter) throw new Error('SAP no confirmó la eliminación de la LdM.')
      treeDeleted = true
      await logOperation(
        'sap_code_delete_bom',
        inspection.itemCode,
        { treeCode, previousLineCount: inspection.bom.lineCount },
        { treeDeleted: true },
        true,
      )
    }

    await deleteSapItem(inspection.itemCode)
    const itemAfter = await getOptionalSapItem(inspection.itemCode)
    if (itemAfter) throw new Error('SAP no confirmó la eliminación del artículo.')
    itemDeleted = true
    await logOperation(
      'sap_code_delete_item',
      inspection.itemCode,
      { itemCode: inspection.itemCode },
      { itemDeleted: true },
      true,
    )

    const { error: mirrorError } = await supabaseTable('product_skus')
      .update({ status: 'INACTIVO' })
      .eq('sku_complete', inspection.itemCode)
    if (mirrorError) throw new Error(`SAP eliminó el artículo, pero no se pudo marcar el SKU espejo como inactivo: ${mirrorError.message}`)
    const mirrorRows = await dbQuery(
      `SELECT sku_complete, status FROM public.product_skus WHERE sku_complete = $1 LIMIT 1`,
      [inspection.itemCode],
    )
    const mirror = mirrorRows[0]
      ? { found: true, status: text(mirrorRows[0].status) || null }
      : { found: false, status: null }

    await logOperation('sap_code_delete', inspection.itemCode, deletionPlan, { treeDeleted, itemDeleted, mirror }, true)
    return {
      success: true,
      mode: 'delete',
      dryRun: false,
      itemCode: inspection.itemCode,
      treeDeleted,
      itemDeleted,
      supabaseMirror: mirror,
      message: `Artículo ${inspection.itemCode} eliminado y verificado en SAP${mirror.found ? '; SKU espejo conservado como INACTIVO.' : '.'}`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SAP rechazó la eliminación.'
    const blockReason = classifySapDeletionBlockReason(message)
    let afterItem: SapEntityPayload | null = null
    let itemReadbackComplete = true
    try {
      afterItem = await getOptionalSapItem(inspection.itemCode)
    } catch {
      itemReadbackComplete = false
    }
    const itemKnownToExist = Boolean(afterItem) || !itemReadbackComplete
    const partial = { treeDeleted, itemDeleted, itemStillExists: itemReadbackComplete ? Boolean(afterItem) : null, itemReadbackComplete, blockReason }
    await logOperation('sap_code_delete_partial', inspection.itemCode, deletionPlan, partial, false, message)
    return {
      success: false,
      mode: 'delete',
      partial,
      fallback: itemKnownToExist ? 'INACTIVAR' : null,
      message: treeDeleted && itemKnownToExist
        ? `La LdM fue eliminada, pero SAP bloqueó el artículo: ${deletionBlockLabel(blockReason)} Se propone inactivar el artículo.`
        : message,
    }
  }
}

async function buildContext(input: CreationRequest): Promise<CreationContext> {
  if (!input.referenceId || !input.versionId || !/^\d{4}$/.test(input.colorCode)) throw new Error('Referencia, versión y color de cuatro dígitos son obligatorios.')

  const rows: Record<string, unknown>[] = await dbQuery(
    `SELECT r.id AS reference_id, r.family_code, r.reference_code, r.product_bom_structure, r.bom_overrides AS reference_bom_overrides,
            v.id AS version_id, v.version_code, v.sku_base, v.bom_overrides AS version_bom_overrides,
            v.final_base_name_es, v.final_base_name_en,
            c.code_4dig, c.name_color_sap, c.color_mode, c.application_colors_json,
            c.application_material_profiles_json, c.allowed_product_types, c.is_active
       FROM public.product_references r
       JOIN public.product_versions v ON v.reference_id = r.id
       LEFT JOIN public.colors c ON c.code_4dig = $1
      WHERE r.id = $2 AND v.id = $3 AND v.version_code = '000'
        AND COALESCE(r.status, 'ACTIVO') = 'ACTIVO' AND COALESCE(v.status, 'ACTIVO') = 'ACTIVO'
      LIMIT 1`,
    [input.colorCode, input.referenceId, input.versionId],
  )
  const row = rows[0]
  if (!row) throw new Error('La referencia/version no existe o no está activa.')
  if (text(row.code_4dig) !== input.colorCode || row.is_active === false) throw new Error(`El color ${input.colorCode} no existe o está inactivo en Supabase.`)

  const familyCode = text(row.family_code)
  const referenceCode = text(row.reference_code)
  const versionCode = text(row.version_code)
  const targetItemCode = `V${familyCode}-${referenceCode}-${versionCode}-${input.colorCode}`.toUpperCase()
  const skuRows: Record<string, unknown>[] = await dbQuery(
    `SELECT sku_complete FROM public.product_skus WHERE version_id = $1 AND COALESCE(status, 'ACTIVO') = 'ACTIVO' ORDER BY sku_complete LIMIT 1`,
    [input.versionId],
  )
  const sourceItemCode = text(skuRows[0]?.sku_complete)
  if (!sourceItemCode) throw new Error('No hay un SKU activo de la referencia para obtener el perfil técnico SAP.')
  const sourceItem = await getSapItem(sourceItemCode)
  const sourceBom = await getSapItemBom(sourceItemCode)
  if (!sourceBom) throw new Error(`SAP no tiene una LdM legible para el SKU de evidencia ${sourceItemCode}.`)

  const structure = normalizeBomStructure(row.product_bom_structure)
  if (structure.lines.length === 0) throw new Error('La referencia no tiene una BOM V2 publicada con líneas.')
  let componentItems = componentItemsFromRows(await loadComponentItemRows())
  const colorway: Colorway = {
    code_4dig: input.colorCode,
    name_color_sap: text(row.name_color_sap),
    color_mode: (text(row.color_mode) || 'full') as Colorway['color_mode'],
    application_colors_json: jsonObject(row.application_colors_json) as Record<string, string>,
    application_material_profiles_json: jsonObject(row.application_material_profiles_json) as Record<string, string>,
    allowed_product_types: jsonArray(row.allowed_product_types).map(text).filter(Boolean),
    is_active: row.is_active !== false,
  }
  const defaultReferenceProfile = referenceDefaultProfileForColor(structure, colorway)
  if (defaultReferenceProfile) {
    colorway.application_material_profiles_json = {
      ...colorway.application_material_profiles_json,
      full_product: defaultReferenceProfile,
    }
  }
  const skuOverridesRows: Record<string, unknown>[] = await dbQuery(
    `SELECT bom_overrides FROM public.product_skus WHERE sku_complete = $1 LIMIT 1`,
    [sourceItemCode],
  )
  const skuOverrides = emptyOverrides(skuOverridesRows[0]?.bom_overrides)
  const resolveLines = () => resolveBomForSku({
    skuComplete: targetItemCode,
    skuColorCode: input.colorCode,
    structure,
    referenceOverrides: emptyOverrides(row.reference_bom_overrides),
    globalOverrides: { schema_version: 2, operations: [] },
    versionOverrides: emptyOverrides(row.version_bom_overrides),
    skuOverrides,
    colorway,
    componentItems,
  })
  let resolvedLines = resolveLines()
  const componentSync = await syncMissingSapComponentsToCatalog(
    resolvedLines
      .filter(line => line.resolution_status === 'missing_component_item')
      .map(line => ({ itemCode: line.resolved_item_code, defaultIssueMethod: line.issue_method })),
  )
  if (componentSync.importedItemCodes.length > 0) {
    componentItems = componentItemsFromRows(await loadComponentItemRows())
    resolvedLines = resolveLines()
  }
  if (componentSync.importedItemCodes.length > 0 || componentSync.errors.length > 0) {
    await logOperation(
      'component_catalog_sync',
      targetItemCode,
        { imported_item_codes: componentSync.importedItemCodes, color_code: input.colorCode },
      componentSync,
      componentSync.errors.length === 0,
      componentSync.errors[0] ?? null,
    )
  }
  const missing = resolvedLines.filter(line => line.resolution_status !== 'resolved').map(line => `${line.line_id}: ${line.resolution_status}`)
  const colorName = text(row.name_color_sap) || input.colorCode
  const baseName = text(row.final_base_name_es) || text(row.final_base_name_en) || `${familyCode}-${referenceCode}`
  const itemName = `${baseName} ${colorName}`.trim().slice(0, 100)
  const barcode = input.barcodeIntent === 'provided'
    ? validateBarcodeValue(input.barcodeValue, 'ean13')
    : { ok: true, normalizedValue: '', errorMessage: null }
  if (!barcode.ok) throw new Error(barcode.errorMessage ?? 'Código de barras inválido.')
  if (barcode.normalizedValue) {
    const barcodeRows: Record<string, unknown>[] = await dbQuery(`SELECT sku_complete FROM public.product_skus WHERE barcode_text = $1 LIMIT 1`, [barcode.normalizedValue])
    if (barcodeRows.length > 0) throw new Error(`El código de barras ya está usado por ${text(barcodeRows[0].sku_complete)}.`)
  }
  const itemPayload = buildItemPayload(sourceItem, targetItemCode, itemName, barcode.normalizedValue || null)
  const treePayload = {
    treeCode: targetItemCode,
    lines: resolvedLines.filter(line => line.resolution_status === 'resolved').map(line => ({
      ItemCode: line.resolved_item_code,
      Quantity: line.qty,
      Warehouse: line.input_warehouse_code,
      IssueMethod: line.issue_method,
    })),
  }
  return {
    referenceId: input.referenceId, versionId: input.versionId, familyCode, referenceCode, versionCode,
    colorCode: input.colorCode, colorName, targetItemCode, sourceItemCode, sourceItem, structure, resolvedLines,
    itemPayload, treePayload, missing,
    warnings: [
      'El perfil técnico de SAP se tomó de un SKU existente de la referencia; identidad, color, tipo de orden y barcode se generaron explícitamente.',
      ...(defaultReferenceProfile ? [`Se usó transitoriamente el perfil ${defaultReferenceProfile} de la alternativa predeterminada de la BOM; no se modificó la regla global del color.`] : []),
      ...(componentSync.importedItemCodes.length > 0 ? [`Se importaron desde SAP ${componentSync.importedItemCodes.length} componentes faltantes a Supabase.`] : []),
      ...(componentSync.unavailableItemCodes.length > 0 ? [`SAP reportó componentes inactivos o congelados: ${componentSync.unavailableItemCodes.join(', ')}.`] : []),
      ...(componentSync.missingInSapItemCodes.length > 0 ? [`SAP no encontró componentes: ${componentSync.missingInSapItemCodes.join(', ')}.`] : []),
      ...componentSync.errors.map(error => `No se pudo sincronizar componentes desde SAP: ${error}`),
    ],
    componentSync,
  }
}

async function logOperation(
  operationType: string,
  itemCode: string,
  payload: SapEntityPayload,
  response: unknown,
  success: boolean,
  errorMessage: string | null = null,
  options?: { dryRun?: boolean },
) {
  await supabaseTable('sap_operation_logs').insert({
    operation_type: operationType, item_code: itemCode, dry_run: options?.dryRun ?? false, sap_payload: payload,
    sap_response: response && typeof response === 'object' ? response : {}, success, error_message: errorMessage,
  })
}

export async function GET() {
  const guard = await apiGuard('module:product-design')
  if (guard.response) return guard.response
  try {
    const rows = await dbQuery(
      `SELECT r.id AS reference_id, r.family_code, r.reference_code, r.product_name, v.id AS version_id,
              v.version_code, v.final_base_name_es, v.final_base_name_en,
              jsonb_array_length(COALESCE(r.product_bom_structure->'lines', '[]'::jsonb)) AS line_count
         FROM public.product_references r JOIN public.product_versions v ON v.reference_id = r.id
        WHERE v.version_code = '000' AND COALESCE(r.status, 'ACTIVO') = 'ACTIVO' AND COALESCE(v.status, 'ACTIVO') = 'ACTIVO'
          AND jsonb_typeof(r.product_bom_structure) = 'object'
          AND jsonb_array_length(COALESCE(r.product_bom_structure->'lines', '[]'::jsonb)) > 0
        ORDER BY r.family_code, r.reference_code`)
    return NextResponse.json({ success: true, references: rows })
  } catch (error) { return sapApiErrorResponse(error) }
}

export async function POST(request: Request) {
  const guard = await apiGuard('module:product-design')
  if (guard.response) return guard.response
  try {
    const input = parseRequest(await request.json())
    if (input.action === 'inspect') {
      const inspection = await inspectSapItem(input.itemCode)
      return NextResponse.json({ success: true, mode: 'inspect', ...inspection })
    }

    const isMutation = input.action === 'create' || input.action === 'status' || input.action === 'delete'
    if (isMutation) {
      const mutationGuard = await apiGuard(SAP_CODE_MANAGEMENT_PERMISSION)
      if (mutationGuard.response) return mutationGuard.response
    }

    if (input.action === 'status') {
      if (!input.itemCode || !input.targetStatus) throw new Error('ItemCode y estado objetivo son obligatorios.')
      const result = await updateSapItemStatusAction({
        itemCode: input.itemCode,
        targetStatus: input.targetStatus,
        dryRun: input.dryRun,
        confirmationText: input.confirmationText,
      })
      return NextResponse.json(result, { status: result.success ? 200 : 409 })
    }

    if (input.action === 'delete') {
      const result = await executeSapItemDeletion(input)
      return NextResponse.json(result, { status: result.success ? 200 : 409 })
    }

    const context = await buildContext(input)
    const existing = await getOptionalSapItem(context.targetItemCode)
    const existingBom = await getSapItemBom(context.targetItemCode)
    if (input.action === 'prepare') {
      await logOperation('reference_bom_read', context.targetItemCode, { referenceId: context.referenceId, versionId: context.versionId, sourceItemCode: context.sourceItemCode, lineCount: context.resolvedLines.length }, { sourceItemCode: context.sourceItemCode, sourceBomLineCount: existingBom?.lines.length ?? 0 }, true)
      return NextResponse.json({ success: true, mode: 'prepare', context: { ...context, sourceItem: undefined }, existing: Boolean(existing), existingBom: existingBom ? { lineCount: existingBom.lines.length } : null })
    }
    const expectedTree = context.treePayload.lines
    if (input.action === 'compare') {
      const actualLines = existingBom?.lines ?? []
      const treeDiff = expectedTree.filter(expected => !actualLines.some(actual => actual.ItemCode === expected.ItemCode && actual.Quantity === expected.Quantity))
      return NextResponse.json({ success: true, mode: 'compare', targetItemCode: context.targetItemCode, itemExists: Boolean(existing), itemDifferences: existing ? diffValues(context.itemPayload, existing) : [], treeExists: Boolean(existingBom), treeDifferences: treeDiff, generatedLineCount: expectedTree.length, actualLineCount: actualLines.length, warnings: context.warnings })
    }
    if (existing) throw new Error(`${context.targetItemCode} ya existe en SAP. Usa Comparar para revisar diferencias.`)
    if (context.missing.length > 0) throw new Error(`La LdM no está completa para ${context.colorCode}: ${context.missing.join(', ')}`)
    const expectedConfirmation = createConfirmation(context.targetItemCode)
    if (input.confirmationText !== expectedConfirmation) {
      throw new Error(`ConfirmaciÃ³n invÃ¡lida. Escribe exactamente: ${expectedConfirmation}`)
    }
    await assertSapWritesEnabled()
    let createdItem = false
    try {
      const itemResponse = await createSapItem(context.itemPayload)
      createdItem = true
      const treeResponse = await createSapProductTree(context.treePayload)
      const readback = await getSapItem(context.targetItemCode)
      const treeReadback = await getSapItemBom(context.targetItemCode)
      await dbQuery(
        `INSERT INTO public.product_skus (version_id, sku_complete, color_code, sap_description_original, barcode_text, barcode_path, status, sku_attrs, naming_stale, naming_stale_at, naming_stale_final_complete_name, naming_stale_sap_description_recommended, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, 'ACTIVO', '{}'::jsonb, true, now(), true, true, now()) ON CONFLICT (sku_complete) DO NOTHING`,
        [context.versionId, context.targetItemCode, context.colorCode, text(context.itemPayload.ItemName), text(context.itemPayload.BarCode) || null],
      )
      await logOperation('sap_code_creation', context.targetItemCode, { item: context.itemPayload, tree: context.treePayload }, { itemResponse, treeResponse, readback, treeReadback }, true)
      return NextResponse.json({ success: true, mode: 'create', itemCode: context.targetItemCode, lineCount: treeReadback?.lines.length ?? context.treePayload.lines.length, barcode: context.itemPayload.BarCode ?? null })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error creando el código SAP.'
      let compensation = 'no_aplicada'
      if (createdItem) {
        try { await deleteSapItem(context.targetItemCode); compensation = 'item_borrado' }
        catch { try { await updateSapItem(context.targetItemCode, { Valid: 'tNO', Frozen: 'tYES' }); compensation = 'item_inactivado' } catch { compensation = 'pendiente_revision' } }
      }
      await logOperation('sap_code_creation_rollback', context.targetItemCode, { item: context.itemPayload, tree: context.treePayload, compensation }, {}, false, message)
      throw new Error(`${message} Compensación: ${compensation}.`)
    }
  } catch (error) { return sapApiErrorResponse(error) }
}
