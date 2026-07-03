'use server'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'
import { assertPermission, assertRole } from '@/utils/auth/access'
import { getSapItem, updateSapItem, type SapEntityPayload } from '@/lib/sap/serviceLayer'
import { importPilotSapBoms, importSapBomForSku } from '@/lib/bom/sapImport'
import { PILOT_SKUS, type ResolvedBomLine } from '@/lib/bom/types'
import { parseSalesSku, readSapFrozen, readSapValid } from '@/lib/bom/sapMapping'

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
  version_id: string | null
  sku_complete: string
  route_type: 'furniture'
  schema_version: number
  route_data_json: Record<string, unknown>
  status: string
}

export type SapStatusUpdateInput = {
  itemCode: string
  targetStatus: 'ACTIVO' | 'INACTIVO'
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

function getTargetSapStatus(status: 'ACTIVO' | 'INACTIVO'): SapEntityPayload {
  return status === 'ACTIVO'
    ? { Valid: 'tYES', Frozen: 'tNO' }
    : { Valid: 'tNO', Frozen: 'tYES' }
}

function confirmationFor(input: SapStatusUpdateInput): string {
  return `ACTUALIZAR ${normalizeSkuInput(input.itemCode)} ${input.targetStatus}`
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

export async function getResolvedBomAction(skuComplete: string): Promise<{ lines: ResolvedBomLine[]; error: string | null }> {
  await assertPermission('module:product-design')

  try {
    return { lines: await getResolvedLines(normalizeSkuInput(skuComplete)), error: null }
  } catch (error) {
    return { lines: [], error: error instanceof Error ? error.message : 'No se pudo resolver la LdM' }
  }
}

export async function importPilotBomsAction(): Promise<{ success: boolean; message: string }> {
  await assertPermission('module:product-design')

  try {
    const results = await importPilotSapBoms(PILOT_SKUS.map(pilot => pilot.sku))
    return {
      success: true,
      message: `Importados ${results.length} SKUs piloto desde SAP.`,
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Falló la importación SAP' }
  }
}

export async function importSingleBomAction(skuComplete: string): Promise<{ success: boolean; message: string }> {
  await assertPermission('module:product-design')

  try {
    const result = await importSapBomForSku(normalizeSkuInput(skuComplete))
    return {
      success: true,
      message: `${result.skuComplete}: ${result.importedLineCount} líneas y ${result.componentUpsertCount} componentes importados.`,
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Falló la importación SAP' }
  }
}

async function getSkuScope(skuComplete: string): Promise<{ referenceId: string; versionId: string | null }> {
  const rows = await dbQuery(
    `SELECT r.id AS reference_id, v.id AS version_id
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
         AND route_type = 'furniture'
         AND (version_id = $2 OR version_id IS NULL)
       ORDER BY version_id NULLS LAST
       LIMIT 1`,
      [scope.referenceId, scope.versionId]
    )

    const row = rows[0]
    return {
      document: {
        id: readString(row?.id),
        reference_id: scope.referenceId,
        version_id: scope.versionId,
        sku_complete: sku,
        route_type: 'furniture',
        schema_version: typeof row?.schema_version === 'number' ? row.schema_version : 1,
        route_data_json: asRecord(row?.route_data_json),
        status: readString(row?.status) ?? 'draft',
      },
      error: null,
    }
  } catch (error) {
    return { document: null, error: error instanceof Error ? error.message : 'No se pudo leer hoja de ruta' }
  }
}

export async function saveRouteDocumentAction(input: {
  skuComplete: string
  routeData: Record<string, unknown>
  status: string
}): Promise<{ success: boolean; message: string }> {
  await assertPermission('module:product-design')

  try {
    const sku = normalizeSkuInput(input.skuComplete)
    const scope = await getSkuScope(sku)
    const existing = await dbQuery(
      `SELECT id
       FROM public.product_route_documents
       WHERE reference_id = $1
         AND route_type = 'furniture'
         AND (version_id = $2 OR version_id IS NULL)
       ORDER BY version_id NULLS LAST
       LIMIT 1`,
      [scope.referenceId, scope.versionId]
    )

    const existingId = readString(existing[0]?.id)
    if (existingId) {
      const { error } = await supabaseTable('product_route_documents')
        .update({
          version_id: scope.versionId,
          route_data_json: input.routeData,
          status: input.status,
        })
        .eq('id', existingId)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabaseTable('product_route_documents')
        .insert({
          reference_id: scope.referenceId,
          version_id: scope.versionId,
          route_type: 'furniture',
          schema_version: 1,
          route_data_json: input.routeData,
          status: input.status,
        })
      if (error) throw new Error(error.message)
    }

    revalidatePath('/product-design/route-sheets/furniture')
    revalidatePath('/productive-modules/route-sheets/furniture')
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
}> {
  const access = await assertRole('admin')
  const itemCode = normalizeSkuInput(input.itemCode)
  const payload = getTargetSapStatus(input.targetStatus)
  const expectedConfirmation = confirmationFor(input)
  let sapResponse: unknown = null
  let success = false
  let errorMessage: string | null = null

  try {
    const before = await getSapItem(itemCode, ['ItemCode', 'ItemName', 'Valid', 'Frozen'])
    const beforeValid = readSapValid(before)
    const beforeFrozen = readSapFrozen(before)

    if (!input.dryRun && input.confirmationText.trim() !== expectedConfirmation) {
      throw new Error(`Confirmación inválida. Escribe exactamente: ${expectedConfirmation}`)
    }

    if (!input.dryRun) {
      sapResponse = await updateSapItem(itemCode, payload)
      await supabaseTable('product_skus')
        .update({ status: input.targetStatus })
        .eq('sku_complete', itemCode)
    }

    success = true
    return {
      success: true,
      dryRun: input.dryRun,
      confirmationRequired: expectedConfirmation,
      message: input.dryRun
        ? `Dry-run listo. SAP actual: Valid=${String(beforeValid)} Frozen=${String(beforeFrozen)}.`
        : `${itemCode} actualizado en SAP y Supabase.`,
      payload,
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'No se pudo actualizar estado SAP'
    return {
      success: false,
      dryRun: input.dryRun,
      confirmationRequired: expectedConfirmation,
      message: errorMessage,
      payload,
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

export async function getPilotSkusAction() {
  await assertPermission('module:product-design')
  return PILOT_SKUS
}

export async function parseSkuForDisplayAction(skuComplete: string) {
  await assertPermission('module:product-design')
  return parseSalesSku(skuComplete)
}
