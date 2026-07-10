'use client'

import { useState, useTransition } from 'react'
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
  analyzeReferenceBomImportAction,
  confirmReferenceBomColorRuleAction,
  deactivateSapInactiveSkuInSupabaseAction,
  listReferenceBomImportCandidatesAction,
  publishReferenceBomImportAction,
} from './referenceImportActions'
import type {
  ReferenceImportCandidate,
  ReferenceImportFinding,
  ReferenceImportWorkspace,
} from '@/lib/bom/referenceImportTypes'

type Props = {
  initialCandidates: ReferenceImportCandidate[]
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
    edge_band_body: 'Canto de cuerpo',
    edge_band_front: 'Canto de frente',
    edge_band_inner: 'Canto interior',
    edge_band_drawer_bottom: 'Canto de fondo de cajón',
  }
  return scope ? labels[scope] ?? scope : 'Pendiente de definir'
}

function findingDescription(finding: ReferenceImportFinding): string | null {
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
  const skuVariantMap = asRecord(finding.detailsJson.sku_variant_map)
  return Object.entries(skuVariantMap).flatMap(([skuComplete, variant]) => {
    const materialColor = asString(variant)
    const productColor = skuComplete.split('-')[3]
    return productColor && materialColor ? [{ productColor, materialColor }] : []
  })
}

function affectedBaseItemCodes(finding: ReferenceImportFinding): string[] {
  return asStringArray(finding.detailsJson.base_item_codes)
}

export function ReferenceBomImportClient({ initialCandidates }: Props) {
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState(initialCandidates)
  const [selectedCandidate, setSelectedCandidate] = useState<ReferenceImportCandidate | null>(initialCandidates[0] ?? null)
  const [workspace, setWorkspace] = useState<ReferenceImportWorkspace | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmationTexts, setConfirmationTexts] = useState<Record<string, string>>({})
  const [skuDeactivationConfirmations, setSkuDeactivationConfirmations] = useState<Record<string, string>>({})
  const [skuActionMessages, setSkuActionMessages] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

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
  const reviewFindings = workspace?.findings.filter(finding => finding.status === 'open' && finding.severity !== 'info') ?? []

  function runTask(task: () => Promise<void>): void {
    startTransition(() => {
      void task()
    })
  }

  function searchReferences(): void {
    runTask(async () => {
      try {
        const nextCandidates = await listReferenceBomImportCandidatesAction(search)
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
  }

  function analyzeSelectedReference(): void {
    if (!selectedCandidate) return
    runTask(async () => {
      const result = await analyzeReferenceBomImportAction(selectedCandidate.referenceId)
      setMessage(result.message)
      if (!result.workspace) return
      setWorkspace(result.workspace)
    })
  }

  function confirmColorRule(finding: ReferenceImportFinding): void {
    if (!workspace) return
    runTask(async () => {
      const result = await confirmReferenceBomColorRuleAction({
        runId: workspace.run.id,
        findingId: finding.id,
        confirmationText: confirmationTexts[finding.id] ?? '',
      })
      setMessage(result.message)
      if (result.workspace) setWorkspace(result.workspace)
    })
  }

  function deactivateInactiveSku(skuComplete: string): void {
    if (!workspace) return
    runTask(async () => {
      setSkuActionMessages(current => ({ ...current, [skuComplete]: 'Comprobando el estado en SAP...' }))
      try {
        const result = await deactivateSapInactiveSkuInSupabaseAction({
          runId: workspace.run.id,
          skuComplete,
          confirmationText: skuDeactivationConfirmations[skuComplete] ?? '',
        })
        setMessage(result.message)
        setSkuActionMessages(current => ({ ...current, [skuComplete]: result.message }))
        if (!result.success) return

        const nextCandidates = await listReferenceBomImportCandidatesAction(search)
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
      const result = await publishReferenceBomImportAction(workspace.run.id)
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
                disabled={!selectedCandidate || isPending}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                {hasSapCatalogMismatch && !hasIncompleteSapRead
                  ? 'Volver a comprobar SAP'
                  : hasIncompleteSapRead
                    ? 'Reintentar LdM pendientes'
                    : 'Analizar LdM en SAP'}
              </button>
            </div>
          </section>

          {workspace ? (
            <>
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
                        <th className="px-5 py-3">Código base</th>
                        <th className="px-5 py-3">Uso en producto</th>
                        <th className="px-5 py-3 text-right">Cantidad</th>
                        <th className="px-5 py-3">Bodega</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.run.proposedBomStructure.lines.map(line => (
                        <tr key={line.line_id} className="border-t border-slate-100">
                          <td className="px-5 py-3 tabular-nums text-slate-600">{line.sort_order}</td>
                          <td className="px-5 py-3 font-mono text-xs text-slate-800">
                            <span className="block">{line.base_item_code}</span>
                            <span className="mt-1 block font-sans text-sm text-slate-600">{workspace.proposalItemNames[line.base_item_code] ?? 'Nombre base no disponible'}</span>
                          </td>
                          <td className="px-5 py-3 text-slate-700">{scopeLabel(line.product_application_scope)}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-slate-700">{line.qty}</td>
                          <td className="px-5 py-3 text-slate-700">{line.input_warehouse_code ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-slate-950">Revisiones de negocio</h2>
                    <p className="mt-1 text-sm text-slate-600">{reviewFindings.length} situaciones que requieren validación</p>
                  </div>
                  {unresolvedBlockers.length > 0 ? <AlertTriangle className="h-5 w-5 text-rose-700" /> : <CheckCircle2 className="h-5 w-5 text-emerald-700" />}
                </div>
                <div className="divide-y divide-slate-200">
                  {reviewFindings.map(finding => {
                    const confirmation = expectedColorConfirmation(finding)
                    const assignments = colorAssignmentEvidence(finding)
                    const affectedCodes = affectedBaseItemCodes(finding)
                    const baseItemName = finding.baseItemCode ? workspace.proposalItemNames[finding.baseItemCode] : null
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
                                  <span key={`${assignment.productColor}:${assignment.materialColor}`} className="border border-slate-200 bg-slate-50 px-2 py-1">
                                    Producto {assignment.productColor}: material {assignment.materialColor}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {affectedCodes.length > 0 ? (
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
                              Guardará en la configuración del color {asString(finding.detailsJson.source_color_code)} que {scopeLabel(finding.proposedScope)} usa el color {finding.proposedColorCode}. No modifica SAP.
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
                              onClick={() => confirmColorRule(finding)}
                              disabled={isPending || confirmationTexts[finding.id]?.trim() !== confirmation}
                              className="h-9 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Confirmar regla
                            </button>
                            </div>
                          </div>
                        ) : null}
                        {!confirmation && finding.severity === 'blocker' && finding.status === 'open' ? (
                          <p className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            Esta revisión no se puede cerrar con texto libre. Primero debe definirse una regla explícita de sustitución de material, cantidad por color o corrección en SAP.
                          </p>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              </section>
                </>
              ) : null}

            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
