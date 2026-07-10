'use server'

import { dbQuery } from '@/lib/supabase'
import {
  analyzeReferenceBomImport,
  confirmReferenceImportColorRule,
  getReferenceImportWorkspace,
  listReferenceImportCandidates,
  publishReferenceBomImportRun,
  resolveReferenceImportFinding,
} from '@/lib/bom/referenceImport'
import type { ReferenceImportWorkspace } from '@/lib/bom/referenceImportTypes'
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
    return {
      success: true,
      message: failedCount > 0
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
