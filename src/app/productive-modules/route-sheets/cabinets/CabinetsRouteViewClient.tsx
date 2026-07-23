'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'

import {
  getProductiveRouteSheetAction,
  type ProductiveRouteSheet,
} from '../../actions'
import type { PilotSku } from '@/lib/bom/types'
import {
  calculatePieceAreaM2,
  calculatePieceEdgeMeters,
  createEmptyCabinetRouteData,
  getOperationalMaterialRows,
  getOperationalPieceRows,
  type CabinetMatchStatus,
  type CabinetRouteMaterialRow,
  MATERIAL_ROLES,
  MATERIAL_ROLE_LABELS,
} from '@/lib/routeSheets/cabinets'

const EMPTY_ROUTE_DATA = createEmptyCabinetRouteData()

const MATCH_LABELS: Record<CabinetMatchStatus, string> = {
  matched: 'Coincide',
  possible_match: 'Posible',
  sap_only: 'Solo SAP',
  sheet_only: 'Solo hoja',
  quantity_mismatch: 'Cantidad distinta',
  manual: 'Manual',
  ignored: 'Ignorado',
}

function MatchBadge({ status }: { status: CabinetMatchStatus }) {
  const className = status === 'matched'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : status === 'manual'
      ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
      : 'bg-amber-50 text-amber-700 ring-amber-200'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${className}`}>
      {MATCH_LABELS[status]}
    </span>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-300 p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">{title}</h3>
      {children}
    </section>
  )
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('es-CO', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })
}

function textOrEmpty(value: string): ReactNode {
  return value ? <div className="whitespace-pre-wrap text-sm text-slate-800">{value}</div> : <p className="text-sm text-slate-500">Sin informacion registrada.</p>
}

export function CabinetsRouteViewClient({ pilotSkus }: { pilotSkus: PilotSku[] }) {
  const [selectedSku, setSelectedSku] = useState(pilotSkus[0]?.sku ?? 'VBAN12-0081-000-0437')
  const [orderNumber, setOrderNumber] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [sheet, setSheet] = useState<ProductiveRouteSheet | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const routeData = sheet?.route_data_json ?? EMPTY_ROUTE_DATA
  const operationalPieces = useMemo(
    () => getOperationalPieceRows(routeData.sections.pieces.rows),
    [routeData.sections.pieces.rows]
  )
  const operationalHardware = useMemo(
    () => getOperationalMaterialRows(routeData.sections.hardware.rows),
    [routeData.sections.hardware.rows]
  )
  const operationalPacking = useMemo(
    () => getOperationalMaterialRows(routeData.sections.packing.rows),
    [routeData.sections.packing.rows]
  )
  const orderQty = useMemo(() => {
    const parsed = Number(quantity)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  }, [quantity])
  const pieceTotals = useMemo(() => ({
    count: operationalPieces.reduce((sum, row) => sum + row.quantity * orderQty, 0),
    edgeMeters: operationalPieces.reduce((sum, row) => sum + calculatePieceEdgeMeters(row) * orderQty, 0),
    areaM2: operationalPieces.reduce((sum, row) => sum + calculatePieceAreaM2(row) * orderQty, 0),
  }), [operationalPieces, orderQty])
  const routeStatus = sheet?.route_status ?? 'draft'

  useEffect(() => {
    startTransition(async () => {
      const result = await getProductiveRouteSheetAction(selectedSku)
      if (result.error) setMessage(result.error)
      else setMessage(result.sheet?.bom_warning ?? null)
      setSheet(result.sheet)
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
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Hoja de ruta cabinets</p>
            <h1 className="mt-1 text-xl font-black">{sheet?.product_name || selectedSku}</h1>
            <p className="text-sm text-slate-600">{sheet?.sap_description_original || 'Sin descripcion SAP cargada.'}</p>
            <p className="mt-1 text-xs text-slate-500">
              Referencia: <strong>{sheet?.reference_code || '-'}</strong> | Estado ruta: <strong>{routeStatus}</strong>
              {routeData.source?.snapshot_taken_at ? <><br />Instantanea: <strong>{new Date(routeData.source.snapshot_taken_at).toLocaleString('es-CO')}</strong></> : null}
            </p>
          </div>
          <div className="text-right text-sm">
            <p><strong>SKU analisis:</strong> {selectedSku}</p>
            <p><strong>Orden:</strong> {orderNumber || 'POR DEFINIR'}</p>
            <p><strong>Cantidad:</strong> {quantity || '1'}</p>
            <p><strong>Color:</strong> {sheet?.color_code || '-'}{sheet?.color_name ? ` (${sheet.color_name})` : ''}</p>
          </div>
        </div>

        {routeStatus !== 'approved' ? (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Esta hoja no esta aprobada todavia. Produccion puede verla, pero debe validarla con diseno antes de uso operativo.
          </p>
        ) : null}

        {routeData.source ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Section title="Perfiles por rol">
              {MATERIAL_ROLES.map((role) => {
                const profile = routeData.source!.profiles?.[role]
                return profile ? (
                  <p key={role} className="text-sm"><strong>{MATERIAL_ROLE_LABELS[role]}:</strong> {profile}</p>
                ) : null
              })}
            </Section>
            <Section title="Tipos de canto por rol">
              {MATERIAL_ROLES.map((role) => {
                const edge = routeData.source!.edge_types?.[role]
                return edge ? (
                  <p key={role} className="text-sm"><strong>{MATERIAL_ROLE_LABELS[role]}:</strong> {edge}</p>
                ) : null
              })}
            </Section>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Section title="Totales piezas">
            <p className="text-sm"><strong>Cantidad piezas:</strong> {formatNumber(pieceTotals.count, 0)}</p>
            <p className="text-sm"><strong>Canto estimado:</strong> {formatNumber(pieceTotals.edgeMeters)} m</p>
            <p className="text-sm"><strong>Area estimada:</strong> {formatNumber(pieceTotals.areaM2)} m2</p>
          </Section>
          <Section title="Notas generales">{textOrEmpty(routeData.sections.observations.general_notes)}</Section>
          <Section title="Notas diseno">{textOrEmpty(routeData.sections.observations.design_notes)}</Section>
        </div>

        <div className="mt-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">Piezas / despiece</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1 text-left">Coincidencia</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Letra</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Pieza</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Material</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Largo</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Ancho</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Cant.</th>
                <th className="border border-slate-300 px-2 py-1 text-right">m canto</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Obs.</th>
              </tr>
            </thead>
            <tbody>
              {operationalPieces.map((row) => (
                <tr key={row.id}>
                  <td className="border border-slate-300 px-2 py-1"><MatchBadge status={row.match_status} /></td>
                  <td className="border border-slate-300 px-2 py-1 font-bold">{row.letter}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.piece_name}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.material_label}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{row.length_mm ?? '-'}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{row.width_mm ?? '-'}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{formatNumber(row.quantity * orderQty, 0)}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{formatNumber(calculatePieceEdgeMeters(row) * orderQty)}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.observation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Section title="Corte">
            {textOrEmpty(routeData.sections.cutting.notes)}
            <table className="mt-2 w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-2 py-1 text-left">Material</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Formato</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">Laminas</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">m2</th>
                </tr>
              </thead>
              <tbody>
                {routeData.sections.cutting.board_consumptions.map((row) => (
                  <tr key={row.id}>
                    <td className="border border-slate-300 px-2 py-1">{row.material_label}</td>
                    <td className="border border-slate-300 px-2 py-1">{row.board_size_label}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right">{row.board_count ?? '-'}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right">{row.consumption_m2 ? formatNumber(row.consumption_m2 * orderQty) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Canto">{textOrEmpty(routeData.sections.edging.notes)}</Section>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <MaterialSection title="Herrajes" rows={operationalHardware} orderQty={orderQty} notes={routeData.sections.hardware.notes} />
          <MaterialSection title="Empaque" rows={operationalPacking} orderQty={orderQty} notes={routeData.sections.packing.notes} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Section title="Perforacion">
            {textOrEmpty(routeData.sections.drilling.notes)}
            <ul className="mt-2 space-y-1 text-xs">
              {routeData.sections.drilling.rows.map((row) => (
                <li key={row.id}>{row.piece_letter} | {row.operation} | {row.face} | {row.depth_mm ?? '-'} mm</li>
              ))}
            </ul>
          </Section>
          <Section title="Ensamble">
            {textOrEmpty(routeData.sections.assembly.notes)}
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
              {routeData.sections.assembly.steps
                .slice()
                .sort((a, b) => a.step_order - b.step_order)
                .map((step) => <li key={step.id}>{step.description}</li>)}
            </ol>
          </Section>
        </div>

        <div className="mt-4">
          <Section title="Tetris / niveles de empaque">
            <div className="grid gap-2 md:grid-cols-2">
              {routeData.sections.packing.levels.map((level) => (
                <div key={level.id} className="rounded border border-slate-200 px-3 py-2 text-xs">
                  <p><strong>Nivel {level.level}:</strong> {level.piece_letters.join(' - ') || '-'}</p>
                  {level.observation ? <p className="text-slate-500">{level.observation}</p> : null}
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="mt-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">Lista de materiales BOM SAP</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1 text-left">Tipo</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Nivel</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Codigo</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Descripcion</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Cant. x1</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Total</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Padre</th>
              </tr>
            </thead>
            <tbody>
              {(sheet?.candidates ?? []).map((candidate) => (
                <tr key={candidate.line_id}>
                  <td className="border border-slate-300 px-2 py-1">{candidate.kind}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{candidate.level}</td>
                  <td className="border border-slate-300 px-2 py-1 font-mono">{candidate.item_code}</td>
                  <td className="border border-slate-300 px-2 py-1">{candidate.item_name || 'No encontrado'}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{candidate.qty}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{formatNumber(candidate.qty * orderQty)}</td>
                  <td className="border border-slate-300 px-2 py-1 font-mono text-[10px]">{candidate.parent_item_code || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(sheet?.match_report.summary.pending_decisions ?? 0) > 0 ? (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-amber-800">Pendientes de conciliacion</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
              {sheet?.match_report.issues.slice(0, 8).map((issue, index) => (
                <li key={`${issue.type}-${index}`}>{issue.label}: {issue.detail}</li>
              ))}
            </ul>
          </div>
        ) : null}
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

function MaterialSection({
  title,
  rows,
  orderQty,
  notes,
}: {
  title: string
  rows: CabinetRouteMaterialRow[]
  orderQty: number
  notes: string
}) {
  return (
    <Section title={title}>
      {textOrEmpty(notes)}
      <table className="mt-2 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1 text-left">Coincidencia</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Codigo</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Item</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="border border-slate-300 px-2 py-1"><MatchBadge status={row.match_status} /></td>
              <td className="border border-slate-300 px-2 py-1 font-mono">{row.item_code}</td>
              <td className="border border-slate-300 px-2 py-1">{row.item_name}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{formatNumber(row.quantity * orderQty)} {row.uom || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}
