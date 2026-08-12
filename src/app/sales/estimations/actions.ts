'use server'

import { evaluateEstimationBomCosting, type EstimationBomCostLine } from '@/lib/productDesign/estimationBomCosting'
import { normalizeEstimationDraft, type EstimationDraft, type EstimationDraftBomLine } from '@/lib/productDesign/estimationDraft'
import { dbQuery } from '@/lib/supabase'
import { assertPermission } from '@/utils/auth/access'

type RawRow = Record<string, unknown>

export type SalesEstimationCostSnapshot =
  | {
      state: 'available'
      currency: string
      materialsAndPackaging: number
      expandedTotal: number
      material: number
      packaging: number
      mo: number
      cif: number
      other: number
    }
  | {
      state: 'pending'
      currency: string
      message: string
    }

export type SalesEstimationView = {
  id: string
  provisionalName: string
  manufacturingProcess: string
  sapPrefix: string
  familyCode: string | null
  proposedReferenceCode: string | null
  homologueSapItemCode: string | null
  dimensions: {
    widthMm: number | null
    depthMm: number | null
    heightMm: number | null
  }
  color: {
    commercialCode: string | null
    commercialName: string | null
    gelcoatItemCode: string | null
    gelcoatItemName: string | null
  }
  geometry: {
    volumeMm3: number | null
    paintAreaMm2: number | null
    estimatedMixtureKg: number | null
    estimatedGelcoatKg: number | null
    calibrationSampleCount: number | null
  }
  pricing: SalesEstimationCostSnapshot
  commercialScenario: {
    currency: string
    contributionMarginPct: number | null
    minimumPrice: number | null
    discountPct: number | null
    maximumPrice: number | null
    pvp: number | null
    netWeightKg: number | null
    grossWeightKg: number | null
    notes: string | null
  }
  status: string
  technicalReview: {
    status: string
    note: string | null
    reviewedAt: string | null
  }
  commercialResponse: {
    outcome: string
    contactName: string | null
    outcomeAt: string | null
    note: string | null
  }
  sharedAt: string
  updatedAt: string
}

function requireServiceRoleConfiguration(): void {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
    throw new Error('La consulta de cotizaciones requiere credenciales server-side de Supabase.')
  }
}

async function requireSalesAccess(): Promise<void> {
  await assertPermission('module:sales:estimations')
  requireServiceRoleConfiguration()
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredText(value: unknown, label: string): string {
  const normalized = stringOrNull(value)
  if (!normalized) throw new Error(`${label} es obligatorio.`)
  return normalized
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseDraftJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return {}
  }
}

function currencyOrCop(value: string | null): string {
  const normalized = value?.trim().toUpperCase() ?? ''
  return /^[A-Z]{3}$/u.test(normalized) ? normalized : 'COP'
}

function toCostLine(line: EstimationDraftBomLine): EstimationBomCostLine | null {
  if (
    line.quantity === null
    || line.costCategory === null
    || line.costStrategy === null
  ) {
    return null
  }

  return {
    id: line.id,
    parentId: line.parentId,
    quantity: line.quantity,
    uom: line.uom,
    costCategory: line.costCategory,
    costStrategy: line.costStrategy,
    unitCost: line.unitCost,
  }
}

function pricingSnapshot(draft: EstimationDraft): SalesEstimationCostSnapshot {
  const currency = currencyOrCop(draft.commercialScenario.currency)
  if (draft.bomLines.length === 0) {
    return {
      state: 'pending',
      currency,
      message: 'La cotización aún no tiene líneas de LdM costeables.',
    }
  }

  const costLines = draft.bomLines.map(toCostLine)
  if (costLines.some((line) => line === null)) {
    return {
      state: 'pending',
      currency,
      message: 'Faltan cantidad, categoría o estrategia de costo en una o más líneas de la LdM.',
    }
  }

  const costing = evaluateEstimationBomCosting({
    lines: costLines.filter((line): line is EstimationBomCostLine => line !== null),
  })
  if (!costing.ok) {
    return {
      state: 'pending',
      currency,
      message: costing.issues[0]?.message ?? 'La LdM requiere ajustes antes de presentar un total.',
    }
  }

  return {
    state: 'available',
    currency,
    materialsAndPackaging: costing.totals.materialsAndPackaging,
    expandedTotal: costing.totals.expandedTotal,
    material: costing.totals.byCategory.material,
    packaging: costing.totals.byCategory.packaging,
    mo: costing.totals.byCategory.mo,
    cif: costing.totals.byCategory.cif,
    other: costing.totals.byCategory.other,
  }
}

function calibrationSampleCount(draft: EstimationDraft): number | null {
  return draft.syntheticMarbleCalibration?.mixture?.sampleCount
    ?? draft.syntheticMarbleCalibration?.gelcoat?.sampleCount
    ?? null
}

function mapSalesEstimation(row: RawRow): SalesEstimationView {
  const draft = normalizeEstimationDraft(parseDraftJson(row.draft_data_json))
  const scenario = draft.commercialScenario

  return {
    id: requiredText(row.id, 'Identificador de cotización'),
    provisionalName: requiredText(row.provisional_name, 'Nombre provisional'),
    manufacturingProcess: requiredText(row.manufacturing_process, 'Proceso de fabricación'),
    sapPrefix: requiredText(row.sap_prefix, 'U_Prefijo SAP'),
    familyCode: stringOrNull(row.family_code),
    proposedReferenceCode: stringOrNull(row.proposed_reference_code),
    homologueSapItemCode: stringOrNull(row.homologue_sap_item_code),
    dimensions: {
      widthMm: numberOrNull(row.width_mm),
      depthMm: numberOrNull(row.depth_mm),
      heightMm: numberOrNull(row.height_mm),
    },
    color: {
      commercialCode: stringOrNull(row.color_code) ?? draft.commercialColor.colorCode,
      commercialName: draft.commercialColor.colorName,
      gelcoatItemCode: draft.gelcoatItem.itemCode,
      gelcoatItemName: draft.gelcoatItem.itemName,
    },
    geometry: {
      volumeMm3: draft.geometry.volumeMm3,
      paintAreaMm2: draft.geometry.paintAreaMm2,
      estimatedMixtureKg: draft.geometry.estimatedMixtureKg,
      estimatedGelcoatKg: draft.geometry.estimatedGelcoatKg,
      calibrationSampleCount: calibrationSampleCount(draft),
    },
    pricing: pricingSnapshot(draft),
    commercialScenario: {
      currency: currencyOrCop(scenario.currency),
      contributionMarginPct: scenario.contributionMarginPct,
      minimumPrice: scenario.minimumPrice,
      discountPct: scenario.discountPct,
      maximumPrice: scenario.maximumPrice,
      pvp: scenario.pvp,
      netWeightKg: scenario.netWeightKg,
      grossWeightKg: scenario.grossWeightKg,
      notes: scenario.notes,
    },
    status: requiredText(row.status, 'Estado de cotización'),
    technicalReview: {
      status: requiredText(row.technical_review_status, 'Estado de revisión técnica'),
      note: stringOrNull(row.technical_review_note),
      reviewedAt: stringOrNull(row.technical_reviewed_at),
    },
    commercialResponse: {
      outcome: requiredText(row.commercial_outcome, 'Resultado comercial'),
      contactName: stringOrNull(row.commercial_contact_name),
      outcomeAt: stringOrNull(row.commercial_outcome_at),
      note: stringOrNull(row.commercial_note),
    },
    sharedAt: requiredText(row.shared_with_sales_at, 'Fecha de compartición con Ventas'),
    updatedAt: requiredText(row.updated_at, 'Fecha de actualización'),
  }
}

/**
 * Internal Sales-only projection. The SQL predicate is intentionally repeated
 * here (rather than trusting a UI filter) so unshared quotations never leave
 * the server action.
 */
export async function listSharedSalesEstimationsAction(): Promise<SalesEstimationView[]> {
  await requireSalesAccess()

  const rows = await dbQuery(
    `SELECT id, manufacturing_process, sap_prefix, family_code, proposed_reference_code,
            provisional_name, width_mm, depth_mm, height_mm, color_code,
            homologue_sap_item_code, status, technical_review_status,
            technical_review_note, technical_reviewed_at, shared_with_sales_at,
            commercial_outcome, commercial_contact_name, commercial_outcome_at,
            commercial_note, draft_data_json, updated_at
       FROM public.product_design_estimations
      WHERE shared_with_sales IS TRUE
      ORDER BY updated_at DESC, id DESC`,
  )

  return rows.map((row: RawRow) => mapSalesEstimation(row))
}
