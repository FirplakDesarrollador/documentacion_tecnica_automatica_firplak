import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { Buffer } from 'node:buffer'
import { normalizeText } from '@/lib/isometrics/bulkMatch'
import { getResourceType } from '@/lib/resources/resourceTypes'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 60

type ParsedGroup = {
  similarity_code: string
  expected_svg_filename: string
  reference_ids: string[]
  family_codes: string[]
  reference_labels: Record<string, string>
  version_ids: string[]
  version_labels: Record<string, string>
}

function asString(v: unknown) {
  return String(v ?? '').trim()
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

export async function POST(req: Request) {
  const guard = await apiGuard('module:assets')
  if (guard.response) return guard.response

  try {
    const fd = await req.formData()
    const file = fd.get('file') as unknown as File | null
    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    const resourceType = getResourceType(new URL(req.url).searchParams.get('type')) || 'isometric'

    const buf = await file.arrayBuffer()
    const wb = new ExcelJS.Workbook()
    const workbookBuffer = Buffer.from(buf) as unknown as Parameters<typeof wb.xlsx.load>[0]
    await wb.xlsx.load(workbookBuffer)

    const ws = wb.getWorksheet('ORPHANS') || wb.worksheets[0]
    if (!ws) return NextResponse.json({ success: false, error: 'No worksheet found' }, { status: 400 })

    const headerRow = ws.getRow(1)
    const headers: string[] = []
    headerRow.eachCell((cell, col) => {
      headers[col - 1] = asString(cell.value)
    })

    const idx = (name: string) => headers.findIndex(h => normalizeText(h) === normalizeText(name))
    const iFamily = idx('family_code')
    const iRefCode = idx('reference_code')
    const iExpected = idx('expected_svg_filename')
    const iSim = idx('similarity_code')
    const iRefId = idx('reference_id')
    const iTargetType = idx('target_type')
    const iVersionCode = idx('version_code')
    const iVersionId = idx('version_id')

    const missing: string[] = []
    if (iFamily === -1) missing.push('family_code')
    if (iRefCode === -1) missing.push('reference_code')
    if (iExpected === -1) missing.push('expected_svg_filename')
    if (iSim === -1) missing.push('similarity_code')
    if (iRefId === -1) missing.push('reference_id')
    if (resourceType !== 'isometric') {
      if (iTargetType === -1) missing.push('target_type')
      if (iVersionCode === -1) missing.push('version_code')
      if (iVersionId === -1) missing.push('version_id')
    }
    if (missing.length) {
      return NextResponse.json({ success: false, error: `Missing required columns: ${missing.join(', ')}` }, { status: 400 })
    }

    const warnings: string[] = []
    const groups = new Map<string, ParsedGroup>()
    const allowedReferenceIds = new Set<string>()
    const expectedNameToGroup = new Map<string, string>()

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const family = asString(row.getCell(iFamily + 1).value)
      const refCode = asString(row.getCell(iRefCode + 1).value)
      const expectedRaw = asString(row.getCell(iExpected + 1).value)
      const expected = expectedRaw.replace(/\.svg$/i, '').trim()
      const sim = asString(row.getCell(iSim + 1).value)
      const refId = asString(row.getCell(iRefId + 1).value)
      const targetType = resourceType === 'isometric' ? 'reference' : asString(row.getCell(iTargetType + 1).value).toLowerCase()
      const versionCode = resourceType === 'isometric' ? '' : asString(row.getCell(iVersionCode + 1).value)
      const versionId = resourceType === 'isometric' ? '' : asString(row.getCell(iVersionId + 1).value)
      if (!family && !refCode && !expectedRaw && !sim && !refId && !versionId) continue

      if (!sim) {
        warnings.push(`Row ${r}: missing similarity_code`)
        continue
      }
      if (!expected) {
        warnings.push(`Row ${r}: missing expected_svg_filename`)
        continue
      }
      if (!refId || !isUuid(refId)) {
        warnings.push(`Row ${r}: invalid reference_id (family=${family} ref=${refCode})`)
        continue
      }
      if (targetType !== 'reference' && targetType !== 'version') {
        warnings.push(`Row ${r}: invalid target_type`)
        continue
      }
      if (targetType === 'version' && !isUuid(versionId)) {
        warnings.push(`Row ${r}: invalid version_id`)
        continue
      }

      allowedReferenceIds.add(refId)
      const g = groups.get(sim) || {
        similarity_code: sim,
        expected_svg_filename: expected,
        reference_ids: [],
        family_codes: [],
        reference_labels: {},
        version_ids: [],
        version_labels: {},
      }
      if (g.expected_svg_filename && normalizeText(g.expected_svg_filename) !== normalizeText(expected)) {
        // group must have one filename; keep first and warn
        warnings.push(`Row ${r}: similarity_code ${sim} has different expected_svg_filename; keeping first`)
      }
      if (targetType === 'reference') g.reference_ids.push(refId)
      else g.version_ids.push(versionId)
      if (family) g.family_codes.push(family)
      const label = [family, refCode].filter(Boolean).join('-')
      if (label) g.reference_labels[refId] = label
      if (targetType === 'version') {
        g.version_labels[versionId] = `${label || refId}${versionCode ? ` · V${versionCode}` : ''}`
      }
      groups.set(sim, g)

      const normExpectedBase = normalizeText(expected)
      const prev = expectedNameToGroup.get(normExpectedBase)
      if (prev && prev !== sim) {
        return NextResponse.json(
          { success: false, error: `Duplicate expected_svg_filename across groups: "${expected}" in ${prev} and ${sim}` },
          { status: 400 }
        )
      }
      expectedNameToGroup.set(normExpectedBase, sim)
    }

    const outGroups = Array.from(groups.values()).map(g => ({
      ...g,
      reference_ids: Array.from(new Set(g.reference_ids)),
      family_codes: Array.from(new Set(g.family_codes)),
      version_ids: Array.from(new Set(g.version_ids)),
    }))

    return NextResponse.json({
      success: true,
      groups: outGroups,
      allowed_reference_ids: Array.from(allowedReferenceIds),
      expected_filename_to_group: Object.fromEntries(expectedNameToGroup.entries()),
      warnings,
    })
  } catch (e: unknown) {
    console.error('[assets/orphans/parse] error', e)
    return NextResponse.json({ success: false, error: (e as Error).message || 'Parse failed' }, { status: 500 })
  }
}
