'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSearch,
  LoaderCircle,
  Search,
  Upload,
} from 'lucide-react'

import {
  applyTransientIssueMethodsBatchAction,
  applyTransientBoardFullProductColorRuleAction,
  confirmTransientBoardMatrixResolutionAction,
  confirmTransientColorMatrixAction,
  confirmTransientColorRuleAction,
  confirmTransientMaterialProfileAction,
  createTransientSapColorVariationAction,
  deleteTransientSapOnlySkuAction,
  deactivateTransientReferenceBomSkusInSapAction,
  getTransientReferenceBomColorAction,
  listTransientReferenceBomImportCandidatesAction,
  publishTransientReferenceBomAction,
  saveTransientColorOverrideAction,
  saveTransientBoardConditionalProfileRuleAction,
  saveTransientBoardDualColorCaseAction,
  saveTransientBoardDualSkuOverridesAction,
  saveTransientMatrixDualCandidateSkuOverridesAction,
  saveTransientMatrixSkuColorOverrideAction,
  saveTransientReferenceBomColorAction,
  syncTransientSapInactiveSkusInSupabaseAction,
  validateTransientAbsencesAction,
  verifyTransientColorMatrixAction,
  type BoardDualMutationResult,
} from './transientReferenceImportActions'
import type {
  ReferenceImportCandidate,
  ReferenceImportFinding,
  ReferenceImportWorkspace,
  BoardMatrixCatalogResult,
  BoardMatrixConditionalStrategy,
  BoardMatrixDualConfiguration,
  BoardMatrixDualCandidate,
  BoardMatrixPersistedDualSkuOverride,
  BoardMatrixRow,
} from '@/lib/bom/referenceImportTypes'
import { deriveBoardConditionalRuleStrategies, summarizeBoardEvidenceExamples, summarizeBoardProfileEvidence, type BoardEvidenceExample, type BoardProfileEvidenceSummary } from '@/lib/bom/boardMatrix'
import type { ColorEntry } from '@/app/rules/colors/actions'
import { BOARD_MATERIAL_PROFILE_SCOPE_KEYS, type BoardMaterialProfileScope, type ColorApplicationScope } from '@/app/rules/colors/productiveScopes'
import type { ReferenceProductApplicationScope } from '@/lib/bom/referenceImportScopes'

type Props = {
  initialCandidates: ReferenceImportCandidate[]
}

type OverrideDraft = {
  level: 'reference' | 'version' | 'sku'
  skuComplete: string
  sourceColorCode: string
  targetColorCode: string
  materialProfile: string
  reason: string
}

type IssueMethodDraft = {
  targetIssueMethod: 'im_Manual' | 'im_Backflush'
  confirmed: boolean
  result: string | null
}

type ColorEditorState = {
  finding: ReferenceImportFinding
  color: ColorEntry
}

type BoardColorRuleEditorState = {
  sourceColorCode: string
  boardColorCode: string
  materialProfile: string
  evidenceSkuCount: number
}

type BoardConditionalRuleEditorState = {
  sourceColorCode: string
  strategies: BoardMatrixConditionalStrategy[]
  selectedStrategyId: string
  saveResult: { success: boolean; message: string } | null
}

type BoardDualCandidateWithColor = BoardMatrixDualCandidate & { sourceColorCode: string }

type ColorRuleMatrixRow = {
  key: string
  sourceColorCode: string
  scope: string
  suggestedTargetColorCode: string | null
  findingIds: string[]
  baseItemCodes: string[]
  materialKinds: Array<'board' | 'edge_band' | 'other'>
  conflictingTargetColorCodes: string[]
  dualEvidence: string | null
}

type ColorRuleMatrixCoverage = {
  sourceColorCode: string
  scope: string
  targetColorCode: string
  baseItemCodes: string[]
  catalogSkuCount: number
  excludedInactiveSapSkuCount: number
  excludedKitSkuCount: number
  acceptedMissingComponentCount: number
  checkedSkuCount: number
  matchingSkuCount: number
  sapReadErrors: Array<{ skuComplete: string; message: string }>
  mismatches: Array<{
    skuComplete: string
    skuItemName: string | null
    baseItemCode: string
    itemCode: string | null
    itemName: string | null
    observedColorCode: string | null
    reason: 'missing_component' | 'unexpected_color'
    semanticScope?: ReferenceProductApplicationScope | null
  }>
  dualCandidates: Array<{
    structureColorCode: string
    frontColorCode: string
    evidenceSkuComplete: string
    structureQty: number
    frontQty: number
    evidenceSkuCount: number
    cases: Array<{
      skuComplete: string
      skuItemName: string | null
      structureQty: number
      frontQty: number
      edgeLines: Array<{
        itemCode: string
        itemName: string | null
        colorCode: string
        qty: number | null
      }>
    }>
  }>
}

type MatrixDualCandidate = ColorRuleMatrixCoverage['dualCandidates'][number] & {
  sourceColorCode: string
  baseItemCodes: string[]
}

type MatrixSkuOverrideDraft = {
  targetColorCode: string
  reason: string
}

type ReferenceSemanticScopeAssignment = {
  lineId: string
  lineKind: 'fixed' | 'material_group'
  baseItemCode: string | null
  scope: ReferenceProductApplicationScope
}

type AppliedMatrixColorConfig = {
  unicolorColorCode: string
  hybridCases: MatrixDualCandidate[]
}

type AnalysisProgress = {
  stage: string
  message: string
  current: number | null
  total: number | null
}

type AnalysisStreamEvent =
  | { type: 'progress'; progress: AnalysisProgress }
  | { type: 'complete'; message: string; workspace: ReferenceImportWorkspace }
  | { type: 'error'; message: string }

type MatrixVerificationEvent =
  | { type: 'progress'; progress: AnalysisProgress }
  | { type: 'complete'; message: string; success: boolean; results: ColorRuleMatrixCoverage[] }
  | { type: 'error'; message: string }

type BoardMatrixVerificationEvent =
  | { type: 'progress'; progress: AnalysisProgress }
  | { type: 'complete'; message: string; success: boolean; results: BoardMatrixCatalogResult[] }
  | { type: 'error'; message: string }

function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [startedAt])
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))
}

function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min ${seconds % 60} s`
}

function formatMatrixQuantity(value: number | null): string {
  if (value === null) return '-'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(value)
}

function normalizedMatrixColorCode(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? ''
}

function isMatrixColorCode(value: string): boolean {
  return /^[A-Z0-9]{4}$/.test(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(item => asString(item) ?? []) : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function statusLabel(status: string): string {
  if (status === 'needs_review') return 'En revisión'
  if (status === 'published') return 'Publicada'
  if (status === 'draft') return 'Borrador'
  if (status === 'captured') return 'Leída en SAP'
  if (status === 'accepted') return 'Aceptada'
  if (status === 'resolved') return 'Resuelto'
  if (status === 'failed') return 'Sin lectura SAP'
  return 'Pendiente'
}

function statusClass(status: string): string {
  if (status === 'published' || status === 'captured' || status === 'accepted' || status === 'resolved') return 'bg-emerald-50 text-emerald-800'
  if (status === 'failed' || status === 'rejected') return 'bg-rose-50 text-rose-800'
  return 'bg-amber-50 text-amber-800'
}

function severityClass(severity: ReferenceImportFinding['severity']): string {
  if (severity === 'blocker') return 'border-rose-200 bg-rose-50 text-rose-900'
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-sky-200 bg-sky-50 text-sky-900'
}

function findingTitle(finding: ReferenceImportFinding): string {
  const labels: Record<string, string> = {
    color_pattern_classification: 'Color de material sin regla definida',
    color_rule_proposal: 'Regla global de color propuesta',
    material_group_confirmation: 'Una posición lógica de material',
    material_profile_proposal: 'Perfil de material por registrar',
    material_consumption_conflict: 'Consumo contradictorio',
    bom_line_review: 'Diferencia que no se resolverá sola',
    issue_method_review: 'Metodo de salida por homologar',
    color_mapping_already_matches: 'Regla global ya coincide',
    color_variation_without_pattern: 'La pieza cambia según el color',
    color_scope_target_conflict: 'Conflicto de alcance de color',
    line_presence_conflict: 'Pieza presente solo en algunos colores',
    line_quantity_conflict: 'Cantidad distinta según el color',
    line_warehouse_conflict: 'Bodega distinta entre SKU',
    line_visible_order_variation: 'Orden visible distinto',
    line_issue_method_variation: 'Método de emisión distinto',
    component_tree_cycle: 'Ciclo de subestructura',
    component_tree_max_depth: 'Límite de profundidad alcanzado',
    component_tree_node_limit: 'Límite de nodos alcanzado',
    component_tree_read_failed: 'Subestructura no disponible',
    component_uom_missing: 'Unidad de medida pendiente',
    sap_bom_unavailable: 'LdM SAP no disponible',
    sap_reference_sku_not_registered: 'Color activo en SAP no registrado en la app',
  }
  return labels[finding.findingType] ?? finding.findingType.replaceAll('_', ' ')
}

function requiresColorConfirmation(finding: ReferenceImportFinding): boolean {
  return finding.findingType === 'color_rule_proposal'
    && Boolean(finding.proposedScope && finding.proposedColorCode && asString(finding.detailsJson.source_color_code))
}

function parseAnalysisStreamEvent(value: string): AnalysisStreamEvent | null {
  try {
    const event = asRecord(JSON.parse(value) as unknown)
    const type = asString(event.type)
    if (type === 'progress') {
      const progress = asRecord(event.progress)
      const message = asString(progress.message)
      if (!message) return null
      return {
        type,
        progress: {
          stage: asString(progress.stage) ?? 'analysis',
          message,
          current: asNumber(progress.current),
          total: asNumber(progress.total),
        },
      }
    }
    if (type === 'complete' && asString(event.message) && Object.keys(asRecord(event.workspace)).length > 0) {
      return { type, message: asString(event.message)!, workspace: event.workspace as ReferenceImportWorkspace }
    }
    if (type === 'error' && asString(event.message)) return { type, message: asString(event.message)! }
  } catch {
    return null
  }
  return null
}

function parseMatrixVerificationEvent(value: string): MatrixVerificationEvent | null {
  try {
    const event = asRecord(JSON.parse(value) as unknown)
    const type = asString(event.type)
    if (type === 'progress') {
      const progress = asRecord(event.progress)
      const message = asString(progress.message)
      if (!message) return null
      return {
        type,
        progress: {
          stage: asString(progress.stage) ?? 'matrix',
          message,
          current: asNumber(progress.current),
          total: asNumber(progress.total),
        },
      }
    }
    if (type === 'complete' && asString(event.message) && Array.isArray(event.results)) {
      return {
        type,
        message: asString(event.message)!,
        success: event.success === true,
        results: event.results as ColorRuleMatrixCoverage[],
      }
    }
    if (type === 'error' && asString(event.message)) return { type, message: asString(event.message)! }
  } catch {
    return null
  }
  return null
}

function parseBoardMatrixVerificationEvent(value: string): BoardMatrixVerificationEvent | null {
  try {
    const event = asRecord(JSON.parse(value) as unknown)
    const type = asString(event.type)
    if (type === 'progress') {
      const progress = asRecord(event.progress)
      const message = asString(progress.message)
      if (!message) return null
      return { type, progress: { stage: asString(progress.stage) ?? 'board_matrix', message, current: asNumber(progress.current), total: asNumber(progress.total) } }
    }
    if (type === 'complete' && asString(event.message) && Array.isArray(event.results)) {
      return { type, message: asString(event.message)!, success: event.success === true, results: event.results as BoardMatrixCatalogResult[] }
    }
    if (type === 'error' && asString(event.message)) return { type, message: asString(event.message)! }
  } catch {
    return null
  }
  return null
}

async function boardMatrixStartFailure(response: Response): Promise<Error> {
  const fallback = `No se pudo iniciar el análisis de tableros (HTTP ${response.status}).`
  try {
    const payload = asRecord(JSON.parse(await response.text()) as unknown)
    const message = asString(payload.message) ?? asString(payload.error)
    return new Error(message ? `${fallback} ${message}` : fallback)
  } catch {
    return new Error(fallback)
  }
}

function salesReferenceCode(familyCode: string | null, referenceCode: string | null): string {
  const normalizedFamilyCode = familyCode?.trim().toUpperCase() ?? ''
  const salesFamilyCode = normalizedFamilyCode && !normalizedFamilyCode.startsWith('V')
    ? `V${normalizedFamilyCode}`
    : normalizedFamilyCode

  return [salesFamilyCode, referenceCode].filter(Boolean).join('-')
}

function referenceCodeFromSku(skuComplete: string): string {
  const parts = skuComplete.split('-')
  return salesReferenceCode(parts[0] ?? null, parts[1] ?? null)
}

function severityLabel(severity: ReferenceImportFinding['severity']): string {
  if (severity === 'blocker') return 'Bloqueo'
  if (severity === 'warning') return 'Advertencia'
  return 'Informacion'
}

function scopeLabel(scope: string | null): string {
  const labels: Record<string, string> = {
    NA: 'No aplica color',
    full_product: 'Color principal del producto',
    drawer_bottom: 'Fondo de cajón',
    edge_band_body: 'Canto de estructura',
    edge_band_full_product: 'Canto producto completo',
    structure: 'Estructura',
    front: 'Frente',
    inner_structure: 'Estructura interna',
    edge_band_front: 'Canto de frentes',
    edge_band_inner: 'Canto interior',
    edge_band_drawer_bottom: 'Canto de fondo de cajón',
  }
  return scope ? labels[scope] ?? scope : 'Pendiente de definir'
}

function findingDescription(finding: ReferenceImportFinding): string | null {
  if (finding.findingType === 'material_group_confirmation') {
    const alternatives = affectedBaseItemCodes(finding)
    return alternatives.length > 1
      ? `SAP usa ${alternatives.join(' o ')} según el color. Confírmalas como una sola posición lógica; esto no modifica SAP ni inventa consumos.`
      : 'SAP usa alternativas de material según el color. Confírmalas como una sola posición lógica; esto no modifica SAP ni inventa consumos.'
  }

  if (finding.findingType === 'material_profile_proposal') {
    const color = asString(finding.detailsJson.source_color_code)
    const profile = asString(finding.detailsJson.material_profile)
    return color && profile && finding.proposedScope
      ? `En el color ${color}, SAP evidencia el perfil ${profile} para ${scopeLabel(finding.proposedScope)}. Regístralo para que la alternativa correcta se resuelva automáticamente.`
      : 'SAP evidencia un perfil de material que debe registrarse para resolver la alternativa correcta.'
  }

  if (finding.findingType === 'material_consumption_conflict') {
    return 'Para el mismo perfil y formato, SAP reporta cantidades diferentes. Define el consumo que corresponde antes de usar esta posición en una resolución de SKU.'
  }

  if (finding.findingType === 'bom_line_review') {
    const absentSkus = asStringArray(finding.detailsJson.absent_skus)
    if (absentSkus.length > 0) {
      return `La pieza no está presente en todos los colores analizados (${absentSkus.join(', ')} no la incluye). Confirma si es una diferencia real o corrige SAP.`
    }
    if (finding.detailsJson.configured_color_mapping_recognized !== true) {
      return 'SAP cambia esta pieza por color, pero no hay una regla de color que explique el cambio. Define la regla u override adecuado, o corrige SAP.'
    }
    return 'SAP muestra una diferencia de cantidad o bodega que la BOM base no puede asumir automáticamente. Define la excepción o corrige SAP.'
  }

  if (finding.findingType === 'issue_method_review') {
    const proposed = asString(finding.detailsJson.proposed_issue_method)
    return proposed
      ? `SAP no usa el mismo método de salida en todos los SKU. La propuesta es ${proposed === 'im_Backflush' ? 'bajo notificación' : 'manual'}; revísala primero en dry-run.`
      : 'SAP no usa el mismo método de salida y no hay mayoría para proponer uno. Revísalo antes de hacer cambios en SAP.'
  }

  const message = asString(finding.detailsJson.message)
  if (message) return message
  const sourceColorCode = asString(finding.detailsJson.source_color_code)
  const targetColorCode = asString(finding.detailsJson.target_color_code)
  if (finding.findingType === 'color_rule_proposal' && sourceColorCode && targetColorCode && finding.proposedScope) {
    return `Para el color ${sourceColorCode}, SAP usa ${targetColorCode} como ${scopeLabel(finding.proposedScope)}.`
  }

  if (finding.findingType === 'color_variation_without_pattern') {
    return 'Esta pieza cambia entre colores y todavía no hay una sustitución de material o una regla de color que explique el cambio.'
  }

  if (finding.findingType === 'line_presence_conflict') {
    return 'Esta pieza aparece en algunos colores y no en otros. Hay que confirmar si es una diferencia real del producto o un dato que debe corregirse en SAP.'
  }

  if (finding.findingType === 'line_quantity_conflict') {
    return 'La cantidad de esta pieza cambia según el color. La BOM base no puede publicarse hasta modelar la cantidad específica por color o perfil de material.'
  }

  if (finding.findingType === 'color_pattern_classification') {
    return 'SAP no muestra una relación directa entre el color del producto y el color de esta pieza. Requiere una regla explícita antes de resolverla automáticamente.'
  }

  if (finding.findingType === 'sap_reference_sku_not_registered') {
    return 'SAP tiene este color activo, pero la app todavía no lo reconoce como SKU activo de la referencia.'
  }

  const reason = asString(finding.detailsJson.reason)
  if (reason) return reason
  const itemCode = asString(finding.detailsJson.item_code)
  if (itemCode) return itemCode
  return finding.lineIdentity ?? finding.baseItemCode
}

function colorAssignmentEvidence(finding: ReferenceImportFinding): Array<{ productColor: string; materialColor: string }> {
  const bySku = Array.isArray(finding.detailsJson.by_sku) ? finding.detailsJson.by_sku : []
  if (bySku.length > 0) {
    return bySku.flatMap((item) => {
      const row = asRecord(item)
      const productColor = asString(row.sku_color_code)
      const materialColor = asString(row.material_color) ?? asString(row.variant_code_4)
      return productColor && materialColor && materialColor !== '0000' && productColor !== materialColor
        ? [{ productColor, materialColor }]
        : []
    })
  }
  const skuVariantMap = asRecord(finding.detailsJson.sku_variant_map)
  return Object.entries(skuVariantMap).flatMap(([skuComplete, variant]) => {
    const materialColor = asString(variant)
    const productColor = skuComplete.split('-')[3]
    return productColor && materialColor && materialColor !== '0000' && productColor !== materialColor
      ? [{ productColor, materialColor }]
      : []
  })
}

function boardRoleLabel(row: BoardMatrixRow): string {
  if (row.role === 'full_product' && !row.isProductColorMatch) return 'Tablero de producto completo (color interno)'
  return row.role === 'role_pending' ? 'Pendiente de definir' : scopeLabel(row.role)
}

function boardMatrixStatusLabel(status: BoardMatrixRow['status']): string {
  const labels: Record<BoardMatrixRow['status'], string> = {
    matches: 'Coincide',
    unicolor_candidate: 'Unicolor candidato',
    color_override_candidate: 'Color interno por validar',
    profile_override_candidate: 'Perfil SAP distinto por validar',
    dual_candidate: 'Dual candidato',
    variation_by_design: 'Variación por diseño',
    role_pending: 'Rol pendiente',
    profile_pending: 'Perfil pendiente',
    conflict_real: 'Conflicto real',
    sap_invalid: 'SKU inválido',
    sap_bom_missing: 'Sin LdM',
  }
  return labels[status]
}

type BoardCoverageReport = {
  key: string
  role: BoardMatrixRow['role']
  evidenceSkuCount: number
  evidenceSkuCompletes: string[]
  observedColorCodes: string[]
  observedMaterialProfiles: string[]
  profileSummaries: BoardProfileEvidenceSummary[]
  examples: BoardEvidenceExample[]
  kind: 'profile_candidate' | 'color_candidate' | 'conditional_configured' | 'consistent' | 'incomplete' | 'variation' | 'role_pending' | 'dual_evidence'
  conclusion: string
}

function boardCoverageReports(input: {
  result: BoardMatrixCatalogResult
  referenceRows: BoardMatrixRow[]
}): BoardCoverageReport[] {
  return input.result.rows.map(coverageRow => {
    const evidenceSkuCompletes = [...new Set(coverageRow.evidence.map(item => item.skuComplete))]
    const evidenceSkuCount = evidenceSkuCompletes.length
    const profileSummaries = summarizeBoardProfileEvidence(coverageRow.evidence)
    const examples = summarizeBoardEvidenceExamples(coverageRow.evidence)
    const completeReadCoverage = input.result.checkedSkuCount > 0
      && evidenceSkuCount === input.result.checkedSkuCount
      && input.result.sapReadErrors.length === 0
    const hasSingleSapPattern = coverageRow.observedColorCodes.length === 1
      && coverageRow.observedMaterialProfiles.length === 1
    const referenceRow = input.referenceRows.find(row =>
      row.sourceColorCode === coverageRow.sourceColorCode
      && row.role === coverageRow.role
    )
    const hasSameObservedProfile = referenceRow?.observedMaterialProfiles.length === 1
      && referenceRow.observedMaterialProfiles[0] === coverageRow.observedMaterialProfiles[0]
    const hasSameObservedColor = referenceRow?.observedColorCodes.length === 1
      && referenceRow.observedColorCodes[0] === coverageRow.observedColorCodes[0]
    const observedDescription = `tablero ${coverageRow.observedColorCodes.join(', ') || 'pendiente'} y perfil ${coverageRow.observedMaterialProfiles.join(', ') || 'pendiente'}`
    const configuredColorMatchesSap = coverageRow.proposedColorCode !== null
      && coverageRow.observedColorCodes.length === 1
      && coverageRow.proposedColorCode === coverageRow.observedColorCodes[0]
    const configuredProfileMatchesSap = coverageRow.proposedMaterialProfile !== null
      && coverageRow.observedMaterialProfiles.length === 1
      && coverageRow.proposedMaterialProfile === coverageRow.observedMaterialProfiles[0]
    const configuredRuleMatchesSap = configuredColorMatchesSap && configuredProfileMatchesSap
    const isDualRoleEvidence = (coverageRow.role === 'structure' || coverageRow.role === 'front')
      && input.result.dualCandidates.some(candidate => {
        const candidateSkus = new Set(candidate.cases.map(candidateCase => candidateCase.skuComplete))
        return evidenceSkuCompletes.length > 0 && evidenceSkuCompletes.every(skuComplete => candidateSkus.has(skuComplete))
      })

    if (coverageRow.role === 'full_product' && input.result.boardProfileConditions.length > 0) {
      return {
        key: coverageRow.key,
        role: coverageRow.role,
        evidenceSkuCount,
        evidenceSkuCompletes,
        observedColorCodes: coverageRow.observedColorCodes,
        observedMaterialProfiles: coverageRow.observedMaterialProfiles,
        profileSummaries,
        examples,
        kind: 'conditional_configured',
        conclusion: input.result.dualCandidates.length > 0
          ? 'La decisión unicolor por perfil ya está guardada. Aún quedan casos Dual pendientes de decidir abajo; por eso el color sigue contado en contraste.'
          : 'La decisión por perfil ya está guardada para este color. Esta evidencia SAP queda como respaldo de la configuración, no como una excepción pendiente.',
      }
    }

    if (coverageRow.role === 'role_pending') {
      return {
        key: coverageRow.key,
        role: coverageRow.role,
        evidenceSkuCount,
        evidenceSkuCompletes,
        observedColorCodes: coverageRow.observedColorCodes,
        observedMaterialProfiles: coverageRow.observedMaterialProfiles,
        profileSummaries,
        examples,
        kind: 'role_pending',
        conclusion: 'SAP aporta materiales, pero no un rol lógico suficiente. No se propone ninguna regla hasta asignar el rol humano.',
      }
    }
    if (isDualRoleEvidence) {
      return {
        key: coverageRow.key,
        role: coverageRow.role,
        evidenceSkuCount,
        evidenceSkuCompletes,
        observedColorCodes: coverageRow.observedColorCodes,
        observedMaterialProfiles: coverageRow.observedMaterialProfiles,
        profileSummaries,
        examples,
        kind: 'dual_evidence',
        conclusion: `Estos ${evidenceSkuCount} SKU pertenecen a un caso Dual detectado abajo. Los SKU unicolor no usan el rol ${scopeLabel(coverageRow.role)} y no se cuentan como evidencia faltante.`,
      }
    }
    if (!completeReadCoverage) {
      return {
        key: coverageRow.key,
        role: coverageRow.role,
        evidenceSkuCount,
        evidenceSkuCompletes,
        observedColorCodes: coverageRow.observedColorCodes,
        observedMaterialProfiles: coverageRow.observedMaterialProfiles,
        profileSummaries,
        examples,
        kind: 'incomplete',
        conclusion: `La evidencia cubre ${evidenceSkuCount}/${input.result.checkedSkuCount} SKU con LdM leída. No alcanza para sostener una regla para este color.`,
      }
    }
    if (!hasSingleSapPattern) {
      return {
        key: coverageRow.key,
        role: coverageRow.role,
        evidenceSkuCount,
        evidenceSkuCompletes,
        observedColorCodes: coverageRow.observedColorCodes,
        observedMaterialProfiles: coverageRow.observedMaterialProfiles,
        profileSummaries,
        examples,
        kind: 'variation',
        conclusion: `Los ${evidenceSkuCount}/${input.result.checkedSkuCount} SKU leídos no presentan un único patrón: ${observedDescription}. Requiere una decisión por SKU o diseño; no se promueve una regla general.`,
      }
    }
    if (configuredRuleMatchesSap) {
      return {
        key: coverageRow.key,
        role: coverageRow.role,
        evidenceSkuCount,
        evidenceSkuCompletes,
        observedColorCodes: coverageRow.observedColorCodes,
        observedMaterialProfiles: coverageRow.observedMaterialProfiles,
        profileSummaries,
        examples,
        kind: 'consistent',
        conclusion: `SAP es uniforme: ${evidenceSkuCount}/${input.result.checkedSkuCount} SKU muestran ${observedDescription}. La regla actual del color ya coincide con esta evidencia.`,
      }
    }
    if (referenceRow?.profileIsReferenceException && hasSameObservedProfile) {
      return {
        key: coverageRow.key,
        role: coverageRow.role,
        evidenceSkuCount,
        evidenceSkuCompletes,
        observedColorCodes: coverageRow.observedColorCodes,
        observedMaterialProfiles: coverageRow.observedMaterialProfiles,
        profileSummaries,
        examples,
        kind: 'profile_candidate',
        conclusion: input.result.fullProductRuleCandidate && coverageRow.role === 'full_product'
          ? `SAP es uniforme: ${evidenceSkuCount}/${input.result.checkedSkuCount} SKU muestran ${observedDescription}. En la referencia seleccionada el patrón es ${referenceRow.referenceMaterialProfile ?? 'pendiente'}; la cobertura completa permite configurar una regla global por color desde esta matriz.`
          : `SAP es uniforme: ${evidenceSkuCount}/${input.result.checkedSkuCount} SKU muestran ${observedDescription}. En la referencia seleccionada el patrón es ${referenceRow.referenceMaterialProfile ?? 'pendiente'}; requiere decidir si la excepción aplica por color, referencia o SKU.`,
      }
    }
    if (referenceRow && !referenceRow.isProductColorMatch && hasSameObservedColor) {
      return {
        key: coverageRow.key,
        role: coverageRow.role,
        evidenceSkuCount,
        evidenceSkuCompletes,
        observedColorCodes: coverageRow.observedColorCodes,
        observedMaterialProfiles: coverageRow.observedMaterialProfiles,
        profileSummaries,
        examples,
        kind: 'color_candidate',
        conclusion: input.result.fullProductRuleCandidate && coverageRow.role === 'full_product'
          ? `SAP es uniforme: ${evidenceSkuCount}/${input.result.checkedSkuCount} SKU muestran ${observedDescription}. La cobertura completa permite configurar el color interno global desde esta matriz.`
          : `SAP es uniforme: ${evidenceSkuCount}/${input.result.checkedSkuCount} SKU muestran ${observedDescription}. Requiere decidir si el color interno aplica por color, referencia o SKU.`,
      }
    }
    return {
      key: coverageRow.key,
      role: coverageRow.role,
      evidenceSkuCount,
      evidenceSkuCompletes,
      observedColorCodes: coverageRow.observedColorCodes,
      observedMaterialProfiles: coverageRow.observedMaterialProfiles,
      profileSummaries,
      examples,
      kind: 'consistent',
      conclusion: `SAP es uniforme: ${evidenceSkuCount}/${input.result.checkedSkuCount} SKU muestran ${observedDescription}. No aparece una excepción para proponer en la referencia seleccionada.`,
    }
  })
}

function boardConditionalStrategiesForCoverage(input: {
  result: BoardMatrixCatalogResult
  referenceRows: BoardMatrixRow[]
}): BoardMatrixConditionalStrategy[] {
  if (input.result.boardProfileConditions.length > 0) return []
  if (input.result.conditionalRuleStrategies.length > 0) return input.result.conditionalRuleStrategies
  const selectedReferenceProfile = input.referenceRows.find(row =>
    row.sourceColorCode === input.result.sourceColorCode
    && row.role === 'full_product'
  )?.referenceMaterialProfile ?? null
  return deriveBoardConditionalRuleStrategies({
    sourceColorCode: input.result.sourceColorCode,
    evidence: input.result.rows.flatMap(row => row.evidence),
    referenceMaterialProfileHint: selectedReferenceProfile,
  })
}

function boardCoverageReportLabel(kind: BoardCoverageReport['kind']): string {
  const labels: Record<BoardCoverageReport['kind'], string> = {
    profile_candidate: 'Evidencia para excepción de perfil',
    color_candidate: 'Evidencia para color interno',
    conditional_configured: 'Decisión guardada',
    consistent: 'Sin excepción detectada',
    incomplete: 'Evidencia incompleta',
    variation: 'No hay patrón único',
    role_pending: 'Rol pendiente',
    dual_evidence: 'Evidencia del caso Dual',
  }
  return labels[kind]
}

function boardCoverageReportClass(kind: BoardCoverageReport['kind']): string {
  if (kind === 'consistent' || kind === 'conditional_configured') return 'border-emerald-200 bg-emerald-50 text-emerald-950'
  if (kind === 'incomplete') return 'border-rose-200 bg-rose-50 text-rose-950'
  if (kind === 'dual_evidence') return 'border-violet-200 bg-violet-50 text-violet-950'
  if (kind === 'profile_candidate' || kind === 'color_candidate') return 'border-amber-200 bg-amber-50 text-amber-950'
  return 'border-slate-200 bg-slate-50 text-slate-900'
}

function boardCatalogIssueLabel(reason: BoardMatrixCatalogResult['invalidSkus'][number]['reason']): string {
  const labels: Record<BoardMatrixCatalogResult['invalidSkus'][number]['reason'], string> = {
    sap_invalid: 'Activo en Supabase, pero inactivo o congelado en SAP',
    sap_missing: 'Activo en Supabase, pero no existe en SAP',
    bom_missing: 'Activo en SAP, pero sin LdM legible',
    sap_only: 'Activo en SAP, pero no registrado en Supabase',
    supabase_inactive: 'Activo en SAP, pero inactivo en Supabase',
    supabase_kit: 'Activo en SAP, pero catalogado como kit en Supabase',
  }
  return labels[reason]
}

function hasBoardEvidence(finding: ReferenceImportFinding): boolean {
  const evidence = Array.isArray(finding.detailsJson.by_sku) ? finding.detailsJson.by_sku : []
  return evidence.some(item => asString(asRecord(asRecord(item).technical_metadata).material_kind) === 'board')
}

function matrixMaterialKinds(findings: ReferenceImportFinding[]): Array<'board' | 'edge_band' | 'other'> {
  const kinds = new Set<'board' | 'edge_band' | 'other'>()
  for (const finding of findings) {
    const evidence = Array.isArray(finding.detailsJson.by_sku) ? finding.detailsJson.by_sku : []
    for (const item of evidence) {
      const materialKind = asString(asRecord(asRecord(item).technical_metadata).material_kind)
      if (materialKind === 'board' || materialKind === 'edge_band' || materialKind === 'other') kinds.add(materialKind)
    }
  }
  return [...kinds].sort()
}

function colorConfigurationScope(finding: ReferenceImportFinding): ColorApplicationScope | null {
  return finding.proposedScope && finding.proposedScope !== 'NA'
    ? finding.proposedScope as ColorApplicationScope
    : null
}

function boardMaterialProfileScope(finding: ReferenceImportFinding): BoardMaterialProfileScope | null {
  const scope = colorConfigurationScope(finding)
  return scope && BOARD_MATERIAL_PROFILE_SCOPE_KEYS.includes(scope as BoardMaterialProfileScope)
    ? scope as BoardMaterialProfileScope
    : null
}

function issueMethodDifferences(finding: ReferenceImportFinding, targetIssueMethod: string): Array<{ skuComplete: string; colorCode: string | null; childNum: number | null; itemCode: string; itemName: string | null }> {
  const evidence = Array.isArray(finding.detailsJson.by_sku) ? finding.detailsJson.by_sku : []
  return evidence.flatMap(item => {
    const row = asRecord(item)
    if (asString(row.issue_method) === targetIssueMethod) return []
    const skuComplete = asString(row.sku_complete)
    const itemCode = asString(row.item_code)
    if (!skuComplete || !itemCode) return []
    return [{
      skuComplete,
      colorCode: asString(row.sku_color_code),
      childNum: asNumber(row.sap_child_num),
      itemCode,
      itemName: asString(row.item_name),
    }]
  })
}

function colorRuleMatrixRows(findings: ReferenceImportFinding[]): ColorRuleMatrixRow[] {
  const grouped = new Map<string, {
    sourceColorCode: string
    scope: string
    targets: Map<string, ReferenceImportFinding[]>
  }>()
  for (const finding of findings) {
    if (finding.findingType !== 'color_rule_proposal' || finding.status !== 'open' || !finding.proposedScope || !finding.proposedColorCode) continue
    const sourceColorCode = asString(finding.detailsJson.source_color_code)
    if (!sourceColorCode) continue
    const key = `${sourceColorCode}:${finding.proposedScope}`
    const group = grouped.get(key) ?? { sourceColorCode, scope: finding.proposedScope, targets: new Map<string, ReferenceImportFinding[]>() }
    const targetFindings = group.targets.get(finding.proposedColorCode) ?? []
    targetFindings.push(finding)
    group.targets.set(finding.proposedColorCode, targetFindings)
    grouped.set(key, group)
  }
  return [...grouped.entries()].map(([key, group]) => {
    const targets = [...group.targets.keys()].sort()
    const allFindings = [...group.targets.values()].flat()
    return {
      key,
      sourceColorCode: group.sourceColorCode,
      scope: group.scope,
      suggestedTargetColorCode: targets.length === 1 ? targets[0] : null,
      findingIds: allFindings.map(finding => finding.id),
      baseItemCodes: [...new Set(allFindings.flatMap(finding => finding.baseItemCode ? [finding.baseItemCode] : []))].sort(),
      materialKinds: matrixMaterialKinds(allFindings),
      conflictingTargetColorCodes: targets.length > 1 ? targets : [],
      dualEvidence: null,
    }
  }).sort((left, right) => left.sourceColorCode.localeCompare(right.sourceColorCode) || left.scope.localeCompare(right.scope))
}

function matrixDualCandidateKey(candidate: MatrixDualCandidate): string {
  return [candidate.sourceColorCode, candidate.structureColorCode, candidate.frontColorCode]
    .map(normalizedMatrixColorCode)
    .join(':')
}

function matrixDualCandidateOverrideKey(candidate: MatrixDualCandidate): string {
  return [
    matrixDualCandidateKey(candidate),
    ...candidate.cases.map(candidateCase => candidateCase.skuComplete.trim().toUpperCase()).sort(),
  ].join('|')
}

function isMatrixDualCandidateSelected(
  selectedCandidates: Record<string, MatrixDualCandidate>,
  candidate: MatrixDualCandidate
): boolean {
  const selected = selectedCandidates[candidate.sourceColorCode]
  return Boolean(selected && matrixDualCandidateKey(selected) === matrixDualCandidateKey(candidate))
}

function boardDualCandidateKey(candidate: BoardDualCandidateWithColor): string {
  return [
    candidate.sourceColorCode,
    candidate.structureColorCode,
    candidate.structureMaterialProfile,
    candidate.frontColorCode,
    candidate.frontMaterialProfile,
  ].map(normalizedMatrixColorCode).join(':')
}

function boardDualCandidateOverrideKey(candidate: BoardDualCandidateWithColor): string {
  return [
    boardDualCandidateKey(candidate),
    ...candidate.cases.map(candidateCase => candidateCase.skuComplete.trim().toUpperCase()).sort(),
  ].join('|')
}

function boardDualConfigurationMatchesCandidate(
  configuration: BoardMatrixDualConfiguration | null,
  candidate: BoardDualCandidateWithColor
): boolean {
  return configuration?.structureColorCode === candidate.structureColorCode
    && configuration.structureMaterialProfile === candidate.structureMaterialProfile
    && configuration.frontColorCode === candidate.frontColorCode
    && configuration.frontMaterialProfile === candidate.frontMaterialProfile
}

function boardDualSkuOverrideMatchesCandidate(
  override: BoardMatrixPersistedDualSkuOverride,
  candidate: BoardDualCandidateWithColor
): boolean {
  const overrideSkus = [...override.skuCompletes].map(sku => sku.trim().toUpperCase()).sort()
  const candidateSkus = candidate.cases.map(candidateCase => candidateCase.skuComplete.trim().toUpperCase()).sort()
  return override.structureColorCode === candidate.structureColorCode
    && override.structureMaterialProfile === candidate.structureMaterialProfile
    && override.frontColorCode === candidate.frontColorCode
    && override.frontMaterialProfile === candidate.frontMaterialProfile
    && overrideSkus.length === candidateSkus.length
    && overrideSkus.every((sku, index) => sku === candidateSkus[index])
}

function boardColorIsReadyForBaseConstruction(result: BoardMatrixCatalogResult): boolean {
  if (result.sapReadErrors.length > 0 || result.boardProfileConditions.length === 0) return false
  const candidates = result.dualCandidates.map(candidate => ({ ...candidate, sourceColorCode: result.sourceColorCode }))
  const resolvedCandidates = candidates.filter(candidate =>
    boardDualConfigurationMatchesCandidate(result.boardDualConfiguration, candidate)
    || result.boardDualSkuOverrides.some(override => boardDualSkuOverrideMatchesCandidate(override, candidate))
  )
  if (resolvedCandidates.length !== candidates.length) return false

  const resolvedDualSkuCompletes = new Set(resolvedCandidates.flatMap(candidate => candidate.cases.map(candidateCase => candidateCase.skuComplete)))
  return result.rows.every(row => {
    if (row.role === 'full_product') return true
    const evidenceSkuCompletes = new Set(row.evidence.map(item => item.skuComplete))
    return evidenceSkuCompletes.size > 0 && [...evidenceSkuCompletes].every(skuComplete => resolvedDualSkuCompletes.has(skuComplete))
  })
}

function matrixMismatchKey(input: {
  sourceColorCode: string
  scope: string
  mismatch: ColorRuleMatrixCoverage['mismatches'][number]
}): string {
  return [
    input.sourceColorCode,
    input.scope,
    input.mismatch.skuComplete,
    input.mismatch.itemCode ?? input.mismatch.baseItemCode,
    input.mismatch.observedColorCode ?? 'none',
  ].join(':')
}

function referenceScopeOptions(input: {
  currentScope: ReferenceProductApplicationScope
  itemName: string | null | undefined
  itemNames?: Array<string | null | undefined>
}): ReferenceProductApplicationScope[] {
  const normalizedNames = [input.itemName, ...(input.itemNames ?? [])]
    .map(itemName => itemName?.toUpperCase() ?? '')
    .join(' ')
  const isEdgeBand = input.currentScope.startsWith('edge_band_') || normalizedNames.includes('CANTO')
  if (isEdgeBand) {
    return ['edge_band_full_product', 'edge_band_body', 'edge_band_front', 'edge_band_inner', 'edge_band_drawer_bottom']
  }
  const isBoard = normalizedNames.includes('TABLERO')
    || (!isEdgeBand && ['structure', 'front', 'inner_structure', 'drawer_bottom'].includes(input.currentScope))
  return isBoard ? ['full_product', 'structure', 'front', 'inner_structure', 'drawer_bottom'] : []
}

function candidateIncludesSku(candidate: MatrixDualCandidate, skuComplete: string): boolean {
  const normalizedSkuComplete = skuComplete.trim().toUpperCase()
  return candidate.cases.some(candidateCase => candidateCase.skuComplete.trim().toUpperCase() === normalizedSkuComplete)
}

function selectedHybridCaseExplainsMismatch(input: {
  result: ColorRuleMatrixCoverage
  mismatch: ColorRuleMatrixCoverage['mismatches'][number]
  selectedHybridCases: Record<string, MatrixDualCandidate>
}): boolean {
  const observedColorCode = input.mismatch.observedColorCode
  if (input.mismatch.reason !== 'unexpected_color' || !observedColorCode) return false
  return Object.values(input.selectedHybridCases).some(candidate =>
    candidate.sourceColorCode === input.result.sourceColorCode
    && candidateIncludesSku(candidate, input.mismatch.skuComplete)
    && [candidate.structureColorCode, candidate.frontColorCode].includes(observedColorCode)
  )
}

function matrixFindingEvidence(finding: ReferenceImportFinding): Array<{
  skuComplete: string
  productColor: string
  materialColor: string
}> {
  const bySku = Array.isArray(finding.detailsJson.by_sku) ? finding.detailsJson.by_sku : []
  return bySku.flatMap(item => {
    const row = asRecord(item)
    const skuComplete = asString(row.sku_complete)
    const productColor = asString(row.sku_color_code)
    const materialColor = asString(row.material_color) ?? asString(row.variant_code_4)
    return skuComplete && productColor && materialColor && materialColor !== '0000'
      ? [{ skuComplete, productColor, materialColor }]
      : []
  })
}

function isMatrixColorConfigured(input: {
  config: AppliedMatrixColorConfig
  skuComplete: string
  materialColor: string
}): boolean {
  if (input.materialColor === input.config.unicolorColorCode) return true
  return input.config.hybridCases.some(candidate =>
    candidateIncludesSku(candidate, input.skuComplete)
    && [candidate.structureColorCode, candidate.frontColorCode].includes(input.materialColor)
  )
}

function findingIsLocallyResolvedByMatrix(
  finding: ReferenceImportFinding,
  appliedConfigs: Record<string, AppliedMatrixColorConfig>
): boolean {
  if (finding.findingType === 'color_rule_proposal') {
    const sourceColorCode = asString(finding.detailsJson.source_color_code)
    const targetColorCode = finding.proposedColorCode ?? asString(finding.detailsJson.target_color_code)
    const config = sourceColorCode ? appliedConfigs[sourceColorCode] : undefined
    return Boolean(config && targetColorCode && (
      targetColorCode === config.unicolorColorCode
      || config.hybridCases.some(candidate => [candidate.structureColorCode, candidate.frontColorCode].includes(targetColorCode))
    ))
  }
  if (finding.findingType !== 'bom_line_review' || asStringArray(finding.detailsJson.absent_skus).length > 0) return false
  const evidence = matrixFindingEvidence(finding)
  return evidence.length > 0 && evidence.every(item => {
    const config = appliedConfigs[item.productColor]
    return config ? isMatrixColorConfigured({ config, skuComplete: item.skuComplete, materialColor: item.materialColor }) : false
  })
}

function affectedBaseItemCodes(finding: ReferenceImportFinding): string[] {
  const fromAlternatives = Array.isArray(finding.detailsJson.alternatives)
    ? finding.detailsJson.alternatives.flatMap((alternative) => {
        const code = asString(asRecord(alternative).base_item_code)
        return code ? [code] : []
      })
    : []
  return [...new Set([...asStringArray(finding.detailsJson.base_item_codes), ...fromAlternatives])]
}

function requiresMaterialGroupConfirmation(finding: ReferenceImportFinding): boolean {
  if (finding.findingType !== 'material_group_confirmation') return false
  const codes = affectedBaseItemCodes(finding)
  return codes.length > 1
}

function requiresMaterialProfileConfirmation(finding: ReferenceImportFinding): boolean {
  if (finding.findingType !== 'material_profile_proposal' || !finding.proposedScope) return false
  const sourceColorCode = asString(finding.detailsJson.source_color_code)
  const materialProfile = asString(finding.detailsJson.material_profile)
  return Boolean(sourceColorCode && materialProfile)
}

export function ReferenceBomImportClient({ initialCandidates }: Props) {
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState(initialCandidates)
  const [selectedCandidate, setSelectedCandidate] = useState<ReferenceImportCandidate | null>(initialCandidates[0] ?? null)
  const [isReferencePickerOpen, setIsReferencePickerOpen] = useState(false)
  const [workspace, setWorkspace] = useState<ReferenceImportWorkspace | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmationChecks, setConfirmationChecks] = useState<Record<string, boolean>>({})
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, OverrideDraft>>({})
  const [issueMethodDraft, setIssueMethodDraft] = useState<IssueMethodDraft>({ targetIssueMethod: 'im_Manual', confirmed: false, result: null })
  const [overrideEditors, setOverrideEditors] = useState<Record<string, boolean>>({})
  const [colorEditor, setColorEditor] = useState<ColorEditorState | null>(null)
  const [selectedMatrixRules, setSelectedMatrixRules] = useState<Record<string, boolean>>({})
  const [matrixTargetColorEdits, setMatrixTargetColorEdits] = useState<Record<string, string>>({})
  const [selectedMatrixHybridCases, setSelectedMatrixHybridCases] = useState<Record<string, MatrixDualCandidate>>({})
  const [matrixDualAlternatives, setMatrixDualAlternatives] = useState<Record<string, MatrixDualCandidate[]>>({})
  const [locallyAppliedMatrixConfigs, setLocallyAppliedMatrixConfigs] = useState<Record<string, AppliedMatrixColorConfig>>({})
  const [matrixSkuOverrideEditors, setMatrixSkuOverrideEditors] = useState<Record<string, boolean>>({})
  const [matrixSkuOverrideDrafts, setMatrixSkuOverrideDrafts] = useState<Record<string, MatrixSkuOverrideDraft>>({})
  const [locallyAppliedMatrixSkuOverrides, setLocallyAppliedMatrixSkuOverrides] = useState<Record<string, boolean>>({})
  const [matrixCandidateOverrideReviewed, setMatrixCandidateOverrideReviewed] = useState<Record<string, boolean>>({})
  const [matrixCandidateOverrideProceedingKey, setMatrixCandidateOverrideProceedingKey] = useState<string | null>(null)
  const [locallyAppliedMatrixCandidateOverrides, setLocallyAppliedMatrixCandidateOverrides] = useState<Record<string, boolean>>({})
  const [isApplyingMatrixCandidateOverrides, setIsApplyingMatrixCandidateOverrides] = useState(false)
  const [matrixCandidateOverrideApplyingKey, setMatrixCandidateOverrideApplyingKey] = useState<string | null>(null)
  const [matrixCandidateOverrideStartedAt, setMatrixCandidateOverrideStartedAt] = useState<number | null>(null)
  const [referenceScopeAssignments, setReferenceScopeAssignments] = useState<Record<string, ReferenceSemanticScopeAssignment>>({})
  const [matrixRulesReviewed, setMatrixRulesReviewed] = useState(false)
  const [matrixRulesProceedingKey, setMatrixRulesProceedingKey] = useState<string | null>(null)
  const [isApplyingMatrixRules, setIsApplyingMatrixRules] = useState(false)
  const [matrixRulesStartedAt, setMatrixRulesStartedAt] = useState<number | null>(null)
  const [matrixCoverage, setMatrixCoverage] = useState<{ selectionKey: string; success: boolean; results: ColorRuleMatrixCoverage[] } | null>(null)
  const [matrixVerificationProgress, setMatrixVerificationProgress] = useState<AnalysisProgress | null>(null)
  const [matrixVerificationStartedAt, setMatrixVerificationStartedAt] = useState<number | null>(null)
  const [preparedSupabaseSyncSkus, setPreparedSupabaseSyncSkus] = useState<Record<string, boolean>>({})
  const [skuActionMessages, setSkuActionMessages] = useState<Record<string, string>>({})
  const [selectedMatrixAbsences, setSelectedMatrixAbsences] = useState<Record<string, boolean>>({})
  const [validatedMatrixAbsences, setValidatedMatrixAbsences] = useState<Record<string, boolean>>({})
  const [selectedMatrixSapSkus, setSelectedMatrixSapSkus] = useState<Record<string, boolean>>({})
  const [matrixAbsenceReviewed, setMatrixAbsenceReviewed] = useState(false)
  const [matrixAbsenceProceedingKey, setMatrixAbsenceProceedingKey] = useState<string | null>(null)
  const [isValidatingMatrixAbsences, setIsValidatingMatrixAbsences] = useState(false)
  const [matrixAbsenceStartedAt, setMatrixAbsenceStartedAt] = useState<number | null>(null)
  const [matrixSapDeactivationConfirmed, setMatrixSapDeactivationConfirmed] = useState(false)
  const [sapOnlyActionConfirmed, setSapOnlyActionConfirmed] = useState<Record<string, boolean>>({})
  const [sapOnlyActionMessages, setSapOnlyActionMessages] = useState<Record<string, string>>({})
  const [matrixBatchMessage, setMatrixBatchMessage] = useState<string | null>(null)
  const [selectedBoardColors, setSelectedBoardColors] = useState<Record<string, boolean>>({})
  const [boardMatrixCoverage, setBoardMatrixCoverage] = useState<BoardMatrixCatalogResult[] | null>(null)
  const [visibleBoardCoverageColorCodes, setVisibleBoardCoverageColorCodes] = useState<string[]>([])
  const [lastBoardMatrixAnalyzedColorCodes, setLastBoardMatrixAnalyzedColorCodes] = useState<string[]>([])
  const [ignoredBoardCatalogIssues, setIgnoredBoardCatalogIssues] = useState<Record<string, boolean>>({})
  const [boardMatrixVerificationProgress, setBoardMatrixVerificationProgress] = useState<AnalysisProgress | null>(null)
  const [boardMatrixVerificationStartedAt, setBoardMatrixVerificationStartedAt] = useState<number | null>(null)
  const boardMatrixAbortControllerRef = useRef<AbortController | null>(null)
  const [selectedBoardInactiveAppSkus, setSelectedBoardInactiveAppSkus] = useState<Record<string, boolean>>({})
  const [boardColorRuleEditor, setBoardColorRuleEditor] = useState<BoardColorRuleEditorState | null>(null)
  const [boardConditionalRuleEditor, setBoardConditionalRuleEditor] = useState<BoardConditionalRuleEditorState | null>(null)
  const [selectedBoardDualColorCases, setSelectedBoardDualColorCases] = useState<Record<string, BoardDualCandidateWithColor>>({})
  const [savedBoardDualColorResults, setSavedBoardDualColorResults] = useState<Record<string, BoardDualMutationResult>>({})
  const [boardDualCandidateDeviation, setBoardDualCandidateDeviation] = useState<Record<string, boolean>>({})
  const [boardDualCandidateOverrideReviewed, setBoardDualCandidateOverrideReviewed] = useState<Record<string, boolean>>({})
  const [boardDualCandidateOverrideApplyingKey, setBoardDualCandidateOverrideApplyingKey] = useState<string | null>(null)
  const [savedBoardDualSkuOverrideResults, setSavedBoardDualSkuOverrideResults] = useState<Record<string, BoardDualMutationResult>>({})
  const [boardMatrixMessage, setBoardMatrixMessage] = useState<string | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null)
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const analysisElapsedSeconds = useElapsedSeconds(analysisStartedAt)
  const matrixVerificationElapsedSeconds = useElapsedSeconds(matrixVerificationStartedAt)
  const matrixRulesElapsedSeconds = useElapsedSeconds(matrixRulesStartedAt)
  const matrixAbsenceElapsedSeconds = useElapsedSeconds(matrixAbsenceStartedAt)
  const matrixCandidateOverrideElapsedSeconds = useElapsedSeconds(matrixCandidateOverrideStartedAt)
  const boardMatrixVerificationElapsedSeconds = useElapsedSeconds(boardMatrixVerificationStartedAt)

  const boardMatrixRows = workspace?.boardMatrix ?? []
  const boardMatrixBaseItemCodes = new Set(boardMatrixRows.flatMap(row => row.baseItemCodes))
  const visibleFindings = (workspace?.findings ?? []).filter(finding =>
    !findingIsLocallyResolvedByMatrix(finding, locallyAppliedMatrixConfigs)
    && !(
      (finding.findingType === 'material_profile_proposal' || finding.findingType === 'material_consumption_conflict')
      && finding.baseItemCode !== null
      && boardMatrixBaseItemCodes.has(finding.baseItemCode)
    )
  )
  const unresolvedBlockers = visibleFindings.filter(finding => finding.severity === 'blocker' && finding.status === 'open')
  const capturedSnapshots = workspace?.snapshots.filter(snapshot => snapshot.status === 'captured') ?? []
  const failedSnapshots = workspace?.snapshots.filter(snapshot => snapshot.status === 'failed') ?? []
  const sapActiveSkuCount = asNumber(workspace?.run.summaryJson.sap_active_sku_count)
  const supabaseOnlyColors = asStringArray(workspace?.run.summaryJson.supabase_only_sku_colors)
  const sapOnlyColors = asStringArray(workspace?.run.summaryJson.sap_only_sku_colors)
  const sapOnlySkuCodes = asStringArray(workspace?.run.summaryJson.sap_only_sku_codes)
  const sapInactiveSkuCodes = asStringArray(workspace?.run.summaryJson.sap_inactive_sku_codes)
  const sapInactiveColors = asStringArray(workspace?.run.summaryJson.sap_inactive_sku_colors)
  const sapMissingSkuCodes = asStringArray(workspace?.run.summaryJson.sap_missing_sku_codes)
  const sapMissingColors = asStringArray(workspace?.run.summaryJson.sap_missing_sku_colors)
  const hasDetailedCatalogStatus = Array.isArray(workspace?.run.summaryJson.sap_inactive_sku_codes)
    || Array.isArray(workspace?.run.summaryJson.sap_missing_sku_codes)
  const genericSupabaseOnlyColors = hasDetailedCatalogStatus ? [] : supabaseOnlyColors
  const catalogBlockedColors = new Set([...sapInactiveColors, ...sapMissingColors, ...genericSupabaseOnlyColors])
  const bomReadFailureSnapshots = failedSnapshots.filter(snapshot => !snapshot.skuColorCode || !catalogBlockedColors.has(snapshot.skuColorCode))
  const hasIncompleteSapRead = bomReadFailureSnapshots.length > 0
  const canRetryOnlyPendingBomReads = hasIncompleteSapRead
    && capturedSnapshots.every(snapshot => Boolean(snapshot.transientData))
  const hasSapCatalogMismatch = sapInactiveSkuCodes.length > 0
    || sapMissingSkuCodes.length > 0
    || genericSupabaseOnlyColors.length > 0
    || sapOnlyColors.length > 0
  const hasIncompleteSource = hasIncompleteSapRead || hasSapCatalogMismatch
  const colorMatrixRows = colorRuleMatrixRows(visibleFindings)
  const selectedMatrixRuleCount = colorMatrixRows.filter(row => selectedMatrixRules[row.key]).length
  const selectedColorMatrixRows = colorMatrixRows.flatMap(row => {
    if (!selectedMatrixRules[row.key]) return []
    const targetColorCode = normalizedMatrixColorCode(matrixTargetColorEdits[row.key] ?? row.suggestedTargetColorCode)
    return isMatrixColorCode(targetColorCode) ? [{ ...row, suggestedTargetColorCode: targetColorCode }] : []
  })
  const hasInvalidSelectedMatrixTarget = selectedMatrixRuleCount !== selectedColorMatrixRows.length
  const matrixVerificationKey = selectedColorMatrixRows.map(row => `${row.key}:${row.suggestedTargetColorCode}`).sort().join('|')
  const selectedMatrixHybridCaseList = Object.values(selectedMatrixHybridCases)
    .filter(candidate => selectedColorMatrixRows.some(row => row.sourceColorCode === candidate.sourceColorCode))
  const selectedMatrixHybridCaseKey = selectedMatrixHybridCaseList
    .map(matrixDualCandidateKey)
    .sort()
    .join('|')
  const matrixApplicationKey = `${matrixVerificationKey}|${selectedMatrixHybridCaseKey}`
  const matrixRulesRequireSecondPress = matrixRulesProceedingKey === matrixApplicationKey
  const matrixCoverageIsCurrent = matrixCoverage?.selectionKey === matrixVerificationKey
  const matrixSkuOverrideExplainsMismatch = (
    result: ColorRuleMatrixCoverage,
    mismatch: ColorRuleMatrixCoverage['mismatches'][number]
  ): boolean => locallyAppliedMatrixSkuOverrides[matrixMismatchKey({
    sourceColorCode: result.sourceColorCode,
    scope: result.scope,
    mismatch,
  })] === true
  const matrixCoverageIsClean = matrixCoverageIsCurrent
    && matrixCoverage.results.length === selectedColorMatrixRows.length
    && matrixCoverage.results.every(result => result.sapReadErrors.length === 0 && result.mismatches.every(mismatch =>
      mismatch.reason === 'missing_component'
        && validatedMatrixAbsences[`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`] === true
          ? true
        : selectedHybridCaseExplainsMismatch({ result, mismatch, selectedHybridCases: selectedMatrixHybridCases })
          || matrixSkuOverrideExplainsMismatch(result, mismatch)
    ))
  const matrixAbsenceCandidates = matrixCoverageIsCurrent && matrixCoverage
    ? matrixCoverage.results.flatMap(result => result.mismatches
      .filter(mismatch => mismatch.reason === 'missing_component'
        && validatedMatrixAbsences[`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`] !== true)
      .map(mismatch => ({
        key: `${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`,
        skuComplete: mismatch.skuComplete,
        sourceColorCode: result.sourceColorCode,
        scope: result.scope,
        baseItemCode: mismatch.baseItemCode,
      })))
    : []
  const selectedMatrixAbsenceCandidates = matrixAbsenceCandidates.filter(item => selectedMatrixAbsences[item.key])
  const allMatrixAbsenceCandidatesSelected = matrixAbsenceCandidates.length > 0
    && matrixAbsenceCandidates.every(item => selectedMatrixAbsences[item.key])
  const selectedMatrixAbsenceKey = selectedMatrixAbsenceCandidates.map(item => item.key).sort().join('|')
  const matrixAbsenceRequiresSecondPress = matrixAbsenceProceedingKey === selectedMatrixAbsenceKey
  const validatedMatrixAbsenceItems = matrixCoverageIsCurrent && matrixCoverage
    ? matrixCoverage.results.flatMap(result => result.mismatches
      .filter(mismatch => mismatch.reason === 'missing_component'
        && validatedMatrixAbsences[`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`] === true)
      .map(mismatch => ({ skuComplete: mismatch.skuComplete, baseItemCode: mismatch.baseItemCode })))
    : []
  const matrixSapSkuCandidates = matrixCoverageIsCurrent && matrixCoverage
    ? [...new Map(matrixCoverage.results.flatMap(result => result.mismatches
      .filter(mismatch => mismatch.reason !== 'missing_component'
        || validatedMatrixAbsences[`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`] !== true)
      .filter(mismatch => !selectedHybridCaseExplainsMismatch({ result, mismatch, selectedHybridCases: selectedMatrixHybridCases }))
      .filter(mismatch => !matrixSkuOverrideExplainsMismatch(result, mismatch))
      .map(mismatch => [mismatch.skuComplete, { skuComplete: mismatch.skuComplete, itemName: mismatch.skuItemName }] as const))).values()]
    : []
  const selectedMatrixSapSkuCodes = matrixSapSkuCandidates.filter(item => selectedMatrixSapSkus[item.skuComplete]).map(item => item.skuComplete)
  const selectedBoardColorCodes = [...new Set(boardMatrixRows.filter(row => selectedBoardColors[row.sourceColorCode]).map(row => row.sourceColorCode))]
  const boardColorsReadyForBaseConstruction = new Set([
    ...boardMatrixRows.filter(row => row.hasPersistedBoardResolution).map(row => row.sourceColorCode),
    ...(boardMatrixCoverage ?? [])
    .filter(boardColorIsReadyForBaseConstruction)
    .map(result => result.sourceColorCode),
  ])
  const boardConditionalReviewRows = boardMatrixRows.filter(row =>
    row.status === 'matches' && row.hasConditionalBoardRule && !boardColorsReadyForBaseConstruction.has(row.sourceColorCode)
  )
  const boardStandardRows = boardMatrixRows.filter(row =>
    (row.status === 'matches' && !row.hasConditionalBoardRule)
    || (row.role === 'full_product' && boardColorsReadyForBaseConstruction.has(row.sourceColorCode))
  )
  const boardExceptionRows = boardMatrixRows.filter(row =>
    row.status !== 'matches' && !boardColorsReadyForBaseConstruction.has(row.sourceColorCode)
  )
  const boardStandardConsumption = boardMatrixRows.find(row => row.role === 'full_product')?.normalizedConsumptionQty ?? null
  const boardReferenceProfile = boardMatrixRows.find(row => row.role === 'full_product')?.referenceMaterialProfile ?? null
  const boardReferenceProfiles = boardMatrixRows.find(row => row.role === 'full_product')?.referenceMaterialProfiles ?? []
  const boardSapInactiveAppCandidates = boardMatrixCoverage
    ? [...new Map(boardMatrixCoverage.flatMap(result => result.invalidSkus)
      .filter(item => item.reason === 'sap_invalid')
      .map(item => [item.skuComplete, item] as const)).values()]
    : []
  const boardOtherCatalogIssues = boardMatrixCoverage
    ? [...new Map(boardMatrixCoverage.flatMap(result => result.invalidSkus)
      .filter(item => item.reason !== 'sap_invalid')
      .map(item => [item.skuComplete, item] as const)).values()]
    : []
  const visibleBoardOtherCatalogIssues = boardOtherCatalogIssues.filter(item => !ignoredBoardCatalogIssues[`${item.skuComplete}:${item.reason}`])
  const selectedBoardInactiveAppSkuCodes = boardSapInactiveAppCandidates.filter(item => selectedBoardInactiveAppSkus[item.skuComplete]).map(item => item.skuComplete)
  const selectedBoardConditionalStrategy = boardConditionalRuleEditor?.strategies.find(strategy => strategy.strategyId === boardConditionalRuleEditor.selectedStrategyId) ?? null
  const allBoardExceptionsSelected = boardExceptionRows.length > 0 && boardExceptionRows.every(row => selectedBoardColors[row.sourceColorCode] === true)
  const allBoardInactiveAppCandidatesSelected = boardSapInactiveAppCandidates.length > 0 && boardSapInactiveAppCandidates.every(item => selectedBoardInactiveAppSkus[item.skuComplete] === true)
  const reviewFindings = visibleFindings.filter(finding => finding.status === 'open' && finding.severity !== 'info' && finding.findingType !== 'issue_method_review' && finding.findingType !== 'color_rule_proposal')
  const issueMethodFindings = visibleFindings.filter(finding => finding.status === 'open' && finding.findingType === 'issue_method_review')
  const reviewTopicCount = new Set(reviewFindings.map(finding => {
    if (finding.findingType === 'material_profile_proposal') return `material-profile:${finding.lineIdentity}`
    if (finding.findingType === 'color_rule_proposal') return `color-rule:${finding.lineIdentity}`
    if (finding.findingType === 'material_consumption_conflict') return `material-consumption:${finding.lineIdentity}`
    return `${finding.findingType}:${finding.lineIdentity ?? finding.id}`
  })).size + (issueMethodFindings.length > 0 ? 1 : 0)
  const issueMethodDifferencesToApply = issueMethodFindings.flatMap(finding => issueMethodDifferences(finding, issueMethodDraft.targetIssueMethod))
  const pendingConsumptionCount = workspace?.run.proposedBomStructure.lines.reduce(
    (total, line) => total + line.consumptions.filter(consumption => consumption.status === 'needs_definition').length,
    0
  ) ?? 0

  function runTask(task: () => Promise<void>): void {
    startTransition(() => {
      void task()
    })
  }

  function clearTransientMatrixAbsenceApprovals(): void {
    setSelectedMatrixAbsences({})
    setValidatedMatrixAbsences({})
    setMatrixAbsenceReviewed(false)
    setMatrixAbsenceProceedingKey(null)
  }

  function clearTransientMatrixCandidateOverrideState(): void {
    setMatrixCandidateOverrideReviewed({})
    setMatrixCandidateOverrideProceedingKey(null)
    setLocallyAppliedMatrixCandidateOverrides({})
    setMatrixCandidateOverrideApplyingKey(null)
    setMatrixCandidateOverrideStartedAt(null)
  }

  async function analyzeReferenceWithProgress(
    referenceId: string,
    retry?: { skuCompletes: string[]; cachedSnapshots: ReferenceImportWorkspace['snapshots'] }
  ): Promise<void> {
    const startedAt = Date.now()
    clearTransientMatrixAbsenceApprovals()
    setSelectedMatrixHybridCases({})
    setMatrixDualAlternatives({})
    setLocallyAppliedMatrixConfigs({})
    setMatrixSkuOverrideEditors({})
    setMatrixSkuOverrideDrafts({})
    setLocallyAppliedMatrixSkuOverrides({})
    clearTransientMatrixCandidateOverrideState()
    setReferenceScopeAssignments({})
    setPreparedSupabaseSyncSkus({})
    setSkuActionMessages({})
    setSelectedBoardColors({})
    setBoardMatrixCoverage(null)
    setVisibleBoardCoverageColorCodes([])
    setLastBoardMatrixAnalyzedColorCodes([])
    setSelectedBoardInactiveAppSkus({})
    setBoardColorRuleEditor(null)
    setBoardConditionalRuleEditor(null)
    setSelectedBoardDualColorCases({})
    setSavedBoardDualColorResults({})
    setBoardDualCandidateDeviation({})
    setBoardDualCandidateOverrideReviewed({})
    setBoardDualCandidateOverrideApplyingKey(null)
    setSavedBoardDualSkuOverrideResults({})
    setBoardMatrixMessage(null)
    setAnalysisStartedAt(startedAt)
    setAnalysisProgress({
      stage: 'starting',
      message: retry
        ? `Preparando el reintento de ${retry.skuCompletes.length} LdM pendiente(s).`
        : 'Iniciando el análisis SAP.',
      current: null,
      total: null,
    })
    try {
      const response = await fetch('/api/product-design/bom/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceId, ...(retry ? { retry } : {}) }),
      })
      if (!response.ok || !response.body) throw new Error('No se pudo iniciar el análisis SAP.')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let completed = false
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          buffer += decoder.decode(next.value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const rawEvent of events) {
            const payload = rawEvent.split('\n').find(line => line.startsWith('data: '))?.slice(6)
            if (!payload) continue
            const event = parseAnalysisStreamEvent(payload)
            if (!event) continue
            if (event.type === 'progress') {
              setAnalysisProgress(event.progress)
              continue
            }
            if (event.type === 'error') throw new Error(event.message)
            setWorkspace(event.workspace)
            setMessage(`${event.message} Tiempo total: ${formatElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))}.`)
            completed = true
          }
        }
      } finally {
        reader.releaseLock()
      }
      if (!completed) throw new Error('El análisis SAP terminó sin devolver un resultado.')
    } finally {
      setAnalysisProgress(null)
      setAnalysisStartedAt(null)
    }
  }

  async function verifyColorMatrixWithProgress(selections: Array<{
    sourceColorCode: string
    scope: ReferenceProductApplicationScope
    targetColorCode: string
    baseItemCodes: string[]
    materialKinds: Array<'board' | 'edge_band' | 'other'>
  }>, startedAt: number): Promise<{ success: boolean; message: string; results: ColorRuleMatrixCoverage[] }> {
    setMatrixVerificationStartedAt(startedAt)
    setMatrixVerificationProgress({ stage: 'starting', message: 'Iniciando la verificación de la matriz en SAP.', current: null, total: null })
    try {
      const response = await fetch('/api/product-design/bom/color-matrix/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections }),
      })
      if (!response.ok || !response.body) throw new Error('No se pudo iniciar la verificación de la matriz.')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let completed: { success: boolean; message: string; results: ColorRuleMatrixCoverage[] } | null = null
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          buffer += decoder.decode(next.value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const rawEvent of events) {
            const payload = rawEvent.split('\n').find(line => line.startsWith('data: '))?.slice(6)
            if (!payload) continue
            const event = parseMatrixVerificationEvent(payload)
            if (!event) continue
            if (event.type === 'progress') {
              setMatrixVerificationProgress(event.progress)
              continue
            }
            if (event.type === 'error') throw new Error(event.message)
            completed = { success: event.success, message: event.message, results: event.results }
          }
        }
      } finally {
        reader.releaseLock()
      }
      if (!completed) throw new Error('La verificación de la matriz terminó sin devolver un resultado.')
      return completed
    } finally {
      setMatrixVerificationProgress(null)
      setMatrixVerificationStartedAt(null)
    }
  }

  function searchReferences(): void {
    runTask(async () => {
      try {
        const nextCandidates = await listTransientReferenceBomImportCandidatesAction(search)
        setCandidates(nextCandidates)
        if (!nextCandidates.some(candidate => candidate.referenceId === selectedCandidate?.referenceId)) {
          setSelectedCandidate(nextCandidates[0] ?? null)
        }
        setMessage(nextCandidates.length > 0 ? `${nextCandidates.length} referencias encontradas.` : 'No se encontraron referencias activas.')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudo consultar referencias.')
      }
    })
  }

  function selectReference(candidate: ReferenceImportCandidate): void {
    setSelectedCandidate(candidate)
    setIsReferencePickerOpen(false)
    setWorkspace(null)
    setMessage(null)
    setMatrixTargetColorEdits({})
    setSelectedMatrixHybridCases({})
    setMatrixDualAlternatives({})
    setLocallyAppliedMatrixConfigs({})
    setMatrixSkuOverrideEditors({})
    setMatrixSkuOverrideDrafts({})
    setLocallyAppliedMatrixSkuOverrides({})
    clearTransientMatrixCandidateOverrideState()
    setReferenceScopeAssignments({})
    setPreparedSupabaseSyncSkus({})
    setSkuActionMessages({})
    setBoardMatrixCoverage(null)
    setVisibleBoardCoverageColorCodes([])
    setLastBoardMatrixAnalyzedColorCodes([])
    setSelectedBoardInactiveAppSkus({})
    setBoardColorRuleEditor(null)
    setBoardMatrixMessage(null)
  }

  function analyzeSelectedReference(options?: { retryPendingBomReads?: boolean }): void {
    if (!selectedCandidate) return
    const retry = options?.retryPendingBomReads && canRetryOnlyPendingBomReads && workspace
      ? {
          skuCompletes: bomReadFailureSnapshots.map(snapshot => snapshot.skuComplete),
          cachedSnapshots: workspace.snapshots.filter(snapshot => snapshot.status === 'captured'),
        }
      : undefined
    runTask(async () => {
      try {
        await analyzeReferenceWithProgress(selectedCandidate.referenceId, retry)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudo analizar la referencia desde SAP.')
      }
    })
  }

  function confirmColorRule(finding: ReferenceImportFinding): void {
    if (!workspace) return
    runTask(async () => {
      const result = await confirmTransientColorRuleAction({
        referenceId: workspace.run.referenceId,
        sourceColorCode: asString(finding.detailsJson.source_color_code) ?? '',
        scope: finding.proposedScope ?? 'NA',
        targetColorCode: finding.proposedColorCode ?? '',
        confirmed: confirmationChecks[finding.id] === true,
      })
      setMessage(result.message)
      if (result.workspace) setWorkspace(result.workspace)
    })
  }

  function confirmMaterialGroup(): void {
    if (!workspace) return
    runTask(async () => {
      setMessage('El grupo lógico se deriva automáticamente de SAP; no requiere guardar una auditoría temporal.')
    })
  }

  function confirmMaterialProfile(finding: ReferenceImportFinding): void {
    if (!workspace) return
    runTask(async () => {
      const result = await confirmTransientMaterialProfileAction({
        referenceId: workspace.run.referenceId,
        sourceColorCode: asString(finding.detailsJson.source_color_code) ?? '',
        scope: finding.proposedScope ?? 'NA',
        materialProfile: asString(finding.detailsJson.material_profile) ?? '',
        confirmed: confirmationChecks[finding.id] === true,
      })
      setMessage(result.message)
      if (result.workspace) setWorkspace(result.workspace)
    })
  }

  function updateOverrideDraft(finding: ReferenceImportFinding, patch: Partial<OverrideDraft>): void {
    setOverrideDrafts(current => {
      const currentDraft = current[finding.id] ?? {
        level: 'reference',
        skuComplete: '',
        sourceColorCode: '',
        targetColorCode: '',
        materialProfile: '',
        reason: '',
      }
      return {
        ...current,
        [finding.id]: {
          ...currentDraft,
        ...patch,
        },
      }
    })
  }

  function saveManualOverride(finding: ReferenceImportFinding): void {
    const scope = finding.proposedScope
    if (!workspace || !scope) return
    const draft = overrideDrafts[finding.id] ?? {
      level: 'reference' as const,
      skuComplete: '',
      sourceColorCode: '',
      targetColorCode: '',
      materialProfile: '',
      reason: '',
    }
    runTask(async () => {
      const result = await saveTransientColorOverrideAction({
        referenceId: workspace.run.referenceId,
        level: draft.level,
        skuComplete: draft.skuComplete || null,
        sourceColorCode: draft.sourceColorCode,
        scope,
        targetColorCode: draft.targetColorCode || null,
        materialProfile: draft.materialProfile || null,
        baseItemCode: finding.baseItemCode,
        reason: draft.reason,
      })
      setMessage(result.message)
      if (result.workspace) setWorkspace(result.workspace)
    })
  }

  function applyIssueMethodsBatch(dryRun: boolean): void {
    if (!workspace || issueMethodFindings.length === 0) return
    runTask(async () => {
      const result = await applyTransientIssueMethodsBatchAction({
        referenceId: workspace.run.referenceId,
        targetIssueMethod: issueMethodDraft.targetIssueMethod,
        dryRun,
        confirmed: issueMethodDraft.confirmed,
        items: issueMethodDifferencesToApply.flatMap(item => item.childNum !== null ? [{
          skuComplete: item.skuComplete,
          childNum: item.childNum,
          itemCode: item.itemCode,
        }] : []),
      })
      setMessage(result.message)
      const detail = result.issueMethodResult?.results.map(item => `${item.skuComplete} · línea ${item.childNum}: ${item.message}`).join(' ') ?? result.message
      setIssueMethodDraft(current => ({
        ...current,
        result: detail,
        confirmed: dryRun ? false : current.confirmed,
      }))
      if (result.workspace) setWorkspace(result.workspace)
    })
  }

  function confirmColorMatrix(): void {
    if (!workspace) return
    if (hasInvalidSelectedMatrixTarget) {
      setMessage('Cada regla seleccionada debe tener un color interno de cuatro caracteres antes de aplicarla.')
      return
    }
    if (!matrixRulesReviewed || selectedColorMatrixRows.length === 0) return
    if (!matrixRulesRequireSecondPress) {
      setMatrixRulesProceedingKey(matrixApplicationKey)
      setMatrixBatchMessage('Revisa las reglas una vez más. Si son correctas, presiona “Proceder con aplicar reglas”.')
      return
    }
    runTask(async () => {
      const startedAt = Date.now()
      setIsApplyingMatrixRules(true)
      setMatrixRulesStartedAt(startedAt)
      try {
        const result = await confirmTransientColorMatrixAction({
          selections: selectedColorMatrixRows.flatMap(row => row.suggestedTargetColorCode ? [{
            sourceColorCode: row.sourceColorCode,
            scope: row.scope as ReferenceProductApplicationScope,
            targetColorCode: row.suggestedTargetColorCode,
            baseItemCodes: row.baseItemCodes,
            materialKinds: row.materialKinds,
          }] : []),
          hybridCases: selectedMatrixHybridCaseList.flatMap(candidate => {
            const unicolorColorCode = selectedColorMatrixRows.find(row =>
              row.sourceColorCode === candidate.sourceColorCode
              && (row.scope === 'edge_band_full_product' || row.scope === 'full_product')
            )?.suggestedTargetColorCode
            return unicolorColorCode ? [{
              sourceColorCode: candidate.sourceColorCode,
              fullProductColorCode: unicolorColorCode,
              colorMode: 'dual' as const,
              structureColorCode: candidate.structureColorCode,
              frontColorCode: candidate.frontColorCode,
              skuCompletes: candidate.cases.map(candidateCase => candidateCase.skuComplete),
            }] : []
          }),
          acceptedAbsences: validatedMatrixAbsenceItems,
        })
        setMessage(`${result.message} Tiempo de aplicación: ${formatElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))}.`)
        if (!result.success) return
        setSelectedMatrixRules({})
        setMatrixTargetColorEdits({})
        setMatrixRulesReviewed(false)
        setMatrixRulesProceedingKey(null)
        setMatrixCoverage(null)
        setSelectedMatrixHybridCases({})
        setMatrixDualAlternatives({})
        setLocallyAppliedMatrixConfigs(current => ({
          ...current,
          ...Object.fromEntries(selectedColorMatrixRows.flatMap(row => row.suggestedTargetColorCode ? [[row.sourceColorCode, {
            unicolorColorCode: row.suggestedTargetColorCode,
            hybridCases: selectedMatrixHybridCaseList.filter(candidate => candidate.sourceColorCode === row.sourceColorCode),
          }] as const] : [])),
        }))
      } finally {
        setIsApplyingMatrixRules(false)
        setMatrixRulesStartedAt(null)
      }
    })
  }

  function verifyColorMatrixInSap(): void {
    if (!workspace) return
    if (hasInvalidSelectedMatrixTarget) {
      setMessage('Cada regla seleccionada debe tener un color interno de cuatro caracteres antes de verificarla en SAP.')
      return
    }
    clearTransientMatrixAbsenceApprovals()
    setMatrixSkuOverrideEditors({})
    setMatrixSkuOverrideDrafts({})
    setLocallyAppliedMatrixSkuOverrides({})
    clearTransientMatrixCandidateOverrideState()
    runTask(async () => {
      const startedAt = Date.now()
      const selections = selectedColorMatrixRows.flatMap(row => row.suggestedTargetColorCode ? [{
          sourceColorCode: row.sourceColorCode,
          scope: row.scope as ReferenceProductApplicationScope,
          targetColorCode: row.suggestedTargetColorCode,
          baseItemCodes: row.baseItemCodes,
          materialKinds: row.materialKinds,
        }] : [])
      try {
        const result = await verifyColorMatrixWithProgress(selections, startedAt)
        const dualAlternatives = result.results.flatMap(coverage => coverage.scope === 'edge_band_full_product'
          ? [[coverage.sourceColorCode, coverage.dualCandidates.map(candidate => ({
            ...candidate,
            sourceColorCode: coverage.sourceColorCode,
            baseItemCodes: coverage.baseItemCodes,
          }))] as const]
          : [])
        const nextDualAlternatives = Object.fromEntries(dualAlternatives)
        setSelectedMatrixHybridCases({})
        setMatrixDualAlternatives(nextDualAlternatives)
        const candidateGroupCount = Object.values(nextDualAlternatives).reduce((total, candidates) => total + candidates.length, 0)
        setMessage(`${result.message}${candidateGroupCount > 0 ? ` SAP identificó ${candidateGroupCount} caso(s) Dual: selecciona únicamente los que deseas guardar como excepción por SKU; no se requerirá otra consulta.` : ''} Tiempo total: ${formatElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))}.`)
        setMatrixCoverage({ selectionKey: matrixVerificationKey, success: result.success, results: result.results })
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudo verificar la matriz.')
      }
    })
  }

  async function verifyBoardMatrixWithProgress(colorCodes: string[], startedAt: number): Promise<{ success: boolean; message: string; results: BoardMatrixCatalogResult[] }> {
    const abortController = new AbortController()
    boardMatrixAbortControllerRef.current = abortController
    setBoardMatrixVerificationStartedAt(startedAt)
    setBoardMatrixVerificationProgress({ stage: 'starting', message: 'Iniciando la revalidación de tableros en SAP.', current: null, total: null })
    try {
      const response = await fetch('/api/product-design/bom/board-matrix/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorCodes }),
        signal: abortController.signal,
      })
      if (!response.ok) throw await boardMatrixStartFailure(response)
      if (!response.body) throw new Error('El análisis de tableros se inició sin una respuesta de progreso.')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let completed: { success: boolean; message: string; results: BoardMatrixCatalogResult[] } | null = null
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          buffer += decoder.decode(next.value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const rawEvent of events) {
            const payload = rawEvent.split('\n').find(line => line.startsWith('data: '))?.slice(6)
            if (!payload) continue
            const event = parseBoardMatrixVerificationEvent(payload)
            if (!event) continue
            if (event.type === 'progress') {
              setBoardMatrixVerificationProgress(event.progress)
              continue
            }
            if (event.type === 'error') throw new Error(event.message)
            completed = { success: event.success, message: event.message, results: event.results }
          }
        }
      } finally {
        reader.releaseLock()
      }
      if (!completed) throw new Error('El análisis de tableros terminó sin devolver un resultado.')
      return completed
    } finally {
      if (boardMatrixAbortControllerRef.current === abortController) boardMatrixAbortControllerRef.current = null
      setBoardMatrixVerificationProgress(null)
      setBoardMatrixVerificationStartedAt(null)
    }
  }

  async function persistClosedBoardResolution(result: BoardMatrixCatalogResult): Promise<void> {
    if (!boardColorIsReadyForBaseConstruction(result)) return
    const saved = await confirmTransientBoardMatrixResolutionAction({
      sourceColorCode: result.sourceColorCode,
      sapActiveSkuCount: result.sapActiveSkuCount,
      checkedSkuCount: result.checkedSkuCount,
      dualCandidateCount: result.dualCandidates.length,
    })
    if (!saved.success) throw new Error(saved.message)
    setWorkspace(current => current ? {
      ...current,
      boardMatrix: current.boardMatrix?.map(row => row.sourceColorCode === result.sourceColorCode
        ? { ...row, hasPersistedBoardResolution: true }
        : row),
    } : current)
  }

  function cancelBoardMatrixVerification(): void {
    const abortController = boardMatrixAbortControllerRef.current
    if (!abortController || abortController.signal.aborted) return
    abortController.abort()
    setBoardMatrixMessage('Cancelando la revalidación de tableros. SAP terminará únicamente las consultas que ya estuvieran en curso.')
  }

  function verifyBoardMatrixInSap(): void {
    if (selectedBoardColorCodes.length === 0) {
      setBoardMatrixMessage('Selecciona al menos un color de producto para revalidarlo en SAP.')
      return
    }
    runTask(async () => {
      const startedAt = Date.now()
      try {
        setVisibleBoardCoverageColorCodes([])
        const result = await verifyBoardMatrixWithProgress(selectedBoardColorCodes, startedAt)
        setBoardMatrixCoverage(current => {
          const refreshedColors = new Set(result.results.map(coverage => coverage.sourceColorCode))
          return [
            ...(current ?? []).filter(coverage => !refreshedColors.has(coverage.sourceColorCode)),
            ...result.results,
          ]
        })
        setVisibleBoardCoverageColorCodes(result.results.map(coverage => coverage.sourceColorCode))
        setLastBoardMatrixAnalyzedColorCodes(result.results.map(coverage => coverage.sourceColorCode))
        setSelectedBoardColors({})
        for (const coverage of result.results) await persistClosedBoardResolution(coverage)
        setSelectedBoardInactiveAppSkus({})
        setIgnoredBoardCatalogIssues({})
        setSelectedBoardDualColorCases({})
        setSavedBoardDualColorResults({})
        setBoardDualCandidateDeviation({})
        setBoardDualCandidateOverrideReviewed({})
        setBoardDualCandidateOverrideApplyingKey(null)
        setSavedBoardDualSkuOverrideResults({})
        setBoardMatrixMessage(`${result.message} Tiempo total: ${formatElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))}.`)
      } catch (error) {
        const cancelled = error instanceof Error && error.name === 'AbortError'
        setBoardMatrixMessage(cancelled
          ? 'Revalidación de tableros cancelada. No se iniciarán más consultas SAP de este lote.'
          : error instanceof Error ? error.message : 'No se pudo revalidar la matriz de tableros.')
      }
    })
  }

  function toggleAllBoardExceptions(): void {
    const nextSelected = !allBoardExceptionsSelected
    setSelectedBoardColors(current => ({
      ...current,
      ...Object.fromEntries(boardExceptionRows.map(row => [row.sourceColorCode, nextSelected])),
    }))
    setSelectedBoardInactiveAppSkus({})
    setIgnoredBoardCatalogIssues({})
    setVisibleBoardCoverageColorCodes([])
    setBoardColorRuleEditor(null)
    setBoardMatrixMessage(null)
  }

  function toggleAllBoardInactiveAppCandidates(): void {
    const nextSelected = !allBoardInactiveAppCandidatesSelected
    setSelectedBoardInactiveAppSkus(current => ({
      ...current,
      ...Object.fromEntries(boardSapInactiveAppCandidates.map(item => [item.skuComplete, nextSelected])),
    }))
  }

  function syncBoardInactiveSkusInSupabase(): void {
    if (selectedBoardInactiveAppSkuCodes.length === 0) return
    runTask(async () => {
      try {
        const result = await syncTransientSapInactiveSkusInSupabaseAction({ skuCompletes: selectedBoardInactiveAppSkuCodes })
        const synchronizedSkuCodes = new Set(result.results.filter(item => item.success).map(item => item.skuComplete))
        setBoardMatrixCoverage(current => current?.map(coverage => {
          const reconciled = coverage.invalidSkus.filter(item => item.reason === 'sap_invalid' && synchronizedSkuCodes.has(item.skuComplete))
          return reconciled.length === 0
            ? coverage
            : {
              ...coverage,
              supabaseActiveSkuCount: Math.max(0, coverage.supabaseActiveSkuCount - reconciled.length),
              invalidSkus: coverage.invalidSkus.filter(item => !(item.reason === 'sap_invalid' && synchronizedSkuCodes.has(item.skuComplete))),
            }
        }) ?? null)
        setBoardMatrixMessage(`${result.message} Se aplicó únicamente a los SKU seleccionados, sin volver a recorrer SAP. ${result.results.map(item => `${item.skuComplete}: ${item.message}`).join(' ')}`)
        setSelectedBoardInactiveAppSkus({})
      } catch (error) {
        setBoardMatrixMessage(error instanceof Error ? error.message : 'No se pudo sincronizar el estado de los SKU en Supabase.')
      }
    })
  }

  function ignoreBoardCatalogIssue(item: BoardMatrixCatalogResult['invalidSkus'][number]): void {
    setIgnoredBoardCatalogIssues(current => ({ ...current, [`${item.skuComplete}:${item.reason}`]: true }))
    setBoardMatrixMessage(`${item.skuComplete} se ignoró solo en esta sesión. No se modificó SAP ni Supabase.`)
  }

  function createBoardSapColorVariation(item: BoardMatrixCatalogResult['invalidSkus'][number]): void {
    if (item.reason !== 'sap_only') return
    const coverage = boardMatrixCoverage?.find(result => result.invalidSkus.some(issue => issue.skuComplete === item.skuComplete && issue.reason === 'sap_only'))
    const componentItemCodes = [...new Set(coverage?.rows.flatMap(row => row.evidence
      .filter(evidence => evidence.skuComplete === item.skuComplete)
      .map(evidence => evidence.itemCode)) ?? [])]
    if (componentItemCodes.length === 0) {
      setBoardMatrixMessage(`${item.skuComplete}: no hay evidencia de componentes SAP para crear la variacion y sus componentes en una sola operacion.`)
      return
    }
    runTask(async () => {
      try {
        const result = await createTransientSapColorVariationAction({
          skuComplete: item.skuComplete,
          sapDescriptionOriginal: item.skuItemName,
          componentItemCodes,
        })
        setBoardMatrixMessage(result.message)
        if (!result.success) return
        setBoardMatrixCoverage(current => current?.map(coverage => ({
          ...coverage,
          supabaseSkuCount: coverage.invalidSkus.some(issue => issue.skuComplete === item.skuComplete && issue.reason === 'sap_only')
            ? coverage.supabaseSkuCount + 1
            : coverage.supabaseSkuCount,
          supabaseActiveSkuCount: coverage.invalidSkus.some(issue => issue.skuComplete === item.skuComplete && issue.reason === 'sap_only')
            ? coverage.supabaseActiveSkuCount + 1
            : coverage.supabaseActiveSkuCount,
          invalidSkus: coverage.invalidSkus.filter(issue => !(issue.skuComplete === item.skuComplete && issue.reason === 'sap_only')),
        })) ?? null)
      } catch (error) {
        setBoardMatrixMessage(error instanceof Error ? error.message : 'No se pudo crear la variación de color en Supabase.')
      }
    })
  }

  function acceptColorMatrixAbsences(): void {
    if (!workspace) return
    if (!matrixAbsenceReviewed || selectedMatrixAbsenceCandidates.length === 0) return
    if (!matrixAbsenceRequiresSecondPress) {
      setMatrixAbsenceProceedingKey(selectedMatrixAbsenceKey)
      setMatrixBatchMessage('Revisa la selección una vez más. Si es correcta, presiona “Proceder con validar ausencias”.')
      return
    }
    runTask(async () => {
      const startedAt = Date.now()
      setIsValidatingMatrixAbsences(true)
      setMatrixAbsenceStartedAt(startedAt)
      try {
        const result = await validateTransientAbsencesAction({
          items: selectedMatrixAbsenceCandidates.map(item => ({ skuComplete: item.skuComplete, baseItemCode: item.baseItemCode })),
        })
        setMatrixBatchMessage(`${result.message} Tiempo total: ${formatElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))}.`)
        if (!result.success) return
        setValidatedMatrixAbsences(current => ({
          ...current,
          ...Object.fromEntries(selectedMatrixAbsenceCandidates.map(item => [item.key, true])),
        }))
        setSelectedMatrixAbsences({})
        setMatrixAbsenceReviewed(false)
        setMatrixAbsenceProceedingKey(null)
      } finally {
        setIsValidatingMatrixAbsences(false)
        setMatrixAbsenceStartedAt(null)
      }
    })
  }

  function updateMatrixTargetColor(rowKey: string, value: string): void {
    setMatrixTargetColorEdits(current => ({ ...current, [rowKey]: value.toUpperCase() }))
    setSelectedMatrixHybridCases({})
    setMatrixCoverage(null)
    setMatrixRulesReviewed(false)
    setMatrixRulesProceedingKey(null)
    setMatrixSkuOverrideEditors({})
    setMatrixSkuOverrideDrafts({})
    setLocallyAppliedMatrixSkuOverrides({})
    clearTransientMatrixCandidateOverrideState()
  }

  function chooseMatrixColorCandidate(rowKey: string, colorCode: string): void {
    updateMatrixTargetColor(rowKey, colorCode)
  }

  function chooseDetectedMatrixDual(candidate: MatrixDualCandidate): void {
    if (locallyAppliedMatrixCandidateOverrides[matrixDualCandidateOverrideKey(candidate)]) {
      setMatrixBatchMessage('Este caso ya está resuelto con overrides por SKU; no puede guardarse además como Dual global.')
      return
    }
    const candidateKey = matrixDualCandidateKey(candidate)
    setSelectedMatrixHybridCases(current => {
      const selected = current[candidate.sourceColorCode]
      if (selected && matrixDualCandidateKey(selected) === candidateKey) {
        const remaining = { ...current }
        delete remaining[candidate.sourceColorCode]
        return remaining
      }
      return { ...current, [candidate.sourceColorCode]: candidate }
    })
    setMatrixRulesReviewed(false)
    setMatrixRulesProceedingKey(null)
    setMessage(`Caso Dual elegido para ${candidate.sourceColorCode}: estructura ${candidate.structureColorCode} y frentes ${candidate.frontColorCode}. Reemplaza cualquier otro caso elegido de este color; la regla unicolor seguirá siendo global.`)
  }

  function applyMatrixDualCandidateSkuOverrides(candidate: MatrixDualCandidate): void {
    const candidateKey = matrixDualCandidateOverrideKey(candidate)
    if (matrixCandidateOverrideApplyingKey) return
    if (isMatrixDualCandidateSelected(selectedMatrixHybridCases, candidate)) {
      setMatrixBatchMessage('Este caso ya esta elegido como Dual global. Para guardarlo como override por SKU, primero desmarcalo como caso Dual.')
      return
    }
    if (!matrixCandidateOverrideReviewed[candidateKey]) return
    if (matrixCandidateOverrideProceedingKey !== candidateKey) {
      setMatrixCandidateOverrideProceedingKey(candidateKey)
      setMatrixBatchMessage(`Revisa una vez mas los ${candidate.cases.length} SKU del caso. Si la excepcion es correcta, presiona "Proceder con aplicar overrides".`)
      return
    }
    const startedAt = Date.now()
    setMatrixCandidateOverrideApplyingKey(candidateKey)
    setMatrixCandidateOverrideStartedAt(startedAt)
    runTask(async () => {
      setIsApplyingMatrixCandidateOverrides(true)
      try {
        const result = await saveTransientMatrixDualCandidateSkuOverridesAction({
          skuCompletes: candidate.cases.map(candidateCase => candidateCase.skuComplete),
          sourceColorCode: candidate.sourceColorCode,
          structureColorCode: candidate.structureColorCode,
          frontColorCode: candidate.frontColorCode,
        })
        setMatrixBatchMessage(`${result.message} Tiempo total: ${formatElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))}.`)
        if (!result.success) return
        const candidateSkuCompletes = new Set(candidate.cases.map(candidateCase => candidateCase.skuComplete.trim().toUpperCase()))
        const expectedColors = new Set([candidate.structureColorCode, candidate.frontColorCode])
        const locallyResolvedMismatchKeys = (matrixCoverage?.results ?? []).flatMap(result =>
          result.sourceColorCode === candidate.sourceColorCode
            ? result.mismatches.flatMap(mismatch =>
              mismatch.reason === 'unexpected_color'
              && candidateSkuCompletes.has(mismatch.skuComplete.trim().toUpperCase())
              && Boolean(mismatch.observedColorCode && expectedColors.has(mismatch.observedColorCode))
                ? [matrixMismatchKey({ sourceColorCode: result.sourceColorCode, scope: result.scope, mismatch })]
                : []
            )
            : []
        )
        setLocallyAppliedMatrixSkuOverrides(current => ({
          ...current,
          ...Object.fromEntries(locallyResolvedMismatchKeys.map(key => [key, true])),
        }))
        setLocallyAppliedMatrixCandidateOverrides(current => ({ ...current, [candidateKey]: true }))
        setMatrixCandidateOverrideReviewed(current => ({ ...current, [candidateKey]: false }))
        setMatrixCandidateOverrideProceedingKey(null)
        setMatrixRulesReviewed(false)
        setMatrixRulesProceedingKey(null)
      } catch (error) {
        setMatrixBatchMessage(error instanceof Error ? error.message : 'No se pudieron guardar los overrides del caso.')
      } finally {
        setIsApplyingMatrixCandidateOverrides(false)
        setMatrixCandidateOverrideApplyingKey(null)
        setMatrixCandidateOverrideStartedAt(null)
      }
    })
  }

  function toggleMatrixSkuOverrideEditor(key: string): void {
    setMatrixSkuOverrideEditors(current => ({ ...current, [key]: !current[key] }))
  }

  function updateMatrixSkuOverrideDraft(key: string, patch: Partial<MatrixSkuOverrideDraft>): void {
    setMatrixSkuOverrideDrafts(current => ({
      ...current,
      [key]: {
        targetColorCode: current[key]?.targetColorCode ?? '',
        reason: current[key]?.reason ?? '',
        ...patch,
      },
    }))
  }

  function saveMatrixSkuOverride(
    result: ColorRuleMatrixCoverage,
    mismatch: ColorRuleMatrixCoverage['mismatches'][number]
  ): void {
    const semanticScope = mismatch.semanticScope
    const fallbackTargetColorCode = mismatch.observedColorCode ?? ''
    if (!semanticScope || !fallbackTargetColorCode) return
    const key = matrixMismatchKey({ sourceColorCode: result.sourceColorCode, scope: result.scope, mismatch })
    const draft = matrixSkuOverrideDrafts[key] ?? {
      targetColorCode: fallbackTargetColorCode,
      reason: '',
    }
    runTask(async () => {
      try {
        const override = await saveTransientMatrixSkuColorOverrideAction({
          skuComplete: mismatch.skuComplete,
          sourceColorCode: result.sourceColorCode,
          scope: semanticScope,
          targetColorCode: draft.targetColorCode,
          reason: draft.reason,
        })
        setMatrixBatchMessage(override.message)
        if (!override.success) return
        setLocallyAppliedMatrixSkuOverrides(current => ({ ...current, [key]: true }))
        setMatrixSkuOverrideEditors(current => ({ ...current, [key]: false }))
      } catch (error) {
        setMatrixBatchMessage(error instanceof Error ? error.message : 'No se pudo guardar el override del SKU.')
      }
    })
  }

  function updateReferenceBomLineScope(
    lineId: string,
    lineKind: 'fixed' | 'material_group',
    baseItemCode: string | null,
    scope: ReferenceProductApplicationScope
  ): void {
    const assignment = { lineId, lineKind, baseItemCode, scope }
    setReferenceScopeAssignments(current => ({ ...current, [lineId]: assignment }))
    setWorkspace(current => current ? {
      ...current,
      run: {
        ...current.run,
        proposedBomStructure: {
          ...current.run.proposedBomStructure,
          lines: current.run.proposedBomStructure.lines.map(line =>
            line.line_id === lineId && line.line_kind === lineKind && line.base_item_code === baseItemCode
              ? { ...line, product_application_scope: scope }
              : line
          ),
        },
      },
    } : current)
    setMessage(`Rol lógico actualizado para esta referencia: ${scopeLabel(scope)}. Se guardará al publicar la BOM base.`)
  }

  function toggleMatrixAbsence(key: string, selected: boolean): void {
    setSelectedMatrixAbsences(current => ({ ...current, [key]: selected }))
    setMatrixAbsenceReviewed(false)
    setMatrixAbsenceProceedingKey(null)
  }

  function toggleAllMatrixAbsences(): void {
    const nextSelected = !allMatrixAbsenceCandidatesSelected
    setSelectedMatrixAbsences(current => ({
      ...current,
      ...Object.fromEntries(matrixAbsenceCandidates.map(item => [item.key, nextSelected])),
    }))
    setMatrixAbsenceReviewed(false)
    setMatrixAbsenceProceedingKey(null)
  }

  function deactivateMatrixSkusInSap(dryRun: boolean): void {
    runTask(async () => {
      const result = await deactivateTransientReferenceBomSkusInSapAction({
        skuCompletes: selectedMatrixSapSkuCodes,
        dryRun,
        confirmed: dryRun ? false : matrixSapDeactivationConfirmed,
      })
      setMatrixBatchMessage(`${result.message} ${result.results.map(item => `${item.skuComplete}: ${item.message}`).join(' ')}`)
      if (dryRun) return
      if (!result.success || !workspace) return
      const coverage = await verifyTransientColorMatrixAction({
        selections: selectedColorMatrixRows.flatMap(row => row.suggestedTargetColorCode ? [{
          sourceColorCode: row.sourceColorCode,
            scope: row.scope as ReferenceProductApplicationScope,
            targetColorCode: row.suggestedTargetColorCode,
            baseItemCodes: row.baseItemCodes,
            materialKinds: row.materialKinds,
        }] : []),
      })
      setMatrixCoverage({ selectionKey: matrixVerificationKey, success: coverage.success, results: coverage.results })
      setMessage(coverage.message)
      setSelectedMatrixSapSkus({})
      setMatrixSapDeactivationConfirmed(false)
    })
  }

  function toggleOverrideEditor(findingId: string): void {
    setOverrideEditors(current => ({ ...current, [findingId]: !current[findingId] }))
  }

  function openColorEditor(finding: ReferenceImportFinding, colorCode: string): void {
    runTask(async () => {
      try {
        const color = await getTransientReferenceBomColorAction(colorCode)
        setColorEditor({ finding, color })
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudo abrir el color.')
      }
    })
  }

  function saveColorEditor(): void {
    if (!colorEditor || !workspace) return
    runTask(async () => {
      try {
        await saveTransientReferenceBomColorAction(colorEditor.color)
        setColorEditor(null)
        setMessage(`Color ${colorEditor.color.code_4dig} guardado. Actualizando el análisis SAP.`)
        await analyzeReferenceWithProgress(workspace.run.referenceId)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudo guardar el color.')
      }
    })
  }

  function syncInactiveSkuInSupabase(skuComplete: string): void {
    if (!workspace) return
    if (!preparedSupabaseSyncSkus[skuComplete]) {
      setPreparedSupabaseSyncSkus(current => ({ ...current, [skuComplete]: true }))
      setSkuActionMessages(current => ({ ...current, [skuComplete]: 'SAP se volverá a consultar antes de sincronizar este estado en Supabase.' }))
      return
    }
    runTask(async () => {
      setSkuActionMessages(current => ({ ...current, [skuComplete]: 'Comprobando el estado en SAP...' }))
      try {
        const result = await syncTransientSapInactiveSkusInSupabaseAction({ skuCompletes: [skuComplete] })
        setMessage(result.message)
        setSkuActionMessages(current => ({ ...current, [skuComplete]: result.results[0]?.message ?? result.message }))
        setPreparedSupabaseSyncSkus(current => Object.fromEntries(
          Object.entries(current).filter(([code]) => code !== skuComplete)
        ))
        if (!result.success) return

        const nextCandidates = await listTransientReferenceBomImportCandidatesAction(search)
        setCandidates(nextCandidates)
        setSelectedCandidate(current => nextCandidates.find(candidate => candidate.referenceId === current?.referenceId) ?? current)
        setWorkspace(null)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'No se pudo inactivar el SKU en Supabase.'
        setMessage(errorMessage)
        setSkuActionMessages(current => ({ ...current, [skuComplete]: errorMessage }))
      }
    })
  }

  function rerunAfterSapOnlyAction(skuComplete: string, message: string): void {
    setSapOnlyActionMessages(current => ({ ...current, [skuComplete]: message }))
    if (!workspace) return
    void analyzeReferenceWithProgress(workspace.run.referenceId)
  }

  function createSapOnlySkuInApp(skuComplete: string): void {
    runTask(async () => {
      try {
        const result = await createTransientSapColorVariationAction({ skuComplete, sapDescriptionOriginal: null })
        if (!result.success) {
          setSapOnlyActionMessages(current => ({ ...current, [skuComplete]: result.message }))
          return
        }
        rerunAfterSapOnlyAction(skuComplete, result.message)
      } catch (error) {
        setSapOnlyActionMessages(current => ({ ...current, [skuComplete]: error instanceof Error ? error.message : 'No se pudo registrar el SKU en la app.' }))
      }
    })
  }

  function inactivateSapOnlySku(skuComplete: string): void {
    runTask(async () => {
      try {
        const dryRun = await deactivateTransientReferenceBomSkusInSapAction({
          skuCompletes: [skuComplete],
          dryRun: true,
          confirmed: false,
        })
        const confirmed = sapOnlyActionConfirmed[skuComplete] === true
        if (!confirmed) {
          setSapOnlyActionMessages(current => ({ ...current, [skuComplete]: `${dryRun.message} Marca la casilla de confirmación para continuar.` }))
          return
        }
        const result = await deactivateTransientReferenceBomSkusInSapAction({
          skuCompletes: [skuComplete],
          dryRun: false,
          confirmed: true,
        })
        const message = `${result.message} ${result.results[0]?.message ?? ''}`.trim()
        if (!result.success) {
          setSapOnlyActionMessages(current => ({ ...current, [skuComplete]: message }))
          return
        }
        rerunAfterSapOnlyAction(skuComplete, message)
      } catch (error) {
        setSapOnlyActionMessages(current => ({ ...current, [skuComplete]: error instanceof Error ? error.message : 'No se pudo inactivar el SKU en SAP.' }))
      }
    })
  }

  function deleteSapOnlySku(skuComplete: string): void {
    if (!workspace) return
    const referenceId = workspace.run.referenceId
    runTask(async () => {
      try {
        if (!sapOnlyActionConfirmed[skuComplete]) {
          const dryRun = await deleteTransientSapOnlySkuAction({ skuComplete, dryRun: true, confirmed: false })
          setSapOnlyActionMessages(current => ({ ...current, [skuComplete]: `${dryRun.message} Marca la casilla de confirmación para continuar.` }))
          return
        }
        const result = await deleteTransientSapOnlySkuAction({
          skuComplete,
          dryRun: false,
          confirmed: true,
        })
        setSapOnlyActionMessages(current => ({ ...current, [skuComplete]: result.message }))
        if (result.success) await analyzeReferenceWithProgress(referenceId)
      } catch (error) {
        setSapOnlyActionMessages(current => ({ ...current, [skuComplete]: error instanceof Error ? error.message : 'No se pudo eliminar el SKU en SAP.' }))
      }
    })
  }

  function openBoardColorRuleEditor(candidate: NonNullable<BoardMatrixCatalogResult['fullProductRuleCandidate']>, sourceColorCode: string): void {
    setBoardColorRuleEditor({
      sourceColorCode,
      boardColorCode: candidate.boardColorCode,
      materialProfile: candidate.materialProfile,
      evidenceSkuCount: candidate.evidenceSkuCount,
    })
  }

  function saveBoardColorRule(): void {
    if (!boardColorRuleEditor) return
    const draft = boardColorRuleEditor
    runTask(async () => {
      try {
        const result = await applyTransientBoardFullProductColorRuleAction({
          colorCode: draft.sourceColorCode,
          boardColorCode: draft.boardColorCode,
          materialProfile: draft.materialProfile,
        })
        setBoardMatrixMessage(result.success ? `Regla global guardada para ${draft.sourceColorCode}.` : result.message)
        if (!result.success) return
        const updateRow = (row: BoardMatrixRow): BoardMatrixRow => row.sourceColorCode === draft.sourceColorCode && row.role === 'full_product'
          ? {
            ...row,
            proposedColorCode: draft.boardColorCode,
            proposedMaterialProfile: draft.materialProfile,
            status: row.status === 'profile_override_candidate' || row.status === 'color_override_candidate' ? 'matches' : row.status,
            statusMessage: 'La regla global del color coincide con la evidencia SAP validada.',
          }
          : row
        setWorkspace(current => current ? {
          ...current,
          boardMatrix: current.boardMatrix?.map(updateRow),
        } : current)
        setBoardMatrixCoverage(current => current?.map(coverage => coverage.sourceColorCode === draft.sourceColorCode ? {
          ...coverage,
          rows: coverage.rows.map(updateRow),
        } : coverage) ?? null)
        setBoardColorRuleEditor(null)
      } catch (error) {
        setBoardMatrixMessage(error instanceof Error ? error.message : 'No se pudo guardar la regla global de tablero.')
      }
    })
  }

  function openBoardConditionalRuleEditor(sourceColorCode: string, strategies: BoardMatrixConditionalStrategy[]): void {
    const firstStrategy = strategies[0]
    if (!firstStrategy) return
    setBoardConditionalRuleEditor({
      sourceColorCode,
      strategies,
      selectedStrategyId: firstStrategy.strategyId,
      saveResult: null,
    })
  }

  function saveBoardConditionalRule(): void {
    if (!boardConditionalRuleEditor) return
    const draft = boardConditionalRuleEditor
    const selectedStrategy = draft.strategies.find(strategy => strategy.strategyId === draft.selectedStrategyId)
    if (!selectedStrategy) return
    const hasPendingDualCandidate = boardMatrixCoverage?.some(coverage =>
      coverage.sourceColorCode === draft.sourceColorCode && coverage.dualCandidates.length > 0
    ) ?? false
    runTask(async () => {
      try {
        const result = await saveTransientBoardConditionalProfileRuleAction({
          sourceColorCode: draft.sourceColorCode,
          defaultBoardColorCode: selectedStrategy.defaultBoardColorCode,
          defaultMaterialProfile: selectedStrategy.defaultMaterialProfile,
          conditions: selectedStrategy.conditions,
        })
        setBoardMatrixMessage(result.message)
        setBoardConditionalRuleEditor(current => current ? {
          ...current,
          saveResult: { success: result.success, message: result.message },
        } : current)
        if (!result.success) return
        const updateRow = (row: BoardMatrixRow): BoardMatrixRow => row.sourceColorCode === draft.sourceColorCode && row.role === 'full_product'
          ? {
            ...row,
            proposedColorCode: selectedStrategy.defaultBoardColorCode,
            proposedMaterialProfile: selectedStrategy.defaultMaterialProfile,
            hasConditionalBoardRule: true,
            hasPersistedBoardResolution: false,
            status: hasPendingDualCandidate ? row.status : 'matches',
            statusMessage: hasPendingDualCandidate
              ? 'La estrategia unicolor está guardada, pero este color conserva casos Dual pendientes de decisión.'
              : 'La estrategia condicional de tablero está guardada en la configuración del color.',
          }
          : row
        setWorkspace(current => current ? {
          ...current,
          boardMatrix: current.boardMatrix?.map(updateRow),
        } : current)
        const coverage = boardMatrixCoverage?.find(item => item.sourceColorCode === draft.sourceColorCode)
        if (coverage) {
          const updatedCoverage = {
            ...coverage,
            rows: coverage.rows.map(updateRow),
            boardProfileConditions: result.boardProfileConditions ?? coverage.boardProfileConditions,
            conditionalRuleStrategies: [],
          }
          setBoardMatrixCoverage(current => current?.map(item => item.sourceColorCode === draft.sourceColorCode ? updatedCoverage : item) ?? null)
          await persistClosedBoardResolution(updatedCoverage)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo guardar la regla condicional de tablero.'
        setBoardMatrixMessage(message)
        setBoardConditionalRuleEditor(current => current ? { ...current, saveResult: { success: false, message } } : current)
      }
    })
  }

  function chooseBoardDualColorCase(candidate: BoardDualCandidateWithColor): void {
    setSelectedBoardDualColorCases(current => {
      const selected = current[candidate.sourceColorCode]
      if (selected && boardDualCandidateKey(selected) === boardDualCandidateKey(candidate)) {
        const remaining = { ...current }
        delete remaining[candidate.sourceColorCode]
        return remaining
      }
      return { ...current, [candidate.sourceColorCode]: candidate }
    })
  }

  function saveBoardDualColorCase(candidate: BoardDualCandidateWithColor): void {
    runTask(async () => {
      try {
        const result = await saveTransientBoardDualColorCaseAction({
          sourceColorCode: candidate.sourceColorCode,
          skuCompletes: candidate.cases.map(candidateCase => candidateCase.skuComplete),
          structureColorCode: candidate.structureColorCode,
          structureMaterialProfile: candidate.structureMaterialProfile,
          frontColorCode: candidate.frontColorCode,
          frontMaterialProfile: candidate.frontMaterialProfile,
        })
        setBoardMatrixMessage(result.message)
        if (result.success && result.savedConfiguration) {
          const candidateKey = boardDualCandidateKey(candidate)
          setSavedBoardDualColorResults(current => ({ ...current, [candidateKey]: result }))
          setWorkspace(current => current ? {
            ...current,
            boardMatrix: current.boardMatrix?.map(row => row.sourceColorCode === candidate.sourceColorCode
              ? { ...row, hasPersistedBoardResolution: false }
              : row),
          } : current)
          const coverage = boardMatrixCoverage?.find(item => item.sourceColorCode === candidate.sourceColorCode)
          if (coverage) {
            const updatedCoverage = { ...coverage, boardDualConfiguration: result.savedConfiguration }
            setBoardMatrixCoverage(current => current?.map(item => item.sourceColorCode === candidate.sourceColorCode ? updatedCoverage : item) ?? null)
            await persistClosedBoardResolution(updatedCoverage)
          }
          setSelectedBoardDualColorCases(current => {
            const next = { ...current }
            delete next[candidate.sourceColorCode]
            return next
          })
        }
      } catch (error) {
        setBoardMatrixMessage(error instanceof Error ? error.message : 'No se pudo guardar el caso Dual del color.')
      }
    })
  }

  function applyBoardDualCandidateSkuOverrides(candidate: BoardDualCandidateWithColor): void {
    const candidateKey = boardDualCandidateOverrideKey(candidate)
    if (!boardDualCandidateOverrideReviewed[candidateKey]) return
    setBoardDualCandidateOverrideApplyingKey(candidateKey)
    runTask(async () => {
      try {
        const result = await saveTransientBoardDualSkuOverridesAction({
          sourceColorCode: candidate.sourceColorCode,
          skuCompletes: candidate.cases.map(candidateCase => candidateCase.skuComplete),
          structureColorCode: candidate.structureColorCode,
          structureMaterialProfile: candidate.structureMaterialProfile,
          frontColorCode: candidate.frontColorCode,
          frontMaterialProfile: candidate.frontMaterialProfile,
          isSapDeviation: boardDualCandidateDeviation[candidateKey] === true,
        })
        setBoardMatrixMessage(result.message)
        if (result.success && result.savedSkuOverride) {
          setSavedBoardDualSkuOverrideResults(current => ({ ...current, [candidateKey]: result }))
          setWorkspace(current => current ? {
            ...current,
            boardMatrix: current.boardMatrix?.map(row => row.sourceColorCode === candidate.sourceColorCode
              ? { ...row, hasPersistedBoardResolution: false }
              : row),
          } : current)
          const coverage = boardMatrixCoverage?.find(item => item.sourceColorCode === candidate.sourceColorCode)
          if (coverage) {
            const savedSkuCompletes = new Set(result.savedSkuOverride.skuCompletes)
            const retainedOverrides = coverage.boardDualSkuOverrides.flatMap(override => {
              const retainedSkuCompletes = override.skuCompletes.filter(skuComplete => !savedSkuCompletes.has(skuComplete))
              return retainedSkuCompletes.length > 0 ? [{ ...override, skuCompletes: retainedSkuCompletes }] : []
            })
            const updatedCoverage = {
              ...coverage,
              boardDualSkuOverrides: [...retainedOverrides, result.savedSkuOverride],
            }
            setBoardMatrixCoverage(current => current?.map(item => item.sourceColorCode === candidate.sourceColorCode ? updatedCoverage : item) ?? null)
            await persistClosedBoardResolution(updatedCoverage)
          }
        }
      } catch (error) {
        setBoardMatrixMessage(error instanceof Error ? error.message : 'No se pudieron guardar los overrides Dual por SKU.')
      } finally {
        setBoardDualCandidateOverrideApplyingKey(null)
      }
    })
  }

  function publishRun(): void {
    if (!workspace) return
    runTask(async () => {
      const result = await publishTransientReferenceBomAction({
        referenceId: workspace.run.referenceId,
        semanticScopeAssignments: Object.values(referenceScopeAssignments),
      })
      setMessage(result.message)
      if (result.workspace) {
        setWorkspace(result.workspace)
        setReferenceScopeAssignments({})
      }
    })
  }

  return (
    <div className="bom-screen mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <Link href="/product-design" className="text-sm font-semibold text-sky-700 hover:text-sky-900">← Producto</Link>
          <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700">LdM/BOM SAP</p>
        </div>
      </header>

      {isReferencePickerOpen ? <section className="hidden border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">Cambiar referencia</h2>
            <p className="mt-1 text-xs text-slate-500">Busca por código o por el nombre que identifica el producto.</p>
          </div>
          <button type="button" onClick={() => setIsReferencePickerOpen(false)} className="h-8 border border-slate-300 px-3 text-xs font-semibold text-slate-700">Cerrar</button>
        </div>
        <div className="mt-3 flex gap-2">
          <input autoFocus value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') searchReferences() }} placeholder="Código o nombre del producto" className="h-9 min-w-0 flex-1 border border-slate-300 px-3 text-sm outline-none ring-sky-600 focus:ring-1" />
          <button type="button" title="Buscar referencias" onClick={searchReferences} disabled={isPending} className="inline-flex h-9 w-9 items-center justify-center border border-slate-300 text-slate-700 disabled:opacity-50"><Search className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {candidates.map(candidate => {
            const selected = candidate.referenceId === selectedCandidate?.referenceId
            return <button key={candidate.referenceId} type="button" onClick={() => selectReference(candidate)} className={`border px-3 py-2 text-left ${selected ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
              <span className="block font-mono text-xs font-semibold text-slate-700">{salesReferenceCode(candidate.familyCode, candidate.referenceCode)}</span>
              <span className="mt-1 block text-sm font-medium text-slate-950">{candidate.productDescription ?? candidate.productName}</span>
              <span className="mt-1 block text-xs text-slate-500">{candidate.activeSkuCount} colores activos</span>
              {candidate.hasBom ? <span className="mt-2 inline-flex border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">BOM ya publicada · se sobreescribe al publicar</span> : null}
            </button>
          })}
          {candidates.length === 0 ? <p className="px-1 py-4 text-sm text-slate-500">Sin referencias para mostrar.</p> : null}
        </div>
      </section> : null}

      <section className="flex min-w-0 flex-col gap-5">
        {isReferencePickerOpen ? <section className="hidden border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Buscar producto de venta</h2>
              <p className="mt-1 text-xs text-slate-500">Elige una referencia y el selector volverá a cerrarse.</p>
            </div>
            <button type="button" onClick={() => setIsReferencePickerOpen(false)} className="h-8 border border-slate-300 px-3 text-xs font-semibold text-slate-700">Cerrar</button>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              autoFocus
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') searchReferences() }}
              placeholder="Código de producto, por ejemplo VBAN05-0001"
              className="h-9 min-w-0 flex-1 border border-slate-300 px-3 text-sm outline-none ring-sky-600 focus:ring-1"
            />
            <button type="button" title="Buscar referencias" onClick={searchReferences} disabled={isPending} className="inline-flex h-9 w-9 items-center justify-center border border-slate-300 text-slate-700 disabled:opacity-50"><Search className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {candidates.map(candidate => {
              const selected = candidate.referenceId === selectedCandidate?.referenceId
              return <button key={candidate.referenceId} type="button" onClick={() => selectReference(candidate)} className={`border px-3 py-2 text-left ${selected ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <span className="block font-mono text-xs font-semibold text-slate-700">{salesReferenceCode(candidate.familyCode, candidate.referenceCode)}</span>
                <span className="mt-1 block text-sm font-medium text-slate-950">{candidate.productName}</span>
                <span className="mt-1 block text-xs text-slate-500">{candidate.activeSkuCount} colores activos</span>
              </button>
            })}
            {candidates.length === 0 ? <p className="px-1 py-4 text-sm text-slate-500">Sin referencias para mostrar.</p> : null}
          </div>
        </section> : null}

        <div className="flex min-w-0 flex-col gap-5">
          <section className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sr-only">Referencia seleccionada</p>
                <h2 className="flex flex-wrap items-center gap-x-2 text-lg font-semibold text-slate-950">
                  <span>{selectedCandidate ? salesReferenceCode(selectedCandidate.familyCode, selectedCandidate.referenceCode) : 'Sin seleccion'}</span>
                  <span className="text-slate-400" aria-hidden="true">|</span>
                  <span>{selectedCandidate?.productDescription ?? selectedCandidate?.productName ?? 'Selecciona una referencia'}</span>
                </h2>
                {selectedCandidate ? (
                  <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-600">
                    {selectedCandidate.manufacturingProcess ?? 'Proceso sin definir'}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIsReferencePickerOpen(current => !current)} className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">
                <Search className="h-4 w-4" />
                Cambiar referencia
              </button>
              <button
                type="button"
                onClick={() => analyzeSelectedReference({ retryPendingBomReads: true })}
                disabled={!selectedCandidate || Boolean(analysisProgress)}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {analysisProgress ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                {analysisProgress ? 'Analizando SAP…' : hasIncompleteSapRead
                  ? canRetryOnlyPendingBomReads ? 'Reintentar LdM pendientes' : 'Analizar LdM en SAP'
                  : hasSapCatalogMismatch
                    ? 'Volver a comprobar SAP'
                    : 'Comparar LdM en SAP'}
              </button>
              </div>
            </div>
          </section>

          {isReferencePickerOpen ? <section className="border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex gap-2">
              <input autoFocus value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') searchReferences() }} placeholder="Código o descripción del producto" className="h-9 min-w-0 flex-1 border border-slate-300 px-3 text-sm outline-none ring-sky-600 focus:ring-1" />
              <button type="button" title="Buscar referencias" onClick={searchReferences} disabled={isPending} className="inline-flex h-9 w-9 items-center justify-center border border-slate-300 text-slate-700 disabled:opacity-50"><Search className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {candidates.map(candidate => {
                const selected = candidate.referenceId === selectedCandidate?.referenceId
                return <button key={candidate.referenceId} type="button" onClick={() => selectReference(candidate)} className={`border px-3 py-2 text-left ${selected ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                  <span className="block font-mono text-xs font-semibold text-slate-700">{salesReferenceCode(candidate.familyCode, candidate.referenceCode)}</span>
                  <span className="mt-1 block text-sm font-medium text-slate-950">{candidate.productDescription ?? candidate.productName}</span>
                  <span className="mt-1 block text-xs text-slate-500">{candidate.activeSkuCount} colores activos</span>
                  {candidate.hasBom ? <span className="mt-2 inline-flex border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">BOM ya publicada · se sobreescribe al publicar</span> : null}
                </button>
              })}
              {candidates.length === 0 ? <p className="px-1 py-4 text-sm text-slate-500">Sin referencias para mostrar.</p> : null}
            </div>
          </section> : null}

          {message ? (
            <div className="flex items-start gap-2 border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <p>{message}</p>
            </div>
          ) : null}

          {analysisProgress ? <section aria-live="polite" className="border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-950">
            <div className="flex items-center gap-2 font-semibold"><LoaderCircle className="h-4 w-4 animate-spin" />Análisis SAP en curso</div>
            <p className="mt-1">Tiempo transcurrido: {formatElapsedSeconds(analysisElapsedSeconds)}</p>
            <p className="mt-1">{analysisProgress.message}{analysisProgress.current !== null && analysisProgress.total !== null ? ` (${analysisProgress.current} de ${analysisProgress.total})` : ''}</p>
            {analysisProgress.total !== null && analysisProgress.total > 0 ? <progress className="mt-3 h-2 w-full accent-sky-700" value={analysisProgress.current ?? 0} max={analysisProgress.total} /> : <div className="mt-3 h-2 w-full animate-pulse bg-sky-200" />}
          </section> : null}

          {workspace ? (
            <>
              {boardMatrixRows.length > 0 ? (
                <section className="border border-violet-200 bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-100 bg-violet-50 px-5 py-4">
                    <div>
                      <h2 className="font-semibold text-slate-950">Matriz interna de tableros (V03)</h2>
                      <p className="mt-1 text-sm text-slate-600">SAP define primero la cobertura transversal; Supabase se contrasta después. Las reglas globales solo se habilitan con evidencia completa y uniforme.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={toggleAllBoardExceptions} disabled={boardExceptionRows.length === 0} className="h-9 border border-violet-300 bg-white px-3 text-sm font-semibold text-violet-900 disabled:opacity-50">
                      {allBoardExceptionsSelected ? 'Quitar selección' : `Seleccionar excepciones (${boardExceptionRows.length})`}
                    </button>
                    <button type="button" onClick={verifyBoardMatrixInSap} disabled={isPending || Boolean(boardMatrixVerificationProgress) || selectedBoardColorCodes.length === 0} className="inline-flex h-9 items-center gap-2 border border-violet-300 bg-white px-3 text-sm font-semibold text-violet-900 disabled:opacity-50">
                      {boardMatrixVerificationProgress ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                      {boardMatrixVerificationProgress ? 'Revalidando SAP…' : 'Revalidar colores seleccionados'}
                    </button>
                    </div>
                  </div>
                  <div className="grid border-b border-violet-100 bg-white text-sm sm:grid-cols-3">
                    <div className="border-b border-violet-100 px-5 py-3 sm:border-b-0 sm:border-r"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patron principal</p><p className="mt-1 font-mono font-semibold text-slate-900">{boardReferenceProfile ?? 'Pendiente'}</p><p className="mt-1 text-xs text-slate-500">Perfiles vistos: {boardReferenceProfiles.join(', ') || '-'}</p></div>
                    <div className="border-b border-violet-100 px-5 py-3 sm:border-b-0 sm:border-r"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consumo normalizado</p><p className="mt-1 font-mono font-semibold text-slate-900">{boardStandardConsumption === null ? 'Pendiente' : formatMatrixQuantity(boardStandardConsumption)}</p><p className="mt-1 text-xs text-slate-500">Mayor consumo observado por rol, sin depender del formato.</p></div>
                    <div className="px-5 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pendientes de contraste</p><p className="mt-1 font-semibold text-slate-900">{boardExceptionRows.length} caso(s)</p><p className="mt-1 text-xs text-slate-500">{boardStandardRows.length} fila(s) válidas y alineadas para construcción BOM base.</p></div>
                  </div>
                  {boardMatrixVerificationProgress ? <div aria-live="polite" className="border-b border-violet-100 bg-violet-50 px-5 py-3 text-sm text-violet-950">
                    <p className="font-semibold">Revalidación de tableros en curso</p>
                    <p className="mt-1">Tiempo transcurrido: {formatElapsedSeconds(boardMatrixVerificationElapsedSeconds)}</p>
                    <p className="mt-1">{boardMatrixVerificationProgress.message}{boardMatrixVerificationProgress.current !== null && boardMatrixVerificationProgress.total !== null ? ` (${boardMatrixVerificationProgress.current} de ${boardMatrixVerificationProgress.total})` : ''}</p>
                    {boardMatrixVerificationProgress.total !== null && boardMatrixVerificationProgress.total > 0 ? <progress className="mt-3 h-2 w-full accent-violet-700" value={boardMatrixVerificationProgress.current ?? 0} max={boardMatrixVerificationProgress.total} /> : <div className="mt-3 h-2 w-full animate-pulse bg-violet-200" />}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button type="button" onClick={cancelBoardMatrixVerification} className="h-8 border border-violet-400 bg-white px-3 text-xs font-semibold text-violet-950">Cancelar validación SAP</button>
                      <p className="text-xs text-violet-900">Detiene las siguientes consultas del lote; una consulta SAP ya iniciada puede terminar.</p>
                    </div>
                  </div> : null}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Verificar</th><th className="px-3 py-3">Color producto</th><th className="px-3 py-3">Rol lógico</th><th className="px-3 py-3">Tablero SAP / candidato</th><th className="px-3 py-3">Perfil SAP / patrón</th><th className="px-3 py-3">Bases, formatos y consumo</th><th className="px-3 py-3">Estado</th></tr></thead>
                      <tbody className="divide-y divide-slate-200">
                        {boardExceptionRows.map(row => <tr key={row.key} className="align-top text-slate-800">
                          <td className="px-3 py-3"><input aria-label={`Verificar color ${row.sourceColorCode}`} type="checkbox" checked={selectedBoardColors[row.sourceColorCode] === true} onChange={event => { setSelectedBoardColors(current => ({ ...current, [row.sourceColorCode]: event.target.checked })); setVisibleBoardCoverageColorCodes([]); setSelectedBoardInactiveAppSkus({}); setBoardColorRuleEditor(null); setBoardMatrixMessage(null) }} /></td>
                          <td className="px-3 py-3 font-mono font-semibold">{row.sourceColorCode}</td>
                          <td className="px-3 py-3"><p>{boardRoleLabel(row)}</p><p className="mt-1 text-xs text-slate-500">{row.roleSource === 'published_bom' ? 'BOM publicada' : row.roleSource === 'sku_override' ? 'Override semántico vigente' : row.roleSource === 'evidence' ? 'Unico tablero en LdM' : 'Sin evidencia suficiente'}</p></td>
                          <td className="px-3 py-3 font-mono text-xs"><p>{row.observedColorCodes.join(', ') || '-'}</p>{row.recommendedColorCode ? <p className="mt-1 text-slate-500">Interno candidato: {row.recommendedColorCode}</p> : row.isProductColorMatch ? <p className="mt-1 text-emerald-700">Coincide con producto</p> : null}{row.proposedColorCode ? <p className="mt-1 text-slate-500">Configurado: {row.proposedColorCode}</p> : null}</td>
                          <td className="px-3 py-3 font-mono text-xs"><p>{row.observedMaterialProfiles.join(', ') || '-'}</p><p className="mt-1 text-slate-500">Principal: {row.referenceMaterialProfile ?? 'Pendiente'}</p><p className="mt-1 text-slate-500">Vistos: {row.referenceMaterialProfiles.join(', ') || '-'}</p>{row.status === 'profile_override_candidate' && row.recommendedMaterialProfile ? <p className="mt-1 text-violet-800">Candidato según SAP: {row.recommendedMaterialProfile}</p> : null}</td>
                          <td className="px-3 py-3 text-xs"><p>{row.baseItemCodes.join(', ') || '-'}</p><p className="mt-1 font-mono text-slate-500">{row.formatKeys.join(', ') || 'Formato pendiente'}</p><p className="mt-1 font-mono font-semibold text-violet-900">Max.: {row.normalizedConsumptionQty === null ? 'Pendiente' : formatMatrixQuantity(row.normalizedConsumptionQty)}</p></td>
                          <td className="px-3 py-3"><p className={row.status === 'matches' ? 'font-semibold text-emerald-700' : row.status === 'conflict_real' ? 'font-semibold text-rose-700' : 'font-semibold text-amber-700'}>{boardMatrixStatusLabel(row.status)}</p><p className="mt-1 max-w-xs text-xs text-slate-500">{row.statusMessage}</p><details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-violet-800">{row.evidence.length} evidencia(s) SAP</summary><div className="mt-1 space-y-1 font-mono text-slate-600">{row.evidence.map(item => <p key={`${item.skuComplete}:${item.itemCode}:${item.lineIdentity}`}>{item.skuComplete} · {item.itemCode} · {formatMatrixQuantity(item.qty)}{(item.sourceLineCount ?? 1) > 1 ? ` · ${item.sourceLineCount} líneas SAP consolidadas` : ''}</p>)}</div></details></td>
                        </tr>)}
                      </tbody>
                    </table>
                  </div>
                  {boardExceptionRows.length === 0 ? <p className="border-t border-violet-100 px-5 py-4 text-sm text-emerald-800">No hay excepciones para contrastar: todos los tableros observados coinciden con el patrón actual.</p> : null}
                  {boardConditionalReviewRows.length > 0 ? <section className="border-t border-violet-100 bg-violet-50 px-5 py-4 text-sm text-violet-950">
                    <p className="font-semibold">Reglas condicionales vigentes</p>
                    <p className="mt-1 text-xs text-violet-900">Ya están guardadas en Supabase, pero no se cuentan como filas válidas de la BOM base. Revalídalas para consultar SAP nuevamente y continuar con cualquier caso Dual que aparezca.</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {boardConditionalReviewRows.map(row => <label key={row.key} className="flex cursor-pointer items-start gap-3 border border-violet-200 bg-white p-3 text-xs">
                        <input aria-label={`Revalidar regla condicional del color ${row.sourceColorCode}`} type="checkbox" checked={selectedBoardColors[row.sourceColorCode] === true} onChange={event => { setSelectedBoardColors(current => ({ ...current, [row.sourceColorCode]: event.target.checked })); setVisibleBoardCoverageColorCodes([]); setSelectedBoardInactiveAppSkus({}); setBoardColorRuleEditor(null); setBoardMatrixMessage(null) }} />
                        <span><span className="block font-mono font-semibold text-slate-900">{row.sourceColorCode} · {boardRoleLabel(row)}</span><span className="mt-1 block font-mono text-slate-600">Base: {row.proposedColorCode ?? row.sourceColorCode} · {row.proposedMaterialProfile ?? 'perfil por referencia'}</span><span className="mt-1 block text-violet-900">Seleccionar para revalidar en SAP.</span></span>
                      </label>)}
                    </div>
                  </section> : null}
                  {boardStandardRows.length > 0 ? <details className="border-t border-violet-100 bg-slate-50 px-5 py-3 text-sm text-slate-700"><summary className="cursor-pointer font-semibold text-violet-900">Ver {boardStandardRows.length} fila(s) válidas y alineadas para construcción BOM base</summary><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{boardStandardRows.map(row => <div key={row.key} className="border border-slate-200 bg-white px-3 py-2 text-xs"><p className="font-mono font-semibold text-slate-900">{row.sourceColorCode} · {boardRoleLabel(row)}</p><p className="mt-1 font-mono text-slate-600">{row.observedColorCodes.join(', ')} · {row.observedMaterialProfiles.join(', ')}</p>{row.hasPersistedBoardResolution ? <p className="mt-1 text-emerald-800">Configuración de tableros guardada; SAP se contrasta solo al revalidar.</p> : null}{!row.isProductColorMatch && row.proposedColorCode ? <p className="mt-1 text-emerald-800">Regla configurada: color interno {row.proposedColorCode}</p> : null}<p className="mt-1 text-slate-500">Máx. {row.normalizedConsumptionQty === null ? 'pendiente' : formatMatrixQuantity(row.normalizedConsumptionQty)}</p></div>)}</div></details> : null}
                  <div className="border-t border-violet-100 px-5 py-4 text-sm text-slate-700">
                    {lastBoardMatrixAnalyzedColorCodes.length > 0 ? <p>Análisis SAP recién consultado para {lastBoardMatrixAnalyzedColorCodes.length} color(es); los resultados concilian esa evidencia con el catálogo de Supabase.</p> : null}
                    {boardMatrixMessage ? <p className="mt-2 font-medium text-slate-800" aria-live="polite">{boardMatrixMessage}</p> : null}
                    {boardMatrixCoverage ? <div className="mt-4 space-y-3">
                      {boardMatrixCoverage.filter(result => visibleBoardCoverageColorCodes.includes(result.sourceColorCode)).map(result => {
                        const readyForBaseConstruction = boardColorIsReadyForBaseConstruction(result)
                        const reports = boardCoverageReports({ result, referenceRows: boardMatrixRows })
                        const candidate = result.fullProductRuleCandidate
                        const candidateAlreadyConfigured = candidate !== null && result.rows.some(row =>
                          row.role === 'full_product'
                          && row.proposedColorCode === candidate.boardColorCode
                          && row.proposedMaterialProfile === candidate.materialProfile
                        )
                        const boardDualCandidates = result.dualCandidates.map(dualCandidate => ({ ...dualCandidate, sourceColorCode: result.sourceColorCode }))
                        const dualCandidateSkuCompletes = new Set(boardDualCandidates.flatMap(candidate => candidate.cases.map(candidateCase => candidateCase.skuComplete)))
                        const pendingRoleAlreadyGroupedAsDual = reports.some(report =>
                          report.kind === 'role_pending'
                          && report.evidenceSkuCompletes.length > 0
                          && report.evidenceSkuCompletes.every(skuComplete => dualCandidateSkuCompletes.has(skuComplete))
                        )
                        const visibleReports = reports.filter(report =>
                          !(candidateAlreadyConfigured && report.role === 'full_product' && report.kind === 'consistent')
                           && !(report.kind === 'role_pending' && report.evidenceSkuCompletes.length > 0 && report.evidenceSkuCompletes.every(skuComplete => dualCandidateSkuCompletes.has(skuComplete)))
                           && report.kind !== 'dual_evidence'
                        )
                        const conditionalRuleStrategies = boardConditionalStrategiesForCoverage({ result, referenceRows: boardMatrixRows })
                        return <div key={result.sourceColorCode} className="border border-violet-200 bg-violet-50 p-3 text-violet-950">
                           <p className="font-semibold">Cobertura SAP del color {result.sourceColorCode}: {result.checkedSkuCount}/{result.sapActiveSkuCount} SKU activos con LdM leída</p>
                           <p className="mt-1 text-xs">Supabase: {result.supabaseActiveSkuCount} SKU activos no kit · Excluidos por SAP: {result.excludedInactiveSapSkuCount} inactivo(s) y {result.excludedKitSkuCount} kit(s).</p>
                           {result.boardProfileConditions.length > 0 ? <div className="mt-3 border border-violet-200 bg-white p-2 text-xs text-violet-950"><p className="font-semibold">Reglas condicionales de tablero vigentes</p>{result.boardProfileConditions.map(rule => <p key={rule.rule_id} className="mt-1 font-mono">Si perfil base {rule.source_material_profile}: tablero {rule.target_color_code} · {rule.target_material_profile}</p>)}</div> : null}
                           <details className="mt-2 text-xs text-slate-700"><summary className="cursor-pointer font-semibold text-violet-900">Ver los {result.sapActiveSkus.length} SKU de venta incluidos</summary><div className="mt-2 space-y-1 border-l-2 border-violet-200 pl-3 font-mono"><p className="font-sans text-slate-600">Solo códigos V*, versión 000; el tablero CMPD no cuenta como SKU de cobertura.</p>{result.sapActiveSkus.map(sku => <p key={sku.skuComplete}><span className="font-semibold">{sku.skuComplete}</span> · {sku.skuItemName ?? 'Sin nombre SAP'} · {sku.bomRead ? 'LdM leída' : 'LdM no leída'}</p>)}</div></details>
                          {visibleReports.length > 0 ? <div className="mt-3 grid gap-2 xl:grid-cols-2">
                            {visibleReports.map(report => <div key={report.key} className={`border p-3 text-xs ${boardCoverageReportClass(report.kind)}`}>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <p className="font-semibold">{report.role === 'role_pending' ? 'Pendiente de definir' : scopeLabel(report.role)}</p>
                                <span className="font-semibold">{boardCoverageReportLabel(report.kind)}</span>
                              </div>
                              <p className="mt-2">SAP observado en {report.evidenceSkuCount}/{result.checkedSkuCount} SKU leídos</p>
                               <p className="mt-1 font-mono">Tablero: {report.observedColorCodes.join(', ') || '-'} · Perfil: {report.observedMaterialProfiles.join(', ') || '-'}</p>
                              <p className="mt-2">{report.conclusion}</p>
                              {report.role === 'full_product' && conditionalRuleStrategies.length > 0 ? <button type="button" onClick={() => openBoardConditionalRuleEditor(result.sourceColorCode, conditionalRuleStrategies)} disabled={isPending} className="mt-3 h-8 border border-violet-300 bg-white px-2 text-xs font-semibold text-violet-950 disabled:opacity-50">Ver alternativas unicolor por perfil</button> : null}
                              {report.examples.length > 0 ? <div className="mt-3 border-t border-current/20 pt-2 text-[11px]">
                                <p className="font-semibold">Ejemplos SAP representativos ({report.examples.length} línea(s), {report.evidenceSkuCount} SKU con evidencia)</p>
                                <div className="mt-1 space-y-1">
                                  {report.examples.map(example => <p key={`${report.key}:${example.skuComplete}:${example.itemCode}`}><span className="font-mono font-semibold">{example.skuComplete}</span> · {example.skuItemName ?? 'Sin nombre SAP'} · <span className="font-mono">{example.itemCode}</span> · tablero {example.boardColorCode} · {example.materialProfile ?? 'perfil pendiente'} · {formatMatrixQuantity(example.qty)}{example.skuBoardPatterns.length > 1 ? ` · En este SKU: ${example.skuBoardPatterns.join(' + ')}` : ''}</p>)}
                                </div>
                              </div> : null}
                               {report.kind === 'variation' ? <div className="mt-3 grid gap-2 md:grid-cols-3">
                                 {report.profileSummaries.map(summary => <div key={summary.materialProfile} className="border border-slate-300 bg-white p-2 text-slate-800">
                                   <p className="font-mono font-semibold">{summary.materialProfile}: {summary.skuCount} SKU</p>
                                   <p className="mt-1 text-slate-600">Ejemplos SAP:</p>
                                   <div className="mt-1 space-y-1 font-mono text-[11px] text-slate-600">
                                     {summary.examples.map(example => <p key={`${summary.materialProfile}:${example.skuComplete}:${example.itemCode}`}><span className="font-semibold text-slate-800">{example.skuComplete}</span> · {example.skuItemName ?? 'Sin nombre SAP'}</p>)}
                                   </div>
                                 </div>)}
                               </div> : null}
                             </div>)}
                          </div> : <p className="mt-3 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">SAP leyó las LdM, pero no encontró una línea de tablero elegible para resumir.</p>}
                           {boardDualCandidates.length > 0 ? <div className="mt-3 border border-violet-200 bg-white p-3 text-xs text-violet-950">
                             <p className="font-semibold">Casos Dual de tableros detectados por SAP</p>
                             <p className="mt-1 text-slate-600">Cada caso reúne SKU con exactamente dos tableros. La mayor área observada propone estructura y la menor frente; elige un único caso para el color o guárdalo como override de esos SKU.</p>
                              {pendingRoleAlreadyGroupedAsDual ? <p className="mt-1 text-slate-600">Los SKU sin rol publicado ya están agrupados en estos casos Dual; no se repiten como pendiente separado.</p> : null}
                              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                               {boardDualCandidates.map((dualCandidate, index) => {
                                 const candidateKey = boardDualCandidateKey(dualCandidate)
                                 const overrideKey = boardDualCandidateOverrideKey(dualCandidate)
                                  const selectedAsColorCase = selectedBoardDualColorCases[result.sourceColorCode]
                                    && boardDualCandidateKey(selectedBoardDualColorCases[result.sourceColorCode]) === candidateKey
                                  const configuredBoardDual = boardDualConfigurationMatchesCandidate(result.boardDualConfiguration, dualCandidate)
                                  const persistedSkuOverride = result.boardDualSkuOverrides.find(override => boardDualSkuOverrideMatchesCandidate(override, dualCandidate))
                                  const colorSaveResult = savedBoardDualColorResults[candidateKey]
                                  const skuOverrideSaveResult = savedBoardDualSkuOverrideResults[overrideKey]
                                  const savedAsSkuOverride = Boolean(persistedSkuOverride) || skuOverrideSaveResult?.success === true
                                  const savedAsColorCase = configuredBoardDual || savedAsSkuOverride
                                 const overrideReviewed = boardDualCandidateOverrideReviewed[overrideKey] === true
                                 const overrideApplying = boardDualCandidateOverrideApplyingKey === overrideKey
                                 return <article key={candidateKey} className="border border-violet-200 bg-violet-50 p-3 text-slate-800">
                                   <div className="flex flex-wrap items-start justify-between gap-2">
                                     <div>
                                       <p className="font-semibold text-violet-950">Caso {index + 1}</p>
                                       <p className="mt-1 font-mono text-xs">Estructura propuesta: {dualCandidate.structureColorCode} · {dualCandidate.structureMaterialProfile}</p>
                                       <p className="font-mono text-xs">Frente propuesto: {dualCandidate.frontColorCode} · {dualCandidate.frontMaterialProfile}</p>
                                       <p className="mt-1 text-xs text-slate-600">{dualCandidate.evidenceSkuCount} SKU con este patrón.</p>
                                     </div>
                                      <button type="button" onClick={() => chooseBoardDualColorCase(dualCandidate)} disabled={isPending || savedAsSkuOverride} className={`border px-2 py-1.5 text-xs font-semibold disabled:opacity-50 ${selectedAsColorCase ? 'border-violet-800 bg-violet-800 text-white' : 'border-violet-300 bg-white text-violet-950'}`}>{savedAsSkuOverride ? 'Resuelto por override SKU' : selectedAsColorCase ? 'Definición Dual elegida' : 'Usar definición Dual'}</button>
                                   </div>
                                   <div className="mt-3 space-y-2 border-t border-violet-200 pt-2">
                                     {dualCandidate.cases.map(candidateCase => <div key={candidateCase.skuComplete} className="text-[11px]">
                                       <p><span className="font-mono font-semibold">{candidateCase.skuComplete}</span>{candidateCase.skuItemName ? ` — ${candidateCase.skuItemName}` : ''}</p>
                                       <p className="mt-1 text-slate-600">Estructura: {formatMatrixQuantity(candidateCase.structureQty)} · Frente: {formatMatrixQuantity(candidateCase.frontQty)}</p>
                                       {candidateCase.boardLines.map(boardLine => <p key={`${candidateCase.skuComplete}:${boardLine.itemCode}:${boardLine.qty}`} className="mt-1 font-mono text-slate-600">{boardLine.itemCode}{boardLine.itemName ? ` — ${boardLine.itemName}` : ''} · {boardLine.colorCode} · {boardLine.materialProfile ?? 'perfil pendiente'} · {formatMatrixQuantity(boardLine.qty)}</p>)}
                                     </div>)}
                                   </div>
                                    {configuredBoardDual ? <div className={`mt-3 border p-2 ${colorSaveResult?.verification?.state === 'effective' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                                      <p className="font-semibold">Dual de tableros guardado en Estructura y Frente</p>
                                      <p className="mt-1">Se confirmó en Supabase: estructura {dualCandidate.structureColorCode} · {dualCandidate.structureMaterialProfile}; frente {dualCandidate.frontColorCode} · {dualCandidate.frontMaterialProfile}. Los SKU con estos dos roles usan esta definición; los unicolor siguen usando Producto completo. No modifica cantos.</p>
                                     {colorSaveResult?.verification ? <div className="mt-2 border-t border-current/20 pt-2"><p className="font-semibold">Comprobación de resolución</p>{colorSaveResult.verification.state === 'effective' ? <p className="mt-1">La BOM resuelta confirmó estructura y frente para todos los SKU afectados.</p> : <p className="mt-1">{colorSaveResult.verification.note ?? 'La configuración existe, pero la BOM actual todavía no permite confirmar ambos roles.'}</p>}{colorSaveResult.verification.skuResults.map(verification => <p key={verification.skuComplete} className="mt-1 font-mono">{verification.skuComplete} · estructura {verification.structure.resolvedItemCode ?? 'sin rol'} · frente {verification.front.resolvedItemCode ?? 'sin rol'}</p>)}</div> : <p className="mt-2 text-slate-600">Configuración vigente. Revalida el color para consultar la evidencia SAP actual.</p>}
                                   </div> : null}
                                    {savedAsSkuOverride ? <div className={`mt-3 border p-2 ${skuOverrideSaveResult?.verification?.state === 'effective' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                                      <p className="font-semibold">Overrides por SKU confirmados en Supabase</p>
                                      <p className="mt-1">{skuOverrideSaveResult ? `Se releieron los ${dualCandidate.cases.length} SKU` : `Se encontró esta configuración vigente para los ${dualCandidate.cases.length} SKU`} con estructura {dualCandidate.structureColorCode} · {dualCandidate.structureMaterialProfile} y frente {dualCandidate.frontColorCode} · {dualCandidate.frontMaterialProfile}. No modifica cantos.</p>
                                      {skuOverrideSaveResult?.verification?.state === 'effective' ? <p className="mt-2">La BOM resuelta confirmó ambos roles para todos los SKU.</p> : <p className="mt-2">{skuOverrideSaveResult?.verification?.note ?? 'La configuración está guardada. Esta lectura SAP confirma el patrón; la resolución efectiva se comprueba al resolver la BOM de esos SKU.'}</p>}
                                     {skuOverrideSaveResult?.verification?.skuResults.map(verification => <p key={verification.skuComplete} className="mt-1 font-mono">{verification.skuComplete} · estructura {verification.structure.resolvedItemCode ?? 'sin rol'} · frente {verification.front.resolvedItemCode ?? 'sin rol'}</p>)}
                                   </div> : null}
                                    {!savedAsColorCase && (selectedAsColorCase ? <div className="mt-3 border border-violet-300 bg-white p-2"><p className="font-semibold">Aplicar Dual al color</p><p className="mt-1 text-slate-600">Guardará estos valores directamente en Estructura y Frente. Las BOM unicolor continúan usando Producto completo.</p><button type="button" onClick={() => saveBoardDualColorCase(dualCandidate)} disabled={isPending} className="mt-2 bg-violet-800 px-2 py-1.5 font-semibold text-white disabled:opacity-50">Aplicar Dual al color</button></div> : <div className="mt-3 border border-sky-200 bg-sky-50 p-2 text-sky-950"><p className="font-semibold">Override por SKU</p><p className="mt-1">Úsalo si este patrón es específico de estos SKU o una desviación que no debe convertirse en regla del color.</p><label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={boardDualCandidateDeviation[overrideKey] === true} onChange={event => setBoardDualCandidateDeviation(current => ({ ...current, [overrideKey]: event.target.checked }))} disabled={isPending || overrideApplying} /><span>Es una desviación SAP pendiente de corrección humana.</span></label><div className="mt-2 flex flex-wrap items-center gap-2"><label className="inline-flex items-center gap-2 border border-sky-300 bg-white px-2 py-1.5 font-semibold"><input type="checkbox" checked={overrideReviewed} onChange={event => setBoardDualCandidateOverrideReviewed(current => ({ ...current, [overrideKey]: event.target.checked }))} disabled={isPending || overrideApplying} />Revisé los {dualCandidate.cases.length} SKU</label><button type="button" onClick={() => applyBoardDualCandidateSkuOverrides(dualCandidate)} disabled={isPending || overrideApplying || !overrideReviewed} className="border border-sky-700 bg-sky-800 px-2 py-1.5 font-semibold text-white disabled:opacity-50">{overrideApplying ? 'Guardando overrides…' : `Aplicar overrides a ${dualCandidate.cases.length} SKU`}</button></div></div>)}
                                 </article>
                               })}
                             </div>
                           </div> : null}
                           {candidate ? <div className="mt-3 border border-emerald-200 bg-white p-3 text-xs text-emerald-950">
                            <p className="font-semibold">{candidateAlreadyConfigured ? 'Regla global vigente y validada en SAP' : 'Regla global propuesta por SAP'}</p>
                            <p className="mt-1">Producto completo: tablero <span className="font-mono">{candidate.boardColorCode}</span> · perfil <span className="font-mono">{candidate.materialProfile}</span> · cobertura {candidate.evidenceSkuCount}/{result.sapActiveSkuCount} SKU activos.</p>
                            {!candidateAlreadyConfigured ? <button type="button" onClick={() => openBoardColorRuleEditor(candidate, result.sourceColorCode)} disabled={isPending} className="mt-3 h-8 bg-emerald-800 px-2 text-xs font-semibold text-white disabled:opacity-50">Configurar regla global de color</button> : null}
                          </div> : null}
                          {!readyForBaseConstruction && !candidate && result.fullProductRuleBlockers.length > 0 ? <details className="mt-3 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><summary className="cursor-pointer font-semibold">Por qué todavía no se puede guardar una regla global</summary><ul className="mt-2 list-disc space-y-1 pl-4">{result.fullProductRuleBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></details> : null}
                          {result.rows.some(row => row.status === 'role_pending') && !pendingRoleAlreadyGroupedAsDual ? <p className="mt-1 text-xs">Roles no determinables: requieren decisión humana; no se deducen por código físico, base ni cantidad.</p> : null}
                          {result.dualGlobalCandidate ? <p className="mt-3 text-xs font-semibold">Dual global candidato para consulta humana: {result.dualCandidateMessage ?? 'todos los SKU elegibles presentan el mismo patrón Dual.'}</p> : null}
                          {result.sapReadErrors.map(error => <p key={error.skuComplete} className="mt-1 text-xs text-rose-800">{error.skuComplete}: {error.message}</p>)}
                        </div>
                      })}
                      {boardSapInactiveAppCandidates.length > 0 ? <div className="border border-amber-200 bg-amber-50 p-3 text-amber-950">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">Estados por conciliar con Supabase</p>
                            <p className="mt-1 max-w-3xl text-xs">Estos SKU estaban activos en Supabase al iniciar la cobertura, pero SAP los reportó inactivos o congelados en este mismo análisis. No participaron en la comparación. Puedes inactivarlos directamente en Supabase; no se modifica SAP ni se repite el análisis.</p>
                          </div>
                          <button type="button" onClick={toggleAllBoardInactiveAppCandidates} disabled={isPending} className="h-8 border border-amber-300 bg-white px-2 text-xs font-semibold text-amber-900 disabled:opacity-50">
                            {allBoardInactiveAppCandidatesSelected ? 'Quitar selección' : 'Seleccionar todos'}
                          </button>
                        </div>
                        <div className="mt-3 space-y-1 text-xs">
                          {boardSapInactiveAppCandidates.map(item => <label key={item.skuComplete} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedBoardInactiveAppSkus[item.skuComplete] === true}
                              onChange={event => {
                                setSelectedBoardInactiveAppSkus(current => ({ ...current, [item.skuComplete]: event.target.checked }))
                              }}
                            />
                            <span className="font-mono">{item.skuComplete}</span> · {item.skuItemName ?? 'Sin nombre SAP'} · inactivo o congelado en SAP
                          </label>)}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={syncBoardInactiveSkusInSupabase}
                            disabled={isPending || selectedBoardInactiveAppSkuCodes.length === 0}
                            className="h-8 bg-amber-800 px-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {`Inactivar ${selectedBoardInactiveAppSkuCodes.length} SKU en Supabase`}
                          </button>
                        </div>
                      </div> : null}
                      {visibleBoardOtherCatalogIssues.length > 0 ? <div className="border border-slate-200 bg-slate-50 p-3 text-slate-800">
                        <p className="font-semibold">Diferencias SAP ↔ Supabase que requieren decisión</p>
                        <p className="mt-1 text-xs">Se muestran porque pueden cambiar la población real del color. No se registran ni modifican automáticamente; primero define si se debe crear, activar, corregir o excluir cada SKU.</p>
                        <div className="mt-2 space-y-2 text-xs">{visibleBoardOtherCatalogIssues.map(item => <div key={`${item.skuComplete}:${item.reason}`} className="border border-slate-200 bg-white p-2"><p><span className="font-mono font-semibold">{item.skuComplete}</span> · {item.skuItemName ?? 'Sin nombre SAP'} · {boardCatalogIssueLabel(item.reason)}</p>{item.reason === 'sap_only' ? <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => ignoreBoardCatalogIssue(item)} disabled={isPending} className="h-7 border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Ignorar por ahora</button>{item.canCreateColorVariation ? <button type="button" onClick={() => createBoardSapColorVariation(item)} disabled={isPending} className="h-7 bg-sky-800 px-2 text-xs font-semibold text-white disabled:opacity-50">Crear variación de color</button> : null}</div> : null}</div>)}</div>
                      </div> : null}
                    </div> : null}
                  </div>
                </section>
              ) : null}

              {colorMatrixRows.length > 0 ? (
                <section className="border border-sky-200 bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 bg-sky-50 px-5 py-4">
                    <div>
                      <h2 className="font-semibold text-slate-950">Matriz de colores internos y cantos (V12)</h2>
                      <p className="mt-1 text-sm text-slate-600">La propuesta inicial conserva un color interno unicolor global. Si SAP evidencia dos colores de canto en un SKU, compara su consumo total para proponer estructura y frentes.</p>
                      <p className="mt-1 text-sm text-slate-600">Cada caso puede guardarse como un único Dual global o como overrides semánticos para esos SKU. Los overrides no dependen de un formato físico y se activan al publicar la BOM de cada referencia.</p>
                    </div>
                    <button type="button" onClick={verifyColorMatrixInSap} disabled={isPending || Boolean(matrixVerificationProgress) || selectedMatrixRuleCount === 0 || hasInvalidSelectedMatrixTarget} className="inline-flex h-9 items-center gap-2 border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-900 disabled:opacity-50">{matrixVerificationProgress ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{matrixVerificationProgress ? 'Verificando en SAP…' : 'Verificar seleccionadas en SAP'}</button>
                  </div>
                   {matrixVerificationProgress ? <div aria-live="polite" className="border-b border-sky-100 bg-sky-50 px-5 py-3 text-sm text-sky-950">
                    <p className="font-semibold">Verificación de matriz en curso</p>
                    <p className="mt-1">Tiempo transcurrido: {formatElapsedSeconds(matrixVerificationElapsedSeconds)}</p>
                    <p className="mt-1">{matrixVerificationProgress.message}{matrixVerificationProgress.current !== null && matrixVerificationProgress.total !== null ? ` (${matrixVerificationProgress.current} de ${matrixVerificationProgress.total})` : ''}</p>
                    {matrixVerificationProgress.total !== null && matrixVerificationProgress.total > 0 ? <progress className="mt-2 h-2 w-full accent-sky-700" value={matrixVerificationProgress.current ?? 0} max={matrixVerificationProgress.total} /> : <div className="mt-2 h-2 w-full animate-pulse bg-sky-200" />}
                  </div> : null}
                  {Object.entries(matrixDualAlternatives).filter(([, candidates]) => candidates.length > 0).map(([sourceColorCode, candidates]) => (
                    <div key={sourceColorCode} className="border-b border-violet-200 bg-violet-50 px-5 py-3 text-sm text-violet-950">
                      <p className="font-semibold">Conflicto Dual para {sourceColorCode}</p>
                      <p className="mt-1 text-xs">La fila unicolor de la tabla se conserva para el catálogo completo. Elige como máximo un caso Dual global; cada caso alterno puede corregirse en SAP, inactivarse o guardarse como override por SKU.</p>
                      <p className="mt-1 text-xs font-semibold">Unicolor global que se conservará: {matrixCoverage?.results.find(result => result.sourceColorCode === sourceColorCode)?.targetColorCode ?? 'el valor de la tabla'}.</p>
                      <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        {candidates.map((candidate, candidateIndex) => {
                          const candidateOverrideKey = matrixDualCandidateOverrideKey(candidate)
                          const candidateIsSelectedAsDual = isMatrixDualCandidateSelected(selectedMatrixHybridCases, candidate)
                          const candidateOverrideSaved = locallyAppliedMatrixCandidateOverrides[candidateOverrideKey] === true
                          const candidateOverrideReviewed = matrixCandidateOverrideReviewed[candidateOverrideKey] === true
                          const candidateOverrideRequiresSecondPress = matrixCandidateOverrideProceedingKey === candidateOverrideKey
                          const candidateOverrideIsApplying = matrixCandidateOverrideApplyingKey === candidateOverrideKey
                          return <article key={candidateOverrideKey} className="border border-violet-200 bg-white p-3 text-slate-800">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-violet-950">Caso {candidateIndex + 1}: estructura {candidate.structureColorCode} · frentes {candidate.frontColorCode}</p>
                              <p className="mt-1 text-xs text-slate-600">{candidate.evidenceSkuCount} SKU{candidate.evidenceSkuCount === 1 ? '' : 's'} activo{candidate.evidenceSkuCount === 1 ? '' : 's'} con este patrón.</p>
                            </div>
                            <button type="button" onClick={() => chooseDetectedMatrixDual(candidate)} disabled={candidateOverrideSaved || candidateOverrideIsApplying || isPending || isApplyingMatrixCandidateOverrides} className={`border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${candidateIsSelectedAsDual ? 'border-violet-800 bg-violet-800 text-white' : 'border-violet-300 bg-violet-50 text-violet-950'}`}>{candidateOverrideSaved ? 'Resuelto por override SKU' : candidateIsSelectedAsDual ? 'Único caso Dual elegido' : 'Usar como único Dual'}</button>
                          </div>
                          <div className="mt-3 space-y-2">
                            {candidate.cases.map(candidateCase => <div key={candidateCase.skuComplete} className="border-t border-violet-100 pt-2 text-xs">
                              <p><span className="font-mono font-semibold">{candidateCase.skuComplete}</span>{candidateCase.skuItemName ? ` — ${candidateCase.skuItemName}` : ''}</p>
                              <p className="mt-1 text-slate-600">Estructura {candidate.structureColorCode}: {formatMatrixQuantity(candidateCase.structureQty)} · Frentes {candidate.frontColorCode}: {formatMatrixQuantity(candidateCase.frontQty)}</p>
                              <ul className="mt-1 space-y-1 text-slate-600">
                                {candidateCase.edgeLines.map(edgeLine => <li key={edgeLine.itemCode}><span className="font-mono">{edgeLine.itemCode}</span>{edgeLine.itemName ? ` — ${edgeLine.itemName}` : ''} · color {edgeLine.colorCode} · {formatMatrixQuantity(edgeLine.qty)}</li>)}
                              </ul>
                            </div>)}
                          </div>
                          {candidateOverrideSaved ? <div className="mt-3 border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-950">
                            <p className="font-semibold">Override por SKU guardado</p>
                            <p className="mt-1">Estructura {candidate.structureColorCode} y frentes {candidate.frontColorCode} quedan definidos para estos {candidate.cases.length} SKU. Esta excepción se reutilizará en el siguiente análisis y al publicar la BOM.</p>
                          </div> : <div className="mt-3 border border-sky-200 bg-sky-50 p-2 text-xs text-sky-950">
                            <p className="font-semibold">Overrides por SKU para este caso</p>
                            <p className="mt-1">Guarda estructura {candidate.structureColorCode} y frentes {candidate.frontColorCode} para estos {candidate.cases.length} SKU. No modifica SAP ni asigna un formato físico; se aplicará cuando su BOM publicada tenga esos roles.</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-2 border border-sky-300 bg-white px-2 py-1.5 font-semibold"><input type="checkbox" checked={candidateOverrideReviewed} onChange={event => {
                                setMatrixCandidateOverrideReviewed(current => ({ ...current, [candidateOverrideKey]: event.target.checked }))
                                setMatrixCandidateOverrideProceedingKey(null)
                              }} disabled={candidateIsSelectedAsDual || candidateOverrideIsApplying || isPending || isApplyingMatrixCandidateOverrides} />Revisé los {candidate.cases.length} SKU</label>
                              <button type="button" onClick={() => applyMatrixDualCandidateSkuOverrides(candidate)} disabled={candidateIsSelectedAsDual || candidateOverrideIsApplying || !candidateOverrideReviewed || isPending || isApplyingMatrixCandidateOverrides} className="border border-sky-700 bg-sky-800 px-2 py-1.5 font-semibold text-white disabled:opacity-50">{candidateOverrideIsApplying ? 'Aplicando overrides…' : candidateOverrideRequiresSecondPress ? 'Proceder con aplicar overrides' : `Preparar overrides a ${candidate.cases.length} SKU`}</button>
                            </div>
                            {candidateOverrideIsApplying ? <div aria-live="polite" className="mt-2 border border-sky-300 bg-white px-2 py-2 text-sky-950">
                              <p className="inline-flex items-center gap-2 font-semibold"><LoaderCircle className="h-4 w-4 animate-spin" />Guardando en Supabase una operación para {candidate.cases.length} SKU.</p>
                              <p className="mt-1">Tiempo transcurrido: {formatElapsedSeconds(matrixCandidateOverrideElapsedSeconds)}.</p>
                              <div className="mt-2 h-1.5 w-full animate-pulse bg-sky-200" />
                            </div> : null}
                          </div>}
                          <p className="mt-3 text-xs text-slate-600">{candidateOverrideSaved
                            ? 'Este caso ya se guardó como excepción semántica por SKU; un siguiente análisis reutilizará esa decisión.'
                            : isMatrixDualCandidateSelected(selectedMatrixHybridCases, candidate)
                            ? 'Solo este caso se guardará como Dual para este color.'
                            : 'Si no eliges este caso, sus SKU se resuelven abajo: corrección humana en SAP, inactivación u override por SKU.'}</p>
                          </article>
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr><th className="px-5 py-3">Aplicar</th><th className="px-5 py-3">Color producto</th><th className="px-5 py-3">Uso</th><th className="px-5 py-3">Color interno para verificar</th><th className="px-5 py-3">Piezas cubiertas</th></tr>
                      </thead>
                      <tbody>
                        {colorMatrixRows.map(row => {
                          const isConflict = row.conflictingTargetColorCodes.length > 0
                          const targetColorCode = matrixTargetColorEdits[row.key] ?? row.suggestedTargetColorCode ?? ''
                          return <tr key={row.key} className="border-t border-slate-100 align-top">
                            <td className="px-5 py-3"><input type="checkbox" checked={selectedMatrixRules[row.key] === true} onChange={event => {
                              setSelectedMatrixHybridCases({})
                              setMatrixCoverage(null)
                              setMatrixSkuOverrideEditors({})
                              setMatrixSkuOverrideDrafts({})
                              setLocallyAppliedMatrixSkuOverrides({})
                              clearTransientMatrixCandidateOverrideState()
                              setSelectedMatrixRules(current => ({ ...current, [row.key]: event.target.checked }))
                              setMatrixRulesReviewed(false)
                              setMatrixRulesProceedingKey(null)
                            }} className="h-4 w-4" /></td>
                            <td className="px-5 py-3 font-mono font-semibold text-slate-800">{row.sourceColorCode}</td>
                            <td className="px-5 py-3 text-slate-700">{scopeLabel(row.scope)}</td>
                            <td className="px-5 py-3">
                              <input
                                aria-label={`Color interno para ${row.sourceColorCode} y ${scopeLabel(row.scope)}`}
                                value={targetColorCode}
                                onChange={event => updateMatrixTargetColor(row.key, event.target.value)}
                                maxLength={4}
                                placeholder="0000"
                                className="h-8 w-20 border border-sky-300 bg-white px-2 font-mono font-semibold text-sky-900"
                              />
                               <p className="mt-1 text-xs text-slate-500">Propuesta de la referencia: {row.suggestedTargetColorCode ?? 'sin color único'}</p>
                               {row.dualEvidence ? <p className="mt-1 text-xs text-violet-800">Evidencia SAP: {row.dualEvidence}</p> : null}
                               {isConflict ? <>
                                 <p className="mt-1 text-xs text-rose-700">La referencia analizada tiene más de un color. Elige uno para verificarlo contra todo SAP.</p>
                                 <div className="mt-2 flex flex-wrap gap-1">{row.conflictingTargetColorCodes.map(colorCode => <button key={colorCode} type="button" onClick={() => chooseMatrixColorCandidate(row.key, colorCode)} className="border border-rose-300 bg-white px-2 py-1 font-mono text-xs font-semibold text-rose-900">Usar {colorCode}</button>)}</div>
                               </> : null}
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-700">{row.baseItemCodes.map(code => `${code}${workspace.proposalItemNames[code] ? ` — ${workspace.proposalItemNames[code]}` : ''}`).join('\n')}</td>
                          </tr>
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-sky-100 px-5 py-4">
                    <p className="text-sm text-slate-700">Seleccionadas: {selectedMatrixRuleCount}. Edita el color interno si hace falta y verifica el catálogo activo en SAP una vez. Los casos Dual elegidos reutilizan esa misma evidencia; solo se habilita confirmar cuando todo queda cubierto.</p>
                    {hasInvalidSelectedMatrixTarget ? <p className="mt-2 text-xs font-semibold text-rose-700">Cada regla seleccionada necesita un color interno de cuatro caracteres.</p> : null}
                    {selectedMatrixHybridCaseList.map(candidate => <p key={matrixDualCandidateKey(candidate)} className="mt-3 border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">Al aplicar, {candidate.sourceColorCode} conservará como unicolor {selectedColorMatrixRows.find(row => row.sourceColorCode === candidate.sourceColorCode && (row.scope === 'edge_band_full_product' || row.scope === 'full_product'))?.suggestedTargetColorCode ?? 'pendiente'}; solo {candidate.evidenceSkuCount} SKU usarán estructura {candidate.structureColorCode} y frentes {candidate.frontColorCode}.</p>)}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex h-9 items-center gap-2 border border-sky-300 bg-white px-3 text-xs font-semibold text-sky-950"><input type="checkbox" checked={matrixRulesReviewed} onChange={event => { setMatrixRulesReviewed(event.target.checked); setMatrixRulesProceedingKey(null) }} disabled={isPending || isApplyingMatrixRules || selectedMatrixRuleCount === 0 || hasInvalidSelectedMatrixTarget} />Revisé las {selectedMatrixRuleCount} regla(s)</label>
                      <button type="button" onClick={confirmColorMatrix} disabled={isPending || isApplyingMatrixRules || hasInvalidSelectedMatrixTarget || !matrixCoverageIsClean || !matrixRulesReviewed} className="h-9 bg-sky-700 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{isApplyingMatrixRules ? 'Aplicando reglas…' : matrixRulesRequireSecondPress ? 'Proceder con aplicar reglas' : 'Preparar aplicación de reglas'}</button>
                    </div>
                    {isApplyingMatrixRules ? <p className="mt-2 text-xs font-semibold text-sky-900">Aplicando reglas: {formatElapsedSeconds(matrixRulesElapsedSeconds)}</p> : null}
                    {matrixCoverageIsCurrent && matrixCoverage ? (
                      <div className="mt-4 space-y-3 border-t border-sky-100 pt-4">
                        {matrixCoverage.results.map(result => {
                          const acceptedMissingComponentCount = result.acceptedMissingComponentCount + result.mismatches.filter(mismatch => mismatch.reason === 'missing_component'
                            && validatedMatrixAbsences[`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`] === true).length
                          const unresolvedMismatches = result.mismatches.filter(mismatch => mismatch.reason !== 'missing_component'
                            || validatedMatrixAbsences[`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`] !== true)
                            .filter(mismatch => !selectedHybridCaseExplainsMismatch({ result, mismatch, selectedHybridCases: selectedMatrixHybridCases }))
                            .filter(mismatch => !matrixSkuOverrideExplainsMismatch(result, mismatch))
                           const selectedHybridSkuCount = new Set(selectedMatrixHybridCaseList
                             .filter(candidate => candidate.sourceColorCode === result.sourceColorCode)
                             .flatMap(candidate => candidate.cases.map(candidateCase => candidateCase.skuComplete))).size
                           const verified = unresolvedMismatches.length === 0 && result.sapReadErrors.length === 0
                          return <div key={`${result.sourceColorCode}:${result.scope}`} className={verified ? 'border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950' : 'border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950'}>
                              <p className="font-semibold">Color {result.sourceColorCode} · {scopeLabel(result.scope)} → {result.targetColorCode}: {verified ? `100% confirmado en ${result.checkedSkuCount} SKU(s) activos en SAP` : `${unresolvedMismatches.length + result.sapReadErrors.length} caso(s) por revisar`}</p>
                              <p className="mt-1 text-xs">Catálogo: {result.catalogSkuCount} SKU(s) de venta con este color · ignorados: {result.excludedInactiveSapSkuCount} inactivo(s) en SAP y {result.excludedKitSkuCount} kit(s) de venta.{selectedHybridSkuCount > 0 ? ` ${selectedHybridSkuCount} SKU(s) Dual se validan con el caso seleccionado.` : ''}{acceptedMissingComponentCount > 0 ? ` ${acceptedMissingComponentCount} ausencia(s) intencional(es) aceptada(s).` : ''}</p>
                              {unresolvedMismatches.map(mismatch => {
                                const mismatchKey = matrixMismatchKey({ sourceColorCode: result.sourceColorCode, scope: result.scope, mismatch })
                                const semanticScope = mismatch.semanticScope ?? null
                                const overrideDraft = matrixSkuOverrideDrafts[mismatchKey] ?? {
                                  targetColorCode: mismatch.observedColorCode ?? '',
                                  reason: '',
                                }
                                const canCreateSkuOverride = mismatch.reason === 'unexpected_color'
                                  && semanticScope !== null
                                  && Boolean(mismatch.observedColorCode)
                                return <div key={`${mismatch.skuComplete}:${mismatch.baseItemCode}:${mismatch.itemCode ?? 'missing'}`} className="mt-2 border-t border-amber-200 pt-2">
                              <p><span className="font-mono">{mismatch.skuComplete}</span>{mismatch.skuItemName ? ` — ${mismatch.skuItemName}` : ''} · {mismatch.baseItemCode}{mismatch.itemName ? ` — ${mismatch.itemName}` : ''}: {mismatch.reason === 'missing_component' ? 'la pieza no aparece en SAP' : `SAP usa ${mismatch.observedColorCode ?? 'sin color'} (${mismatch.itemCode ?? 'sin código'})`}</p>
                              {mismatch.reason === 'missing_component' ? <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-emerald-900"><input type="checkbox" checked={selectedMatrixAbsences[`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`] === true} onChange={event => toggleMatrixAbsence(`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`, event.target.checked)} />Ausencia válida</label> : null}
                              <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-rose-900"><input type="checkbox" checked={selectedMatrixSapSkus[mismatch.skuComplete] === true} onChange={event => setSelectedMatrixSapSkus(current => ({ ...current, [mismatch.skuComplete]: event.target.checked }))} />Inactivar este SKU en SAP</label>
                              {canCreateSkuOverride ? <div className="mt-2 border border-sky-200 bg-sky-50 p-2 text-xs text-sky-950">
                                <p>También puedes conservar este SKU como excepción: el rol lógico publicado es <span className="font-semibold">{scopeLabel(semanticScope)}</span>. El formato físico no se cambia.</p>
                                <button type="button" onClick={() => toggleMatrixSkuOverrideEditor(mismatchKey)} className="mt-2 border border-sky-300 bg-white px-2 py-1 font-semibold text-sky-950">
                                  {matrixSkuOverrideEditors[mismatchKey] ? 'Ocultar override SKU' : 'Crear override SKU'}
                                </button>
                                {matrixSkuOverrideEditors[mismatchKey] ? <div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
                                  <input
                                    value={overrideDraft.targetColorCode}
                                    onChange={event => updateMatrixSkuOverrideDraft(mismatchKey, { targetColorCode: event.target.value.toUpperCase().slice(0, 4) })}
                                    maxLength={4}
                                    aria-label={`Color interno para ${mismatch.skuComplete}`}
                                    className="h-8 border border-sky-300 bg-white px-2 font-mono text-sm text-slate-900"
                                  />
                                  <input
                                    value={overrideDraft.reason}
                                    onChange={event => updateMatrixSkuOverrideDraft(mismatchKey, { reason: event.target.value })}
                                    placeholder="Motivo del caso puntual"
                                    className="h-8 border border-sky-300 bg-white px-2 text-sm text-slate-900"
                                  />
                                  <button type="button" onClick={() => saveMatrixSkuOverride(result, mismatch)} disabled={isPending || overrideDraft.targetColorCode.length !== 4 || overrideDraft.reason.trim().length < 3} className="h-8 bg-sky-800 px-2 font-semibold text-white disabled:opacity-50">Guardar override</button>
                                </div> : null}
                              </div> : mismatch.reason === 'unexpected_color' ? <p className="mt-2 text-xs text-slate-600">Para crear un override por SKU, primero publica la BOM base de esta referencia con el rol lógico de esta línea.</p> : null}
                             </div>
                              })}
                            {result.sapReadErrors.map(error => <p key={error.skuComplete} className="mt-1">{error.skuComplete}: no se pudo leer SAP ({error.message})</p>)}
                          </div>
                        })}
                        {matrixAbsenceCandidates.length > 0 ? <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                          <p className="font-semibold">Ausencias de MP que son válidas</p>
                          <p className="mt-1 text-xs">Selecciona las ausencias que revisaste. Se validan otra vez contra SAP y solo quedan aceptadas en esta pantalla; no modifican SAP ni la BOM futura.</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={toggleAllMatrixAbsences} disabled={isPending || isValidatingMatrixAbsences} className="h-8 border border-emerald-300 bg-white px-2 text-xs font-semibold text-emerald-950 disabled:opacity-50">{allMatrixAbsenceCandidatesSelected ? 'Quitar selección' : `Seleccionar todas (${matrixAbsenceCandidates.length})`}</button>
                            <label className="inline-flex h-8 items-center gap-2 border border-emerald-300 bg-white px-2 text-xs font-semibold text-emerald-950"><input type="checkbox" checked={matrixAbsenceReviewed} onChange={event => { setMatrixAbsenceReviewed(event.target.checked); setMatrixAbsenceProceedingKey(null) }} disabled={isPending || isValidatingMatrixAbsences || selectedMatrixAbsenceCandidates.length === 0} />Revisé las {selectedMatrixAbsenceCandidates.length} ausencia(s)</label>
                            <button type="button" onClick={acceptColorMatrixAbsences} disabled={isPending || isValidatingMatrixAbsences || selectedMatrixAbsenceCandidates.length === 0 || !matrixAbsenceReviewed} className="h-8 bg-emerald-800 px-2 text-xs font-semibold text-white disabled:opacity-50">{isValidatingMatrixAbsences ? 'Validando en SAP…' : matrixAbsenceRequiresSecondPress ? 'Proceder con validar ausencias' : 'Preparar validación'}</button>
                          </div>
                          {isValidatingMatrixAbsences ? <p className="mt-2 text-xs font-semibold text-emerald-900">Validando ausencias en SAP: {formatElapsedSeconds(matrixAbsenceElapsedSeconds)}</p> : null}
                        </div> : null}
                        {matrixSapSkuCandidates.length > 0 ? <div className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">
                          <p className="font-semibold">Inactivar SKU seleccionados en SAP</p>
                          <p className="mt-1 text-xs">Primero ejecuta el dry-run. Después confirma el grupo; cada SKU se verifica en SAP y solo los confirmados se sincronizan como inactivos en la app.</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={() => deactivateMatrixSkusInSap(true)} disabled={isPending || selectedMatrixSapSkuCodes.length === 0} className="h-8 border border-rose-300 bg-white px-2 text-xs font-semibold text-rose-900 disabled:opacity-50">Probar seleccionados</button>
                            <label className="inline-flex h-8 items-center gap-2 border border-rose-300 bg-white px-2 text-xs font-semibold text-rose-950"><input type="checkbox" checked={matrixSapDeactivationConfirmed} onChange={event => setMatrixSapDeactivationConfirmed(event.target.checked)} />Confirmo inactivar los SKU seleccionados en SAP</label>
                            <button type="button" onClick={() => deactivateMatrixSkusInSap(false)} disabled={isPending || selectedMatrixSapSkuCodes.length === 0 || !matrixSapDeactivationConfirmed} className="h-8 bg-rose-800 px-2 text-xs font-semibold text-white disabled:opacity-50">Confirmar inactivación</button>
                          </div>
                        </div> : null}
                        {matrixBatchMessage ? <p className="text-sm font-medium text-slate-800">{matrixBatchMessage}</p> : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section className="border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-sky-700" />
                    <div>
                      <h2 className="font-semibold text-slate-950">Resultado del analisis SAP</h2>
                      <p className="text-sm text-slate-600">
                        {workspace.run.sourceSkuCount} colores activos en la app{sapActiveSkuCount !== null ? ` / ${sapActiveSkuCount} activos en SAP` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(workspace.run.status)}`}>
                    {statusLabel(workspace.run.status)}
                  </span>
                </div>
                <div className="grid divide-y divide-slate-200 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Colores en la app</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{workspace.run.sourceSkuCount}</p>
                    <p className="text-xs text-slate-500">versión 000 activos</p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Colores activos SAP</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{sapActiveSkuCount ?? '-'}</p>
                    <p className="text-xs text-slate-500">confirmados por catálogo SAP</p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">LdM leídas SAP</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{capturedSnapshots.length}/{workspace.run.sourceSkuCount}</p>
                    <p className="text-xs text-slate-500">listas para comparar</p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">LdM sin leer</p>
                    <p className="mt-1 text-2xl font-bold text-rose-700">{failedSnapshots.length}</p>
                    <p className="text-xs text-slate-500">requieren una acción</p>
                  </div>
                </div>
              </section>

              <section className="border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-950">
                <p className="font-semibold">Componentes importados y subestructuras</p>
                <p className="mt-1">Componentes: {asNumber(workspace.run.summaryJson.component_item_count) ?? 0} · árboles internos leídos: {asNumber(workspace.run.summaryJson.component_tree_count) ?? 0} · profundidad observada: {asNumber(workspace.run.summaryJson.component_tree_observed_max_depth) ?? 0}.</p>
                <p className="mt-1 text-xs">La publicación usa esta misma expansión recursiva y conserva cada LdM interna en `component_items`; el límite operativo actual es profundidad 12 y 150 nodos.</p>
              </section>

              {hasSapCatalogMismatch ? (
                <section className="border border-rose-300 bg-rose-50 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-800" />
                    <div>
                      {sapInactiveSkuCodes.length > 0 ? (
                        <>
                          <h2 className="font-semibold text-rose-950">
                            {sapInactiveSkuCodes.length} {sapInactiveSkuCodes.length === 1 ? 'código inactivo' : 'códigos inactivos'} en SAP
                          </h2>
                          <p className="mt-1 text-sm text-rose-900">
                            La aplicación puede sincronizar su estado con SAP. Antes de cambiar Supabase, volverá a confirmar cada código en SAP; esta acción no modifica SAP.
                          </p>
                          <div className="mt-3 space-y-3">
                            {sapInactiveSkuCodes.map(skuComplete => {
                              const isPrepared = preparedSupabaseSyncSkus[skuComplete] === true
                              return (
                                <div key={skuComplete} className="border border-rose-200 bg-white p-3">
                                  <p className="font-mono text-sm font-semibold text-slate-950">{skuComplete}</p>
                                  <p className="mt-1 text-xs text-slate-600">
                                    SAP lo reportó inactivo o congelado. Puedes alinear únicamente el estado de Supabase.
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => syncInactiveSkuInSupabase(skuComplete)}
                                      disabled={isPending}
                                      className="inline-flex h-9 items-center gap-2 rounded-md bg-rose-800 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {isPrepared ? 'Confirmar sincronización en Supabase' : 'Preparar sincronización'}
                                    </button>
                                  </div>
                                  {isPrepared ? <p className="mt-2 text-xs font-medium text-rose-800">La confirmación vuelve a consultar SAP antes de modificar solo Supabase.</p> : null}
                                  {skuActionMessages[skuComplete] ? (
                                    <p className="mt-2 text-sm font-semibold text-rose-950" aria-live="polite">
                                      {skuActionMessages[skuComplete]}
                                    </p>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        </>
                      ) : null}
                      {sapMissingSkuCodes.length > 0 ? (
                        <div className={sapInactiveSkuCodes.length > 0 ? 'mt-4 border-t border-rose-200 pt-4' : ''}>
                          <h2 className="font-semibold text-rose-950">
                            {sapMissingSkuCodes.length} {sapMissingSkuCodes.length === 1 ? 'código no encontrado' : 'códigos no encontrados'} en SAP
                          </h2>
                          <p className="mt-1 text-sm text-rose-900">{sapMissingSkuCodes.join(', ')}.</p>
                          <p className="mt-2 text-sm font-medium text-rose-950">Confirma el código en SAP o inactívalo en Supabase si ya no corresponde a esta referencia.</p>
                        </div>
                      ) : null}
                      {genericSupabaseOnlyColors.length > 0 ? <p className="mt-1 text-sm text-rose-900">Activos solo en la app: {genericSupabaseOnlyColors.join(', ')}. Vuelve a ejecutar el análisis para obtener el estado SAP detallado.</p> : null}
                      {sapOnlyColors.length > 0 ? <div className="mt-3 border border-rose-200 bg-rose-50 p-3 text-rose-950">
                        <p className="font-semibold">Activos solo en SAP: {sapOnlyColors.join(', ')}</p>
                        <p className="mt-1 text-sm">Cada SKU debe resolverse desde aquí: registrarlo en la app, inactivarlo en SAP o eliminarlo de SAP.</p>
                        {sapOnlySkuCodes.length > 0 ? <div className="mt-3 space-y-2">{sapOnlySkuCodes.map(skuComplete => <div key={skuComplete} className="border border-rose-200 bg-white p-3">
                          <p className="font-mono text-sm font-semibold">{skuComplete}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => createSapOnlySkuInApp(skuComplete)} disabled={isPending} className="h-8 bg-sky-800 px-2 text-xs font-semibold text-white disabled:opacity-50">Crear en la app</button>
                            <label className="inline-flex h-8 items-center gap-2 border border-rose-300 bg-white px-2 text-xs font-semibold text-rose-950"><input type="checkbox" checked={sapOnlyActionConfirmed[skuComplete] === true} onChange={event => setSapOnlyActionConfirmed(current => ({ ...current, [skuComplete]: event.target.checked }))} />Confirmo la acción en SAP</label>
                            <button type="button" onClick={() => inactivateSapOnlySku(skuComplete)} disabled={isPending} className="h-8 bg-amber-800 px-2 text-xs font-semibold text-white disabled:opacity-50">Inactivar en SAP</button>
                            <button type="button" onClick={() => deleteSapOnlySku(skuComplete)} disabled={isPending} className="h-8 bg-rose-800 px-2 text-xs font-semibold text-white disabled:opacity-50">Eliminar en SAP</button>
                          </div>
                          {sapOnlyActionMessages[skuComplete] ? <p className="mt-2 text-xs font-semibold" aria-live="polite">{sapOnlyActionMessages[skuComplete]}</p> : null}
                        </div>)}</div> : <p className="mt-2 text-xs">El análisis no devolvió los SKU exactos; vuelve a analizar para habilitar acciones individuales.</p>}
                      </div> : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {hasIncompleteSapRead ? (
                <section className="border border-amber-300 bg-amber-50 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
                    <div>
                      <h2 className="font-semibold text-amber-950">Faltan LdM por leer en SAP</h2>
                      <p className="mt-1 text-sm text-amber-900">
                        No se comparó la referencia, no se propuso una BOM y no se revisaron subestructuras. Primero SAP debe responder para todos los colores activos.
                      </p>
                      <p className="mt-2 text-sm text-amber-900">Colores pendientes: {bomReadFailureSnapshots.map(snapshot => snapshot.skuColorCode ?? 'sin color').join(', ')}.</p>
                      {canRetryOnlyPendingBomReads ? <p className="mt-1 text-sm text-amber-900">El reintento reutilizará {capturedSnapshots.length} LdM ya leídas y consultará solo {bomReadFailureSnapshots.length} pendiente(s).</p> : null}
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <h2 className="font-semibold text-slate-950">Evidencia SAP por color</h2>
                  <span className="text-sm text-slate-500">{workspace.snapshots.length} colores</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Referencia</th>
                        <th className="px-5 py-3">Color</th>
                        <th className="px-5 py-3 text-right">Líneas</th>
                        <th className="px-5 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.snapshots.map(snapshot => (
                        <tr key={snapshot.id} className="border-t border-slate-100">
                          <td className="px-5 py-3 font-mono text-xs text-slate-700">{referenceCodeFromSku(snapshot.skuComplete)}</td>
                          <td className="px-5 py-3 text-slate-700">{snapshot.skuColorCode ?? '-'}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-700">{snapshot.lineCount}</td>
                          <td className="px-5 py-3">
                            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(snapshot.status)}`}>{statusLabel(snapshot.status)}</span>
                            {snapshot.status === 'failed' && snapshot.errorMessage ? <p className="mt-1 text-xs text-rose-700">{snapshot.errorMessage}</p> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {!hasIncompleteSource ? (
                <>
              <section className="border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-slate-950">BOM base propuesta</h2>
                    <p className="mt-1 text-xs text-slate-500">El rol lógico pertenece a esta referencia; el formato físico se conserva.</p>
                  </div>
                  <span className="text-sm text-slate-500">Pendiente de publicacion</span>
                </div>
                <div className="max-h-[400px] overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Orden</th>
                        <th className="px-5 py-3">Material o alternativas</th>
                        <th className="px-5 py-3">Uso lógico en producto</th>
                        <th className="px-5 py-3">Consumos</th>
                        <th className="px-5 py-3">Unidad</th>
                        <th className="px-5 py-3">Método de salida propuesto</th>
                        <th className="px-5 py-3">Bodega</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.run.proposedBomStructure.lines.map(line => {
                        const observedConsumptionEntries = line.consumptions.filter(consumption => consumption.status !== 'needs_definition')
                        const observedConsumptions = observedConsumptionEntries.length
                        const pendingConsumptions = line.consumptions.filter(consumption => consumption.status === 'needs_definition').length
                        const baseItemName = line.base_item_code ? workspace.proposalItemNames[line.base_item_code] : null
                        const materialGroupItemNames = line.line_kind === 'material_group'
                          ? line.alternatives.map(alternative => workspace.proposalItemNames[alternative.base_item_code])
                          : []
                        const availableScopes = referenceScopeOptions({
                          currentScope: line.product_application_scope,
                          itemName: baseItemName,
                          itemNames: materialGroupItemNames,
                        })
                        return (
                          <tr key={line.line_id} className="border-t border-slate-100 align-top">
                            <td className="px-5 py-3 tabular-nums text-slate-600">{line.sort_order}</td>
                            <td className="px-5 py-3 text-xs text-slate-800">
                              {line.line_kind === 'material_group' ? (
                                <div className="space-y-2">
                                  {line.alternatives.map((alternative, index) => (
                                    <div key={alternative.alternative_id} className="border-l-2 border-sky-200 pl-2">
                                      <span className="mr-2 font-semibold text-slate-500">{line.sort_order}.{index + 1}</span>
                                      <span className="font-mono">{alternative.base_item_code}</span>
                                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{alternative.material_profile}</span>
                                      <span className="mt-1 block font-sans text-sm text-slate-600">
                                        {workspace.proposalItemNames[alternative.base_item_code] ?? 'Nombre base no disponible'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <>
                                  <span className="block font-mono">{line.base_item_code}</span>
                                  <span className="mt-1 block font-sans text-sm text-slate-600">
                                    {line.base_item_code ? workspace.proposalItemNames[line.base_item_code] ?? 'Nombre base no disponible' : 'Sin material'}
                                  </span>
                                </>
                              )}
                            </td>
                            <td className="px-5 py-3 text-slate-700">
                              {availableScopes.length > 0 ? <>
                                <select
                                  value={line.product_application_scope}
                                  onChange={event => updateReferenceBomLineScope(
                                    line.line_id,
                                    line.line_kind,
                                    line.base_item_code,
                                    event.target.value as ReferenceProductApplicationScope
                                  )}
                                  className="h-8 max-w-[190px] border border-slate-300 bg-white px-2 text-sm text-slate-900"
                                >
                                  {availableScopes.map(scope => <option key={scope} value={scope}>{scopeLabel(scope)}</option>)}
                                </select>
                                <p className="mt-1 text-xs text-slate-500">Rol propio de esta referencia; se guarda al publicar.</p>
                              </> : scopeLabel(line.product_application_scope)}
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-700">
                              {line.line_kind === 'fixed' ? (
                                <span className="tabular-nums">{line.qty}</span>
                              ) : (
                                <>
                                  <p>{observedConsumptions} configuraci{observedConsumptions === 1 ? 'ón' : 'ones'} con evidencia SAP</p>
                                  {observedConsumptionEntries.map((consumption, index) => <p key={`${consumption.color_mode}:${consumption.product_application_scope}:${consumption.material_profile}:${index}`} className="mt-1 text-xs text-slate-500">{scopeLabel(consumption.product_application_scope)} · {consumption.material_profile} · {consumption.qty === null ? 'pendiente' : formatMatrixQuantity(consumption.qty)}</p>)}
                                  {pendingConsumptions > 0 ? <p className="mt-1 text-amber-700">{pendingConsumptions} configuración(es) presente(s) sin evidencia SAP</p> : null}
                                </>
                              )}
                            </td>
                            <td className="px-5 py-3 text-slate-700">{line.uom ?? '-'}</td>
                            <td className="px-5 py-3 text-slate-700">{line.issue_method_override ?? 'Sin mayoría'}</td>
                            <td className="px-5 py-3 text-slate-700">{line.input_warehouse_code ?? '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {pendingConsumptionCount > 0 ? (
                  <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
                    Hay {pendingConsumptionCount} configuración{pendingConsumptionCount === 1 ? '' : 'es'} de consumo presente{pendingConsumptionCount === 1 ? '' : 's'} sin evidencia SAP. La propuesta no crea combinaciones Dual o Balance que no existan en la referencia; estos casos requieren evidencia o una decisión humana antes de definir consumo.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Publicar la BOM base recomendada</p>
                    <p className="mt-1 text-xs text-slate-600">Solo se habilita cuando la lectura SAP está completa y no quedan bloqueadores sin resolver.</p>
                    {unresolvedBlockers.length > 0 ? <p className="mt-1 text-xs font-semibold text-rose-700">No disponible: hay {unresolvedBlockers.length} pendiente{unresolvedBlockers.length === 1 ? '' : 's'} bloqueante{unresolvedBlockers.length === 1 ? '' : 's'}.</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={publishRun}
                    disabled={isPending || hasIncompleteSource || workspace.run.status !== 'needs_review' || unresolvedBlockers.length > 0}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    Publicar BOM
                  </button>
                </div>
              </section>

              {workspace.activeOverrides.length > 0 ? (
                <section className="border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                      <h2 className="font-semibold text-slate-950">Overrides activos</h2>
                      <p className="mt-1 text-sm text-slate-600">Estas excepciones se aplican al resolver la LdM del SKU.</p>
                    </div>
                    <span className="text-sm text-slate-500">{workspace.activeOverrides.length} activos</span>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {workspace.activeOverrides.map((override, index) => (
                      <article key={`${override.level}:${override.skuComplete ?? 'all'}:${override.colorCode}:${override.productApplicationScope}:${index}`} className="px-5 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2 text-slate-800">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {override.level === 'reference' ? 'Referencia' : override.level === 'global_version' ? 'Regla global de versión' : override.level === 'version' ? 'Versión' : 'SKU'}
                          </span>
                          {override.skuComplete ? <span className="font-mono text-xs">{override.skuComplete}</span> : null}
                          <span>Color {override.colorCode}</span>
                          <span>{scopeLabel(override.productApplicationScope)}</span>
                          {override.baseItemCode ? <span className="font-mono text-xs">{override.baseItemCode}</span> : null}
                          {override.targetColorCode ? <span className="font-semibold text-sky-800">usa {override.targetColorCode}</span> : null}
                          {override.materialProfile ? <span className="font-semibold text-sky-800">perfil {override.materialProfile}</span> : null}
                        </div>
                        <p className="mt-1 text-slate-600">{override.reason}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-slate-950">Revisiones de negocio</h2>
                    <p className="mt-1 text-sm text-slate-600">{reviewTopicCount} temas de negocio; las decisiones por color se agrupan dentro de cada tema.</p>
                  </div>
                  {unresolvedBlockers.length > 0 ? <AlertTriangle className="h-5 w-5 text-rose-700" /> : <CheckCircle2 className="h-5 w-5 text-emerald-700" />}
                </div>
                <div className="divide-y divide-slate-200">
                  {reviewFindings.map(finding => {
                    const colorConfirmation = requiresColorConfirmation(finding)
                    const groupConfirmation = requiresMaterialGroupConfirmation(finding)
                    const profileConfirmation = requiresMaterialProfileConfirmation(finding)
                    const confirmation = colorConfirmation || groupConfirmation || profileConfirmation
                    const assignments = colorAssignmentEvidence(finding)
                    const affectedCodes = affectedBaseItemCodes(finding)
                    const baseItemName = finding.baseItemCode ? workspace.proposalItemNames[finding.baseItemCode] : null
                    const overrideDraft = overrideDrafts[finding.id] ?? {
                      level: 'reference' as const,
                      skuComplete: '',
                      sourceColorCode: '',
                      targetColorCode: '',
                      materialProfile: '',
                      reason: '',
                    }
                    const isBoard = hasBoardEvidence(finding)
                    const isOverrideEditorOpen = overrideEditors[finding.id] === true
                    return (
                      <article key={finding.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-slate-950">{findingTitle(finding)}</h3>
                              <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${severityClass(finding.severity)}`}>{severityLabel(finding.severity)}</span>
                              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusClass(finding.status)}`}>{statusLabel(finding.status)}</span>
                            </div>
                            {findingDescription(finding) ? <p className="mt-1 text-sm text-slate-600">{findingDescription(finding)}</p> : null}
                            {finding.baseItemCode ? (
                              <p className="mt-2 text-sm text-slate-700">
                                <span className="font-semibold">Pieza:</span> <span className="font-mono text-xs">{finding.baseItemCode}</span>{baseItemName ? ` - ${baseItemName}` : ''}
                              </p>
                            ) : null}
                            {assignments.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
                                {assignments.map(assignment => (
                                  <span key={`${assignment.productColor}:${assignment.materialColor}`} className="inline-flex items-center gap-2 border border-slate-200 bg-slate-50 px-2 py-1">
                                    Producto {assignment.productColor}: material {assignment.materialColor}
                                    {finding.findingType === 'bom_line_review' ? (
                                      <button type="button" onClick={() => openColorEditor(finding, assignment.productColor)} className="font-semibold text-sky-800 underline underline-offset-2">Editar color</button>
                                    ) : null}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {affectedCodes.length > 0 && !(finding.baseItemCode && affectedCodes.length === 1 && affectedCodes[0] === finding.baseItemCode) ? (
                              <p className="mt-2 text-sm text-slate-700">
                                <span className="font-semibold">Piezas afectadas:</span> {affectedCodes.map(code => `${code}${workspace.proposalItemNames[code] ? ` - ${workspace.proposalItemNames[code]}` : ''}`).join(', ')}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {confirmation ? (
                          <div className="mt-3 border border-sky-200 bg-sky-50 p-3">
                            <p className="text-sm font-semibold text-sky-950">Qué hará esta confirmación</p>
                            <p className="mt-1 text-sm text-sky-900">
                              {colorConfirmation
                                ? `Guardará en la configuración del color ${asString(finding.detailsJson.source_color_code)} que ${scopeLabel(finding.proposedScope)} usa el color ${finding.proposedColorCode}. No modifica SAP.`
                                : groupConfirmation
                                  ? 'Confirmará que estas alternativas son una sola posición lógica de la BOM. Los consumos pendientes seguirán visibles y no se inventarán.'
                                  : `Guardará el perfil ${asString(finding.detailsJson.material_profile)} para el color ${asString(finding.detailsJson.source_color_code)} en ${scopeLabel(finding.proposedScope)}. No modifica SAP.`}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                            <label className="inline-flex h-9 items-center gap-2 border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"><input type="checkbox" checked={confirmationChecks[finding.id] === true} onChange={event => setConfirmationChecks(current => ({ ...current, [finding.id]: event.target.checked }))} />Confirmo esta configuración</label>
                            <button
                              type="button"
                              onClick={() => {
                                if (colorConfirmation) confirmColorRule(finding)
                                else if (groupConfirmation) confirmMaterialGroup()
                                else confirmMaterialProfile(finding)
                              }}
                              disabled={isPending || confirmationChecks[finding.id] !== true}
                              className="h-9 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {groupConfirmation ? 'Confirmar grupo' : profileConfirmation ? 'Confirmar perfil' : 'Confirmar regla'}
                            </button>
                            </div>
                          </div>
                        ) : null}
                        {finding.findingType === 'bom_line_review' && finding.proposedScope ? (
                          <div className="mt-3 border border-slate-200 bg-slate-50 p-3">
                            <p className="text-sm font-semibold text-slate-950">Resolver esta diferencia</p>
                            <p className="mt-1 text-sm text-slate-600">
                              Reconsulta SAP si ya corregiste el origen. Si la diferencia es intencional, edita el color afectado o crea un override limitado.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => analyzeSelectedReference()}
                                className="h-9 border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
                              >
                                Volver a consultar SAP
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleOverrideEditor(finding.id)}
                                className="h-9 border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
                              >
                                {isOverrideEditorOpen ? 'Ocultar override' : 'Crear override limitado'}
                              </button>
                            </div>
                            {isOverrideEditorOpen ? <>
                            <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Alcance
                                <select
                                  value={overrideDraft.level}
                                  onChange={event => updateOverrideDraft(finding, { level: event.target.value as OverrideDraft['level'] })}
                                  className="h-9 border border-slate-300 bg-white px-2 text-sm text-slate-900"
                                >
                                  <option value="reference">Referencia</option>
                                  <option value="version">Versión 000</option>
                                  <option value="sku">SKU puntual</option>
                                </select>
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Color del producto
                                <input
                                  value={overrideDraft.sourceColorCode}
                                  onChange={event => updateOverrideDraft(finding, { sourceColorCode: event.target.value.toUpperCase().slice(0, 4) })}
                                  placeholder="0439"
                                  maxLength={4}
                                  className="h-9 border border-slate-300 bg-white px-2 font-mono text-sm text-slate-900"
                                />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Color de material
                                <input
                                  value={overrideDraft.targetColorCode}
                                  onChange={event => updateOverrideDraft(finding, { targetColorCode: event.target.value.toUpperCase().slice(0, 4) })}
                                  placeholder="0435"
                                  maxLength={4}
                                  className="h-9 border border-slate-300 bg-white px-2 font-mono text-sm text-slate-900"
                                />
                              </label>
                              {isBoard ? <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Perfil
                                <select
                                  value={overrideDraft.materialProfile}
                                  onChange={event => updateOverrideDraft(finding, { materialProfile: event.target.value })}
                                  className="h-9 border border-slate-300 bg-white px-2 text-sm text-slate-900"
                                >
                                  <option value="">Sin cambiar</option>
                                  <option value="ST">ST</option>
                                  <option value="RH">RH</option>
                                  <option value="CARB2">CARB2</option>
                                </select>
                              </label> : null}
                              {overrideDraft.level === 'sku' ? (
                                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                  SKU puntual
                                  <select
                                    value={overrideDraft.skuComplete}
                                    onChange={event => updateOverrideDraft(finding, { skuComplete: event.target.value })}
                                    className="h-9 border border-slate-300 bg-white px-2 text-sm text-slate-900"
                                  >
                                    <option value="">Selecciona un SKU</option>
                                    {workspace.snapshots.map(snapshot => <option key={snapshot.skuComplete} value={snapshot.skuComplete}>{snapshot.skuComplete}</option>)}
                                  </select>
                                </label>
                              ) : null}
                              <label className="grid gap-1 text-xs font-semibold text-slate-600 sm:col-span-2">
                                Motivo
                                <input
                                  value={overrideDraft.reason}
                                  onChange={event => updateOverrideDraft(finding, { reason: event.target.value })}
                                  placeholder="Ejemplo: SAP conserva este codigo por continuidad comercial"
                                  className="h-9 border border-slate-300 bg-white px-2 text-sm text-slate-900"
                                />
                              </label>
                            </div>
                            <button
                              type="button"
                              onClick={() => saveManualOverride(finding)}
                              disabled={isPending || !overrideDraft.sourceColorCode || (!overrideDraft.targetColorCode && !overrideDraft.materialProfile) || overrideDraft.reason.trim().length < 3 || (overrideDraft.level === 'sku' && !overrideDraft.skuComplete)}
                              className="mt-3 h-9 bg-slate-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Guardar override en Supabase
                            </button>
                            </> : null}
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
                {issueMethodFindings.length > 0 ? (
                  <div className="border-t border-violet-200 bg-violet-50 p-5">
                    <h3 className="text-sm font-semibold text-violet-950">Una corrección para métodos de salida</h3>
                    <p className="mt-1 text-sm text-violet-900">Solo se modificarán estas líneas que hoy difieren. El cambio queda registrado en el historial de SAP y en la auditoría de esta importación.</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-violet-950">
                      {issueMethodDifferencesToApply.map(item => (
                        <span key={`${item.skuComplete}:${item.childNum}:${item.itemCode}`} className="border border-violet-200 bg-white px-2 py-1">
                          Color {item.colorCode ?? '-'} · línea {item.childNum ?? '-'} · {item.itemCode}{item.itemName ? ` — ${item.itemName}` : ''}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="grid gap-1 text-xs font-semibold text-violet-900">
                        Método para todas las líneas anteriores
                        <select
                          value={issueMethodDraft.targetIssueMethod}
                           onChange={event => setIssueMethodDraft(current => ({ ...current, targetIssueMethod: event.target.value as IssueMethodDraft['targetIssueMethod'], confirmed: false, result: null }))}
                          className="h-9 border border-violet-300 bg-white px-2 text-sm text-slate-900"
                        >
                          <option value="im_Manual">Manual</option>
                          <option value="im_Backflush">Notificación</option>
                        </select>
                      </label>
                      <button type="button" onClick={() => applyIssueMethodsBatch(true)} disabled={isPending || issueMethodDifferencesToApply.length === 0} className="h-9 border border-violet-300 bg-white px-3 text-sm font-semibold text-violet-950 disabled:cursor-not-allowed disabled:opacity-50">
                        Probar sin escribir SAP
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label className="inline-flex h-9 items-center gap-2 border border-violet-300 bg-white px-3 text-xs font-semibold text-violet-950"><input type="checkbox" checked={issueMethodDraft.confirmed} onChange={event => setIssueMethodDraft(current => ({ ...current, confirmed: event.target.checked }))} />Confirmo modificar estos métodos en SAP</label>
                      <button type="button" onClick={() => applyIssueMethodsBatch(false)} disabled={isPending || !issueMethodDraft.confirmed || issueMethodDifferencesToApply.length === 0} className="h-9 bg-violet-800 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                        Aplicar y verificar en SAP
                      </button>
                    </div>
                    {issueMethodDraft.result ? <p className="mt-3 text-sm font-medium text-violet-950">{issueMethodDraft.result}</p> : null}
                  </div>
                ) : null}
              </section>
                </>
              ) : null}

            </>
          ) : null}
        </div>
      </section>
      {boardColorRuleEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="board-color-rule-title" className="w-full max-w-lg border border-emerald-200 bg-white p-5 shadow-xl">
            <h2 id="board-color-rule-title" className="text-lg font-semibold text-slate-950">Configurar regla global del color {boardColorRuleEditor.sourceColorCode}</h2>
            <p className="mt-2 text-sm text-slate-700">La regla se guarda directamente en la configuración del color y se aplica cuando una BOM use el rol <strong>Tablero producto completo</strong>.</p>
            <dl className="mt-4 grid gap-3 border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-950 sm:grid-cols-3">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Color producto</dt><dd className="mt-1 font-mono font-semibold">{boardColorRuleEditor.sourceColorCode}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Tablero interno</dt><dd className="mt-1 font-mono font-semibold">{boardColorRuleEditor.boardColorCode}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Perfil</dt><dd className="mt-1 font-mono font-semibold">{boardColorRuleEditor.materialProfile}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-slate-600">SAP respaldó esta combinación en {boardColorRuleEditor.evidenceSkuCount} SKU activos. Al guardar se vuelve a validar SAP antes de escribir. No cambia consumos, formatos, BOM base ni overrides por SKU.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setBoardColorRuleEditor(null)} className="h-9 border border-slate-300 px-3 text-sm font-semibold text-slate-800">Cancelar</button>
              <button type="button" onClick={saveBoardColorRule} disabled={isPending} className="h-9 bg-emerald-800 px-3 text-sm font-semibold text-white disabled:opacity-50">Guardar regla global</button>
            </div>
          </section>
        </div>
      ) : null}
      {boardConditionalRuleEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="board-conditional-rule-title" className="w-full max-w-2xl border border-violet-200 bg-white p-5 shadow-xl">
            <h2 id="board-conditional-rule-title" className="text-lg font-semibold text-slate-950">Alternativas unicolor por perfil · color {boardConditionalRuleEditor.sourceColorCode}</h2>
            <p className="mt-2 text-sm text-slate-700">SAP muestra que este color no siempre usa el mismo tablero interno. Cada alternativa cruza el perfil que usa la referencia con el tablero observado en SAP; elige una forma de resolverlo para cualquier referencia que use este color.</p>
            <div className="mt-4 grid gap-3">
              {boardConditionalRuleEditor.strategies.map((strategy, index) => {
                const selected = strategy.strategyId === boardConditionalRuleEditor.selectedStrategyId
                return <label key={strategy.strategyId} className={`cursor-pointer border p-3 ${selected ? 'border-violet-700 bg-violet-50' : 'border-slate-200 bg-white'}`}>
                  <input type="radio" name="board-conditional-strategy" checked={selected} onChange={() => setBoardConditionalRuleEditor(current => current ? { ...current, selectedStrategyId: strategy.strategyId, saveResult: null } : current)} disabled={boardConditionalRuleEditor.saveResult?.success === true} className="sr-only" />
                  <p className="font-semibold text-violet-950">Alternativa {index + 1}: {strategy.kind === 'keep_product_color' ? `conservar ${boardConditionalRuleEditor.sourceColorCode} como color interno base` : `usar ${strategy.defaultBoardColorCode} · ${strategy.defaultMaterialProfile} como combinación interna base`}</p>
                  <p className="mt-2 text-xs text-slate-700">Por defecto: <span className="font-mono font-semibold">{strategy.defaultBoardColorCode}</span>{strategy.defaultMaterialProfile ? <><span> · </span><span className="font-mono font-semibold">{strategy.defaultMaterialProfile}</span></> : ' · el perfil lo determina cada referencia'}.</p>
                  <div className="mt-2 space-y-1 border-l-2 border-violet-200 pl-2 text-xs text-slate-700"><p className="font-semibold">Excepciones respaldadas por SAP</p>{strategy.conditions.map(condition => <p key={`${condition.sourceMaterialProfile}:${condition.targetBoardColorCode}:${condition.targetMaterialProfile}`}>Si la referencia trabaja <span className="font-mono font-semibold">{condition.sourceMaterialProfile}</span>: tablero <span className="font-mono font-semibold">{condition.targetBoardColorCode}</span> · perfil <span className="font-mono font-semibold">{condition.targetMaterialProfile}</span> ({condition.evidenceSkuCount} SKU).</p>)}</div>
                </label>
              })}
            </div>
            {selectedBoardConditionalStrategy ? <p className="mt-3 border border-violet-200 bg-violet-50 p-2 text-xs text-violet-950">Vas a guardar: por defecto {selectedBoardConditionalStrategy.defaultBoardColorCode}{selectedBoardConditionalStrategy.defaultMaterialProfile ? ` · ${selectedBoardConditionalStrategy.defaultMaterialProfile}` : ' sin perfil fijo'}, con {selectedBoardConditionalStrategy.conditions.length} excepción(es) de perfil.</p> : null}
            {boardConditionalRuleEditor.saveResult ? <p className={`mt-3 border p-3 text-sm ${boardConditionalRuleEditor.saveResult.success ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-rose-200 bg-rose-50 text-rose-950'}`} role="status">{boardConditionalRuleEditor.saveResult.success ? 'Configuración guardada en Supabase. ' : ''}{boardConditionalRuleEditor.saveResult.message}</p> : null}
            <p className="mt-3 text-xs text-slate-600">Solo modifica la configuración de tableros de este color. No cambia cantos, consumos, formatos ni SAP.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setBoardConditionalRuleEditor(null)} className="h-9 border border-slate-300 px-3 text-sm font-semibold text-slate-800">{boardConditionalRuleEditor.saveResult?.success ? 'Cerrar' : 'Cancelar'}</button>
              <button type="button" onClick={saveBoardConditionalRule} disabled={isPending || !selectedBoardConditionalStrategy || boardConditionalRuleEditor.saveResult?.success === true} className="h-9 bg-violet-800 px-3 text-sm font-semibold text-white disabled:opacity-50">{boardConditionalRuleEditor.saveResult?.success ? 'Alternativa guardada' : 'Guardar alternativa elegida'}</button>
            </div>
          </section>
        </div>
      ) : null}
      {colorEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-y-auto border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-950">Editar color {colorEditor.color.code_4dig}</h2>
            <p className="mt-1 text-sm text-slate-600">Cambios de configuración para {scopeLabel(colorEditor.finding.proposedScope)}. Al guardar, vuelve a consultar SAP para recalcular la revisión.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-slate-700">Nombre SAP
                <input value={colorEditor.color.name_color_sap} onChange={event => setColorEditor(current => current ? { ...current, color: { ...current.color, name_color_sap: event.target.value.toUpperCase() } } : current)} className="h-9 border border-slate-300 px-2" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">Modo de color
                <select value={colorEditor.color.color_mode} onChange={event => setColorEditor(current => current ? { ...current, color: { ...current.color, color_mode: event.target.value as ColorEntry['color_mode'] } } : current)} className="h-9 border border-slate-300 bg-white px-2">
                  <option value="full">Unicolor</option>
                  <option value="dual">Dual</option>
                  <option value="balance">Balance</option>
                  <option value="equivalent">Equivalente</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">Color SAP para {scopeLabel(colorEditor.finding.proposedScope)}
                <input value={colorConfigurationScope(colorEditor.finding) ? colorEditor.color.application_colors_json[colorConfigurationScope(colorEditor.finding)!] ?? '' : ''} onChange={event => setColorEditor(current => {
                  const scope = current ? colorConfigurationScope(current.finding) : null
                  if (!current || !scope) return current
                  return { ...current, color: { ...current.color, application_colors_json: { ...current.color.application_colors_json, [scope]: event.target.value.toUpperCase().slice(0, 4) } } }
                })} className="h-9 border border-slate-300 px-2 font-mono uppercase" maxLength={4} />
              </label>
              {hasBoardEvidence(colorEditor.finding) && boardMaterialProfileScope(colorEditor.finding) ? <label className="grid gap-1 text-sm font-semibold text-slate-700">Perfil de material
                <select value={boardMaterialProfileScope(colorEditor.finding) ? colorEditor.color.application_material_profiles_json[boardMaterialProfileScope(colorEditor.finding)!] ?? '' : ''} onChange={event => setColorEditor(current => {
                  const scope = current ? boardMaterialProfileScope(current.finding) : null
                  if (!current || !scope) return current
                  return { ...current, color: { ...current.color, application_material_profiles_json: { ...current.color.application_material_profiles_json, [scope]: event.target.value || undefined } } }
                })} className="h-9 border border-slate-300 bg-white px-2">
                  <option value="">Sin definir</option><option value="ST">ST</option><option value="RH">RH</option><option value="CARB2">CARB2</option>
                </select>
              </label> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setColorEditor(null)} className="h-9 border border-slate-300 px-3 text-sm font-semibold text-slate-800">Cancelar</button>
              <button type="button" onClick={saveColorEditor} disabled={isPending} className="h-9 bg-slate-950 px-3 text-sm font-semibold text-white disabled:opacity-50">Guardar color</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
