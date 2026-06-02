import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import crypto from 'crypto'
import { getOrphanReferencesAction, type OrphanReferenceRow } from '@/app/assets/orphans-actions'
import { normalizeAccessory, normalizeLine, normalizeSpecialLabel, normalizeText, normalizeProductName, normalizeCommercialMeasure } from '@/lib/isometrics/bulkMatch'

export const runtime = 'nodejs'
export const maxDuration = 60

function buildGroupKeyNorm(r: {
  family_code: string | null
  designation: string | null
  commercial_measure: string | null
  accessory_text: string | null
  special_label: string | null
  product_name: string | null
  line: string | null
}) {
  return [
    normalizeText(r.family_code),
    normalizeText(r.designation),
    normalizeCommercialMeasure(r.commercial_measure),
    normalizeAccessory(r.accessory_text),
    normalizeSpecialLabel(r.special_label),
    normalizeProductName(r.product_name),
    normalizeLine(r.line),
  ].join('|||')
}

function buildExpectedSvgFilename(similarityCode: string, g: OrphanReferenceRow) {
  const parts: string[] = []
  const designation = normalizeText(g.designation)
  const productNameRaw = String(g.product_name || '').trim()
  const family = normalizeText(g.family_code)
  const measure = normalizeCommercialMeasure(g.commercial_measure)
  const special = normalizeSpecialLabel(g.special_label)
  const accessory = normalizeAccessory(g.accessory_text)

  if (designation && designation !== 'NA') parts.push(designation)
  if (productNameRaw && normalizeText(productNameRaw) !== 'NA') parts.push(productNameRaw)
  if (family && family !== 'NA') parts.push(family)
  if (measure && measure !== 'NA') parts.push(measure)
  if (special && special !== 'NA') parts.push(special)
  if (accessory && accessory !== 'NA') parts.push(accessory)

  const base = `${similarityCode} - ${parts.join(' ')}`.replace(/\s+/g, ' ').trim()
  // NOTE: We intentionally do NOT append ".svg" so the suggested name is extension-agnostic.
  return base
}

export async function GET() {
  try {
    const orphans = await getOrphanReferencesAction()

    const groupKeyToRefs = new Map<string, typeof orphans>()
    for (const r of orphans) {
      const key = buildGroupKeyNorm(r)
      const list = groupKeyToRefs.get(key) || []
      list.push(r)
      groupKeyToRefs.set(key, list)
    }

    const keys = Array.from(groupKeyToRefs.keys()).sort()
    const groupMeta = new Map<string, { similarity_code: string; group_key_norm: string; expected_svg_filename: string }>()
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      const similarityCode = `S${i + 1}`
      const groupHash = crypto.createHash('sha256').update(key).digest('hex')
      const sample = groupKeyToRefs.get(key)![0]!
      groupMeta.set(key, {
        similarity_code: similarityCode,
        group_key_norm: groupHash,
        expected_svg_filename: buildExpectedSvgFilename(similarityCode, sample),
      })
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'FIRPLAK'
    wb.created = new Date()
    const ws = wb.addWorksheet('ORPHANS')

    ws.columns = [
      { header: 'family_code', key: 'family_code', width: 12 },
      { header: 'reference_code', key: 'reference_code', width: 14 },
      { header: 'expected_svg_filename', key: 'expected_svg_filename', width: 70 },
      { header: 'similarity_code', key: 'similarity_code', width: 10 },
      { header: 'designation', key: 'designation', width: 18 },
      { header: 'product_name', key: 'product_name', width: 16 },
      { header: 'commercial_measure', key: 'commercial_measure', width: 16 },
      { header: 'accessory_text', key: 'accessory_text', width: 22 },
      { header: 'special_label', key: 'special_label', width: 26 },
      { header: 'line', key: 'line', width: 14 },
      { header: 'reference_id', key: 'reference_id', width: 36, hidden: true },
      { header: 'group_key_norm', key: 'group_key_norm', width: 64, hidden: true },
    ]

    for (const r of orphans) {
      const key = buildGroupKeyNorm(r)
      const meta = groupMeta.get(key)!
      ws.addRow({
        family_code: r.family_code || '',
        reference_code: r.reference_code || '',
        expected_svg_filename: meta.expected_svg_filename,
        similarity_code: meta.similarity_code,
        designation: r.designation || '',
        product_name: r.product_name || '',
        commercial_measure: r.commercial_measure || '',
        accessory_text: r.accessory_text || '',
        special_label: r.special_label || '',
        line: r.line || '',
        reference_id: r.reference_id,
        group_key_norm: meta.group_key_norm,
      })
    }

    // Style header
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]

    const buffer = await wb.xlsx.writeBuffer()
    const filename = `ORPHAN_REFERENCES_${new Date().toISOString().slice(0, 10)}.xlsx`
    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: unknown) {
    console.error('[assets/orphans/export] error', e)
    return NextResponse.json({ success: false, error: (e as Error).message || 'Export failed' }, { status: 500 })
  }
}
