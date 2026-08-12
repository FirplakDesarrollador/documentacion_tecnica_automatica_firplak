import 'server-only'

import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'
import {
  assertSapWritesEnabled,
  getSapItem,
  updateSapItem,
} from '@/lib/sap/serviceLayer'
import {
  isSapLifecycleState,
  readSapItemLifecycleState,
  sapPayloadForTargetStatus,
} from '@/lib/sap/itemLifecycle'
import { SAP_CODE_MANAGEMENT_PERMISSION } from '@/types/auth'
import { assertPermission } from '@/utils/auth/access'
import type { SapStatusUpdateInput, SapStatusUpdateResult } from './types'

export type { SapStatusUpdateInput, SapStatusUpdateResult } from './types'

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

export async function updateSapItemStatusAction(input: SapStatusUpdateInput): Promise<SapStatusUpdateResult> {
  const access = await assertPermission(SAP_CODE_MANAGEMENT_PERMISSION)
  const itemCode = normalizeSkuInput(input.itemCode)
  const payload = sapPayloadForTargetStatus(input.targetStatus)
  let sapResponse: unknown = null
  let success = false
  let errorMessage: string | null = null
  let beforeState: ReturnType<typeof readSapItemLifecycleState> | null = null
  let afterState: ReturnType<typeof readSapItemLifecycleState> | null = null
  let supabaseMirror: { found: boolean; status: string | null } = { found: false, status: null }

  try {
    const before = await getSapItem(itemCode, ['ItemCode', 'ItemName', 'Valid', 'Frozen'])
    beforeState = readSapItemLifecycleState(before)

    if (!input.dryRun && !input.confirmed) {
      throw new Error('Marca la confirmación explícita antes de actualizar el estado en SAP.')
    }

    if (!input.dryRun) {
      const current = await getSapItem(itemCode, ['ItemCode', 'ItemName', 'Valid', 'Frozen'])
      beforeState = readSapItemLifecycleState(current)
      await assertSapWritesEnabled()
      sapResponse = await updateSapItem(itemCode, payload)
      const after = await getSapItem(itemCode, ['ItemCode', 'ItemName', 'Valid', 'Frozen'])
      afterState = readSapItemLifecycleState(after)
      if (!isSapLifecycleState(afterState, input.targetStatus)) {
        throw new Error(`SAP no confirmó el estado ${input.targetStatus} para ${itemCode}.`)
      }
      const { error: mirrorError } = await supabaseTable('product_skus')
        .update({ status: input.targetStatus })
        .eq('sku_complete', itemCode)
      if (mirrorError) throw new Error(`SAP quedó actualizado, pero no se pudo sincronizar el SKU espejo: ${mirrorError.message}`)
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
      confirmationRequired: true,
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
      confirmationRequired: true,
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
        confirmation_text: input.confirmed ? 'checkbox_confirmed' : null,
        sap_payload: payload,
        sap_response: asRecord(sapResponse),
        success,
        error_message: errorMessage,
        created_by: access.user?.id ?? null,
      })
  }
}
