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
import type { ReferenceBomStructure, ReferenceImportWorkspace } from '@/lib/bom/referenceImportTypes'
import { isReferenceProductApplicationScope, type ReferenceProductApplicationScope } from '@/lib/bom/referenceImportScopes'
import type { HybridColorCase } from '@/lib/bom/types'
import { normalizeBomStructure } from '@/lib/bom/resolve'
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
type MatrixHybridColorCase = {
  sourceColorCode: string
  fullProductColorCode: string
  colorMode: 'dual' | 'balance'
  structureColorCode: string
  frontColorCode: string
  skuCompletes: string[]
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

function normalizeSkuCompletes(value: string[]): string[] {
  return [...new Set(value
    .map(skuComplete => skuComplete.trim().toUpperCase())
    .filter(Boolean))]
    .sort()
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
    return [{
      case_id: typeof candidate.case_id === 'string' && candidate.case_id.trim()
        ? candidate.case_id.trim()
        : `legacy_case_${String(index + 1).padStart(3, '0')}`,
      color_mode: colorMode,
      sku_completes: skuCompletes,
      application_colors: applicationColors,
    }]
  })
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
}): Promise<ActionResult> {
  await assertPermission('module:product-design')
  try {
    const referenceId = input.referenceId.trim()
    const workspace = await analyzeReferenceBomImportTransient({ referenceId })
    const blockers = workspace.findings.filter(finding => finding.severity === 'blocker' && finding.status === 'open')
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
    const proposedBomStructure = applyReferenceSemanticScopeAssignments(
      workspace.run.proposedBomStructure,
      validAssignments
    )
    await dbQuery(
      `UPDATE public.product_references SET product_bom_structure = $1::jsonb WHERE id = $2`,
      [JSON.stringify(proposedBomStructure), referenceId]
    )
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
