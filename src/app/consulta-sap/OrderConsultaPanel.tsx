'use client'

import { type FormEvent, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Loader2, Search } from 'lucide-react'

type OrderMode = 'production-orders' | 'sales-orders'
type SapRecord = Record<string, unknown>

type ProductionOrderRow = {
  absoluteEntry: number | null
  documentNumber: number | null
  itemNo: string | null
  itemName: string | null
  plannedQuantity: number | null
  completedQuantity: number | null
  status: string | null
  postingDate: string | null
  dueDate: string | null
}

type SalesOrderRow = {
  documentEntry: number | null
  documentNumber: number | null
  cardCode: string | null
  cardName: string | null
  docDate: string | null
  docDueDate: string | null
  status: string | null
  total: number | null
  currency: string | null
  customerReference: string | null
}

type SearchPayload<T> =
  | { success: true; items: T[]; hasMore: boolean; nextSkip: number | null }
  | { success: false; error: string }

type DetailPayload =
  | { success: true; order: SapRecord }
  | { success: false; error: string }

const PRODUCTION_STATUS_LABELS: Record<string, string> = {
  P: 'Planificada',
  R: 'Liberada',
  L: 'Cerrada',
  C: 'Cancelada',
  boposPlanned: 'Planificada',
  boposReleased: 'Liberada',
  boposClosed: 'Cerrada',
  boposCancelled: 'Cancelada',
}

const SALES_STATUS_LABELS: Record<string, string> = {
  O: 'Abierta',
  C: 'Cerrada',
  bost_Open: 'Abierta',
  bost_Close: 'Cerrada',
}

function isRecord(value: unknown): value is SapRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function recordValue(record: SapRecord, key: string): unknown {
  return record[key]
}

function formatDate(value: string | null): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—'
}

function formatNumber(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value)
}

function formatAmount(value: number | null, currency: string | null): string {
  if (value === null) return '—'
  return `${currency ? `${currency} ` : ''}${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value)}`
}

function statusLabel(mode: OrderMode, status: string | null): string {
  if (!status) return 'Sin estado en SAP'
  return (mode === 'production-orders' ? PRODUCTION_STATUS_LABELS : SALES_STATUS_LABELS)[status] ?? status
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value || '—'}</dd>
    </div>
  )
}

function DetailPanel({
  mode,
  order,
  onBack,
  onOpenItem,
}: {
  mode: OrderMode
  order: SapRecord
  onBack: () => void
  onOpenItem: (itemCode: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'general' | 'lines' | 'links'>('general')
  const isProduction = mode === 'production-orders'
  const itemCode = stringValue(recordValue(order, isProduction ? 'ItemNo' : 'CardCode'))
  const documentNumber = numberValue(recordValue(order, isProduction ? 'DocumentNumber' : 'DocNum'))
  const rawStatus = stringValue(recordValue(order, isProduction ? 'ProductionOrderStatus' : 'DocumentStatus'))
  const lines = useMemo(() => {
    const value = recordValue(order, isProduction ? 'ProductionOrderLines' : 'DocumentLines')
    return Array.isArray(value) ? value.filter(isRecord) : []
  }, [isProduction, order])
  const originEntry = numberValue(recordValue(order, 'ProductionOrderOriginEntry'))
    ?? numberValue(recordValue(order, 'OriginAbs'))
  const originNumber = numberValue(recordValue(order, 'ProductionOrderOriginNum'))
  const originType = stringValue(recordValue(order, 'ProductionOrderOrigin'))
    || stringValue(recordValue(order, 'OriginType'))

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isProduction ? 'Orden de fabricación' : 'Orden de venta'}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">N.º {documentNumber ?? '—'}</h2>
        </div>
        <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <ArrowLeft className="size-4" /> Volver a la lista
        </button>
      </div>

      <div role="tablist" aria-label="Detalle de la orden" className="flex overflow-x-auto border-b border-slate-200 px-4 sm:px-6">
        {[
          ['general', 'Resumen'],
          ['lines', isProduction ? 'Componentes' : 'Líneas'],
          ['links', 'Vínculos'],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id as typeof activeTab)} className={[
            'shrink-0 border-b-2 px-4 py-3 text-sm font-semibold',
            activeTab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800',
          ].join(' ')}>{label}</button>
        ))}
      </div>

      <div className="p-4 sm:p-6">
        {activeTab === 'general' ? (
          <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <DetailField label="Estado" value={statusLabel(mode, rawStatus)} />
            {isProduction ? <>
              <DetailField label="Artículo fabricado" value={itemCode} />
              <DetailField label="Descripción" value={stringValue(recordValue(order, 'ItemName'))} />
              <DetailField label="Cantidad planificada" value={formatNumber(numberValue(recordValue(order, 'PlannedQuantity')))} />
              <DetailField label="Cantidad completada" value={formatNumber(numberValue(recordValue(order, 'CompletedQuantity')))} />
              <DetailField label="Cantidad rechazada" value={formatNumber(numberValue(recordValue(order, 'RejectedQuantity')))} />
              <DetailField label="Fecha de documento" value={formatDate(stringValue(recordValue(order, 'PostingDate')))} />
              <DetailField label="Fecha de vencimiento" value={formatDate(stringValue(recordValue(order, 'DueDate')))} />
              <DetailField label="Cliente" value={stringValue(recordValue(order, 'CardName'))} />
            </> : <>
              <DetailField label="Cliente" value={stringValue(recordValue(order, 'CardName'))} />
              <DetailField label="Código de cliente" value={itemCode} />
              <DetailField label="Fecha de documento" value={formatDate(stringValue(recordValue(order, 'DocDate')))} />
              <DetailField label="Fecha de vencimiento" value={formatDate(stringValue(recordValue(order, 'DocDueDate')))} />
              <DetailField label="Total" value={formatAmount(numberValue(recordValue(order, 'DocTotal')), stringValue(recordValue(order, 'DocCurrency')) || null)} />
              <DetailField label="Referencia del cliente" value={stringValue(recordValue(order, 'NumAtCard'))} />
              <DetailField label="Comentarios" value={stringValue(recordValue(order, 'Comments'))} />
            </>}
          </dl>
        ) : null}

        {activeTab === 'lines' ? (
          lines.length === 0 ? <p className="text-sm text-slate-500">SAP no devolvió líneas para esta orden.</p> : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2">Cantidad</th><th className="px-3 py-2">Bodega</th></tr></thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {lines.map((line, index) => {
                    const code = stringValue(recordValue(line, 'ItemNo')) || stringValue(recordValue(line, 'ItemCode'))
                    const quantity = numberValue(recordValue(line, isProduction ? 'PlannedQuantity' : 'Quantity')) ?? numberValue(recordValue(line, 'BaseQuantity'))
                    return <tr key={`${code}-${index}`}><td className="px-3 py-2 font-mono text-slate-800">{code || '—'}</td><td className="px-3 py-2 text-slate-700">{stringValue(recordValue(line, 'ItemName')) || stringValue(recordValue(line, 'ItemDescription')) || '—'}</td><td className="px-3 py-2 text-slate-700">{formatNumber(quantity)}</td><td className="px-3 py-2 text-slate-700">{stringValue(recordValue(line, 'Warehouse')) || stringValue(recordValue(line, 'WarehouseCode')) || '—'}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {activeTab === 'links' ? (
          <div className="grid gap-3 md:grid-cols-2">
            {isProduction && itemCode ? <button type="button" onClick={() => onOpenItem(itemCode)} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50"><span><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Artículo fabricado</span><span className="mt-1 block font-mono text-sm font-semibold text-slate-900">{itemCode}</span></span><ExternalLink className="size-4 text-indigo-600" /></button> : null}
            {isProduction && (originEntry !== null || originNumber !== null || originType) ? <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documento de origen SAP</p><p className="mt-1 text-sm font-medium text-slate-800">{originType || 'Documento relacionado'}{originNumber !== null ? ` · N.º ${originNumber}` : ''}{originEntry !== null ? ` · ID ${originEntry}` : ''}</p></div> : null}
            {!isProduction ? <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">Selecciona un artículo de las líneas para abrir sus datos maestros y LdM.</p> : null}
            {!isProduction && lines.length > 0 ? lines.filter(line => stringValue(recordValue(line, 'ItemCode'))).slice(0, 10).map(line => {
              const code = stringValue(recordValue(line, 'ItemCode'))
              return <button key={code} type="button" onClick={() => onOpenItem(code)} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50"><span className="font-mono text-sm font-semibold text-slate-900">{code}</span><ExternalLink className="size-4 text-indigo-600" /></button>
            }) : null}
            {isProduction && !itemCode && originEntry === null && originNumber === null ? <p className="text-sm text-slate-500">SAP no devolvió vínculos para esta OF.</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function OrderConsultaPanel({ mode, onOpenItem }: { mode: OrderMode; onOpenItem: (itemCode: string) => void }) {
  const isProduction = mode === 'production-orders'
  const [number, setNumber] = useState('')
  const [firstCriterion, setFirstCriterion] = useState('')
  const [secondCriterion, setSecondCriterion] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [overdue, setOverdue] = useState(false)
  const [rows, setRows] = useState<Array<ProductionOrderRow | SalesOrderRow>>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextSkip, setNextSkip] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<SapRecord | null>(null)

  const firstLabel = isProduction ? 'Código de artículo' : 'Código de cliente'
  const secondLabel = isProduction ? 'Descripción del artículo' : 'Nombre del cliente'

  async function search(append: boolean) {
    if (!number.trim() && !firstCriterion.trim() && !secondCriterion.trim() && !status && !dateFrom && !dateTo && !overdue) {
      setError('Ingresa al menos un criterio para consultar SAP.')
      return
    }
    const params = new URLSearchParams({ number: number.trim(), skip: String(append ? nextSkip : 0) })
    if (isProduction) {
      params.set('itemCode', firstCriterion.trim())
      params.set('description', secondCriterion.trim())
      if (overdue) params.set('overdue', 'true')
    } else {
      params.set('cardCode', firstCriterion.trim())
      params.set('cardName', secondCriterion.trim())
    }
    if (status) params.set('status', status)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    setLoading(true)
    setError(null)
    setHasSearched(true)
    try {
      const endpoint = isProduction ? '/api/sap/production-orders/search?' : '/api/sap/sales-orders/search?'
      const response = await fetch(endpoint + params.toString(), { headers: { Accept: 'application/json' } })
      const payload = await response.json() as SearchPayload<ProductionOrderRow | SalesOrderRow>
      if (!response.ok || !payload.success) {
        setError(payload.success ? 'No se pudo consultar SAP.' : payload.error)
        return
      }
      setRows(previous => append ? [...previous, ...payload.items] : payload.items)
      setHasMore(payload.hasMore)
      setNextSkip(payload.nextSkip ?? 0)
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar SAP.')
    } finally {
      setLoading(false)
    }
  }

  async function loadDetail(row: ProductionOrderRow | SalesOrderRow) {
    const entry = isProduction ? (row as ProductionOrderRow).absoluteEntry : (row as SalesOrderRow).documentEntry
    if (entry === null) return
    setLoading(true)
    setError(null)
    try {
      const endpoint = isProduction ? `/api/sap/production-orders/${entry}` : `/api/sap/sales-orders/${entry}`
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
      const payload = await response.json() as DetailPayload
      if (!response.ok || !payload.success) {
        setError(payload.success ? 'No se pudo consultar SAP.' : payload.error)
        return
      }
      setSelectedOrder(payload.order)
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar SAP.')
    } finally {
      setLoading(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void search(false)
  }

  if (selectedOrder) return <DetailPanel mode={mode} order={selectedOrder} onBack={() => setSelectedOrder(null)} onOpenItem={onOpenItem} />

  return (
    <>
      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-4">
          <label className="grid gap-1.5"><span className="text-sm font-semibold text-slate-800">N.º {isProduction ? 'OF' : 'OV'}</span><input value={number} onChange={event => setNumber(event.target.value)} inputMode="numeric" className="h-10 rounded-md border border-slate-300 px-3 font-mono text-sm" /></label>
          <label className="grid gap-1.5"><span className="text-sm font-semibold text-slate-800">{firstLabel}</span><input value={firstCriterion} onChange={event => setFirstCriterion(event.target.value.toUpperCase())} className="h-10 rounded-md border border-slate-300 px-3 text-sm" /></label>
          <label className="grid gap-1.5"><span className="text-sm font-semibold text-slate-800">{secondLabel}</span><input value={secondCriterion} onChange={event => setSecondCriterion(event.target.value)} className="h-10 rounded-md border border-slate-300 px-3 text-sm" /></label>
          <label className="grid gap-1.5"><span className="text-sm font-semibold text-slate-800">Estado</span><select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Todos</option>{isProduction ? <><option value="P">Planificada</option><option value="R">Liberada</option><option value="L">Cerrada</option><option value="C">Cancelada</option></> : <><option value="O">Abierta</option><option value="C">Cerrada</option></>}</select></label>
          <label className="grid gap-1.5"><span className="text-sm font-semibold text-slate-800">Fecha desde</span><input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-10 rounded-md border border-slate-300 px-3 text-sm" /></label>
          <label className="grid gap-1.5"><span className="text-sm font-semibold text-slate-800">Fecha hasta</span><input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-10 rounded-md border border-slate-300 px-3 text-sm" /></label>
          {isProduction ? <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={overdue} onChange={event => setOverdue(event.target.checked)} /> Solo vencidas</label> : null}
          <div className="flex items-end"><button type="submit" disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Consultar</button></div>
        </div>
      </form>
      <p className="text-xs text-slate-500">Las consultas son de solo lectura. Puedes combinar criterios y cargar 20 resultados adicionales por vez.</p>
      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {hasSearched ? <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-4 py-3 sm:px-6"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resultados SAP</p><p className="mt-1 text-sm text-slate-600">Selecciona una orden para consultar su detalle.</p></div>{rows.length === 0 ? <p className="p-6 text-sm text-slate-500">SAP no devolvió órdenes para esta búsqueda.</p> : <div className="divide-y divide-slate-100">{rows.map(row => {
        const productionRow = row as ProductionOrderRow
        const salesRow = row as SalesOrderRow
        const key = isProduction ? productionRow.absoluteEntry : salesRow.documentEntry
        const title = isProduction ? `OF ${productionRow.documentNumber ?? '—'}` : `OV ${salesRow.documentNumber ?? '—'}`
        const description = isProduction ? `${productionRow.itemNo ?? '—'} · ${productionRow.itemName ?? 'Sin descripción'}` : `${salesRow.cardCode ?? '—'} · ${salesRow.cardName ?? 'Sin cliente'}`
        const state = isProduction ? productionRow.status : salesRow.status
        const due = isProduction ? productionRow.dueDate : salesRow.docDueDate
        return <button key={key ?? title} type="button" onClick={() => void loadDetail(row)} disabled={loading || key === null} className="grid w-full gap-1 px-4 py-3 text-left hover:bg-indigo-50 disabled:opacity-60 sm:grid-cols-[180px_minmax(0,1fr)_160px_120px] sm:gap-4 sm:px-6"><span className="font-mono text-sm font-semibold text-slate-900">{title}</span><span className="truncate text-sm text-slate-700">{description}</span><span className="text-sm text-slate-600">{statusLabel(mode, state)}</span><span className="text-sm text-slate-500">Vence: {formatDate(due)}</span></button>
      })}</div>}{hasMore ? <div className="flex justify-center border-t border-slate-200 bg-slate-50 p-3"><button type="button" onClick={() => void search(true)} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{loading ? <Loader2 className="size-4 animate-spin" /> : null} Cargar 20 resultados más</button></div> : null}</section> : null}
    </>
  )
}
