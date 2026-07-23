'use server'

import { dbQuery } from '@/lib/supabase'
import { assertPermission } from '@/utils/auth/access'
import { PILOT_SKUS } from '@/lib/bom/types'
import {
  buildCabinetRouteMatchReport,
  deriveCabinetBomCandidates,
  normalizeCabinetRouteData,
  reconcileCabinetRouteData,
  withCabinetRouteSource,
  type CabinetBomCandidate,
  type CabinetBomLine,
  type CabinetBomSourceMode,
  type CabinetRouteData,
  type CabinetRouteMatchReport,
} from '@/lib/routeSheets/cabinets'

export type ProductiveRouteSheet = {
  sku_complete: string
  status: string | null
  color_code: string | null
  color_name: string | null
  sap_description_original: string | null
  reference_id: string | null
  version_id: string | null
  product_name: string | null
  family_code: string | null
  reference_code: string | null
  route_data_json: CabinetRouteData
  route_status: string | null
  lines: CabinetBomLine[]
  candidates: CabinetBomCandidate[]
  match_report: CabinetRouteMatchReport
  bom_source_mode: CabinetBomSourceMode
  bom_warning: string | null
}

type CabinetBomReadResult = {
  lines: CabinetBomLine[]
  sourceMode: CabinetBomSourceMode
  warning: string | null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeSku(value: string): string {
  return value.trim().toUpperCase()
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
        c.name_color_sap AS color_name,
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
       LEFT JOIN public.colors c ON c.code_4dig = s.color_code
       LEFT JOIN LATERAL (
         SELECT route_data_json, status
         FROM public.product_route_documents d
         WHERE d.reference_id = r.id
           AND d.route_type = 'cabinet'
           AND d.version_id IS NULL
         LIMIT 1
       ) d ON TRUE
       WHERE s.sku_complete = $1
       LIMIT 1`,
      [sku]
    )

    const row = rows[0]
    if (!row) return { sheet: null, error: `No existe ${sku} en el catálogo del app.` }

    const bomResult = await getCabinetRouteBomLines(sku)
    const candidates = deriveCabinetBomCandidates(bomResult.lines, bomResult.sourceMode)
    const routeData = reconcileCabinetRouteData(withCabinetRouteSource(normalizeCabinetRouteData(row.route_data_json), {
      analysisSkuComplete: sku,
      referenceId: readString(row.reference_id) || '',
      referenceCode: readString(row.reference_code),
      bomLineCount: bomResult.lines.length,
      missingBomCount: bomResult.lines.filter(line => line.resolution_status !== 'resolved').length,
      bomSourceMode: bomResult.sourceMode,
      bomWarning: bomResult.warning,
    }), candidates)

    return {
      sheet: {
        sku_complete: sku,
        status: readString(row.status),
        color_code: readString(row.color_code),
        color_name: readString(row.color_name),
        sap_description_original: readString(row.sap_description_original),
        reference_id: readString(row.reference_id),
        version_id: readString(row.version_id),
        product_name: readString(row.product_name),
        family_code: readString(row.family_code),
        reference_code: readString(row.reference_code),
        route_data_json: routeData,
        route_status: readString(row.route_status),
        lines: bomResult.lines,
        candidates,
        match_report: buildCabinetRouteMatchReport(routeData, candidates),
        bom_source_mode: bomResult.sourceMode,
        bom_warning: bomResult.warning,
      },
      error: null,
    }
  } catch (error) {
    return { sheet: null, error: error instanceof Error ? error.message : 'No se pudo cargar hoja de ruta productiva' }
  }
}

function isMissingExpandedBomFunctionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('resolved_bom_expanded_for_sku') || message.includes('does not exist') || message.includes('42883')
}
