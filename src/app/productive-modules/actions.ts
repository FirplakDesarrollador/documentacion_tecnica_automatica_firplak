'use server'

import { dbQuery } from '@/lib/supabase'
import { assertPermission } from '@/utils/auth/access'
import { PILOT_SKUS, type ResolvedBomLine } from '@/lib/bom/types'

export type ProductiveRouteSheet = {
  sku_complete: string
  status: string | null
  color_code: string | null
  sap_description_original: string | null
  reference_id: string | null
  version_id: string | null
  product_name: string | null
  family_code: string | null
  reference_code: string | null
  route_data_json: Record<string, unknown>
  route_status: string | null
  lines: ResolvedBomLine[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeSku(value: string): string {
  return value.trim().toUpperCase()
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

export async function getProductivePilotSkusAction() {
  await assertPermission('module:productive-modules')
  return PILOT_SKUS
}

export async function getProductiveRouteSheetAction(skuComplete: string): Promise<{ sheet: ProductiveRouteSheet | null; error: string | null }> {
  await assertPermission('module:productive-modules')

  try {
    const sku = normalizeSku(skuComplete)
    const rows = await dbQuery(
      `SELECT
        s.sku_complete,
        s.status,
        s.color_code,
        s.sap_description_original,
        v.id AS version_id,
        r.id AS reference_id,
        r.product_name,
        r.family_code,
        r.reference_code,
        d.route_data_json,
        d.status AS route_status
       FROM public.product_skus s
       JOIN public.product_versions v ON v.id = s.version_id
       JOIN public.product_references r ON r.id = v.reference_id
       LEFT JOIN LATERAL (
         SELECT route_data_json, status
         FROM public.product_route_documents d
         WHERE d.reference_id = r.id
           AND d.route_type = 'furniture'
           AND (d.version_id = v.id OR d.version_id IS NULL)
         ORDER BY d.version_id NULLS LAST
         LIMIT 1
       ) d ON TRUE
       WHERE s.sku_complete = $1
       LIMIT 1`,
      [sku]
    )

    const row = rows[0]
    if (!row) return { sheet: null, error: `No existe ${sku} en el catálogo del app.` }

    return {
      sheet: {
        sku_complete: sku,
        status: readString(row.status),
        color_code: readString(row.color_code),
        sap_description_original: readString(row.sap_description_original),
        reference_id: readString(row.reference_id),
        version_id: readString(row.version_id),
        product_name: readString(row.product_name),
        family_code: readString(row.family_code),
        reference_code: readString(row.reference_code),
        route_data_json: asRecord(row.route_data_json),
        route_status: readString(row.route_status),
        lines: await getResolvedLines(sku),
      },
      error: null,
    }
  } catch (error) {
    return { sheet: null, error: error instanceof Error ? error.message : 'No se pudo cargar hoja de ruta productiva' }
  }
}
