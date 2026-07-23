import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { parseCabinetRouteWorkbook } from '../cabinetRouteExcel'
import { suggestMaterialRole, type CabinetPieceRow } from '../cabinets'
import * as path from 'path'

const ARTIFACTS = path.resolve(process.cwd(), 'artifacts')
const ELEVADO_PATH = path.join(ARTIFACTS, 'HOJA DE RUTA MUEBLE BASICO ELEVAO 48X38.xlsx')
const MACAO_PATH = path.join(ARTIFACTS, 'Hoja De Ruta Macao 48x43 Class .xlsx')

async function readExcelBuffer(filePath: string): Promise<Buffer> {
  const fs = await import('fs')
  return fs.readFileSync(filePath)
}

function pieceByLetter(pieces: CabinetPieceRow[], letter: string): CabinetPieceRow | undefined {
  return pieces.find(p => p.letter === letter)
}

describe('VBAN05-0001 — Elevado 48x38', () => {
  let draft: Awaited<ReturnType<typeof parseCabinetRouteWorkbook>>

  it('parses the Excel without errors', async () => {
    const buf = await readExcelBuffer(ELEVADO_PATH)
    draft = await parseCabinetRouteWorkbook(buf, 'HOJA DE RUTA MUEBLE BASICO ELEVAO 48X38.xlsx')
    assert.equal(draft.warnings.length, 0, `Parser warnings: ${draft.warnings.join(', ')}`)
  })

  it('LM produces exactly 6 pieces', () => {
    assert.equal(draft.pieces.length, 6)
  })

  it('LM has no drawer_bottom pieces (no fondo)', () => {
    const drawer = draft.pieces.filter(p => p.material_role === 'drawer_bottom')
    assert.equal(drawer.length, 0)
  })

  it('LM pieces have correct letters and roles', () => {
    const roles: Record<string, string> = {}
    for (const p of draft.pieces) roles[p.letter] = p.material_role ?? ''

    assert.equal(roles['A'], 'structure')
    assert.equal(roles['B'], 'structure')
    assert.equal(roles['C'], 'structure')
    assert.equal(roles['E'], 'structure')
    assert.equal(roles['F'], 'structure')
    assert.equal(roles['D'], 'front')
  })

  it('LM pieces have correct dimensions', () => {
    const base = pieceByLetter(draft.pieces, 'A')
    assert.equal(base?.length_mm, 474)
    assert.equal(base?.width_mm, 359)
    assert.equal(base?.quantity, 1)

    const door = pieceByLetter(draft.pieces, 'D')
    assert.equal(door?.length_mm, 445)
    assert.equal(door?.width_mm, 471)
    assert.equal(door?.quantity, 1)
  })

  it('LM edge consumption — 0.45mm total = 6.72m', () => {
    const pieces045 = draft.pieces.filter(p => p.edge_type === '0.45 mm')
    const total = pieces045.reduce((sum, p) => {
      const len = p.length_mm ?? 0
      const wid = p.width_mm ?? 0
      const mm = (p.edge_long_sides * (len + 50) + p.edge_short_sides * (wid + 50)) * (p.quantity ?? 1)
      return sum + mm / 1000
    }, 0)
    assert.ok(Math.abs(total - 6.72) < 0.01, `Expected 6.72m, got ${total}`)
  })

  it('LM edge consumption — 2mm total = 2.032m', () => {
    const pieces2 = draft.pieces.filter(p => p.edge_type === '2 mm')
    const total = pieces2.reduce((sum, p) => {
      const len = p.length_mm ?? 0
      const wid = p.width_mm ?? 0
      const mm = (p.edge_long_sides * (len + 50) + p.edge_short_sides * (wid + 50)) * (p.quantity ?? 1)
      return sum + mm / 1000
    }, 0)
    assert.ok(Math.abs(total - 2.032) < 0.01, `Expected 2.032m, got ${total}`)
  })

  it('LM edge consumption per piece uses 50mm formula', () => {
    const door = pieceByLetter(draft.pieces, 'D')!
    const len = door.length_mm ?? 0
    const wid = door.width_mm ?? 0
    const expected = (2 * (len + 50) + 2 * (wid + 50)) / 1000
    const actual = (door.edge_long_sides * (len + 50) + door.edge_short_sides * (wid + 50)) / 1000
    assert.equal(actual, expected)
  })

  it('LM produces 5 packing levels', () => {
    assert.equal(draft.packing_levels.length, 5)
    assert.deepEqual(draft.packing_levels.map(l => l.level), [1, 2, 3, 4, 5])
  })

  it('LM packing level 1 = D (puerta)', () => {
    assert.deepEqual(draft.packing_levels[0].piece_letters, ['D'])
  })

  it('LM packing level 5 = E,F (refuerzos)', () => {
    const last = draft.packing_levels[draft.packing_levels.length - 1]
    assert.deepEqual(last.piece_letters, ['E', 'F'])
  })

  it('Herrajes — exactly 12 positive rows', () => {
    const total = draft.hardware_rows.length + draft.packing_rows.length
    assert.equal(total, 12)
  })

  it('Herrajes — no row has quantity zero', () => {
    for (const row of draft.hardware_rows) {
      assert.ok(row.quantity > 0, `Hardware row ${row.item_code} has qty=${row.quantity}`)
    }
    for (const row of draft.packing_rows) {
      assert.ok(row.quantity > 0, `Packing row ${row.item_code} has qty=${row.quantity}`)
    }
  })

  it('Herrajes — rows are classified as hardware, assembly_supply, or packaging', () => {
    const codePrefixes = draft.hardware_rows.map(r => r.item_code).join(',')
    const packPrefixes = draft.packing_rows.map(r => r.item_code).join(',')

    assert.ok(codePrefixes.includes('CMPD07-0002'), 'MANIJA should be hardware')
    assert.ok(codePrefixes.includes('CMPD07-0169'), 'BISAGRA should be hardware')

    assert.ok(packPrefixes.includes('CEMP03-0046'), 'BOLSA should be packaging')
    assert.ok(packPrefixes.includes('CEMP03-0050'), 'GRAPAS should be packaging')
  })

  it('Herrajes — no columns E/I/J data in output', () => {
    for (const row of draft.hardware_rows) {
      assert.ok(!row.observation.includes('MP-04'), `Row ${row.item_code} should not contain MP-04`)
    }
    for (const row of draft.packing_rows) {
      assert.ok(!row.observation.includes('MP-04'), `Row ${row.item_code} should not contain MP-04`)
    }
  })

  it('Herrajes — incomplete CEMP03 codes reported', () => {
    const cemp03 = draft.packing_rows.filter(r => r.item_code === 'CEMP03')
    assert.equal(cemp03.length, 3)
    for (const row of cemp03) {
      assert.ok(row.item_name, `CEMP03 row missing item_name`)
    }
  })

  it('Optimización — 3 consumptions (T1+T2 from Opt1, T1 from Opt2)', () => {
    assert.equal(draft.board_consumptions.length, 3)
  })

  it('Optimización — all consumptions are global (not per-role)', () => {
    for (const block of draft.board_consumptions) {
      assert.ok(block.material_label.includes('15mm') || block.material_label.includes('15'), block.material_label)
    }
  })

  it('Optimización — consumptions have units and sheet counts', () => {
    for (const block of draft.board_consumptions) {
      assert.ok(block.units_per_board != null, `Block ${block.id} missing units_per_board`)
      assert.ok(block.board_count != null, `Block ${block.id} missing board_count`)
    }
  })

  it('Optimización — Opt1 T1: 5 units, 1 board, board_size set', () => {
    const t1 = draft.board_consumptions.find(c => c.id.includes('optimizacion_1') && c.id.includes('t1'))
    assert.ok(t1, `Opt1 T1 not found. IDs: ${draft.board_consumptions.map(c => c.id).join(', ')}`)
    assert.equal(t1?.units_per_board, 5)
    assert.equal(t1?.board_count, 1)
    assert.ok(t1?.board_size_label?.includes('1830x2440'), `Expected 1830x2440, got ${t1?.board_size_label}`)
  })

  it('Optimización — Opt2: 25 units, 5 boards', () => {
    const opt2 = draft.board_consumptions.find(c => c.id.includes('optimizacion_2'))
    assert.ok(opt2, `Opt2 not found. IDs: ${draft.board_consumptions.map(c => c.id).join(', ')}`)
    assert.equal(opt2?.units_per_board, 25)
    assert.equal(opt2?.board_count, 5)
  })

  it('Analisis de area — net area = 0.797991 m2 (recalculated from LM)', () => {
    const netArea = draft.pieces.reduce((sum, p) => {
      const len = p.length_mm ?? 0
      const wid = p.width_mm ?? 0
      return sum + (len / 1000) * (wid / 1000) * (p.quantity ?? 1)
    }, 0)
    assert.ok(Math.abs(netArea - 0.797991) < 0.001, `Expected 0.797991, got ${netArea}`)
  })

  it('Analisis de area — area by role (structure=0.588396, front=0.209595)', () => {
    let structureArea = 0
    let frontArea = 0
    for (const p of draft.pieces) {
      const area = ((p.length_mm ?? 0) / 1000) * ((p.width_mm ?? 0) / 1000) * (p.quantity ?? 1)
      if (p.material_role === 'structure') structureArea += area
      if (p.material_role === 'front') frontArea += area
    }
    assert.ok(Math.abs(structureArea - 0.588396) < 0.001, `Structure area expected 0.588396, got ${structureArea}`)
    assert.ok(Math.abs(frontArea - 0.209595) < 0.001, `Front area expected 0.209595, got ${frontArea}`)
  })
})

describe('VBAN12-0081 — Macao 48x43 (parser only, BOM not validated)', () => {
  let draft: Awaited<ReturnType<typeof parseCabinetRouteWorkbook>>

  it('parses the Macao Excel without errors', async () => {
    const buf = await readExcelBuffer(MACAO_PATH)
    draft = await parseCabinetRouteWorkbook(buf, 'Hoja De Ruta Macao 48x43 Class .xlsx')
    assert.equal(draft.warnings.length, 0, `Parser warnings: ${draft.warnings.join(', ')}`)
  })

  it('LM produces 14 board pieces (A-N)', () => {
    assert.equal(draft.pieces.length, 14)
  })

  it('LM has a fondo piece (drawer_bottom)', () => {
    const fondo = draft.pieces.find(p => p.material_role === 'drawer_bottom')
    assert.ok(fondo, 'No drawer_bottom piece found')
    assert.equal(fondo?.letter, 'N')
    assert.equal(fondo?.piece_name.toLowerCase(), 'fondo')
  })

  it('LM has inner_structure pieces (entrepano, cajon parts)', () => {
    const inner = draft.pieces.filter(p => p.material_role === 'inner_structure')
    assert.ok(inner.length >= 4, `Expected >=4 inner_structure pieces, got ${inner.length}`)
  })

  it('LM has 3 front pieces (2 puertas + 1 parche)', () => {
    const fronts = draft.pieces.filter(p => p.material_role === 'front')
    assert.equal(fronts.length, 3)
  })

  it('LM pieces have correct letters A-N', () => {
    const letters = draft.pieces.map(p => p.letter).sort()
    assert.deepEqual(letters, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'])
  })

  it('LM produces 7 packing levels', () => {
    assert.equal(draft.packing_levels.length, 7)
    assert.equal(draft.packing_levels[6].level, 7)
    assert.deepEqual(draft.packing_levels[6].piece_letters, ['N'])
  })

  it('Herrajes — exactly 11 positive rows', () => {
    const total = draft.hardware_rows.length + draft.packing_rows.length
    assert.equal(total, 11)
  })

  it('Herrajes — no zero-quantity rows', () => {
    for (const row of [...draft.hardware_rows, ...draft.packing_rows]) {
      assert.ok(row.quantity > 0, `Row ${row.item_code} has qty=${row.quantity}`)
    }
  })

  it('Optimización — 3 consumptions detected (T1+T2 from Opt1, T1 from Opt 6mm)', () => {
    assert.equal(draft.board_consumptions.length, 3)
  })
})

describe('suggestMaterialRole', () => {
  it('BASE → structure', () => {
    assert.equal(suggestMaterialRole('BASE', 'Material 15mm'), 'structure')
  })

  it('PUERTA → front', () => {
    assert.equal(suggestMaterialRole('puerta', 'Material 2mm'), 'front')
  })

  it('FONDO → drawer_bottom', () => {
    assert.equal(suggestMaterialRole('fondo', 'Material 6mm'), 'drawer_bottom')
  })

  it('ENTREPAÑO → inner_structure', () => {
    assert.equal(suggestMaterialRole('entrepano', 'Material 15mm'), 'inner_structure')
  })

  it('LATERAL CAJON → inner_structure', () => {
    assert.equal(suggestMaterialRole('LATERAL CAJON DERECHO', 'Material 15mm'), 'inner_structure')
  })

  it('GOLA → inner_structure (editable)', () => {
    assert.equal(suggestMaterialRole('GOLA CAJONES MUEBLE', 'Material 15mm'), 'inner_structure')
  })

  it('PARCHE → front', () => {
    assert.equal(suggestMaterialRole('PARCHE CAJON', 'Material 15mm'), 'front')
  })
})
