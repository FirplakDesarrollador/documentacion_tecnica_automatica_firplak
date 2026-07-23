'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'

import {
  getCabinetRouteWorkspaceByRefAction,
  parseOriginalCabinetRouteSheetAction,
  saveRouteDocumentAction,
  type CabinetBomReferenceSummary,
} from '../../actions'
import {
  CABINET_ROUTE_STATUSES,
  applyCabinetMatchDecision,
  buildCabinetRouteMatchReport,
  calculatePieceAreaM2,
  calculatePieceEdgeMeters,
  calculateAreaByRole,
  calculateEdgeByRole,
  createCandidateMatchState,
  createEmptyCabinetRouteData,
  createManualMatchState,
  getOperationalMaterialRows,
  newCabinetRouteId,
  reconcileCabinetRouteData,
  resolveProfileForRole,
  type CabinetAssemblyStep,
  type CabinetBoardConsumption,
  type CabinetBomCandidate,
  type CabinetDecisionSection,
  type CabinetDrillingRow,
  type CabinetMatchIssue,
  type CabinetMatchStatus,
  type CabinetPackingLevel,
  type CabinetPieceRow,
  type CabinetProfilesByRole,
  type CabinetRouteData,
  type CabinetRouteDecision,
  type CabinetRouteMaterialRow,
  type CabinetRouteStatus,
  type MaterialRole,
  MATERIAL_ROLES,
  MATERIAL_ROLE_LABELS,
  PROFILE_OPTIONS,
} from '@/lib/routeSheets/cabinets'

const REFERENCE_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  review: 'En revision',
  approved: 'Aprobada',
  archived: 'Obsoleta',
}

const STATUS_LABELS: Record<CabinetRouteStatus, string> = {
  draft: 'Borrador',
  review: 'En revision',
  approved: 'Aprobada',
  archived: 'Archivada',
}

const MATCH_LABELS: Record<CabinetMatchStatus, string> = {
  matched: 'Coincide',
  possible_match: 'Posible',
  sap_only: 'Solo SAP',
  sheet_only: 'Solo hoja',
  quantity_mismatch: 'Cantidad distinta',
  manual: 'Manual',
  ignored: 'Ignorado',
}

function matchClassName(status: CabinetMatchStatus): string {
  if (status === 'matched') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'possible_match') return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (status === 'quantity_mismatch') return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (status === 'sap_only') return 'bg-violet-50 text-violet-700 ring-violet-200'
  if (status === 'sheet_only') return 'bg-rose-50 text-rose-700 ring-rose-200'
  if (status === 'ignored') return 'bg-slate-100 text-slate-500 ring-slate-200'
  return 'bg-indigo-50 text-indigo-700 ring-indigo-200'
}

function MatchBadge({ status }: { status: CabinetMatchStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${matchClassName(status)}`}>
      {MATCH_LABELS[status]}
    </span>
  )
}

function RouteStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
        Sin hoja de ruta
      </span>
    )
  }
  const colorMap: Record<string, string> = {
    draft: 'bg-amber-100 text-amber-700',
    review: 'bg-sky-100 text-sky-700',
    approved: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-rose-100 text-rose-700',
  }
  const cls = colorMap[status] ?? 'bg-slate-100 text-slate-500'
  const label = REFERENCE_STATUS_LABELS[status] ?? status
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}

function TextInput({
  value,
  placeholder,
  onChange,
  className = '',
}: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${className}`}
    />
  )
}

function NumberInput({
  value,
  onChange,
  min,
  step = '1',
  className = '',
}: {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  step?: string
  className?: string
}) {
  return (
    <input
      value={value ?? ''}
      type="number"
      min={min}
      step={step}
      onChange={(event) => {
        const parsed = Number(event.target.value)
        onChange(Number.isFinite(parsed) ? parsed : null)
      }}
      className={`w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${className}`}
    />
  )
}

function TextArea({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-20 w-full rounded-md border border-slate-300 p-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
    />
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {description ? <p className="text-xs text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('es-CO', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })
}

export function CabinetsRouteDesignClient({ initialReferences }: { initialReferences: CabinetBomReferenceSummary[] }) {
  const [selectedReferenceId, setSelectedReferenceId] = useState('')
  const [establishedRefId, setEstablishedRefId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<CabinetRouteData>(() => createEmptyCabinetRouteData())
  const [status, setStatus] = useState<CabinetRouteStatus>('draft')
  const [candidates, setCandidates] = useState<CabinetBomCandidate[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [bomWarning, setBomWarning] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredReferences = useMemo(
    () => {
      const q = searchQuery.trim().toLowerCase().replace(/[áéíóúüñ]/g, c => 'aeiouun'['áéíóúüñ'.indexOf(c)])
      if (!q) return initialReferences
      return initialReferences.filter(ref => {
        const text = `${ref.display_code} ${ref.product_name ?? ''} ${ref.designation ?? ''}`.toLowerCase()
        return text.includes(q)
      })
    },
    [searchQuery, initialReferences]
  )

  const selectedReference = useMemo(
    () => initialReferences.find(ref => ref.reference_id === selectedReferenceId) ?? null,
    [selectedReferenceId, initialReferences]
  )
  const matchReport = useMemo(() => buildCabinetRouteMatchReport(draft, candidates), [draft, candidates])
  const totalEdgeMeters = useMemo(
    () => draft.sections.pieces.rows.reduce((sum, row) => sum + calculatePieceEdgeMeters(row), 0),
    [draft.sections.pieces.rows]
  )
  const totalAreaM2 = useMemo(
    () => draft.sections.pieces.rows.reduce((sum, row) => sum + calculatePieceAreaM2(row), 0),
    [draft.sections.pieces.rows]
  )
  const areaByRole = useMemo(() => calculateAreaByRole(draft.sections.pieces.rows), [draft.sections.pieces.rows])
  const edgeByRole = useMemo(() => calculateEdgeByRole(draft.sections.pieces.rows), [draft.sections.pieces.rows])
  const piecesByRole = useMemo(() => {
    const grouped: Partial<Record<MaterialRole, CabinetPieceRow[]>> = {}
    for (const role of MATERIAL_ROLES) grouped[role] = []
    for (const row of draft.sections.pieces.rows) {
      const role = row.material_role ?? 'structure'
      if (!grouped[role]) grouped[role] = []
      grouped[role].push(row)
    }
    return grouped
  }, [draft.sections.pieces.rows])
  const operationalHardwareRows = useMemo(
    () => getOperationalMaterialRows(draft.sections.hardware.rows),
    [draft.sections.hardware.rows]
  )
  const operationalPackingRows = useMemo(
    () => getOperationalMaterialRows(draft.sections.packing.rows),
    [draft.sections.packing.rows]
  )

  useEffect(() => {
    if (!establishedRefId) return
    startTransition(async () => {
      const result = await getCabinetRouteWorkspaceByRefAction(establishedRefId)
      if (result.error) {
        setMessage(result.error)
        setDraft(createEmptyCabinetRouteData())
        setCandidates([])
        setBomWarning(null)
        return
      }
      setDraft(result.document?.route_data_json ?? createEmptyCabinetRouteData())
      setStatus(result.document?.status ?? 'draft')
      setCandidates(result.candidates)
      setBomWarning(result.bomWarning)
      setMessage(null)
    })
  }, [establishedRefId])

  function establishRoute() {
    if (!selectedReference) return
    setEstablishedRefId(selectedReference.reference_id)
    setShowDropdown(false)
  }

  function closeWorkspace() {
    setEstablishedRefId(null)
    setDraft(createEmptyCabinetRouteData())
    setCandidates([])
    setMessage(null)
    setBomWarning(null)
  }

  function saveRoute() {
    if (!selectedReference || !establishedRefId) return
    startTransition(async () => {
      const result = await saveRouteDocumentAction({
        skuComplete: selectedReference.display_code,
        referenceId: establishedRefId,
        routeData: draft,
        status,
      })
      setMessage(result.message)
      if (result.success) {
        const workspace = await getCabinetRouteWorkspaceByRefAction(establishedRefId)
        if (workspace.document) setDraft(workspace.document.route_data_json)
        setCandidates(workspace.candidates)
        setBomWarning(workspace.bomWarning)
      }
    })
  }

  function importOriginalSheet(file: File | null) {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('routeData', JSON.stringify(draft))
    formData.append('skuComplete', selectedReference?.display_code ?? '')

    startTransition(async () => {
      const result = await parseOriginalCabinetRouteSheetAction(formData)
      const warnings = result.warnings.length > 0 ? ` Alertas: ${result.warnings.join(' ')}` : ''
      setMessage(`${result.message}${warnings}`)
      if (result.routeData) setDraft(reconcileCabinetRouteData(result.routeData, candidates))
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  function updateNotes(section: keyof CabinetRouteData['sections'], notes: string) {
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        [section]: {
          ...current.sections[section],
          notes,
        },
      },
    }))
  }

  function updateObservations(field: 'general_notes' | 'design_notes', value: string) {
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        observations: {
          ...current.sections.observations,
          [field]: value,
        },
      },
    }))
  }

  function updatePiece(id: string, patch: Partial<CabinetPieceRow>) {
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        pieces: {
          ...current.sections.pieces,
          rows: current.sections.pieces.rows.map(row => row.id === id ? { ...row, ...patch } : row),
        },
      },
    }))
  }

  function addManualPiece() {
    const row: CabinetPieceRow = {
      ...createManualMatchState(),
      id: newCabinetRouteId('piece'),
      source: 'manual',
      original_ref: null,
      bom_line_id: null,
      letter: '',
      piece_name: '',
      material_label: '',
      material_role: null,
      length_mm: null,
      width_mm: null,
      quantity: 1,
      edge_long_sides: 0,
      edge_short_sides: 0,
      edge_type: '',
      observation: '',
      edited_fields: [],
    }
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        pieces: {
          ...current.sections.pieces,
          rows: [...current.sections.pieces.rows, row],
        },
      },
    }))
  }

  function removePiece(id: string) {
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        pieces: {
          ...current.sections.pieces,
          rows: current.sections.pieces.rows.filter(row => row.id !== id),
        },
      },
    }))
  }

  function updateBoard(id: string, patch: Partial<CabinetBoardConsumption>) {
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        cutting: {
          ...current.sections.cutting,
          board_consumptions: current.sections.cutting.board_consumptions.map(row => row.id === id ? { ...row, ...patch } : row),
        },
      },
    }))
  }

  function addManualBoard() {
    const row: CabinetBoardConsumption = {
      id: newCabinetRouteId('cut'),
      source: 'manual',
      original_ref: null,
      material_label: '',
      thickness_mm: null,
      board_size_label: '',
      units_per_board: null,
      board_count: null,
      consumption_m2: null,
      observation: '',
      edited_fields: [],
    }
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        cutting: {
          ...current.sections.cutting,
          board_consumptions: [...current.sections.cutting.board_consumptions, row],
        },
      },
    }))
  }

  function updateMaterialRow(section: 'hardware' | 'packing', id: string, patch: Partial<CabinetRouteMaterialRow>) {
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        [section]: {
          ...current.sections[section],
          rows: current.sections[section].rows.map(row => row.id === id ? { ...row, ...patch } : row),
        },
      },
    }))
  }

  function addManualMaterial(section: 'hardware' | 'packing') {
    const row: CabinetRouteMaterialRow = {
      ...createManualMatchState(),
      id: newCabinetRouteId(section === 'hardware' ? 'hw' : 'pack'),
      source: 'manual',
      original_ref: null,
      bom_line_id: null,
      item_code: '',
      item_name: '',
      quantity: 1,
      uom: null,
      included: true,
      observation: '',
      edited_fields: [],
    }
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        [section]: {
          ...current.sections[section],
          rows: [...current.sections[section].rows, row],
        },
      },
    }))
  }

  function updateProfile(role: MaterialRole, value: string) {
    setDraft(current => ({
      ...current,
      source: {
        ...current.source,
        profiles: {
          ...current.source.profiles,
          [role]: value || null,
        },
      },
    }))
  }

  function addCandidate(candidate: CabinetBomCandidate) {
    const section = candidate.kind === 'packaging' ? 'packing' : 'hardware'
    const exists = draft.sections[section].rows.some(row => row.sap_line_id === candidate.line_id || row.item_code === candidate.item_code)
    if (exists) {
      setMessage(`${candidate.item_code} ya esta en ${section === 'packing' ? 'empaque' : 'herrajes'}.`)
      return
    }
    const row: CabinetRouteMaterialRow = {
      ...createCandidateMatchState(candidate, 'sap_only', 'use_sap'),
      id: newCabinetRouteId(section === 'packing' ? 'pack_bom' : 'hw_bom'),
      source: 'bom',
      original_ref: null,
      bom_line_id: candidate.line_id,
      item_code: candidate.item_code,
      item_name: candidate.item_name || '',
      quantity: candidate.qty,
      uom: candidate.uom,
      included: true,
      observation: '',
      edited_fields: [],
    }
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        [section]: {
          ...current.sections[section],
          rows: [...current.sections[section].rows, row],
        },
      },
    }))
  }

  function updatePackingLevel(id: string, patch: Partial<CabinetPackingLevel>) {
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        packing: {
          ...current.sections.packing,
          levels: current.sections.packing.levels.map(row => row.id === id ? { ...row, ...patch } : row),
        },
      },
    }))
  }

  function addPackingLevel() {
    const row: CabinetPackingLevel = {
      id: newCabinetRouteId('pack_level'),
      source: 'manual',
      original_ref: null,
      level: draft.sections.packing.levels.length + 1,
      piece_letters: [],
      observation: '',
      edited_fields: [],
    }
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        packing: {
          ...current.sections.packing,
          levels: [...current.sections.packing.levels, row],
        },
      },
    }))
  }

  function updateDrilling(id: string, patch: Partial<CabinetDrillingRow>) {
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        drilling: {
          ...current.sections.drilling,
          rows: current.sections.drilling.rows.map(row => row.id === id ? { ...row, ...patch } : row),
        },
      },
    }))
  }

  function addDrillingRow() {
    const row: CabinetDrillingRow = {
      id: newCabinetRouteId('drill'),
      source: 'manual',
      original_ref: null,
      piece_letter: '',
      operation: '',
      face: '',
      depth_mm: null,
      observation: '',
      edited_fields: [],
    }
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        drilling: {
          ...current.sections.drilling,
          rows: [...current.sections.drilling.rows, row],
        },
      },
    }))
  }

  function updateAssemblyStep(id: string, patch: Partial<CabinetAssemblyStep>) {
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        assembly: {
          ...current.sections.assembly,
          steps: current.sections.assembly.steps.map(row => row.id === id ? { ...row, ...patch } : row),
        },
      },
    }))
  }

  function addAssemblyStep() {
    const row: CabinetAssemblyStep = {
      id: newCabinetRouteId('step'),
      source: 'manual',
      original_ref: null,
      step_order: draft.sections.assembly.steps.length + 1,
      description: '',
      edited_fields: [],
    }
    setDraft(current => ({
      ...current,
      sections: {
        ...current.sections,
        assembly: {
          ...current.sections.assembly,
          steps: [...current.sections.assembly.steps, row],
        },
      },
    }))
  }

  function decide(section: CabinetDecisionSection, rowId: string, decision: CabinetRouteDecision) {
    setDraft(current => applyCabinetMatchDecision(current, { section, rowId, decision }))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="ref-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Buscar referencia
            </label>
            <input
              ref={searchInputRef}
              id="ref-search"
              type="text"
              placeholder="VBAN05-0001, nombre de producto..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setShowDropdown(true)
                if (!event.target.value) setSelectedReferenceId('')
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            {showDropdown && filteredReferences.length > 0 ? (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {filteredReferences.map((ref) => {
                  const isSelected = selectedReferenceId === ref.reference_id
                  return (
                    <button
                      key={ref.reference_id}
                      type="button"
                      onMouseDown={() => {
                        setSelectedReferenceId(ref.reference_id)
                        setSearchQuery(ref.display_code)
                        setShowDropdown(false)
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-indigo-50 ${isSelected ? 'bg-indigo-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-900">{ref.display_code}</span>
                        <p className="truncate text-xs text-slate-500">{ref.product_name ?? ref.designation ?? '-'}</p>
                      </div>
                      <RouteStatusBadge status={ref.route_status} />
                    </button>
                  )
                })}
              </div>
            ) : showDropdown && searchQuery.trim() ? (
              <div className="absolute left-0 right-0 z-20 mt-1 rounded-md border border-slate-200 bg-white p-3 text-center text-sm text-slate-500 shadow-lg">
                Sin resultados
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={establishRoute}
            disabled={!selectedReference || isPending}
            className="h-fit shrink-0 rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Establecer hoja de ruta
          </button>
          {establishedRefId ? (
            <button
              type="button"
              onClick={closeWorkspace}
              className="h-fit shrink-0 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
            >
              Cerrar
            </button>
          ) : null}
        </div>
        {!establishedRefId ? (
          <p className="mt-3 text-xs text-slate-500">
            {initialReferences.length} referencia(s) con LdM publicada. Selecciona una y presiona &quot;Establecer hoja de ruta&quot; para empezar.
          </p>
        ) : null}
      </div>

      {establishedRefId && selectedReference ? (
        <div ref={workspaceRef} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <SectionCard title="Fuentes" description="BOM leida directamente de product_bom_structure.">
              <Metric label="Referencia" value={draft.source.reference_code || selectedReference.display_code} />
              <div className="mt-2">
                <Metric label="Estado hoja de ruta" value={REFERENCE_STATUS_LABELS[status] ?? status} />
              </div>
            </SectionCard>
            <SectionCard title="BOM" description="Candidatos disponibles desde la estructura publicada.">
              <Metric label="Lineas en BOM" value={String(selectedReference.bom_line_count)} />
              <div className="mt-2">
                <Metric label="Candidatos activos" value={String(candidates.length)} />
              </div>
            </SectionCard>
            <SectionCard title="Perfiles" description="Perfil de material por rol (con fallback a Structure).">
              {MATERIAL_ROLES.map(role => {
                const direct = draft.source.profiles?.[role]
                const resolved = resolveProfileForRole(role, draft.source.profiles ?? { structure: null, inner_structure: null, front: null, drawer_bottom: null })
                const isFallback = !direct && !!resolved
                return (
                  <div key={role} className="mt-2 first:mt-0">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{MATERIAL_ROLE_LABELS[role]}</label>
                    <div className="flex items-center gap-1">
                      <select
                        value={direct ?? ''}
                        onChange={(e) => updateProfile(role, e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-400"
                      >
                        <option value="">----</option>
                        {PROFILE_OPTIONS.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      {isFallback ? (
                        <span className="shrink-0 text-[10px] text-slate-400" title={`Heredado de Structure: ${resolved}`}>
                          ({resolved})
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </SectionCard>
            <SectionCard title="Area & Canto" description="Por rol y total acumulado.">
              <Metric label="Area m2 total" value={formatNumber(totalAreaM2)} />
              <div className="mt-2">
                <Metric label="Canto m total" value={formatNumber(totalEdgeMeters)} />
              </div>
            </SectionCard>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documento por referencia</p>
                <h2 className="text-lg font-semibold text-slate-900">{draft.source.reference_code || selectedReference.display_code}</h2>
                <p className="text-xs text-slate-500">Referencia base | BOM schema V2</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as CabinetRouteStatus)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {CABINET_ROUTE_STATUSES.map(routeStatus => (
                    <option key={routeStatus} value={routeStatus}>{STATUS_LABELS[routeStatus]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={saveRoute}
                  disabled={isPending}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Guardar ruta
                </button>
              </div>
            </div>
            {message ? <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
          </div>

          <label className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hoja original Excel</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={(event) => importOriginalSheet(event.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
            />
            {draft.source.original_sheet ? (
              <p className="mt-2 text-xs text-slate-600">
                Ultima hoja: <span className="font-semibold">{draft.source.original_sheet.file_name}</span>
              </p>
            ) : null}
            {bomWarning ? (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{bomWarning}</p>
            ) : null}
          </label>

          <ReconciliationPanel issues={matchReport.issues} summary={matchReport.summary} onDecide={decide} />

          <PiecesByRoleEditor
            piecesByRole={piecesByRole}
            areaByRole={areaByRole}
            edgeByRole={edgeByRole}
            profiles={draft.source.profiles ?? { structure: null, inner_structure: null, front: null, drawer_bottom: null }}
            notes={draft.sections.pieces.notes}
            onNotesChange={(value) => updateNotes('pieces', value)}
            onAdd={addManualPiece}
            onRemove={removePiece}
            onUpdate={updatePiece}
            onUpdateProfile={updateProfile}
          />

          <CuttingEditor
            rows={draft.sections.cutting.board_consumptions}
            notes={draft.sections.cutting.notes}
            edgingNotes={draft.sections.edging.notes}
            onNotesChange={(value) => updateNotes('cutting', value)}
            onEdgingNotesChange={(value) => updateNotes('edging', value)}
            onAdd={addManualBoard}
            onUpdate={updateBoard}
          />

          <MaterialEditor
            title="Herrajes"
            description="Solo filas aceptadas por conciliacion o agregadas manualmente. Pendientes quedan en el panel SAP vs hoja."
            rows={operationalHardwareRows}
            notes={draft.sections.hardware.notes}
            onNotesChange={(value) => updateNotes('hardware', value)}
            onAdd={() => addManualMaterial('hardware')}
            onUpdate={(id, patch) => updateMaterialRow('hardware', id, patch)}
          />

          <ProcessEditor
            drillingRows={draft.sections.drilling.rows}
            drillingNotes={draft.sections.drilling.notes}
            assemblySteps={draft.sections.assembly.steps}
            assemblyNotes={draft.sections.assembly.notes}
            onDrillingNotesChange={(value) => updateNotes('drilling', value)}
            onAssemblyNotesChange={(value) => updateNotes('assembly', value)}
            onAddDrilling={addDrillingRow}
            onUpdateDrilling={updateDrilling}
            onAddAssembly={addAssemblyStep}
            onUpdateAssembly={updateAssemblyStep}
          />

          <PackingEditor
            rows={operationalPackingRows}
            levels={draft.sections.packing.levels}
            notes={draft.sections.packing.notes}
            onNotesChange={(value) => updateNotes('packing', value)}
            onAddMaterial={() => addManualMaterial('packing')}
            onUpdateMaterial={(id, patch) => updateMaterialRow('packing', id, patch)}
            onAddLevel={addPackingLevel}
            onUpdateLevel={updatePackingLevel}
          />

          <SectionCard title="Observaciones" description="Notas generales visibles para diseno y produccion.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas generales</span>
                <TextArea value={draft.sections.observations.general_notes} onChange={(value) => updateObservations('general_notes', value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas de diseno / importacion</span>
                <TextArea value={draft.sections.observations.design_notes} onChange={(value) => updateObservations('design_notes', value)} />
              </label>
            </div>
          </SectionCard>

          <CandidatesPanel candidates={candidates} onAddCandidate={addCandidate} />
        </div>
      ) : null}
    </div>
  )
}

function ReconciliationPanel({
  issues,
  summary,
  onDecide,
}: {
  issues: CabinetMatchIssue[]
  summary: ReturnType<typeof buildCabinetRouteMatchReport>['summary']
  onDecide: (section: CabinetDecisionSection, rowId: string, decision: CabinetRouteDecision) => void
}) {
  const materialIssues = useMemo(() => issues.filter(i => i.section !== 'pieces'), [issues])
  return (
    <SectionCard title="Conciliacion SAP vs hoja" description="Diferencias en herrajes y empaque. Piezas CMPD09 se gestionan por rol (sin conciliacion).">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Coincide" value={String(summary.matched)} />
        <Metric label="Posibles" value={String(summary.possible_match)} />
        <Metric label="Solo SAP" value={String(summary.sap_only)} />
        <Metric label="Pendientes" value={String(summary.pending_decisions)} />
      </div>
      <div className="mt-3 max-h-[520px] overflow-auto rounded-md border border-slate-200">
        {materialIssues.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">Sin diferencias en herrajes o empaque. Las piezas se gestionan por rol de material.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {materialIssues.map((issue, index) => {
              const decisionSection = getDecisionSection(issue)
              return (
                <li key={`${issue.type}-${issue.row_id ?? index}`} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{issue.label}</p>
                      <p className={issue.severity === 'warning' ? 'text-amber-700' : 'text-slate-500'}>{issue.detail}</p>
                      {issue.possible_matches[0] ? (
                        <p className="mt-1 text-slate-500">
                          Sugerido: {issue.possible_matches[0].item_code} | {issue.possible_matches[0].item_name || '-'} | score {formatNumber(issue.possible_matches[0].score, 2)}
                        </p>
                      ) : null}
                    </div>
                    {issue.type !== 'missing_piece_detail' ? <MatchBadge status={issue.type} /> : null}
                  </div>
                  {issue.row_id && decisionSection ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(issue.type === 'sap_only' || issue.type === 'possible_match' || issue.type === 'quantity_mismatch') ? (
                        <SmallActionButton onClick={() => onDecide(decisionSection, issue.row_id || '', 'use_sap')}>Usar SAP</SmallActionButton>
                      ) : null}
                      {(issue.type === 'sheet_only' || issue.type === 'possible_match' || issue.type === 'quantity_mismatch') ? (
                        <SmallActionButton onClick={() => onDecide(decisionSection, issue.row_id || '', 'use_sheet')}>Usar hoja</SmallActionButton>
                      ) : null}
                      <SmallActionButton onClick={() => onDecide(decisionSection, issue.row_id || '', 'use_custom')}>Custom</SmallActionButton>
                      <SmallActionButton tone="danger" onClick={() => onDecide(decisionSection, issue.row_id || '', 'ignore')}>Ignorar</SmallActionButton>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}

function SmallActionButton({
  children,
  onClick,
  tone = 'default',
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}
    >
      {children}
    </button>
  )
}

function getDecisionSection(issue: CabinetMatchIssue): CabinetDecisionSection | null {
  if (issue.section === 'pieces' || issue.section === 'hardware' || issue.section === 'packing') return issue.section
  return null
}

function PiecesByRoleEditor({
  piecesByRole,
  areaByRole,
  edgeByRole,
  profiles,
  notes,
  onNotesChange,
  onAdd,
  onRemove,
  onUpdate,
  onUpdateProfile,
}: {
  piecesByRole: Partial<Record<MaterialRole, CabinetPieceRow[]>>
  areaByRole: Partial<Record<MaterialRole, number>>
  edgeByRole: Partial<Record<MaterialRole, number>>
  profiles: CabinetProfilesByRole
  notes: string
  onNotesChange: (value: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<CabinetPieceRow>) => void
  onUpdateProfile: (role: MaterialRole, value: string) => void
}) {
  return (
    <SectionCard title="Piezas / despiece" description="Piezas CMPD09 agrupadas por rol de material. Las piezas BOM se muestran sin decisiones de conciliacion (Fase 4).">
      <TextArea value={notes} placeholder="Notas de despiece" onChange={onNotesChange} />
      {MATERIAL_ROLES.map(role => {
        const rows = piecesByRole[role] ?? []
        const area = areaByRole[role] ?? 0
        const edge = edgeByRole[role] ?? 0
        const direct = profiles[role]
        const resolved = resolveProfileForRole(role, profiles)
        const isFallback = !direct && !!resolved
        if (rows.length === 0) return null

        return (
          <div key={role} className="mt-4 first:mt-0">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-900">{MATERIAL_ROLE_LABELS[role]}</h3>
              <div className="flex items-center gap-1">
                <select
                  value={direct ?? ''}
                  onChange={(e) => onUpdateProfile(role, e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                >
                  <option value="">----</option>
                  {PROFILE_OPTIONS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {isFallback ? (
                  <span className="text-[10px] text-slate-400">({resolved})</span>
                ) : null}
              </div>
              <span className="text-[11px] text-slate-500">
                Area: <strong>{formatNumber(area)} m²</strong>
              </span>
              <span className="text-[11px] text-slate-500">
                Canto: <strong>{formatNumber(edge)} m</strong>
              </span>
              <span className="text-[11px] text-slate-500">
                Piezas: <strong>{rows.length}</strong>
              </span>
            </div>
            <div className="overflow-auto rounded-md border border-slate-200">
              <table className="min-w-[960px] w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-2 py-2">Letra</th>
                    <th className="px-2 py-2">Pieza</th>
                    <th className="px-2 py-2">Material</th>
                    <th className="px-2 py-2">Largo</th>
                    <th className="px-2 py-2">Ancho</th>
                    <th className="px-2 py-2">Cant.</th>
                    <th className="px-2 py-2">Canto L/A</th>
                    <th className="px-2 py-2">m canto</th>
                    <th className="px-2 py-2">Obs.</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-2"><TextInput value={row.letter} onChange={(value) => onUpdate(row.id, { letter: value })} /></td>
                      <td className="px-2 py-2"><TextInput value={row.piece_name} onChange={(value) => onUpdate(row.id, { piece_name: value })} /></td>
                      <td className="px-2 py-2"><TextInput value={row.material_label} onChange={(value) => onUpdate(row.id, { material_label: value })} /></td>
                      <td className="px-2 py-2"><NumberInput value={row.length_mm} min={0} onChange={(value) => onUpdate(row.id, { length_mm: value })} /></td>
                      <td className="px-2 py-2"><NumberInput value={row.width_mm} min={0} onChange={(value) => onUpdate(row.id, { width_mm: value })} /></td>
                      <td className="px-2 py-2"><NumberInput value={row.quantity} min={0} onChange={(value) => onUpdate(row.id, { quantity: value ?? 0 })} /></td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <NumberInput value={row.edge_long_sides} min={0} onChange={(value) => onUpdate(row.id, { edge_long_sides: value ?? 0 })} />
                          <NumberInput value={row.edge_short_sides} min={0} onChange={(value) => onUpdate(row.id, { edge_short_sides: value ?? 0 })} />
                        </div>
                      </td>
                      <td className="px-2 py-2 font-mono">{formatNumber(calculatePieceEdgeMeters(row))}</td>
                      <td className="px-2 py-2"><TextInput value={row.observation} onChange={(value) => onUpdate(row.id, { observation: value })} /></td>
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => onRemove(row.id)} className="text-xs font-semibold text-rose-600">Quitar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      {MATERIAL_ROLES.every(role => (piecesByRole[role] ?? []).length === 0) ? (
        <div className="mt-3 rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Sin piezas CMPD09 en la BOM de esta referencia.
        </div>
      ) : null}
      <button type="button" onClick={onAdd} className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
        Agregar pieza manual
      </button>
    </SectionCard>
  )
}

function CuttingEditor({
  rows,
  notes,
  edgingNotes,
  onNotesChange,
  onEdgingNotesChange,
  onAdd,
  onUpdate,
}: {
  rows: CabinetBoardConsumption[]
  notes: string
  edgingNotes: string
  onNotesChange: (value: string) => void
  onEdgingNotesChange: (value: string) => void
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<CabinetBoardConsumption>) => void
}) {
  return (
    <SectionCard title="Corte y canto" description="Consumos de tableros y notas de canto; no modifica la BOM.">
      <div className="grid gap-4 md:grid-cols-2">
        <TextArea value={notes} placeholder="Notas de corte" onChange={onNotesChange} />
        <TextArea value={edgingNotes} placeholder="Notas de canto" onChange={onEdgingNotesChange} />
      </div>
      <div className="mt-3 overflow-auto rounded-md border border-slate-200">
        <table className="min-w-[760px] w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-2 py-2">Material</th>
              <th className="px-2 py-2">Espesor</th>
              <th className="px-2 py-2">Formato</th>
              <th className="px-2 py-2">Unid/tablero</th>
              <th className="px-2 py-2">Laminas</th>
              <th className="px-2 py-2">m2</th>
              <th className="px-2 py-2">Obs.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-2 py-2"><TextInput value={row.material_label} onChange={(value) => onUpdate(row.id, { material_label: value })} /></td>
                <td className="px-2 py-2"><NumberInput value={row.thickness_mm} min={0} onChange={(value) => onUpdate(row.id, { thickness_mm: value })} /></td>
                <td className="px-2 py-2"><TextInput value={row.board_size_label} onChange={(value) => onUpdate(row.id, { board_size_label: value })} /></td>
                <td className="px-2 py-2"><NumberInput value={row.units_per_board} min={0} onChange={(value) => onUpdate(row.id, { units_per_board: value })} /></td>
                <td className="px-2 py-2"><NumberInput value={row.board_count} min={0} onChange={(value) => onUpdate(row.id, { board_count: value })} /></td>
                <td className="px-2 py-2"><NumberInput value={row.consumption_m2} min={0} step="0.001" onChange={(value) => onUpdate(row.id, { consumption_m2: value })} /></td>
                <td className="px-2 py-2"><TextInput value={row.observation} onChange={(value) => onUpdate(row.id, { observation: value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={onAdd} className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
        Agregar consumo manual
      </button>
    </SectionCard>
  )
}

function MaterialEditor({
  title,
  description,
  rows,
  notes,
  onNotesChange,
  onAdd,
  onUpdate,
}: {
  title: string
  description: string
  rows: CabinetRouteMaterialRow[]
  notes: string
  onNotesChange: (value: string) => void
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<CabinetRouteMaterialRow>) => void
}) {
  return (
    <SectionCard title={title} description={description}>
      <TextArea value={notes} onChange={onNotesChange} />
      <MaterialRowsTable rows={rows} onUpdate={onUpdate} />
      <button type="button" onClick={onAdd} className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
        Agregar fila manual
      </button>
    </SectionCard>
  )
}

function MaterialRowsTable({
  rows,
  onUpdate,
}: {
  rows: CabinetRouteMaterialRow[]
  onUpdate: (id: string, patch: Partial<CabinetRouteMaterialRow>) => void
}) {
  return (
    <div className="mt-3 overflow-auto rounded-md border border-slate-200">
      <table className="min-w-[860px] w-full text-left text-xs">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="px-2 py-2">Coincidencia</th>
            <th className="px-2 py-2">Usar</th>
            <th className="px-2 py-2">Codigo</th>
            <th className="px-2 py-2">Item</th>
            <th className="px-2 py-2">Cant.</th>
            <th className="px-2 py-2">UM</th>
            <th className="px-2 py-2">Obs.</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-slate-500" colSpan={7}>Sin filas aceptadas todavia.</td>
            </tr>
          ) : rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="px-2 py-2"><MatchBadge status={row.match_status} /></td>
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={row.included}
                  onChange={(event) => onUpdate(row.id, { included: event.target.checked })}
                />
              </td>
              <td className="px-2 py-2"><TextInput value={row.item_code} onChange={(value) => onUpdate(row.id, { item_code: value })} /></td>
              <td className="px-2 py-2"><TextInput value={row.item_name} onChange={(value) => onUpdate(row.id, { item_name: value })} /></td>
              <td className="px-2 py-2"><NumberInput value={row.quantity} min={0} step="0.001" onChange={(value) => onUpdate(row.id, { quantity: value ?? 0 })} /></td>
              <td className="px-2 py-2"><TextInput value={row.uom ?? ''} onChange={(value) => onUpdate(row.id, { uom: value || null })} /></td>
              <td className="px-2 py-2"><TextInput value={row.observation} onChange={(value) => onUpdate(row.id, { observation: value })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProcessEditor({
  drillingRows,
  drillingNotes,
  assemblySteps,
  assemblyNotes,
  onDrillingNotesChange,
  onAssemblyNotesChange,
  onAddDrilling,
  onUpdateDrilling,
  onAddAssembly,
  onUpdateAssembly,
}: {
  drillingRows: CabinetDrillingRow[]
  drillingNotes: string
  assemblySteps: CabinetAssemblyStep[]
  assemblyNotes: string
  onDrillingNotesChange: (value: string) => void
  onAssemblyNotesChange: (value: string) => void
  onAddDrilling: () => void
  onUpdateDrilling: (id: string, patch: Partial<CabinetDrillingRow>) => void
  onAddAssembly: () => void
  onUpdateAssembly: (id: string, patch: Partial<CabinetAssemblyStep>) => void
}) {
  return (
    <SectionCard title="Perforacion y ensamble" description="Operaciones que no vienen de SAP y quedan bajo control de diseno.">
      <div className="grid gap-4 md:grid-cols-2">
        <TextArea value={drillingNotes} placeholder="Notas de perforacion" onChange={onDrillingNotesChange} />
        <TextArea value={assemblyNotes} placeholder="Notas de ensamble" onChange={onAssemblyNotesChange} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Perforacion</h3>
            <button type="button" onClick={onAddDrilling} className="text-xs font-semibold text-indigo-700">Agregar</button>
          </div>
          <div className="space-y-2">
            {drillingRows.map((row) => (
              <div key={row.id} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-5">
                <TextInput value={row.piece_letter} placeholder="Letra" onChange={(value) => onUpdateDrilling(row.id, { piece_letter: value })} />
                <TextInput value={row.operation} placeholder="Operacion" onChange={(value) => onUpdateDrilling(row.id, { operation: value })} className="md:col-span-2" />
                <TextInput value={row.face} placeholder="Cara/lado" onChange={(value) => onUpdateDrilling(row.id, { face: value })} />
                <NumberInput value={row.depth_mm} min={0} onChange={(value) => onUpdateDrilling(row.id, { depth_mm: value })} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Ensamble</h3>
            <button type="button" onClick={onAddAssembly} className="text-xs font-semibold text-indigo-700">Agregar</button>
          </div>
          <div className="space-y-2">
            {assemblySteps.map((step) => (
              <div key={step.id} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-[80px_1fr]">
                <NumberInput value={step.step_order} min={1} onChange={(value) => onUpdateAssembly(step.id, { step_order: value ?? 1 })} />
                <TextInput value={step.description} placeholder="Paso de ensamble" onChange={(value) => onUpdateAssembly(step.id, { description: value })} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

function PackingEditor({
  rows,
  levels,
  notes,
  onNotesChange,
  onAddMaterial,
  onUpdateMaterial,
  onAddLevel,
  onUpdateLevel,
}: {
  rows: CabinetRouteMaterialRow[]
  levels: CabinetPackingLevel[]
  notes: string
  onNotesChange: (value: string) => void
  onAddMaterial: () => void
  onUpdateMaterial: (id: string, patch: Partial<CabinetRouteMaterialRow>) => void
  onAddLevel: () => void
  onUpdateLevel: (id: string, patch: Partial<CabinetPackingLevel>) => void
}) {
  return (
    <SectionCard title="Empaque" description="Materiales aceptados y tetris/niveles de piezas.">
      <TextArea value={notes} onChange={onNotesChange} />
      <MaterialRowsTable rows={rows} onUpdate={onUpdateMaterial} />
      <button type="button" onClick={onAddMaterial} className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
        Agregar material de empaque
      </button>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Niveles / tetris</h3>
          <button type="button" onClick={onAddLevel} className="text-xs font-semibold text-indigo-700">Agregar nivel</button>
        </div>
        <div className="space-y-2">
          {levels.map((level) => (
            <div key={level.id} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-[80px_1fr_1fr]">
              <NumberInput value={level.level} min={1} onChange={(value) => onUpdateLevel(level.id, { level: value ?? 1 })} />
              <TextInput
                value={level.piece_letters.join(' - ')}
                placeholder="A - B - C"
                onChange={(value) => onUpdateLevel(level.id, { piece_letters: value.toUpperCase().match(/[A-Z]+/g) ?? [] })}
              />
              <TextInput value={level.observation} placeholder="Observacion" onChange={(value) => onUpdateLevel(level.id, { observation: value })} />
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

function CandidatesPanel({
  candidates,
  onAddCandidate,
}: {
  candidates: CabinetBomCandidate[]
  onAddCandidate: (candidate: CabinetBomCandidate) => void
}) {
  const descriptionText = (c: CabinetBomCandidate): string => {
    if (c.item_name && c.item_name !== c.item_code) return c.item_name
    return c.item_code || '-'
  }
  return (
    <SectionCard title="Candidatos desde BOM SAP" description="Lineas leidas directamente de product_bom_structure; los nombres se resuelven desde component_items.">
      <div className="max-h-80 overflow-auto rounded-md border border-slate-200">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Codigo</th>
              <th className="px-3 py-2">Descripcion</th>
              <th className="px-3 py-2">Cant.</th>
              <th className="px-3 py-2">Alcance</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate.line_id} className="border-t border-slate-100">
                <td className="px-3 py-2 capitalize">{candidate.kind}</td>
                <td className="px-3 py-2 font-mono">{candidate.item_code}</td>
                <td className="px-3 py-2 max-w-[260px] truncate" title={descriptionText(candidate)}>
                  {descriptionText(candidate)}
                </td>
                <td className="px-3 py-2">{candidate.qty} {candidate.uom || ''}</td>
                <td className="px-3 py-2 text-slate-500">{candidate.scope}</td>
                <td className="px-3 py-2">
                  {candidate.kind === 'hardware' || candidate.kind === 'packaging' ? (
                    <button type="button" onClick={() => onAddCandidate(candidate)} className="text-xs font-semibold text-indigo-700">
                      Agregar
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
