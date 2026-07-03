'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import {
  getPilotBomSummariesAction,
  getResolvedBomAction,
  getRouteDocumentAction,
  importPilotBomsAction,
  importSingleBomAction,
  saveRouteDocumentAction,
  updateSapItemStatusAction,
  type PilotBomSummary,
  type RouteDocumentState,
} from '../../actions'
import type { ResolvedBomLine } from '@/lib/bom/types'

type RouteDraft = {
  general_notes: string
  pieces_text: string
  cutting_notes: string
  edging_notes: string
  drilling_notes: string
  packing_notes: string
  tetris_notes: string
}

const EMPTY_DRAFT: RouteDraft = {
  general_notes: '',
  pieces_text: '',
  cutting_notes: '',
  edging_notes: '',
  drilling_notes: '',
  packing_notes: '',
  tetris_notes: '',
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function draftFromDocument(document: RouteDocumentState | null): RouteDraft {
  const data = document?.route_data_json ?? {}
  return {
    general_notes: asText(data.general_notes),
    pieces_text: asText(data.pieces_text),
    cutting_notes: asText(data.cutting_notes),
    edging_notes: asText(data.edging_notes),
    drilling_notes: asText(data.drilling_notes),
    packing_notes: asText(data.packing_notes),
    tetris_notes: asText(data.tetris_notes),
  }
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  const active = status === 'ACTIVO'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      {status || 'SIN IMPORTAR'}
    </span>
  )
}

export function FurnitureRouteDesignClient({ initialSummaries }: { initialSummaries: PilotBomSummary[] }) {
  const [summaries, setSummaries] = useState(initialSummaries)
  const [selectedSku, setSelectedSku] = useState(initialSummaries[0]?.sku_complete ?? 'VBAN12-0081-000-0437')
  const [lines, setLines] = useState<ResolvedBomLine[]>([])
  const [routeDocument, setRouteDocument] = useState<RouteDocumentState | null>(null)
  const [draft, setDraft] = useState<RouteDraft>(EMPTY_DRAFT)
  const [message, setMessage] = useState<string | null>(null)
  const [targetStatus, setTargetStatus] = useState<'ACTIVO' | 'INACTIVO'>('INACTIVO')
  const [confirmationText, setConfirmationText] = useState('')
  const [isPending, startTransition] = useTransition()

  const selectedSummary = useMemo(
    () => summaries.find(summary => summary.sku_complete === selectedSku) ?? summaries[0] ?? null,
    [selectedSku, summaries]
  )

  async function refreshSummaries() {
    const result = await getPilotBomSummariesAction()
    if (result.error) {
      setMessage(result.error)
      return
    }
    setSummaries(result.summaries)
  }

  async function loadSku(sku: string) {
    const [bomResult, docResult] = await Promise.all([
      getResolvedBomAction(sku),
      getRouteDocumentAction(sku),
    ])

    if (bomResult.error) setMessage(bomResult.error)
    setLines(bomResult.lines)

    if (docResult.error) setMessage(docResult.error)
    setRouteDocument(docResult.document)
    setDraft(draftFromDocument(docResult.document))
  }

  useEffect(() => {
    startTransition(() => {
      void loadSku(selectedSku)
    })
  }, [selectedSku])

  function runImportAll() {
    startTransition(async () => {
      const result = await importPilotBomsAction()
      setMessage(result.message)
      await refreshSummaries()
      await loadSku(selectedSku)
    })
  }

  function runImportSingle() {
    startTransition(async () => {
      const result = await importSingleBomAction(selectedSku)
      setMessage(result.message)
      await refreshSummaries()
      await loadSku(selectedSku)
    })
  }

  function saveRoute() {
    startTransition(async () => {
      const result = await saveRouteDocumentAction({
        skuComplete: selectedSku,
        routeData: draft,
        status: 'draft',
      })
      setMessage(result.message)
      await loadSku(selectedSku)
    })
  }

  function dryRunStatus() {
    startTransition(async () => {
      const result = await updateSapItemStatusAction({
        itemCode: selectedSku,
        targetStatus,
        dryRun: true,
        confirmationText: '',
      })
      setConfirmationText(result.confirmationRequired)
      setMessage(result.message)
    })
  }

  function applyStatus() {
    startTransition(async () => {
      const result = await updateSapItemStatusAction({
        itemCode: selectedSku,
        targetStatus,
        dryRun: false,
        confirmationText,
      })
      setMessage(result.message)
      await refreshSummaries()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">Piloto SAP</h2>
            <button
              type="button"
              onClick={runImportAll}
              disabled={isPending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              Importar 3
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {summaries.map((summary) => (
              <button
                key={summary.sku_complete}
                type="button"
                onClick={() => setSelectedSku(summary.sku_complete)}
                className={`rounded-md border p-3 text-left text-sm transition ${selectedSku === summary.sku_complete ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{summary.sku_complete}</span>
                  <StatusBadge status={summary.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{summary.label}</p>
                <p className="mt-2 text-xs text-slate-600">
                  Líneas: {summary.line_count} · resueltas: {summary.resolved_count} · faltantes: {summary.missing_count}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Estado SAP</h2>
          <p className="mt-1 text-xs text-slate-500">Solo admin puede aplicar cambios reales. Primero ejecuta dry-run.</p>
          <select
            value={targetStatus}
            onChange={(event) => setTargetStatus(event.target.value as 'ACTIVO' | 'INACTIVO')}
            className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ACTIVO">Activar</option>
            <option value="INACTIVO">Inactivar</option>
          </select>
          <button
            type="button"
            onClick={dryRunStatus}
            disabled={isPending}
            className="mt-3 w-full rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-60"
          >
            Dry-run SAP
          </button>
          <input
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            placeholder="Confirmación exacta"
            className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={applyStatus}
            disabled={isPending || !confirmationText}
            className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Aplicar en SAP
          </button>
        </div>
      </aside>

      <section className="flex flex-col gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{selectedSummary?.product_name || selectedSku}</h2>
              <p className="text-sm text-slate-500">{selectedSummary?.sap_description_original || 'Importa desde SAP para cargar la descripción.'}</p>
            </div>
            <button
              type="button"
              onClick={runImportSingle}
              disabled={isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Importar este SKU
            </button>
          </div>
          {message ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p> : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">LdM resuelta</h2>
            <span className="text-xs text-slate-500">{lines.length} líneas</span>
          </div>
          <div className="max-h-80 overflow-auto rounded-md border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Orden</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2">Cant.</th>
                  <th className="px-3 py-2">UM</th>
                  <th className="px-3 py-2">Bodega</th>
                  <th className="px-3 py-2">Método</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.line_id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{line.sort_order}</td>
                    <td className="px-3 py-2 font-mono">{line.resolved_item_code}</td>
                    <td className="px-3 py-2">{line.resolved_item_name || 'No encontrado'}</td>
                    <td className="px-3 py-2">{line.qty}</td>
                    <td className="px-3 py-2">{line.uom || '-'}</td>
                    <td className="px-3 py-2">{line.input_warehouse_code || '-'}</td>
                    <td className="px-3 py-2">{line.issue_method || '-'}</td>
                    <td className="px-3 py-2">{line.resolution_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Hoja de ruta diseño - Muebles</h2>
              <p className="text-xs text-slate-500">Documento editable fijo V1. Producción lo ve en modo solo lectura.</p>
            </div>
            <button
              type="button"
              onClick={saveRoute}
              disabled={isPending || !routeDocument}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Guardar
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Notas generales" value={draft.general_notes} onChange={(value) => setDraft({ ...draft, general_notes: value })} />
            <Field label="Piezas / despiece" value={draft.pieces_text} onChange={(value) => setDraft({ ...draft, pieces_text: value })} />
            <Field label="Corte" value={draft.cutting_notes} onChange={(value) => setDraft({ ...draft, cutting_notes: value })} />
            <Field label="Enchape" value={draft.edging_notes} onChange={(value) => setDraft({ ...draft, edging_notes: value })} />
            <Field label="Taladro" value={draft.drilling_notes} onChange={(value) => setDraft({ ...draft, drilling_notes: value })} />
            <Field label="Empaque / despacho" value={draft.packing_notes} onChange={(value) => setDraft({ ...draft, packing_notes: value })} />
            <div className="md:col-span-2">
              <Field label="Tetris / optimización" value={draft.tetris_notes} onChange={(value) => setDraft({ ...draft, tetris_notes: value })} />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
