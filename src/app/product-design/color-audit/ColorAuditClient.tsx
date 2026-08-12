'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Download,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'

import {
  buildSapAuditReport,
  classifyColorAuditItem,
  declaresProductOrSalesTree,
  mergeColorAuditTrees,
  sapAuditValueLabel,
  summarizeColorAuditRows,
  type ColorAuditItem,
  type ColorAuditRow,
  type ColorAuditTree,
  type SapAuditEvidence,
  type SapAuditGroup,
  type SapAuditReport,
  type SapConfigurationAuditKind,
} from '@/lib/sap/colorAudit'

type AuditTab = 'color' | SapConfigurationAuditKind
type AuditScope = 'color' | 'output_warehouse' | 'components'
type RunPhase = 'families' | 'items' | 'headers' | 'header_reconciliation' | 'tree_lines' | 'paused' | 'complete' | 'cancelled' | 'error'
type RunStatus = 'running' | 'paused' | 'complete' | 'cancelled' | 'error'
type UpdateMode = 'dry-run' | 'apply'
type TreeLineCursor = { treeCode: string; childNum: number }

type StoredRun = {
  key: 'current'
  runId: string
  phase: RunPhase
  resumePhase: 'families' | 'items' | 'headers' | 'header_reconciliation' | 'tree_lines'
  status: RunStatus
  scope: AuditScope
  familyFilter: string
  families: string[]
  familyScopes: Record<string, AuditScope>
  familyIndex: number
  catalogSkip: number
  catalogCursor: string | null
  catalogExhausted: boolean
  familyStartedAt: string
  startedAt: string
  itemSkip: number
  headerSkip: number
  headerReconciliationCodes: string[]
  headerReconciliationOffset: number
  headerReconciliationCompleted: boolean
  lineSkip: number
  lineCursor: TreeLineCursor | null
  itemCount: number
  itemsRead: number
  treesRead: number
  familyTreesRead: number
  lineRowsRead: number
  linePagesRead: number
  completedFamilyCount: number
  averageFamilyDurationMs: number | null
  error: string | null
  updatedAt: string
}

type StoredItem = ColorAuditItem & { key: string; runId: string }
type StoredTree = ColorAuditTree & { key: string; runId: string }
type AuditSnapshot = { items: ColorAuditItem[]; trees: ColorAuditTree[] }

type ItemsResponse = {
  success: boolean
  items?: ColorAuditItem[]
  families?: string[]
  rawItemsRead?: number
  nextSkip?: number
  nextCatalogCursor?: string | null
  done?: boolean
  error?: string
}

type TreesResponse = {
  success: boolean
  trees?: ColorAuditTree[]
  rowsRead?: number
  nextSkip?: number
  nextCursor?: TreeLineCursor | null
  done?: boolean
  error?: string
}

type AuditUpdateItem = {
  itemCode: string
  treeCode: string | null
  childNum: number | null
  currentValue: string
  expectedValue: string
  decisionSource: 'majority' | 'minority' | 'no_consensus'
}

type AuditUpdateResult = {
  auditKind: AuditTab
  itemCode: string
  treeCode: string | null
  childNum: number | null
  expectedValue: string
  decisionSource: AuditUpdateItem['decisionSource']
  beforeValue: string
  afterValue: string | null
  eligible: boolean
  changed: boolean
  skipped: boolean
  stale: boolean
  success: boolean
  message: string
}

type AuditUpdateResponse = {
  success: boolean
  results?: AuditUpdateResult[]
  error?: string
}

type MassUpdateState = {
  phase: 'idle' | 'dry-run' | 'awaiting-confirmation' | 'applying' | 'complete' | 'error'
  auditKind: AuditTab | null
  candidates: AuditUpdateItem[]
  results: AuditUpdateResult[]
  processed: number
  total: number
  confirmed: boolean
  mode: UpdateMode | null
  message: string | null
}

const DB_NAME = 'samigen-sap-audits-v6'
const DB_VERSION = 1
const RUN_STORE = 'runs'
const ITEM_STORE = 'items'
const TREE_STORE = 'trees'
const SAP_PAGE_BATCH_SIZE = 20

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function openAuditDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RUN_STORE)) db.createObjectStore(RUN_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(ITEM_STORE)) db.createObjectStore(ITEM_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(TREE_STORE)) db.createObjectStore(TREE_STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento temporal.'))
  })
}

async function withTransaction<T>(stores: string[], mode: IDBTransactionMode, callback: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openAuditDb()
  const transaction = db.transaction(stores, mode)
  const completed = transactionResult(transaction)
  try {
    const result = await callback(transaction)
    await completed
    return result
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      // The transaction may already have completed after a request-level failure.
    }
    await completed.catch(() => undefined)
    throw error
  } finally {
    db.close()
  }
}

async function saveRun(run: StoredRun): Promise<void> {
  await withTransaction([RUN_STORE], 'readwrite', transaction => requestResult(transaction.objectStore(RUN_STORE).put(run)).then(() => undefined))
}

async function loadRun(): Promise<StoredRun | null> {
  return withTransaction([RUN_STORE], 'readonly', transaction => requestResult(transaction.objectStore(RUN_STORE).get('current')))
}

async function clearAuditData(): Promise<void> {
  await withTransaction([RUN_STORE, ITEM_STORE, TREE_STORE], 'readwrite', transaction => {
    transaction.objectStore(RUN_STORE).clear()
    transaction.objectStore(ITEM_STORE).clear()
    transaction.objectStore(TREE_STORE).clear()
    return Promise.resolve()
  })
}

async function putItems(runId: string, items: ColorAuditItem[]): Promise<void> {
  await withTransaction([ITEM_STORE], 'readwrite', transaction => {
    const store = transaction.objectStore(ITEM_STORE)
    for (const item of items) store.put({ ...item, key: `${runId}:${item.itemCode}`, runId } satisfies StoredItem)
    return Promise.resolve()
  })
}

async function putTrees(runId: string, trees: ColorAuditTree[]): Promise<void> {
  if (trees.length === 0) return
  const keys = trees.map(tree => `${runId}:${tree.treeCode}`)
  const existingRecords = await withTransaction([TREE_STORE], 'readonly', transaction => {
    const store = transaction.objectStore(TREE_STORE)
    return Promise.all(keys.map(key => requestResult(store.get(key))))
  }) as Array<StoredTree | undefined>
  const existingByKey = new Map(existingRecords.flatMap(record => record ? [[record.key, record] as const] : []))
  const records = trees.map(tree => {
    const key = `${runId}:${tree.treeCode}`
    const existing = existingByKey.get(key)
    const merged = existing ? mergeColorAuditTrees([stripStorageFields(existing)], [tree])[0] ?? tree : tree
    return { ...merged, key, runId } satisfies StoredTree
  })
  await withTransaction([TREE_STORE], 'readwrite', transaction => {
    const store = transaction.objectStore(TREE_STORE)
    for (const record of records) store.put(record)
    return Promise.resolve()
  })
}

function stripStorageFields<T extends { key: string; runId: string }>(record: T): Omit<T, 'key' | 'runId'> {
  const copy = { ...record }
  delete (copy as { key?: string }).key
  delete (copy as { runId?: string }).runId
  return copy as Omit<T, 'key' | 'runId'>
}

async function loadSnapshot(runId: string): Promise<AuditSnapshot> {
  const [items, trees] = await withTransaction([ITEM_STORE, TREE_STORE], 'readonly', async transaction => Promise.all([
    requestResult(transaction.objectStore(ITEM_STORE).getAll()),
    requestResult(transaction.objectStore(TREE_STORE).getAll()),
  ]))
  return {
    items: (items as StoredItem[]).filter(item => item.runId === runId).map(stripStorageFields),
    trees: (trees as StoredTree[]).filter(tree => tree.runId === runId).map(stripStorageFields),
  }
}

async function clearFamilySnapshot(runId: string, family: string): Promise<void> {
  const snapshot = await loadSnapshot(runId)
  const itemCodes = new Set(snapshot.items.filter(item => item.familyCode === family).map(item => item.itemCode))
  await withTransaction([ITEM_STORE, TREE_STORE], 'readwrite', transaction => {
    const itemStore = transaction.objectStore(ITEM_STORE)
    const treeStore = transaction.objectStore(TREE_STORE)
    for (const itemCode of itemCodes) {
      itemStore.delete(`${runId}:${itemCode}`)
      treeStore.delete(`${runId}:${itemCode}`)
    }
    return Promise.resolve()
  })
}

function mergeByKey<T>(current: T[], incoming: T[], keyFor: (value: T) => string): T[] {
  const byKey = new Map(current.map(value => [keyFor(value), value]))
  for (const value of incoming) byKey.set(keyFor(value), value)
  return [...byKey.values()]
}

function appendUniqueFamilies(current: string[], incoming: string[]): string[] {
  const known = new Set(current)
  const result = [...current]
  for (const family of incoming) {
    if (known.has(family)) continue
    known.add(family)
    result.push(family)
  }
  return result
}

function missingDeclaredTreeCodes(snapshot: AuditSnapshot, family: string): string[] {
  const treeCodes = new Set(snapshot.trees.map(tree => tree.treeCode))
  return snapshot.items
    .filter(item => item.familyCode === family && item.salesItem === true && declaresProductOrSalesTree(item.itemTreeType) && !treeCodes.has(item.itemCode))
    .map(item => item.itemCode)
    .toSorted((left, right) => left.localeCompare(right))
}

function latestFamilyLineCursor(snapshot: AuditSnapshot, family: string): TreeLineCursor | null {
  const treeCodes = new Set(snapshot.items.filter(item => item.familyCode === family).map(item => item.itemCode))
  let latest: TreeLineCursor | null = null
  for (const tree of snapshot.trees) {
    if (!treeCodes.has(tree.treeCode)) continue
    for (const line of tree.lines ?? []) {
      const candidate = { treeCode: tree.treeCode, childNum: line.childNum }
      if (!latest || candidate.treeCode > latest.treeCode || (candidate.treeCode === latest.treeCode && candidate.childNum > latest.childNum)) {
        latest = candidate
      }
    }
  }
  return latest
}

function latestFamilyItemCode(snapshot: AuditSnapshot, family: string): string | null {
  return snapshot.items
    .filter(item => item.familyCode === family)
    .map(item => item.itemCode)
    .reduce<string | null>((latest, itemCode) => !latest || itemCode > latest ? itemCode : latest, null)
}

function newRun(scope: AuditScope, familyFilter: string): StoredRun {
  const runId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`
  return {
    key: 'current',
    runId,
    phase: familyFilter ? 'items' : 'families',
    resumePhase: familyFilter ? 'items' : 'families',
    status: 'running',
    scope,
    familyFilter,
    families: familyFilter ? [familyFilter] : [],
    familyScopes: familyFilter ? { [familyFilter]: scope } : {},
    familyIndex: 0,
    catalogSkip: 0,
    catalogCursor: null,
    catalogExhausted: Boolean(familyFilter),
    familyStartedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    itemSkip: 0,
    headerSkip: 0,
    headerReconciliationCodes: [],
    headerReconciliationOffset: 0,
    headerReconciliationCompleted: false,
    lineSkip: 0,
    lineCursor: null,
    itemCount: 0,
    itemsRead: 0,
    treesRead: 0,
    familyTreesRead: 0,
    lineRowsRead: 0,
    linePagesRead: 0,
    completedFamilyCount: 0,
    averageFamilyDurationMs: null,
    error: null,
    updatedAt: new Date().toISOString(),
  }
}

function initialMassUpdateState(): MassUpdateState {
  return { phase: 'idle', auditKind: null, candidates: [], results: [], processed: 0, total: 0, confirmed: false, mode: null, message: null }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function treeCategoryLabel(value: string): string {
  return value === 'productive' ? 'Producto' : value === 'kit' ? 'Kit' : value
}

function statusLabel(value: ColorAuditItem['status']): string {
  return {
    active: 'Activo',
    inactive: 'Inactivo',
    frozen: 'Congelado',
    inactive_frozen: 'Inactivo y congelado',
    unknown: 'Desconocido',
  }[value]
}

function colorDifferenceLabel(row: ColorAuditRow): string {
  return {
    u_color_empty: 'U_Color vacío',
    u_color_invalid: 'U_Color inválido',
    u_color_different: 'U_Color diferente',
    sku_color_invalid: 'Color de SKU inválido',
    match: 'Compatible',
  }[row.differenceCategory]
}

function auditLabel(tab: AuditTab): string {
  return {
    color: 'Color',
    output_warehouse: 'Bodegas de salida',
    bom_warehouse: 'Almacenes destino LdM',
    issue_method: 'Método de emisión',
  }[tab]
}

function auditExplanation(tab: AuditTab): string {
  return {
    color: 'Compara el color codificado en el SKU con U_Color del mismo artículo. Reporta vacíos, valores inválidos y diferencias.',
    output_warehouse: 'Compara el almacén del encabezado de cada LdM entre Productos y Kits por separado. Reporta los valores distintos de una mayoría simple.',
    bom_warehouse: 'Compara el almacén destino de cada componente en líneas directas nivel 2, separando Productos y Kits. También detecta almacenes distintos dentro de una misma LdM.',
    issue_method: 'Compara el método de emisión de cada componente en líneas directas nivel 2, separando Productos y Kits. Reporta valores distintos de una mayoría simple.',
  }[tab]
}

function durationLabel(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} h ${minutes} min ${seconds}s`
  return minutes > 0 ? `${minutes} min ${seconds}s` : `${seconds}s`
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/gu, '""')}"`
}

function updateItemsForGroup(
  group: SapAuditGroup,
  expectedValue: string | null = group.expectedValue,
  options: { useAllEvidence?: boolean; decisionSource?: AuditUpdateItem['decisionSource'] } = {},
): AuditUpdateItem[] {
  if (!expectedValue) return []
  const evidence = options.useAllEvidence ? group.allEvidence : group.evidence
  return evidence.filter(item => item.currentValue !== expectedValue).map(item => ({
    itemCode: item.itemCode,
    treeCode: item.treeCode,
    childNum: group.auditKind === 'output_warehouse' ? null : item.childNum,
    currentValue: item.currentValue,
    expectedValue,
    decisionSource: options.decisionSource ?? (group.status === 'no_consensus' ? 'no_consensus' : 'majority'),
  }))
}

function auditResultValueLabel(tab: AuditTab, value: string | null): string {
  return tab === 'color' ? value || 'VACÍO' : sapAuditValueLabel(tab, value)
}

function auditUpdateItemKey(item: AuditUpdateItem, auditKind: AuditTab): string {
  return `${auditKind}:${item.treeCode ?? item.itemCode}:${item.childNum ?? '-'}:${item.itemCode}`
}

function selectedGroupCandidates(groups: SapAuditGroup[], selectedGroupIds: ReadonlySet<string>, selectedTargets: Readonly<Record<string, string>>): {
  candidates: AuditUpdateItem[]
  conflictingKeys: string[]
} {
  const candidatesByKey = new Map<string, AuditUpdateItem>()
  const conflictingKeys = new Set<string>()
  for (const group of groups) {
    if (!selectedGroupIds.has(group.id)) continue
    const selectedTarget = selectedTargets[group.id]
    const expectedValue = selectedTarget ?? group.expectedValue
    const decisionSource = group.status === 'no_consensus'
      ? 'no_consensus'
      : selectedTarget && selectedTarget !== group.expectedValue
        ? 'minority'
        : 'majority'
    const useAllEvidence = decisionSource === 'minority' || group.status === 'no_consensus'
    for (const candidate of updateItemsForGroup(group, expectedValue, { useAllEvidence, decisionSource })) {
      const key = auditUpdateItemKey(candidate, group.auditKind)
      const existing = candidatesByKey.get(key)
      if (existing && existing.expectedValue !== candidate.expectedValue) {
        conflictingKeys.add(key)
        continue
      }
      candidatesByKey.set(key, candidate)
    }
  }
  for (const key of conflictingKeys) candidatesByKey.delete(key)
  return { candidates: [...candidatesByKey.values()], conflictingKeys: [...conflictingKeys] }
}

function selectionTargetIsValid(group: SapAuditGroup, value: string | null | undefined): boolean {
  if (!value) return false
  return group.auditKind !== 'issue_method' || value === 'im_Manual' || value === 'im_Backflush'
}

function updateItemsForColor(rows: ColorAuditRow[]): AuditUpdateItem[] {
  return rows
    .filter(row => row.differenceCategory === 'u_color_different' && /^[A-Z0-9]{4}$/u.test(row.declaredColor) && Boolean(row.correctionTarget))
    .map(row => ({ itemCode: row.itemCode, treeCode: null, childNum: null, currentValue: row.declaredColor, expectedValue: row.correctionTarget ?? '', decisionSource: 'majority' as const }))
}

function reportForTab(tab: AuditTab, snapshot: AuditSnapshot, pendingTreeItemCodes: ReadonlySet<string>): SapAuditReport | null {
  return tab === 'color' ? null : buildSapAuditReport(tab, snapshot.items, snapshot.trees, { pendingTreeItemCodes })
}

function scopeCoversTab(scope: AuditScope, tab: AuditTab): boolean {
  if (tab === 'color') return true
  if (tab === 'output_warehouse') return scope === 'output_warehouse' || scope === 'components'
  return scope === 'components'
}

function snapshotForAuditTab(run: StoredRun | null, snapshot: AuditSnapshot, tab: AuditTab): AuditSnapshot {
  if (!run || tab === 'color') return snapshot
  const eligibleFamilies = new Set(run.families.filter(family => scopeCoversTab(run.familyScopes[family] ?? run.scope, tab)))
  const items = snapshot.items.filter(item => eligibleFamilies.has(item.familyCode))
  const itemCodes = new Set(items.map(item => item.itemCode))
  return { items, trees: snapshot.trees.filter(tree => itemCodes.has(tree.treeCode)) }
}

function ColorDiscrepancyTable({ rows, onCorrect }: { rows: ColorAuditRow[]; onCorrect: (items: AuditUpdateItem[]) => void }) {
  const candidates = updateItemsForColor(rows)
  return (
    <section className="border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div><h2 className="font-semibold text-slate-900">Discrepancias de color ({rows.length})</h2><p className="mt-1 text-sm text-slate-600">Solo se muestran valores que no coinciden con el color codificado en el SKU.</p></div>
        <button type="button" onClick={() => onCorrect(candidates)} disabled={candidates.length === 0} className="inline-flex h-9 items-center gap-2 bg-violet-700 px-3 text-sm font-semibold text-white disabled:opacity-40"><Zap className="h-4 w-4" />Corregir elegibles ({candidates.length})</button>
      </div>
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Nombre SAP</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Color SKU</th><th className="px-4 py-3">U_Color</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Resultado</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.itemCode}><td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{row.itemCode}</td><td className="px-4 py-3">{row.itemName || '-'}</td><td className="px-4 py-3">{treeCategoryLabel(row.treeCategory)}</td><td className="px-4 py-3 font-mono">{row.expectedColor ?? 'INVÁLIDO'}</td><td className="px-4 py-3 font-mono">{row.declaredColor || 'VACÍO'}</td><td className="px-4 py-3">{statusLabel(row.status)}</td><td className="px-4 py-3 font-semibold text-rose-700">{colorDifferenceLabel(row)}</td></tr>)}</tbody></table></div>
      {rows.length === 0 ? <p className="p-6 text-sm text-slate-500">No hay discrepancias de color en el snapshot actual.</p> : null}
    </section>
  )
}

function ConfigurationGroups({ report, expandedGroupId, selectedGroupIds, selectedTargets, selectionLocked, onToggle, onSelectionChange, onTargetChange }: {
  report: SapAuditReport
  expandedGroupId: string | null
  selectedGroupIds: ReadonlySet<string>
  selectedTargets: Readonly<Record<string, string>>
  selectionLocked: boolean
  onToggle: (groupId: string) => void
  onSelectionChange: (group: SapAuditGroup, selected: boolean) => void
  onTargetChange: (groupId: string, value: string) => void
}) {
  return (
    <section className="border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h2 className="font-semibold text-slate-900">Grupos con discrepancias detectadas ({report.groups.length})</h2><p className="mt-1 text-sm text-slate-600">La mayoría simple se calcula separando Productos y Kits y se propone por defecto. Puedes elegir una minoría o resolver un empate: el dry-run relee todas las filas afectadas antes de escribir.</p></div></div>
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Grupo</th><th className="px-4 py-3">Valor actual</th><th className="px-4 py-3">Valor común / opciones</th><th className="px-4 py-3">Coincidencias</th><th className="px-4 py-3">Afectados</th><th className="px-4 py-3">Selección</th></tr></thead><tbody className="divide-y divide-slate-100">{report.groups.map(group => <GroupRow key={group.id} group={group} expanded={expandedGroupId === group.id} selected={selectedGroupIds.has(group.id)} selectedTarget={selectedTargets[group.id]} selectionLocked={selectionLocked} onToggle={onToggle} onSelectionChange={onSelectionChange} onTargetChange={onTargetChange} />)}</tbody></table></div>
      {report.groups.length === 0 ? <p className="p-6 text-sm text-slate-500">No hay configuraciones atípicas ni grupos sin consenso en este snapshot.</p> : null}
    </section>
  )
}

function ConfigurationBulkSelection({ selectedGroupCount, candidateCount, conflictCount, selectionLocked, onSelectAll, onClear, onDryRun }: {
  selectedGroupCount: number
  candidateCount: number
  conflictCount: number
  selectionLocked: boolean
  onSelectAll: () => void
  onClear: () => void
  onDryRun: () => void
}) {
  const canDryRun = !selectionLocked && candidateCount > 0 && conflictCount === 0
  return <section className="border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Corrección conjunta seleccionada</h2><p className="mt-1">{selectedGroupCount} grupo(s) seleccionado(s) · {candidateCount} fila(s) única(s) para validar.</p>{conflictCount > 0 ? <p className="mt-1 font-medium text-rose-700">Hay {conflictCount} fila(s) con dos valores destino distintos. Ajusta la selección antes del dry-run.</p> : <p className="mt-1 text-xs text-violet-800">Se procesará un lote a la vez, de máximo 20 filas. No hay escrituras durante el dry-run.</p>}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={selectionLocked} onClick={onSelectAll} className="h-8 border border-violet-300 bg-white px-2 text-xs font-semibold disabled:opacity-40">Seleccionar normalizables</button><button type="button" disabled={selectionLocked || selectedGroupCount === 0} onClick={onClear} className="h-8 border border-violet-300 bg-white px-2 text-xs font-semibold disabled:opacity-40">Limpiar</button><button type="button" disabled={!canDryRun} onClick={onDryRun} className="inline-flex h-8 items-center gap-1 bg-violet-700 px-2 text-xs font-semibold text-white disabled:opacity-40"><Zap className="h-3 w-3" />Dry-run selección</button></div></div></section>
}

function ExcludedConfigurationItems({ items }: { items: SapAuditReport['excludedItems'] }) {
  if (items.length === 0) return null
  return (
    <section className="border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">SKU no normalizables ({items.length})</h2>
        <p className="mt-1 text-sm text-slate-600">Son SKU de venta sin LdM o con un tipo de árbol distinto de Producto/Kit. Se informan, pero no entran en la mayoría ni en la corrección masiva.</p>
      </div>
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Nombre SAP</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">TreeType</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map(item => <tr key={item.itemCode}><td className="px-4 py-3 font-mono text-xs font-semibold">{item.itemCode}</td><td className="px-4 py-3">{item.itemName || '-'}</td><td className="px-4 py-3">{item.treeCategory === 'no_bom' ? 'Sin LdM' : item.treeCategory === 'unresolved_tree' ? 'LdM pendiente de verificación' : 'Tipo de LdM no compatible'}</td><td className="px-4 py-3 font-mono text-xs">{item.itemTreeType || '-'}</td><td className="px-4 py-3">{statusLabel(item.productStatus)}</td></tr>)}</tbody></table></div>
    </section>
  )
}

function GroupRow({ group, expanded, selected, selectedTarget, selectionLocked, onToggle, onSelectionChange, onTargetChange }: {
  group: SapAuditGroup
  expanded: boolean
  selected: boolean
  selectedTarget: string | undefined
  selectionLocked: boolean
  onToggle: (groupId: string) => void
  onSelectionChange: (group: SapAuditGroup, selected: boolean) => void
  onTargetChange: (groupId: string, value: string) => void
}) {
  const groupValue = (value: string | null) => sapAuditValueLabel(group.auditKind, value)
  const selectedValue = selectedTarget ?? group.expectedValue
  const canSelect = group.canNormalize || selectionTargetIsValid(group, selectedValue)
  const optionLabels = group.valueOptions.map(option => `${groupValue(option.value)} (${option.count}/${group.totalObservations})`).join(' · ')
  const isMinorityOverride = Boolean(selectedTarget && group.expectedValue && selectedTarget !== group.expectedValue)
  const affectedCount = isMinorityOverride || group.status === 'no_consensus'
    ? group.allEvidence.filter(evidence => evidence.currentValue !== selectedValue).length
    : group.evidence.length
  return <>
    <tr className={expanded ? 'bg-emerald-50/50' : ''}>
      <td className="px-4 py-3">
        <button type="button" onClick={() => onToggle(group.id)} className="inline-flex items-center gap-2 text-left font-semibold text-slate-900">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span>{group.subjectCode === 'SALIDA' ? 'Bodega de salida' : group.subjectCode}</span>
          <span className="text-xs font-normal text-slate-500">· {treeCategoryLabel(group.treeCategory)}</span>
        </button>
        <p className="mt-1 pl-6 text-xs text-slate-500">{group.subjectName}</p>
      </td>
      <td className="px-4 py-3 font-mono text-xs">{groupValue(group.currentValue)}</td>
      <td className="px-4 py-3 font-mono text-xs">
        {group.expectedValue ? groupValue(group.expectedValue) : <><span className="font-sans text-amber-700">Sin consenso</span><p className="mt-1 font-sans text-xs text-slate-600">{optionLabels}</p></>}
      </td>
      <td className="px-4 py-3">{Math.round(group.support * 100)}% ({group.expectedCount}/{group.totalObservations})</td>
      <td className="px-4 py-3">{group.evidence.length}</td>
      <td className="px-4 py-3">
        <select value={selectedTarget ?? ''} disabled={selectionLocked} onChange={event => onTargetChange(group.id, event.target.value)} className="mb-2 h-8 max-w-52 border border-slate-300 bg-white px-2 text-xs">
          {group.expectedValue ? <option value="">Usar mayoría: {groupValue(group.expectedValue)}</option> : <option value="">Elegir valor…</option>}
          {group.valueOptions.map(option => <option key={option.value || 'EMPTY'} value={option.value}>{groupValue(option.value)} ({option.count})</option>)}
        </select>
        {isMinorityOverride ? <p className="mb-2 max-w-52 text-xs text-amber-800">Excepción a la mayoría: se revisarán las {affectedCount} filas del sujeto antes del dry-run.</p> : null}
        <label className="flex items-center gap-2 text-xs font-semibold text-violet-800">
          <input type="checkbox" checked={selected} disabled={selectionLocked || !canSelect} onChange={event => onSelectionChange(group, event.target.checked)} />
          <span>{canSelect ? `Incluir (${affectedCount})` : 'Elige un valor para incluir'}</span>
        </label>
      </td>
    </tr>
    {expanded ? <tr><td colSpan={6} className="bg-slate-50 px-4 py-4"><p className="mb-2 text-sm font-semibold text-slate-900">Evidencia de la discrepancia ({group.evidence.length} de {group.allEvidence.length})</p><EvidenceTable auditKind={group.auditKind} evidence={isMinorityOverride || group.status === 'no_consensus' ? group.allEvidence : group.evidence} /></td></tr> : null}
  </>
}

function EvidenceTable({ auditKind, evidence }: { auditKind: SapConfigurationAuditKind; evidence: SapAuditEvidence[] }) {
  return <div className="overflow-x-auto border border-slate-200 bg-white"><table className="min-w-full text-left text-xs"><thead className="bg-slate-100 uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2">LdM</th><th className="px-3 py-2">Componente</th><th className="px-3 py-2">Línea</th><th className="px-3 py-2">Actual</th><th className="px-3 py-2">Común</th><th className="px-3 py-2">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{evidence.map(item => <tr key={`${item.treeCode}:${item.childNum ?? 'root'}:${item.itemCode}`}><td className="px-3 py-2">{treeCategoryLabel(item.treeCategory)}</td><td className="px-3 py-2 font-mono">{item.treeCode}</td><td className="px-3 py-2">{item.productName || '-'}</td><td className="px-3 py-2 font-mono">{item.treeCode}</td><td className="px-3 py-2 font-mono">{auditKind === 'output_warehouse' ? '-' : item.itemCode}</td><td className="px-3 py-2">{item.childNum ?? '-'}</td><td className="px-3 py-2 font-mono">{sapAuditValueLabel(auditKind, item.currentValue)}</td><td className="px-3 py-2 font-mono">{sapAuditValueLabel(auditKind, item.expectedValue)}</td><td className="px-3 py-2">{statusLabel(item.productStatus)}</td></tr>)}</tbody></table></div>
}

function MassUpdatePanel({ state, onConfirmedChange, onApply }: { state: MassUpdateState; onConfirmedChange: (confirmed: boolean) => void; onApply: () => void }) {
  if (state.phase === 'idle') return null
  const verificationLabel = state.mode === 'dry-run'
    ? 'Dry-run: prelectura SAP; no se escribió.'
    : 'Aplicación: valor releído y verificado en SAP.'
  return <section className="border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Corrección masiva controlada</h2><p className="mt-1">{state.total} fila(s) de {state.auditKind ? auditLabel(state.auditKind) : 'la auditoría'}; cada una se relee antes y después de la escritura.</p><p className="mt-1 text-xs text-violet-800">Los lotes son secuenciales, máximo 20 filas; un cambio desactualizado se omite y no se sobrescribe.</p></div><ShieldCheck className="h-6 w-6 text-violet-700" /></div>
    {state.total > 0 ? <><progress className="mt-3 h-2 w-full accent-violet-700" value={state.processed} max={state.total} /><p className="mt-2 text-xs">{state.processed}/{state.total} procesadas · {state.phase === 'dry-run' ? 'Ejecutando dry-run' : state.phase === 'applying' ? 'Aplicando y verificando' : 'Proceso detenido o terminado'}</p></> : null}
    {state.message ? <p className="mt-3 font-medium">{state.message}</p> : null}
    {state.phase === 'awaiting-confirmation' ? <label className="mt-4 flex cursor-pointer items-start gap-2 border border-violet-300 bg-white p-3"><input type="checkbox" checked={state.confirmed} onChange={event => onConfirmedChange(event.target.checked)} className="mt-1 h-4 w-4" /><span>Confirmo que deseo aplicar los {state.candidates.length} cambios verificados por el dry-run en SAP.</span></label> : null}
    {state.phase === 'awaiting-confirmation' ? <button type="button" onClick={onApply} disabled={!state.confirmed} className="mt-3 inline-flex h-9 items-center gap-2 bg-violet-700 px-3 text-sm font-semibold text-white disabled:opacity-40"><ShieldCheck className="h-4 w-4" />Aplicar y verificar en SAP</button> : null}
    {state.results.length > 0 ? <div className="mt-3 max-h-64 overflow-y-auto border border-violet-200 bg-white p-2 text-xs">
      <p className="mb-2 px-1 text-slate-600">{verificationLabel}</p>
      {state.results.map(result => <div key={`${result.auditKind}:${result.treeCode ?? result.itemCode}:${result.childNum ?? '-'}:${result.itemCode}:${result.message}`} className="border-b border-slate-100 py-2 last:border-0">
        <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="font-mono font-semibold">LdM: {result.treeCode ?? '-'}</span><span>línea: {result.childNum ?? '-'}</span><span className="font-mono">componente: {result.itemCode}</span><span>{result.success ? 'OK' : result.stale ? 'OMITIDO' : 'ERROR'}</span></div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1"><span>{auditResultValueLabel(result.auditKind, result.beforeValue)} → {auditResultValueLabel(result.auditKind, result.afterValue || result.expectedValue)}</span><span>{result.decisionSource === 'minority' ? 'Decisión: minoría elegida' : result.decisionSource === 'no_consensus' ? 'Decisión: sin consenso' : 'Decisión: mayoría'}</span><span>{result.message}</span></div>
      </div>)}
    </div> : null}
  </section>
}

type ColorAuditClientProps = {
  apiBase?: string
}

export function ColorAuditClient({ apiBase = '/api/product-design/color-audit' }: ColorAuditClientProps) {
  const auditApiBase = apiBase.replace(/\/+$/u, '')
  const [run, setRun] = useState<StoredRun | null>(null)
  const [snapshot, setSnapshot] = useState<AuditSnapshot>({ items: [], trees: [] })
  const [activeTab, setActiveTab] = useState<AuditTab>('color')
  const [scanScope, setScanScope] = useState<AuditScope>('components')
  const [familyFilter, setFamilyFilter] = useState('')
  const [clock, setClock] = useState(() => Date.now())
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [selectedGroupTargets, setSelectedGroupTargets] = useState<Record<string, string>>({})
  const [newRunConfirmationOpen, setNewRunConfirmationOpen] = useState(false)
  const [newRunConfirmed, setNewRunConfirmed] = useState(false)
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false)
  const [cancelConfirmed, setCancelConfirmed] = useState(false)
  const [massUpdate, setMassUpdate] = useState<MassUpdateState>(initialMassUpdateState)
  const runRef = useRef<StoredRun | null>(null)
  const snapshotRef = useRef<AuditSnapshot>({ items: [], trees: [] })
  const pauseRequested = useRef(false)
  const cancelRequested = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const executionIdRef = useRef(0)

  const persistRun = async (patch: Partial<StoredRun>): Promise<StoredRun> => {
    const current = runRef.current
    if (!current) throw new Error('No hay una auditoría activa.')
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
    runRef.current = next
    setRun(next)
    await saveRun(next)
    return next
  }

  const replaceSnapshot = (next: AuditSnapshot, runId?: string): void => {
    snapshotRef.current = next
    setSnapshot(next)
    const targetRunId = runId ?? runRef.current?.runId
    if (!targetRunId) return
    void Promise.all([putItems(targetRunId, next.items), putTrees(targetRunId, next.trees)]).catch(() => undefined)
  }

  useEffect(() => {
    void loadRun().then(async saved => {
      const restored = saved ? {
        ...saved,
        scope: saved.scope ?? 'components',
        familyFilter: saved.familyFilter ?? '',
        families: saved.families ?? (saved.familyFilter ? [saved.familyFilter] : []),
        familyScopes: saved.familyScopes ?? Object.fromEntries((saved.families ?? (saved.familyFilter ? [saved.familyFilter] : [])).map(family => [family, saved.scope ?? 'components'])),
        familyIndex: saved.familyIndex ?? 0,
        catalogSkip: saved.catalogSkip ?? 0,
        catalogCursor: saved.catalogCursor ?? null,
        catalogExhausted: saved.catalogExhausted ?? Boolean(saved.familyFilter),
        headerReconciliationCodes: saved.headerReconciliationCodes ?? [],
        headerReconciliationOffset: saved.headerReconciliationOffset ?? 0,
        headerReconciliationCompleted: saved.headerReconciliationCompleted ?? false,
        familyTreesRead: saved.familyTreesRead ?? 0,
        lineCursor: saved.lineCursor ?? null,
        familyStartedAt: saved.familyStartedAt ?? saved.startedAt ?? saved.updatedAt,
        startedAt: saved.startedAt ?? saved.updatedAt,
      } : null
      runRef.current = restored
      setRun(restored)
      if (!restored) return
      const loaded = await loadSnapshot(restored.runId)
      snapshotRef.current = loaded
      setSnapshot(loaded)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (run?.status !== 'running') return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [run?.status])

  const colorRows = useMemo(() => {
    const treesByCode = new Map(snapshot.trees.map(tree => [tree.treeCode, tree]))
    return snapshot.items.map(item => classifyColorAuditItem(item, treesByCode.get(item.itemCode) ?? null))
  }, [snapshot])
  const colorIssues = useMemo(() => colorRows.filter(row => row.differenceCategory !== 'match'), [colorRows])
  const colorSummary = useMemo(() => summarizeColorAuditRows(colorRows), [colorRows])
  const currentFamily = run?.families[run.familyIndex] ?? null
  const completedFamilies = run
    ? run.families.slice(0, Math.min(run.completedFamilyCount, run.families.length))
    : []
  const currentFamilyHeaderCount = useMemo(() => {
    if (!currentFamily) return 0
    const currentFamilyItemCodes = new Set(snapshot.items
      .filter(item => item.familyCode === currentFamily && item.salesItem === true)
      .map(item => item.itemCode))
    return snapshot.trees.filter(tree => currentFamilyItemCodes.has(tree.treeCode)).length
  }, [currentFamily, snapshot.items, snapshot.trees])
  const pendingTreeItemCodes = useMemo(() => {
    const headersArePending = run?.status !== 'complete'
      && (run?.phase === 'headers' || run?.phase === 'header_reconciliation' || run?.resumePhase === 'headers' || run?.resumePhase === 'header_reconciliation')
    if (!headersArePending || !currentFamily) return new Set<string>()
    const currentFamilyCodes = snapshot.items
      .filter(item => item.familyCode === currentFamily && item.salesItem === true)
      .toSorted((left, right) => left.itemCode.localeCompare(right.itemCode))
      .map(item => item.itemCode)
    return new Set(currentFamilyCodes)
  }, [currentFamily, run?.phase, run?.resumePhase, run?.status, snapshot.items])
  const auditSnapshot = useMemo(() => snapshotForAuditTab(run, snapshot, activeTab), [activeTab, run, snapshot])
  const report = useMemo(() => reportForTab(activeTab, auditSnapshot, pendingTreeItemCodes), [activeTab, auditSnapshot, pendingTreeItemCodes])
  const selectedGroupIdSet = useMemo(() => new Set(selectedGroupIds), [selectedGroupIds])
  const bulkSelection = useMemo(() => report
    ? selectedGroupCandidates(report.groups, selectedGroupIdSet, selectedGroupTargets)
    : { candidates: [], conflictingKeys: [] }, [report, selectedGroupIdSet, selectedGroupTargets])
  const selectionLocked = massUpdate.phase === 'dry-run' || massUpdate.phase === 'awaiting-confirmation' || massUpdate.phase === 'applying'
  const progress = useMemo<number | null>(() => {
    if (!run) return 0
    if (run.status === 'complete') return 100
    if (!run.catalogExhausted) return null
    if (run.families.length === 0) return null
    return Math.min(99, Math.round((run.familyIndex / run.families.length) * 100))
  }, [run])

  async function execute(initial: StoredRun): Promise<void> {
    const executionId = ++executionIdRef.current
    const isCurrentExecution = () => executionIdRef.current === executionId
    pauseRequested.current = false
    cancelRequested.current = false
    let working = initial
    const continueWithNextFamily = async (patch: Partial<StoredRun>): Promise<StoredRun | null> => {
      const familyStartedAt = Date.parse(working.familyStartedAt)
      const durationMs = Number.isFinite(familyStartedAt) ? Math.max(0, Date.now() - familyStartedAt) : 0
      const completedFamilyCount = working.completedFamilyCount + 1
      const averageFamilyDurationMs = working.averageFamilyDurationMs === null
        ? durationMs
        : Math.round(((working.averageFamilyDurationMs * working.completedFamilyCount) + durationMs) / completedFamilyCount)
      const completedFamilyCursor = latestFamilyItemCode(snapshotRef.current, working.families[working.familyIndex])
      const completedPatch = {
        ...patch,
        completedFamilyCount,
        averageFamilyDurationMs,
        catalogCursor: completedFamilyCursor ?? working.catalogCursor,
      }
      const nextFamilyIndex = working.familyIndex + 1
      if (nextFamilyIndex < working.families.length) {
        const nextFamily = working.families[nextFamilyIndex]
        return persistRun({
          ...completedPatch,
          scope: working.familyScopes[nextFamily] ?? working.scope,
          phase: 'items',
          resumePhase: 'items',
          familyIndex: nextFamilyIndex,
          itemSkip: 0,
          headerSkip: 0,
          headerReconciliationCodes: [],
          headerReconciliationOffset: 0,
          headerReconciliationCompleted: false,
          familyTreesRead: 0,
          lineSkip: 0,
          lineCursor: null,
          itemCount: 0,
          familyStartedAt: new Date().toISOString(),
        })
      }
      if (working.catalogExhausted) {
        await persistRun({ ...completedPatch, phase: 'complete', status: 'complete' })
        return null
      }
      return persistRun({
        ...completedPatch,
        phase: 'families',
        resumePhase: 'families',
        familyIndex: nextFamilyIndex,
        itemSkip: 0,
        headerSkip: 0,
        headerReconciliationCodes: [],
        headerReconciliationOffset: 0,
        headerReconciliationCompleted: false,
        familyTreesRead: 0,
        lineSkip: 0,
        lineCursor: null,
        itemCount: 0,
      })
    }

    try {
      while (working.status === 'running') {
        if (!isCurrentExecution()) return
        if (working.phase === 'families') {
          controllerRef.current = new AbortController()
          const legacyCatalogCursor = working.catalogCursor ?? (working.catalogSkip > 0
            ? latestFamilyItemCode(snapshotRef.current, working.families[Math.max(0, working.familyIndex - 1)] ?? '')
            : null)
          const response = await fetch(`${auditApiBase}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skip: working.catalogSkip, afterItemCode: legacyCatalogCursor, prefix: 'V', catalogOnly: true }), signal: controllerRef.current.signal })
          const payload = await response.json() as ItemsResponse
          if (!response.ok || !payload.success) throw new Error(payload.error || 'No se pudo leer el catálogo de familias desde SAP.')
          const families = appendUniqueFamilies(working.families, payload.families ?? [])
          const familyScopes = { ...working.familyScopes }
          for (const family of payload.families ?? []) familyScopes[family] ??= working.scope
          const nextCatalogSkip = payload.nextSkip ?? working.catalogSkip + (payload.rawItemsRead ?? 0)
          const nextCatalogCursor = payload.nextCatalogCursor ?? legacyCatalogCursor
          const catalogExhausted = payload.done === true
          if (!catalogExhausted && (!nextCatalogCursor || nextCatalogCursor === legacyCatalogCursor)) throw new Error('SAP no avanzó al buscar la siguiente familia. Pausa la corrida y vuelve a intentarlo para no repetir páginas.')
          if (pauseRequested.current) {
            await persistRun({ phase: 'paused', resumePhase: 'families', status: 'paused', families, familyScopes, catalogSkip: nextCatalogSkip, catalogCursor: nextCatalogCursor, catalogExhausted })
            return
          }
          if (families.length > working.familyIndex) {
            const nextFamily = families[working.familyIndex]
            working = await persistRun({
              families,
              familyScopes,
              scope: familyScopes[nextFamily] ?? working.scope,
              catalogSkip: nextCatalogSkip,
              catalogCursor: nextCatalogCursor,
              catalogExhausted,
              phase: 'items',
              resumePhase: 'items',
              itemSkip: 0,
              headerSkip: 0,
              headerReconciliationCodes: [],
              headerReconciliationOffset: 0,
              headerReconciliationCompleted: false,
              familyTreesRead: 0,
              lineSkip: 0,
              lineCursor: null,
              itemCount: 0,
              familyStartedAt: new Date().toISOString(),
            })
            continue
          }
          if (catalogExhausted) {
            await persistRun({ families, familyScopes, catalogSkip: nextCatalogSkip, catalogCursor: nextCatalogCursor, catalogExhausted, phase: 'complete', status: 'complete' })
            return
          }
          working = await persistRun({ families, familyScopes, catalogSkip: nextCatalogSkip, catalogCursor: nextCatalogCursor, catalogExhausted })
          continue
        }

        const family = working.families[working.familyIndex]
        if (!family) {
          await persistRun({ phase: 'complete', status: 'complete' })
          return
        }

        if (working.phase === 'tree_lines' && !working.headerReconciliationCompleted && (working.headerReconciliationCodes ?? []).length === 0) {
          const reconciliationCodes = missingDeclaredTreeCodes(snapshotRef.current, family)
          if (reconciliationCodes.length > 0) {
            working = await persistRun({
              phase: 'header_reconciliation',
                resumePhase: 'header_reconciliation',
                headerReconciliationCodes: reconciliationCodes,
                headerReconciliationOffset: 0,
                headerReconciliationCompleted: false,
              })
            continue
          }
        }

        if (working.phase === 'items') {
          controllerRef.current = new AbortController()
          const response = await fetch(`${auditApiBase}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skip: working.itemSkip, prefix: family }), signal: controllerRef.current.signal })
          const payload = await response.json() as ItemsResponse
          if (!response.ok || !payload.success) throw new Error(payload.error || `No se pudieron leer los Items de ${family}.`)
          const incoming = payload.items ?? []
          await putItems(working.runId, incoming)
          const nextSnapshot = { ...snapshotRef.current, items: mergeByKey(snapshotRef.current.items, incoming, item => item.itemCode) }
          snapshotRef.current = nextSnapshot
          setSnapshot(nextSnapshot)
          const nextSkip = payload.nextSkip ?? working.itemSkip + (payload.rawItemsRead ?? 0)
          const itemsRead = working.itemsRead + (payload.rawItemsRead ?? 0)
          if (!payload.done && nextSkip <= working.itemSkip) throw new Error(`SAP no avanzó al leer los Items de ${family}. Pausa la corrida y vuelve a intentarlo para no repetir páginas.`)
          if (pauseRequested.current) {
            await persistRun({ phase: 'paused', resumePhase: 'items', status: 'paused', itemSkip: nextSkip, itemsRead })
            return
          }
          if (!payload.done) {
            working = await persistRun({ itemSkip: nextSkip, itemsRead })
            continue
          }
          if (working.scope === 'color') {
            const next = await continueWithNextFamily({ itemSkip: nextSkip, itemsRead })
            if (!next) return
            working = next
            continue
          }
          const componentItems = nextSnapshot.items.filter(item => item.familyCode === family && item.salesItem === true)
          if (componentItems.length === 0) {
            const next = await continueWithNextFamily({ itemSkip: nextSkip, itemsRead })
            if (!next) return
            working = next
            continue
          }
          working = await persistRun({
            phase: 'headers',
            resumePhase: 'headers',
            itemSkip: nextSkip,
            itemCount: componentItems.length,
            headerSkip: 0,
            headerReconciliationCodes: [],
            headerReconciliationOffset: 0,
            headerReconciliationCompleted: false,
            familyTreesRead: 0,
            lineSkip: 0,
            lineCursor: null,
            itemsRead,
          })
          continue
        }

        if (working.phase === 'header_reconciliation') {
          const codes = working.headerReconciliationCodes ?? []
          const offset = working.headerReconciliationOffset ?? 0
          const batch = codes.slice(offset, offset + SAP_PAGE_BATCH_SIZE)
          if (batch.length === 0) {
            if (working.scope === 'components') {
              working = await persistRun({
                phase: 'tree_lines',
                resumePhase: 'tree_lines',
                headerReconciliationCodes: [],
                headerReconciliationOffset: 0,
                headerReconciliationCompleted: true,
                lineSkip: 0,
                lineCursor: null,
              })
              continue
            }
            const next = await continueWithNextFamily({ headerReconciliationCodes: [], headerReconciliationOffset: 0 })
            if (!next) return
            working = next
            continue
          }
          controllerRef.current = new AbortController()
          const response = await fetch(`${auditApiBase}/trees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'headers_by_codes', skip: offset, itemCodes: batch }),
            signal: controllerRef.current.signal,
          })
          const payload = await response.json() as TreesResponse
          if (!response.ok || !payload.success) throw new Error(payload.error || `No se pudieron verificar los encabezados de ${family}.`)
          const incoming = payload.trees ?? []
          await putTrees(working.runId, incoming)
          const nextSnapshot = { ...snapshotRef.current, trees: mergeColorAuditTrees(snapshotRef.current.trees, incoming) }
          snapshotRef.current = nextSnapshot
          setSnapshot(nextSnapshot)
          const nextOffset = offset + batch.length
          if (pauseRequested.current) {
            await persistRun({ phase: 'paused', resumePhase: 'header_reconciliation', status: 'paused', headerReconciliationOffset: nextOffset, treesRead: working.treesRead + incoming.length, familyTreesRead: (working.familyTreesRead ?? 0) + incoming.length })
            return
          }
          working = await persistRun({ headerReconciliationOffset: nextOffset, treesRead: working.treesRead + incoming.length, familyTreesRead: (working.familyTreesRead ?? 0) + incoming.length })
          continue
        }

        if (working.phase === 'headers' || working.phase === 'tree_lines') {
          const itemCodes = new Set(snapshotRef.current.items
            .filter(item => item.familyCode === family && item.salesItem === true)
            .toSorted((left, right) => left.itemCode.localeCompare(right.itemCode))
            .map(item => item.itemCode))
          if (itemCodes.size === 0) {
            const next = await continueWithNextFamily({ headerSkip: 0, lineSkip: 0 })
            if (!next) return
            working = next
            continue
          }
          controllerRef.current = new AbortController()
          const mode = working.phase === 'headers' ? 'headers' : 'lines'
          const skip = mode === 'headers' ? working.headerSkip : working.lineSkip
          let lineCursor = mode === 'lines' ? working.lineCursor : null
          if (mode === 'lines' && !lineCursor && working.lineSkip > 0) {
            lineCursor = latestFamilyLineCursor(snapshotRef.current, family)
            if (!lineCursor) throw new Error(`No se pudo recuperar el cursor de líneas de ${family}; pausa y reinicia solo esta familia para evitar saltar datos.`)
            working = await persistRun({ lineCursor })
          }
          const response = await fetch(`${auditApiBase}/trees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ family, mode, skip, cursor: lineCursor }),
            signal: controllerRef.current.signal,
          })
          const payload = await response.json() as TreesResponse
          if (!response.ok || !payload.success) throw new Error(payload.error || `No se pudieron leer las LdM de ${family}.`)
          if (typeof payload.rowsRead !== 'number' || !Number.isInteger(payload.rowsRead) || payload.rowsRead < 0) {
            throw new Error(`SAP no devolvió un avance válido al leer ${family}.`)
          }
          const incoming = (payload.trees ?? []).filter(tree => itemCodes.has(tree.treeCode))
          await putTrees(working.runId, incoming)
          const nextSnapshot = { ...snapshotRef.current, trees: mergeColorAuditTrees(snapshotRef.current.trees, incoming) }
          snapshotRef.current = nextSnapshot
          setSnapshot(nextSnapshot)
          const nextSkip = payload.nextSkip ?? skip + payload.rowsRead
          const nextCursor = mode === 'lines' ? payload.nextCursor ?? null : null
          if (mode === 'lines' && !payload.done && !nextCursor) throw new Error(`SAP no devolvió un cursor válido al leer las líneas de ${family}.`)
          if (mode === 'lines' && !payload.done && lineCursor && nextCursor && (nextCursor.treeCode < lineCursor.treeCode || (nextCursor.treeCode === lineCursor.treeCode && nextCursor.childNum <= lineCursor.childNum))) {
            throw new Error(`SAP no avanzó el cursor de líneas de ${family}.`)
          }
          if (!payload.done && nextSkip <= skip) throw new Error(`SAP no avanzó al leer las LdM de ${family}. Pausa la corrida y vuelve a intentarlo para no repetir páginas.`)
          if (pauseRequested.current) {
            await persistRun(mode === 'headers'
              ? { phase: 'paused', resumePhase: 'headers', status: 'paused', headerSkip: nextSkip, treesRead: working.treesRead + incoming.length, familyTreesRead: (working.familyTreesRead ?? 0) + incoming.length }
              : { phase: 'paused', resumePhase: 'tree_lines', status: 'paused', lineSkip: nextSkip, lineCursor: nextCursor, lineRowsRead: working.lineRowsRead + payload.rowsRead, linePagesRead: working.linePagesRead + 1 })
            return
          }
          if (!payload.done) {
            working = mode === 'headers'
              ? await persistRun({ headerSkip: nextSkip, treesRead: working.treesRead + incoming.length, familyTreesRead: (working.familyTreesRead ?? 0) + incoming.length })
              : await persistRun({ lineSkip: nextSkip, lineCursor: nextCursor, lineRowsRead: working.lineRowsRead + payload.rowsRead, linePagesRead: working.linePagesRead + 1 })
            continue
          }
          if (mode === 'headers') {
            const reconciliationCodes = missingDeclaredTreeCodes(nextSnapshot, family)
            if (reconciliationCodes.length > 0) {
              working = await persistRun({
                headerSkip: nextSkip,
                treesRead: working.treesRead + incoming.length,
                familyTreesRead: (working.familyTreesRead ?? 0) + incoming.length,
                phase: 'header_reconciliation',
                resumePhase: 'header_reconciliation',
                headerReconciliationCodes: reconciliationCodes,
                headerReconciliationOffset: 0,
                headerReconciliationCompleted: false,
              })
              continue
            }
          }
          if (mode === 'headers' && working.scope === 'components') {
            working = await persistRun({ headerSkip: nextSkip, treesRead: working.treesRead + incoming.length, familyTreesRead: (working.familyTreesRead ?? 0) + incoming.length, phase: 'tree_lines', resumePhase: 'tree_lines', lineSkip: 0, lineCursor: null })
            continue
          }
          const next = await continueWithNextFamily(mode === 'headers'
            ? { headerSkip: nextSkip, treesRead: working.treesRead + incoming.length, familyTreesRead: (working.familyTreesRead ?? 0) + incoming.length }
            : { lineSkip: nextSkip, lineCursor: nextCursor, lineRowsRead: working.lineRowsRead + payload.rowsRead, linePagesRead: working.linePagesRead + 1 })
          if (!next) return
          working = next
          continue
        }

        return
      }
    } catch (error) {
      if (!isCurrentExecution() || pauseRequested.current || cancelRequested.current) return
      await persistRun({ phase: 'error', status: 'error', error: error instanceof Error ? error.message : 'No se pudo completar la auditoría SAP.' })
    } finally {
      if (isCurrentExecution()) controllerRef.current = null
    }
  }

  async function start(): Promise<void> {
    const normalizedFamily = familyFilter.trim().toUpperCase()
    if (normalizedFamily && !/^V[A-Z0-9]*$/u.test(normalizedFamily)) return
    await clearAuditData()
    const next = newRun(scanScope, normalizedFamily)
    runRef.current = next
    snapshotRef.current = { items: [], trees: [] }
    setSnapshot(snapshotRef.current)
    setRun(next)
    setActiveTab(scanScope === 'components' ? 'color' : scanScope)
    setExpandedGroupId(null)
    setSelectedGroupIds([])
    setSelectedGroupTargets({})
    setMassUpdate(initialMassUpdateState())
    await saveRun(next)
    await execute(next)
  }

  async function addFamilyToSnapshot(): Promise<void> {
    const current = runRef.current
    const normalizedFamily = familyFilter.trim().toUpperCase()
    if (!current || current.status === 'running' || !/^V[A-Z0-9]*$/u.test(normalizedFamily) || current.families.includes(normalizedFamily)) return
    if (current.status !== 'complete') {
      await persistRun({
        familyFilter: normalizedFamily,
        families: [...current.families, normalizedFamily],
        familyScopes: { ...current.familyScopes, [normalizedFamily]: scanScope },
      })
      return
    }
    const next = await persistRun({
      scope: scanScope,
      familyFilter: normalizedFamily,
      families: [...current.families, normalizedFamily],
      familyScopes: { ...current.familyScopes, [normalizedFamily]: scanScope },
      familyIndex: current.families.length,
      phase: 'items',
      resumePhase: 'items',
      status: 'running',
      itemSkip: 0,
      headerSkip: 0,
      headerReconciliationCodes: [],
      headerReconciliationOffset: 0,
      headerReconciliationCompleted: false,
      familyTreesRead: 0,
      lineSkip: 0,
      lineCursor: null,
      itemCount: 0,
      familyStartedAt: new Date().toISOString(),
      error: null,
    })
    pauseRequested.current = false
    cancelRequested.current = false
    setActiveTab(scanScope === 'components' ? 'color' : scanScope)
    setExpandedGroupId(null)
    setSelectedGroupIds([])
    setSelectedGroupTargets({})
    setMassUpdate(initialMassUpdateState())
    await execute(next)
  }

  async function reanalyzeCurrentFamily(): Promise<void> {
    const current = runRef.current
    const family = current?.families[current.familyIndex]
    if (!current || !family || current.status === 'running') return
    await clearFamilySnapshot(current.runId, family)
    const nextSnapshot = {
      items: snapshotRef.current.items.filter(item => item.familyCode !== family),
      trees: snapshotRef.current.trees.filter(tree => tree.treeCode !== family && !tree.treeCode.startsWith(`${family}-`)),
    }
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    const next = await persistRun({
      scope: current.familyScopes[family] ?? current.scope,
      phase: 'items',
      resumePhase: 'items',
      status: 'running',
      itemSkip: 0,
      headerSkip: 0,
      headerReconciliationCodes: [],
      headerReconciliationOffset: 0,
      headerReconciliationCompleted: false,
      familyTreesRead: 0,
      lineSkip: 0,
      lineCursor: null,
      itemCount: 0,
      familyStartedAt: new Date().toISOString(),
      error: null,
      completedFamilyCount: Math.min(current.completedFamilyCount, current.familyIndex),
    })
    pauseRequested.current = false
    cancelRequested.current = false
    setMassUpdate(initialMassUpdateState())
    await execute(next)
  }

  function requestNewRun(): void {
    if (!run) {
      void start()
      return
    }
    if (run.status !== 'running' && run.status !== 'cancelled' && /^V[A-Z0-9]*$/u.test(familyFilter.trim().toUpperCase()) && !run.families.includes(familyFilter.trim().toUpperCase())) {
      void addFamilyToSnapshot()
      return
    }
    setCancelConfirmationOpen(false)
    setCancelConfirmed(false)
    setNewRunConfirmed(false)
    setNewRunConfirmationOpen(true)
  }

  async function confirmNewRun(): Promise<void> {
    if (!newRunConfirmed) return
    setNewRunConfirmationOpen(false)
    await start()
  }

  async function pause(): Promise<void> {
    pauseRequested.current = true
    controllerRef.current?.abort()
    const current = runRef.current
    if (!current || current.status !== 'running') return
    const resumePhase = current.phase === 'families' || current.phase === 'headers' || current.phase === 'header_reconciliation' || current.phase === 'tree_lines'
      ? current.phase
      : 'items'
    await persistRun({ phase: 'paused', resumePhase, status: 'paused' })
  }

  function requestCancel(): void {
    setNewRunConfirmationOpen(false)
    setNewRunConfirmed(false)
    setCancelConfirmed(false)
    setCancelConfirmationOpen(true)
  }

  async function confirmCancel(): Promise<void> {
    if (!cancelConfirmed) return
    cancelRequested.current = true
    controllerRef.current?.abort()
    const current = runRef.current
    if (!current || current.status !== 'running') return
    setCancelConfirmationOpen(false)
    await persistRun({ phase: 'cancelled', status: 'cancelled' })
  }

  async function resume(): Promise<void> {
    const current = runRef.current
    if (!current || (current.status !== 'paused' && current.status !== 'error')) return
    const pausedAt = Date.parse(current.updatedAt)
    const startedAt = Number.isFinite(pausedAt)
      ? new Date(Date.parse(current.startedAt) + Math.max(0, Date.now() - pausedAt)).toISOString()
      : current.startedAt
    const familyStartedAt = Number.isFinite(pausedAt)
      ? new Date(Date.parse(current.familyStartedAt) + Math.max(0, Date.now() - pausedAt)).toISOString()
      : current.familyStartedAt
    const next = await persistRun({ phase: current.resumePhase, status: 'running', error: null, startedAt, familyStartedAt })
    setNewRunConfirmationOpen(false)
    setCancelConfirmationOpen(false)
    await execute(next)
  }

  async function postUpdate(auditKind: AuditTab, mode: UpdateMode, items: AuditUpdateItem[], confirmed: boolean): Promise<AuditUpdateResult[]> {
    const response = await fetch(`${auditApiBase}/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auditKind, mode, items, confirmed }) })
    const payload = await response.json() as AuditUpdateResponse
    if (!response.ok || !payload.results) throw new Error(payload.error || 'No se pudo procesar el lote SAP.')
    return payload.results
  }

  async function startMassUpdate(auditKind: AuditTab, candidates: AuditUpdateItem[]): Promise<void> {
    if (candidates.length === 0) return
    setMassUpdate({ phase: 'dry-run', auditKind, candidates, results: [], processed: 0, total: candidates.length, confirmed: false, mode: 'dry-run', message: null })
    try {
      const results: AuditUpdateResult[] = []
      for (const batch of chunks(candidates, SAP_PAGE_BATCH_SIZE)) {
        results.push(...await postUpdate(auditKind, 'dry-run', batch, false))
        setMassUpdate(current => ({ ...current, results: [...results], processed: results.length }))
      }
      const eligibleKeys = new Set(results.filter(result => result.eligible).map(result => `${result.treeCode ?? result.itemCode}:${result.childNum ?? '-'}:${result.itemCode}`))
      const eligible = candidates.filter(item => eligibleKeys.has(`${item.treeCode ?? item.itemCode}:${item.childNum ?? '-'}:${item.itemCode}`))
      setMassUpdate(current => ({ ...current, phase: eligible.length > 0 ? 'awaiting-confirmation' : 'complete', candidates: eligible, results, processed: results.length, message: eligible.length > 0 ? 'Dry-run verificado. Revisa los elegibles y confirma antes de escribir.' : 'No quedaron filas elegibles después del dry-run.' }))
    } catch (error) {
      setMassUpdate(current => ({ ...current, phase: 'error', message: error instanceof Error ? error.message : 'No se pudo ejecutar el dry-run.' }))
    }
  }

  function applyVerifiedResults(results: AuditUpdateResult[]): void {
    const next = {
      items: snapshotRef.current.items.map(item => {
        const result = results.find(candidate => candidate.success && candidate.changed && candidate.itemCode === item.itemCode && candidate.auditKind === 'color')
        if (!result) return item
        return { ...item, declaredColor: result.afterValue ?? item.declaredColor }
      }),
      trees: snapshotRef.current.trees.map(tree => {
        const headerResult = results.find(candidate => candidate.success && candidate.changed && candidate.auditKind === 'output_warehouse' && candidate.treeCode === tree.treeCode)
        return {
          ...tree,
          headerWarehouse: headerResult?.afterValue ?? tree.headerWarehouse,
          lines: tree.lines?.map(line => {
            const result = results.find(candidate => candidate.success && candidate.changed && candidate.treeCode === tree.treeCode && candidate.childNum === line.childNum && candidate.itemCode === line.itemCode)
            if (!result) return line
            return result.auditKind === 'bom_warehouse'
              ? { ...line, warehouse: result.afterValue ?? line.warehouse }
              : result.auditKind === 'issue_method'
                ? { ...line, issueMethod: result.afterValue ?? line.issueMethod }
                : line
          }),
        }
      }),
    }
    replaceSnapshot(next)
  }

  async function applyMassUpdate(): Promise<void> {
    if (massUpdate.phase !== 'awaiting-confirmation' || !massUpdate.auditKind || !massUpdate.confirmed) return
    setMassUpdate(current => ({ ...current, phase: 'applying', processed: 0, results: [], mode: 'apply' }))
    try {
      const results: AuditUpdateResult[] = []
      for (const batch of chunks(massUpdate.candidates, SAP_PAGE_BATCH_SIZE)) {
        results.push(...await postUpdate(massUpdate.auditKind, 'apply', batch, true))
        setMassUpdate(current => ({ ...current, results: [...results], processed: results.length }))
      }
      applyVerifiedResults(results)
      const failed = results.filter(result => !result.success).length
      setSelectedGroupIds([])
      setSelectedGroupTargets({})
      setMassUpdate(current => ({ ...current, phase: 'complete', results, processed: results.length, message: failed === 0 ? 'Cambios verificados en SAP. El informe se actualizó con la lectura posterior.' : `${failed} fila(s) no fueron verificadas; revisa el detalle antes de repetir la operación.` }))
    } catch (error) {
      setMassUpdate(current => ({ ...current, phase: 'error', message: error instanceof Error ? error.message : 'No se pudo aplicar el lote SAP.' }))
    }
  }

  function exportReport(): void {
    const content = activeTab === 'color'
      ? [['SKU', 'Nombre SAP', 'Tipo', 'Color SKU', 'U_Color', 'Estado', 'Resultado'].map(csvEscape).join(','), ...colorIssues.map(row => [row.itemCode, row.itemName, treeCategoryLabel(row.treeCategory), row.expectedColor ?? '', row.declaredColor, statusLabel(row.status), colorDifferenceLabel(row)].map(csvEscape).join(','))].join('\n')
      : [
        ['Grupo', 'Tipo', 'Actual', 'Común', 'Coincidencias', 'SKU', 'Producto SAP', 'LdM', 'Componente', 'Línea', 'Estado'].map(csvEscape).join(','),
        ...(report?.groups ?? []).flatMap(group => group.evidence.map(evidence => [group.subjectCode, treeCategoryLabel(group.treeCategory), sapAuditValueLabel(group.auditKind, evidence.currentValue), sapAuditValueLabel(group.auditKind, evidence.expectedValue), `${group.expectedCount}/${group.totalObservations}`, evidence.treeCode, evidence.productName, evidence.treeCode, evidence.itemCode, evidence.childNum ?? '', statusLabel(evidence.productStatus)].map(csvEscape).join(','))),
        ...(report?.excludedItems ?? []).map(item => ['No normalizable', item.treeCategory === 'no_bom' ? 'Sin LdM' : item.treeCategory === 'unresolved_tree' ? 'LdM pendiente de verificación' : 'Otro TreeType', '', '', '', item.itemCode, item.itemName, '', '', '', statusLabel(item.productStatus)].map(csvEscape).join(',')),
      ].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `auditoria-sap-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const summary = activeTab === 'color'
    ? { reviewed: colorSummary.rowsAudited, discrepancies: colorIssues.length, common: colorSummary.compatible, contextLabel: 'Kits', contextValue: colorSummary.kits, eligible: updateItemsForColor(colorIssues).length }
    : { reviewed: report?.reviewed ?? 0, discrepancies: report?.discrepancyCount ?? 0, common: Math.max(0, (report?.reviewed ?? 0) - (report?.discrepancyCount ?? 0) - (report?.noConsensusCount ?? 0)), contextLabel: 'Sin consenso', contextValue: report?.noConsensusCount ?? 0, eligible: report?.eligibleCount ?? 0 }
  const canStart = !run || run.status !== 'running'
  const canPause = run?.status === 'running'
  const normalizedFamilyFilter = familyFilter.trim().toUpperCase()
  const canAddFamily = Boolean(
    run
    && run.status !== 'running'
    && run.status !== 'cancelled'
    && /^V[A-Z0-9]*$/u.test(normalizedFamilyFilter)
    && !run.families.includes(normalizedFamilyFilter),
  )
  const activeTabAvailable = !run || run.families.some(family => scopeCoversTab(run.familyScopes[family] ?? run.scope, activeTab))
  const elapsedMs = run ? Math.max(0, clock - Date.parse(run.startedAt)) : 0
  const familyElapsedMs = run ? Math.max(0, clock - Date.parse(run.familyStartedAt)) : 0
  const estimatedRemainingMs = run?.status === 'running'
    && run.catalogExhausted
    && currentFamily
    && run.averageFamilyDurationMs !== null
    ? Math.max(0, Math.round(
      Math.max(0, run.averageFamilyDurationMs - familyElapsedMs)
      + (Math.max(0, run.families.length - run.familyIndex - 1) * run.averageFamilyDurationMs),
    ))
    : null
  const progressText = progress === null ? 'avance global pendiente hasta conocer todas las familias' : `${progress}% por familias completadas`
  const runActivity = run?.status === 'running'
    ? run.phase === 'families'
      ? 'Buscando la siguiente familia…'
      : run.phase === 'items'
        ? `Analizando ${currentFamily ?? 'familia'}: Items`
        : run.phase === 'headers'
          ? `Analizando ${currentFamily ?? 'familia'}: encabezados de LdM`
          : run.phase === 'header_reconciliation'
            ? `Verificando encabezados LdM faltantes de ${currentFamily ?? 'familia'}`
            : `Analizando ${currentFamily ?? 'familia'}: líneas directas de LdM`
    : run?.status === 'paused'
      ? 'Auditoría pausada'
      : run?.status === 'cancelled'
        ? 'Auditoría cancelada; se conserva el avance parcial'
        : run?.status === 'complete'
          ? 'Snapshot completo'
          : run?.status === 'error'
            ? 'Auditoría detenida por error'
            : 'Aún no hay un snapshot temporal'
  const scanReadout = !run
    ? 'Aún no hay datos en el snapshot temporal'
    : run.phase === 'families'
      ? `${run.familyIndex} familia(s) completada(s); buscando solo la siguiente`
      : run.phase === 'items'
        ? `${run.itemsRead} registros de Items leídos; preparando ${currentFamily ?? 'familia'}`
        : run.phase === 'headers'
          ? `${currentFamilyHeaderCount}/${run.itemCount} SKU de venta con encabezado LdM encontrado; ${run.headerSkip} registros SAP de encabezado leídos en ${currentFamily ?? 'familia'}`
          : run.phase === 'header_reconciliation'
            ? `${run.headerReconciliationOffset}/${run.headerReconciliationCodes.length} encabezados faltantes verificados exactamente en ${currentFamily ?? 'familia'}`
          : run.phase === 'tree_lines'
            ? `${run.lineSkip} líneas directas de ${currentFamily ?? 'familia'} leídas; ${run.lineRowsRead} líneas y ${run.linePagesRead} páginas acumuladas`
            : `${run.treesRead} encabezados y ${run.lineRowsRead} líneas directas guardados en el snapshot`

  return <div className="mx-auto flex max-w-7xl flex-col gap-5">
    <header><h1 className="text-2xl font-bold text-slate-900">Auditorías SAP</h1><p className="mt-2 max-w-4xl text-sm text-slate-600">Detecta únicamente configuraciones SAP atípicas y permite su normalización masiva controlada. Una sola corrida reutiliza el mismo snapshot temporal para las cuatro auditorías.</p></header>

    <section className="border border-slate-200 bg-white shadow-sm"><nav aria-label="Auditorías SAP" className="flex overflow-x-auto border-b border-slate-200 px-1">{(['color', 'output_warehouse', 'bom_warehouse', 'issue_method'] as AuditTab[]).map(tab => <button key={tab} type="button" onClick={() => { setActiveTab(tab); setExpandedGroupId(null); setSelectedGroupIds([]); setSelectedGroupTargets({}); setMassUpdate(initialMassUpdateState()) }} className={`shrink-0 border-b-2 px-5 py-3 text-sm font-semibold ${activeTab === tab ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{auditLabel(tab)}</button>)}</nav><p className="px-4 py-3 text-sm text-slate-600">{auditExplanation(activeTab)}</p></section>

    <section className="border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]"><label className="text-sm font-medium text-slate-700">Actividad<select value={scanScope} onChange={event => setScanScope(event.target.value as AuditScope)} disabled={run?.status === 'running'} className="mt-1 h-9 w-full border border-slate-300 bg-white px-2"><option value="color">Solo color</option><option value="output_warehouse">Encabezado LdM: bodegas de salida (también color)</option><option value="components">Componentes LdM: destino y emisión (también color y salida)</option></select></label><label className="text-sm font-medium text-slate-700">Familia SAP{run ? ' para sumar' : ' (opcional)'}<input value={familyFilter} onChange={event => setFamilyFilter(event.target.value.toUpperCase())} disabled={run?.status === 'running'} placeholder={run ? 'Ej. VBAN05' : 'Ej. VBAN05; vacío = todas'} className="mt-1 h-9 w-full border border-slate-300 px-2 font-mono" /></label></div>
      {run?.status === 'complete' ? <p className="mt-2 text-xs text-emerald-800">El snapshot se conserva. Escribe una familia nueva y usa <strong>Sumar familia al análisis</strong>; no se reemplaza la evidencia actual.</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">{!run && canStart ? <button type="button" onClick={requestNewRun} className="inline-flex h-9 items-center gap-2 bg-emerald-700 px-3 text-sm font-semibold text-white"><Play className="h-4 w-4" />Iniciar análisis sectorizado</button> : null}{canAddFamily ? <button type="button" onClick={requestNewRun} className="inline-flex h-9 items-center gap-2 bg-emerald-700 px-3 text-sm font-semibold text-white"><Play className="h-4 w-4" />Sumar familia al análisis</button> : null}{run?.status === 'complete' && !canAddFamily ? <button type="button" onClick={requestNewRun} className="inline-flex h-9 items-center gap-2 border border-rose-300 px-3 text-sm font-semibold text-rose-800"><RefreshCw className="h-4 w-4" />Iniciar nueva corrida</button> : null}{canPause ? <button type="button" onClick={() => void pause()} className="inline-flex h-9 items-center gap-2 border border-amber-300 px-3 text-sm font-semibold text-amber-900"><Pause className="h-4 w-4" />Pausar</button> : null}{canPause ? <button type="button" onClick={requestCancel} className="inline-flex h-9 items-center gap-2 border border-rose-300 px-3 text-sm font-semibold text-rose-800"><XCircle className="h-4 w-4" />Cancelar</button> : null}{run?.status === 'paused' || run?.status === 'error' ? <button type="button" onClick={() => void resume()} className="inline-flex h-9 items-center gap-2 border border-sky-300 px-3 text-sm font-semibold text-sky-900"><RefreshCw className="h-4 w-4" />Reanudar</button> : null}{run?.status === 'error' && currentFamily ? <button type="button" onClick={() => void reanalyzeCurrentFamily()} className="inline-flex h-9 items-center gap-2 border border-amber-300 px-3 text-sm font-semibold text-amber-900"><RefreshCw className="h-4 w-4" />Reanalizar solo {currentFamily}</button> : null}{run?.status === 'complete' ? <button type="button" onClick={exportReport} className="inline-flex h-9 items-center gap-2 border border-slate-300 px-3 text-sm font-semibold text-slate-800"><Download className="h-4 w-4" />Exportar CSV</button> : null}<span className="text-sm text-slate-600">{runActivity}</span></div>
      {newRunConfirmationOpen ? <section className="mt-4 border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" /><div><h2 className="font-semibold">Iniciar una nueva corrida borra el snapshot actual</h2><p className="mt-1">Se eliminarán las líneas, evidencia y avance de la auditoría pausada. Para conservarla, usa <strong>Reanudar</strong>.</p></div></div><label className="mt-3 flex cursor-pointer items-start gap-2 border border-rose-200 bg-white p-3"><input type="checkbox" checked={newRunConfirmed} onChange={event => setNewRunConfirmed(event.target.checked)} className="mt-1 h-4 w-4" /><span>Confirmo que deseo descartar el snapshot actual e iniciar una nueva auditoría.</span></label><div className="mt-3 flex gap-2"><button type="button" disabled={!newRunConfirmed} onClick={() => void confirmNewRun()} className="h-9 bg-rose-700 px-3 text-sm font-semibold text-white disabled:opacity-40">Descartar e iniciar nueva corrida</button><button type="button" onClick={() => { setNewRunConfirmationOpen(false); setNewRunConfirmed(false) }} className="h-9 border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">Volver</button></div></section> : null}
      {cancelConfirmationOpen ? <section className="mt-4 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="font-semibold">Cancelar detiene la lectura, pero conserva la evidencia</h2><p className="mt-1">No se borra el snapshot ni se modifica SAP. Podrás revisar los resultados parciales o iniciar otra corrida cuando lo decidas.</p></div></div><label className="mt-3 flex cursor-pointer items-start gap-2 border border-amber-200 bg-white p-3"><input type="checkbox" checked={cancelConfirmed} onChange={event => setCancelConfirmed(event.target.checked)} className="mt-1 h-4 w-4" /><span>Confirmo que deseo detener esta auditoría y conservar su evidencia parcial.</span></label><div className="mt-3 flex gap-2"><button type="button" disabled={!cancelConfirmed} onClick={() => void confirmCancel()} className="h-9 bg-amber-700 px-3 text-sm font-semibold text-white disabled:opacity-40">Detener auditoría</button><button type="button" onClick={() => { setCancelConfirmationOpen(false); setCancelConfirmed(false) }} className="h-9 border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">Seguir analizando</button></div></section> : null}
      {run ? <>{progress === null ? <progress className="mt-3 h-2 w-full accent-emerald-700" /> : <progress className="mt-3 h-2 w-full accent-emerald-700" value={progress} max={100} />}<section className="mt-3 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><p><strong>Familia actual:</strong> {currentFamily ?? (run.phase === 'families' ? 'buscando la siguiente' : 'sin familia pendiente')}</p><p className="mt-1"><strong>Familias completadas ({completedFamilies.length}):</strong> {completedFamilies.length > 0 ? completedFamilies.join(' · ') : 'ninguna todavía'}</p><p className="mt-1 text-xs text-emerald-800">Al pausar puedes reanudar desde este punto; si cancelas, esta lista indica desde qué familia iniciar una nueva corrida.</p></section><p className="mt-2 text-xs text-slate-500">{scanReadout} · {progressText} · transcurrido {durationLabel(elapsedMs)}{estimatedRemainingMs !== null ? ` · estimado restante ${durationLabel(estimatedRemainingMs)}` : ''}</p>{run.status === 'running' ? <p className="mt-1 text-xs text-slate-500">Los informes visibles son parciales. La estimación usa la duración media de las familias ya terminadas; las páginas se guardan antes de avanzar a la siguiente.</p> : null}</> : null}{run?.error ? <p className="mt-3 flex items-center gap-2 text-sm font-medium text-rose-700"><XCircle className="h-4 w-4" />{run.error}</p> : null}
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SummaryCard label="Discrepancias detectadas" value={summary.discrepancies} icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} /><SummaryCard label="Configuración común" value={summary.common} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} /><SummaryCard label={summary.contextLabel} value={summary.contextValue} icon={<ClipboardCheck className="h-5 w-5 text-slate-500" />} /><SummaryCard label="Líneas revisadas" value={summary.reviewed} icon={<ClipboardCheck className="h-5 w-5 text-sky-600" />} /></section>

    {activeTab !== 'color' ? <section className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p><strong>Normalización segura:</strong> la mayoría es la propuesta inicial. Si eliges una minoría o resuelves un empate, se recalcula el conjunto completo del sujeto, se relee cada línea en el dry-run y solo después se permite confirmar la escritura. Los valores vacíos solo se proponen cuando existe una configuración válida.</p></section> : null}

    {!activeTabAvailable ? <section className="border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">Esta pestaña no se calculó en la corrida actual. Ejecuta <strong>Componentes LdM</strong> para alimentar las cuatro auditorías, o la actividad específica para un análisis limitado.</section> : activeTab === 'color' ? <><ColorDiscrepancyTable rows={colorIssues} onCorrect={items => void startMassUpdate('color', items)} /><MassUpdatePanel state={massUpdate} onConfirmedChange={confirmed => setMassUpdate(current => ({ ...current, confirmed }))} onApply={() => void applyMassUpdate()} /></> : report ? <><ConfigurationGroups report={report} expandedGroupId={expandedGroupId} selectedGroupIds={selectedGroupIdSet} selectedTargets={selectedGroupTargets} selectionLocked={selectionLocked} onToggle={groupId => setExpandedGroupId(current => current === groupId ? null : groupId)} onSelectionChange={(group, selected) => setSelectedGroupIds(current => selected ? [...new Set([...current, group.id])] : current.filter(id => id !== group.id))} onTargetChange={(groupId, value) => { setSelectedGroupTargets(current => ({ ...current, [groupId]: value })); if (!value) setSelectedGroupIds(current => current.filter(id => id !== groupId)) }} /><ConfigurationBulkSelection selectedGroupCount={selectedGroupIds.length} candidateCount={bulkSelection.candidates.length} conflictCount={bulkSelection.conflictingKeys.length} selectionLocked={selectionLocked} onSelectAll={() => setSelectedGroupIds(current => [...new Set([...current, ...report.groups.filter(group => group.canNormalize).map(group => group.id)])])} onClear={() => { setSelectedGroupIds([]); setSelectedGroupTargets({}) }} onDryRun={() => void startMassUpdate(report.auditKind, bulkSelection.candidates)} /><MassUpdatePanel state={massUpdate} onConfirmedChange={confirmed => setMassUpdate(current => ({ ...current, confirmed }))} onApply={() => void applyMassUpdate()} /><ExcludedConfigurationItems items={report.excludedItems} /></> : null}

    {run?.status === 'running' ? <p className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />El snapshot temporal se guarda localmente; puedes pausar y reanudar sin comenzar las cuatro auditorías de nuevo.</p> : null}
    {run && run.status !== 'running' ? <button type="button" onClick={() => void clearAuditData().then(() => { runRef.current = null; snapshotRef.current = { items: [], trees: [] }; setRun(null); setSnapshot(snapshotRef.current); setMassUpdate(initialMassUpdateState()) })} className="inline-flex items-center gap-2 self-end text-xs font-semibold text-slate-500 hover:text-rose-700"><Trash2 className="h-3 w-3" />Eliminar snapshot temporal</button> : null}
  </div>
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>{icon}</div><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>
}
