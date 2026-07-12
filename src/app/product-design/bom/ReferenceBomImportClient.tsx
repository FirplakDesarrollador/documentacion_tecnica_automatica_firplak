'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  Ban,
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
  confirmTransientColorMatrixAction,
  confirmTransientColorRuleAction,
  confirmTransientMaterialProfileAction,
  deactivateTransientSapInactiveSkuInSupabaseAction,
  deactivateTransientReferenceBomSkusInSapAction,
  getTransientReferenceBomColorAction,
  listTransientReferenceBomImportCandidatesAction,
  publishTransientReferenceBomAction,
  saveTransientColorOverrideAction,
  saveTransientReferenceBomColorAction,
  validateTransientAbsencesAction,
  verifyTransientColorMatrixAction,
} from './transientReferenceImportActions'
import type {
  ReferenceImportCandidate,
  ReferenceImportFinding,
  ReferenceImportWorkspace,
} from '@/lib/bom/referenceImportTypes'
import type { ColorEntry } from '@/app/rules/colors/actions'
import type { ColorApplicationScope } from '@/app/rules/colors/productiveScopes'
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
  confirmationText: string
  result: string | null
}

type ColorEditorState = {
  finding: ReferenceImportFinding
  color: ColorEntry
}

type ColorRuleMatrixRow = {
  key: string
  sourceColorCode: string
  scope: string
  suggestedTargetColorCode: string | null
  findingIds: string[]
  baseItemCodes: string[]
  conflictingTargetColorCodes: string[]
}

type SelectedDualColorPair = {
  sourceColorCode: string
  structureColorCode: string
  frontColorCode: string
}

type ColorRuleMatrixCoverage = {
  sourceColorCode: string
  scope: string
  targetColorCode: string
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
  }>
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

function expectedColorConfirmation(finding: ReferenceImportFinding): string | null {
  if (finding.findingType !== 'color_rule_proposal' || !finding.proposedScope || !finding.proposedColorCode) return null
  const sourceColorCode = asString(finding.detailsJson.source_color_code)
  if (!sourceColorCode) return null
  return `CONFIRMAR REGLA ${sourceColorCode} ${finding.proposedScope} ${finding.proposedColorCode}`
}

function expectedSkuDeactivationConfirmation(skuComplete: string): string {
  return `INACTIVAR EN SUPABASE ${skuComplete}`
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

function hasBoardEvidence(finding: ReferenceImportFinding): boolean {
  const evidence = Array.isArray(finding.detailsJson.by_sku) ? finding.detailsJson.by_sku : []
  return evidence.some(item => asString(asRecord(asRecord(item).technical_metadata).material_kind) === 'board')
}

function colorConfigurationScope(finding: ReferenceImportFinding): ColorApplicationScope | null {
  return finding.proposedScope && finding.proposedScope !== 'NA'
    ? finding.proposedScope as ColorApplicationScope
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
    const selectedFindings = targets.length === 1 ? group.targets.get(targets[0]) ?? [] : []
    return {
      key,
      sourceColorCode: group.sourceColorCode,
      scope: group.scope,
      suggestedTargetColorCode: targets.length === 1 ? targets[0] : null,
      findingIds: selectedFindings.map(finding => finding.id),
      baseItemCodes: [...new Set(selectedFindings.flatMap(finding => finding.baseItemCode ? [finding.baseItemCode] : []))].sort(),
      conflictingTargetColorCodes: targets.length > 1 ? targets : [],
    }
  }).sort((left, right) => left.sourceColorCode.localeCompare(right.sourceColorCode) || left.scope.localeCompare(right.scope))
}

function selectedDualColorPairs(rows: ColorRuleMatrixRow[]): SelectedDualColorPair[] {
  const edgeColorsBySource = new Map<string, { structureColorCode?: string; frontColorCode?: string }>()
  for (const row of rows) {
    if (!row.suggestedTargetColorCode) continue
    const edgeColors = edgeColorsBySource.get(row.sourceColorCode) ?? {}
    if (row.scope === 'edge_band_body') edgeColors.structureColorCode = row.suggestedTargetColorCode
    if (row.scope === 'edge_band_front') edgeColors.frontColorCode = row.suggestedTargetColorCode
    edgeColorsBySource.set(row.sourceColorCode, edgeColors)
  }
  return [...edgeColorsBySource.entries()].flatMap(([sourceColorCode, edgeColors]) =>
    edgeColors.structureColorCode && edgeColors.frontColorCode && edgeColors.structureColorCode !== edgeColors.frontColorCode
      ? [{ sourceColorCode, structureColorCode: edgeColors.structureColorCode, frontColorCode: edgeColors.frontColorCode }]
      : []
  )
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

function expectedMaterialGroupConfirmation(finding: ReferenceImportFinding): string | null {
  if (finding.findingType !== 'material_group_confirmation') return null
  const codes = affectedBaseItemCodes(finding)
  return codes.length > 1 ? `CONFIRMAR GRUPO ${codes.sort().join(' + ')}` : null
}

function expectedMaterialProfileConfirmation(finding: ReferenceImportFinding): string | null {
  if (finding.findingType !== 'material_profile_proposal' || !finding.proposedScope) return null
  const sourceColorCode = asString(finding.detailsJson.source_color_code)
  const materialProfile = asString(finding.detailsJson.material_profile)
  return sourceColorCode && materialProfile
    ? `CONFIRMAR PERFIL ${sourceColorCode} ${finding.proposedScope} ${materialProfile}`
    : null
}

export function ReferenceBomImportClient({ initialCandidates }: Props) {
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState(initialCandidates)
  const [selectedCandidate, setSelectedCandidate] = useState<ReferenceImportCandidate | null>(initialCandidates[0] ?? null)
  const [workspace, setWorkspace] = useState<ReferenceImportWorkspace | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmationTexts, setConfirmationTexts] = useState<Record<string, string>>({})
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, OverrideDraft>>({})
  const [issueMethodDraft, setIssueMethodDraft] = useState<IssueMethodDraft>({ targetIssueMethod: 'im_Manual', confirmationText: '', result: null })
  const [overrideEditors, setOverrideEditors] = useState<Record<string, boolean>>({})
  const [colorEditor, setColorEditor] = useState<ColorEditorState | null>(null)
  const [selectedMatrixRules, setSelectedMatrixRules] = useState<Record<string, boolean>>({})
  const [matrixTargetColorEdits, setMatrixTargetColorEdits] = useState<Record<string, string>>({})
  const [matrixRulesReviewed, setMatrixRulesReviewed] = useState(false)
  const [matrixRulesProceedingKey, setMatrixRulesProceedingKey] = useState<string | null>(null)
  const [isApplyingMatrixRules, setIsApplyingMatrixRules] = useState(false)
  const [matrixRulesStartedAt, setMatrixRulesStartedAt] = useState<number | null>(null)
  const [matrixCoverage, setMatrixCoverage] = useState<{ selectionKey: string; success: boolean; results: ColorRuleMatrixCoverage[] } | null>(null)
  const [matrixVerificationProgress, setMatrixVerificationProgress] = useState<AnalysisProgress | null>(null)
  const [matrixVerificationStartedAt, setMatrixVerificationStartedAt] = useState<number | null>(null)
  const [skuDeactivationConfirmations, setSkuDeactivationConfirmations] = useState<Record<string, string>>({})
  const [skuActionMessages, setSkuActionMessages] = useState<Record<string, string>>({})
  const [selectedMatrixAbsences, setSelectedMatrixAbsences] = useState<Record<string, boolean>>({})
  const [validatedMatrixAbsences, setValidatedMatrixAbsences] = useState<Record<string, boolean>>({})
  const [selectedMatrixSapSkus, setSelectedMatrixSapSkus] = useState<Record<string, boolean>>({})
  const [matrixAbsenceReviewed, setMatrixAbsenceReviewed] = useState(false)
  const [matrixAbsenceProceedingKey, setMatrixAbsenceProceedingKey] = useState<string | null>(null)
  const [isValidatingMatrixAbsences, setIsValidatingMatrixAbsences] = useState(false)
  const [matrixAbsenceStartedAt, setMatrixAbsenceStartedAt] = useState<number | null>(null)
  const [matrixSapDeactivationConfirmation, setMatrixSapDeactivationConfirmation] = useState('')
  const [matrixBatchMessage, setMatrixBatchMessage] = useState<string | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null)
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const analysisElapsedSeconds = useElapsedSeconds(analysisStartedAt)
  const matrixVerificationElapsedSeconds = useElapsedSeconds(matrixVerificationStartedAt)
  const matrixRulesElapsedSeconds = useElapsedSeconds(matrixRulesStartedAt)
  const matrixAbsenceElapsedSeconds = useElapsedSeconds(matrixAbsenceStartedAt)

  const unresolvedBlockers = workspace?.findings.filter(finding => finding.severity === 'blocker' && finding.status === 'open') ?? []
  const capturedSnapshots = workspace?.snapshots.filter(snapshot => snapshot.status === 'captured') ?? []
  const failedSnapshots = workspace?.snapshots.filter(snapshot => snapshot.status === 'failed') ?? []
  const sapActiveSkuCount = asNumber(workspace?.run.summaryJson.sap_active_sku_count)
  const supabaseOnlyColors = asStringArray(workspace?.run.summaryJson.supabase_only_sku_colors)
  const sapOnlyColors = asStringArray(workspace?.run.summaryJson.sap_only_sku_colors)
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
  const hasSapCatalogMismatch = sapInactiveSkuCodes.length > 0
    || sapMissingSkuCodes.length > 0
    || genericSupabaseOnlyColors.length > 0
    || sapOnlyColors.length > 0
  const hasIncompleteSource = hasIncompleteSapRead || hasSapCatalogMismatch
  const colorMatrixRows = colorRuleMatrixRows(workspace?.findings ?? [])
  const selectedMatrixRuleCount = colorMatrixRows.filter(row => selectedMatrixRules[row.key]).length
  const selectedColorMatrixRows = colorMatrixRows.flatMap(row => {
    if (!selectedMatrixRules[row.key]) return []
    const targetColorCode = normalizedMatrixColorCode(matrixTargetColorEdits[row.key] ?? row.suggestedTargetColorCode)
    return isMatrixColorCode(targetColorCode) ? [{ ...row, suggestedTargetColorCode: targetColorCode }] : []
  })
  const hasInvalidSelectedMatrixTarget = selectedMatrixRuleCount !== selectedColorMatrixRows.length
  const selectedMatrixDualColorPairs = selectedDualColorPairs(selectedColorMatrixRows)
  const matrixSelectionKey = selectedColorMatrixRows.map(row => `${row.key}:${row.suggestedTargetColorCode}`).sort().join('|')
  const matrixRulesRequireSecondPress = matrixRulesProceedingKey === matrixSelectionKey
  const matrixCoverageIsCurrent = matrixCoverage?.selectionKey === matrixSelectionKey
  const matrixCoverageIsClean = matrixCoverageIsCurrent
    && matrixCoverage.results.length === selectedColorMatrixRows.length
    && matrixCoverage.results.every(result => result.sapReadErrors.length === 0 && result.mismatches.every(mismatch =>
      mismatch.reason === 'missing_component'
        && validatedMatrixAbsences[`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`] === true
        ? true
        : mismatch.reason !== 'missing_component' ? false : false
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
      .map(mismatch => [mismatch.skuComplete, { skuComplete: mismatch.skuComplete, itemName: mismatch.skuItemName }] as const))).values()]
    : []
  const selectedMatrixSapSkuCodes = matrixSapSkuCandidates.filter(item => selectedMatrixSapSkus[item.skuComplete]).map(item => item.skuComplete)
  const expectedMatrixSapDeactivationConfirmation = `INACTIVAR ${selectedMatrixSapSkuCodes.length} SKU EN SAP`
  const reviewFindings = workspace?.findings.filter(finding => finding.status === 'open' && finding.severity !== 'info' && finding.findingType !== 'issue_method_review' && finding.findingType !== 'color_rule_proposal') ?? []
  const issueMethodFindings = workspace?.findings.filter(finding => finding.status === 'open' && finding.findingType === 'issue_method_review') ?? []
  const reviewTopicCount = new Set(reviewFindings.map(finding => {
    if (finding.findingType === 'material_profile_proposal') return `material-profile:${finding.lineIdentity}`
    if (finding.findingType === 'color_rule_proposal') return `color-rule:${finding.lineIdentity}`
    if (finding.findingType === 'material_consumption_conflict') return `material-consumption:${finding.lineIdentity}`
    return `${finding.findingType}:${finding.lineIdentity ?? finding.id}`
  })).size + (issueMethodFindings.length > 0 ? 1 : 0)
  const issueMethodDifferencesToApply = issueMethodFindings.flatMap(finding => issueMethodDifferences(finding, issueMethodDraft.targetIssueMethod))
  const expectedIssueConfirmation = `APLICAR METODO ${issueMethodDraft.targetIssueMethod} EN SAP PARA ${issueMethodDifferencesToApply.length} LINEAS`
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

  async function analyzeReferenceWithProgress(referenceId: string): Promise<void> {
    const startedAt = Date.now()
    clearTransientMatrixAbsenceApprovals()
    setAnalysisStartedAt(startedAt)
    setAnalysisProgress({ stage: 'starting', message: 'Iniciando el análisis SAP.', current: null, total: null })
    try {
      const response = await fetch('/api/product-design/bom/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceId }),
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
    setWorkspace(null)
    setMessage(null)
    setMatrixTargetColorEdits({})
  }

  function analyzeSelectedReference(): void {
    if (!selectedCandidate) return
    runTask(async () => {
      try {
        await analyzeReferenceWithProgress(selectedCandidate.referenceId)
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
        confirmationText: confirmationTexts[finding.id] ?? '',
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
        confirmationText: confirmationTexts[finding.id] ?? '',
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
        confirmationText: issueMethodDraft.confirmationText,
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
        confirmationText: dryRun ? result.issueMethodResult?.confirmationRequired ?? current.confirmationText : current.confirmationText,
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
      setMatrixRulesProceedingKey(matrixSelectionKey)
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
          }] : []),
          acceptedAbsences: validatedMatrixAbsenceItems,
        })
        setMessage(`${result.message} Tiempo de aplicación: ${formatElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))}.`)
        if (!result.success) return
        setSelectedMatrixRules({})
        setMatrixTargetColorEdits({})
        setMatrixRulesReviewed(false)
        setMatrixRulesProceedingKey(null)
        setMatrixCoverage(null)
        try {
          await analyzeReferenceWithProgress(workspace.run.referenceId)
        } catch (error) {
          setMessage(error instanceof Error ? `La regla se guardó, pero no se pudo actualizar la vista: ${error.message}` : 'La regla se guardó, pero no se pudo actualizar la vista.')
        }
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
    runTask(async () => {
      const startedAt = Date.now()
      const selections = selectedColorMatrixRows.flatMap(row => row.suggestedTargetColorCode ? [{
          sourceColorCode: row.sourceColorCode,
          scope: row.scope as ReferenceProductApplicationScope,
          targetColorCode: row.suggestedTargetColorCode,
          baseItemCodes: row.baseItemCodes,
        }] : [])
      try {
        const result = await verifyColorMatrixWithProgress(selections, startedAt)
        setMessage(`${result.message} Tiempo total: ${formatElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))}.`)
        setMatrixCoverage({ selectionKey: matrixSelectionKey, success: result.success, results: result.results })
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudo verificar la matriz.')
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
    setMatrixCoverage(null)
    setMatrixRulesReviewed(false)
    setMatrixRulesProceedingKey(null)
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
        confirmationText: matrixSapDeactivationConfirmation,
      })
      setMatrixBatchMessage(`${result.message} ${result.results.map(item => `${item.skuComplete}: ${item.message}`).join(' ')}`)
      if (dryRun) {
        setMatrixSapDeactivationConfirmation(result.confirmationRequired)
        return
      }
      if (!result.success || !workspace) return
      const coverage = await verifyTransientColorMatrixAction({
        selections: selectedColorMatrixRows.flatMap(row => row.suggestedTargetColorCode ? [{
          sourceColorCode: row.sourceColorCode,
          scope: row.scope as ReferenceProductApplicationScope,
          targetColorCode: row.suggestedTargetColorCode,
          baseItemCodes: row.baseItemCodes,
        }] : []),
      })
      setMatrixCoverage({ selectionKey: matrixSelectionKey, success: coverage.success, results: coverage.results })
      setMessage(coverage.message)
      setSelectedMatrixSapSkus({})
      setMatrixSapDeactivationConfirmation('')
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

  function deactivateInactiveSku(skuComplete: string): void {
    if (!workspace) return
    runTask(async () => {
      setSkuActionMessages(current => ({ ...current, [skuComplete]: 'Comprobando el estado en SAP...' }))
      try {
        const result = await deactivateTransientSapInactiveSkuInSupabaseAction({
          referenceId: workspace.run.referenceId,
          skuComplete,
          confirmationText: skuDeactivationConfirmations[skuComplete] ?? '',
        })
        setMessage(result.message)
        setSkuActionMessages(current => ({ ...current, [skuComplete]: result.message }))
        if (!result.success) return

        const nextCandidates = await listTransientReferenceBomImportCandidatesAction(search)
        setCandidates(nextCandidates)
        setSelectedCandidate(current => nextCandidates.find(candidate => candidate.referenceId === current?.referenceId) ?? current)
        setWorkspace(null)
        setSkuDeactivationConfirmations(current => Object.fromEntries(
          Object.entries(current).filter(([code]) => code !== skuComplete)
        ))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'No se pudo inactivar el SKU en Supabase.'
        setMessage(errorMessage)
        setSkuActionMessages(current => ({ ...current, [skuComplete]: errorMessage }))
      }
    })
  }

  function publishRun(): void {
    if (!workspace) return
    runTask(async () => {
      const result = await publishTransientReferenceBomAction(workspace.run.referenceId)
      setMessage(result.message)
      if (result.workspace) setWorkspace(result.workspace)
    })
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">LdM/BOM SAP</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Importacion de LdM por referencia</h1>
        </div>
        {workspace ? (
          <button
            type="button"
            onClick={publishRun}
            disabled={isPending || hasIncompleteSource || workspace.run.status !== 'needs_review' || unresolvedBlockers.length > 0}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Publicar BOM
          </button>
        ) : null}
      </header>

      {message ? (
        <div className="flex items-start gap-2 border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
          <p>{message}</p>
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]">
        <aside className="border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-950">Productos de venta</h2>
            <button
              type="button"
              title="Buscar referencias"
              onClick={searchReferences}
              disabled={isPending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') searchReferences()
              }}
              placeholder="Codigo de producto, por ejemplo VBAN05-0001"
              className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none ring-sky-600 focus:ring-1"
            />
          </div>
          <div className="mt-4 max-h-[520px] space-y-1 overflow-y-auto pr-1">
            {candidates.map(candidate => {
              const selected = candidate.referenceId === selectedCandidate?.referenceId
              return (
                <button
                  key={candidate.referenceId}
                  type="button"
                  onClick={() => selectReference(candidate)}
                  className={`w-full border px-3 py-3 text-left ${selected ? 'border-sky-400 bg-sky-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                >
                  <span className="block font-mono text-xs font-semibold text-slate-700">
                    {salesReferenceCode(candidate.familyCode, candidate.referenceCode)}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-slate-950">{candidate.productName}</span>
                  <span className="mt-1 block text-xs text-slate-500">{candidate.activeSkuCount} colores activos</span>
                </button>
              )
            })}
            {candidates.length === 0 ? <p className="px-1 py-4 text-sm text-slate-500">Sin referencias para mostrar.</p> : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Producto de venta seleccionado</p>
                <p className="font-mono text-sm font-semibold text-slate-700">
                  {selectedCandidate ? salesReferenceCode(selectedCandidate.familyCode, selectedCandidate.referenceCode) : 'Sin seleccion'}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">{selectedCandidate?.productName ?? 'Selecciona una referencia'}</h2>
                {selectedCandidate ? (
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedCandidate.manufacturingProcess ?? 'Proceso sin definir'} · {selectedCandidate.productType ?? 'Tipo sin definir'}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={analyzeSelectedReference}
                disabled={!selectedCandidate || Boolean(analysisProgress)}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {analysisProgress ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                {analysisProgress ? 'Analizando SAP…' : hasSapCatalogMismatch && !hasIncompleteSapRead
                  ? 'Volver a comprobar SAP'
                  : hasIncompleteSapRead
                    ? 'Reintentar LdM pendientes'
                    : 'Analizar LdM en SAP'}
              </button>
            </div>
          </section>

          {analysisProgress ? <section aria-live="polite" className="border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-950">
            <div className="flex items-center gap-2 font-semibold"><LoaderCircle className="h-4 w-4 animate-spin" />Análisis SAP en curso</div>
            <p className="mt-1">Tiempo transcurrido: {formatElapsedSeconds(analysisElapsedSeconds)}</p>
            <p className="mt-1">{analysisProgress.message}{analysisProgress.current !== null && analysisProgress.total !== null ? ` (${analysisProgress.current} de ${analysisProgress.total})` : ''}</p>
            {analysisProgress.total !== null && analysisProgress.total > 0 ? <progress className="mt-3 h-2 w-full accent-sky-700" value={analysisProgress.current ?? 0} max={analysisProgress.total} /> : <div className="mt-3 h-2 w-full animate-pulse bg-sky-200" />}
          </section> : null}

          {workspace ? (
            <>
              {colorMatrixRows.length > 0 ? (
                <section className="border border-sky-200 bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 bg-sky-50 px-5 py-4">
                    <div>
                      <h2 className="font-semibold text-slate-950">Matriz de colores internos y cantos (V06)</h2>
                      <p className="mt-1 text-sm text-slate-600">La propuesta inicial viene de la referencia analizada; puedes editarla antes de verificar el catálogo activo de SAP.</p>
                      <p className="mt-1 text-sm text-slate-600">Una fila aplica una regla global a todas las piezas indicadas. Para una excepción puntual, usa el override de la pieza debajo.</p>
                    </div>
                    <button type="button" onClick={verifyColorMatrixInSap} disabled={isPending || Boolean(matrixVerificationProgress) || selectedMatrixRuleCount === 0 || hasInvalidSelectedMatrixTarget} className="inline-flex h-9 items-center gap-2 border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-900 disabled:opacity-50">{matrixVerificationProgress ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{matrixVerificationProgress ? 'Verificando en SAP…' : 'Verificar seleccionadas en SAP'}</button>
                  </div>
                  {matrixVerificationProgress ? <div aria-live="polite" className="border-b border-sky-100 bg-sky-50 px-5 py-3 text-sm text-sky-950">
                    <p className="font-semibold">Verificación de matriz en curso</p>
                    <p className="mt-1">Tiempo transcurrido: {formatElapsedSeconds(matrixVerificationElapsedSeconds)}</p>
                    <p className="mt-1">{matrixVerificationProgress.message}{matrixVerificationProgress.current !== null && matrixVerificationProgress.total !== null ? ` (${matrixVerificationProgress.current} de ${matrixVerificationProgress.total})` : ''}</p>
                    {matrixVerificationProgress.total !== null && matrixVerificationProgress.total > 0 ? <progress className="mt-2 h-2 w-full accent-sky-700" value={matrixVerificationProgress.current ?? 0} max={matrixVerificationProgress.total} /> : <div className="mt-2 h-2 w-full animate-pulse bg-sky-200" />}
                  </div> : null}
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
                              setMatrixCoverage(null)
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
                              {isConflict ? <p className="mt-1 text-xs text-rose-700">La referencia analizada tiene más de un color. Define uno para verificarlo contra todo SAP.</p> : null}
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-700">{row.baseItemCodes.map(code => `${code}${workspace.proposalItemNames[code] ? ` — ${workspace.proposalItemNames[code]}` : ''}`).join('\n')}</td>
                          </tr>
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-sky-100 px-5 py-4">
                    <p className="text-sm text-slate-700">Seleccionadas: {selectedMatrixRuleCount}. Edita el color interno si hace falta y luego verifica el catálogo activo en SAP; solo se habilita confirmar cuando todo coincide al 100%.</p>
                    {hasInvalidSelectedMatrixTarget ? <p className="mt-2 text-xs font-semibold text-rose-700">Cada regla seleccionada necesita un color interno de cuatro caracteres.</p> : null}
                    {selectedMatrixDualColorPairs.map(pair => <p key={pair.sourceColorCode} className="mt-3 border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">Al aplicar, {pair.sourceColorCode} quedará como Dual: estructura {pair.structureColorCode} y frentes {pair.frontColorCode}, tanto para tableros como para cantos.</p>)}
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
                          const verified = unresolvedMismatches.length === 0 && result.sapReadErrors.length === 0
                          return <div key={`${result.sourceColorCode}:${result.scope}`} className={verified ? 'border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950' : 'border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950'}>
                              <p className="font-semibold">Color {result.sourceColorCode} · {scopeLabel(result.scope)} → {result.targetColorCode}: {verified ? `100% confirmado en ${result.checkedSkuCount} SKU(s) activos en SAP` : `${unresolvedMismatches.length + result.sapReadErrors.length} caso(s) por revisar`}</p>
                              <p className="mt-1 text-xs">Catálogo: {result.catalogSkuCount} SKU(s) de venta con este color · ignorados: {result.excludedInactiveSapSkuCount} inactivo(s) en SAP y {result.excludedKitSkuCount} kit(s) de venta.{acceptedMissingComponentCount > 0 ? ` ${acceptedMissingComponentCount} ausencia(s) intencional(es) aceptada(s).` : ''}</p>
                              {unresolvedMismatches.map(mismatch => <div key={`${mismatch.skuComplete}:${mismatch.baseItemCode}:${mismatch.itemCode ?? 'missing'}`} className="mt-2 border-t border-amber-200 pt-2">
                              <p><span className="font-mono">{mismatch.skuComplete}</span>{mismatch.skuItemName ? ` — ${mismatch.skuItemName}` : ''} · {mismatch.baseItemCode}{mismatch.itemName ? ` — ${mismatch.itemName}` : ''}: {mismatch.reason === 'missing_component' ? 'la pieza no aparece en SAP' : `SAP usa ${mismatch.observedColorCode ?? 'sin color'} (${mismatch.itemCode ?? 'sin código'})`}</p>
                              {mismatch.reason === 'missing_component' ? <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-emerald-900"><input type="checkbox" checked={selectedMatrixAbsences[`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`] === true} onChange={event => toggleMatrixAbsence(`${result.sourceColorCode}:${result.scope}:${mismatch.skuComplete}:${mismatch.baseItemCode}`, event.target.checked)} />Ausencia válida</label> : null}
                              <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-rose-900"><input type="checkbox" checked={selectedMatrixSapSkus[mismatch.skuComplete] === true} onChange={event => setSelectedMatrixSapSkus(current => ({ ...current, [mismatch.skuComplete]: event.target.checked }))} />Inactivar este SKU en SAP</label>
                            </div>)}
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
                            <input value={matrixSapDeactivationConfirmation} onChange={event => setMatrixSapDeactivationConfirmation(event.target.value)} placeholder={expectedMatrixSapDeactivationConfirmation} className="h-8 min-w-[240px] border border-rose-300 bg-white px-2 font-mono text-xs text-slate-900" />
                            <button type="button" onClick={() => deactivateMatrixSkusInSap(false)} disabled={isPending || selectedMatrixSapSkuCodes.length === 0 || matrixSapDeactivationConfirmation.trim() !== expectedMatrixSapDeactivationConfirmation} className="h-8 bg-rose-800 px-2 text-xs font-semibold text-white disabled:opacity-50">Confirmar inactivación</button>
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
                            Puedes inactivarlos aquí para alinear Supabase. Antes de guardar, la app volverá a confirmar el estado de cada código en SAP.
                          </p>
                          <div className="mt-3 space-y-3">
                            {sapInactiveSkuCodes.map(skuComplete => {
                              const expectedConfirmation = expectedSkuDeactivationConfirmation(skuComplete)
                              const enteredConfirmation = skuDeactivationConfirmations[skuComplete] ?? ''
                              return (
                                <div key={skuComplete} className="border border-rose-200 bg-white p-3">
                                  <p className="font-mono text-sm font-semibold text-slate-950">{skuComplete}</p>
                                  <p className="mt-1 text-xs text-slate-600">
                                    Para inactivarlo únicamente en Supabase, escribe <span className="font-mono font-semibold text-slate-800">{expectedConfirmation}</span>
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <input
                                      type="text"
                                      value={enteredConfirmation}
                                      onChange={event => setSkuDeactivationConfirmations(current => ({
                                        ...current,
                                        [skuComplete]: event.target.value,
                                      }))}
                                      placeholder={expectedConfirmation}
                                      className="h-9 min-w-0 flex-1 border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-rose-700"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => deactivateInactiveSku(skuComplete)}
                                      disabled={isPending || enteredConfirmation.trim() !== expectedConfirmation}
                                      className="inline-flex h-9 items-center gap-2 rounded-md bg-rose-800 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <Ban className="h-4 w-4" />
                                      Inactivar en Supabase
                                    </button>
                                  </div>
                                  <p className="mt-2 text-xs font-medium text-rose-800">Esta acción no modifica SAP.</p>
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
                      {sapOnlyColors.length > 0 ? <p className="mt-3 text-sm text-rose-900">Activos solo en SAP: {sapOnlyColors.join(', ')}. Regístralos en la app o confirma que deban inactivarse en SAP.</p> : null}
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
                  <h2 className="font-semibold text-slate-950">BOM base propuesta</h2>
                  <span className="text-sm text-slate-500">Pendiente de publicacion</span>
                </div>
                <div className="max-h-[400px] overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Orden</th>
                        <th className="px-5 py-3">Material o alternativas</th>
                        <th className="px-5 py-3">Uso en producto</th>
                        <th className="px-5 py-3">Consumos</th>
                        <th className="px-5 py-3">Unidad</th>
                        <th className="px-5 py-3">Método de salida propuesto</th>
                        <th className="px-5 py-3">Bodega</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.run.proposedBomStructure.lines.map(line => {
                        const observedConsumptions = line.consumptions.filter(consumption => consumption.status !== 'needs_definition').length
                        const pendingConsumptions = line.consumptions.filter(consumption => consumption.status === 'needs_definition').length
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
                            <td className="px-5 py-3 text-slate-700">{scopeLabel(line.product_application_scope)}</td>
                            <td className="px-5 py-3 text-sm text-slate-700">
                              {line.line_kind === 'fixed' ? (
                                <span className="tabular-nums">{line.qty}</span>
                              ) : (
                                <>
                                  <p>{observedConsumptions} observados</p>
                                  <p className={pendingConsumptions > 0 ? 'mt-1 text-amber-700' : 'mt-1 text-emerald-700'}>
                                    {pendingConsumptions > 0 ? `${pendingConsumptions} por definir` : 'Todos definidos'}
                                  </p>
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
                    Hay {pendingConsumptionCount} consumo{pendingConsumptionCount === 1 ? '' : 's'} por definir para configuraciones dual o balance que SAP no evidenció. Permanecen visibles y no bloquean publicar la BOM base; esos SKU quedarán pendientes de consumo hasta definirlos.
                  </p>
                ) : null}
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
                    const colorConfirmation = expectedColorConfirmation(finding)
                    const groupConfirmation = expectedMaterialGroupConfirmation(finding)
                    const profileConfirmation = expectedMaterialProfileConfirmation(finding)
                    const confirmation = colorConfirmation ?? groupConfirmation ?? profileConfirmation
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
                            <p className="mt-2 text-sm text-sky-900">Para confirmar, escribe exactamente: <span className="font-mono text-xs">{confirmation}</span></p>
                            <div className="mt-3 flex flex-wrap gap-2">
                            <input
                              value={confirmationTexts[finding.id] ?? ''}
                              onChange={event => setConfirmationTexts(current => ({ ...current, [finding.id]: event.target.value }))}
                              placeholder={confirmation}
                              className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 font-mono text-xs outline-none ring-sky-600 focus:ring-1"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (colorConfirmation) confirmColorRule(finding)
                                else if (groupConfirmation) confirmMaterialGroup()
                                else confirmMaterialProfile(finding)
                              }}
                              disabled={isPending || confirmationTexts[finding.id]?.trim() !== confirmation}
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
                                onClick={analyzeSelectedReference}
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
                          onChange={event => setIssueMethodDraft(current => ({ ...current, targetIssueMethod: event.target.value as IssueMethodDraft['targetIssueMethod'], confirmationText: '', result: null }))}
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
                    <p className="mt-3 text-xs text-violet-900">Después del dry-run, escribe: <span className="font-mono font-semibold">{expectedIssueConfirmation}</span></p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input value={issueMethodDraft.confirmationText} onChange={event => setIssueMethodDraft(current => ({ ...current, confirmationText: event.target.value }))} placeholder={expectedIssueConfirmation} className="h-9 min-w-[280px] flex-1 border border-violet-300 bg-white px-3 font-mono text-xs text-slate-900" />
                      <button type="button" onClick={() => applyIssueMethodsBatch(false)} disabled={isPending || issueMethodDraft.confirmationText.trim() !== expectedIssueConfirmation || issueMethodDifferencesToApply.length === 0} className="h-9 bg-violet-800 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
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
              {hasBoardEvidence(colorEditor.finding) ? <label className="grid gap-1 text-sm font-semibold text-slate-700">Perfil de material
                <select value={colorConfigurationScope(colorEditor.finding) ? colorEditor.color.application_material_profiles_json[colorConfigurationScope(colorEditor.finding)!] ?? '' : ''} onChange={event => setColorEditor(current => {
                  const scope = current ? colorConfigurationScope(current.finding) : null
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
