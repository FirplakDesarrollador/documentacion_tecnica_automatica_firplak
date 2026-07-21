'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'

import {
  createConfirmation,
  deleteConfirmation,
  statusConfirmation,
  type SapItemTargetStatus,
} from '@/lib/sap/itemLifecycle'

type Reference = {
  reference_id: string
  family_code: string
  reference_code: string
  product_name: string | null
  version_id: string
  version_code: string
  line_count: number
}

type Prepared = {
  context: {
    targetItemCode: string
    sourceItemCode: string
    colorName: string
    resolvedLines: Array<{ resolved_item_code: string; qty: number; resolution_status: string }>
    missing: string[]
    warnings: string[]
  }
  existing: boolean
  existingBom: { lineCount: number } | null
}

type SearchResult = { itemCode: string; itemName: string }
type ColorOption = { code: string; name: string }
type SapBomLine = { ItemCode: string; ItemName: string; Quantity: number; Warehouse: string | null; IssueMethod: string }
type AssociationReport = {
  parentTrees: Array<{ treeCode: string; treeType: string | null; productDescription: string | null }>
  productionOrders: Array<{ absoluteEntry: number | null; documentNumber: number | null; itemNo: string | null; status: string | null }>
  complete: boolean
  warnings: string[]
}
type Inspection = {
  itemCode: string
  item: Record<string, unknown>
  lifecycle: { itemCode: string; itemName: string; valid: boolean | null; frozen: boolean | null }
  bom: { treeCode: string; treeType: string | null; lineCount: number; lines: SapBomLine[] } | null
  associations: AssociationReport
  supabaseMirror: { found: boolean; skuComplete: string | null; status: string | null }
}
type ApiResponse = { success?: boolean; message?: string; error?: string; [key: string]: unknown }

function itemValue(item: Record<string, unknown> | null, key: string): string {
  const value = item?.[key]
  return value === null || value === undefined ? '' : String(value)
}

function getErrorMessage(payload: ApiResponse, fallback: string): string {
  return typeof payload.message === 'string' && payload.message
    ? payload.message
    : typeof payload.error === 'string' && payload.error
      ? payload.error
      : fallback
}

function statusLabel(lifecycle: Inspection['lifecycle']): string {
  if (lifecycle.valid === true && lifecycle.frozen === false) return 'Activo'
  if (lifecycle.valid === false && lifecycle.frozen === true) return 'Inactivo y congelado'
  return 'Estado mixto o no clasificado'
}

function statusClass(lifecycle: Inspection['lifecycle']): string {
  if (lifecycle.valid === true && lifecycle.frozen === false) return 'bg-emerald-50 text-emerald-700'
  if (lifecycle.valid === false && lifecycle.frozen === true) return 'bg-rose-50 text-rose-700'
  return 'bg-amber-50 text-amber-800'
}

export default function SapCodeCreationClient({ canManageSapCodes }: { canManageSapCodes: boolean }) {
  const [references, setReferences] = useState<Reference[]>([])
  const [referenceId, setReferenceId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [colorCode, setColorCode] = useState('0466')
  const [barcodeIntent, setBarcodeIntent] = useState<'none' | 'provided'>('none')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [createConfirmationText, setCreateConfirmationText] = useState('')

  const [searchCode, setSearchCode] = useState('')
  const [searchDescription, setSearchDescription] = useState('')
  const [searchColor, setSearchColor] = useState('')
  const [colors, setColors] = useState<ColorOption[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchSkip, setSearchSkip] = useState(0)
  const [searchHasMore, setSearchHasMore] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)

  const [busy, setBusy] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [inspectionLoading, setInspectionLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [statusTarget, setStatusTarget] = useState<SapItemTargetStatus | null>(null)
  const [statusPreview, setStatusPreview] = useState<ApiResponse | null>(null)
  const [statusConfirmationText, setStatusConfirmationText] = useState('')
  const [deletePreview, setDeletePreview] = useState<ApiResponse | null>(null)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('')
  const [finalResult, setFinalResultState] = useState<ApiResponse | null>(null)
  const [fallbackAvailable, setFallbackAvailable] = useState(false)

  function setFinalResult(value: ApiResponse | null) {
    if (value && value.success !== true) {
      setFallbackAvailable(value.fallback === 'INACTIVAR')
      setFinalResultState(null)
      return
    }
    setFinalResultState(value)
  }

  const selectedReference = references.find(item => item.reference_id === referenceId)
  const targetItemCode = selectedReference
    ? `V${selectedReference.family_code}-${selectedReference.reference_code}-000-${colorCode.padStart(4, '0')}`.toUpperCase()
    : ''

  useEffect(() => {
    let cancelled = false
    async function loadInitialData() {
      try {
        const [referencesResponse, colorsResponse] = await Promise.all([
          fetch('/api/product-design/sap-code-creation'),
          fetch('/api/sap/items/colors'),
        ])
        const referencesPayload = await referencesResponse.json() as { references?: Reference[]; error?: string }
        const colorsPayload = await colorsResponse.json() as { colors?: ColorOption[]; error?: string }
        if (cancelled) return
        if (!referencesResponse.ok) throw new Error(referencesPayload.error || 'No se pudieron cargar las referencias.')
        setReferences(referencesPayload.references ?? [])
        setColors(colorsPayload.colors ?? [])
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los datos iniciales.')
      }
    }
    void loadInitialData()
    return () => { cancelled = true }
  }, [])

  async function postAction(body: Record<string, unknown>): Promise<ApiResponse> {
    const response = await fetch('/api/product-design/sap-code-creation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json() as ApiResponse
    if (!response.ok && payload.success !== false) throw new Error(getErrorMessage(payload, 'La operación SAP falló.'))
    return payload
  }

  async function runCreation(action: 'prepare' | 'compare' | 'create') {
    setBusy(true)
    setError('')
    setActionMessage('')
    setFinalResult(null)
    try {
      const payload = await postAction({
        action,
        referenceId,
        versionId,
        colorCode,
        barcodeIntent,
        barcodeValue,
        confirmationText: createConfirmationText,
        dryRun: action !== 'create',
      })
      if (payload.success !== true) throw new Error(getErrorMessage(payload, 'La operación de creación falló.'))
      if (action === 'prepare') {
        setPrepared(payload as unknown as Prepared)
        setCreateConfirmationText('')
      } else {
        setFinalResult(payload)
        if (action === 'create' && typeof payload.itemCode === 'string') await inspectItem(payload.itemCode)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La operación de creación falló.')
    } finally {
      setBusy(false)
    }
  }

  async function searchItems(append: boolean) {
    const code = searchCode.trim().toUpperCase()
    const description = searchDescription.trim()
    const color = searchColor.trim().toUpperCase()
    if (!code && !description && !color) {
      setError('Ingresa código, descripción o color para buscar en SAP.')
      return
    }
    const nextSkip = append ? searchSkip : 0
    setSearchLoading(true)
    setError('')
    setHasSearched(true)
    if (!append) {
      setSearchResults([])
      setSelectedResult(null)
      setInspection(null)
      setSearchSkip(0)
      setSearchHasMore(false)
      setFinalResult(null)
      setFallbackAvailable(false)
    }
    try {
      const params = new URLSearchParams({ code, description, color, skip: String(nextSkip) })
      const response = await fetch(`/api/sap/items/search?${params.toString()}`)
      const payload = await response.json() as { success?: boolean; items?: SearchResult[]; hasMore?: boolean; nextSkip?: number | null; error?: string }
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'No se pudo buscar en SAP.')
      setSearchResults(previous => append ? [...previous, ...(payload.items ?? [])] : payload.items ?? [])
      setSearchHasMore(payload.hasMore === true)
      setSearchSkip(payload.nextSkip ?? nextSkip + (payload.items?.length ?? 0))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo buscar en SAP.')
    } finally {
      setSearchLoading(false)
    }
  }

  async function inspectItem(itemCode: string) {
    const normalizedCode = itemCode.trim().toUpperCase()
    if (!normalizedCode) return
    setInspectionLoading(true)
    setError('')
    setActionMessage('')
    setFinalResult(null)
    setFallbackAvailable(false)
    try {
      const payload = await postAction({ action: 'inspect', itemCode: normalizedCode })
      if (payload.success !== true) throw new Error(getErrorMessage(payload, 'No se pudo consultar el artículo SAP.'))
      setInspection(payload as unknown as Inspection)
      setSelectedResult({ itemCode: normalizedCode, itemName: itemValue(payload.item as Record<string, unknown>, 'ItemName') })
      setStatusTarget(null)
      setStatusPreview(null)
      setDeletePreview(null)
      setStatusConfirmationText('')
      setDeleteConfirmationText('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo consultar el artículo SAP.')
    } finally {
      setInspectionLoading(false)
    }
  }

  async function runStatus(targetStatus: SapItemTargetStatus, dryRun: boolean) {
    const itemCode = inspection?.itemCode
    if (!itemCode) return
    setActionLoading(true)
    setError('')
    setActionMessage('')
    setStatusTarget(targetStatus)
    try {
      const expected = statusConfirmation(itemCode, targetStatus)
      const payload = await postAction({
        action: 'status',
        itemCode,
        targetStatus,
        dryRun,
        confirmationText: dryRun ? '' : statusConfirmationText,
      })
      if (dryRun) {
        setStatusPreview(payload)
        setStatusConfirmationText(expected)
      } else if (payload.success === true) {
        setFinalResult(payload)
        setActionMessage(payload.message || 'Estado actualizado y verificado.')
        await inspectItem(itemCode)
      } else {
        setError(getErrorMessage(payload, 'No se pudo actualizar el estado SAP.'))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo actualizar el estado SAP.')
    } finally {
      setActionLoading(false)
    }
  }

  async function runDelete(dryRun: boolean) {
    const itemCode = inspection?.itemCode
    if (!itemCode) return
    setActionLoading(true)
    setError('')
    setActionMessage('')
    setFallbackAvailable(false)
    try {
      const expected = deleteConfirmation(itemCode)
      const payload = await postAction({
        action: 'delete',
        itemCode,
        dryRun,
        confirmationText: dryRun ? '' : deleteConfirmationText,
      })
      if (dryRun) {
        setDeletePreview(payload)
        setDeleteConfirmationText(expected)
      } else if (payload.success === true) {
        setFinalResult(payload)
        setActionMessage(payload.message || 'Artículo eliminado y verificado.')
        setInspection(null)
        setSelectedResult(null)
      } else {
        setError(getErrorMessage(payload, 'No se pudo eliminar el artículo SAP.'))
        setFinalResult(payload)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo eliminar el artículo SAP.')
    } finally {
      setActionLoading(false)
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void searchItems(false)
  }

  function handleReferenceChange(value: string) {
    const reference = references.find(item => item.reference_id === value)
    setReferenceId(value)
    setVersionId(reference?.version_id ?? '')
    setPrepared(null)
    setCreateConfirmationText('')
    setFinalResult(null)
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div>
          <Link href="/product-design" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">← Diseño de producto</Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Creación y administración de variantes SAP</h1>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">Crea variantes desde la BOM V2 o consulta cualquier código directamente en SAP para revisar y administrar únicamente ese artículo.</p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Crear variante SAP</h2>
            <p className="mt-1 text-sm text-slate-500">La creación usa la referencia, versión y BOM V2 del aplicativo; las acciones administrativas usan el artículo real de SAP.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Referencia
              <select value={referenceId} onChange={event => handleReferenceChange(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 p-2">
                <option value="">Selecciona una referencia</option>
                {references.map(item => <option key={item.reference_id} value={item.reference_id}>{item.family_code}-{item.reference_code} · {item.product_name ?? 'sin nombre'} · {item.line_count} líneas</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Color nuevo (4 dígitos)
              <input value={colorCode} onChange={event => setColorCode(event.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-1 w-full rounded-md border border-slate-300 p-2" />
            </label>
            <div className="text-sm text-slate-600 md:col-span-2">Versión seleccionada: <strong>{selectedReference?.version_code ?? '000'}</strong>. SKU: <strong>{targetItemCode || '—'}</strong></div>
            <fieldset className="md:col-span-2">
              <legend className="text-sm font-medium text-slate-700">¿Lleva código de barras?</legend>
              <div className="mt-2 flex gap-5 text-sm">
                <label><input type="radio" checked={barcodeIntent === 'none'} onChange={() => setBarcodeIntent('none')} /> No lleva</label>
                <label><input type="radio" checked={barcodeIntent === 'provided'} onChange={() => setBarcodeIntent('provided')} /> Sí, especificar</label>
              </div>
              {barcodeIntent === 'provided' ? <input value={barcodeValue} onChange={event => setBarcodeValue(event.target.value)} placeholder="EAN-13" className="mt-2 w-full rounded-md border border-slate-300 p-2" /> : null}
            </fieldset>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={busy || !referenceId} onClick={() => void runCreation('prepare')} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Procesando…' : 'Preparar y validar'}</button>
            {prepared?.existing ? <button disabled={busy} onClick={() => void runCreation('compare')} className="rounded-md border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50">Comparar con SAP</button> : null}
            {prepared && !prepared.existing && prepared.context.missing.length === 0 && canManageSapCodes ? <button disabled={busy || createConfirmationText !== createConfirmation(prepared.context.targetItemCode)} onClick={() => void runCreation('create')} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Crear Item + LdM en SAP</button> : null}
          </div>
          {prepared && !prepared.existing && prepared.context.missing.length === 0 && canManageSapCodes ? <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><label className="font-semibold">Confirmación de creación<input value={createConfirmationText} onChange={event => setCreateConfirmationText(event.target.value)} placeholder={createConfirmation(prepared.context.targetItemCode)} className="mt-1 block w-full rounded border border-amber-300 bg-white p-2 font-mono text-xs" /></label></div> : null}
          {prepared?.context.missing.length ? <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">Faltantes: {prepared.context.missing.join(', ')}</div> : null}
          {prepared?.context.warnings.map(warning => <p key={warning} className="mt-2 text-xs text-amber-700">⚠ {warning}</p>)}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Buscar artículo en SAP</h2>
            <p className="mt-1 text-sm text-slate-500">Consulta en tiempo real por código, descripción y color. Los resultados incluyen cualquier tipo de artículo SAP.</p>
          </div>
          <form onSubmit={handleSearchSubmit} className="grid gap-3 lg:grid-cols-[1fr_1.3fr_220px_auto] lg:items-end">
            <label className="text-sm font-medium text-slate-700">Número de artículo<input value={searchCode} onChange={event => setSearchCode(event.target.value.toUpperCase())} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 font-mono text-sm" placeholder="VBAN12-0012-000-0458" /></label>
            <label className="text-sm font-medium text-slate-700">Descripción<input value={searchDescription} onChange={event => setSearchDescription(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="Descripción del artículo" /></label>
            <label className="text-sm font-medium text-slate-700">Color<select value={searchColor} onChange={event => setSearchColor(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"><option value="">Todos los colores</option>{colors.map(color => <option key={color.code} value={color.code}>{color.code} · {color.name}</option>)}</select></label>
            <button type="submit" disabled={searchLoading} className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">{searchLoading ? 'Buscando…' : 'Buscar en SAP'}</button>
          </form>
          {hasSearched && !selectedResult ? <div className="mt-4 overflow-hidden rounded-lg border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">Resultados SAP · {searchResults.length}</div>{searchResults.length === 0 ? <p className="p-4 text-sm text-slate-500">SAP no devolvió artículos.</p> : searchResults.map(result => <button key={result.itemCode} type="button" onClick={() => void inspectItem(result.itemCode)} className="grid w-full gap-1 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-indigo-50 sm:grid-cols-[260px_1fr]"><span className="font-mono text-sm font-semibold">{result.itemCode}</span><span className="text-sm text-slate-600">{result.itemName || 'Sin descripción en SAP'}</span></button>)}{searchHasMore ? <button type="button" onClick={() => void searchItems(true)} disabled={searchLoading} className="w-full border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-indigo-700 disabled:opacity-50">Ver más resultados</button> : null}</div> : null}
        </section>

        {inspection ? <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Artículo SAP seleccionado</p><h2 className="mt-1 font-mono text-xl font-bold">{inspection.itemCode}</h2><p className="mt-1 text-sm text-slate-600">{inspection.lifecycle.itemName || 'Sin descripción'}</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(inspection.lifecycle)}`}>{statusLabel(inspection.lifecycle)}</span>
          </div>
          {inspectionLoading ? <p className="mt-4 text-sm text-slate-500">Actualizando lectura SAP…</p> : null}
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-md bg-slate-50 p-3"><span className="text-xs text-slate-500">Valid</span><p className="font-semibold">{String(itemValue(inspection.item, 'Valid') || 'No informado')}</p></div>
            <div className="rounded-md bg-slate-50 p-3"><span className="text-xs text-slate-500">Frozen</span><p className="font-semibold">{String(itemValue(inspection.item, 'Frozen') || 'No informado')}</p></div>
            <div className="rounded-md bg-slate-50 p-3"><span className="text-xs text-slate-500">SKU espejo</span><p className="font-semibold">{inspection.supabaseMirror.found ? `${inspection.supabaseMirror.status || 'sin estado'}` : 'No existe en Supabase'}</p></div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4"><h3 className="font-semibold">LdM propia</h3>{inspection.bom ? <><p className="mt-1 text-sm text-slate-600">{inspection.bom.treeType || 'Tipo no informado'} · {inspection.bom.lineCount} líneas.</p><div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">Componente</th><th className="p-2">Cantidad</th><th className="p-2">Almacén</th></tr></thead><tbody>{inspection.bom.lines.map((line, index) => <tr key={`${line.ItemCode}-${index}`} className="border-t border-slate-100"><td className="p-2 font-mono">{line.ItemCode}</td><td className="p-2">{line.Quantity}</td><td className="p-2">{line.Warehouse || '—'}</td></tr>)}</tbody></table></div></> : <p className="mt-1 text-sm text-slate-500">No tiene LdM propia en SAP.</p>}</div>
            <div className="rounded-lg border border-slate-200 p-4"><h3 className="font-semibold">Asociaciones detectadas</h3>{inspection.associations.warnings.map(warning => <p key={warning} className="mt-2 text-xs text-amber-700">⚠ {warning}</p>)}{inspection.associations.parentTrees.length === 0 && inspection.associations.productionOrders.length === 0 && inspection.associations.complete ? <p className="mt-2 text-sm text-emerald-700">No se detectaron asociaciones superiores ni OF.</p> : null}{inspection.associations.parentTrees.map(tree => <p key={`tree-${tree.treeCode}`} className="mt-2 text-sm text-rose-700">LdM superior: <span className="font-mono">{tree.treeCode}</span></p>)}{inspection.associations.productionOrders.map(order => <p key={`order-${order.absoluteEntry ?? order.documentNumber}`} className="mt-2 text-sm text-rose-700">OF: {order.documentNumber ?? order.absoluteEntry ?? 'sin número'} · {order.status || 'estado no informado'}</p>)}</div>
          </div>

          {canManageSapCodes ? <div className="mt-5 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4"><h3 className="font-semibold text-slate-900">Administrar este código</h3><p className="mt-1 text-xs text-slate-600">Las acciones afectan únicamente a <span className="font-mono">{inspection.itemCode}</span>. No modifican familia, referencia, versión ni componentes.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={actionLoading} onClick={() => void runStatus('ACTIVO', true)} className="rounded-md border border-emerald-600 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50">Dry-run activar</button><button type="button" disabled={actionLoading} onClick={() => void runStatus('INACTIVO', true)} className="rounded-md border border-amber-600 bg-white px-3 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50">Dry-run inactivar</button><button type="button" disabled={actionLoading} onClick={() => void runDelete(true)} className="rounded-md border border-rose-600 bg-white px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Dry-run eliminar</button></div>{statusPreview && statusTarget ? <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm"><p>{statusPreview.message as string}</p><label className="mt-2 block font-semibold">Confirmación de estado<input value={statusConfirmationText} onChange={event => setStatusConfirmationText(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 p-2 font-mono text-xs" /></label><button type="button" disabled={actionLoading || statusConfirmationText !== statusConfirmation(inspection.itemCode, statusTarget)} onClick={() => void runStatus(statusTarget, false)} className="mt-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Confirmar {statusTarget === 'ACTIVO' ? 'activación' : 'inactivación'}</button></div> : null}{deletePreview ? <div className="mt-3 rounded-md border border-rose-200 bg-white p-3 text-sm"><p>{deletePreview.message as string}</p><p className="mt-1 text-xs text-slate-600">LdM propia: {String((deletePreview.plan as { treeLineCount?: number } | undefined)?.treeLineCount ?? 0)} líneas · asociaciones verificadas: {String((deletePreview.plan as { associationCheckComplete?: boolean } | undefined)?.associationCheckComplete ?? false)}</p><label className="mt-2 block font-semibold">Confirmación de eliminación<input value={deleteConfirmationText} onChange={event => setDeleteConfirmationText(event.target.value)} className="mt-1 block w-full rounded border border-slate-300 p-2 font-mono text-xs" /></label><button type="button" disabled={actionLoading || deleteConfirmationText !== deleteConfirmation(inspection.itemCode)} onClick={() => void runDelete(false)} className="mt-2 rounded-md bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Confirmar eliminación</button></div> : null}</div> : <p className="mt-5 rounded-md bg-slate-50 p-3 text-sm text-slate-600">Tu perfil puede consultar este artículo, pero no tiene habilitada la administración de códigos SAP.</p>}
        </section> : null}

        {finalResult ? <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><h2 className="font-semibold">Resultado verificado</h2><p className="mt-1">{typeof finalResult.message === 'string' ? finalResult.message : 'La operación devolvió evidencia posterior.'}</p>{finalResult.fallback === 'INACTIVAR' ? <button type="button" disabled={actionLoading || !inspection} onClick={() => inspection ? void runStatus('INACTIVO', true) : undefined} className="mt-3 rounded-md border border-amber-600 bg-white px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50">Preparar inactivación alternativa</button> : null}</section> : null}
        {fallbackAvailable && inspection ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><p>La eliminaciÃ³n fÃ­sica fue bloqueada por SAP. Puedes inactivar Ãºnicamente este ItemCode.</p><button type="button" disabled={actionLoading} onClick={() => void runStatus('INACTIVO', true)} className="mt-2 rounded-md border border-amber-600 bg-white px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50">Preparar inactivaciÃ³n alternativa</button></div> : null}
        {actionMessage ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionMessage}</div> : null}
        {error ? <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      </div>
    </main>
  )
}
