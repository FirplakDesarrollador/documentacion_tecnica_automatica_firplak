'use server'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { readSapFrozen, readSapValid } from '@/lib/bom/sapMapping'
import {
  analyzeReferenceBomImport,
  applyReferenceImportIssueMethod,
  confirmReferenceImportMaterialGroup,
  confirmReferenceImportMaterialProfile,
  confirmReferenceImportColorRule,
  getReferenceImportWorkspace,
  listReferenceImportCandidates,
  publishReferenceBomImportRun,
  resolveReferenceImportFinding,
  saveReferenceImportManualColorOverride,
} from '@/lib/bom/referenceImport'
import type { ReferenceImportWorkspace } from '@/lib/bom/referenceImportTypes'
import type { ReferenceProductApplicationScope } from '@/lib/bom/referenceImportScopes'
import { getSapItem } from '@/lib/sap/serviceLayer'
import { assertPermission } from '@/utils/auth/access'

type ActionResult = {
  success: boolean
  message: string
  workspace: ReferenceImportWorkspace | null
}

function failure(error: unknown, fallback: string): ActionResult {
  return {
    success: false,
    message: error instanceof Error ? error.message : fallback,
    workspace: null,
  }
}

function requiredSkuDeactivationConfirmation(skuComplete: string): string {
  return `INACTIVAR EN SUPABASE ${skuComplete}`
}

export async function listReferenceBomImportCandidatesAction(search = '') {
  await assertPermission('module:product-design')
  return listReferenceImportCandidates(search)
}

export async function getReferenceBomImportWorkspaceAction(runId: string): Promise<ActionResult> {
  await assertPermission('module:product-design')
  try {
    const workspace = await getReferenceImportWorkspace(runId)
    return { success: true, message: 'Auditoría BOM cargada.', workspace }
  } catch (error) {
    return failure(error, 'No se pudo cargar la auditoría BOM.')
  }
}

export async function analyzeReferenceBomImportAction(referenceId: string): Promise<ActionResult> {
  const access = await assertPermission('module:product-design')
  try {
    const workspace = await analyzeReferenceBomImport({
      referenceId: referenceId.trim(),
      createdBy: access.user?.id ?? null,
    })
    const capturedCount = workspace.snapshots.filter(snapshot => snapshot.status === 'captured').length
    const failedCount = workspace.snapshots.length - capturedCount
    const inactiveCount = Array.isArray(workspace.run.summaryJson.sap_inactive_sku_codes)
      ? workspace.run.summaryJson.sap_inactive_sku_codes.length
      : 0
    const missingCount = Array.isArray(workspace.run.summaryJson.sap_missing_sku_codes)
      ? workspace.run.summaryJson.sap_missing_sku_codes.length
      : 0
    const catalogMessage = [
      inactiveCount > 0 ? `${inactiveCount} ${inactiveCount === 1 ? 'código está inactivo' : 'códigos están inactivos'} en SAP` : null,
      missingCount > 0 ? `${missingCount} ${missingCount === 1 ? 'código no fue encontrado' : 'códigos no fueron encontrados'} en SAP` : null,
    ].filter((message): message is string => message !== null).join('; ')
    return {
      success: true,
      message: catalogMessage
        ? `SAP leyó ${capturedCount} de ${workspace.run.sourceSkuCount} LdM; ${catalogMessage}. Revisa SAP o inactiva esos códigos en Supabase para continuar.`
        : failedCount > 0
        ? `SAP leyó ${capturedCount} de ${workspace.run.sourceSkuCount} LdM; faltan ${failedCount} por leer antes de comparar la referencia.`
        : `SAP leyó las ${capturedCount} LdM activas y la comparación de la referencia está lista para revisar.`,
      workspace,
    }
  } catch (error) {
    return failure(error, 'No se pudo analizar la referencia desde SAP.')
  }
}

export async function confirmReferenceBomColorRuleAction(input: {
  runId: string
  findingId: string
  confirmationText: string
}): Promise<ActionResult> {
  const access = await assertPermission('module:product-design')
  try {
    await confirmReferenceImportColorRule({
      ...input,
      actorId: access.user?.id ?? null,
    })
    const workspace = await getReferenceImportWorkspace(input.runId)
    return { success: true, message: 'Regla global de color confirmada.', workspace }
  } catch (error) {
    return failure(error, 'No se pudo confirmar la regla de color.')
  }
}

export async function confirmReferenceBomMaterialGroupAction(input: {
  runId: string
  findingId: string
  confirmationText: string
}): Promise<ActionResult> {
  const access = await assertPermission('module:product-design')
  try {
    await confirmReferenceImportMaterialGroup({
      ...input,
      actorId: access.user?.id ?? null,
    })
    const workspace = await getReferenceImportWorkspace(input.runId)
    return { success: true, message: 'Grupo de materiales confirmado.', workspace }
  } catch (error) {
    return failure(error, 'No se pudo confirmar el grupo de materiales.')
  }
}

export async function confirmReferenceBomMaterialProfileAction(input: {
  runId: string
  findingId: string
  confirmationText: string
}): Promise<ActionResult> {
  const access = await assertPermission('module:product-design')
  try {
    await confirmReferenceImportMaterialProfile({
      ...input,
      actorId: access.user?.id ?? null,
    })
    const workspace = await getReferenceImportWorkspace(input.runId)
    return { success: true, message: 'Perfil de material guardado en el color.', workspace }
  } catch (error) {
    return failure(error, 'No se pudo guardar el perfil de material.')
  }
}

export async function saveReferenceBomManualColorOverrideAction(input: {
  runId: string
  findingId: string
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
  try {
    await saveReferenceImportManualColorOverride({
      ...input,
      actorId: access.user?.id ?? null,
    })
    const workspace = await getReferenceImportWorkspace(input.runId)
    return { success: true, message: 'Override guardado en Supabase.', workspace }
  } catch (error) {
    return failure(error, 'No se pudo guardar el override en Supabase.')
  }
}

export async function applyReferenceBomIssueMethodAction(input: {
  runId: string
  findingId: string
  targetIssueMethod: string
  dryRun: boolean
  confirmationText: string
}): Promise<ActionResult & {
  issueMethodResult?: Awaited<ReturnType<typeof applyReferenceImportIssueMethod>>
}> {
  const access = await assertPermission('module:product-design')
  try {
    const issueMethodResult = await applyReferenceImportIssueMethod({
      ...input,
      actorId: access.user?.id ?? null,
    })
    const workspace = await getReferenceImportWorkspace(input.runId)
    const failedCount = issueMethodResult.results.filter(result => !result.success).length
    return {
      success: failedCount === 0,
      message: input.dryRun
        ? `Dry-run revisado: ${issueMethodResult.results.length} linea(s), ${failedCount} con error.`
        : failedCount === 0
          ? 'Metodo de salida actualizado y verificado en SAP.'
          : `SAP tuvo ${failedCount} error(es); la revision sigue pendiente.`,
      workspace,
      issueMethodResult,
    }
  } catch (error) {
    return { ...failure(error, 'No se pudo homologar el metodo de salida.'), issueMethodResult: undefined }
  }
}

export async function deactivateSapInactiveSkuInSupabaseAction(input: {
  runId: string
  skuComplete: string
  confirmationText: string
}): Promise<ActionResult> {
  const access = await assertPermission('module:product-design')
  const normalizedSku = input.skuComplete.trim().toUpperCase()
  const expectedConfirmation = requiredSkuDeactivationConfirmation(normalizedSku)

  if (!normalizedSku || input.confirmationText.trim() !== expectedConfirmation) {
    return failure(new Error(`Escribe exactamente: ${expectedConfirmation}`), 'Confirmación inválida.')
  }

  try {
    const sapItem = await getSapItem(normalizedSku, ['ItemCode', 'Valid', 'Frozen'])
    const isStillInactiveInSap = readSapValid(sapItem) === false || readSapFrozen(sapItem) === true
    if (!isStillInactiveInSap) {
      throw new Error('SAP ya no reporta este SKU como inactivo. Vuelve a analizar la referencia antes de modificar Supabase.')
    }

    const updatedRows = await dbQuery(
      `WITH run_scope AS (
        SELECT reference_id, summary_json
        FROM public.product_bom_import_runs
        WHERE id = $1
        LIMIT 1
      ), target_sku AS (
        SELECT sku.id
        FROM public.product_skus sku
        JOIN public.product_versions version ON version.id = sku.version_id
        CROSS JOIN run_scope
        WHERE version.reference_id = run_scope.reference_id
          AND sku.sku_complete = $2
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
              COALESCE(run_scope.summary_json -> 'sap_inactive_sku_codes', '[]'::jsonb)
            ) AS inactive(code)
            WHERE inactive.code = $3
          )
      ), updated_sku AS (
        UPDATE public.product_skus sku
        SET status = 'INACTIVO',
            updated_at = now()
        WHERE sku.id IN (SELECT id FROM target_sku)
        RETURNING sku.id, sku.status
      ), updated_findings AS (
        UPDATE public.product_bom_import_findings
        SET status = 'resolved',
            decision_json = jsonb_build_object(
              'action', 'deactivate_sku_in_supabase',
              'sku_complete', $4,
              'confirmation_text', $5
            ),
            resolved_by = $6,
            resolved_at = now()
        WHERE run_id = $7
          AND details_json ->> 'sku_complete' = $8
        RETURNING id
      )
      SELECT id, status
      FROM updated_sku`,
      [
        input.runId,
        normalizedSku,
        normalizedSku,
        normalizedSku,
        expectedConfirmation,
        access.user?.id ?? null,
        input.runId,
        normalizedSku,
      ]
    )
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      throw new Error('El SKU no pertenece a esta referencia o la corrida no lo confirmó como inactivo en SAP.')
    }

    const updatedStatus = updatedRows[0]?.status
    if (updatedStatus !== 'INACTIVO') {
      throw new Error('Supabase no confirmó el cambio de estado del SKU.')
    }

    revalidatePath('/product-design/bom')
    return {
      success: true,
      message: `${normalizedSku} quedó INACTIVO en Supabase. Vuelve a analizar la referencia para continuar.`,
      workspace: null,
    }
  } catch (error) {
    return failure(error, 'No se pudo inactivar el SKU en Supabase.')
  }
}

export async function resolveReferenceBomFindingAction(input: {
  runId: string
  findingId: string
  decisionNote: string
}): Promise<ActionResult> {
  const access = await assertPermission('module:product-design')
  try {
    await resolveReferenceImportFinding({
      ...input,
      actorId: access.user?.id ?? null,
    })
    const workspace = await getReferenceImportWorkspace(input.runId)
    return { success: true, message: 'Decisión humana registrada.', workspace }
  } catch (error) {
    return failure(error, 'No se pudo registrar la decisión.')
  }
}

export async function publishReferenceBomImportAction(runId: string): Promise<ActionResult> {
  const access = await assertPermission('module:product-design')
  try {
    const workspace = await publishReferenceBomImportRun({
      runId,
      actorId: access.user?.id ?? null,
    })
    return { success: true, message: 'BOM base publicada en la referencia.', workspace }
  } catch (error) {
    return failure(error, 'No se pudo publicar la BOM.')
  }
}

export async function getResolvedExpandedBomAction(skuComplete: string): Promise<{
  success: boolean
  message: string
  lines: Record<string, unknown>[]
}> {
  await assertPermission('module:product-design')
  try {
    const normalizedSku = skuComplete.trim().toUpperCase()
    const lines: Record<string, unknown>[] = await dbQuery(
      `SELECT *
       FROM public.resolved_bom_expanded_for_sku($1)
       ORDER BY sort_path, line_id`,
      [normalizedSku]
    )
    return { success: true, message: 'LdM expandida cargada.', lines }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo cargar la LdM expandida.',
      lines: [],
    }
  }
}
