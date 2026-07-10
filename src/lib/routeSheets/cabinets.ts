import type { ComponentCategory, ResolvedBomLine } from '@/lib/bom/types'

export const CABINET_ROUTE_SCHEMA_VERSION = 3
export const CABINET_ROUTE_PARSER_VERSION = 2

export const CABINET_ROUTE_STATUSES = ['draft', 'review', 'approved', 'archived'] as const
export type CabinetRouteStatus = (typeof CABINET_ROUTE_STATUSES)[number]

export type CabinetRouteSource = 'bom' | 'original_sheet' | 'manual'
export type CabinetBomSourceMode = 'expanded' | 'direct'
export type CabinetBomCandidateKind = 'material' | 'hardware' | 'packaging' | 'other'
export type CabinetMatchStatus =
  | 'matched'
  | 'possible_match'
  | 'sap_only'
  | 'sheet_only'
  | 'quantity_mismatch'
  | 'manual'
  | 'ignored'
export type CabinetRouteDecision = 'use_sap' | 'use_sheet' | 'use_custom' | 'ignore' | 'pending'

export type CabinetBomLine = ResolvedBomLine & {
  reference_id?: string | null
  version_id?: string | null
  parent_line_id?: string | null
  root_line_id?: string | null
  sort_path?: string | null
  effective_qty?: number | null
  is_cycle?: boolean | null
  component_category: ComponentCategory | null
}

export type CabinetBomCandidate = {
  line_id: string
  parent_line_id: string | null
  root_line_id: string | null
  sort_order: number
  sort_path: string | null
  level: number
  kind: CabinetBomCandidateKind
  item_code: string
  item_name: string | null
  qty: number
  direct_qty: number
  effective_qty: number
  uom: string | null
  scope: string
  category: ComponentCategory | null
  resolution_status: string
  parent_item_code: string | null
  source_mode: CabinetBomSourceMode
}

export type CabinetPossibleMatch = {
  line_id: string
  item_code: string
  item_name: string | null
  qty: number
  uom: string | null
  kind: CabinetBomCandidateKind
  score: number
  reason: string
  level: number
  parent_item_code: string | null
}

export type CabinetMatchFields = {
  match_status: CabinetMatchStatus
  decision: CabinetRouteDecision
  sap_line_id: string | null
  sap_item_code: string | null
  sap_item_name: string | null
  sap_qty: number | null
  sap_level: number | null
  sap_parent_item_code: string | null
  sheet_item_code: string | null
  sheet_item_name: string | null
  sheet_qty: number | null
  sheet_observation: string
  match_score: number | null
  possible_matches: CabinetPossibleMatch[]
}

export type CabinetRouteSourceDocument = {
  file_name: string
  parsed_at: string
  parser_version: number
  warnings: string[]
}

export type CabinetRouteSourceState = {
  sku_complete: string | null
  analysis_sku_complete: string | null
  reference_code: string | null
  reference_id: string | null
  version_id: string | null
  updated_at: string | null
  bom_line_count: number
  missing_bom_count: number
  bom_source_mode: CabinetBomSourceMode | null
  bom_warning: string | null
  original_sheet: CabinetRouteSourceDocument | null
}

export type CabinetPieceRow = CabinetMatchFields & {
  id: string
  source: CabinetRouteSource
  original_ref: string | null
  bom_line_id: string | null
  letter: string
  piece_name: string
  material_label: string
  length_mm: number | null
  width_mm: number | null
  quantity: number
  edge_long_sides: number
  edge_short_sides: number
  edge_type: string
  observation: string
  edited_fields: string[]
}

export type CabinetBoardConsumption = {
  id: string
  source: CabinetRouteSource
  original_ref: string | null
  material_label: string
  thickness_mm: number | null
  board_size_label: string
  units_per_board: number | null
  board_count: number | null
  consumption_m2: number | null
  observation: string
  edited_fields: string[]
}

export type CabinetDrillingRow = {
  id: string
  source: CabinetRouteSource
  original_ref: string | null
  piece_letter: string
  operation: string
  face: string
  depth_mm: number | null
  observation: string
  edited_fields: string[]
}

export type CabinetRouteMaterialRow = CabinetMatchFields & {
  id: string
  source: CabinetRouteSource
  original_ref: string | null
  bom_line_id: string | null
  item_code: string
  item_name: string
  quantity: number
  uom: string | null
  included: boolean
  observation: string
  edited_fields: string[]
}

export type CabinetAssemblyStep = {
  id: string
  source: CabinetRouteSource
  original_ref: string | null
  step_order: number
  description: string
  edited_fields: string[]
}

export type CabinetPackingLevel = {
  id: string
  source: CabinetRouteSource
  original_ref: string | null
  level: number
  piece_letters: string[]
  observation: string
  edited_fields: string[]
}

export type CabinetRouteData = {
  schema_version: typeof CABINET_ROUTE_SCHEMA_VERSION
  source: CabinetRouteSourceState
  sections: {
    pieces: {
      notes: string
      rows: CabinetPieceRow[]
    }
    cutting: {
      notes: string
      board_consumptions: CabinetBoardConsumption[]
    }
    edging: {
      notes: string
    }
    drilling: {
      notes: string
      rows: CabinetDrillingRow[]
    }
    hardware: {
      notes: string
      rows: CabinetRouteMaterialRow[]
    }
    assembly: {
      notes: string
      steps: CabinetAssemblyStep[]
    }
    packing: {
      notes: string
      rows: CabinetRouteMaterialRow[]
      levels: CabinetPackingLevel[]
    }
    observations: {
      general_notes: string
      design_notes: string
    }
  }
}

export type CabinetRouteImportDraft = {
  pieces: CabinetPieceRow[]
  board_consumptions: CabinetBoardConsumption[]
  hardware_rows: CabinetRouteMaterialRow[]
  packing_rows: CabinetRouteMaterialRow[]
  packing_levels: CabinetPackingLevel[]
  observations: string[]
  warnings: string[]
}

export type CabinetMatchIssue = {
  type: CabinetMatchStatus | 'missing_piece_detail'
  severity: 'info' | 'warning'
  section: 'pieces' | 'hardware' | 'packing' | 'bom'
  row_id: string | null
  label: string
  detail: string
  item_code: string | null
  bom_line_id: string | null
  decision: CabinetRouteDecision | null
  possible_matches: CabinetPossibleMatch[]
}

export type CabinetRouteMatchReport = {
  summary: {
    matched: number
    possible_match: number
    sap_only: number
    sheet_only: number
    quantity_mismatches: number
    manual: number
    ignored: number
    pending_decisions: number
    missing_piece_details: number
  }
  issues: CabinetMatchIssue[]
}

export type CabinetDecisionSection = 'pieces' | 'hardware' | 'packing'

type JsonRecord = Record<string, unknown>
type MatchResult =
  | { type: 'exact'; candidate: CabinetBomCandidate; score: number; reason: string }
  | { type: 'possible'; candidate: CabinetBomCandidate; score: number; reason: string }
  | null

const EMPTY_SOURCE_STATE: CabinetRouteSourceState = {
  sku_complete: null,
  analysis_sku_complete: null,
  reference_code: null,
  reference_id: null,
  version_id: null,
  updated_at: null,
  bom_line_count: 0,
  missing_bom_count: 0,
  bom_source_mode: null,
  bom_warning: null,
  original_sheet: null,
}

const LOW_SIGNAL_TOKENS = new Set([
  'A',
  'AL',
  'CON',
  'DE',
  'DEL',
  'EL',
  'EN',
  'LA',
  'LAS',
  'LOS',
  'PARA',
  'POR',
  'UN',
  'UNA',
  'MUEBLE',
  'MUEBLES',
  'CAJA',
  'CAJAS',
  'CALIBRE',
  'CAL',
  'MM',
  'CM',
  'MT',
  'M',
])

const CABINET_PIECE_NAME_PATTERN =
  /\b(BASE|LATERAL|COSTADO|PUERTA|FRENTE|FONDO|ESPALDAR|REPISA|ENTREPANO|DIVISION|DIVISOR|PANEL|PISO|TECHO|TRAVESANO|FALDON|CAJON|TAPA|TAPETA|SOBRE|CUBIERTA|REFUERZO)\b/

const RAW_MATERIAL_NAME_PATTERN =
  /\b(TABLERO|CANTO|CANTOS|LAMINA|LAMINADO|MELAMINA|MDP|MDF|AGLOMERADO|FORMICA|PVC|ROLLO|CHAPA|ENCHAPE|PEGANTE|ADHESIVO|BORDE|PERFIL)\b/

const MATCH_STATUSES: CabinetMatchStatus[] = [
  'matched',
  'possible_match',
  'sap_only',
  'sheet_only',
  'quantity_mismatch',
  'manual',
  'ignored',
]

const ROUTE_DECISIONS: CabinetRouteDecision[] = ['use_sap', 'use_sheet', 'use_custom', 'ignore', 'pending']

export function createEmptyCabinetRouteData(): CabinetRouteData {
  return {
    schema_version: CABINET_ROUTE_SCHEMA_VERSION,
    source: { ...EMPTY_SOURCE_STATE },
    sections: {
      pieces: { notes: '', rows: [] },
      cutting: { notes: '', board_consumptions: [] },
      edging: { notes: '' },
      drilling: { notes: '', rows: [] },
      hardware: { notes: '', rows: [] },
      assembly: { notes: '', steps: [] },
      packing: { notes: '', rows: [], levels: [] },
      observations: { general_notes: '', design_notes: '' },
    },
  }
}

export function newCabinetRouteId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function isCabinetRouteStatus(value: string): value is CabinetRouteStatus {
  return CABINET_ROUTE_STATUSES.includes(value as CabinetRouteStatus)
}

export function createManualMatchState(): CabinetMatchFields {
  return {
    match_status: 'manual',
    decision: 'use_custom',
    sap_line_id: null,
    sap_item_code: null,
    sap_item_name: null,
    sap_qty: null,
    sap_level: null,
    sap_parent_item_code: null,
    sheet_item_code: null,
    sheet_item_name: null,
    sheet_qty: null,
    sheet_observation: '',
    match_score: null,
    possible_matches: [],
  }
}

export function createSheetMatchState(input: {
  itemCode: string | null
  itemName: string | null
  quantity: number | null
  observation: string
}): CabinetMatchFields {
  return {
    ...createManualMatchState(),
    match_status: 'sheet_only',
    decision: 'pending',
    sheet_item_code: input.itemCode,
    sheet_item_name: input.itemName,
    sheet_qty: input.quantity,
    sheet_observation: input.observation,
  }
}

export function createCandidateMatchState(
  candidate: CabinetBomCandidate,
  matchStatus: CabinetMatchStatus = 'sap_only',
  decision: CabinetRouteDecision = 'pending'
): CabinetMatchFields {
  return {
    ...createManualMatchState(),
    match_status: matchStatus,
    decision,
    sap_line_id: candidate.line_id,
    sap_item_code: candidate.item_code,
    sap_item_name: candidate.item_name,
    sap_qty: candidate.qty,
    sap_level: candidate.level,
    sap_parent_item_code: candidate.parent_item_code,
    match_score: matchStatus === 'matched' || matchStatus === 'quantity_mismatch' ? 1 : null,
  }
}

export function normalizeCabinetRouteData(value: unknown): CabinetRouteData {
  const record = asRecord(value)
  const normalized = createEmptyCabinetRouteData()
  const sections = asRecord(record.sections)

  normalized.source = normalizeSourceState(record.source)
  normalized.sections.pieces = {
    notes: readString(asRecord(sections.pieces).notes) || readString(record.pieces_text) || '',
    rows: readArray(asRecord(sections.pieces).rows).map(normalizePieceRow),
  }
  normalized.sections.cutting = {
    notes: readString(asRecord(sections.cutting).notes) || readString(record.cutting_notes) || '',
    board_consumptions: readArray(asRecord(sections.cutting).board_consumptions).map(normalizeBoardConsumption),
  }
  normalized.sections.edging = {
    notes: readString(asRecord(sections.edging).notes) || readString(record.edging_notes) || '',
  }
  normalized.sections.drilling = {
    notes: readString(asRecord(sections.drilling).notes) || readString(record.drilling_notes) || '',
    rows: readArray(asRecord(sections.drilling).rows).map(normalizeDrillingRow),
  }
  normalized.sections.hardware = {
    notes: readString(asRecord(sections.hardware).notes) || '',
    rows: readArray(asRecord(sections.hardware).rows).map(normalizeMaterialRow),
  }
  normalized.sections.assembly = {
    notes: readString(asRecord(sections.assembly).notes) || '',
    steps: readArray(asRecord(sections.assembly).steps).map(normalizeAssemblyStep),
  }
  normalized.sections.packing = {
    notes: readString(asRecord(sections.packing).notes) || readString(record.packing_notes) || readString(record.tetris_notes) || '',
    rows: readArray(asRecord(sections.packing).rows).map(normalizeMaterialRow),
    levels: readArray(asRecord(sections.packing).levels).map(normalizePackingLevel),
  }
  normalized.sections.observations = {
    general_notes: readString(asRecord(sections.observations).general_notes) || readString(record.general_notes) || '',
    design_notes: readString(asRecord(sections.observations).design_notes) || '',
  }

  return normalized
}

export function withCabinetRouteSource(
  routeData: CabinetRouteData,
  input: {
    analysisSkuComplete: string
    referenceId: string
    referenceCode: string | null
    bomLineCount: number
    missingBomCount: number
    bomSourceMode: CabinetBomSourceMode
    bomWarning: string | null
  }
): CabinetRouteData {
  return {
    ...routeData,
    schema_version: CABINET_ROUTE_SCHEMA_VERSION,
    source: {
      ...routeData.source,
      sku_complete: input.analysisSkuComplete,
      analysis_sku_complete: input.analysisSkuComplete,
      reference_id: input.referenceId,
      reference_code: input.referenceCode,
      version_id: null,
      updated_at: new Date().toISOString(),
      bom_line_count: input.bomLineCount,
      missing_bom_count: input.missingBomCount,
      bom_source_mode: input.bomSourceMode,
      bom_warning: input.bomWarning,
    },
  }
}

export function applyOriginalRouteImport(
  current: CabinetRouteData,
  imported: CabinetRouteImportDraft,
  fileName: string
): CabinetRouteData {
  const importedNotes = imported.observations.join('\n').trim()
  const manualPieces = current.sections.pieces.rows.filter(row => row.source === 'manual')
  const acceptedSapPieces = current.sections.pieces.rows.filter(row => row.source === 'bom' && row.decision !== 'pending')
  const manualHardware = current.sections.hardware.rows.filter(row => row.source === 'manual')
  const acceptedSapHardware = current.sections.hardware.rows.filter(row => row.source === 'bom' && row.decision !== 'pending')
  const manualPackingRows = current.sections.packing.rows.filter(row => row.source === 'manual')
  const acceptedSapPackingRows = current.sections.packing.rows.filter(row => row.source === 'bom' && row.decision !== 'pending')
  const manualPackingLevels = current.sections.packing.levels.filter(row => row.source === 'manual')

  return {
    ...current,
    schema_version: CABINET_ROUTE_SCHEMA_VERSION,
    source: {
      ...current.source,
      updated_at: new Date().toISOString(),
      original_sheet: {
        file_name: fileName,
        parsed_at: new Date().toISOString(),
        parser_version: CABINET_ROUTE_PARSER_VERSION,
        warnings: imported.warnings,
      },
    },
    sections: {
      ...current.sections,
      pieces: {
        notes: current.sections.pieces.notes,
        rows: [...imported.pieces, ...acceptedSapPieces, ...manualPieces],
      },
      cutting: {
        notes: current.sections.cutting.notes,
        board_consumptions: imported.board_consumptions,
      },
      hardware: {
        notes: current.sections.hardware.notes,
        rows: [...imported.hardware_rows, ...acceptedSapHardware, ...manualHardware],
      },
      packing: {
        notes: current.sections.packing.notes,
        rows: [...imported.packing_rows, ...acceptedSapPackingRows, ...manualPackingRows],
        levels: [...imported.packing_levels, ...manualPackingLevels],
      },
      observations: {
        ...current.sections.observations,
        design_notes: mergeNotes(current.sections.observations.design_notes, importedNotes),
      },
    },
  }
}

export function deriveCabinetBomCandidates(
  lines: CabinetBomLine[],
  sourceMode: CabinetBomSourceMode = 'direct'
): CabinetBomCandidate[] {
  const lineById = new Map(lines.map(line => [line.line_id, line]))

  return lines.map(line => {
    const parentLineId = readString(line.parent_line_id)
    const parentLine = parentLineId ? lineById.get(parentLineId) : undefined
    const directQty = readNumber(line.qty) ?? 0
    const effectiveQty = readNumber(line.effective_qty) ?? directQty

    return {
      line_id: line.line_id,
      parent_line_id: parentLineId,
      root_line_id: readString(line.root_line_id),
      sort_order: readNumber(line.sort_order) ?? 0,
      sort_path: readString(line.sort_path),
      level: readNumber(line.level) ?? 1,
      kind: classifyCabinetItem(line.resolved_item_code, line.resolved_item_name, line.component_category),
      item_code: line.resolved_item_code,
      item_name: line.resolved_item_name,
      qty: effectiveQty,
      direct_qty: directQty,
      effective_qty: effectiveQty,
      uom: line.uom,
      scope: String(line.product_application_scope ?? ''),
      category: line.component_category,
      resolution_status: String(line.resolution_status ?? ''),
      parent_item_code: parentLine?.resolved_item_code ?? null,
      source_mode: sourceMode,
    }
  })
}

export function classifyCabinetItem(
  itemCode: string | null,
  itemName: string | null,
  category: ComponentCategory | null = null
): CabinetBomCandidateKind {
  if (category === 'hardware') return 'hardware'
  if (category === 'packaging') return 'packaging'
  if (category === 'substructure' || category === 'child_sku' || category === 'process') return 'other'
  if (category === 'material') return 'material'

  const code = (itemCode || '').toUpperCase()
  const name = normalizeText(itemName)

  if (/(KITTING|KIT\s)/.test(name)) return 'other'

  if (code.startsWith('CEMP') || /(BOLSA|CARTON|GRAPA|ETIQUETA|INSTRUCTIVO|EMPAQUE|CAJA|STRETCH|ZUNCHO)/.test(name)) {
    return 'packaging'
  }

  if (
    code.startsWith('CMPD07')
    || /(BISAGRA|RIEL|TORNILLO|TARUGO|CHAZO|MANIJA|SOPORTE|PATA|MINIFIX|PLATERO|GUIA|ESCUADRA|CIERRE|CLIP|NIVELADOR)/.test(name)
  ) {
    return 'hardware'
  }

  if (code || name) return 'material'
  return 'other'
}

export function cleanCabinetRoutePieceName(value: string): { pieceName: string; extractedObservation: string } {
  const trimmed = value.trim()
  if (!trimmed) return { pieceName: '', extractedObservation: '' }

  const parts = trimmed.split(/\s+-\s+/).map(part => part.trim()).filter(Boolean)
  if (parts.length < 2) return { pieceName: trimmed, extractedObservation: '' }

  const suffix = parts.slice(1).join(' - ')
  if (!isTechnicalPieceSuffix(suffix)) return { pieceName: trimmed, extractedObservation: '' }

  return {
    pieceName: parts[0],
    extractedObservation: suffix,
  }
}

export function calculatePieceEdgeMeters(row: CabinetPieceRow): number {
  const length = row.length_mm ?? 0
  const width = row.width_mm ?? 0
  const quantity = Number.isFinite(row.quantity) ? row.quantity : 0
  const totalMm = (row.edge_long_sides * (length + 50) + row.edge_short_sides * (width + 50)) * quantity
  return totalMm / 1000
}

export function calculatePieceAreaM2(row: CabinetPieceRow): number {
  const length = row.length_mm ?? 0
  const width = row.width_mm ?? 0
  const quantity = Number.isFinite(row.quantity) ? row.quantity : 0
  return (length / 1000) * (width / 1000) * quantity
}

export function reconcileCabinetRouteData(routeData: CabinetRouteData, candidates: CabinetBomCandidate[]): CabinetRouteData {
  const normalized = normalizeCabinetRouteData(routeData)
  return {
    ...normalized,
    schema_version: CABINET_ROUTE_SCHEMA_VERSION,
    sections: {
      ...normalized.sections,
      pieces: {
        ...normalized.sections.pieces,
        rows: reconcilePieceRows(normalized.sections.pieces.rows, candidates),
      },
      hardware: {
        ...normalized.sections.hardware,
        rows: reconcileMaterialRows(normalized.sections.hardware.rows, candidates, 'hardware', 'hw_bom'),
      },
      packing: {
        ...normalized.sections.packing,
        rows: reconcileMaterialRows(normalized.sections.packing.rows, candidates, 'packaging', 'pack_bom'),
      },
    },
  }
}

export function applyCabinetMatchDecision(
  routeData: CabinetRouteData,
  input: { section: CabinetDecisionSection; rowId: string; decision: CabinetRouteDecision }
): CabinetRouteData {
  const current = normalizeCabinetRouteData(routeData)
  const updatePiece = (row: CabinetPieceRow): CabinetPieceRow => applyDecisionToPiece(row, input.decision)
  const updateMaterial = (row: CabinetRouteMaterialRow): CabinetRouteMaterialRow => applyDecisionToMaterial(row, input.decision)

  if (input.section === 'pieces') {
    return {
      ...current,
      sections: {
        ...current.sections,
        pieces: {
          ...current.sections.pieces,
          rows: current.sections.pieces.rows.map(row => row.id === input.rowId ? updatePiece(row) : row),
        },
      },
    }
  }

  return {
    ...current,
    sections: {
      ...current.sections,
      [input.section]: {
        ...current.sections[input.section],
        rows: current.sections[input.section].rows.map(row => row.id === input.rowId ? updateMaterial(row) : row),
      },
    },
  }
}

export function getOperationalPieceRows(rows: CabinetPieceRow[]): CabinetPieceRow[] {
  return rows.filter(row => isAcceptedRouteRow(row))
}

export function getOperationalMaterialRows(rows: CabinetRouteMaterialRow[]): CabinetRouteMaterialRow[] {
  return rows.filter(row => row.included && isAcceptedRouteRow(row))
}

export function isAcceptedRouteRow(row: CabinetMatchFields): boolean {
  if (row.match_status === 'ignored' || row.decision === 'ignore') return false
  if (row.match_status === 'manual') return true
  if (row.match_status === 'matched') return true
  return row.decision === 'use_sap' || row.decision === 'use_sheet' || row.decision === 'use_custom'
}

export function buildCabinetRouteMatchReport(routeData: CabinetRouteData, candidates: CabinetBomCandidate[]): CabinetRouteMatchReport {
  const data = normalizeCabinetRouteData(routeData)
  const issues: CabinetMatchIssue[] = []
  const rows = [
    ...data.sections.pieces.rows.map(row => ({ row, section: 'pieces' as const })),
    ...data.sections.hardware.rows.map(row => ({ row, section: 'hardware' as const })),
    ...data.sections.packing.rows.map(row => ({ row, section: 'packing' as const })),
  ]
  const summary = {
    matched: 0,
    possible_match: 0,
    sap_only: 0,
    sheet_only: 0,
    quantity_mismatches: 0,
    manual: 0,
    ignored: 0,
    pending_decisions: 0,
    missing_piece_details: 0,
  }

  for (const { row, section } of rows) {
    if (row.match_status === 'matched') summary.matched += 1
    if (row.match_status === 'possible_match') summary.possible_match += 1
    if (row.match_status === 'sap_only') summary.sap_only += 1
    if (row.match_status === 'sheet_only') summary.sheet_only += 1
    if (row.match_status === 'quantity_mismatch') summary.quantity_mismatches += 1
    if (row.match_status === 'manual') summary.manual += 1
    if (row.match_status === 'ignored') summary.ignored += 1
    if (row.decision === 'pending' && row.match_status !== 'matched') summary.pending_decisions += 1

    const issue = issueFromRow(row, section)
    if (issue) issues.push(issue)
  }

  for (const piece of data.sections.pieces.rows) {
    if (!isAcceptedRouteRow(piece)) continue
    if (piece.length_mm && piece.width_mm && piece.quantity > 0) continue
    summary.missing_piece_details += 1
    issues.push({
      type: 'missing_piece_detail',
      severity: 'warning',
      section: 'pieces',
      row_id: piece.id,
      label: piece.piece_name || piece.sheet_item_name || piece.sap_item_name || piece.letter || 'Pieza sin nombre',
      detail: 'La pieza aceptada no tiene medidas o cantidad completa.',
      item_code: piece.sap_item_code ?? piece.sheet_item_code,
      bom_line_id: piece.sap_line_id ?? piece.bom_line_id,
      decision: piece.decision,
      possible_matches: [],
    })
  }

  if (data.source.bom_source_mode === 'direct' && candidates.length > 0) {
    issues.unshift({
      type: 'sap_only',
      severity: 'info',
      section: 'bom',
      row_id: null,
      label: 'BOM directa sin subestructuras',
      detail: data.source.bom_warning || 'Se uso resolved_bom_for_sku porque la BOM expandida no estuvo disponible.',
      item_code: null,
      bom_line_id: null,
      decision: null,
      possible_matches: [],
    })
  }

  return { summary, issues }
}

function reconcilePieceRows(rows: CabinetPieceRow[], candidates: CabinetBomCandidate[]): CabinetPieceRow[] {
  const sapCandidates = candidates.filter(candidate => isCabinetPieceCandidate(candidate) && candidate.qty > 0)
  const usedCandidateIds = new Set<string>()
  const previousBySapLineId = rowsBySapLineId(rows)
  const sheetRows = rows.filter(row => isSheetBacked(row))
  const manualRows = rows.filter(row => row.source === 'manual' || row.match_status === 'manual')
  const acceptedBomRows = rows.filter(row => row.source === 'bom' && row.decision !== 'pending' && rowLooksLikeCabinetPiece(row))

  const reconciledSheetRows = sheetRows.map(row => {
    const match = findCandidateMatch(
      row.sheet_item_code || null,
      row.sheet_item_name || row.piece_name,
      row.sheet_qty ?? row.quantity,
      sapCandidates,
      usedCandidateIds
    )
    if (match) usedCandidateIds.add(match.candidate.line_id)
    return reconcilePieceRow(row, match)
  })

  for (const row of acceptedBomRows) {
    if (row.sap_line_id) usedCandidateIds.add(row.sap_line_id)
  }

  const sapOnlyRows = sapCandidates
    .filter(candidate => !usedCandidateIds.has(candidate.line_id))
    .map(candidate => createSapOnlyPieceRow(candidate, previousBySapLineId.get(candidate.line_id)))

  return [...reconciledSheetRows, ...sapOnlyRows, ...acceptedBomRows, ...manualRows]
}

function reconcileMaterialRows(
  rows: CabinetRouteMaterialRow[],
  candidates: CabinetBomCandidate[],
  kind: 'hardware' | 'packaging',
  idPrefix: string
): CabinetRouteMaterialRow[] {
  const sapCandidates = candidates.filter(candidate => candidate.kind === kind && candidate.qty > 0)
  const usedCandidateIds = new Set<string>()
  const previousBySapLineId = rowsBySapLineId(rows)
  const sheetRows = rows.filter(row => isSheetBacked(row) && row.quantity > 0)
  const manualRows = rows.filter(row => row.source === 'manual' || row.match_status === 'manual')
  const acceptedBomRows = rows.filter(row => row.source === 'bom' && row.decision !== 'pending')

  const reconciledSheetRows = sheetRows.map(row => {
    const match = findCandidateMatch(
      row.sheet_item_code || row.item_code || null,
      row.sheet_item_name || row.item_name,
      row.sheet_qty ?? row.quantity,
      sapCandidates,
      usedCandidateIds
    )
    if (match) usedCandidateIds.add(match.candidate.line_id)
    return reconcileMaterialRow(row, match)
  })

  for (const row of acceptedBomRows) {
    if (row.sap_line_id) usedCandidateIds.add(row.sap_line_id)
  }

  const sapOnlyRows = sapCandidates
    .filter(candidate => !usedCandidateIds.has(candidate.line_id))
    .map(candidate => createSapOnlyMaterialRow(candidate, idPrefix, previousBySapLineId.get(candidate.line_id)))

  return [...reconciledSheetRows, ...sapOnlyRows, ...acceptedBomRows, ...manualRows]
}

function reconcilePieceRow(row: CabinetPieceRow, match: MatchResult): CabinetPieceRow {
  const baseSheetState = {
    sheet_item_code: row.sheet_item_code,
    sheet_item_name: row.sheet_item_name || row.piece_name,
    sheet_qty: row.sheet_qty ?? row.quantity,
    sheet_observation: row.sheet_observation || row.observation,
  }

  if (!match) {
    return {
      ...row,
      ...baseSheetState,
      source: 'original_sheet',
      match_status: row.decision === 'ignore' ? 'ignored' : 'sheet_only',
      decision: preservePendingDecision(row, 'pending'),
      sap_line_id: null,
      sap_item_code: null,
      sap_item_name: null,
      sap_qty: null,
      sap_level: null,
      sap_parent_item_code: null,
      match_score: null,
      possible_matches: [],
    }
  }

  const quantityMismatch = !numbersEqual(row.quantity, match.candidate.qty)
  const matchStatus: CabinetMatchStatus = match.type === 'possible'
    ? 'possible_match'
    : quantityMismatch
      ? 'quantity_mismatch'
      : 'matched'
  const decision = matchStatus === 'matched' ? 'use_sap' : preservePendingDecision(row, 'pending')

  return {
    ...row,
    ...baseSheetState,
    ...createCandidateMatchState(match.candidate, matchStatus, decision),
    source: 'original_sheet',
    bom_line_id: match.candidate.line_id,
    piece_name: decision === 'use_sap' ? match.candidate.item_name || row.piece_name : row.piece_name,
    quantity: applyQuantityDecision(row.quantity, match.candidate.qty, decision),
    possible_matches: [possibleMatchFromCandidate(match.candidate, match.score, match.reason)],
    match_score: match.score,
  }
}

function reconcileMaterialRow(row: CabinetRouteMaterialRow, match: MatchResult): CabinetRouteMaterialRow {
  const baseSheetState = {
    sheet_item_code: row.sheet_item_code || row.item_code || null,
    sheet_item_name: row.sheet_item_name || row.item_name || null,
    sheet_qty: row.sheet_qty ?? row.quantity,
    sheet_observation: row.sheet_observation || row.observation,
  }

  if (!match) {
    return {
      ...row,
      ...baseSheetState,
      source: 'original_sheet',
      match_status: row.decision === 'ignore' ? 'ignored' : 'sheet_only',
      decision: preservePendingDecision(row, 'pending'),
      sap_line_id: null,
      sap_item_code: null,
      sap_item_name: null,
      sap_qty: null,
      sap_level: null,
      sap_parent_item_code: null,
      match_score: null,
      possible_matches: [],
      included: isAcceptedRouteRow(row),
    }
  }

  const quantityMismatch = !numbersEqual(row.quantity, match.candidate.qty)
  const matchStatus: CabinetMatchStatus = match.type === 'possible'
    ? 'possible_match'
    : quantityMismatch
      ? 'quantity_mismatch'
      : 'matched'
  const decision = matchStatus === 'matched' ? 'use_sap' : preservePendingDecision(row, 'pending')
  const next = {
    ...row,
    ...baseSheetState,
    ...createCandidateMatchState(match.candidate, matchStatus, decision),
    source: 'original_sheet' as const,
    bom_line_id: match.candidate.line_id,
    item_code: applyItemCodeDecision(row.item_code, match.candidate.item_code, decision),
    item_name: applyItemNameDecision(row.item_name, match.candidate.item_name, decision),
    quantity: applyQuantityDecision(row.quantity, match.candidate.qty, decision),
    uom: decision === 'use_sap' ? match.candidate.uom : row.uom,
    possible_matches: [possibleMatchFromCandidate(match.candidate, match.score, match.reason)],
    match_score: match.score,
  }
  return { ...next, included: isAcceptedRouteRow(next) }
}

function createSapOnlyPieceRow(candidate: CabinetBomCandidate, previous?: CabinetPieceRow): CabinetPieceRow {
  const decision = previous?.decision ?? 'pending'
  const base: CabinetPieceRow = {
    ...createCandidateMatchState(candidate, previous?.match_status === 'ignored' ? 'ignored' : 'sap_only', decision),
    id: previous?.id || `piece_bom_${sanitizeId(candidate.line_id)}`,
    source: 'bom',
    original_ref: null,
    bom_line_id: candidate.line_id,
    letter: previous?.letter || '',
    piece_name: previous?.piece_name || candidate.item_name || candidate.item_code,
    material_label: previous?.material_label || candidate.item_name || '',
    length_mm: previous?.length_mm ?? null,
    width_mm: previous?.width_mm ?? null,
    quantity: previous?.quantity ?? candidate.qty,
    edge_long_sides: previous?.edge_long_sides ?? 0,
    edge_short_sides: previous?.edge_short_sides ?? 0,
    edge_type: previous?.edge_type || '',
    observation: previous?.observation || '',
    edited_fields: previous?.edited_fields ?? [],
  }

  return applyDecisionToPiece(base, decision)
}

function createSapOnlyMaterialRow(
  candidate: CabinetBomCandidate,
  idPrefix: string,
  previous?: CabinetRouteMaterialRow
): CabinetRouteMaterialRow {
  const decision = previous?.decision ?? 'pending'
  const base: CabinetRouteMaterialRow = {
    ...createCandidateMatchState(candidate, previous?.match_status === 'ignored' ? 'ignored' : 'sap_only', decision),
    id: previous?.id || `${idPrefix}_${sanitizeId(candidate.line_id)}`,
    source: 'bom',
    original_ref: null,
    bom_line_id: candidate.line_id,
    item_code: previous?.item_code || candidate.item_code,
    item_name: previous?.item_name || candidate.item_name || '',
    quantity: previous?.quantity ?? candidate.qty,
    uom: previous?.uom ?? candidate.uom,
    included: false,
    observation: previous?.observation || '',
    edited_fields: previous?.edited_fields ?? [],
  }

  return applyDecisionToMaterial(base, decision)
}

function applyDecisionToPiece(row: CabinetPieceRow, decision: CabinetRouteDecision): CabinetPieceRow {
  if (decision === 'ignore') {
    return { ...row, decision, match_status: 'ignored' }
  }

  if (decision === 'use_sap') {
    return {
      ...row,
      decision,
      piece_name: row.sap_item_name || row.piece_name,
      quantity: row.sap_qty ?? row.quantity,
      bom_line_id: row.sap_line_id ?? row.bom_line_id,
    }
  }

  if (decision === 'use_sheet') {
    return {
      ...row,
      decision,
      piece_name: row.sheet_item_name || row.piece_name,
      quantity: row.sheet_qty ?? row.quantity,
    }
  }

  if (decision === 'use_custom') return { ...row, decision }
  return { ...row, decision }
}

function applyDecisionToMaterial(row: CabinetRouteMaterialRow, decision: CabinetRouteDecision): CabinetRouteMaterialRow {
  if (decision === 'ignore') {
    return { ...row, decision, match_status: 'ignored', included: false }
  }

  if (decision === 'use_sap') {
    return {
      ...row,
      decision,
      bom_line_id: row.sap_line_id ?? row.bom_line_id,
      item_code: row.sap_item_code || row.item_code,
      item_name: row.sap_item_name || row.item_name,
      quantity: row.sap_qty ?? row.quantity,
      included: true,
    }
  }

  if (decision === 'use_sheet') {
    return {
      ...row,
      decision,
      item_code: row.sheet_item_code || row.item_code,
      item_name: row.sheet_item_name || row.item_name,
      quantity: row.sheet_qty ?? row.quantity,
      included: true,
    }
  }

  if (decision === 'use_custom') return { ...row, decision, included: true }
  return { ...row, decision, included: false }
}

function findCandidateMatch(
  itemCode: string | null,
  itemName: string,
  quantity: number,
  candidates: CabinetBomCandidate[],
  usedCandidateIds: Set<string>
): MatchResult {
  const normalizedCode = normalizeCode(itemCode)
  if (normalizedCode) {
    const byCode = candidates.find(candidate => !usedCandidateIds.has(candidate.line_id) && normalizeCode(candidate.item_code) === normalizedCode)
    if (byCode) return { type: 'exact', candidate: byCode, score: 1, reason: 'Codigo SAP exacto.' }
  }

  const comparableName = normalizeComparableName(itemName)
  if (comparableName) {
    const byName = candidates.find(candidate => {
      if (usedCandidateIds.has(candidate.line_id)) return false
      if (hasConflictingSpecs(itemName, candidate.item_name || '')) return false
      return normalizeComparableName(candidate.item_name || '') === comparableName
    })
    if (byName) return { type: 'exact', candidate: byName, score: 0.98, reason: 'Nombre normalizado exacto.' }
  }

  let best: MatchResult = null
  for (const candidate of candidates) {
    if (usedCandidateIds.has(candidate.line_id)) continue
    const score = scorePossibleMatch(itemName, quantity, candidate)
    if (score < 0.42) continue
    if (!best || score > best.score) {
      best = {
        type: 'possible',
        candidate,
        score,
        reason: hasConflictingSpecs(itemName, candidate.item_name || '')
          ? 'Nombre muy similar, pero con especificacion distinta.'
          : 'Categoria, cantidad o tokens sugieren similitud.',
      }
    }
  }
  return best
}

function scorePossibleMatch(itemName: string, quantity: number, candidate: CabinetBomCandidate): number {
  const sheetTokens = tokenizeComparableName(itemName)
  const sapTokens = tokenizeComparableName(candidate.item_name || candidate.item_code)
  if (sheetTokens.length === 0 || sapTokens.length === 0) return 0

  const overlap = sheetTokens.filter(token => sapTokens.includes(token)).length
  const union = new Set([...sheetTokens, ...sapTokens]).size
  const tokenScore = union > 0 ? overlap / union : 0
  const quantityScore = numbersEqual(quantity, candidate.qty) ? 0.18 : Math.abs(quantity - candidate.qty) <= 1 ? 0.08 : 0
  const containmentScore = normalizeComparableName(candidate.item_name || '').includes(normalizeComparableName(itemName)) ? 0.12 : 0
  return Math.min(1, tokenScore + quantityScore + containmentScore)
}

function isCabinetPieceCandidate(candidate: CabinetBomCandidate): boolean {
  if (candidate.kind !== 'material') return false
  return textLooksLikeCabinetPiece(candidate.item_name || candidate.item_code)
}

function rowLooksLikeCabinetPiece(row: CabinetPieceRow): boolean {
  return textLooksLikeCabinetPiece(row.sap_item_name || row.piece_name || row.material_label)
}

function textLooksLikeCabinetPiece(value: string): boolean {
  const normalized = normalizeText(value)
  if (!normalized) return false
  if (RAW_MATERIAL_NAME_PATTERN.test(normalized)) return false
  return CABINET_PIECE_NAME_PATTERN.test(normalized)
}

function issueFromRow(
  row: CabinetPieceRow | CabinetRouteMaterialRow,
  section: 'pieces' | 'hardware' | 'packing'
): CabinetMatchIssue | null {
  const label = rowLabel(row)
  const itemCode = row.sap_item_code ?? row.sheet_item_code ?? ('item_code' in row ? row.item_code : null)
  const bomLineId = row.sap_line_id ?? row.bom_line_id

  if (row.match_status === 'possible_match') {
    return {
      type: row.match_status,
      severity: 'warning',
      section,
      row_id: row.id,
      label,
      detail: 'Posible relacion SAP vs hoja. Requiere decision humana antes de ser operativo.',
      item_code: itemCode,
      bom_line_id: bomLineId,
      decision: row.decision,
      possible_matches: row.possible_matches,
    }
  }

  if (row.match_status === 'quantity_mismatch') {
    return {
      type: row.match_status,
      severity: 'warning',
      section,
      row_id: row.id,
      label,
      detail: `Cantidad SAP ${row.sap_qty ?? '-'} vs hoja ${row.sheet_qty ?? '-'}.`,
      item_code: itemCode,
      bom_line_id: bomLineId,
      decision: row.decision,
      possible_matches: row.possible_matches,
    }
  }

  if (row.match_status === 'sap_only') {
    return {
      type: row.match_status,
      severity: 'info',
      section,
      row_id: row.id,
      label,
      detail: 'Existe en SAP/BOM expandida, pero no fue encontrado en la hoja original.',
      item_code: itemCode,
      bom_line_id: bomLineId,
      decision: row.decision,
      possible_matches: row.possible_matches,
    }
  }

  if (row.match_status === 'sheet_only') {
    return {
      type: row.match_status,
      severity: 'warning',
      section,
      row_id: row.id,
      label,
      detail: 'Existe en la hoja original/manual, pero no aparece compatible en la BOM resuelta.',
      item_code: itemCode,
      bom_line_id: bomLineId,
      decision: row.decision,
      possible_matches: row.possible_matches,
    }
  }

  return null
}

function rowLabel(row: CabinetPieceRow | CabinetRouteMaterialRow): string {
  if ('piece_name' in row) return row.piece_name || row.sheet_item_name || row.sap_item_name || 'Pieza sin nombre'
  return row.item_name || row.sheet_item_name || row.sap_item_name || row.item_code || 'Item sin nombre'
}

function possibleMatchFromCandidate(candidate: CabinetBomCandidate, score: number, reason: string): CabinetPossibleMatch {
  return {
    line_id: candidate.line_id,
    item_code: candidate.item_code,
    item_name: candidate.item_name,
    qty: candidate.qty,
    uom: candidate.uom,
    kind: candidate.kind,
    score,
    reason,
    level: candidate.level,
    parent_item_code: candidate.parent_item_code,
  }
}

function rowsBySapLineId<Row extends CabinetMatchFields>(rows: Row[]): Map<string, Row> {
  const map = new Map<string, Row>()
  for (const row of rows) {
    if (row.sap_line_id) map.set(row.sap_line_id, row)
  }
  return map
}

function isSheetBacked(row: CabinetMatchFields & { source: CabinetRouteSource }): boolean {
  return row.source === 'original_sheet' || Boolean(row.sheet_item_name || row.sheet_item_code)
}

function preservePendingDecision(row: CabinetMatchFields, fallback: CabinetRouteDecision): CabinetRouteDecision {
  if (row.decision !== 'pending') return row.decision
  return fallback
}

function applyItemCodeDecision(sheetValue: string, sapValue: string, decision: CabinetRouteDecision): string {
  return decision === 'use_sap' ? sapValue : sheetValue
}

function applyItemNameDecision(sheetValue: string, sapValue: string | null, decision: CabinetRouteDecision): string {
  return decision === 'use_sap' ? sapValue || sheetValue : sheetValue
}

function applyQuantityDecision(sheetValue: number, sapValue: number, decision: CabinetRouteDecision): number {
  return decision === 'use_sap' ? sapValue : sheetValue
}

function normalizeSourceState(value: unknown): CabinetRouteSourceState {
  const record = asRecord(value)
  const originalSheet = asRecord(record.original_sheet)
  const warnings = readArray(originalSheet.warnings)
    .map(readString)
    .filter((warning): warning is string => Boolean(warning))
  const analysisSku = readString(record.analysis_sku_complete) || readString(record.sku_complete)

  return {
    sku_complete: analysisSku,
    analysis_sku_complete: analysisSku,
    reference_code: readString(record.reference_code),
    reference_id: readString(record.reference_id),
    version_id: null,
    updated_at: readString(record.updated_at),
    bom_line_count: readNumber(record.bom_line_count) ?? 0,
    missing_bom_count: readNumber(record.missing_bom_count) ?? 0,
    bom_source_mode: normalizeBomSourceMode(record.bom_source_mode),
    bom_warning: readString(record.bom_warning),
    original_sheet: originalSheet.file_name
      ? {
          file_name: readString(originalSheet.file_name) || 'Hoja original',
          parsed_at: readString(originalSheet.parsed_at) || '',
          parser_version: readNumber(originalSheet.parser_version) ?? CABINET_ROUTE_PARSER_VERSION,
          warnings,
        }
      : null,
  }
}

function normalizePieceRow(value: unknown, index: number): CabinetPieceRow {
  const record = asRecord(value)
  const source = normalizeSource(record.source)
  const pieceName = readString(record.piece_name) || ''
  const observation = readString(record.observation) || ''
  const quantity = readNumber(record.quantity) ?? 1

  return {
    ...normalizeMatchState(record, source, {
      sheetItemCode: null,
      sheetItemName: pieceName,
      sheetQty: quantity,
      sheetObservation: observation,
      sapLineId: readString(record.bom_line_id),
    }),
    id: readString(record.id) || `piece_${index + 1}`,
    source,
    original_ref: readString(record.original_ref),
    bom_line_id: readString(record.bom_line_id),
    letter: readString(record.letter) || '',
    piece_name: pieceName,
    material_label: readString(record.material_label) || '',
    length_mm: readNumber(record.length_mm),
    width_mm: readNumber(record.width_mm),
    quantity,
    edge_long_sides: readNumber(record.edge_long_sides) ?? 0,
    edge_short_sides: readNumber(record.edge_short_sides) ?? 0,
    edge_type: readString(record.edge_type) || '',
    observation,
    edited_fields: readStringArray(record.edited_fields),
  }
}

function normalizeBoardConsumption(value: unknown, index: number): CabinetBoardConsumption {
  const record = asRecord(value)
  return {
    id: readString(record.id) || `cut_${index + 1}`,
    source: normalizeSource(record.source),
    original_ref: readString(record.original_ref),
    material_label: readString(record.material_label) || '',
    thickness_mm: readNumber(record.thickness_mm),
    board_size_label: readString(record.board_size_label) || '',
    units_per_board: readNumber(record.units_per_board),
    board_count: readNumber(record.board_count),
    consumption_m2: readNumber(record.consumption_m2),
    observation: readString(record.observation) || '',
    edited_fields: readStringArray(record.edited_fields),
  }
}

function normalizeDrillingRow(value: unknown, index: number): CabinetDrillingRow {
  const record = asRecord(value)
  return {
    id: readString(record.id) || `drill_${index + 1}`,
    source: normalizeSource(record.source),
    original_ref: readString(record.original_ref),
    piece_letter: readString(record.piece_letter) || '',
    operation: readString(record.operation) || '',
    face: readString(record.face) || '',
    depth_mm: readNumber(record.depth_mm),
    observation: readString(record.observation) || '',
    edited_fields: readStringArray(record.edited_fields),
  }
}

function normalizeMaterialRow(value: unknown, index: number): CabinetRouteMaterialRow {
  const record = asRecord(value)
  const source = normalizeSource(record.source)
  const itemCode = readString(record.item_code) || ''
  const itemName = readString(record.item_name) || ''
  const quantity = readNumber(record.quantity) ?? 0
  const observation = readString(record.observation) || ''

  return {
    ...normalizeMatchState(record, source, {
      sheetItemCode: itemCode,
      sheetItemName: itemName,
      sheetQty: quantity,
      sheetObservation: observation,
      sapLineId: readString(record.bom_line_id),
    }),
    id: readString(record.id) || `mat_${index + 1}`,
    source,
    original_ref: readString(record.original_ref),
    bom_line_id: readString(record.bom_line_id),
    item_code: itemCode,
    item_name: itemName,
    quantity,
    uom: readString(record.uom),
    included: readBoolean(record.included) ?? true,
    observation,
    edited_fields: readStringArray(record.edited_fields),
  }
}

function normalizeAssemblyStep(value: unknown, index: number): CabinetAssemblyStep {
  const record = asRecord(value)
  return {
    id: readString(record.id) || `step_${index + 1}`,
    source: normalizeSource(record.source),
    original_ref: readString(record.original_ref),
    step_order: readNumber(record.step_order) ?? index + 1,
    description: readString(record.description) || '',
    edited_fields: readStringArray(record.edited_fields),
  }
}

function normalizePackingLevel(value: unknown, index: number): CabinetPackingLevel {
  const record = asRecord(value)
  return {
    id: readString(record.id) || `pack_level_${index + 1}`,
    source: normalizeSource(record.source),
    original_ref: readString(record.original_ref),
    level: readNumber(record.level) ?? index + 1,
    piece_letters: readStringArray(record.piece_letters),
    observation: readString(record.observation) || '',
    edited_fields: readStringArray(record.edited_fields),
  }
}

function normalizeMatchState(
  record: JsonRecord,
  source: CabinetRouteSource,
  fallback: {
    sheetItemCode: string | null
    sheetItemName: string | null
    sheetQty: number | null
    sheetObservation: string
    sapLineId: string | null
  }
): CabinetMatchFields {
  const matchStatus = normalizeMatchStatus(record.match_status, source)
  const decision = normalizeDecision(record.decision, matchStatus, source)
  return {
    match_status: matchStatus,
    decision,
    sap_line_id: readString(record.sap_line_id) || (source === 'bom' ? fallback.sapLineId : null),
    sap_item_code: readString(record.sap_item_code) || (source === 'bom' ? readString(record.item_code) : null),
    sap_item_name: readString(record.sap_item_name) || (source === 'bom' ? readString(record.item_name) || readString(record.piece_name) : null),
    sap_qty: readNumber(record.sap_qty) ?? (source === 'bom' ? readNumber(record.quantity) : null),
    sap_level: readNumber(record.sap_level),
    sap_parent_item_code: readString(record.sap_parent_item_code),
    sheet_item_code: readString(record.sheet_item_code) || (source === 'original_sheet' ? fallback.sheetItemCode : null),
    sheet_item_name: readString(record.sheet_item_name) || (source === 'original_sheet' ? fallback.sheetItemName : null),
    sheet_qty: readNumber(record.sheet_qty) ?? (source === 'original_sheet' ? fallback.sheetQty : null),
    sheet_observation: readString(record.sheet_observation) || (source === 'original_sheet' ? fallback.sheetObservation : ''),
    match_score: readNumber(record.match_score),
    possible_matches: normalizePossibleMatches(record.possible_matches),
  }
}

function normalizePossibleMatches(value: unknown): CabinetPossibleMatch[] {
  return readArray(value)
    .map(item => {
      const record = asRecord(item)
      const lineId = readString(record.line_id)
      const itemCode = readString(record.item_code)
      if (!lineId || !itemCode) return null
      return {
        line_id: lineId,
        item_code: itemCode,
        item_name: readString(record.item_name),
        qty: readNumber(record.qty) ?? 0,
        uom: readString(record.uom),
        kind: normalizeCandidateKind(record.kind),
        score: readNumber(record.score) ?? 0,
        reason: readString(record.reason) || '',
        level: readNumber(record.level) ?? 1,
        parent_item_code: readString(record.parent_item_code),
      }
    })
    .filter((item): item is CabinetPossibleMatch => Boolean(item))
}

function normalizeMatchStatus(value: unknown, source: CabinetRouteSource): CabinetMatchStatus {
  if (typeof value === 'string' && MATCH_STATUSES.includes(value as CabinetMatchStatus)) {
    return value as CabinetMatchStatus
  }
  if (source === 'manual') return 'manual'
  if (source === 'bom') return 'sap_only'
  return 'sheet_only'
}

function normalizeDecision(value: unknown, status: CabinetMatchStatus, source: CabinetRouteSource): CabinetRouteDecision {
  if (typeof value === 'string' && ROUTE_DECISIONS.includes(value as CabinetRouteDecision)) {
    return value as CabinetRouteDecision
  }
  if (status === 'matched') return 'use_sap'
  if (status === 'manual' || source === 'manual') return 'use_custom'
  if (source === 'bom' && status === 'sap_only') return 'use_sap'
  return 'pending'
}

function normalizeSource(value: unknown): CabinetRouteSource {
  return value === 'bom' || value === 'original_sheet' || value === 'manual' ? value : 'manual'
}

function normalizeBomSourceMode(value: unknown): CabinetBomSourceMode | null {
  return value === 'expanded' || value === 'direct' ? value : null
}

function normalizeCandidateKind(value: unknown): CabinetBomCandidateKind {
  if (value === 'material' || value === 'hardware' || value === 'packaging' || value === 'other') return value
  return 'other'
}

function isTechnicalPieceSuffix(value: string): boolean {
  const normalized = normalizeText(value)
  return /(R\d|L\d|P\d|PROF|ENCHAPE|RAN|RANURA|ARRIB|DERECHA|IZQUIERDA|CANTO|LADO|PERF)/.test(normalized)
}

function normalizeCode(value: string | null): string {
  return (value || '').trim().toUpperCase()
}

function normalizeComparableName(value: string | null): string {
  return tokenizeComparableName(value).join(' ')
}

function tokenizeComparableName(value: string | null): string[] {
  const normalized = normalizeText(value)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:X\s*\d+(?:[.,]\d+)?)?\s*(?:MM|CM|MT|M)?\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')

  return normalized
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !LOW_SIGNAL_TOKENS.has(token))
}

function hasConflictingSpecs(left: string, right: string): boolean {
  const leftSpecs = extractSpecTokens(left)
  const rightSpecs = extractSpecTokens(right)
  if (leftSpecs.size === 0 || rightSpecs.size === 0) return false

  for (const spec of leftSpecs) {
    if (!rightSpecs.has(spec)) return true
  }
  for (const spec of rightSpecs) {
    if (!leftSpecs.has(spec)) return true
  }
  return false
}

function extractSpecTokens(value: string): Set<string> {
  const normalized = normalizeText(value)
  const matches = normalized.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []
  return new Set(matches.map(match => match.replace(',', '.')))
}

function numbersEqual(left: number | null, right: number | null): boolean {
  const safeLeft = left ?? 0
  const safeRight = right ?? 0
  return Math.abs(safeLeft - safeRight) <= 0.001
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  return readArray(value).map(readString).filter((item): item is string => Boolean(item))
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function normalizeText(value: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function sanitizeId(value: string): string {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'row'
}

function mergeNotes(current: string, incoming: string): string {
  if (!incoming) return current
  if (!current) return incoming
  return `${current}\n${incoming}`
}
