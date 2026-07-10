import ExcelJS from 'exceljs'

import {
  CABINET_ROUTE_PARSER_VERSION,
  type CabinetBoardConsumption,
  type CabinetPackingLevel,
  type CabinetPieceRow,
  type CabinetRouteImportDraft,
  type CabinetRouteMaterialRow,
  classifyCabinetItem,
  cleanCabinetRoutePieceName,
  createSheetMatchState,
} from './cabinets'

type HeaderMap = Map<string, number>
type ExcelWorkbookBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0]

export async function parseCabinetRouteWorkbook(buffer: Buffer, fileName: string): Promise<CabinetRouteImportDraft> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelWorkbookBuffer)

  const warnings: string[] = []
  const lmSheet = findSheet(workbook, ['LM'])
  const optimizationSheet = findSheet(workbook, ['Optimización', 'Optimizacion'])
  const hardwareSheet = findSheet(workbook, ['Herrajes'])

  if (!lmSheet) warnings.push('No se encontró la pestaña LM.')
  if (!optimizationSheet) warnings.push('No se encontró la pestaña Optimización.')
  if (!hardwareSheet) warnings.push('No se encontró la pestaña Herrajes.')

  const lmResult = lmSheet ? parseLmSheet(lmSheet) : { pieces: [], packingLevels: [], observations: [], warnings: [] }
  const optimizationRows = optimizationSheet ? parseOptimizationSheet(optimizationSheet) : []
  const hardwareResult = hardwareSheet ? parseHardwareSheet(hardwareSheet) : { hardwareRows: [], packingRows: [] }

  return {
    pieces: lmResult.pieces,
    board_consumptions: optimizationRows,
    hardware_rows: hardwareResult.hardwareRows,
    packing_rows: hardwareResult.packingRows,
    packing_levels: lmResult.packingLevels,
    observations: [
      `Archivo original: ${fileName}`,
      `Parser hoja ruta cabinets v${CABINET_ROUTE_PARSER_VERSION}`,
      ...lmResult.observations,
    ],
    warnings: [...warnings, ...lmResult.warnings],
  }
}

function parseLmSheet(worksheet: ExcelJS.Worksheet): {
  pieces: CabinetPieceRow[]
  packingLevels: CabinetPackingLevel[]
  observations: string[]
  warnings: string[]
} {
  const warnings: string[] = []
  const pieces: CabinetPieceRow[] = []
  const observations = readLmObservations(worksheet)

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const header = readHeaderMap(worksheet.getRow(rowNumber))
    if (!header.has('LETRA') || !header.has('PIEZA')) continue
    const materialLabel = findPreviousMaterialLabel(worksheet, rowNumber)
    pieces.push(...parsePieceBlock(worksheet, rowNumber, header, materialLabel))
  }

  if (pieces.length === 0) warnings.push('No se encontraron piezas en la pestaña LM.')

  return {
    pieces,
    packingLevels: parsePackingLevels(worksheet),
    observations,
    warnings,
  }
}

function readLmObservations(worksheet: ExcelJS.Worksheet): string[] {
  const title = readCellText(worksheet.getCell('C1'))
  const color = readCellText(worksheet.getCell('F2'))
  const quantity = readCellText(worksheet.getCell('F3'))
  const order = readCellText(worksheet.getCell('J4')) || readCellText(worksheet.getCell('J3'))
  return [
    title ? `Título hoja original: ${title}` : '',
    color ? `Color hoja original: ${color}` : '',
    quantity ? `Cantidad base hoja original: ${quantity}` : '',
    order ? `Pedido/código hoja original: ${order}` : '',
  ].filter(Boolean)
}

function parsePieceBlock(
  worksheet: ExcelJS.Worksheet,
  headerRowNumber: number,
  header: HeaderMap,
  materialLabel: string
): CabinetPieceRow[] {
  const rows: CabinetPieceRow[] = []
  const letterCol = header.get('LETRA') ?? 1
  const pieceCol = header.get('PIEZA') ?? 2
  const lengthCol = header.get('LARGO') ?? 3
  const widthCol = header.get('ANCHO') ?? 4
  const quantityCol = header.get('CANTIDAD') ?? 5
  const edgeLongCol = findHeaderColumn(header, 'ENCHAPE LADO LARGO')
  const edgeShortCol = findHeaderColumn(header, 'ENCHAPE LADO ANCHO')
  const observationCol = findHeaderColumn(header, 'OBSERVACIONES')

  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const firstText = readCellText(row.getCell(letterCol)).toUpperCase()
    const pieceName = readCellText(row.getCell(pieceCol))

    if (firstText === 'TOTAL' || firstText === 'EMPAQUE' || firstText.startsWith('MATERIAL')) break
    if (!firstText && !pieceName) break

    const cleanedPiece = cleanCabinetRoutePieceName(pieceName)
    const sheetObservation = mergeObservation(
      cleanedPiece.extractedObservation,
      observationCol ? readCellText(row.getCell(observationCol)) : ''
    )
    const quantity = readCellNumber(row.getCell(quantityCol)) ?? 1

    rows.push({
      ...createSheetMatchState({
        itemCode: null,
        itemName: cleanedPiece.pieceName,
        quantity,
        observation: sheetObservation,
      }),
      id: `piece_${sanitizeId(firstText || String(rowNumber))}`,
      source: 'original_sheet',
      original_ref: `${worksheet.name}!${rowNumber}`,
      bom_line_id: null,
      letter: firstText,
      piece_name: cleanedPiece.pieceName,
      material_label: materialLabel,
      length_mm: readCellNumber(row.getCell(lengthCol)),
      width_mm: readCellNumber(row.getCell(widthCol)),
      quantity,
      edge_long_sides: edgeLongCol ? readCellNumber(row.getCell(edgeLongCol)) ?? 0 : 0,
      edge_short_sides: edgeShortCol ? readCellNumber(row.getCell(edgeShortCol)) ?? 0 : 0,
      edge_type: edgeTypeFromMaterial(materialLabel),
      observation: sheetObservation,
      edited_fields: [],
    })
  }

  return rows
}

function parsePackingLevels(worksheet: ExcelJS.Worksheet): CabinetPackingLevel[] {
  const levels: CabinetPackingLevel[] = []

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const header = readHeaderMap(worksheet.getRow(rowNumber))
    if (!header.has('NIVEL') || !header.has('LETRA')) continue

    const levelCol = header.get('NIVEL') ?? 1
    const lettersCol = header.get('LETRA') ?? 2
    for (let levelRow = rowNumber + 1; levelRow <= worksheet.rowCount; levelRow += 1) {
      const row = worksheet.getRow(levelRow)
      const level = readCellNumber(row.getCell(levelCol))
      const lettersText = readCellText(row.getCell(lettersCol))
      if (!level && !lettersText) break

      levels.push({
        id: `pack_level_${sanitizeId(String(level ?? levelRow))}`,
        source: 'original_sheet',
        original_ref: `${worksheet.name}!${levelRow}`,
        level: level ?? levels.length + 1,
        piece_letters: parsePieceLetters(lettersText),
        observation: lettersText,
        edited_fields: [],
      })
    }
  }

  return levels
}

function parseOptimizationSheet(worksheet: ExcelJS.Worksheet): CabinetBoardConsumption[] {
  const rows: CabinetBoardConsumption[] = []
  const material15 = readCellText(worksheet.getCell('A2')) || 'Material 15mm'
  const material6 = readCellText(worksheet.getCell('A24')) || 'Material 6mm'

  rows.push(
    createBoardConsumption(worksheet, 'cut_t1', 'A3', material15, 'C3', 'B3', 'B4', 'C4'),
    createBoardConsumption(worksheet, 'cut_t2', 'A5', material15, 'D3', 'B5', 'B6', 'D4'),
    createBoardConsumption(worksheet, 'cut_6mm', 'A25', material6, 'C25', 'B25', 'B26', 'C26')
  )

  return rows.filter(row => row.board_size_label || row.units_per_board || row.board_count)
}

function createBoardConsumption(
  worksheet: ExcelJS.Worksheet,
  id: string,
  labelCell: string,
  materialLabel: string,
  boardSizeCell: string,
  unitsCell: string,
  boardCountCell: string,
  consumptionCell: string
): CabinetBoardConsumption {
  const boardSizeLabel = readCellText(worksheet.getCell(boardSizeCell))
  return {
    id,
    source: 'original_sheet',
    original_ref: `${worksheet.name}!${labelCell}`,
    material_label: materialLabel,
    thickness_mm: readThicknessMm(materialLabel),
    board_size_label: boardSizeLabel,
    units_per_board: readCellNumber(worksheet.getCell(unitsCell)),
    board_count: readCellNumber(worksheet.getCell(boardCountCell)),
    consumption_m2: readCellNumber(worksheet.getCell(consumptionCell)),
    observation: readCellText(worksheet.getCell(labelCell)),
    edited_fields: [],
  }
}

function parseHardwareSheet(worksheet: ExcelJS.Worksheet): {
  hardwareRows: CabinetRouteMaterialRow[]
  packingRows: CabinetRouteMaterialRow[]
} {
  const hardwareRows: CabinetRouteMaterialRow[] = []
  const packingRows: CabinetRouteMaterialRow[] = []
  let headerRow = 0

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const header = readHeaderMap(worksheet.getRow(rowNumber))
    if (header.has('CODIGO') && header.has('ITEM') && header.has('CANTIDAD')) {
      headerRow = rowNumber
      break
    }
  }

  if (!headerRow) return { hardwareRows, packingRows }

  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const itemCode = readCellText(row.getCell(1))
    const itemName = readCellText(row.getCell(2))
    if (!itemCode && !itemName) break

    const quantity = readCellNumber(row.getCell(3)) ?? 0
    if (quantity <= 0) continue

    const observation = readCellText(row.getCell(4))
    const materialRow: CabinetRouteMaterialRow = {
      ...createSheetMatchState({
        itemCode,
        itemName,
        quantity,
        observation,
      }),
      id: `mat_${sanitizeId(itemCode || itemName || String(rowNumber))}_${rowNumber}`,
      source: 'original_sheet',
      original_ref: `${worksheet.name}!${rowNumber}`,
      bom_line_id: null,
      item_code: itemCode,
      item_name: itemName,
      quantity,
      uom: null,
      included: false,
      observation,
      edited_fields: [],
    }

    const kind = classifyCabinetItem(itemCode, itemName)
    if (kind === 'packaging') {
      packingRows.push(materialRow)
    } else {
      hardwareRows.push(materialRow)
    }
  }

  return { hardwareRows, packingRows }
}

function findSheet(workbook: ExcelJS.Workbook, names: string[]): ExcelJS.Worksheet | undefined {
  const normalizedNames = names.map(normalizeText)
  return workbook.worksheets.find(worksheet => normalizedNames.includes(normalizeText(worksheet.name)))
}

function readHeaderMap(row: ExcelJS.Row): HeaderMap {
  const headers: HeaderMap = new Map()
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const label = normalizeText(readCellText(cell))
    if (label) headers.set(label, colNumber)
  })
  return headers
}

function findHeaderColumn(headers: HeaderMap, label: string): number | null {
  const normalizedLabel = normalizeText(label)
  for (const [header, colNumber] of headers.entries()) {
    if (header.includes(normalizedLabel)) return colNumber
  }
  return null
}

function findPreviousMaterialLabel(worksheet: ExcelJS.Worksheet, headerRowNumber: number): string {
  for (let rowNumber = headerRowNumber - 1; rowNumber >= Math.max(1, headerRowNumber - 4); rowNumber -= 1) {
    const row = worksheet.getRow(rowNumber)
    const labels: string[] = []
    row.eachCell({ includeEmpty: false }, (cell) => {
      const text = readCellText(cell)
      if (text) labels.push(text)
    })
    const materialLabel = labels.find(label => normalizeText(label).includes('MATERIAL'))
    if (materialLabel) return materialLabel
  }
  return ''
}

function readCellText(cell: ExcelJS.Cell): string {
  const value = readCellValue(cell)
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()

  const record = asRecord(value)
  const formulaResult = record.result
  if (formulaResult !== undefined && formulaResult !== null) return String(formulaResult).trim()

  const richText = Array.isArray(record.richText)
    ? record.richText.map(part => asRecord(part).text).filter((text): text is string => typeof text === 'string')
    : []
  if (richText.length > 0) return richText.join('').trim()

  if (typeof record.text === 'string') return record.text.trim()
  return ''
}

function readCellNumber(cell: ExcelJS.Cell): number | null {
  const value = readCellValue(cell)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object') {
    const result = asRecord(value).result
    if (typeof result === 'number' && Number.isFinite(result)) return result
    if (typeof result === 'string') return parseNumber(result)
  }
  if (typeof value === 'string') return parseNumber(value)
  return null
}

function readCellValue(cell: ExcelJS.Cell): unknown {
  if (cell.value !== null && cell.value !== undefined) return cell.value
  return cell.master?.value
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function mergeObservation(first: string, second: string): string {
  if (!first) return second
  if (!second) return first
  return `${first} | ${second}`
}

function parsePieceLetters(value: string): string[] {
  return value
    .toUpperCase()
    .match(/[A-Z]+/g)
    ?.filter(Boolean) ?? []
}

function edgeTypeFromMaterial(materialLabel: string): string {
  const normalized = normalizeText(materialLabel)
  if (normalized.includes('2MM') || normalized.includes('2 MM')) return '2 mm'
  if (normalized.includes('0.45') || normalized.includes('0,45')) return '0.45 mm'
  return ''
}

function readThicknessMm(label: string): number | null {
  const match = label.match(/(\d+(?:[.,]\d+)?)\s*mm/i)
  return match ? parseNumber(match[1]) : null
}

function sanitizeId(value: string): string {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'row'
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
