'use server'

import { Buffer } from 'node:buffer'
import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'
import { assertPermission } from '@/utils/auth/access'
import { getSapItem, updateSapItem, type SapEntityPayload } from '@/lib/sap/serviceLayer'
import { PILOT_SKUS, type ResolvedBomLine } from '@/lib/bom/types'
import {
  isSapLifecycleState,
  readSapItemLifecycleState,
  sapPayloadForTargetStatus,
  statusConfirmation,
  type SapItemTargetStatus,
} from '@/lib/sap/itemLifecycle'
import { SAP_CODE_MANAGEMENT_PERMISSION } from '@/types/auth'
import { parseCabinetRouteWorkbook } from '@/lib/routeSheets/cabinetRouteExcel'
import {
  CABINET_ROUTE_SCHEMA_VERSION,
  buildCabinetRouteMatchReport,
  deriveCabinetBomCandidates,
  applyOriginalRouteImport,
  isCabinetRouteStatus,
  normalizeCabinetRouteData,
  reconcileCabinetRouteData,
  withCabinetRouteSource,
  type CabinetBomCandidate,
  type CabinetBomLine,
  type CabinetBomSourceMode,
  type CabinetRouteData,
  type CabinetRouteMatchReport,
  type CabinetRouteStatus,
} from '@/lib/routeSheets/cabinets'

export type PilotBomSummary = {
  sku_complete: string
  label: string
  kind: string
  status: string | null
  color_code: string | null
  sap_description_original: string | null
  reference_id: string | null
  version_id: string | null
  family_code: string | null
  reference_code: string | null
  product_name: string | null
  line_count: number
  resolved_count: number
  missing_count: number
}

export type RouteDocumentState = {
  id: string | null
  reference_id: string
  reference_code: string | null
  version_id: string | null
  sku_complete: string
  route_type: 'cabinet'
  schema_version: number
  route_data_json: CabinetRouteData
  status: CabinetRouteStatus
}

export type CabinetRouteWorkspace = {
  document: RouteDocumentState | null
  lines: CabinetBomLine[]
  candidates: CabinetBomCandidate[]
  matchReport: CabinetRouteMatchReport
  bomSourceMode: CabinetBomSourceMode
  bomWarning: string | null
  error: string | null
}

export type SapStatusUpdateInput = {
  itemCode: string
  targetStatus: SapItemTargetStatus
  dryRun: boolean
  confirmationText: string
}

type PilotBomRow = {
  sku_complete: string
  status: string | null
  color_code: string | null
  sap_description_original: string | null
  version_id: string | null
  reference_id: string | null
  family_code: string | null
  reference_code: string | null
  product_name: string | null
  line_count: number | string | null
}

type SkuScope = {
  referenceId: string
  referenceCode: string | null
  versionId: string | null
}

type CabinetBomReadResult = {
  lines: CabinetBomLine[]
  sourceMode: CabinetBomSourceMode
  warning: string | null
}

function quoteSql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeSkuInput(value: string): string {
  return value.trim().toUpperCase()
}

function confirmationFor(input: SapStatusUpdateInput): string {
  return statusConfirmation(input.itemCode, input.targetStatus)
}

async function getResolvedLines(skuComplete: string): Promise<ResolvedBomLine[]> {
  const rows = await dbQuery(
    `SELECT *
     FROM public.resolved_bom_for_sku($1)
     ORDER BY sort_order, line_id`,
    [skuComplete]
  )

  return rows as ResolvedBomLine[]
}

async function getCabinetRouteBomLines(skuComplete: string): Promise<CabinetBomReadResult> {
  try {
    const rows = await dbQuery(
      `SELECT rb.*, ci.component_category
       FROM public.resolved_bom_expanded_for_sku($1) rb
       LEFT JOIN public.component_items ci ON ci.item_code = rb.resolved_item_code
       ORDER BY rb.sort_path, rb.sort_order, rb.line_id`,
      [skuComplete]
    )

    return { lines: rows as CabinetBomLine[], sourceMode: 'expanded', warning: null }
  } catch (error) {
    if (!isMissingExpandedBomFunctionError(error)) throw error
  }

  const rows = await dbQuery(
    `SELECT
       rb.*,
       NULL::text AS parent_line_id,
       rb.line_id AS root_line_id,
       NULL::text AS sort_path,
       rb.qty AS effective_qty,
       false AS is_cycle,
       ci.component_category
     FROM public.resolved_bom_for_sku($1) rb
     LEFT JOIN public.component_items ci ON ci.item_code = rb.resolved_item_code
     ORDER BY rb.sort_order, rb.line_id`,
    [skuComplete]
  )

  return {
    lines: rows as CabinetBomLine[],
    sourceMode: 'direct',
    warning: 'BOM directa sin subestructuras: resolved_bom_expanded_for_sku no esta disponible en Supabase.',
  }
}

export async function getPilotBomSummariesAction(): Promise<{ summaries: PilotBomSummary[]; error: string | null }> {
  await assertPermission('module:product-design')

  try {
    const skuList = PILOT_SKUS.map(pilot => quoteSql(pilot.sku)).join(',')
    const rows = await dbQuery(`
      SELECT
        s.sku_complete,
        s.status,
        s.color_code,
        s.sap_description_original,
        v.id AS version_id,
        r.id AS reference_id,
        r.family_code,
        r.reference_code,
        r.product_name,
        COALESCE(jsonb_array_length(r.product_bom_structure -> 'lines'), 0) AS line_count
      FROM public.product_skus s
      LEFT JOIN public.product_versions v ON v.id = s.version_id
      LEFT JOIN public.product_references r ON r.id = v.reference_id
      WHERE s.sku_complete IN (${skuList})
    `)

    const typedRows = rows as PilotBomRow[]
    const rowMap = new Map(typedRows.map(row => [String(row.sku_complete), row]))
    const summaries: PilotBomSummary[] = []

    for (const pilot of PILOT_SKUS) {
      const row = rowMap.get(pilot.sku)
      const resolvedLines = row ? await getResolvedLines(pilot.sku) : []
      const missingCount = resolvedLines.filter(line => line.resolution_status !== 'resolved').length

      summaries.push({
        sku_complete: pilot.sku,
        label: pilot.label,
        kind: pilot.kind,
        status: readString(row?.status),
        color_code: readString(row?.color_code),
        sap_description_original: readString(row?.sap_description_original),
        reference_id: readString(row?.reference_id),
        version_id: readString(row?.version_id),
        family_code: readString(row?.family_code),
        reference_code: readString(row?.reference_code),
        product_name: readString(row?.product_name),
        line_count: typeof row?.line_count === 'number' ? row.line_count : Number(row?.line_count ?? 0),
        resolved_count: resolvedLines.length - missingCount,
        missing_count: missingCount,
      })
    }

    return { summaries, error: null }
  } catch (error) {
    return { summaries: [], error: error instanceof Error ? error.message : 'No se pudo leer el piloto BOM' }
  }
}

async function getSkuScope(skuComplete: string): Promise<SkuScope> {
  const rows = await dbQuery(
    `SELECT r.id AS reference_id, r.reference_code, v.id AS version_id
     FROM public.product_skus s
     JOIN public.product_versions v ON v.id = s.version_id
     JOIN public.product_references r ON r.id = v.reference_id
     WHERE s.sku_complete = $1
     LIMIT 1`,
    [skuComplete]
  )

  const row = rows[0]
  const referenceId = readString(row?.reference_id)
  if (!referenceId) throw new Error(`No existe referencia para ${skuComplete}`)

  return {
    referenceId,
    referenceCode: readString(row?.reference_code),
    versionId: readString(row?.version_id),
  }
}

export async function getRouteDocumentAction(skuComplete: string): Promise<{ document: RouteDocumentState | null; error: string | null }> {
  await assertPermission('module:product-design')

  try {
    const sku = normalizeSkuInput(skuComplete)
    const scope = await getSkuScope(sku)
    const rows = await dbQuery(
      `SELECT id, reference_id, version_id, route_type, schema_version, route_data_json, status
       FROM public.product_route_documents
       WHERE reference_id = $1
         AND route_type = 'cabinet'
         AND version_id IS NULL
       LIMIT 1`,
      [scope.referenceId]
    )

    const row = rows[0]
    return {
      document: {
        id: readString(row?.id),
        reference_id: scope.referenceId,
        reference_code: scope.referenceCode,
        version_id: null,
        sku_complete: sku,
        route_type: 'cabinet',
        schema_version: typeof row?.schema_version === 'number' ? row.schema_version : CABINET_ROUTE_SCHEMA_VERSION,
        route_data_json: normalizeCabinetRouteData(row?.route_data_json),
        status: toRouteStatus(readString(row?.status)),
      },
      error: null,
    }
  } catch (error) {
    return { document: null, error: error instanceof Error ? error.message : 'No se pudo leer hoja de ruta' }
  }
}

export async function getCabinetRouteWorkspaceAction(skuComplete: string): Promise<CabinetRouteWorkspace> {
  await assertPermission('module:product-design')

  try {
    const sku = normalizeSkuInput(skuComplete)
    const [documentResult, bomResult] = await Promise.all([
      getRouteDocumentAction(sku),
      getCabinetRouteBomLines(sku),
    ])
    if (documentResult.error) throw new Error(documentResult.error)

    const candidates = deriveCabinetBomCandidates(bomResult.lines, bomResult.sourceMode)
    const missingBomCount = bomResult.lines.filter(line => line.resolution_status !== 'resolved').length
    const document = documentResult.document
      ? {
          ...documentResult.document,
          route_data_json: reconcileCabinetRouteData(withCabinetRouteSource(documentResult.document.route_data_json, {
            analysisSkuComplete: sku,
            referenceId: documentResult.document.reference_id,
            referenceCode: documentResult.document.reference_code,
            bomLineCount: bomResult.lines.length,
            missingBomCount,
            bomSourceMode: bomResult.sourceMode,
            bomWarning: bomResult.warning,
          }), candidates),
        }
      : null

    return {
      document,
      lines: bomResult.lines,
      candidates,
      matchReport: buildCabinetRouteMatchReport(document?.route_data_json ?? normalizeCabinetRouteData(null), candidates),
      bomSourceMode: bomResult.sourceMode,
      bomWarning: bomResult.warning,
      error: null,
    }
  } catch (error) {
    return {
      document: null,
      lines: [],
      candidates: [],
      matchReport: buildCabinetRouteMatchReport(normalizeCabinetRouteData(null), []),
      bomSourceMode: 'direct',
      bomWarning: null,
      error: error instanceof Error ? error.message : 'No se pudo preparar hoja de ruta cabinets',
    }
  }
}

export async function parseOriginalCabinetRouteSheetAction(formData: FormData): Promise<{
  success: boolean
  message: string
  routeData: CabinetRouteData | null
  warnings: string[]
}> {
  await assertPermission('module:product-design')

  try {
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      throw new Error('Selecciona una hoja de ruta original en formato .xlsx.')
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      throw new Error('Por ahora solo se aceptan hojas originales .xlsx.')
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('La hoja original supera el límite de 10 MB.')
    }

    const currentRouteData = normalizeCabinetRouteData(parseRouteDataJson(formData.get('routeData')))
    const sku = readString(formData.get('skuComplete'))
    const buffer = Buffer.from(await file.arrayBuffer())
    const imported = await parseCabinetRouteWorkbook(buffer, file.name)
    let routeData = applyOriginalRouteImport(currentRouteData, imported, file.name)
    const warnings = [...imported.warnings]

    if (sku) {
      try {
        const normalizedSku = normalizeSkuInput(sku)
        const scope = await getSkuScope(normalizedSku)
        const bomResult = await getCabinetRouteBomLines(normalizedSku)
        const candidates = deriveCabinetBomCandidates(bomResult.lines, bomResult.sourceMode)
        routeData = reconcileCabinetRouteData(withCabinetRouteSource(routeData, {
          analysisSkuComplete: normalizedSku,
          referenceId: scope.referenceId,
          referenceCode: scope.referenceCode,
          bomLineCount: bomResult.lines.length,
          missingBomCount: bomResult.lines.filter(line => line.resolution_status !== 'resolved').length,
          bomSourceMode: bomResult.sourceMode,
          bomWarning: bomResult.warning,
        }), candidates)
        if (bomResult.warning) warnings.push(bomResult.warning)
      } catch (error) {
        warnings.push(error instanceof Error ? `No se pudo conciliar contra SAP: ${error.message}` : 'No se pudo conciliar contra SAP.')
      }
    }

    return {
      success: true,
      message: `Hoja original importada: ${imported.pieces.length} piezas, ${imported.hardware_rows.length} herrajes y ${imported.packing_rows.length} elementos de empaque.`,
      routeData,
      warnings,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo importar la hoja original.',
      routeData: null,
      warnings: [],
    }
  }
}

export async function saveRouteDocumentAction(input: {
  skuComplete: string
  routeData: CabinetRouteData
  status: string
}): Promise<{ success: boolean; message: string }> {
  await assertPermission('module:product-design')

  try {
    const sku = normalizeSkuInput(input.skuComplete)
    const scope = await getSkuScope(sku)
    const bomResult = await getCabinetRouteBomLines(sku)
    const candidates = deriveCabinetBomCandidates(bomResult.lines, bomResult.sourceMode)
    const routeData = reconcileCabinetRouteData(withCabinetRouteSource(normalizeCabinetRouteData(input.routeData), {
      analysisSkuComplete: sku,
      referenceId: scope.referenceId,
      referenceCode: scope.referenceCode,
      bomLineCount: bomResult.lines.length,
      missingBomCount: bomResult.lines.filter(line => line.resolution_status !== 'resolved').length,
      bomSourceMode: bomResult.sourceMode,
      bomWarning: bomResult.warning,
    }), candidates)
    const status = toRouteStatus(input.status)
    const existing = await dbQuery(
      `SELECT id
       FROM public.product_route_documents
       WHERE reference_id = $1
         AND route_type = 'cabinet'
         AND version_id IS NULL
       LIMIT 1`,
      [scope.referenceId]
    )

    const existingId = readString(existing[0]?.id)
    if (existingId) {
      const { error } = await supabaseTable('product_route_documents')
        .update({
          version_id: null,
          schema_version: CABINET_ROUTE_SCHEMA_VERSION,
          route_data_json: routeData,
          status,
        })
        .eq('id', existingId)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabaseTable('product_route_documents')
        .insert({
          reference_id: scope.referenceId,
          version_id: null,
          route_type: 'cabinet',
          schema_version: CABINET_ROUTE_SCHEMA_VERSION,
          route_data_json: routeData,
          status,
        })
      if (error) throw new Error(error.message)
    }

    revalidatePath('/product-design/route-sheets/cabinets')
    revalidatePath('/productive-modules/route-sheets/cabinets')
    return { success: true, message: 'Hoja de ruta guardada.' }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo guardar hoja de ruta' }
  }
}

export async function updateSapItemStatusAction(input: SapStatusUpdateInput): Promise<{
  success: boolean
  dryRun: boolean
  confirmationRequired: string
  message: string
  payload: SapEntityPayload
  before: ReturnType<typeof readSapItemLifecycleState> | null
  after: ReturnType<typeof readSapItemLifecycleState> | null
  supabaseMirror: { found: boolean; status: string | null }
}> {
  const access = await assertPermission(SAP_CODE_MANAGEMENT_PERMISSION)
  const itemCode = normalizeSkuInput(input.itemCode)
  const payload = sapPayloadForTargetStatus(input.targetStatus)
  const expectedConfirmation = confirmationFor(input)
  let sapResponse: unknown = null
  let success = false
  let errorMessage: string | null = null
  let beforeState: ReturnType<typeof readSapItemLifecycleState> | null = null
  let afterState: ReturnType<typeof readSapItemLifecycleState> | null = null
  let supabaseMirror: { found: boolean; status: string | null } = { found: false, status: null }

  try {
    const before = await getSapItem(itemCode, ['ItemCode', 'ItemName', 'Valid', 'Frozen'])
    beforeState = readSapItemLifecycleState(before)

    if (!input.dryRun && input.confirmationText.trim() !== expectedConfirmation) {
      throw new Error(`Confirmación inválida. Escribe exactamente: ${expectedConfirmation}`)
    }

    if (!input.dryRun) {
      const current = await getSapItem(itemCode, ['ItemCode', 'ItemName', 'Valid', 'Frozen'])
      beforeState = readSapItemLifecycleState(current)
      sapResponse = await updateSapItem(itemCode, payload)
      const after = await getSapItem(itemCode, ['ItemCode', 'ItemName', 'Valid', 'Frozen'])
      afterState = readSapItemLifecycleState(after)
      if (!isSapLifecycleState(afterState, input.targetStatus)) {
        throw new Error(`SAP no confirmÃ³ el estado ${input.targetStatus} para ${itemCode}.`)
      }
      const { error: mirrorError } = await supabaseTable('product_skus')
        .update({ status: input.targetStatus })
        .eq('sku_complete', itemCode)
      if (mirrorError) throw new Error(`SAP quedÃ³ actualizado, pero no se pudo sincronizar el SKU espejo: ${mirrorError.message}`)
      const mirrorRows = await dbQuery(
        `SELECT sku_complete, status FROM public.product_skus WHERE sku_complete = $1 LIMIT 1`,
        [itemCode],
      )
      supabaseMirror = {
        found: mirrorRows.length > 0,
        status: readString(mirrorRows[0]?.status),
      }
    }

    success = true
    return {
      success: true,
      dryRun: input.dryRun,
      confirmationRequired: expectedConfirmation,
      message: input.dryRun
        ? `Dry-run listo. SAP actual: Valid=${String(beforeState?.valid)} Frozen=${String(beforeState?.frozen)}.`
        : `${itemCode} actualizado y verificado en SAP${supabaseMirror.found ? ' y en su SKU espejo.' : '; no existe SKU espejo en Supabase.'}`,
      payload,
      before: beforeState,
      after: afterState,
      supabaseMirror,
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'No se pudo actualizar estado SAP'
    return {
      success: false,
      dryRun: input.dryRun,
      confirmationRequired: expectedConfirmation,
      message: errorMessage,
      payload,
      before: beforeState,
      after: afterState,
      supabaseMirror,
    }
  } finally {
    await supabaseTable('sap_operation_logs')
      .insert({
        operation_type: 'item_status_update',
        item_code: itemCode,
        requested_status: input.targetStatus,
        dry_run: input.dryRun,
        confirmation_text: input.confirmationText,
        sap_payload: payload,
        sap_response: asRecord(sapResponse),
        success,
        error_message: errorMessage,
        created_by: access.user?.id ?? null,
      })
  }
}

function toRouteStatus(value: string | null): CabinetRouteStatus {
  return value && isCabinetRouteStatus(value) ? value : 'draft'
}

function parseRouteDataJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function isMissingExpandedBomFunctionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('resolved_bom_expanded_for_sku') || message.includes('does not exist') || message.includes('42883')
}
