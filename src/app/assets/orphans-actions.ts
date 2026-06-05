'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath, revalidateTag, unstable_noStore as noStore } from 'next/cache'
import { assertRole } from '@/utils/auth/access'

async function assertAdminAccess() {
  await assertRole('admin')
}

export type OrphanReferenceRow = {
  reference_id: string
  family_code: string | null
  reference_code: string | null
  designation: string | null
  product_name: string | null
  commercial_measure: string | null
  line: string | null
  special_label: string | null
  accessory_text: string | null
  sample_sku_complete: string | null
  sample_final_name_es: string | null
}

function buildMissingIsometricWhere() {
  return `
    (status IS NULL OR status <> 'INACTIVO')
    AND (ref_status IS NULL OR ref_status <> 'INACTIVO')
    AND COALESCE(effective_version_attrs->>'isometric_path','') = ''
    AND COALESCE(effective_version_attrs->>'isometric_asset_id','') = ''
    AND (isometric_path IS NULL OR isometric_path = '')
    AND isometric_asset_id IS NULL
  `
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '').trim())
}

async function revalidateValidationSweepEverywhere() {
  // Local (same server) cache invalidation.
  revalidateTag('validation-sweep', { expire: 0 })

  // Optional remote invalidation (Vercel) when this action runs on localhost.
  const remoteUrl = process.env.REVALIDATE_REMOTE_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!remoteUrl || !secret) return

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    await fetch(remoteUrl, {
      method: 'POST',
      headers: { 'x-revalidate-secret': secret },
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch (e) {
    // Non-blocking: the DB write already happened; this only affects freshness in Vercel UI.
    console.warn('Remote revalidate failed:', e)
  }
}

/**
 * Returns reference-level "orphans":
 * - Missing effective isometric
 * - AND no usable suggestion exists (very_high/high). Medium does NOT count.
 */
export async function getOrphanReferencesAction(): Promise<OrphanReferenceRow[]> {
  await assertAdminAccess()

  noStore()
  const whereMissing = buildMissingIsometricWhere()

  // We compute this in SQL to ensure it's deterministic and reference-level.
  // "Usable suggestion" exists if there is any existing item with isometric such that:
  // - family_code, designation, commercial_measure, product_name match
  // - accessory_text matches => high
  // (special_label matches too => very_high, but either is considered usable)
  const rows =
    (await dbQuery(`
      WITH missing_skus AS (
        SELECT
          id as sku_id,
          family_code,
          reference_code,
          designation,
          product_name,
          commercial_measure,
          line,
          special_label,
          COALESCE(ref_attrs->>'accessory_text','NA') as accessory_text,
          sku_complete,
          final_complete_name_es
        FROM public.v_ui_generate_list
        WHERE ${whereMissing}
      ),
      missing_refs AS (
        SELECT
          v.reference_id,
          -- pick a stable sample row for UX
          MIN(ms.family_code) as family_code,
          MIN(ms.reference_code) as reference_code,
          MIN(ms.designation) as designation,
          MIN(ms.product_name) as product_name,
          MIN(ms.commercial_measure) as commercial_measure,
          MIN(ms.line) as line,
          MIN(ms.special_label) as special_label,
          MIN(ms.accessory_text) as accessory_text,
          MIN(ms.sku_complete) as sample_sku_complete,
          MIN(ms.final_complete_name_es) as sample_final_name_es
        FROM missing_skus ms
        JOIN public.product_skus s ON s.id = ms.sku_id
        JOIN public.product_versions v ON v.id = s.version_id
        GROUP BY v.reference_id
      ),
       existing_with_iso AS (
         SELECT
           family_code,
           designation,
           product_name,
           commercial_measure,
           COALESCE(ref_attrs->>'accessory_text','NA') as accessory_text,
           COALESCE(special_label,'NA') as special_label
         FROM public.v_ui_generate_list
         WHERE (status IS NULL OR status <> 'INACTIVO')
           AND (ref_status IS NULL OR ref_status <> 'INACTIVO')
           AND COALESCE(effective_version_attrs->>'isometric_path','') <> ''
       ),
       usable_suggestions AS (
         SELECT DISTINCT
           mr.reference_id
        FROM missing_refs mr
        JOIN existing_with_iso e
          ON COALESCE(mr.family_code,'') = COALESCE(e.family_code,'')
         AND COALESCE(mr.designation,'') = COALESCE(e.designation,'')
         AND COALESCE(mr.product_name,'') = COALESCE(e.product_name,'')
         AND COALESCE(mr.commercial_measure,'') = COALESCE(e.commercial_measure,'')
         AND COALESCE(mr.accessory_text,'NA') = COALESCE(e.accessory_text,'NA')
      )
      SELECT
        mr.reference_id,
        mr.family_code,
        mr.reference_code,
        mr.designation,
        mr.product_name,
        mr.commercial_measure,
        mr.line,
        mr.special_label,
        mr.accessory_text,
        mr.sample_sku_complete,
        mr.sample_final_name_es
      FROM missing_refs mr
      LEFT JOIN usable_suggestions us ON us.reference_id = mr.reference_id
      WHERE us.reference_id IS NULL
      ORDER BY mr.family_code NULLS LAST, mr.reference_code NULLS LAST
    `)) as OrphanReferenceRow[]

  return Array.isArray(rows) ? rows : []
}

export async function inactivateOrphanReferencesAction(referenceIds: string[]): Promise<{ success: true; updated: number }> {
  await assertAdminAccess()

  noStore()
  const ids = (referenceIds || []).map(v => String(v || '').trim()).filter(isUuid)
  const unique = Array.from(new Set(ids))
  if (unique.length === 0) throw new Error('No hay referencias válidas para inactivar.')
  if (unique.length > 2000) throw new Error('Demasiadas referencias seleccionadas. Reduce la selección.')

  const placeholders = unique.map((_, i) => `$${i + 1}`).join(',')
  await dbQuery(
    `
      UPDATE public.product_references
      SET status = 'INACTIVO',
          updated_at = now()
      WHERE id IN (${placeholders})
    `,
    unique
  )

  revalidatePath('/assets')
  revalidatePath('/pending')
  await revalidateValidationSweepEverywhere()

  return { success: true, updated: unique.length }
}
