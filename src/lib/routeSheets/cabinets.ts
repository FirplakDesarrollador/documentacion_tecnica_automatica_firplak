import type { BomStructureLine, ComponentCategory, ResolvedBomLine } from '@/lib/bom/types'

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
  snapshot_taken_at: string | null
  bom_line_count: number
  missing_bom_count: number
  bom_source_mode: CabinetBomSourceMode | null
  bom_warning: string | null
  original_sheet: CabinetRouteSourceDocument | null
  profiles: CabinetProfilesByRole
  edge_types: CabinetProfilesByRole
}

export type MaterialRole = 'structure' | 'inner_structure' | 'front' | 'drawer_bottom'

export const MATERIAL_ROLES: MaterialRole[] = ['structure', 'inner_structure', 'front', 'drawer_bottom']

export type CabinetProfilesByRole = {
  structure: string | null
  inner_structure: string | null
  front: string | null
  drawer_bottom: string | null
}

export const MATERIAL_ROLE_LABELS: Record<MaterialRole, string> = {
  structure: 'Structure',
  inner_structure: 'Inner structure',
  front: 'Front',
  drawer_bottom: 'Drawer bottom',
}

export const PROFILE_OPTIONS = ['ST', 'RH', 'CARB2', 'CARB2 RH'] as const

export type CabinetPieceRow = CabinetMatchFields & {
  id: string
  source: CabinetRouteSource
  original_ref: string | null
  bom_line_id: string | null
  letter: string
  piece_name: string
  material_label: string
  material_role: MaterialRole | null
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

export type CabinetDecisionEntry = {
  timestamp: string
  section: CabinetDecisionSection
  row_id: string
  decision: CabinetRouteDecision
  previous_decision: CabinetRouteDecision
  item_label: string
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
  decision_history: CabinetDecisionEntry[]
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
  snapshot_taken_at: null,
  bom_line_count: 0,
  missing_bom_count: 0,
  bom_source_mode: null,
  bom_warning: null,
  original_sheet: null,
  profiles: { structure: null, inner_structure: null, front: null, drawer_bottom: null },
  edge_types: { structure: null, inner_structure: null, front: null, drawer_bottom: null },
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
  /\b(BASE|LATERAL|LAT|COSTADO|PUERTA|FRENTE|FONDO|ESPALDAR|REPISA|ENTREPANO|DIVISION|DIVISOR|PANEL|PISO|TECHO|TRAVESANO|FALDON|CAJON|TAPA|TAPETA|SOBRE|CUBIERTA|REFUERZO|REF)\b/

const RAW_MATERIAL_NAME_PATTERN =
  /\b(TABLERO|CANTO|CANTOS|LAMINA|LAMINADO|MELAMINA|MDP|MDF|AGLOMERADO|FORMICA|PVC|ROLLO|CHAPA|ENCHAPE|PEGANTE|ADHESIVO|BORDE|PERFIL)\b/

const CABINET_PIECE_CODE_PREFIX = 'CMPD09'
const CABINET_PACKAGING_CODE_PREFIX = 'CEMP'

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
    decision_history: [],
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

  normalized.decision_history = readArray(record.decision_history).map(normalizeDecisionEntry)

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
    profiles?: CabinetProfilesByRole | null
    edgeTypes?: CabinetProfilesByRole | null
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
      profiles: input.profiles ?? routeData.source.profiles,
      edge_types: input.edgeTypes ?? routeData.source.edge_types,
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
  const code = (itemCode || '').toUpperCase()
  const name = normalizeText(itemName)

  if (code.startsWith(CABINET_PACKAGING_CODE_PREFIX)) return 'packaging'
  if (/(KITTING|KIT\s)/.test(name)) return 'other'

  if (category === 'hardware') return 'hardware'
  if (category === 'packaging') return 'packaging'
  if (category === 'substructure' || category === 'child_sku' || category === 'process') return 'other'
  if (/(BOLSA|CARTON|GRAPA|ETIQUETA|INSTRUCTIVO|EMPAQUE|CAJA|STRETCH|ZUNCHO)/.test(name)) {
    return 'packaging'
  }

  if (
    code.startsWith('CMPD07')
    || /(BISAGRA|RIEL|TORNILLO|TARUGO|CHAZO|MANIJA|SOPORTE|PATA|MINIFIX|PLATERO|GUIA|ESCUADRA|CIERRE|CLIP|NIVELADOR)/.test(name)
  ) {
    return 'hardware'
  }

  if (category === 'material') return 'material'
  if (code || name) return 'material'
  return 'other'
}

export function classifyDirectBomLine(
  code: string | null,
  scope: string
): CabinetBomCandidateKind {
  const c = (code ?? '').toUpperCase()
  const s = scope.toLowerCase()
  if (s.startsWith('edge_band_')) return 'other'
  if (c.startsWith('CMPD09')) return 'material'
  if (c.startsWith('PZCO')) return 'other'
  if (c.startsWith('CMPD07')) return 'hardware'
  if (c.startsWith('CEMP')) return 'packaging'
  return classifyCabinetItem(code, null, null)
}

export function deriveCabinetCandidatesFromStructure(
  lines: BomStructureLine[]
): CabinetBomCandidate[] {
  return lines.map((line, index) => ({
    line_id: line.line_id,
    parent_line_id: null,
    root_line_id: null,
    sort_order: line.sort_order ?? index,
    sort_path: null,
    level: 1,
    kind: classifyDirectBomLine(line.base_item_code, line.product_application_scope),
    item_code: line.base_item_code ?? '',
    item_name: line.base_item_code ?? null,
    qty: line.qty ?? 0,
    direct_qty: line.qty ?? 0,
    effective_qty: line.qty ?? 0,
    uom: line.uom ?? null,
    scope: line.product_application_scope ?? 'NA',
    category: null,
    resolution_status: 'resolved',
    parent_item_code: null,
    source_mode: 'direct',
  }))
}

export function derivePieceRowsFromCandidates(
  candidates: CabinetBomCandidate[],
  existingPieces: CabinetPieceRow[],
  edgeTypes?: CabinetProfilesByRole | null
): CabinetPieceRow[] {
  const existingLineIds = new Set(existingPieces.map(p => p.bom_line_id).filter(Boolean))
  const boardCandidates = candidates.filter(
    c =>
      c.item_code.startsWith('CMPD09')
      && !c.scope.startsWith('edge_band_')
      && !existingLineIds.has(c.line_id)
  )
  return boardCandidates.map((c) => {
    const role = classifyScopeToRole(c.scope)
    const edgeType = role && edgeTypes ? resolveEdgeTypeForRole(role, edgeTypes) : null
    return {
      ...createManualMatchState(),
      match_status: 'sap_only' as CabinetMatchStatus,
      decision: 'pending' as CabinetRouteDecision,
      sap_line_id: c.line_id,
      sap_item_code: c.item_code,
      sap_item_name: c.item_name,
      sap_qty: c.qty,
      sap_level: c.level,
      id: newCabinetRouteId('bom_piece'),
      source: 'bom' as CabinetRouteSource,
      original_ref: null,
      bom_line_id: c.line_id,
      letter: '',
      piece_name: c.item_name ?? c.item_code,
      material_label: '',
      material_role: role,
      length_mm: null,
      width_mm: null,
      quantity: c.qty,
      edge_long_sides: 0,
      edge_short_sides: 0,
      edge_type: edgeType ?? '',
      observation: '',
      edited_fields: [],
    }
  })
}

function classifyScopeToRole(scope: string): MaterialRole | null {
  const s = scope.toLowerCase().replace(/^edge_band_/, '')
  if (s === 'full_product' || s === 'structure') return 'structure'
  if (s === 'front') return 'front'
  if (s === 'inner_structure') return 'inner_structure'
  if (s === 'drawer_bottom') return 'drawer_bottom'
  return null
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

export function calculateAreaByRole(rows: CabinetPieceRow[]): Partial<Record<MaterialRole, number>> {
  const result: Partial<Record<MaterialRole, number>> = {}
  for (const row of rows) {
    if (!row.material_role) continue
    const area = calculatePieceAreaM2(row)
    result[row.material_role] = (result[row.material_role] ?? 0) + area
  }
  return result
}

export function calculateEdgeByRole(rows: CabinetPieceRow[]): Partial<Record<MaterialRole, number>> {
  const result: Partial<Record<MaterialRole, number>> = {}
  for (const row of rows) {
    if (!row.material_role) continue
    const edge = calculatePieceEdgeMeters(row)
    result[row.material_role] = (result[row.material_role] ?? 0) + edge
  }
  return result
}

export function extractCabinetProfilesFromBom(
  lines: ReadonlyArray<{
    line_kind?: string | null
    product_application_scope?: string | null
    consumptions?: ReadonlyArray<{ status?: string | null; material_profile?: string | null }> | null
  }>
): CabinetProfilesByRole {
  const profiles: CabinetProfilesByRole = { structure: null, inner_structure: null, front: null, drawer_bottom: null }

  for (const line of lines) {
    if (line.line_kind !== 'material_group') continue
    const scope = (line.product_application_scope ?? '').toLowerCase()
    const consumptions = line.consumptions ?? []
    const defaultConsumption = [...consumptions].find(c => c.status === 'confirmed' || c.status === 'observed')
    const profile = defaultConsumption?.material_profile ?? (consumptions[0]?.material_profile ?? null)
    if (!profile) continue

    if (scope === 'full_product') {
      if (!profiles.structure) profiles.structure = profile
      if (!profiles.front) profiles.front = profile
      if (!profiles.inner_structure) profiles.inner_structure = profile
      if (!profiles.drawer_bottom) profiles.drawer_bottom = profile
    }
    if (scope === 'structure' && !profiles.structure) profiles.structure = profile
    if (scope === 'front' && !profiles.front) profiles.front = profile
    if (scope === 'inner_structure' && !profiles.inner_structure) profiles.inner_structure = profile
    if (scope === 'drawer_bottom' && !profiles.drawer_bottom) profiles.drawer_bottom = profile
  }

  if (profiles.structure && !profiles.inner_structure) profiles.inner_structure = profiles.structure
  if (profiles.structure && !profiles.drawer_bottom) profiles.drawer_bottom = profiles.structure

  return profiles
}

export function resolveProfileForRole(
  role: MaterialRole,
  profiles: CabinetProfilesByRole
): string | null {
  const direct = profiles[role]
  if (direct) return direct
  if (role === 'inner_structure' || role === 'drawer_bottom') return profiles.structure
  return null
}

export function resolveEdgeTypeForRole(
  role: MaterialRole,
  edgeTypes: CabinetProfilesByRole
): string | null {
  const direct = edgeTypes[role]
  if (direct) return direct
  if (role === 'inner_structure' || role === 'drawer_bottom') return edgeTypes.structure
  return null
}

const EDGE_TYPE_PATTERNS = [
  { pattern: /(?:^|[^\d])2\s*MM/i, value: '2 mm' },
  { pattern: /(?:^|[^\d])0\.?45/i, value: '0.45 mm' },
  { pattern: /(?:^|[^\d])1\s*MM/i, value: '1 mm' },
  { pattern: /(?:^|[^\d])3\s*MM/i, value: '3 mm' },
]

function inferEdgeTypeFromName(name: string): string | null {
  for (const entry of EDGE_TYPE_PATTERNS) {
    if (entry.pattern.test(name)) return entry.value
  }
  return null
}

export function extractCabinetEdgeTypesFromBom(
  lines: ReadonlyArray<{
    base_item_code?: string | null
    product_application_scope?: string | null
  }>,
  nameMap?: ReadonlyMap<string, string>
): CabinetProfilesByRole {
  const edgeTypes: CabinetProfilesByRole = { structure: null, inner_structure: null, front: null, drawer_bottom: null }

  for (const line of lines) {
    const code = (line.base_item_code ?? '').toUpperCase()
    if (!code.startsWith('CMPD06')) continue
    const scope = (line.product_application_scope ?? '').toLowerCase()
    if (!scope.startsWith('edge_band_')) continue

    const name = nameMap?.get(code) ?? code
    const thickness = inferEdgeTypeFromName(name)
    if (!thickness) continue

    const roleSuffix = scope.replace('edge_band_', '')
    const isMultiRole = roleSuffix === 'full_product' || roleSuffix === 'body'
    if (isMultiRole) {
      if (!edgeTypes.structure) edgeTypes.structure = thickness
      if (!edgeTypes.front) edgeTypes.front = thickness
      if (!edgeTypes.inner_structure) edgeTypes.inner_structure = thickness
      if (!edgeTypes.drawer_bottom) edgeTypes.drawer_bottom = thickness
    }
    if (roleSuffix === 'structure' && !edgeTypes.structure) edgeTypes.structure = thickness
    if (roleSuffix === 'front' && !edgeTypes.front) edgeTypes.front = thickness
    if (roleSuffix === 'inner' && !edgeTypes.inner_structure) edgeTypes.inner_structure = thickness
    if (roleSuffix === 'drawer_bottom' && !edgeTypes.drawer_bottom) edgeTypes.drawer_bottom = thickness
  }

  if (edgeTypes.structure && !edgeTypes.inner_structure) edgeTypes.inner_structure = edgeTypes.structure
  if (edgeTypes.structure && !edgeTypes.drawer_bottom) edgeTypes.drawer_bottom = edgeTypes.structure

  return edgeTypes
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

  const findRowLabel = (): string => {
    if (input.section === 'pieces') {
      const row = current.sections.pieces.rows.find(r => r.id === input.rowId)
      return row?.piece_name || row?.sap_item_name || row?.sap_item_code || input.rowId
    }
    const rows = current.sections[input.section].rows
    const row = rows.find(r => r.id === input.rowId)
    return row?.item_name || row?.item_code || row?.sap_item_name || row?.sap_item_code || input.rowId
  }

  const findPrevDecision = (): CabinetRouteDecision => {
    if (input.section === 'pieces') {
      return current.sections.pieces.rows.find(r => r.id === input.rowId)?.decision ?? 'pending'
    }
    const rows = current.sections[input.section].rows
    return rows.find(r => r.id === input.rowId)?.decision ?? 'pending'
  }

  const entry: CabinetDecisionEntry = {
    timestamp: new Date().toISOString(),
    section: input.section,
    row_id: input.rowId,
    decision: input.decision,
    previous_decision: findPrevDecision(),
    item_label: findRowLabel(),
  }

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
      decision_history: [...current.decision_history, entry],
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
    decision_history: [...current.decision_history, entry],
  }
}

export function getOperationalPieceRows(rows: CabinetPieceRow[]): CabinetPieceRow[] {
  return rows.filter(row => isAcceptedRouteRow(row))
}

export function getOperationalMaterialRows(rows: CabinetRouteMaterialRow[]): CabinetRouteMaterialRow[] {
  return rows.filter(row => row.included && isAcceptedRouteRow(row))
}

export function suggestMaterialRole(pieceName: string, sectionLabel: string): MaterialRole | null {
  const normalizedName = normalizeText(pieceName)
  const normalizedSection = normalizeText(sectionLabel)

  const isDrawer = /\bFONDO\b/.test(normalizedName)

  if (isDrawer) return 'drawer_bottom'

  if (/\bPUERTA\b/.test(normalizedName) || /\bPARCHE\b/.test(normalizedName)) return 'front'

  if (/\bENTREPANO\b|\bENTREPAÑO\b|\bDIVISION\b/.test(normalizedName)) return 'inner_structure'

  if (/\bCAJON\b/.test(normalizedName) && /(LATERAL|TRASERO|GOLA)/.test(normalizedName)) {
    return 'inner_structure'
  }

  if (/\bGOLA\b/.test(normalizedName)) return 'inner_structure'

  if (/\bFONDO\b/.test(normalizedSection)) return 'drawer_bottom'

  return 'structure'
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
    material_role: previous?.material_role ?? null,
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
  if (candidate.item_code.toUpperCase().startsWith(CABINET_PIECE_CODE_PREFIX)) return true
  return textLooksLikeCabinetPiece(candidate.item_name || candidate.item_code)
}

function rowLooksLikeCabinetPiece(row: CabinetPieceRow): boolean {
  if (row.sap_item_code?.toUpperCase().startsWith(CABINET_PIECE_CODE_PREFIX)) return true
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
  const rawProfiles = asRecord(record.profiles)
  const rawEdgeTypes = asRecord(record.edge_types)

  return {
    sku_complete: analysisSku,
    analysis_sku_complete: analysisSku,
    reference_code: readString(record.reference_code),
    reference_id: readString(record.reference_id),
    version_id: null,
    updated_at: readString(record.updated_at),
    snapshot_taken_at: readString(record.snapshot_taken_at),
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
    profiles: {
      structure: readString(rawProfiles.structure) || null,
      inner_structure: readString(rawProfiles.inner_structure) || null,
      front: readString(rawProfiles.front) || null,
      drawer_bottom: readString(rawProfiles.drawer_bottom) || null,
    },
    edge_types: {
      structure: readString(rawEdgeTypes.structure) || null,
      inner_structure: readString(rawEdgeTypes.inner_structure) || null,
      front: readString(rawEdgeTypes.front) || null,
      drawer_bottom: readString(rawEdgeTypes.drawer_bottom) || null,
    },
  }
}

function normalizePieceRow(value: unknown, index: number): CabinetPieceRow {
  const record = asRecord(value)
  const source = normalizeSource(record.source)
  const pieceName = readString(record.piece_name) || ''
  const observation = readString(record.observation) || ''
  const quantity = readNumber(record.quantity) ?? 1

  const materialLabel = readString(record.material_label) || ''
  const materialRole = readString(record.material_role) as MaterialRole | null
  const suggestedRole = materialRole || suggestMaterialRole(pieceName, materialLabel)

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
    material_label: materialLabel,
    material_role: suggestedRole,
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

function normalizeDecisionEntry(value: unknown, index: number): CabinetDecisionEntry {
  const record = asRecord(value)
  const section = readString(record.section)
  const decision = readString(record.decision)
  return {
    timestamp: readString(record.timestamp) || new Date().toISOString(),
    section: section === 'pieces' || section === 'hardware' || section === 'packing' ? section : 'hardware',
    row_id: readString(record.row_id) || `entry_${index}`,
    decision: decision === 'use_sap' || decision === 'use_sheet' || decision === 'use_custom' || decision === 'ignore' || decision === 'pending' ? decision : 'pending',
    previous_decision: readString(record.previous_decision) as CabinetRouteDecision || 'pending',
    item_label: readString(record.item_label) || '-',
  }
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
