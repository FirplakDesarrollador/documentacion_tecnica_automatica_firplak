'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Download, LoaderCircle, Pause, Play, RefreshCw, ShieldCheck, Trash2, XCircle, Zap } from 'lucide-react'

import {
  classifyColorAuditItem,
  emptyColorAuditSummary,
  groupColorAuditCorrections,
  mergeColorAuditSummary,
  summarizeColorAuditRows,
  type ColorAuditCorrectionGroup,
  type ColorAuditDifferenceCategory,
  type ColorAuditItem,
  type ColorAuditRow,
  type ColorAuditSummary,
  type ColorAuditTree,
  type ColorAuditTreeCategory,
} from '@/lib/sap/colorAudit'

type RunPhase = 'items' | 'trees' | 'paused' | 'complete' | 'error'
type RunStatus = 'running' | 'paused' | 'complete' | 'error'

type StoredRun = {
  key: 'current'
  runId: string
  phase: RunPhase
  resumePhase: 'items' | 'trees'
  status: RunStatus
  itemSkip: number
  treeOffset: number
  itemCount: number
  summary: ColorAuditSummary
  error: string | null
  updatedAt: string
}

type StoredItem = ColorAuditItem & { key: string; runId: string }
type StoredRow = ColorAuditRow & { key: string; runId: string }

type ItemsResponse = {
  success: boolean
  items?: ColorAuditItem[]
  detailErrors?: string[]
  rawItemsRead?: number
  nextSkip?: number
  done?: boolean
  error?: string
}

type TreesResponse = {
  success: boolean
  trees?: ColorAuditTree[]
  treeHeadersRead?: number
  error?: string
}

type ColorAuditUpdateItem = {
  itemCode: string
  expectedColor: string
  currentColor: string
  differenceCategory: 'u_color_different'
}

type ColorAuditUpdateResult = {
  itemCode: string
  expectedColor: string
  beforeColor: string
  afterColor: string | null
  eligible: boolean
  changed: boolean
  skipped: boolean
  stale: boolean
  success: boolean
  message: string
}

type ColorAuditUpdateResponse = {
  success: boolean
  results?: ColorAuditUpdateResult[]
  confirmationRequired?: string
  error?: string
}

type MassUpdateState = {
  phase: 'idle' | 'dry-run' | 'awaiting-confirmation' | 'applying' | 'complete' | 'error'
  processed: number
  total: number
  eligibleItems: ColorAuditUpdateItem[]
  results: ColorAuditUpdateResult[]
  confirmationRequired: string
  confirmationText: string
  message: string | null
}

const DB_NAME = 'samigen-color-audit-v1'
const DB_VERSION = 1
const RUN_STORE = 'runs'
const ITEM_STORE = 'items'
const ROW_STORE = 'rows'
const ROW_PAGE_SIZE = 50
const MASS_UPDATE_BATCH_SIZE = 20

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function openAuditDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RUN_STORE)) db.createObjectStore(RUN_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(ITEM_STORE)) db.createObjectStore(ITEM_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(ROW_STORE)) db.createObjectStore(ROW_STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento temporal.'))
  })
}

async function withTransaction<T>(stores: string[], mode: IDBTransactionMode, callback: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openAuditDb()
  try {
    return await callback(db.transaction(stores, mode))
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
  await withTransaction([RUN_STORE, ITEM_STORE, ROW_STORE], 'readwrite', async transaction => {
    await Promise.all([
      requestResult(transaction.objectStore(RUN_STORE).clear()),
      requestResult(transaction.objectStore(ITEM_STORE).clear()),
      requestResult(transaction.objectStore(ROW_STORE).clear()),
    ])
  })
}

async function putItems(runId: string, items: ColorAuditItem[]): Promise<void> {
  await withTransaction([ITEM_STORE], 'readwrite', async transaction => {
    const store = transaction.objectStore(ITEM_STORE)
    for (const item of items) {
      const record: StoredItem = { ...item, key: `${runId}:${item.itemCode}`, runId }
      await requestResult(store.put(record))
    }
  })
}

async function putRows(runId: string, rows: ColorAuditRow[]): Promise<void> {
  await withTransaction([ROW_STORE], 'readwrite', async transaction => {
    const store = transaction.objectStore(ROW_STORE)
    for (const row of rows) {
      const record: StoredRow = { ...row, key: `${runId}:${row.itemCode}`, runId }
      await requestResult(store.put(record))
    }
  })
}

async function getItems(runId: string): Promise<ColorAuditItem[]> {
  const records = await withTransaction([ITEM_STORE], 'readonly', transaction => requestResult(transaction.objectStore(ITEM_STORE).getAll()))
  return (records as StoredItem[]).filter(record => record.runId === runId).map(stripStorageFields)
}

async function getRows(runId: string): Promise<ColorAuditRow[]> {
  const records = await withTransaction([ROW_STORE], 'readonly', transaction => requestResult(transaction.objectStore(ROW_STORE).getAll()))
  return (records as StoredRow[]).filter(record => record.runId === runId).map(stripStorageFields)
}

function stripStorageFields<T extends { key: string; runId: string }>(record: T): Omit<T, 'key' | 'runId'> {
  const copy = { ...record }
  delete (copy as { key?: string }).key
  delete (copy as { runId?: string }).runId
  return copy as Omit<T, 'key' | 'runId'>
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function updateSummaryFromRows(summary: ColorAuditSummary, rows: ColorAuditRow[]): ColorAuditSummary {
  const refreshed = summarizeColorAuditRows(rows)
  return {
    ...summary,
    skuCandidates: refreshed.skuCandidates,
    rowsAudited: refreshed.rowsAudited,
    compatible: refreshed.compatible,
    uColorEmpty: refreshed.uColorEmpty,
    uColorInvalid: refreshed.uColorInvalid,
    uColorDifferent: refreshed.uColorDifferent,
    skuColorInvalid: refreshed.skuColorInvalid,
    inactiveOrFrozen: refreshed.inactiveOrFrozen,
    kits: refreshed.kits,
    productive: refreshed.productive,
    otherTrees: refreshed.otherTrees,
    withoutBom: refreshed.withoutBom,
    errors: refreshed.errors,
  }
}

function isMassUpdateCandidate(row: ColorAuditRow): boolean {
  return row.differenceCategory === 'u_color_different'
    && Boolean(row.correctionTarget)
    && /^[A-Z0-9]{4}$/u.test(row.declaredColor)
    && row.declaredColor !== row.correctionTarget
}

function initialMassUpdateState(): MassUpdateState {
  return {
    phase: 'idle',
    processed: 0,
    total: 0,
    eligibleItems: [],
    results: [],
    confirmationRequired: '',
    confirmationText: '',
    message: null,
  }
}

function newRun(): StoredRun {
  const runId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`
  return {
    key: 'current',
    runId,
    phase: 'items',
    resumePhase: 'items',
    status: 'running',
    itemSkip: 0,
    treeOffset: 0,
    itemCount: 0,
    summary: emptyColorAuditSummary(),
    error: null,
    updatedAt: new Date().toISOString(),
  }
}

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function differenceLabel(value: ColorAuditDifferenceCategory): string {
  return {
    match: 'Compatible',
    u_color_empty: 'U_Color vacío',
    u_color_invalid: 'U_Color inválido',
    u_color_different: 'U_Color diferente',
    sku_color_invalid: 'Color del SKU inválido',
  }[value]
}

function treeLabel(value: ColorAuditTreeCategory): string {
  return {
    productive: 'Productivo',
    kit: 'Kit',
    other_tree: 'Otro tipo de LdM',
    no_bom: 'Sin LdM',
  }[value]
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

function matchesFilter(row: ColorAuditRow, search: string, version: string, tree: string, difference: string): boolean {
  const normalizedSearch = search.trim().toUpperCase()
  if (normalizedSearch && ![row.itemCode, row.itemName, row.declaredColor, row.expectedColor ?? ''].some(value => value.toUpperCase().includes(normalizedSearch))) return false
  if (version && row.versionCode !== version) return false
  if (tree && row.treeCategory !== tree) return false
  if (difference === 'discrepancy' && row.differenceCategory === 'match') return false
  if (difference === 'match' && row.differenceCategory !== 'match') return false
  return true
}

export function ColorAuditClient() {
  const [run, setRun] = useState<StoredRun | null>(null)
  const runRef = useRef<StoredRun | null>(null)
  const pauseRequested = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const [visibleRows, setVisibleRows] = useState<ColorAuditRow[]>([])
  const [totalFiltered, setTotalFiltered] = useState(0)
  const [availableVersions, setAvailableVersions] = useState<string[]>([])
  const [groups, setGroups] = useState<ColorAuditCorrectionGroup[]>([])
  const [evidence, setEvidence] = useState<ColorAuditRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [version, setVersion] = useState('')
  const [tree, setTree] = useState('')
  const [difference, setDifference] = useState('')
  const [page, setPage] = useState(0)
  const [massUpdate, setMassUpdate] = useState<MassUpdateState>(initialMassUpdateState)

  const updateRun = async (patch: Partial<StoredRun>): Promise<StoredRun> => {
    const current = runRef.current
    if (!current) throw new Error('No hay una ejecución activa.')
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
    runRef.current = next
    setRun(next)
    await saveRun(next)
    return next
  }

  useEffect(() => {
    void loadRun().then(saved => {
      runRef.current = saved
      setRun(saved)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!run || typeof indexedDB === 'undefined') return
    void getRows(run.runId).then(rows => {
      const filtered = rows.filter(row => matchesFilter(row, search, version, tree, difference))
      setTotalFiltered(filtered.length)
      setVisibleRows(filtered.slice(page * ROW_PAGE_SIZE, (page + 1) * ROW_PAGE_SIZE))
      setAvailableVersions([...new Set(rows.map(row => row.versionCode))].sort())
      setGroups(groupColorAuditCorrections(rows))
    }).catch(() => undefined)
  }, [run?.runId, run?.updatedAt, search, version, tree, difference, page, run])

  const progress = useMemo(() => {
    if (!run) return 0
    if (run.status === 'complete') return 100
    if (run.phase === 'items') return 5
    if (run.itemCount === 0) return 50
    return Math.min(99, 50 + Math.round((run.treeOffset / run.itemCount) * 50))
  }, [run])

  async function execute(current: StoredRun): Promise<void> {
    pauseRequested.current = false
    let working = current
    try {
      while (working.phase === 'items') {
        controllerRef.current = new AbortController()
        const response = await fetch('/api/product-design/color-audit/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skip: working.itemSkip }),
          signal: controllerRef.current.signal,
        })
        const payload = await response.json() as ItemsResponse
        if (!response.ok || !payload.success) throw new Error(payload.error ?? 'No se pudo leer un lote de Items SAP.')
        const items = payload.items ?? []
        await putItems(working.runId, items)
        const summary = { ...working.summary }
        summary.itemsRead += payload.rawItemsRead ?? 0
        summary.skuCandidates += items.length
        summary.errors += payload.detailErrors?.length ?? 0
        working = await updateRun({
          summary,
          itemSkip: payload.nextSkip ?? working.itemSkip,
          itemCount: working.itemCount + items.length,
        })
        if (pauseRequested.current) return updateRun({ status: 'paused', phase: 'paused', resumePhase: 'items' }).then(() => undefined)
        if (payload.done) working = await updateRun({ phase: 'trees', resumePhase: 'trees' })
      }

      if (working.phase === 'trees') {
        const items = await getItems(working.runId)
        const codes = items.map(item => item.itemCode)
        while (working.treeOffset < codes.length) {
          controllerRef.current = new AbortController()
          const batchCodes = codes.slice(working.treeOffset, working.treeOffset + 50)
          const response = await fetch('/api/product-design/color-audit/trees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemCodes: batchCodes, offset: 0 }),
            signal: controllerRef.current.signal,
          })
          const payload = await response.json() as TreesResponse
          if (!response.ok || !payload.success) throw new Error(payload.error ?? 'No se pudo leer un lote de LdM SAP.')
          const treeByCode = new Map((payload.trees ?? []).map(treeItem => [treeItem.treeCode, treeItem]))
          const itemByCode = new Map(items.filter(item => batchCodes.includes(item.itemCode)).map(item => [item.itemCode, item]))
          const rows = batchCodes.flatMap(code => {
            const item = itemByCode.get(code)
            return item ? [classifyColorAuditItem(item, treeByCode.get(code) ?? null)] : []
          })
          await putRows(working.runId, rows)
          const delta = summarizeColorAuditRows(rows)
          delta.itemsRead = 0
          delta.skuCandidates = 0
          delta.treesRead = payload.trees?.length ?? 0
          const summary = mergeColorAuditSummary(working.summary, delta)
          working = await updateRun({ summary, treeOffset: working.treeOffset + batchCodes.length })
          if (pauseRequested.current) return updateRun({ status: 'paused', phase: 'paused', resumePhase: 'trees' }).then(() => undefined)
        }
        working = await updateRun({ status: 'complete', phase: 'complete', error: null })
      }
    } catch (error: unknown) {
      if (pauseRequested.current) {
        await updateRun({ status: 'paused', phase: 'paused', resumePhase: working.phase === 'trees' ? 'trees' : 'items', error: null })
      } else {
        await updateRun({ status: 'error', phase: 'error', error: error instanceof Error ? error.message : 'La auditoría falló.' })
      }
    } finally {
      controllerRef.current = null
    }
  }

  async function start(): Promise<void> {
    pauseRequested.current = false
    setMassUpdate(initialMassUpdateState())
    await clearAuditData()
    const fresh = newRun()
    runRef.current = fresh
    setRun(fresh)
    await saveRun(fresh)
    void execute(fresh)
  }

  function pause(): void {
    pauseRequested.current = true
    controllerRef.current?.abort()
  }

  async function resume(): Promise<void> {
    const current = runRef.current
    if (!current || !['paused', 'error'].includes(current.status)) return
    const resumed = await updateRun({ status: 'running', phase: current.resumePhase, error: null })
    void execute(resumed)
  }

  async function loadEvidence(predicate: (row: ColorAuditRow) => boolean): Promise<void> {
    if (!run) return
    const rows = await getRows(run.runId)
    setEvidence(rows.filter(predicate))
  }

  async function requestMassUpdate(
    mode: 'dry-run' | 'apply',
    items: ColorAuditUpdateItem[],
    operationTotal: number,
    confirmationText: string,
  ): Promise<ColorAuditUpdateResponse> {
    const response = await fetch('/api/product-design/color-audit/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, items, operationTotal, confirmationText }),
    })
    const payload = await response.json() as ColorAuditUpdateResponse
    if (!response.ok || !payload.results) throw new Error(payload.error ?? 'No se pudo procesar el lote de cambio masivo.')
    return payload
  }

  async function refreshRowsFromUpdate(results: ColorAuditUpdateResult[]): Promise<void> {
    const current = runRef.current
    if (!current) return
    const resultByCode = new Map(results.map(result => [result.itemCode, result]))
    const rows = await getRows(current.runId)
    const updatedRows = rows.map(row => {
      const result = resultByCode.get(row.itemCode)
      if (!result?.success || !result.afterColor) return row
      const isMatch = result.afterColor === result.expectedColor
      return {
        ...row,
        declaredColor: result.afterColor,
        differenceCategory: isMatch ? 'match' : row.differenceCategory,
        correctionTarget: isMatch ? null : row.correctionTarget,
      }
    })
    await putRows(current.runId, updatedRows)
    const next = {
      ...current,
      summary: updateSummaryFromRows(current.summary, updatedRows),
      updatedAt: new Date().toISOString(),
    }
    runRef.current = next
    setRun(next)
    await saveRun(next)
  }

  async function runMassDryRun(): Promise<void> {
    if (!run || run.status !== 'complete') return
    const rows = await getRows(run.runId)
    const candidates: ColorAuditUpdateItem[] = rows.filter(isMassUpdateCandidate).map(row => ({
      itemCode: row.itemCode,
      expectedColor: row.correctionTarget as string,
      currentColor: row.declaredColor,
      differenceCategory: 'u_color_different',
    }))
    if (candidates.length === 0) {
      setMassUpdate({ ...initialMassUpdateState(), phase: 'complete', message: 'No hay discrepancias u_color_different con color válido para cambiar.' })
      return
    }

    setMassUpdate({ ...initialMassUpdateState(), phase: 'dry-run', total: candidates.length })
    const allResults: ColorAuditUpdateResult[] = []
    try {
      for (const batch of chunks(candidates, MASS_UPDATE_BATCH_SIZE)) {
        const payload = await requestMassUpdate('dry-run', batch, candidates.length, '')
        const results = payload.results ?? []
        allResults.push(...results)
        setMassUpdate(current => ({
          ...current,
          phase: 'dry-run',
          processed: allResults.length,
          total: candidates.length,
          results: [...allResults],
        }))
      }
      const eligibleItems = allResults.filter(result => result.eligible && result.success).map(result => ({
        itemCode: result.itemCode,
        expectedColor: result.expectedColor,
        currentColor: result.beforeColor,
        differenceCategory: 'u_color_different' as const,
      }))
      const confirmationRequired = `CAMBIAR U_COLOR EN SAP PARA ${eligibleItems.length} SKU`
      setMassUpdate({
        phase: eligibleItems.length > 0 ? 'awaiting-confirmation' : 'complete',
        processed: allResults.length,
        total: candidates.length,
        eligibleItems,
        results: allResults,
        confirmationRequired,
        confirmationText: '',
        message: eligibleItems.length > 0
          ? 'Dry-run terminado. SAP será releído antes de cada escritura.'
          : 'No quedó ningún SKU elegible para escribir; todos ya están correctos, cambiaron o tienen error.',
      })
    } catch (error: unknown) {
      setMassUpdate(current => ({ ...current, phase: 'error', results: [...allResults], message: error instanceof Error ? error.message : 'El dry-run falló.' }))
    }
  }

  async function runMassApply(): Promise<void> {
    if (massUpdate.phase !== 'awaiting-confirmation' || !massUpdate.confirmationRequired || massUpdate.confirmationText !== massUpdate.confirmationRequired) return
    const items = massUpdate.eligibleItems
    const allResults: ColorAuditUpdateResult[] = []
    setMassUpdate(current => ({ ...current, phase: 'applying', processed: 0, total: items.length, results: [], message: 'Aplicando lotes controlados y verificando cada SKU en SAP.' }))
    try {
      for (const batch of chunks(items, MASS_UPDATE_BATCH_SIZE)) {
        const payload = await requestMassUpdate('apply', batch, items.length, massUpdate.confirmationText)
        const results = payload.results ?? []
        allResults.push(...results)
        await refreshRowsFromUpdate(results)
        setMassUpdate(current => ({ ...current, phase: 'applying', processed: allResults.length, results: [...allResults] }))
      }
      setMassUpdate(current => ({ ...current, phase: 'complete', processed: allResults.length, results: allResults, message: 'Proceso terminado. Los resultados exitosos fueron releídos y verificados en SAP.' }))
    } catch (error: unknown) {
      setMassUpdate(current => ({ ...current, phase: 'error', processed: allResults.length, results: [...allResults], message: error instanceof Error ? error.message : 'El cambio masivo falló.' }))
    }
  }

  async function exportReport(format: 'csv' | 'json'): Promise<void> {
    if (!run) return
    const rows = await getRows(run.runId)
    const content = format === 'json'
      ? JSON.stringify({ run, rows }, null, 2)
      : [
          ['ItemCode', 'Nombre SAP', 'Familia', 'Referencia', 'Versión', 'Color SKU', 'U_Color', 'Estado SAP', 'TreeType', 'Tipo LdM', 'Diferencia'].map(csvEscape).join(','),
          ...rows.map(row => [row.itemCode, row.itemName, row.familyCode, row.referenceCode, row.versionCode, row.expectedColor ?? '', row.declaredColor, statusLabel(row.status), row.treeType ?? '', treeLabel(row.treeCategory), differenceLabel(row.differenceCategory)].map(csvEscape).join(',')),
        ].join('\n')
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `auditoria-color-sap-${new Date().toISOString().slice(0, 10)}.${format}`
    link.click()
    URL.revokeObjectURL(url)
  }

  const summary = run?.summary ?? emptyColorAuditSummary()
  const canStart = !run || !['running'].includes(run.status)
  const canPause = run?.status === 'running'
  const pageCount = Math.max(1, Math.ceil(totalFiltered / ROW_PAGE_SIZE))
  const massSuccessful = massUpdate.results.filter(result => result.success).length
  const massFailed = massUpdate.results.filter(result => !result.success).length
  const summaryCards: Array<{ label: string; value: number; predicate: (row: ColorAuditRow) => boolean }> = [
    { label: 'SKU revisados', value: summary.rowsAudited, predicate: () => true },
    { label: 'Compatibles', value: summary.compatible, predicate: row => row.differenceCategory === 'match' },
    { label: 'U_Color vacío', value: summary.uColorEmpty, predicate: row => row.differenceCategory === 'u_color_empty' },
    { label: 'U_Color inválido', value: summary.uColorInvalid, predicate: row => row.differenceCategory === 'u_color_invalid' },
    { label: 'U_Color diferente', value: summary.uColorDifferent, predicate: row => row.differenceCategory === 'u_color_different' },
    { label: 'Inactivos/congelados', value: summary.inactiveOrFrozen, predicate: row => ['inactive', 'frozen', 'inactive_frozen'].includes(row.status) },
    { label: 'Kits', value: summary.kits, predicate: row => row.treeCategory === 'kit' },
    { label: 'Sin LdM', value: summary.withoutBom, predicate: row => row.treeCategory === 'no_bom' },
    { label: 'Color SKU inválido', value: summary.skuColorInvalid, predicate: row => row.differenceCategory === 'sku_color_invalid' },
    { label: 'Otros tipos de LdM', value: summary.otherTrees, predicate: row => row.treeCategory === 'other_tree' },
  ]

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Diseño de producto · SAP</p>
        <h1 className="text-2xl font-bold text-slate-900">Auditoría de coherencia de color</h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-600">Compara U_Color con el cuarto bloque del ItemCode en todos los SKU de venta V, incluyendo todas las versiones. La auditoría es de solo lectura; el cambio masivo está separado, protegido por dry-run, confirmación textual y verificación posterior.</p>
      </header>

      <section className="border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {canStart ? <button type="button" onClick={() => void start()} className="inline-flex h-9 items-center gap-2 bg-emerald-700 px-3 text-sm font-semibold text-white"><Play className="h-4 w-4" />Nueva auditoría</button> : null}
          {canPause ? <button type="button" onClick={pause} className="inline-flex h-9 items-center gap-2 border border-amber-300 px-3 text-sm font-semibold text-amber-900"><Pause className="h-4 w-4" />Pausar</button> : null}
          {run?.status === 'paused' || run?.status === 'error' ? <button type="button" onClick={() => void resume()} className="inline-flex h-9 items-center gap-2 border border-sky-300 px-3 text-sm font-semibold text-sky-900"><RefreshCw className="h-4 w-4" />Reanudar</button> : null}
          {run?.status === 'complete' ? <><button type="button" onClick={() => void exportReport('csv')} className="inline-flex h-9 items-center gap-2 border border-slate-300 px-3 text-sm font-semibold text-slate-800"><Download className="h-4 w-4" />Exportar CSV</button><button type="button" onClick={() => void exportReport('json')} className="inline-flex h-9 items-center gap-2 border border-slate-300 px-3 text-sm font-semibold text-slate-800"><Download className="h-4 w-4" />Exportar JSON</button><button type="button" onClick={() => void runMassDryRun()} disabled={massUpdate.phase === 'dry-run' || massUpdate.phase === 'applying'} className="inline-flex h-9 items-center gap-2 bg-amber-600 px-3 text-sm font-semibold text-white disabled:opacity-50"><Zap className="h-4 w-4" />Cambio masivo</button></> : null}
          {run ? <span className="text-sm text-slate-600">{run.status === 'running' ? `Procesando ${run.phase === 'items' ? 'Items SAP' : 'LdM SAP'}…` : run.status === 'paused' ? 'Auditoría pausada' : run.status === 'complete' ? 'Auditoría completa' : 'Auditoría detenida por error'}</span> : null}
        </div>
        {run ? <><progress className="mt-3 h-2 w-full accent-emerald-700" value={progress} max={100} /><p className="mt-2 text-xs text-slate-500">{run.phase === 'items' ? `${summary.itemsRead} registros SAP leídos · ${summary.skuCandidates} SKU candidatos` : `${run.treeOffset}/${run.itemCount} SKU con LdM auditada`} · {progress}% aproximado</p></> : null}
        {run?.error ? <p className="mt-3 flex items-center gap-2 text-sm font-medium text-rose-700"><XCircle className="h-4 w-4" />{run.error}</p> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(card => (
          <button key={card.label} type="button" onClick={() => void loadEvidence(card.predicate)} className="border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-emerald-300">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p><p className="mt-1 text-xs text-emerald-700">Ver SKU exactos</p>
          </button>
        ))}
      </section>

      {evidence ? <section className="border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center justify-between"><h2 className="font-semibold text-emerald-950">Evidencia exacta ({evidence.length})</h2><button type="button" onClick={() => setEvidence(null)} className="text-sm font-semibold text-emerald-800">Cerrar</button></div><div className="mt-3 grid max-h-56 gap-1 overflow-y-auto text-sm text-emerald-950">{evidence.map(row => <div key={row.itemCode} className="flex flex-wrap gap-2"><span className="font-mono font-semibold">{row.itemCode}</span><span>— {row.itemName || 'Sin nombre'}</span><span>({differenceLabel(row.differenceCategory)})</span></div>)}</div></section> : null}

      {groups.length > 0 ? <section className="border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-amber-950">Grupos de corrección propuesta</h2><p className="mt-1 text-sm text-amber-900">El botón Cambio masivo solo toma filas u_color_different con color válido. Los kits permanecen separados de los SKU productivos y no se mezclan en los conteos.</p><div className="mt-3 grid gap-2">{groups.map(group => <CorrectionGroup key={`${group.treeCategory}:${group.actual}:${group.expected}`} group={group} onEvidence={() => void loadEvidence(row => row.treeCategory === group.treeCategory && (row.declaredColor || 'VACIO') === group.actual && row.correctionTarget === group.expected)} />)}</div></section> : null}

      {run?.status === 'complete' && massUpdate.phase !== 'idle' ? <section className="border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Cambio masivo controlado</h2><p className="mt-1">Solo se consideran las diferencias actuales de U_Color diferente. Cada lote tiene máximo {MASS_UPDATE_BATCH_SIZE} SKU y cada escritura se relee en SAP.</p></div><ShieldCheck className="h-6 w-6 text-violet-700" /></div>
        {massUpdate.total > 0 ? <><progress className="mt-3 h-2 w-full accent-violet-700" value={massUpdate.processed} max={massUpdate.total} /><p className="mt-2 text-xs">{massUpdate.processed}/{massUpdate.total} procesados · {massUpdate.phase === 'dry-run' ? 'Ejecutando dry-run' : massUpdate.phase === 'applying' ? 'Aplicando y verificando' : 'Proceso detenido o terminado'}</p></> : null}
        {massUpdate.message ? <p className="mt-3 font-medium">{massUpdate.message}</p> : null}
        {massUpdate.phase === 'awaiting-confirmation' ? <div className="mt-3 border border-violet-300 bg-white p-3"><p>Elegibles para escribir: <strong>{massUpdate.eligibleItems.length}</strong>. Ya correctos, omitidos: <strong>{massUpdate.results.filter(result => result.skipped).length}</strong>. Cambiados durante la revisión, omitidos: <strong>{massUpdate.results.filter(result => result.stale).length}</strong>.</p><p className="mt-2 text-xs">Para continuar, escribe exactamente: <span className="font-mono font-semibold">{massUpdate.confirmationRequired}</span></p><div className="mt-2 flex flex-wrap gap-2"><input value={massUpdate.confirmationText} onChange={event => setMassUpdate(current => ({ ...current, confirmationText: event.target.value }))} placeholder={massUpdate.confirmationRequired} className="h-9 min-w-[320px] flex-1 border border-slate-300 px-3 font-mono text-xs" /><button type="button" onClick={() => void runMassApply()} disabled={massUpdate.confirmationText !== massUpdate.confirmationRequired} className="inline-flex h-9 items-center gap-2 bg-violet-700 px-3 text-sm font-semibold text-white disabled:opacity-40"><ShieldCheck className="h-4 w-4" />Aplicar cambio masivo en SAP</button></div></div> : null}
        {massUpdate.results.length > 0 ? <><p className="mt-3 text-xs">Resultados: {massSuccessful} satisfactorios · {massFailed} con error u omitidos.</p><div className="mt-2 max-h-64 overflow-y-auto border border-violet-200 bg-white p-2 text-xs">{massUpdate.results.map(result => <div key={`${result.itemCode}:${result.message}`} className="flex flex-wrap gap-2 border-b border-slate-100 py-1 last:border-0"><span className="font-mono font-semibold">{result.itemCode}</span><span>{result.success ? 'OK' : result.stale ? 'OMITIDO' : 'ERROR'}</span><span>{result.beforeColor || 'VACÍO'} → {result.afterColor || result.expectedColor}</span><span>{result.message}</span></div>)}</div></> : null}
      </section> : null}

      <section className="border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
          <input value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} placeholder="Buscar SKU o nombre SAP" className="h-9 min-w-[220px] flex-1 border border-slate-300 px-3 text-sm" />
          <select value={version} onChange={event => { setVersion(event.target.value); setPage(0) }} className="h-9 border border-slate-300 bg-white px-2 text-sm"><option value="">Todas las versiones</option>{availableVersions.map(value => <option key={value} value={value}>{value}</option>)}</select>
          <select value={tree} onChange={event => { setTree(event.target.value); setPage(0) }} className="h-9 border border-slate-300 bg-white px-2 text-sm"><option value="">Todos los tipos</option><option value="productive">Productivos</option><option value="kit">Kits</option><option value="other_tree">Otros árboles</option><option value="no_bom">Sin LdM</option></select>
          <select value={difference} onChange={event => { setDifference(event.target.value); setPage(0) }} className="h-9 border border-slate-300 bg-white px-2 text-sm"><option value="">Todas las diferencias</option><option value="discrepancy">Solo discrepancias</option><option value="match">Solo compatibles</option></select>
        </div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">ItemCode</th><th className="px-4 py-3">Nombre SAP</th><th className="px-4 py-3">Versión</th><th className="px-4 py-3">Color SKU</th><th className="px-4 py-3">U_Color</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">LdM</th><th className="px-4 py-3">Resultado</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map(row => <tr key={row.itemCode}><td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{row.itemCode}</td><td className="px-4 py-3">{row.itemName || '-'}</td><td className="px-4 py-3 font-mono">{row.versionCode}</td><td className="px-4 py-3 font-mono">{row.expectedColor ?? 'INVÁLIDO'}</td><td className="px-4 py-3 font-mono">{row.declaredColor || 'VACÍO'}</td><td className="px-4 py-3">{statusLabel(row.status)}</td><td className="px-4 py-3">{treeLabel(row.treeCategory)}{row.treeType ? ` · ${row.treeType}` : ''}</td><td className={`px-4 py-3 font-semibold ${row.differenceCategory === 'match' ? 'text-emerald-700' : 'text-rose-700'}`}>{row.differenceCategory === 'match' ? <CheckCircle2 className="inline h-4 w-4" /> : null} {differenceLabel(row.differenceCategory)}</td></tr>)}</tbody></table></div>
        {visibleRows.length === 0 ? <p className="p-6 text-sm text-slate-500">Todavía no hay filas auditadas con estos filtros.</p> : null}
        <div className="flex items-center justify-between border-t border-slate-200 p-3 text-sm text-slate-600"><span>{totalFiltered} filas · página {page + 1} de {pageCount}</span><div className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))} className="h-8 border border-slate-300 px-2 disabled:opacity-40">Anterior</button><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(value => value + 1)} className="h-8 border border-slate-300 px-2 disabled:opacity-40">Siguiente</button></div></div>
      </section>

      {run?.status === 'running' ? <p className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Los resultados parciales se guardan localmente. Puedes pausar y reanudar después.</p> : null}
      {run?.status === 'complete' ? <section className="border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><h2 className="font-semibold">Siguientes caminos</h2><p className="mt-1">Corrección manual en SAP o corrección masiva desde la aplicación. La segunda opción ya está disponible con dry-run, confirmación textual exacta, lotes controlados y relectura antes y después de escribir.</p></section> : null}
      {run && run.status !== 'running' ? <button type="button" onClick={() => void clearAuditData().then(() => { runRef.current = null; setRun(null); setEvidence(null); setMassUpdate(initialMassUpdateState()) })} className="inline-flex items-center gap-2 self-end text-xs font-semibold text-slate-500 hover:text-rose-700"><Trash2 className="h-3 w-3" />Eliminar informe temporal</button> : null}
    </div>
  )
}

function CorrectionGroup({ group, onEvidence }: { group: ColorAuditCorrectionGroup; onEvidence: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border border-amber-200 bg-white p-3 text-sm"><div><span className="font-semibold">{group.actual} → {group.expected}</span><span className="ml-2 text-xs text-slate-500">{treeLabel(group.treeCategory)} · {group.count} SKU</span><div className="mt-1 text-xs text-slate-600">Ejemplos: {group.examples.join(', ')}</div></div><button type="button" onClick={onEvidence} className="inline-flex items-center gap-1 border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-900"><ChevronDown className="h-3 w-3" />Ver SKU</button></div>
}
