'use server'

import { revalidatePath } from 'next/cache'

import { evaluateEstimationBomCosting, type EstimationBomCostLine } from '@/lib/productDesign/estimationBomCosting'
import { normalizeEstimationDraft, serializeEstimationDraft, type EstimationDraft, type EstimationDraftBomLine } from '@/lib/productDesign/estimationDraft'
import { DEFAULT_SALES_PRICING_FORMULAS, normalizeSalesPercentage, normalizeSalesPricingFormulaConfig, SALES_PRICING_FORMULAS_SETTING_KEY, type SalesPricingFormulaConfig } from '@/lib/productDesign/salesPricingFormulas'
import { dbQuery } from '@/lib/supabase'
import { assertPermission } from '@/utils/auth/access'

type RawRow = Record<string, unknown>
export type SalesEstimationCostSnapshot = { state: 'available'; currency: string; materialsAndPackaging: number; expandedTotal: number } | { state: 'pending'; currency: string; message: string }
export type SalesEstimationView = {
  id: string; provisionalName: string; manufacturingProcess: string; sapPrefix: string; familyCode: string | null; proposedReferenceCode: string | null; homologueSapItemCode: string | null
  dimensions: { widthMm: number | null; depthMm: number | null; heightMm: number | null }
  color: { commercialCode: string | null; commercialName: string | null; gelcoatItemCode: string | null; gelcoatItemName: string | null }
  geometry: { volumeMm3: number | null; paintAreaMm2: number | null; estimatedMixtureKg: number | null; estimatedGelcoatKg: number | null; calibrationSampleCount: number | null }
  weights: { netKg: number | null; grossKg: number | null }
  pricing: SalesEstimationCostSnapshot
  commercialScenario: { currency: string; contributionMarginPct: number | null; discountPct: number | null }
  status: string; technicalReview: { status: string; note: string | null; reviewedAt: string | null }
  commercialResponse: { outcome: string; contactName: string | null; outcomeAt: string | null; note: string | null }
  sharedAt: string; updatedAt: string
}

function requireServiceRoleConfiguration(): void { if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) throw new Error('La consulta de cotizaciones requiere credenciales server-side de Supabase.') }
async function requireSalesAccess() { const access = await assertPermission('module:sales:estimations'); requireServiceRoleConfiguration(); if (!access.user) throw new Error('Sesión de Ventas no disponible.'); return access.user }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function required(value: unknown, label: string): string { const result = text(value); if (!result) throw new Error(`${label} es obligatorio.`); return result }
function number(value: unknown): number | null { if (typeof value === 'number' && Number.isFinite(value)) return value; if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value); return null }
function parseJson(value: unknown): unknown { if (typeof value !== 'string') return value; try { return JSON.parse(value) as unknown } catch { return {} } }
function currency(value: string | null): string { return value && /^[A-Z]{3}$/u.test(value.toUpperCase()) ? value.toUpperCase() : 'COP' }
function toCostLine(line: EstimationDraftBomLine): EstimationBomCostLine | null { return line.quantity === null || line.costCategory === null || line.costStrategy === null ? null : { id: line.id, parentId: line.parentId, quantity: line.quantity, uom: line.uom, costCategory: line.costCategory, costStrategy: line.costStrategy, unitCost: line.unitCost } }
function snapshot(draft: EstimationDraft): SalesEstimationCostSnapshot {
  const unit = currency(draft.commercialScenario.currency)
  if (draft.bomLines.length === 0) return { state: 'pending', currency: unit, message: 'La cotización aún no tiene líneas de LdM costeables.' }
  const lines = draft.bomLines.map(toCostLine)
  if (lines.some(line => line === null)) return { state: 'pending', currency: unit, message: 'Faltan cantidad, categoría o estrategia de costo en una o más líneas de la LdM.' }
  const result = evaluateEstimationBomCosting({ lines: lines.filter((line): line is EstimationBomCostLine => line !== null) })
  return result.ok ? { state: 'available', currency: unit, materialsAndPackaging: result.totals.materialsAndPackaging, expandedTotal: result.totals.expandedTotal } : { state: 'pending', currency: unit, message: result.issues[0]?.message ?? 'La LdM requiere ajustes antes de presentar un total.' }
}
function mapRow(row: RawRow): SalesEstimationView {
  const draft = normalizeEstimationDraft(parseJson(row.draft_data_json)); const scenario = draft.commercialScenario
  return { id: required(row.id, 'Identificador de cotización'), provisionalName: required(row.provisional_name, 'Nombre provisional'), manufacturingProcess: required(row.manufacturing_process, 'Proceso de fabricación'), sapPrefix: required(row.sap_prefix, 'U_Prefijo SAP'), familyCode: text(row.family_code), proposedReferenceCode: text(row.proposed_reference_code), homologueSapItemCode: text(row.homologue_sap_item_code), dimensions: { widthMm: number(row.width_mm), depthMm: number(row.depth_mm), heightMm: number(row.height_mm) }, color: { commercialCode: text(row.color_code) ?? draft.commercialColor.colorCode, commercialName: draft.commercialColor.colorName, gelcoatItemCode: draft.gelcoatItem.itemCode, gelcoatItemName: draft.gelcoatItem.itemName }, geometry: { volumeMm3: draft.geometry.volumeMm3, paintAreaMm2: draft.geometry.paintAreaMm2, estimatedMixtureKg: draft.geometry.estimatedMixtureKg, estimatedGelcoatKg: draft.geometry.estimatedGelcoatKg, calibrationSampleCount: draft.syntheticMarbleCalibration?.mixture?.sampleCount ?? draft.syntheticMarbleCalibration?.gelcoat?.sampleCount ?? null }, weights: { netKg: draft.geometry.estimatedNetWeightKg, grossKg: draft.geometry.estimatedGrossWeightKg }, pricing: snapshot(draft), commercialScenario: { currency: currency(scenario.currency), contributionMarginPct: scenario.contributionMarginPct, discountPct: scenario.discountPct }, status: required(row.status, 'Estado de cotización'), technicalReview: { status: required(row.technical_review_status, 'Estado de revisión técnica'), note: text(row.technical_review_note), reviewedAt: text(row.technical_reviewed_at) }, commercialResponse: { outcome: required(row.commercial_outcome, 'Resultado comercial'), contactName: text(row.commercial_contact_name), outcomeAt: text(row.commercial_outcome_at), note: text(row.commercial_note) }, sharedAt: required(row.shared_with_sales_at, 'Fecha de compartición'), updatedAt: required(row.updated_at, 'Fecha de actualización') }
}
const ESTIMATION_SELECT = `SELECT id, manufacturing_process, sap_prefix, family_code, proposed_reference_code, provisional_name, width_mm, depth_mm, height_mm, color_code, homologue_sap_item_code, status, technical_review_status, technical_review_note, technical_reviewed_at, shared_with_sales_at, commercial_outcome, commercial_contact_name, commercial_outcome_at, commercial_note, draft_data_json, updated_at FROM public.product_design_estimations`

export async function listSharedSalesEstimationsAction(): Promise<SalesEstimationView[]> { await requireSalesAccess(); const rows = await dbQuery(`${ESTIMATION_SELECT} WHERE shared_with_sales IS TRUE ORDER BY updated_at DESC, id DESC`); return rows.map((row: RawRow) => mapRow(row)) }
export async function getSalesPricingFormulaConfigAction(): Promise<SalesPricingFormulaConfig> { await requireSalesAccess(); const rows = await dbQuery('SELECT value FROM public.app_settings WHERE key = $1 LIMIT 1', [SALES_PRICING_FORMULAS_SETTING_KEY]); try { return normalizeSalesPricingFormulaConfig(parseJson(rows[0]?.value)) } catch { return DEFAULT_SALES_PRICING_FORMULAS } }

async function getSharedDraft(id: string): Promise<{ draft: EstimationDraft; row: RawRow }> { const rows = await dbQuery(`${ESTIMATION_SELECT} WHERE id = $1::uuid AND shared_with_sales IS TRUE LIMIT 1`, [id]); const row = rows[0] as RawRow | undefined; if (!row) throw new Error('La cotización no existe o no está compartida con Ventas.'); return { draft: normalizeEstimationDraft(parseJson(row.draft_data_json)), row } }
export async function saveSalesEstimationPricingAction(input: { id: string; contributionMarginPct: number; discountPct: number }): Promise<SalesEstimationView> { const user = await requireSalesAccess(); const id = required(input.id, 'Cotización'); const mcPct = normalizeSalesPercentage(input.contributionMarginPct); const discountPct = normalizeSalesPercentage(input.discountPct); const { draft } = await getSharedDraft(id); draft.commercialScenario = { ...draft.commercialScenario, contributionMarginPct: mcPct, discountPct, minimumPrice: null, maximumPrice: null, pvp: null }; await dbQuery('UPDATE public.product_design_estimations SET draft_data_json = $1::jsonb, updated_by = $2::uuid WHERE id = $3::uuid AND shared_with_sales IS TRUE', [JSON.stringify(serializeEstimationDraft(draft)), user.id, id]); const { row } = await getSharedDraft(id); revalidatePath('/sales/estimations'); return mapRow(row) }
export async function saveSalesEstimationCommercialResponseAction(input: { id: string; outcome: 'pending' | 'approved' | 'rejected' | 'not_pursued'; contactName?: string | null; note?: string | null }): Promise<SalesEstimationView> { const user = await requireSalesAccess(); const id = required(input.id, 'Cotización'); if (!['pending', 'approved', 'rejected', 'not_pursued'].includes(input.outcome)) throw new Error('Resultado comercial no válido.'); await getSharedDraft(id); await dbQuery('UPDATE public.product_design_estimations SET commercial_outcome = $1, commercial_contact_name = $2, commercial_outcome_at = now(), commercial_recorded_by = $3::uuid, commercial_recorded_at = now(), commercial_note = $4, updated_by = $3::uuid WHERE id = $5::uuid AND shared_with_sales IS TRUE', [input.outcome, text(input.contactName), user.id, text(input.note), id]); const { row } = await getSharedDraft(id); revalidatePath('/sales/estimations'); return mapRow(row) }
export async function saveSalesPricingFormulaConfigAction(input: SalesPricingFormulaConfig): Promise<SalesPricingFormulaConfig> { await requireSalesAccess(); const config = normalizeSalesPricingFormulaConfig(input); await dbQuery('INSERT INTO public.app_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [SALES_PRICING_FORMULAS_SETTING_KEY, JSON.stringify(config)]); revalidatePath('/sales/estimations'); return config }
