'use server'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'
import {
  analyzeReferenceBomImportTransient,
  analyzeReferenceImportBoardMatrix,
  listReferenceImportCandidates,
  refreshComponentMetadata,
  type DirectColorRuleMatrixSelection,
  verifyReferenceImportColorRulesMatrixDirect,
  type ColorRuleCoverageResult,
} from '@/lib/bom/referenceImport'
import type { ReferenceBomStructure, ReferenceImportWorkspace } from '@/lib/bom/referenceImportTypes'
import { isBoardMaterialApplicationScope, isReferenceProductApplicationScope, type ReferenceProductApplicationScope } from '@/lib/bom/referenceImportScopes'
import type { BoardProfileConditionalRule, HybridColorCase } from '@/lib/bom/types'
import { normalizeBomStructure } from '@/lib/bom/resolve'
import { deleteSapItem, deleteSapProductTree, getSapItem, getSapItemBom, getSapProductTreeUsages, productTreeQuantityMatches, productTreeStructureMatches, SapServiceLayerError, updateSapItem, updateSapProductTreeIssueMethod, updateSapProductTreeLineQuantity, type SapEntityPayload } from '@/lib/sap/serviceLayer'
import { parseSapItemCode, readSapFrozen, readSapValid } from '@/lib/bom/sapMapping'
import { syncMissingSapComponentsToCatalog } from '@/lib/sap/componentCatalogSync'
import { getColorsAction, upsertColorAction, type ColorEntry } from '@/app/rules/colors/actions'
import { assertPermission } from '@/utils/auth/access'

type ActionResult = {
  success: boolean
  message: string
  workspace: ReferenceImportWorkspace | null
}

export type ComponentMetadataRefreshResult = {
  success: boolean
  message: string
  refreshedItemCodes: string[]
}

type MatrixSelection = DirectColorRuleMatrixSelection
type IssueMethodItem = { skuComplete: string; childNum: number; itemCode: string }
type QuantityItem = { skuComplete: string; childNum: number; itemCode: string; expectedQty: number }
type MatrixAbsence = { skuComplete: string; baseItemCode: string }
type MatrixHybridColorCase = {
  sourceColorCode: string
  fullProductColorCode: string
  colorMode: 'dual' | 'balance'
  structureColorCode: string
  frontColorCode: string
  skuCompletes: string[]
}

export type BoardDualResolvedScope = {
  resolvedItemCode: string | null
  materialProfile: string | null
  resolutionStatus: string | null
  matchesExpected: boolean
}

export type BoardDualVerification = {
  state: 'effective' | 'configuration_saved'
  skuResults: Array<{
    skuComplete: string
    structure: BoardDualResolvedScope
    front: BoardDualResolvedScope
  }>
  note: string | null
}

export type BoardDualMutationResult = {
  success: boolean
  message: string
  savedConfiguration?: {
    structureColorCode: string
    structureMaterialProfile: string
    frontColorCode: string
    frontMaterialProfile: string
  }
  savedSkuOverride?: {
    structureColorCode: string
    structureMaterialProfile: string
    frontColorCode: string
    frontMaterialProfile: string
    skuCompletes: string[]
    isSapDeviation: boolean
  }
  verification?: BoardDualVerification
}

type ReferenceSemanticScopeAssignment = {
  lineId: string
  lineKind: 'fixed' | 'material_group'
  baseItemCode: string | null
  scope: ReferenceProductApplicationScope
}

const MATRIX_ABSENCE_VALIDATION_CONCURRENCY = 3

function failure(error: unknown, fallback: string): ActionResult {
  return { success: false, message: error instanceof Error ? error.message : fallback, workspace: null }
}

export async function refreshTransientComponentMetadataAction(input: {
  itemCodes: string[]
}): Promise<ComponentMetadataRefreshResult> {
  await assertPermission('module:product-design')
  try {
    const refreshedItemCodes = await refreshComponentMetadata(input.itemCodes)
    return {
      success: true,
      message: `Se validó la metadata de ${refreshedItemCodes.length} componente(s) sin releer LdM ni subestructuras.`,
      refreshedItemCodes,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo releer la metadata de componentes.',
      refreshedItemCodes: [],
    }
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return { ...value }
  if (typeof value !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? { ...parsed } : {}
  } catch {
    return {}
  }
}

function normalizedColorCode(value: string): string {
  return value.trim().toUpperCase()
}

function isColorCode(value: string): boolean {
  return /^[A-Z0-9]{4}$/.test(value)
}

function isBoardMaterialProfile(value: string): boolean {
  return value === 'ST' || value === 'RH' || value === 'CARB2' || value === 'CARB2 RH'
}

type ReferenceQuantityResolution = {
  baseItemCode: string
  scope: ReferenceProductApplicationScope
  strategy: 'repetition' | 'maximum' | 'custom'
  customQty?: number | null
}

function readBoardProfileConditions(value: Record<string, unknown>): BoardProfileConditionalRule[] {
  const rawRules = value.board_profile_conditions
  if (!Array.isArray(rawRules)) return []
  return rawRules.flatMap((rawRule, index) => {
    const rule = jsonRecord(rawRule)
    const scope = readString(rule.product_application_scope)
    const sourceMaterialProfile = readString(rule.source_material_profile)?.toUpperCase()
    const targetColorCode = readString(rule.target_color_code)?.toUpperCase()
    const targetMaterialProfile = readString(rule.target_material_profile)?.toUpperCase()
    if (!isBoardMaterialApplicationScope(scope) || !sourceMaterialProfile || !targetColorCode || !targetMaterialProfile || !isColorCode(targetColorCode) || !isBoardMaterialProfile(sourceMaterialProfile) || !isBoardMaterialProfile(targetMaterialProfile)) return []
    return [{
      rule_id: readString(rule.rule_id) ?? `board_profile_${index + 1}`,
      product_application_scope: scope,
      source_material_profile: sourceMaterialProfile,
      target_color_code: targetColorCode,
      target_material_profile: targetMaterialProfile,
    }]
  })
}

function normalizeSkuCompletes(value: string[]): string[] {
  return [...new Set(value
    .map(skuComplete => skuComplete.trim().toUpperCase())
    .filter(Boolean))]
    .sort()
}

function expectedBoardDualScope(input: {
  rows: Record<string, unknown>[]
  scope: 'structure' | 'front'
  targetColorCode: string
  targetMaterialProfile: string
}): BoardDualResolvedScope {
  const row = input.rows.find(candidate => readString(candidate.product_application_scope) === input.scope)
  const resolvedItemCode = readString(row?.resolved_item_code)?.toUpperCase() ?? null
  const materialProfile = readString(row?.material_profile)?.toUpperCase() ?? null
  const resolutionStatus = readString(row?.resolution_status) ?? null
  return {
    resolvedItemCode,
    materialProfile,
    resolutionStatus,
    matchesExpected: resolvedItemCode?.endsWith(`-${input.targetColorCode}`) === true
      && materialProfile === input.targetMaterialProfile
      && resolutionStatus === 'resolved',
  }
}

async function verifyPersistedBoardDualEffect(input: {
  skuCompletes: string[]
  structureColorCode: string
  structureMaterialProfile: string
  frontColorCode: string
  frontMaterialProfile: string
}): Promise<BoardDualVerification> {
  try {
    const skuResults = await Promise.all(input.skuCompletes.map(async skuComplete => {
      const rows: Record<string, unknown>[] = await dbQuery(
        `SELECT product_application_scope, resolved_item_code, material_profile, resolution_status
         FROM public.resolved_bom_for_sku($1)
         WHERE product_application_scope IN ('structure', 'front')
         ORDER BY sort_order, line_id`,
        [skuComplete]
      )
      return {
        skuComplete,
        structure: expectedBoardDualScope({ rows, scope: 'structure', targetColorCode: input.structureColorCode, targetMaterialProfile: input.structureMaterialProfile }),
        front: expectedBoardDualScope({ rows, scope: 'front', targetColorCode: input.frontColorCode, targetMaterialProfile: input.frontMaterialProfile }),
      }
    }))
    const isEffective = skuResults.every(result => result.structure.matchesExpected && result.front.matchesExpected)
    return {
      state: isEffective ? 'effective' : 'configuration_saved',
      skuResults,
      note: isEffective ? null : 'La configuración quedó guardada, pero la BOM base actual no resuelve ambos roles de tablero con este caso todavía.',
    }
  } catch (error) {
    return {
      state: 'configuration_saved',
      skuResults: [],
      note: error instanceof Error ? `La configuración se guardó, pero no se pudo comprobar la resolución: ${error.message}` : 'La configuración se guardó, pero no se pudo comprobar la resolución.',
    }
  }
}

function jsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function storedHybridColorCases(value: unknown): HybridColorCase[] {
  const rawCases = jsonRecord(value).hybrid_color_cases
  if (!Array.isArray(rawCases)) return []
  return rawCases.flatMap((rawCase, index) => {
    const candidate = jsonRecord(rawCase)
    const colorMode = candidate.color_mode
    if (colorMode !== 'dual' && colorMode !== 'balance') return []
    const skuCompletes = Array.isArray(candidate.sku_completes)
      ? normalizeSkuCompletes(candidate.sku_completes.filter((skuComplete): skuComplete is string => typeof skuComplete === 'string'))
      : []
    if (skuCompletes.length === 0) return []
    const applicationColors = Object.fromEntries(
      Object.entries(jsonRecord(candidate.application_colors)).flatMap(([scope, rawColorCode]) => {
        if (typeof rawColorCode !== 'string') return []
        const colorCode = normalizedColorCode(rawColorCode)
        return isColorCode(colorCode) ? [[scope, colorCode] as const] : []
      })
    )
    if (Object.keys(applicationColors).length === 0) return []
    const applicationMaterialProfiles = Object.fromEntries(
      Object.entries(jsonRecord(candidate.application_material_profiles)).flatMap(([scope, rawMaterialProfile]) => {
        if (typeof rawMaterialProfile !== 'string') return []
        const materialProfile = rawMaterialProfile.trim().toUpperCase()
        return isBoardMaterialProfile(materialProfile) ? [[scope, materialProfile] as const] : []
      })
    )
    const materialKind = candidate.material_kind === 'board' ? 'board' as const : undefined
    return [{
      case_id: typeof candidate.case_id === 'string' && candidate.case_id.trim()
        ? candidate.case_id.trim()
        : `legacy_case_${String(index + 1).padStart(3, '0')}`,
      color_mode: colorMode,
      sku_completes: skuCompletes,
      application_colors: applicationColors,
      ...(Object.keys(applicationMaterialProfiles).length > 0 ? { application_material_profiles: applicationMaterialProfiles } : {}),
      ...(materialKind ? { material_kind: materialKind } : {}),
    }]
  })
}

function storedColorOverrides(value: unknown): Record<string, unknown>[] {
  const rawOverrides = jsonRecord(value).color_overrides
  return Array.isArray(rawOverrides) ? rawOverrides.flatMap(override => isRecord(override) ? [{ ...override }] : []) : []
}

function hasPersistedBoardDualOverride(input: {
  value: unknown
  sourceColorCode: string
  scope: 'structure' | 'front'
  targetColorCode: string
  targetMaterialProfile: string
}): boolean {
  return storedColorOverrides(input.value).some(override =>
    normalizedColorCode(readString(override.color_code) ?? '') === input.sourceColorCode
    && readString(override.product_application_scope) === input.scope
    && normalizedColorCode(readString(override.target_color_code) ?? '') === input.targetColorCode
    && readString(override.material_profile)?.toUpperCase() === input.targetMaterialProfile
  )
}

function storedOperations(value: unknown): unknown[] {
  const operations = jsonRecord(value).operations
  return Array.isArray(operations) ? operations : []
}

function normalizedMatrixHybridCase(input: MatrixHybridColorCase): MatrixHybridColorCase {
  const sourceColorCode = normalizedColorCode(input.sourceColorCode)
  const fullProductColorCode = normalizedColorCode(input.fullProductColorCode)
  const structureColorCode = normalizedColorCode(input.structureColorCode)
  const frontColorCode = normalizedColorCode(input.frontColorCode)
  const skuCompletes = normalizeSkuCompletes(input.skuCompletes)
  if (!isColorCode(sourceColorCode) || !isColorCode(fullProductColorCode) || !isColorCode(structureColorCode) || !isColorCode(frontColorCode)) {
    throw new Error('Cada caso Dual necesita colores de producto, unicolor, estructura y frentes de cuatro caracteres.')
  }
  if (structureColorCode === frontColorCode) throw new Error(`El caso ${sourceColorCode} debe tener colores distintos para estructura y frentes.`)
  if (skuCompletes.length === 0) throw new Error(`El caso ${sourceColorCode} no contiene SKU completos evidenciados por SAP.`)
  return {
    sourceColorCode,
    fullProductColorCode,
    colorMode: input.colorMode,
    structureColorCode,
    frontColorCode,
    skuCompletes,
  }
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
  confirmed: boolean
}): Promise<ActionResult> {
  await assertPermission('module:product-design')
  const sourceColorCode = input.sourceColorCode.trim().toUpperCase()
  const targetColorCode = input.targetColorCode.trim().toUpperCase()
  try {
    if (!input.confirmed) throw new Error('Confirma la acción con la casilla antes de guardar la regla.')
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
  confirmed: boolean
}): Promise<ActionResult> {
  await assertPermission('module:product-design')
  const sourceColorCode = input.sourceColorCode.trim().toUpperCase()
  const materialProfile = input.materialProfile.trim().toUpperCase()
  try {
    if (!input.confirmed) throw new Error('Confirma la acción con la casilla antes de guardar el perfil.')
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

export async function saveTransientMatrixSkuColorOverrideAction(input: {
  skuComplete: string
  sourceColorCode: string
  scope: ReferenceProductApplicationScope
  targetColorCode: string
  reason: string
}): Promise<{ success: boolean; message: string }> {
  const access = await assertPermission('module:product-design')
  try {
    const skuComplete = input.skuComplete.trim().toUpperCase()
    const sourceColorCode = normalizedColorCode(input.sourceColorCode)
    const targetColorCode = normalizedColorCode(input.targetColorCode)
    const reason = input.reason.trim()
    if (!skuComplete || !isColorCode(sourceColorCode) || !isColorCode(targetColorCode)) {
      throw new Error('El SKU y ambos colores deben estar completos.')
    }
    if (!isReferenceProductApplicationScope(input.scope) || input.scope === 'NA') {
      throw new Error('El override necesita un rol lógico válido de la BOM base.')
    }
    if (reason.length < 3) throw new Error('Explica brevemente por qué se necesita este override.')

    const skuRows: Record<string, unknown>[] = await dbQuery(
      `SELECT sku.id, sku.color_code, reference.reference_code, reference.product_bom_structure
       FROM public.product_skus sku
       JOIN public.product_versions version ON version.id = sku.version_id
       JOIN public.product_references reference ON reference.id = version.reference_id
       WHERE sku.sku_complete = $1
         AND version.version_code = '000'
       LIMIT 1`,
      [skuComplete]
    )
    const sku = skuRows[0]
    const skuId = readString(sku?.id)
    if (!skuId) throw new Error(`No existe el SKU ${skuComplete} de versión 000 en la app.`)
    if (normalizedColorCode(readString(sku?.color_code) ?? '') !== sourceColorCode) {
      throw new Error(`${skuComplete} no pertenece al color ${sourceColorCode}.`)
    }
    const structure = normalizeBomStructure(sku?.product_bom_structure)
    if (!structure.lines.some(line => line.product_application_scope === input.scope)) {
      const referenceCode = readString(sku?.reference_code) ?? 'esta referencia'
      throw new Error(`Antes de crear este override, publica la BOM base de ${referenceCode} con una línea marcada como ${input.scope}.`)
    }

    const override = JSON.stringify({
      color_code: sourceColorCode,
      product_application_scope: input.scope,
      base_item_code: null,
      target_color_code: targetColorCode,
      material_profile: null,
      reason,
      source: 'reference_import',
      actor_id: access.user?.id ?? null,
    })
    const rows: Record<string, unknown>[] = await dbQuery(
      `UPDATE public.product_skus sku
       SET bom_overrides = jsonb_set(
         jsonb_set(COALESCE(sku.bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
         '{color_overrides}',
         COALESCE(sku.bom_overrides -> 'color_overrides', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('override_id', gen_random_uuid()) || $1::jsonb),
         true
       )
       WHERE sku.id = $2
       RETURNING sku.sku_complete`,
      [override, skuId]
    )
    if (!readString(rows[0]?.sku_complete)) throw new Error('No se pudo guardar el override del SKU.')
    revalidatePath('/product-design/bom')
    return {
      success: true,
      message: `Override del SKU guardado: ${skuComplete} usará ${targetColorCode} en ${input.scope}. No se modificó SAP ni el formato físico.`,
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo guardar el override del SKU.' }
  }
}

export async function saveTransientMatrixDualCandidateSkuOverridesAction(input: {
  skuCompletes: string[]
  sourceColorCode: string
  structureColorCode: string
  frontColorCode: string
}): Promise<{ success: boolean; message: string }> {
  const access = await assertPermission('module:product-design')
  try {
    const skuCompletes = normalizeSkuCompletes(input.skuCompletes)
    const sourceColorCode = normalizedColorCode(input.sourceColorCode)
    const structureColorCode = normalizedColorCode(input.structureColorCode)
    const frontColorCode = normalizedColorCode(input.frontColorCode)
    if (skuCompletes.length === 0) throw new Error('El caso no contiene SKU para guardar.')
    if (![sourceColorCode, structureColorCode, frontColorCode].every(isColorCode)) {
      throw new Error('El color del producto, estructura y frentes deben tener cuatro caracteres.')
    }
    if (structureColorCode === frontColorCode) {
      throw new Error('Un caso Dual necesita un color de estructura distinto al de frentes.')
    }

    const skuRows: Record<string, unknown>[] = await dbQuery(
      `SELECT sku.sku_complete, sku.color_code
       FROM public.product_skus sku
       JOIN public.product_versions version ON version.id = sku.version_id
       WHERE sku.sku_complete IN (${skuCompletes.map((_, index) => `$${index + 1}`).join(', ')})
         AND version.version_code = '000'`,
      skuCompletes
    )
    const foundBySku = new Map(skuRows.flatMap(row => {
      const skuComplete = readString(row.sku_complete)?.toUpperCase()
      return skuComplete ? [[skuComplete, normalizedColorCode(readString(row.color_code) ?? '')] as const] : []
    }))
    const missingSkuCompletes = skuCompletes.filter(skuComplete => !foundBySku.has(skuComplete))
    if (missingSkuCompletes.length > 0) {
      throw new Error(`No existen como SKU versión 000: ${missingSkuCompletes.join(', ')}.`)
    }
    const unexpectedColorSkus = skuCompletes.filter(skuComplete => foundBySku.get(skuComplete) !== sourceColorCode)
    if (unexpectedColorSkus.length > 0) {
      throw new Error(`No pertenecen al color ${sourceColorCode}: ${unexpectedColorSkus.join(', ')}.`)
    }

    const overrides = JSON.stringify([
      {
        color_code: sourceColorCode,
        product_application_scope: 'edge_band_body',
        base_item_code: null,
        target_color_code: structureColorCode,
        material_profile: null,
        reason: `Matriz de cantos: estructura ${structureColorCode} y frentes ${frontColorCode}. Se aplicará al publicar la BOM base.`,
        source: 'reference_import',
        actor_id: access.user?.id ?? null,
      },
      {
        color_code: sourceColorCode,
        product_application_scope: 'edge_band_front',
        base_item_code: null,
        target_color_code: frontColorCode,
        material_profile: null,
        reason: `Matriz de cantos: estructura ${structureColorCode} y frentes ${frontColorCode}. Se aplicará al publicar la BOM base.`,
        source: 'reference_import',
        actor_id: access.user?.id ?? null,
      },
    ])
    const rows: Record<string, unknown>[] = await dbQuery(
      `UPDATE public.product_skus sku
       SET bom_overrides = jsonb_set(
         jsonb_set(COALESCE(sku.bom_overrides, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
         '{color_overrides}',
         COALESCE(sku.bom_overrides -> 'color_overrides', '[]'::jsonb)
           || (
             SELECT COALESCE(jsonb_agg(jsonb_build_object('override_id', gen_random_uuid()) || override), '[]'::jsonb)
             FROM jsonb_array_elements($1::jsonb) override
           ),
         true
       )
       FROM public.product_versions version
       WHERE sku.version_id = version.id
         AND version.version_code = '000'
         AND sku.sku_complete IN (${skuCompletes.map((_, index) => `$${index + 2}`).join(', ')})
       RETURNING sku.sku_complete`,
      [overrides, ...skuCompletes]
    )
    const savedSkuCompletes = new Set(rows.flatMap(row => {
      const skuComplete = readString(row.sku_complete)?.toUpperCase()
      return skuComplete ? [skuComplete] : []
    }))
    if (savedSkuCompletes.size !== skuCompletes.length) {
      throw new Error('No se pudieron guardar todos los overrides del caso. No se modificó SAP.')
    }
    revalidatePath('/product-design/bom')
    return {
      success: true,
      message: `Overrides semánticos guardados para ${skuCompletes.length} SKU(s): estructura ${structureColorCode} y frentes ${frontColorCode}. No se modificó SAP; se aplicarán cuando la BOM base publique esos roles.`,
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudieron guardar los overrides del caso.' }
  }
}

/** Saves a complete, SAP-derived unicolor board strategy for one color. */
export async function saveTransientBoardConditionalProfileRuleAction(input: {
  sourceColorCode: string
  scope?: string
  defaultBoardColorCode: string
  defaultMaterialProfile: string | null
  conditions: Array<{
    sourceMaterialProfile: string
    targetBoardColorCode: string
    targetMaterialProfile: string
  }>
}): Promise<{ success: boolean; message: string; boardProfileConditions?: BoardProfileConditionalRule[] }> {
  await assertPermission('module:product-design')
  try {
    const sourceColorCode = normalizedColorCode(input.sourceColorCode)
    const scope = input.scope?.trim() || 'full_product'
    const defaultBoardColorCode = normalizedColorCode(input.defaultBoardColorCode)
    const defaultMaterialProfile = input.defaultMaterialProfile?.trim().toUpperCase() || null
    const conditions = input.conditions.map(condition => ({
      sourceMaterialProfile: condition.sourceMaterialProfile.trim().toUpperCase(),
      targetBoardColorCode: normalizedColorCode(condition.targetBoardColorCode),
      targetMaterialProfile: condition.targetMaterialProfile.trim().toUpperCase(),
    }))
    if (!isBoardMaterialApplicationScope(scope)) throw new Error('La regla condicional requiere un rol de tablero válido.')
    if (![sourceColorCode, defaultBoardColorCode, ...conditions.map(condition => condition.targetBoardColorCode)].every(isColorCode)) {
      throw new Error('Los colores de producto y tablero deben tener cuatro caracteres.')
    }
    if (conditions.length === 0) throw new Error('La estrategia necesita al menos una excepción de perfil respaldada por SAP.')
    if (
      (defaultMaterialProfile !== null && !isBoardMaterialProfile(defaultMaterialProfile))
      || conditions.some(condition => !isBoardMaterialProfile(condition.sourceMaterialProfile) || !isBoardMaterialProfile(condition.targetMaterialProfile))
    ) {
      throw new Error('Los perfiles de tablero deben ser ST, RH, CARB2 o CARB2 RH.')
    }

    const colorRows: Record<string, unknown>[] = await dbQuery(
      `SELECT application_colors_json, application_material_profiles_json
       FROM public.colors
       WHERE code_4dig = $1
       LIMIT 1`,
      [sourceColorCode]
    )
    const color = colorRows[0]
    if (!color) throw new Error(`No existe el color ${sourceColorCode} en Supabase.`)
    const applicationColors = jsonRecord(color.application_colors_json)
    const materialProfiles = jsonRecord(color.application_material_profiles_json)
    // Edge bands may historically fall back to full_product. Freeze that
    // current effective value before changing the board default so this action
    // remains board-only even on older color records without an edge key.
    if (!readString(applicationColors.edge_band_full_product)) {
      applicationColors.edge_band_full_product = readString(applicationColors.full_product) ?? sourceColorCode
    }
    if (!readString(materialProfiles.edge_band_full_product) && readString(materialProfiles.full_product)) {
      materialProfiles.edge_band_full_product = readString(materialProfiles.full_product)!
    }
    const existingConditions = readBoardProfileConditions(applicationColors).filter(condition => condition.product_application_scope !== scope)
    const boardProfileConditions: BoardProfileConditionalRule[] = [...existingConditions, ...conditions.map(condition => ({
      rule_id: `board_profile_${condition.sourceMaterialProfile.toLowerCase()}_${condition.targetBoardColorCode.toLowerCase()}_${condition.targetMaterialProfile.toLowerCase()}`,
      product_application_scope: scope,
      source_material_profile: condition.sourceMaterialProfile,
      target_color_code: condition.targetBoardColorCode,
      target_material_profile: condition.targetMaterialProfile,
    }))]
    applicationColors[scope] = defaultBoardColorCode
    applicationColors.board_profile_conditions = boardProfileConditions
    delete applicationColors.board_matrix_resolution
    if (defaultMaterialProfile === null) delete materialProfiles[scope]
    else materialProfiles[scope] = defaultMaterialProfile

    const savedRows: Record<string, unknown>[] = await dbQuery(
      `UPDATE public.colors
       SET application_colors_json = $1::jsonb,
           application_material_profiles_json = $2::jsonb
       WHERE code_4dig = $3
       RETURNING code_4dig`,
      [JSON.stringify(applicationColors), JSON.stringify(materialProfiles), sourceColorCode]
    )
    if (!readString(savedRows[0]?.code_4dig)) throw new Error(`No se pudo guardar la regla condicional de ${sourceColorCode}.`)
    revalidatePath('/configuration/colors')
    revalidatePath('/product-design/bom')
    return {
      success: true,
      boardProfileConditions,
      message: `Estrategia de tablero guardada para ${sourceColorCode}: por defecto ${defaultBoardColorCode}${defaultMaterialProfile ? ` · ${defaultMaterialProfile}` : ' · perfil definido por la referencia'}; ${conditions.length} excepción(es) por perfil. No modifica cantos, consumos, formatos ni SAP.`,
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo guardar la regla condicional de tablero.' }
  }
}

/**
 * Records that a scoped SAP review closed every board decision for one color.
 * It stores only the decision summary, never the SAP evidence rows themselves.
 */
export async function confirmTransientBoardMatrixResolutionAction(input: {
  sourceColorCode: string
  sapActiveSkuCount: number
  checkedSkuCount: number
  dualCandidateCount: number
}): Promise<{ success: boolean; message: string; confirmedAt?: string }> {
  await assertPermission('module:product-design')
  try {
    const sourceColorCode = normalizedColorCode(input.sourceColorCode)
    if (!isColorCode(sourceColorCode)) throw new Error('El color debe tener cuatro caracteres.')
    if (!Number.isInteger(input.sapActiveSkuCount) || input.sapActiveSkuCount < 0 || !Number.isInteger(input.checkedSkuCount) || input.checkedSkuCount < 0 || !Number.isInteger(input.dualCandidateCount) || input.dualCandidateCount < 0) {
      throw new Error('La evidencia de cierre de la matriz no es válida.')
    }
    const colorRows: Record<string, unknown>[] = await dbQuery(
      `SELECT application_colors_json
       FROM public.colors
       WHERE code_4dig = $1
       LIMIT 1`,
      [sourceColorCode]
    )
    const color = colorRows[0]
    if (!color) throw new Error(`No existe el color ${sourceColorCode} en Supabase.`)
    const applicationColors = jsonRecord(color.application_colors_json)
    if (!Array.isArray(applicationColors.board_profile_conditions) || applicationColors.board_profile_conditions.length === 0) {
      throw new Error(`El color ${sourceColorCode} no tiene una regla condicional de tablero que cerrar.`)
    }
    const confirmedAt = new Date().toISOString()
    applicationColors.board_matrix_resolution = {
      status: 'configured',
      confirmed_at: confirmedAt,
      sap_active_sku_count: input.sapActiveSkuCount,
      checked_sku_count: input.checkedSkuCount,
      dual_candidate_count: input.dualCandidateCount,
      source: 'reference_import',
    }
    const savedRows: Record<string, unknown>[] = await dbQuery(
      `UPDATE public.colors
       SET application_colors_json = $1::jsonb
       WHERE code_4dig = $2
       RETURNING code_4dig, application_colors_json`,
      [JSON.stringify(applicationColors), sourceColorCode]
    )
    const savedApplicationColors = jsonRecord(savedRows[0]?.application_colors_json)
    const savedResolution = jsonRecord(savedApplicationColors.board_matrix_resolution)
    if (normalizedColorCode(readString(savedRows[0]?.code_4dig) ?? '') !== sourceColorCode || savedResolution.status !== 'configured' || readString(savedResolution.confirmed_at) !== confirmedAt) {
      throw new Error(`No se pudo confirmar la resolución del color ${sourceColorCode}.`)
    }
    revalidatePath('/configuration/colors')
    revalidatePath('/product-design/bom')
    return {
      success: true,
      confirmedAt,
      message: `Configuración de tableros cerrada para ${sourceColorCode}. La regla queda vigente; SAP solo se reconsulta si vuelves a solicitarlo.`,
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo confirmar la resolución de tableros.' }
  }
}

/**
 * Persists a user-approved board Dual exception for an explicit SKU set. It
 * changes only the configured board roles and preserves any edge-band rules.
 */
export async function saveTransientBoardDualSkuOverridesAction(input: {
  skuCompletes: string[]
  sourceColorCode: string
  structureColorCode: string
  structureMaterialProfile: string
  frontColorCode: string
  frontMaterialProfile: string
  isSapDeviation: boolean
}): Promise<BoardDualMutationResult> {
  const access = await assertPermission('module:product-design')
  try {
    const skuCompletes = normalizeSkuCompletes(input.skuCompletes)
    const sourceColorCode = normalizedColorCode(input.sourceColorCode)
    const structureColorCode = normalizedColorCode(input.structureColorCode)
    const frontColorCode = normalizedColorCode(input.frontColorCode)
    const structureMaterialProfile = input.structureMaterialProfile.trim().toUpperCase()
    const frontMaterialProfile = input.frontMaterialProfile.trim().toUpperCase()
    if (skuCompletes.length === 0) throw new Error('Selecciona al menos un SKU para el caso Dual.')
    if (![sourceColorCode, structureColorCode, frontColorCode].every(isColorCode)) {
      throw new Error('El color de producto, estructura y frentes deben tener cuatro caracteres.')
    }
    if (structureColorCode === frontColorCode) throw new Error('Un caso Dual necesita un tablero de estructura distinto al de frentes.')
    if (!isBoardMaterialProfile(structureMaterialProfile) || !isBoardMaterialProfile(frontMaterialProfile)) {
      throw new Error('Los perfiles de tablero deben ser ST, RH, CARB2 o CARB2 RH.')
    }

    const skuRows: Record<string, unknown>[] = await dbQuery(
      `SELECT sku.sku_complete, sku.color_code, sku.bom_overrides
       FROM public.product_skus sku
       JOIN public.product_versions version ON version.id = sku.version_id
       WHERE sku.sku_complete IN (${skuCompletes.map((_, index) => `$${index + 1}`).join(', ')})
         AND version.version_code = '000'`,
      skuCompletes
    )
    const skuByCode = new Map(skuRows.flatMap(row => {
      const skuComplete = readString(row.sku_complete)?.toUpperCase()
      return skuComplete ? [[skuComplete, row] as const] : []
    }))
    const missingSkuCompletes = skuCompletes.filter(skuComplete => !skuByCode.has(skuComplete))
    if (missingSkuCompletes.length > 0) throw new Error(`No existen como SKU versión 000: ${missingSkuCompletes.join(', ')}.`)
    const unexpectedColorSkus = skuCompletes.filter(skuComplete => normalizedColorCode(readString(skuByCode.get(skuComplete)?.color_code) ?? '') !== sourceColorCode)
    if (unexpectedColorSkus.length > 0) throw new Error(`No pertenecen al color ${sourceColorCode}: ${unexpectedColorSkus.join(', ')}.`)

    const reason = input.isSapDeviation
      ? `Matriz de tableros: Dual por SKU como desviación SAP pendiente de corrección humana. Estructura ${structureColorCode} ${structureMaterialProfile}; frente ${frontColorCode} ${frontMaterialProfile}.`
      : `Matriz de tableros: Dual confirmado por SKU. Estructura ${structureColorCode} ${structureMaterialProfile}; frente ${frontColorCode} ${frontMaterialProfile}.`
    const patches = skuCompletes.map(skuComplete => {
      const current = skuByCode.get(skuComplete)
      const retainedOverrides = storedColorOverrides(current?.bom_overrides).filter(override => !(
        override.source === 'reference_import'
        && typeof override.reason === 'string'
        && override.reason.startsWith('Matriz de tableros:')
        && override.color_code === sourceColorCode
        && (override.product_application_scope === 'structure' || override.product_application_scope === 'front')
      ))
      return {
        sku_complete: skuComplete,
        bom_overrides: {
          schema_version: 2,
          operations: storedOperations(current?.bom_overrides),
          color_overrides: [...retainedOverrides, {
            override_id: crypto.randomUUID(),
            color_code: sourceColorCode,
            product_application_scope: 'structure',
            base_item_code: null,
            target_color_code: structureColorCode,
            material_profile: structureMaterialProfile,
            reason,
            source: 'reference_import',
            actor_id: access.user?.id ?? null,
          }, {
            override_id: crypto.randomUUID(),
            color_code: sourceColorCode,
            product_application_scope: 'front',
            base_item_code: null,
            target_color_code: frontColorCode,
            material_profile: frontMaterialProfile,
            reason,
            source: 'reference_import',
            actor_id: access.user?.id ?? null,
          }],
        },
      }
    })
    const updated: Record<string, unknown>[] = await dbQuery(
      `WITH patches AS (
          SELECT sku_complete, bom_overrides
          FROM jsonb_to_recordset($1::jsonb) AS patch(sku_complete text, bom_overrides jsonb)
        ), updated_skus AS (
          UPDATE public.product_skus sku
          SET bom_overrides = patches.bom_overrides
          FROM patches, public.product_versions version
          WHERE sku.sku_complete = patches.sku_complete
            AND sku.version_id = version.id
            AND version.version_code = '000'
          RETURNING sku.sku_complete
        )
        SELECT COALESCE(jsonb_agg(updated_skus.sku_complete), '[]'::jsonb) AS sku_completes
        FROM updated_skus`,
       [JSON.stringify(patches)]
    )
    const savedSkuCompletes = normalizeSkuCompletes(jsonStringArray(updated[0]?.sku_completes))
    if (savedSkuCompletes.length !== skuCompletes.length) {
      throw new Error('No se pudieron guardar todos los overrides del caso Dual.')
    }
    const readBackRows: Record<string, unknown>[] = await dbQuery(
      `SELECT sku.sku_complete, sku.bom_overrides
       FROM public.product_skus sku
       JOIN public.product_versions version ON version.id = sku.version_id
       WHERE sku.sku_complete IN (${skuCompletes.map((_, index) => `$${index + 1}`).join(', ')})
         AND version.version_code = '000'`,
      skuCompletes
    )
    const readBackBySku = new Map(readBackRows.flatMap(row => {
      const skuComplete = readString(row.sku_complete)?.toUpperCase()
      return skuComplete ? [[skuComplete, row] as const] : []
    }))
    const unverifiedSkuCompletes = skuCompletes.filter(skuComplete => {
      const row = readBackBySku.get(skuComplete)
      return !hasPersistedBoardDualOverride({ value: row?.bom_overrides, sourceColorCode, scope: 'structure', targetColorCode: structureColorCode, targetMaterialProfile: structureMaterialProfile })
        || !hasPersistedBoardDualOverride({ value: row?.bom_overrides, sourceColorCode, scope: 'front', targetColorCode: frontColorCode, targetMaterialProfile: frontMaterialProfile })
    })
    if (unverifiedSkuCompletes.length > 0) {
      throw new Error(`Los overrides no quedaron confirmados para: ${unverifiedSkuCompletes.join(', ')}.`)
    }
    const verification = await verifyPersistedBoardDualEffect({
      skuCompletes,
      structureColorCode,
      structureMaterialProfile,
      frontColorCode,
      frontMaterialProfile,
    })
    const invalidatedResolutionRows: Record<string, unknown>[] = await dbQuery(
      `UPDATE public.colors
       SET application_colors_json = COALESCE(application_colors_json, '{}'::jsonb) - 'board_matrix_resolution'
       WHERE code_4dig = $1
       RETURNING code_4dig`,
      [sourceColorCode]
    )
    if (normalizedColorCode(readString(invalidatedResolutionRows[0]?.code_4dig) ?? '') !== sourceColorCode) {
      throw new Error(`No se pudo actualizar el estado de resolución del color ${sourceColorCode}.`)
    }
    revalidatePath('/product-design/bom')
    return {
      success: true,
      verification,
      savedSkuOverride: {
        structureColorCode,
        structureMaterialProfile,
        frontColorCode,
        frontMaterialProfile,
        skuCompletes,
        isSapDeviation: input.isSapDeviation,
      },
      message: `${input.isSapDeviation ? 'Override Dual por SKU guardado como desviación SAP.' : 'Caso Dual por SKU guardado.'} Se configuraron ${skuCompletes.length} SKU(s): estructura ${structureColorCode} ${structureMaterialProfile} y frente ${frontColorCode} ${frontMaterialProfile}. No se modificaron cantos ni SAP.`,
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo guardar el caso Dual de tableros.' }
  }
}

/**
 * Stores the board colors and profiles for the structure/front roles of one
 * color. A SKU is Dual because its BOM exposes those two roles; unicolor BOMs
 * continue resolving through full_product.
 */
export async function saveTransientBoardDualColorCaseAction(input: {
  sourceColorCode: string
  skuCompletes: string[]
  structureColorCode: string
  structureMaterialProfile: string
  frontColorCode: string
  frontMaterialProfile: string
}): Promise<BoardDualMutationResult> {
  await assertPermission('module:product-design')
  try {
    const sourceColorCode = normalizedColorCode(input.sourceColorCode)
    const skuCompletes = normalizeSkuCompletes(input.skuCompletes)
    const structureColorCode = normalizedColorCode(input.structureColorCode)
    const structureMaterialProfile = input.structureMaterialProfile.trim().toUpperCase()
    const frontColorCode = normalizedColorCode(input.frontColorCode)
    const frontMaterialProfile = input.frontMaterialProfile.trim().toUpperCase()
    if (skuCompletes.length === 0) throw new Error('El caso Dual no contiene SKU con evidencia SAP.')
    if (![sourceColorCode, structureColorCode, frontColorCode].every(isColorCode)) {
      throw new Error('El color del producto, estructura y frente debe tener cuatro caracteres.')
    }
    if (structureColorCode === frontColorCode) throw new Error('Un caso Dual necesita tableros distintos para estructura y frente.')
    if (!isBoardMaterialProfile(structureMaterialProfile) || !isBoardMaterialProfile(frontMaterialProfile)) {
      throw new Error('Los perfiles de tablero deben ser ST, RH, CARB2 o CARB2 RH.')
    }

    const colorRows: Record<string, unknown>[] = await dbQuery(
      `SELECT application_colors_json, application_material_profiles_json
       FROM public.colors
       WHERE code_4dig = $1
       LIMIT 1`,
      [sourceColorCode]
    )
    const color = colorRows[0]
    if (!color) throw new Error(`No existe el color ${sourceColorCode} en Supabase.`)
    const applicationColors = jsonRecord(color.application_colors_json)
    if (!readString(applicationColors.edge_band_full_product)) {
      applicationColors.edge_band_full_product = readString(applicationColors.full_product) ?? sourceColorCode
    }
    const materialProfiles = jsonRecord(color.application_material_profiles_json)
    applicationColors.structure = structureColorCode
    applicationColors.front = frontColorCode
    delete applicationColors.board_matrix_resolution
    materialProfiles.structure = structureMaterialProfile
    materialProfiles.front = frontMaterialProfile
    const retainedHybridCases = storedHybridColorCases(applicationColors)
      .filter(existingCase => existingCase.material_kind !== 'board')
    if (retainedHybridCases.length > 0) applicationColors.hybrid_color_cases = retainedHybridCases
    else delete applicationColors.hybrid_color_cases

    const savedRows: Record<string, unknown>[] = await dbQuery(
      `UPDATE public.colors
       SET application_colors_json = $1::jsonb,
           application_material_profiles_json = $2::jsonb
       WHERE code_4dig = $3
       RETURNING code_4dig, application_colors_json, application_material_profiles_json`,
      [JSON.stringify(applicationColors), JSON.stringify(materialProfiles), sourceColorCode]
    )
    if (normalizedColorCode(readString(savedRows[0]?.code_4dig) ?? '') !== sourceColorCode) {
      throw new Error(`No se pudo guardar el caso Dual de tablero para ${sourceColorCode}.`)
    }
    const savedApplicationColors = jsonRecord(savedRows[0]?.application_colors_json)
    const savedMaterialProfiles = jsonRecord(savedRows[0]?.application_material_profiles_json)
    if (
      normalizedColorCode(readString(savedApplicationColors.structure) ?? '') !== structureColorCode
      || normalizedColorCode(readString(savedApplicationColors.front) ?? '') !== frontColorCode
      || readString(savedMaterialProfiles.structure)?.toUpperCase() !== structureMaterialProfile
      || readString(savedMaterialProfiles.front)?.toUpperCase() !== frontMaterialProfile
    ) throw new Error(`La configuración Dual de ${sourceColorCode} no quedó disponible al releer el color.`)
    const verification = await verifyPersistedBoardDualEffect({
      skuCompletes,
      structureColorCode,
      structureMaterialProfile,
      frontColorCode,
      frontMaterialProfile,
    })
    revalidatePath('/configuration/colors')
    revalidatePath('/product-design/bom')
    return {
      success: true,
      savedConfiguration: { structureColorCode, structureMaterialProfile, frontColorCode, frontMaterialProfile },
      verification,
      message: verification.state === 'effective'
        ? `Configuración Dual de tableros aplicada y comprobada para ${sourceColorCode}: estructura ${structureColorCode} ${structureMaterialProfile}; frente ${frontColorCode} ${frontMaterialProfile}.`
        : `Configuración Dual de tableros guardada para ${sourceColorCode}: estructura ${structureColorCode} ${structureMaterialProfile}; frente ${frontColorCode} ${frontMaterialProfile}. ${verification.note ?? ''}`,
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo guardar el caso Dual de tableros.' }
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
  hybridCases: MatrixHybridColorCase[]
  acceptedAbsences: Array<{ skuComplete: string; baseItemCode: string }>
}): Promise<ActionResult> {
  await assertPermission('module:product-design')
  try {
    if (input.selections.length === 0) throw new Error('Selecciona al menos una regla para aplicar.')
    if (input.acceptedAbsences.length > 0) await validateMatrixAbsencesInSap(input.acceptedAbsences)
    const selectionsBySource = new Map<string, Map<string, string>>()
    for (const selection of input.selections) {
      const sourceColorCode = normalizedColorCode(selection.sourceColorCode)
      const targetColorCode = normalizedColorCode(selection.targetColorCode)
      if (!sourceColorCode || !targetColorCode || !isColorCode(targetColorCode)) {
        throw new Error('Cada regla seleccionada necesita un color interno de cuatro caracteres.')
      }
      const scopes = selectionsBySource.get(sourceColorCode) ?? new Map<string, string>()
      scopes.set(selection.scope, targetColorCode)
      selectionsBySource.set(sourceColorCode, scopes)
    }
    const hybridCases = input.hybridCases.map(normalizedMatrixHybridCase)
    const hybridCasesBySource = new Map<string, MatrixHybridColorCase[]>()
    for (const hybridCase of hybridCases) {
      const scopes = selectionsBySource.get(hybridCase.sourceColorCode)
      const unicolorTarget = scopes?.get('edge_band_full_product') ?? scopes?.get('full_product')
      if (!unicolorTarget) throw new Error(`Selecciona primero la regla unicolor de ${hybridCase.sourceColorCode}.`)
      if (unicolorTarget !== hybridCase.fullProductColorCode) {
        throw new Error(`El caso Dual de ${hybridCase.sourceColorCode} debe conservar el mismo color unicolor seleccionado (${unicolorTarget}).`)
      }
      const sourceCases = hybridCasesBySource.get(hybridCase.sourceColorCode) ?? []
      if (sourceCases.length > 0) {
        throw new Error(`Solo puedes guardar un caso Dual para el color ${hybridCase.sourceColorCode}. Los demÃ¡s casos deben corregirse en SAP, inactivarse o resolverse con un override por SKU.`)
      }
      sourceCases.push(hybridCase)
      hybridCasesBySource.set(hybridCase.sourceColorCode, sourceCases)
    }

    const sourceColorCodes = [...selectionsBySource.keys()].sort()
    const colorRows: Record<string, unknown>[] = await dbQuery(
      `SELECT code_4dig, COALESCE(color_mode, 'full') AS color_mode, application_colors_json
       FROM public.colors
       WHERE code_4dig IN (${sourceColorCodes.map((_, index) => `$${index + 1}`).join(', ')})`,
      sourceColorCodes
    )
    const colorRowsByCode = new Map(colorRows.flatMap(row => {
      const code4dig = readString(row.code_4dig)?.toUpperCase()
      return code4dig ? [[code4dig, row] as const] : []
    }))

    for (const sourceColorCode of sourceColorCodes) {
      const currentRow = colorRowsByCode.get(sourceColorCode)
      if (!currentRow) throw new Error(`No existe el color ${sourceColorCode}.`)
      const nextApplicationColors = jsonRecord(currentRow.application_colors_json)
      const scopes = selectionsBySource.get(sourceColorCode) ?? new Map<string, string>()
      for (const [scope, targetColorCode] of scopes) nextApplicationColors[scope] = targetColorCode

      const sourceHybridCases = hybridCasesBySource.get(sourceColorCode) ?? []
      if (sourceHybridCases.length > 0) {
        const unicolorColorCode = sourceHybridCases[0]?.fullProductColorCode
        if (!unicolorColorCode) throw new Error(`Falta el color unicolor de ${sourceColorCode}.`)
        nextApplicationColors.full_product = unicolorColorCode
        nextApplicationColors.edge_band_full_product = unicolorColorCode

        const preservedCases = storedHybridColorCases(nextApplicationColors)
          .filter(existingCase => existingCase.color_mode !== 'dual')
        const configuredCases: HybridColorCase[] = sourceHybridCases.map((hybridCase, index) => ({
          case_id: `matrix_${hybridCase.colorMode}_${hybridCase.structureColorCode}_${hybridCase.frontColorCode}_${hybridCase.skuCompletes[0] ?? String(index + 1)}`,
          color_mode: hybridCase.colorMode,
          sku_completes: hybridCase.skuCompletes,
          application_colors: {
            structure: hybridCase.structureColorCode,
            front: hybridCase.frontColorCode,
            edge_band_body: hybridCase.structureColorCode,
            edge_band_front: hybridCase.frontColorCode,
          },
        }))
        nextApplicationColors.hybrid_color_cases = [...preservedCases, ...configuredCases]
      }

      const rows: Record<string, unknown>[] = await dbQuery(
        `UPDATE public.colors
         SET color_mode = $1,
             application_colors_json = $2::jsonb
         WHERE code_4dig = $3
         RETURNING code_4dig`,
        [sourceHybridCases.length > 0 ? 'full' : readString(currentRow.color_mode) ?? 'full', JSON.stringify(nextApplicationColors), sourceColorCode]
      )
      if (!readString(rows[0]?.code_4dig)) throw new Error(`No se pudo guardar el color ${sourceColorCode}.`)
    }
    revalidatePath('/configuration/colors')
    revalidatePath('/product-design/bom')
    const hybridSkuCount = hybridCases.reduce((total, hybridCase) => total + hybridCase.skuCompletes.length, 0)
    return {
      success: true,
      message: hybridCases.length > 0
        ? `Regla unicolor y ${hybridCases.length} caso(s) Dual guardados para ${hybridSkuCount} SKU(s) completos. No se reconsultó SAP: se reutilizó la evidencia de esta verificación.`
        : 'Reglas unicolor guardadas. No se reconsultó SAP.',
      workspace: null,
    }
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
  confirmed: boolean
  items: IssueMethodItem[]
}): Promise<ActionResult & { issueMethodResult?: { dryRun: boolean; results: Array<{ skuComplete: string; childNum: number; itemCode: string; success: boolean; changed: boolean; message: string }> } }> {
  const access = await assertPermission('module:product-design')
  const items = [...new Map(input.items.map(item => [`${item.skuComplete}:${item.childNum}:${item.itemCode}`, item])).values()]
  
  try {
    if (!input.dryRun && !input.confirmed) throw new Error('Confirma la acción con la casilla antes de modificar los métodos en SAP.')
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
          dry_run: input.dryRun, confirmation_text: input.confirmed ? 'CHECKED' : '', sap_payload: { child_num: item.childNum, item_code: item.itemCode },
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
      issueMethodResult: { dryRun: input.dryRun, results },
    }
  } catch (error) {
    return { ...failure(error, 'No se pudieron homologar los métodos de salida.'), issueMethodResult: undefined }
  }
}

export async function applyTransientQuantitiesBatchAction(input: {
  referenceId: string
  targetQty: number
  dryRun: boolean
  confirmed: boolean
  items: QuantityItem[]
}): Promise<ActionResult & { quantityResult?: { dryRun: boolean; results: Array<{ skuComplete: string; childNum: number; itemCode: string; previousQty: number; success: boolean; changed: boolean; message: string }> } }> {
  const access = await assertPermission('module:product-design')
  const items = [...new Map(input.items.map(item => [`${item.skuComplete}:${item.childNum}:${item.itemCode}`, item])).values()]
  try {
    if (!Number.isFinite(input.targetQty) || input.targetQty <= 0) throw new Error('Indica una cantidad mayor que cero para homologar en SAP.')
    if (!input.dryRun && !input.confirmed) throw new Error('Confirma la acción con la casilla antes de modificar cantidades en SAP.')
    const results: Array<{ skuComplete: string; childNum: number; itemCode: string; previousQty: number; success: boolean; changed: boolean; message: string }> = []
    for (const item of items) {
      let success = false
      let changed = false
      let message = ''
      let response: Record<string, unknown> = {}
      try {
        if (!Number.isFinite(item.expectedQty) || item.expectedQty <= 0) throw new Error(`La evidencia de ${item.skuComplete} no tiene una cantidad válida.`)
        const beforeTree = await getSapItemBom(item.skuComplete)
        if (!beforeTree) throw new Error(`SAP no devolvió ProductTree para ${item.skuComplete}.`)
        const beforeLine = beforeTree.lines.find(line => line.ChildNum === item.childNum && line.ItemCode === item.itemCode)
        if (!beforeLine) throw new Error(`SAP no encontró la línea ${item.childNum}/${item.itemCode}.`)
        if (beforeLine.Quantity !== item.expectedQty) {
          throw new Error(`SAP ya cambió esta línea (${beforeLine.Quantity}); vuelve a analizar antes de homologarla.`)
        }
        if (beforeLine.Quantity === input.targetQty) {
          success = true
          message = 'SAP ya tenía la cantidad solicitada.'
        } else if (input.dryRun) {
          success = true
          message = `Dry-run listo: ${beforeLine.Quantity} cambiaría a ${input.targetQty}.`
        } else {
          response = (await updateSapProductTreeLineQuantity({
            treeCode: beforeTree.treeCode,
            childNum: item.childNum,
            itemCode: item.itemCode,
            quantity: input.targetQty,
          })) as Record<string, unknown>
          const afterTree = await getSapItemBom(item.skuComplete)
          if (!afterTree || !productTreeQuantityMatches(beforeTree.lines, afterTree.lines, {
            childNum: item.childNum,
            itemCode: item.itemCode,
            quantity: input.targetQty,
          })) {
            throw new Error('La verificación posterior no confirma la cantidad solicitada.')
          }
          success = true
          changed = true
          message = 'Cantidad actualizada y verificada en SAP.'
        }
      } catch (error) {
        message = error instanceof Error ? error.message : 'No se pudo actualizar SAP.'
      } finally {
        await supabaseTable('sap_operation_logs').insert({
          operation_type: 'product_tree_quantity_update', item_code: item.skuComplete, requested_status: String(input.targetQty),
          dry_run: input.dryRun, confirmation_text: input.confirmed ? 'CHECKED' : '',
          sap_payload: { child_num: item.childNum, item_code: item.itemCode, expected_qty: item.expectedQty, target_qty: input.targetQty },
          sap_response: response, success, error_message: success ? null : message, created_by: access.user?.id ?? null,
        })
      }
      results.push({ ...item, previousQty: item.expectedQty, success, changed, message })
    }
    const failedCount = results.filter(result => !result.success).length
    return {
      success: failedCount === 0,
      message: input.dryRun
        ? `Dry-run de ${results.length} línea(s): ${failedCount} con error.`
        : `${results.filter(result => result.success).length} línea(s) verificadas en SAP; ${failedCount} con error.`,
      workspace: null,
      quantityResult: { dryRun: input.dryRun, results },
    }
  } catch (error) {
    return { ...failure(error, 'No se pudieron homologar las cantidades en SAP.'), quantityResult: undefined }
  }
}

export async function syncTransientSapInactiveSkusInSupabaseAction(input: { skuCompletes: string[] }): Promise<{
  success: boolean
  message: string
  results: Array<{ skuComplete: string; success: boolean; changed: boolean; message: string }>
}> {
  await assertPermission('module:product-design')
  const skuCompletes = [...new Set(input.skuCompletes.map(value => value.trim().toUpperCase()).filter(Boolean))]
  if (skuCompletes.length === 0) return { success: false, message: 'Selecciona al menos un SKU para sincronizar.', results: [] }
  const results: Array<{ skuComplete: string; success: boolean; changed: boolean; message: string }> = []
  for (const skuComplete of skuCompletes) {
    try {
      // These SKU come from the board matrix that just read their SAP status.
      // This is a Supabase-only reconciliation, so it must mutate precisely the
      // selected evidence set instead of triggering another broad SAP scan.
      const rows: Record<string, unknown>[] = await dbQuery(
        `UPDATE public.product_skus sku
         SET status = 'INACTIVO', updated_at = now()
         FROM public.product_versions version
         WHERE sku.version_id = version.id
           AND version.version_code = '000'
           AND sku.sku_complete = $1
           AND COALESCE(sku.status, 'ACTIVO') = 'ACTIVO'
         RETURNING sku.id`,
        [skuComplete]
      )
      const changed = readString(rows[0]?.id) !== null
      results.push({
        skuComplete,
        success: true,
        changed,
        message: changed ? 'Supabase quedó inactivo según la evidencia SAP recién analizada.' : 'Ya estaba inactivo en Supabase.',
      })
    } catch (error) {
      results.push({
        skuComplete,
        success: false,
        changed: false,
        message: error instanceof Error ? error.message : 'No se pudo sincronizar el estado en Supabase.',
      })
    }
  }
  const failedCount = results.filter(result => !result.success).length
  const changedCount = results.filter(result => result.changed).length
  return {
    success: failedCount === 0,
    message: `${changedCount} SKU sincronizado(s) como inactivo(s) en Supabase; ${failedCount} sin cambio.`,
    results,
  }
}

/**
 * Adds only the missing color variant of an already-active reference/version.
 * It intentionally cannot create a reference, version, color, or SAP item.
 */
export async function createTransientSapColorVariationAction(input: {
  skuComplete: string
  sapDescriptionOriginal: string | null
  componentItemCodes?: string[]
}): Promise<{ success: boolean; message: string; importedComponentItemCodes?: string[] }> {
  await assertPermission('module:product-design')
  const importedComponentItemCodes: string[] = []
  const skuComplete = input.skuComplete.trim().toUpperCase()
  const segments = skuComplete.split('-')
  const colorCode = segments.at(-1) ?? ''
  const versionCode = segments.at(-2) ?? ''
  const skuBase = segments.slice(0, -1).join('-')
  if (!/^V[A-Z0-9]*$/.test(segments[0] ?? '') || versionCode !== '000' || !isColorCode(colorCode) || !skuBase) {
    return { success: false, message: 'El SKU no tiene el formato V*, versión 000 y color de cuatro caracteres requerido para crear una variación.' }
  }

  const existingRows: Record<string, unknown>[] = await dbQuery(
    'SELECT id FROM public.product_skus WHERE sku_complete = $1 LIMIT 1',
    [skuComplete]
  )
  if (readString(existingRows[0]?.id)) return { success: false, message: `${skuComplete} ya está registrado en Supabase.` }

  const suppliedComponentItemCodes = [...new Set((input.componentItemCodes ?? []).map(code => code.trim().toUpperCase()).filter(Boolean))]
  const directBom = suppliedComponentItemCodes.length === 0 ? await getSapItemBom(skuComplete) : null
  const componentItemCodes = suppliedComponentItemCodes.length > 0
    ? suppliedComponentItemCodes
    : [...new Set((directBom?.lines ?? [])
      .map(line => parseSapItemCode(line.ItemCode))
      .filter(parsed => !parsed.isSalesSku)
      .map(parsed => parsed.itemCode))]
  if (componentItemCodes.length === 0) return { success: false, message: 'No se creÃ³ la variaciÃ³n: SAP no entregÃ³ componentes de la LdM para importar en la misma operaciÃ³n.' }
  const existingComponentRows: Record<string, unknown>[] = await dbQuery(
    `SELECT item_code FROM public.component_items WHERE item_code IN (${componentItemCodes.map((_, index) => `$${index + 1}`).join(', ')})`,
    componentItemCodes,
  )
  const existingComponentCodes = new Set(existingComponentRows.map(row => readString(row.item_code)?.toUpperCase()).filter((code): code is string => Boolean(code)))
  const missingComponentCodes = componentItemCodes.filter(code => !existingComponentCodes.has(code))
  if (missingComponentCodes.length > 0) {
    const syncResult = await syncMissingSapComponentsToCatalog(missingComponentCodes.map(itemCode => ({ itemCode, defaultIssueMethod: null })))
    if (syncResult.errors.length > 0 || syncResult.missingInSapItemCodes.length > 0 || syncResult.unavailableItemCodes.length > 0) {
      const details = [
        ...syncResult.errors,
        syncResult.missingInSapItemCodes.length > 0 ? `No existe en SAP: ${syncResult.missingInSapItemCodes.join(', ')}` : null,
        syncResult.unavailableItemCodes.length > 0 ? `SAP lo reporta inactivo/congelado: ${syncResult.unavailableItemCodes.join(', ')}` : null,
      ].filter((value): value is string => Boolean(value)).join(' ')
      return { success: false, message: `No se creÃ³ la variaciÃ³n porque no se pudieron importar todos los componentes en esta misma operaciÃ³n. ${details}` }
    }
    importedComponentItemCodes.push(...syncResult.importedItemCodes)
  }

  const versionRows: Record<string, unknown>[] = await dbQuery(
    `SELECT v.id
     FROM public.product_versions v
     JOIN public.product_references r ON r.id = v.reference_id
     WHERE v.sku_base = $1
       AND v.version_code = '000'
       AND COALESCE(v.status, 'ACTIVO') = 'ACTIVO'
       AND COALESCE(r.status, 'ACTIVO') = 'ACTIVO'
     LIMIT 2`,
    [skuBase]
  )
  if (versionRows.length !== 1) {
    return {
      success: false,
      message: versionRows.length === 0
        ? 'No existe una referencia y versión 000 activas en Supabase para crear esta variación de color.'
        : 'Hay más de una versión activa candidata; no se creó ninguna variación.',
    }
  }

  const createdRows: Record<string, unknown>[] = await dbQuery(
    `INSERT INTO public.product_skus (
       version_id, sku_complete, color_code, sap_description_original, status, sku_attrs,
       naming_stale, naming_stale_at, naming_stale_final_complete_name,
       naming_stale_sap_description_recommended, updated_at
     ) VALUES ($1, $2, $3, $4, 'ACTIVO', '{}'::jsonb, true, now(), true, true, now())
     RETURNING id`,
    [readString(versionRows[0]?.id), skuComplete, colorCode, readString(input.sapDescriptionOriginal)]
  )
  if (!readString(createdRows[0]?.id)) return { success: false, message: 'Supabase no confirmó la creación de la variación de color.' }
  revalidatePath('/product-design/bom')
  const verifiedSkuRows: Record<string, unknown>[] = await dbQuery(
    `SELECT sku_complete FROM public.product_skus WHERE sku_complete = $1 AND status = 'ACTIVO' LIMIT 1`,
    [skuComplete],
  )
  const verifiedComponentRows: Record<string, unknown>[] = await dbQuery(
    `SELECT item_code FROM public.component_items WHERE item_code IN (${componentItemCodes.map((_, index) => `$${index + 1}`).join(', ')})`,
    componentItemCodes,
  )
  const verifiedComponentCodes = new Set(verifiedComponentRows.map(row => readString(row.item_code)?.toUpperCase()).filter((code): code is string => Boolean(code)))
  if (!readString(verifiedSkuRows[0]?.sku_complete) || componentItemCodes.some(code => !verifiedComponentCodes.has(code))) {
    return { success: false, message: 'La operación no quedó verificada: faltó confirmar el SKU o alguno de sus componentes.' }
  }
  return { success: true, importedComponentItemCodes, message: `${skuComplete} y ${componentItemCodes.length} componente(s) quedaron confirmados en Supabase en esta misma operación. No se modificó SAP.` }
}

export async function deleteTransientSapOnlySkuAction(input: {
  skuComplete: string
  dryRun: boolean
  confirmed: boolean
}): Promise<{ success: boolean; dryRun: boolean; message: string; treeDeleted?: boolean; treeCode?: string | null; parentTrees?: string[] }> {
  await assertPermission('module:product-design')
  const skuComplete = input.skuComplete.trim().toUpperCase()
  let treeDeleted = false
  let treeCode: string | null = null
  let parentTrees: string[] = []
  try {
    await getSapItem(skuComplete, ['ItemCode', 'ItemName', 'Valid', 'Frozen'])
    const bom = await getSapItemBom(skuComplete)
    parentTrees = (await getSapProductTreeUsages(skuComplete)).map(tree => tree.treeCode)
    treeCode = bom?.treeCode || null
    if (input.dryRun) {
      return {
        success: true,
        dryRun: true,
        treeCode,
        parentTrees,
        message: parentTrees.length > 0
          ? `No se puede eliminar ${skuComplete} automáticamente porque está asociado como componente en estas LdM superiores: ${parentTrees.join(', ')}. Primero deben resolverse esas asociaciones.`
          : bom
            ? `Dry-run listo para desasociar primero la LdM ${treeCode} (${bom.lines.length} líneas) y después eliminar ${skuComplete} de SAP. Los componentes internos no se eliminarán.`
            : `Dry-run listo para eliminar ${skuComplete} de SAP. No se encontró una LdM propia para desasociar.`,
      }
    }
    if (!input.confirmed) throw new Error('Confirma la acción con la casilla antes de eliminar el código de SAP.')
    if (parentTrees.length > 0) {
      throw new Error(`El código está asociado como componente en estas LdM superiores: ${parentTrees.join(', ')}. No se modificó ninguna LdM.`)
    }

    if (bom) {
      const resolvedTreeCode = bom.treeCode || skuComplete
      await deleteSapProductTree(resolvedTreeCode)
      const treeAfter = await getSapItemBom(resolvedTreeCode)
      if (treeAfter) throw new Error(`SAP no confirmó la eliminación de la LdM ${resolvedTreeCode}.`)
      treeDeleted = true
      treeCode = resolvedTreeCode
    }

    await deleteSapItem(skuComplete)
    try {
      await getSapItem(skuComplete, ['ItemCode'])
      throw new Error(`SAP todavía devuelve ${skuComplete}; la eliminación no quedó verificada.`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('todavía devuelve')) throw error
      if (error instanceof SapServiceLayerError && error.statusCode === 404) {
        return {
          success: true,
          dryRun: false,
          treeDeleted,
          treeCode,
          message: `${skuComplete} fue eliminado y verificado en SAP${treeDeleted ? `; la LdM ${treeCode} fue desasociada previamente y sus componentes internos se conservaron.` : '.'}`,
        }
      }
      throw new Error(`No se pudo verificar la eliminación de ${skuComplete} en SAP: ${error instanceof Error ? error.message : 'error desconocido'}`)
    }
    return {
      success: true,
      dryRun: false,
      treeDeleted,
      treeCode,
      message: `${skuComplete} fue eliminado y verificado en SAP${treeDeleted ? `; la LdM ${treeCode} fue desasociada previamente y sus componentes internos se conservaron.` : '.'}`,
    }
  } catch (error) {
    return {
      success: false,
      dryRun: input.dryRun,
      treeDeleted,
      treeCode,
      parentTrees,
      message: treeDeleted
        ? `La LdM ${treeCode} fue desasociada, pero el código ${skuComplete} no pudo eliminarse: ${error instanceof Error ? error.message : 'error desconocido'}`
        : error instanceof Error ? error.message : 'No se pudo eliminar el código en SAP.',
    }
  }
}

export async function deactivateTransientReferenceBomSkusInSapAction(input: {
  skuCompletes: string[]
  dryRun: boolean
  confirmed: boolean
}): Promise<{ success: boolean; message: string; results: Array<{ skuComplete: string; success: boolean; changed: boolean; message: string }> }> {
  const access = await assertPermission('module:product-design')
  const skuCompletes = [...new Set(input.skuCompletes.map(value => value.trim().toUpperCase()).filter(Boolean))]
  const payload: SapEntityPayload = { Valid: 'tNO', Frozen: 'tYES' }
  if (skuCompletes.length === 0) return { success: false, message: 'Selecciona al menos un SKU.', results: [] }
  if (!input.dryRun && !input.confirmed) return { success: false, message: 'Confirma la acción con la casilla antes de inactivar en SAP.', results: [] }
  if (!input.dryRun) {
    const rows: Record<string, unknown>[] = await dbQuery(
      `SELECT COUNT(DISTINCT item_code) AS count FROM public.sap_operation_logs WHERE operation_type = 'item_status_update' AND requested_status = 'INACTIVO' AND dry_run = true AND success = true AND item_code IN (SELECT value FROM jsonb_array_elements_text($1::jsonb)) AND created_at >= now() - interval '30 minutes'`,
      [JSON.stringify(skuCompletes)]
    )
  if (Number(rows[0]?.count ?? 0) !== skuCompletes.length) return { success: false, message: 'Primero ejecuta el dry-run de todos los SKU seleccionados; vale durante 30 minutos.', results: [] }
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
      await supabaseTable('sap_operation_logs').insert({ operation_type: 'item_status_update', item_code: skuComplete, requested_status: 'INACTIVO', dry_run: input.dryRun, confirmation_text: input.confirmed ? 'CHECKED' : '', sap_payload: payload, sap_response: response, success, error_message: errorMessage, created_by: access.user?.id ?? null })
    }
  }
  const failedCount = results.filter(result => !result.success).length
  return { success: failedCount === 0, message: input.dryRun ? `Dry-run de ${results.length} SKU: ${failedCount} con error.` : `${results.filter(result => result.success).length} SKU verificado(s) en SAP; ${failedCount} con error.`, results }
}

function applyReferenceSemanticScopeAssignments(
  structure: ReferenceBomStructure,
  assignments: ReferenceSemanticScopeAssignment[]
): ReferenceBomStructure {
  const assignmentsByLineId = new Map(assignments.map(assignment => [assignment.lineId, assignment]))
  return {
    ...structure,
    lines: structure.lines.map(line => {
      const assignment = assignmentsByLineId.get(line.line_id)
      if (!assignment || line.line_kind !== assignment.lineKind || line.base_item_code !== assignment.baseItemCode) return line
      return { ...line, product_application_scope: assignment.scope }
    }),
  }
}

export async function publishTransientReferenceBomAction(input: {
  referenceId: string
  semanticScopeAssignments?: ReferenceSemanticScopeAssignment[]
  quantityResolutions?: ReferenceQuantityResolution[]
}): Promise<ActionResult> {
  await assertPermission('module:product-design')
  try {
    const referenceId = input.referenceId.trim()
    const workspace = await analyzeReferenceBomImportTransient({ referenceId })
    const validQuantityResolutions = (input.quantityResolutions ?? []).flatMap(resolution => {
      const baseItemCode = resolution.baseItemCode.trim().toUpperCase()
      const finding = workspace.findings.find(candidate =>
        candidate.findingType === 'line_quantity_conflict'
        && candidate.status === 'open'
        && candidate.baseItemCode === baseItemCode
        && candidate.proposedScope === resolution.scope
      )
      if (!finding || !isReferenceProductApplicationScope(resolution.scope) || !['repetition', 'maximum', 'custom'].includes(resolution.strategy)) return []
      const qty = resolution.strategy === 'repetition'
        ? Number(finding.detailsJson.repeated_qty)
        : resolution.strategy === 'maximum'
          ? Number(finding.detailsJson.proposed_qty)
          : Number(resolution.customQty)
      return Number.isFinite(qty) && qty > 0 ? [{ baseItemCode, scope: resolution.scope, qty }] : []
    })
    const resolvedQuantityKeys = new Set(validQuantityResolutions.map(item => `${item.baseItemCode}:${item.scope}`))
    const blockers = workspace.findings.filter(finding => finding.severity === 'blocker' && finding.status === 'open'
      && !(finding.findingType === 'line_quantity_conflict' && finding.baseItemCode && finding.proposedScope && resolvedQuantityKeys.has(`${finding.baseItemCode}:${finding.proposedScope}`)))
    if (blockers.length > 0) throw new Error(`SAP aún tiene ${blockers.length} bloqueo(s) pendientes; no se publica una propuesta vieja.`)
    const validAssignments = (input.semanticScopeAssignments ?? []).flatMap((assignment) => {
      const lineId = assignment.lineId.trim()
      const lineKind = assignment.lineKind
      const baseItemCode = assignment.baseItemCode?.trim().toUpperCase() ?? null
      const hasValidIdentity = lineKind === 'fixed'
        ? Boolean(baseItemCode)
        : lineKind === 'material_group' && baseItemCode === null
      return lineId && hasValidIdentity && isReferenceProductApplicationScope(assignment.scope)
        ? [{ lineId, lineKind, baseItemCode, scope: assignment.scope }]
        : []
    })
    const scopedBomStructure = applyReferenceSemanticScopeAssignments(
      workspace.run.proposedBomStructure,
      validAssignments
    )
    const proposedBomStructure = {
      ...scopedBomStructure,
      lines: scopedBomStructure.lines.map(line => {
        const resolution = validQuantityResolutions.find(item => item.baseItemCode === line.base_item_code && item.scope === line.product_application_scope)
        return resolution ? { ...line, qty: resolution.qty } : line
      }),
    }
    await dbQuery(
      `UPDATE public.product_references SET product_bom_structure = $1::jsonb WHERE id = $2`,
      [JSON.stringify(proposedBomStructure), referenceId]
    )
    const persistedRows: Record<string, unknown>[] = await dbQuery(
      `SELECT product_bom_structure FROM public.product_references WHERE id = $1 LIMIT 1`,
      [referenceId]
    )
    const persistedBomStructure = normalizeBomStructure(persistedRows[0]?.product_bom_structure)
    if (JSON.stringify(persistedBomStructure) !== JSON.stringify(proposedBomStructure)) {
      throw new Error('La BOM se guardó, pero la lectura posterior no coincide con la estructura que se intentó publicar.')
    }
    revalidatePath('/product-design')
    return {
      success: true,
      message: validAssignments.length > 0
        ? 'BOM base publicada con roles lógicos de la referencia y una validación SAP fresca.'
        : 'BOM base publicada con una validación SAP fresca.',
      workspace: {
        ...workspace,
        run: {
          ...workspace.run,
          status: 'published',
          proposedBomStructure,
          publishedBomStructure: proposedBomStructure,
        },
      },
    }
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

export type BoardFullProductColorRuleActionResult = {
  success: boolean
  message: string
  color: ColorEntry | null
}

/**
 * Stores only the global color rule that SAP has just revalidated. The action
 * deliberately re-runs the SAP-first matrix so a stale browser result cannot
 * persist a rule after the underlying SKU population changed.
 */
export async function applyTransientBoardFullProductColorRuleAction(input: {
  colorCode: string
  boardColorCode: string
  materialProfile: string
}): Promise<BoardFullProductColorRuleActionResult> {
  try {
    await assertPermission('module:product-design')
    const colorCode = normalizedColorCode(input.colorCode)
    const boardColorCode = normalizedColorCode(input.boardColorCode)
    const materialProfile = input.materialProfile.trim().toUpperCase()
    if (!isColorCode(colorCode) || !isColorCode(boardColorCode)) {
      throw new Error('El color de producto y el color de tablero deben tener cuatro caracteres.')
    }
    if (!isBoardMaterialProfile(materialProfile)) {
      throw new Error('El perfil de tablero debe ser ST, RH, CARB2 o CARB2 RH.')
    }

    const [coverage] = await analyzeReferenceImportBoardMatrix({ colorCodes: [colorCode] })
    const candidate = coverage?.fullProductRuleCandidate
    if (!coverage || !candidate || coverage.fullProductRuleBlockers.length > 0) {
      const reason = coverage?.fullProductRuleBlockers[0] ?? 'SAP no devolvió una evidencia completa para esta regla.'
      return {
        success: false,
        message: `No se guardó la regla global del color ${colorCode}: ${reason}`,
        color: null,
      }
    }
    if (candidate.boardColorCode !== boardColorCode || candidate.materialProfile !== materialProfile) {
      return {
        success: false,
        message: `SAP acaba de validar tablero ${candidate.boardColorCode} con perfil ${candidate.materialProfile}; la propuesta abierta ya no coincide.`,
        color: null,
      }
    }

    const color = (await getColorsAction()).find(item => item.code_4dig === colorCode)
    if (!color) throw new Error(`No existe el color ${colorCode} en Supabase.`)
    if (color.color_mode === 'dual' || color.color_mode === 'balance') {
      return {
        success: false,
        message: `El color ${colorCode} es ${color.color_mode}; requiere una regla por rol y no una regla global de producto completo.`,
        color: null,
      }
    }
    if (
      color.application_colors_json.full_product === boardColorCode
      && color.application_material_profiles_json.full_product === materialProfile
    ) {
      return {
        success: true,
        message: `La regla global del color ${colorCode} ya coincide con SAP: producto completo usa tablero ${boardColorCode} y perfil ${materialProfile}.`,
        color,
      }
    }

    const saved = await upsertColorAction({
      ...color,
      isNew: false,
      application_colors_json: {
        ...color.application_colors_json,
        full_product: boardColorCode,
      },
      application_material_profiles_json: {
        ...color.application_material_profiles_json,
        full_product: materialProfile,
      },
    })
    revalidatePath('/product-design/bom')
    return {
      success: true,
      message: `Regla global guardada para ${colorCode}: producto completo usa tablero ${boardColorCode} y perfil ${materialProfile}, respaldado por ${candidate.evidenceSkuCount} SKU activos de SAP. No cambió consumos, formatos, BOM base ni overrides por SKU.`,
      color: saved,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo guardar la regla global de tablero.',
      color: null,
    }
  }
}
