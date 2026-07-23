import type {
  CabinetPieceRow,
  CabinetRouteMaterialRow,
  CabinetBoardConsumption,
} from './cabinets'
import type {
  BomSplitResult,
  BomBoardItem,
  BomEdgeItem,
  BomKittingItem,
} from './cabinetBomReader'
import { findItemByCode, buildComparisonKey } from './cabinetBomReader'

export type ComparisonDiff = {
  type: 'piece' | 'edge' | 'hardware' | 'packaging' | 'area' | 'material_profile'
  severity: 'match' | 'mismatch' | 'missing_in_excel' | 'missing_in_bom' | 'info'
  label: string
  excelValue: string | number | null
  bomValue: string | number | null
  detail: string
}

export type ComparisonReport = {
  referenceCode: string
  pieces: ComparisonDiff[]
  edges: ComparisonDiff[]
  materials: ComparisonDiff[]
  packaging: ComparisonDiff[]
  kitting: ComparisonDiff[]
  unresolved: string[]
  warnings: string[]
}

export function compareExcelWithBom(
  referenceCode: string,
  pieces: CabinetPieceRow[],
  hardwareRows: CabinetRouteMaterialRow[],
  packingRows: CabinetRouteMaterialRow[],
  boardConsumptions: CabinetBoardConsumption[],
  bom: BomSplitResult
): ComparisonReport {
  const report: ComparisonReport = {
    referenceCode,
    pieces: [],
    edges: [],
    materials: [],
    packaging: [],
    kitting: [],
    unresolved: [],
    warnings: [],
  }

  comparePieces(pieces, bom, report)
  compareEdges(pieces, bom, report)
  compareArea(pieces, bom, report)
  comparePackaging(packingRows, bom, report)
  identifyKittingItems(hardwareRows, packingRows, bom, report)
  identifyUnresolvedCodes(hardwareRows, packingRows, report)

  return report
}

function comparePieces(pieces: CabinetPieceRow[], bom: BomSplitResult, report: ComparisonReport): void {
  const bomPiecesByName = new Map<string, BomBoardItem>()
  for (const item of bom.boardItems) {
    const key = buildComparisonKey(item.itemCode, item.itemName)
    bomPiecesByName.set(key, item)
  }

  const matched = new Set<string>()

  for (const piece of pieces) {
    const excelName = (piece.piece_name || '').trim().toUpperCase()
    const bomMatch = findItemByCode(bom.boardItems, excelName)

    if (bomMatch) {
      matched.add(bomMatch.lineId)
      const qtyMatch = piece.quantity === bomMatch.qty
      report.pieces.push({
        type: 'piece',
        severity: qtyMatch ? 'match' : 'mismatch',
        label: piece.piece_name || piece.letter,
        excelValue: piece.quantity,
        bomValue: bomMatch.qty,
        detail: qtyMatch
          ? `Coincide con ${bomMatch.itemCode} (qty=${bomMatch.qty})`
          : `Cantidad diferente: excel=${piece.quantity}, BOM=${bomMatch.qty}`,
      })
    } else {
      report.pieces.push({
        type: 'piece',
        severity: 'missing_in_bom',
        label: piece.piece_name || piece.letter,
        excelValue: piece.quantity,
        bomValue: null,
        detail: 'Pieza en Excel no encontrada en BOM',
      })
    }
  }

  for (const item of bom.boardItems) {
    if (!matched.has(item.lineId)) {
      report.pieces.push({
        type: 'piece',
        severity: 'missing_in_excel',
        label: item.itemCode,
        excelValue: null,
        bomValue: item.qty,
        detail: `Existe en BOM (scope=${item.scope}) pero no en Excel`,
      })
    }
  }
}

function compareEdges(pieces: CabinetPieceRow[], bom: BomSplitResult, report: ComparisonReport): void {
  const excelEdge045 = pieces
    .filter(p => p.edge_type === '0.45 mm')
    .reduce((sum, p) => {
      const len = p.length_mm ?? 0
      const wid = p.width_mm ?? 0
      return sum + ((p.edge_long_sides * (len + 50) + p.edge_short_sides * (wid + 50)) / 1000) * (p.quantity ?? 1)
    }, 0)

  const excelEdge2mm = pieces
    .filter(p => p.edge_type === '2 mm')
    .reduce((sum, p) => {
      const len = p.length_mm ?? 0
      const wid = p.width_mm ?? 0
      return sum + ((p.edge_long_sides * (len + 50) + p.edge_short_sides * (wid + 50)) / 1000) * (p.quantity ?? 1)
    }, 0)

  for (const bomEdge of bom.edgeItems) {
    const bomEdgeFound = edgeThicknessFromCode(bomEdge.itemCode) ?? 0
    if (bomEdgeFound < 0.5) {
      const match = Math.abs(excelEdge045 - bomEdge.qty) < 0.01
      report.edges.push({
        type: 'edge',
        severity: match ? 'match' : 'mismatch',
        label: `Canto 0.45mm (${bomEdge.itemCode})`,
        excelValue: round3(excelEdge045),
        bomValue: round3(bomEdge.qty),
        detail: match
          ? 'Canto 0.45mm coincide'
          : `Diferencia: Excel=${round3(excelEdge045)}m, BOM=${round3(bomEdge.qty)}m`,
      })
    } else {
      const match = Math.abs(excelEdge2mm - bomEdge.qty) < 0.01
      report.edges.push({
        type: 'edge',
        severity: match ? 'match' : 'mismatch',
        label: `Canto 2mm (${bomEdge.itemCode})`,
        excelValue: round3(excelEdge2mm),
        bomValue: round3(bomEdge.qty),
        detail: match
          ? 'Canto 2mm coincide'
          : `Diferencia: Excel=${round3(excelEdge2mm)}m, BOM=${round3(bomEdge.qty)}m`,
      })
    }
  }
}

function compareArea(pieces: CabinetPieceRow[], bom: BomSplitResult, report: ComparisonReport): void {
  const netArea = pieces.reduce((sum, p) => {
    const len = p.length_mm ?? 0
    const wid = p.width_mm ?? 0
    return sum + (len / 1000) * (wid / 1000) * (p.quantity ?? 1)
  }, 0)

  const expectedM2 = netArea * 1.15

  for (const group of bom.materialGroups) {
    if (group.consumptions.length === 0) continue
    const bomArea = group.consumptions[0]?.qty ?? null

    if (bomArea !== null) {
      const match = Math.abs(expectedM2 - bomArea) < 0.01
      report.materials.push({
        type: 'area',
        severity: match ? 'match' : 'mismatch',
        label: `Area material (scope=${group.scope})`,
        excelValue: round4(expectedM2),
        bomValue: round4(bomArea),
        detail: match
          ? `Área con 15%=${round4(expectedM2)}m² coincide con BOM=${bomArea}m²`
          : `Diferencia: Excel (net*1.15)=${round4(expectedM2)}m², BOM=${round4(bomArea)}m²`,
      })
    }
  }

  for (const group of bom.materialGroups) {
    for (const consumption of group.consumptions) {
      report.materials.push({
        type: 'material_profile',
        severity: 'info',
        label: `Perfil scope=${group.scope}`,
        excelValue: null,
        bomValue: consumption.material_profile,
        detail: `Material profile: ${consumption.material_profile}, formato: ${consumption.format_key ?? 'N/A'}, color_mode: ${consumption.color_mode}`,
      })
    }
  }
}

function comparePackaging(packingRows: CabinetRouteMaterialRow[], bom: BomSplitResult, report: ComparisonReport): void {
  const matchedCodes = new Set<string>()

  for (const row of packingRows) {
    const code = row.item_code.toUpperCase()
    const bomMatch = bom.packagingItems.find(p => {
      const bCode = p.itemCode.toUpperCase()
      if (bCode === code) return true
      if (code === 'CEMP03' && bCode.startsWith('CEMP03')) return true
      return false
    })

    if (bomMatch) {
      matchedCodes.add(bomMatch.lineId)
      const qtyMatch = row.quantity === bomMatch.qty
      report.packaging.push({
        type: 'packaging',
        severity: qtyMatch ? 'match' : 'mismatch',
        label: row.item_name || row.item_code,
        excelValue: row.quantity,
        bomValue: bomMatch.qty,
        detail: qtyMatch
          ? `Coincide qty=${row.quantity}`
          : `Cantidad diferente: excel=${row.quantity}, BOM=${bomMatch.qty}`,
      })
    } else {
      report.packaging.push({
        type: 'packaging',
        severity: 'missing_in_bom',
        label: row.item_name || row.item_code,
        excelValue: row.quantity,
        bomValue: null,
        detail: row.item_code === 'CEMP03'
          ? 'Código incompleto CEMP03 — buscar componente compatible manualmente'
          : 'No encontrado en BOM',
      })
    }
  }

  for (const item of bom.packagingItems) {
    if (!matchedCodes.has(item.lineId)) {
      report.packaging.push({
        type: 'packaging',
        severity: 'missing_in_excel',
        label: item.itemCode,
        excelValue: null,
        bomValue: item.qty,
        detail: 'Existe en BOM pero no en Excel',
      })
    }
  }
}

function identifyKittingItems(
  hardwareRows: CabinetRouteMaterialRow[],
  packingRows: CabinetRouteMaterialRow[],
  bom: BomSplitResult,
  report: ComparisonReport,
): void {
  if (bom.kittingItems.length === 0) return

  const allExcelItems = [...hardwareRows, ...packingRows]
  const bomKittingCodes = new Set(bom.kittingItems.map(k => k.itemCode.toUpperCase()))

  for (const kit of bom.kittingItems) {
    const foundInExcel = allExcelItems.some(r => {
      const rc = r.item_code.toUpperCase()
      return bomKittingCodes.has(rc)
    })

    report.kitting.push({
      type: 'piece',
      severity: foundInExcel ? 'match' : 'missing_in_excel',
      label: `Kitting: ${kit.itemCode}`,
      excelValue: null,
      bomValue: kit.qty,
      detail: foundInExcel
        ? `Kitting ${kit.itemCode} presente en Excel (qty BOM=${kit.qty})`
        : `Kitting ${kit.itemCode} en BOM pero no identificado en Excel. Revisar si sus ${kit.children.length} hijos están como ítems individuales.`,
    })

    for (const child of kit.children) {
      const childInExcel = allExcelItems.some(r => {
        const rc = r.item_code.toUpperCase()
        const bc = child.itemCode.toUpperCase()
        if (rc === bc) return true
        if (rc === 'CEMP03' && bc.startsWith('CEMP03')) return true
        return false
      })

      if (!childInExcel) {
        report.kitting.push({
          type: 'piece',
          severity: 'info',
          label: `  Hijo kitting: ${child.itemCode}`,
          excelValue: null,
          bomValue: child.qty,
          detail: `Componente interno del kitting (qty=${child.qty})`,
        })
      }
    }
  }
}

function identifyUnresolvedCodes(
  hardwareRows: CabinetRouteMaterialRow[],
  packingRows: CabinetRouteMaterialRow[],
  report: ComparisonReport,
): void {
  const allRows = [...hardwareRows, ...packingRows]

  for (const row of allRows) {
    const code = row.item_code.toUpperCase()
    if (code === 'CEMP03' && row.quantity > 0) {
      report.unresolved.push(`${row.item_name || 'Item sin nombre'} (CEMP03, qty=${row.quantity}) — Código incompleto, buscar componente en BOM/LdM`)
    }
  }
}

function edgeThicknessFromCode(code: string): number | null {
  const parts = code.split('-')
  if (parts.length >= 4) {
    const last = parts[parts.length - 1]
    if (last.length === 4 && last.startsWith('0')) {
      return parseInt(last.slice(0, 2), 10) / 100
    }
  }
  return null
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}
