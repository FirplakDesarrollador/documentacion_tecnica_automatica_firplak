'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import {
  getProductiveRouteSheetAction,
  type ProductiveRouteSheet,
} from '../../actions'
import type { PilotSku } from '@/lib/bom/types'

function textField(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  return typeof value === 'string' ? value : ''
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-300 p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">{title}</h3>
      <div className="whitespace-pre-wrap text-sm text-slate-800">{children || 'Sin información registrada.'}</div>
    </section>
  )
}

export function FurnitureRouteViewClient({ pilotSkus }: { pilotSkus: PilotSku[] }) {
  const [selectedSku, setSelectedSku] = useState(pilotSkus[0]?.sku ?? 'VBAN12-0081-000-0437')
  const [orderNumber, setOrderNumber] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [sheet, setSheet] = useState<ProductiveRouteSheet | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const routeData = sheet?.route_data_json ?? {}
  const totalPieces = useMemo(() => {
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) return 0
    return sheet?.lines.reduce((sum, line) => sum + (line.qty * qty), 0) ?? 0
  }, [quantity, sheet])

  async function loadSheet(sku: string) {
    const result = await getProductiveRouteSheetAction(sku)
    if (result.error) setMessage(result.error)
    setSheet(result.sheet)
  }

  useEffect(() => {
    startTransition(() => {
      void loadSheet(selectedSku)
    })
  }, [selectedSku])

  function printRouteSheet() {
    window.print()
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <aside className="no-print rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Consulta</h2>
        <label className="mt-4 flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">SKU piloto</span>
          <select
            value={selectedSku}
            onChange={(event) => setSelectedSku(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            {pilotSkus.map((pilot) => (
              <option key={pilot.sku} value={pilot.sku}>{pilot.sku} - {pilot.label}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Orden</span>
          <input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="Ej: OF-12345"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Cantidad</span>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            type="number"
            min="1"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={printRouteSheet}
          disabled={!sheet || isPending}
          className="mt-4 w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Imprimir hoja carta
        </button>
        {message ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p> : null}
      </aside>

      <section className="route-sheet-page bg-white p-6 text-slate-900 shadow-sm print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-300 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Hoja de ruta muebles</p>
            <h1 className="mt-1 text-xl font-black">{sheet?.product_name || selectedSku}</h1>
            <p className="text-sm text-slate-600">{sheet?.sap_description_original || 'Sin descripción SAP cargada.'}</p>
          </div>
          <div className="text-right text-sm">
            <p><strong>SKU:</strong> {selectedSku}</p>
            <p><strong>Orden:</strong> {orderNumber || 'POR DEFINIR'}</p>
            <p><strong>Cantidad:</strong> {quantity || '1'}</p>
            <p><strong>Color:</strong> {sheet?.color_code || '-'}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Section title="Notas generales">{textField(routeData, 'general_notes')}</Section>
          <Section title="Piezas / despiece">{textField(routeData, 'pieces_text')}</Section>
          <Section title="Corte">{textField(routeData, 'cutting_notes')}</Section>
          <Section title="Enchape">{textField(routeData, 'edging_notes')}</Section>
          <Section title="Taladro">{textField(routeData, 'drilling_notes')}</Section>
          <Section title="Empaque / despacho">{textField(routeData, 'packing_notes')}</Section>
          <div className="md:col-span-2">
            <Section title="Tetris / optimización">{textField(routeData, 'tetris_notes')}</Section>
          </div>
        </div>

        <div className="mt-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">Lista de materiales resuelta</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1 text-left">Código</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Descripción</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Cant. x1</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Total</th>
                <th className="border border-slate-300 px-2 py-1 text-left">UM</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Bodega</th>
              </tr>
            </thead>
            <tbody>
              {(sheet?.lines ?? []).map((line) => {
                const qty = Number(quantity)
                const total = Number.isFinite(qty) ? line.qty * qty : line.qty
                return (
                  <tr key={line.line_id}>
                    <td className="border border-slate-300 px-2 py-1 font-mono">{line.resolved_item_code}</td>
                    <td className="border border-slate-300 px-2 py-1">{line.resolved_item_name || 'No encontrado'}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right">{line.qty}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right">{total.toFixed(2)}</td>
                    <td className="border border-slate-300 px-2 py-1">{line.uom || '-'}</td>
                    <td className="border border-slate-300 px-2 py-1">{line.input_warehouse_code || '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-right text-xs text-slate-500">Total referencial de consumos multiplicados: {totalPieces.toFixed(2)}</p>
        </div>
      </section>

      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
          }

          .no-print,
          aside,
          nav {
            display: none !important;
          }

          .route-sheet-page {
            width: 216mm;
            min-height: 279mm;
            padding: 12mm !important;
            box-shadow: none !important;
          }

          @page {
            size: letter;
            margin: 8mm;
          }
        }
      `}</style>
    </div>
  )
}
