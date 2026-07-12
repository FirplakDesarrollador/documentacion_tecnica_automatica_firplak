'use server'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'
import {
  analyzeReferenceBomImportTransient,
  listReferenceImportCandidates,
  type DirectColorRuleMatrixSelection,
  verifyReferenceImportColorRulesMatrixDirect,
  type ColorRuleCoverageResult,
} from '@/lib/bom/referenceImport'
import type { ReferenceImportWorkspace } from '@/lib/bom/referenceImportTypes'
import type { ReferenceProductApplicationScope } from '@/lib/bom/referenceImportScopes'
import { getSapItem, getSapItemBom, productTreeStructureMatches, updateSapItem, updateSapProductTreeIssueMethod, type SapEntityPayload } from '@/lib/sap/serviceLayer'
import { parseSapItemCode, readSapFrozen, readSapValid } from '@/lib/bom/sapMapping'
import { getColorsAction, upsertColorAction, type ColorEntry } from '@/app/rules/colors/actions'
import { assertPermission } from '@/utils/auth/access'

type ActionResult = {
  success: boolean
  message: string
  workspace: ReferenceImportWorkspace | null
}

type MatrixSelection = DirectColorRuleMatrixSelection
type IssueMethodItem = { skuComplete: string; childNum: number; itemCode: string }
type MatrixAbsence = { skuComplete: string; baseItemCode: string }
type DualColorMatrixPair = {
  sourceColorCode: string
  structureColorCode: string
  frontColorCode: string
}

const MATRIX_ABSENCE_VALIDATION_CONCURRENCY = 3

function failure(error: unknown, fallback: string): ActionResult {
  return { success: false, message: error instanceof Error ? error.message : fallback, workspace: null }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function dualColorPairsFromMatrixSelections(selections: MatrixSelection[]): DualColorMatrixPair[] {
  const edgeColorsBySource = new Map<string, { structureColorCode?: string; frontColorCode?: string }>()
  for (const selection of selections) {
    const sourceColorCode = selection.sourceColorCode.trim().toUpperCase()
    const targetColorCode = selection.targetColorCode.trim().toUpperCase()
    if (!sourceColorCode || !targetColorCode) continue
    const edgeColors = edgeColorsBySource.get(sourceColorCode) ?? {}
    if (selection.scope === 'edge_band_body') edgeColors.structureColorCode = targetColorCode
    if (selection.scope === 'edge_band_front') edgeColors.frontColorCode = targetColorCode
    edgeColorsBySource.set(sourceColorCode, edgeColors)
  }
  return [...edgeColorsBySource.entries()].flatMap(([sourceColorCode, edgeColors]) =>
    edgeColors.structureColorCode && edgeColors.frontColorCode && edgeColors.structureColorCode !== edgeColors.frontColorCode
      ? [{ sourceColorCode, structureColorCode: edgeColors.structureColorCode, frontColorCode: edgeColors.frontColorCode }]
      : []
  )
}

async function validateMatrixAbsencesInSap(input: MatrixAbsence[]): Promise<MatrixAbsence[]> {
  const items = [...new Map(input.flatMap((item) => {
    const skuComplete = item.skuComplete.trim().toUpperCase()
    const baseItemCode = item.baseItemCode.trim().toUpperCase()
    return skuComplete && baseItemCode ? [[`${skuComplete}:${baseItemCode}`, { skuComplete, baseItemCode }] as const] : []
  })).values()]
  if (items.length === 0) throw new Error('Selecciona al menos una ausencia para validar.')

  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      if (!item) continue
      const bom = await getSapItemBom(item.skuComplete)
      if (!bom) throw new Error(`SAP no devolvió la LdM de ${item.skuComplete}.`)
      if (bom.lines.some(line => parseSapItemCode(line.ItemCode).baseItemCode === item.baseItemCode)) {
        throw new Error(`${item.skuComplete} ya incluye ${item.baseItemCode} en SAP.`)
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(MATRIX_ABSENCE_VALIDATION_CONCURRENCY, items.length) },
    () => worker()
  ))
  return items
}

async function refreshed(referenceId: string, message: string): Promise<ActionResult> {
  const workspace = await analyzeReferenceBomImportTransient({ referenceId })
  return { success: true, message, workspace }
}

export async function listTransientReferenceBomImportCandidatesAction(search = '') {
  await assertPermission('module:product-design')
  return listReferenceImportCandidates(search)
}

export async function analyzeReferenceBomImportTransientAction(referenceId: string): Promise<ActionResult> {
  await assertPermission('module:product-design')
  try {
    const workspace = await analyzeReferenceBomImportTransient({ referenceId: referenceId.trim() })
    const capturedCount = workspace.snapshots.filter(snapshot => snapshot.status === 'captured').length
    return {
      success: true,
      message: `SAP leyó ${capturedCount} de ${workspace.run.sourceSkuCount} LdM y la comparación está lista para revisar.`,
      workspace,
    }
  } catch (error) {
    return failure(error, 'No se pudo analizar la referencia desde SAP.')
  }
}

export async function confirmTransientColorRuleAction(input: {
  referenceId: string
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  targetColorCode: string
  confirmationText: string
}): Promise<ActionResult> {
  await assertPermission('module:product-design')
  const sourceColorCode = input.sourceColorCode.trim().toUpperCase()
  const targetColorCode = input.targetColorCode.trim().toUpperCase()
  const expected = `CONFIRMAR REGLA ${sourceColorCode} ${input.scope} ${targetColorCode}`
  try {
    if (input.confirmationText.trim() !== expected) throw new Error(`Confirmación inválida. Escribe exactamente: ${expected}`)
    const rows: Record<string, unknown>[] = await dbQuery(
      `UPDATE public.colors
       SET application_colors_json = jsonb_set(COALESCE(application_colors_json, '{}'::jsonb), ARRAY[$1]::text[], to_jsonb($2::text), true)
       WHERE code_4dig = $3
       RETURNING code_4dig`,
      [input.scope, targetColorCode, sourceColorCode]
    )
    if (!readString(rows[0]?.code_4dig)) throw new Error(`No existe el color ${sourceColorCode}.`)
    revalidatePath('/configuration/colors')
    return refreshed(input.referenceId, 'Regla global guardada. SAP se volvió a analizar.')
  } catch (error) {
    return failure(error, 'No se pudo guardar la regla global.')
  }
}

export async function confirmTransientMaterialProfileAction(input: {
  referenceId: string
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  materialProfile: string
  confirmationText: string
}): Promise<ActionResult> {
  await assertPermission('module:product-design')
  const sourceColorCode = input.sourceColorCode.trim().toUpperCase()
  const materialProfile = input.materialProfile.trim().toUpperCase()
  const expected = `CONFIRMAR PERFIL ${sourceColorCode} ${input.scope} ${materialProfile}`
  try {
    if (input.confirmationText.trim() !== expected) throw new Error(`Confirmación inválida. Escribe exactamente: ${expected}`)
    const rows: Record<string, unknown>[] = await dbQuery(
      `UPDATE public.colors
       SET application_material_profiles_json = jsonb_set(COALESCE(application_material_profiles_json, '{}'::jsonb), ARRAY[$1]::text[], to_jsonb($2::text), true)
       WHERE code_4dig = $3
       RETURNING code_4dig`,
      [input.scope, materialProfile, sourceColorCode]
    )
    if (!readString(rows[0]?.code_4dig)) throw new Error(`No existe el color ${sourceColorCode}.`)
    revalidatePath('/configuration/colors')
    return refreshed(input.referenceId, 'Perfil guardado. SAP se volvió a analizar.')
  } catch (error) {
    return failure(error, 'No se pudo guardar el perfil.')
  }
}

export async function saveTransientColorOverrideAction(input: {
  referenceId: string
  level: 'reference' | 'version' | 'sku'
  skuComplete: string | null
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  targetColorCode: string | null
  materialProfile: string | null
  baseItemCode: string | null
  reason: string
}): Promise<ActionResult> {
  const access = await assertPermission('module:product-design')
  const reason = input.reason.trim()
  try {
    if (reason.length < 3) throw new Error('Explica brevemente por qué se necesita este override.')
    if (!input.targetColorCode && !input.materialProfile) throw new Error('Define un color de material, un perfil o ambos.')
    const override = JSON.stringify({
      color_code: input.sourceColorCode.trim().toUpperCase(),
      product_application_scope: input.scope,
      base_item_code: input.baseItemCode?.trim().toUpperCase() || null,
      target_color_code: input.targetColorCode?.trim().toUpperCase() || null,
      material_profile: input.materialProfile?.trim().toUpperCase() || null,
      reason,
      source: 'reference_import',
      actor_id: access.user?.id ?? null,
    })
    const target = input.level === 'reference'
      ? `UPDATE public.product_references reference SET bom_overrides = jsonb_set(jsonb_set(COALESCE(reference.bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true), '{color_overrides}', COALESCE(reference.bom_overrides -> 'color_overrides', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('override_id', gen_random_uuid()) || $1::jsonb), true) WHERE reference.id = $2 RETURNING reference.id`
      : input.level === 'version'
        ? `UPDATE public.product_versions version SET bom_overrides = jsonb_set(jsonb_set(COALESCE(version.bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true), '{color_overrides}', COALESCE(version.bom_overrides -> 'color_overrides', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('override_id', gen_random_uuid()) || $1::jsonb), true) WHERE version.reference_id = $2 AND version.version_code = '000' RETURNING version.id`
        : `UPDATE public.product_skus sku SET bom_overrides = jsonb_set(jsonb_set(COALESCE(sku.bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true), '{color_overrides}', COALESCE(sku.bom_overrides -> 'color_overrides', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('override_id', gen_random_uuid()) || $1::jsonb), true) FROM public.product_versions version WHERE sku.version_id = version.id AND version.reference_id = $2 AND version.version_code = '000' AND sku.sku_complete = $3 RETURNING sku.id`
    const parameters = input.level === 'sku' ? [override, input.referenceId, input.skuComplete?.trim().toUpperCase() ?? ''] : [override, input.referenceId]
    const rows: Record<string, unknown>[] = await dbQuery(target, parameters)
    if (!readString(rows[0]?.id)) throw new Error('No se pudo guardar el override en el alcance seleccionado.')
    return refreshed(input.referenceId, 'Override guardado. SAP se volvió a analizar.')
  } catch (error) {
    return failure(error, 'No se pudo guardar el override.')
  }
}

export async function verifyTransientColorMatrixAction(input: {
  selections: MatrixSelection[]
}): Promise<{ success: boolean; message: string; results: ColorRuleCoverageResult[] }> {
  await assertPermission('module:product-design')
  try {
    const results = await verifyReferenceImportColorRulesMatrixDirect({ selections: input.selections })
    const pending = results.reduce((total, result) => total + result.mismatches.length + result.sapReadErrors.length, 0)
    return { success: pending === 0, message: pending === 0 ? 'SAP confirma las reglas seleccionadas.' : `SAP encontró ${pending} caso(s) por revisar.`, results }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo verificar la matriz.', results: [] }
  }
}

export async function confirmTransientColorMatrixAction(input: {
  selections: MatrixSelection[]
  acceptedAbsences: Array<{ skuComplete: string; baseItemCode: string }>
}): Promise<ActionResult> {
  await assertPermission('module:product-design')
  try {
    if (input.selections.length === 0) throw new Error('Selecciona al menos una regla para aplicar.')
    if (input.acceptedAbsences.length > 0) await validateMatrixAbsencesInSap(input.acceptedAbsences)
    const dualPairs = dualColorPairsFromMatrixSelections(input.selections)
    for (const pair of dualPairs) {
      const rows: Record<string, unknown>[] = await dbQuery(
        `SELECT code_4dig, COALESCE(color_mode, 'full') AS color_mode
         FROM public.colors
         WHERE code_4dig = $1`,
        [pair.sourceColorCode]
      )
      if (!readString(rows[0]?.code_4dig)) throw new Error(`No existe el color ${pair.sourceColorCode}.`)
      if (readString(rows[0]?.color_mode)?.toLowerCase() === 'balance') {
        throw new Error(`El color ${pair.sourceColorCode} ya es Balance; no se puede convertir a Dual desde esta matriz.`)
      }
    }
    for (const selection of input.selections) {
      const rows: Record<string, unknown>[] = await dbQuery(
        `UPDATE public.colors SET application_colors_json = jsonb_set(COALESCE(application_colors_json, '{}'::jsonb), ARRAY[$1]::text[], to_jsonb($2::text), true) WHERE code_4dig = $3 RETURNING code_4dig`,
        [selection.scope, selection.targetColorCode.trim().toUpperCase(), selection.sourceColorCode.trim().toUpperCase()]
      )
      if (!readString(rows[0]?.code_4dig)) throw new Error(`No existe el color ${selection.sourceColorCode}.`)
    }
    for (const pair of dualPairs) {
      const rows: Record<string, unknown>[] = await dbQuery(
        `UPDATE public.colors
         SET color_mode = 'dual',
             application_colors_json = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(COALESCE(application_colors_json, '{}'::jsonb), '{edge_band_body}', to_jsonb($1::text), true),
                   '{edge_band_front}', to_jsonb($2::text), true
                 ),
                 '{structure}', to_jsonb($3::text), true
               ),
               '{front}', to_jsonb($4::text), true
             )
         WHERE code_4dig = $5
         RETURNING code_4dig`,
        [pair.structureColorCode, pair.frontColorCode, pair.structureColorCode, pair.frontColorCode, pair.sourceColorCode]
      )
      if (!readString(rows[0]?.code_4dig)) throw new Error(`No existe el color ${pair.sourceColorCode}.`)
    }
    revalidatePath('/configuration/colors')
    return { success: true, message: 'Reglas globales guardadas. Actualizando el análisis SAP.', workspace: null }
  } catch (error) {
    return failure(error, 'No se pudieron guardar las reglas de la matriz.')
  }
}

export async function validateTransientAbsencesAction(input: {
  items: Array<{ skuComplete: string; baseItemCode: string }>
}): Promise<{ success: boolean; message: string }> {
  await assertPermission('module:product-design')
  try {
    const items = await validateMatrixAbsencesInSap(input.items)
    return { success: true, message: `${items.length} ausencia(s) validada(s) para esta pantalla. No se guardó una excepción.` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudieron validar las ausencias.' }
  }
}

export async function applyTransientIssueMethodsBatchAction(input: {
  referenceId: string
  targetIssueMethod: 'im_Manual' | 'im_Backflush'
  dryRun: boolean
  confirmationText: string
  items: IssueMethodItem[]
}): Promise<ActionResult & { issueMethodResult?: { dryRun: boolean; confirmationRequired: string; results: Array<{ skuComplete: string; childNum: number; itemCode: string; success: boolean; changed: boolean; message: string }> } }> {
  const access = await assertPermission('module:product-design')
  const items = [...new Map(input.items.map(item => [`${item.skuComplete}:${item.childNum}:${item.itemCode}`, item])).values()]
  const confirmationRequired = `APLICAR METODO ${input.targetIssueMethod} EN SAP PARA ${items.length} LINEAS`
  try {
    if (!input.dryRun && input.confirmationText.trim() !== confirmationRequired) throw new Error(`Confirmación inválida. Escribe exactamente: ${confirmationRequired}`)
    const results: Array<{ skuComplete: string; childNum: number; itemCode: string; success: boolean; changed: boolean; message: string }> = []
    for (const item of items) {
      let success = false
      let changed = false
      let message = ''
      let response: Record<string, unknown> = {}
      try {
        const beforeTree = await getSapItemBom(item.skuComplete)
        if (!beforeTree) throw new Error(`SAP no devolvió ProductTree para ${item.skuComplete}.`)
        const beforeLine = beforeTree.lines.find(line => line.ChildNum === item.childNum && line.ItemCode === item.itemCode)
        if (!beforeLine) throw new Error(`SAP no encontró la línea ${item.childNum}/${item.itemCode}.`)
        if (beforeLine.IssueMethod === input.targetIssueMethod) {
          success = true
          message = 'SAP ya tenía el método solicitado.'
        } else if (input.dryRun) {
          success = true
          message = `Dry-run listo: ${beforeLine.IssueMethod} cambiaría a ${input.targetIssueMethod}.`
        } else {
          response = (await updateSapProductTreeIssueMethod({ treeCode: beforeTree.treeCode, childNum: item.childNum, itemCode: item.itemCode, issueMethod: input.targetIssueMethod })) as Record<string, unknown>
          const afterTree = await getSapItemBom(item.skuComplete)
          if (!afterTree || !productTreeStructureMatches(beforeTree.lines, afterTree.lines, { childNum: item.childNum, itemCode: item.itemCode, issueMethod: input.targetIssueMethod })) {
            throw new Error('La verificación posterior no confirma el cambio esperado.')
          }
          success = true
          changed = true
          message = 'Método actualizado y verificado en SAP.'
        }
      } catch (error) {
        message = error instanceof Error ? error.message : 'No se pudo actualizar SAP.'
      } finally {
        await supabaseTable('sap_operation_logs').insert({
          operation_type: 'product_tree_issue_method_update', item_code: item.skuComplete, requested_status: input.targetIssueMethod,
          dry_run: input.dryRun, confirmation_text: input.confirmationText, sap_payload: { child_num: item.childNum, item_code: item.itemCode },
          sap_response: response, success, error_message: success ? null : message, created_by: access.user?.id ?? null,
        })
      }
      results.push({ ...item, success, changed, message })
    }
    const failedCount = results.filter(result => !result.success).length
    const workspace = input.dryRun ? null : await analyzeReferenceBomImportTransient({ referenceId: input.referenceId })
    return {
      success: failedCount === 0,
      message: input.dryRun ? `Dry-run: ${results.length} línea(s), ${failedCount} con error.` : `${results.filter(result => result.success).length} línea(s) verificada(s) en SAP; ${failedCount} con error.`,
      workspace,
      issueMethodResult: { dryRun: input.dryRun, confirmationRequired, results },
    }
  } catch (error) {
    return { ...failure(error, 'No se pudieron homologar los métodos de salida.'), issueMethodResult: undefined }
  }
}

export async function deactivateTransientSapInactiveSkuInSupabaseAction(input: { referenceId: string; skuComplete: string; confirmationText: string }): Promise<ActionResult> {
  await assertPermission('module:product-design')
  const skuComplete = input.skuComplete.trim().toUpperCase()
  const expected = `INACTIVAR EN SUPABASE ${skuComplete}`
  try {
    if (input.confirmationText.trim() !== expected) throw new Error(`Escribe exactamente: ${expected}`)
    const item = await getSapItem(skuComplete, ['ItemCode', 'Valid', 'Frozen'])
    if (readSapValid(item) !== false && readSapFrozen(item) !== true) throw new Error('SAP ya no reporta este SKU como inactivo.')
    const rows: Record<string, unknown>[] = await dbQuery(
      `UPDATE public.product_skus sku SET status = 'INACTIVO', updated_at = now() FROM public.product_versions version WHERE sku.version_id = version.id AND version.reference_id = $1 AND version.version_code = '000' AND sku.sku_complete = $2 RETURNING sku.id`,
      [input.referenceId, skuComplete]
    )
    if (!readString(rows[0]?.id)) throw new Error('El SKU no pertenece a la referencia seleccionada.')
    return refreshed(input.referenceId, `${skuComplete} quedó inactivo en la app y SAP se volvió a analizar.`)
  } catch (error) {
    return failure(error, 'No se pudo inactivar el SKU en la app.')
  }
}

export async function deactivateTransientReferenceBomSkusInSapAction(input: {
  skuCompletes: string[]
  dryRun: boolean
  confirmationText: string
}): Promise<{ success: boolean; message: string; confirmationRequired: string; results: Array<{ skuComplete: string; success: boolean; changed: boolean; message: string }> }> {
  const access = await assertPermission('module:product-design')
  const skuCompletes = [...new Set(input.skuCompletes.map(value => value.trim().toUpperCase()).filter(Boolean))]
  const confirmationRequired = `INACTIVAR ${skuCompletes.length} SKU EN SAP`
  const payload: SapEntityPayload = { Valid: 'tNO', Frozen: 'tYES' }
  if (skuCompletes.length === 0) return { success: false, message: 'Selecciona al menos un SKU.', confirmationRequired, results: [] }
  if (!input.dryRun && input.confirmationText.trim() !== confirmationRequired) return { success: false, message: `Confirmación inválida. Escribe exactamente: ${confirmationRequired}`, confirmationRequired, results: [] }
  if (!input.dryRun) {
    const rows: Record<string, unknown>[] = await dbQuery(
      `SELECT COUNT(DISTINCT item_code) AS count FROM public.sap_operation_logs WHERE operation_type = 'item_status_update' AND requested_status = 'INACTIVO' AND dry_run = true AND success = true AND item_code IN (SELECT value FROM jsonb_array_elements_text($1::jsonb)) AND created_at >= now() - interval '30 minutes'`,
      [JSON.stringify(skuCompletes)]
    )
    if (Number(rows[0]?.count ?? 0) !== skuCompletes.length) return { success: false, message: 'Primero ejecuta el dry-run de todos los SKU seleccionados; vale durante 30 minutos.', confirmationRequired, results: [] }
  }
  const results: Array<{ skuComplete: string; success: boolean; changed: boolean; message: string }> = []
  for (const skuComplete of skuCompletes) {
    let success = false
    let changed = false
    let errorMessage: string | null = null
    let response: Record<string, unknown> = {}
    try {
      const before = await getSapItem(skuComplete, ['ItemCode', 'Valid', 'Frozen'])
      const alreadyInactive = readSapValid(before) === false || readSapFrozen(before) === true
      if (input.dryRun) {
        success = true
        results.push({ skuComplete, success, changed, message: alreadyInactive ? 'SAP ya lo reporta inactivo.' : 'Dry-run listo: se inactivaría y luego se verificaría.' })
      } else {
        if (!alreadyInactive) {
          response = (await updateSapItem(skuComplete, payload)) as Record<string, unknown>
          changed = true
        }
        const after = await getSapItem(skuComplete, ['ItemCode', 'Valid', 'Frozen'])
        if (readSapValid(after) !== false && readSapFrozen(after) !== true) throw new Error('La verificación posterior no confirma el estado inactivo.')
        await dbQuery(`UPDATE public.product_skus SET status = 'INACTIVO', updated_at = now() WHERE sku_complete = $1`, [skuComplete])
        success = true
        results.push({ skuComplete, success, changed, message: changed ? 'Inactivado y verificado en SAP.' : 'Ya estaba inactivo; la app quedó sincronizada.' })
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'No se pudo inactivar en SAP.'
      results.push({ skuComplete, success, changed, message: errorMessage })
    } finally {
      await supabaseTable('sap_operation_logs').insert({ operation_type: 'item_status_update', item_code: skuComplete, requested_status: 'INACTIVO', dry_run: input.dryRun, confirmation_text: input.confirmationText, sap_payload: payload, sap_response: response, success, error_message: errorMessage, created_by: access.user?.id ?? null })
    }
  }
  const failedCount = results.filter(result => !result.success).length
  return { success: failedCount === 0, message: input.dryRun ? `Dry-run de ${results.length} SKU: ${failedCount} con error.` : `${results.filter(result => result.success).length} SKU verificado(s) en SAP; ${failedCount} con error.`, confirmationRequired, results }
}

export async function publishTransientReferenceBomAction(referenceId: string): Promise<ActionResult> {
  await assertPermission('module:product-design')
  try {
    const workspace = await analyzeReferenceBomImportTransient({ referenceId })
    const blockers = workspace.findings.filter(finding => finding.severity === 'blocker' && finding.status === 'open')
    if (blockers.length > 0) throw new Error(`SAP aún tiene ${blockers.length} bloqueo(s) pendientes; no se publica una propuesta vieja.`)
    await dbQuery(
      `UPDATE public.product_references SET product_bom_structure = $1::jsonb WHERE id = $2`,
      [JSON.stringify(workspace.run.proposedBomStructure), referenceId]
    )
    revalidatePath('/product-design')
    return { success: true, message: 'BOM base publicada con una validación SAP fresca.', workspace }
  } catch (error) {
    return failure(error, 'No se pudo publicar la BOM.')
  }
}

export async function getTransientReferenceBomColorAction(colorCode: string): Promise<ColorEntry> {
  await assertPermission('module:product-design')
  const color = (await getColorsAction()).find(item => item.code_4dig === colorCode.trim().toUpperCase())
  if (!color) throw new Error(`No existe el color ${colorCode}.`)
  return color
}

export async function saveTransientReferenceBomColorAction(color: ColorEntry): Promise<ColorEntry> {
  await assertPermission('module:product-design')
  const saved = await upsertColorAction({ ...color, isNew: false })
  revalidatePath('/product-design/bom')
  return saved
}
