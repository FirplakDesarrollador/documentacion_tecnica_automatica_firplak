const fs = require('fs')
const path = require('path')
const ExcelJS = require('exceljs')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY)')
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '').trim())
}

function normalizeExpectedName(v) {
  return String(v || '')
    .trim()
    .replace(/\.svg$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isStorageKeyPath(p) {
  return String(p || '').trim().startsWith('assets/')
}

function buildPublicPrefix() {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  if (!base) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  return `${base}/storage/v1/object/public/assets/`
}

function looksLikeShaOrHashName(name) {
  const n = String(name || '').trim()
  if (!n) return true
  const base = n.replace(/\.svg$/i, '')
  return /^[a-f0-9]{64}$/i.test(base) || /^[a-f0-9]{64}\.svg$/i.test(n)
}

function stripSimilarityPrefix(name) {
  return String(name || '')
    .trim()
    .replace(/^S\d+\s*-\s*/i, '')
    .trim()
}

function commonTokens(names) {
  const cleaned = names.map(stripSimilarityPrefix).filter(Boolean)
  if (cleaned.length === 0) return ''
  const first = cleaned[0].split(/\s+/).filter(Boolean)
  const sets = cleaned.map(n => new Set(n.split(/\s+/).filter(Boolean)))
  const kept = []
  for (const tok of first) {
    if (sets.every(s => s.has(tok))) kept.push(tok)
  }
  return kept.join(' ').trim()
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function execSql(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { query_text: sql })
  if (error) throw new Error(`DB Query Error: ${error.message}`)
  return data
}

async function readOrphansExcel(filePath) {
  const buf = fs.readFileSync(filePath)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.getWorksheet('ORPHANS') || wb.worksheets[0]
  if (!ws) throw new Error('No worksheet found')

  const headers = []
  ws.getRow(1).eachCell((cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim()
  })
  const idx = name => headers.findIndex(h => h.trim().toLowerCase() === name.toLowerCase())
  const iSim = idx('similarity_code')
  const iExpected = idx('expected_svg_filename')
  const iRefId = idx('reference_id')
  if (iSim === -1 || iExpected === -1 || iRefId === -1) {
    throw new Error('Missing required columns: similarity_code, expected_svg_filename, reference_id')
  }

  const out = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const sim = String(row.getCell(iSim + 1).value ?? '').trim()
    const expectedRaw = String(row.getCell(iExpected + 1).value ?? '').trim()
    const referenceId = String(row.getCell(iRefId + 1).value ?? '').trim()
    if (!sim && !expectedRaw && !referenceId) continue
    if (!sim || !expectedRaw || !referenceId) continue
    if (!isUuid(referenceId)) continue
    out.push({ similarity_code: sim, expected_name: normalizeExpectedName(expectedRaw), reference_id: referenceId })
  }
  return out
}

async function run() {
  const excelPath = process.argv[2] || path.resolve(process.cwd(), 'artifacts', 'ORPHAN_REFERENCES_2026-05-15.xlsx')
  const doApply = process.argv.includes('--apply')
  const reportPathArg = process.argv.find(a => a.startsWith('--report='))
  const reportPath =
    (reportPathArg ? reportPathArg.split('=')[1] : null) ||
    path.resolve(process.cwd(), 'artifacts', `isometric_fix_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`)

  console.log('Excel:', excelPath)
  console.log('Mode:', doApply ? 'APPLY' : 'DRY_RUN')

  const prefix = buildPublicPrefix()

  const orphanRows = await readOrphansExcel(excelPath)
  if (orphanRows.length === 0) throw new Error('No valid rows found in Excel.')

  const expectedNameByRefId = new Map()
  for (const r of orphanRows) expectedNameByRefId.set(r.reference_id, r.expected_name)
  const referenceIds = Array.from(expectedNameByRefId.keys())
  console.log('References in Excel:', referenceIds.length)

  const refRows = new Map()
  for (const c of chunk(referenceIds, 500)) {
    const filter = `(${c.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`
    const rows =
      (await execSql(`
        SELECT id, isometric_asset_id, isometric_path
        FROM public.product_references
        WHERE id IN ${filter}
      `)) || []
    for (const r of rows) {
      refRows.set(String(r.id), {
        id: String(r.id),
        isometric_asset_id: r.isometric_asset_id ? String(r.isometric_asset_id) : null,
        isometric_path: r.isometric_path ? String(r.isometric_path) : null,
      })
    }
  }

  const assetIdByRefId = new Map()
  const assetIds = []
  const refUrlFixCandidates = []
  for (const refId of referenceIds) {
    const row = refRows.get(refId)
    if (!row) continue
    const assetId = row.isometric_asset_id && isUuid(row.isometric_asset_id) ? row.isometric_asset_id : ''
    if (assetId) {
      assetIdByRefId.set(refId, assetId)
      assetIds.push(assetId)
    }
    if (row.isometric_path && isStorageKeyPath(row.isometric_path)) refUrlFixCandidates.push(refId)
  }

  const uniqueAssetIds = Array.from(new Set(assetIds))
  const assetRows = new Map()
  for (const c of chunk(uniqueAssetIds, 500)) {
    const filter = `(${c.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`
    const rows =
      (await execSql(`
        SELECT id, name, file_path
        FROM public.assets
        WHERE id IN ${filter}
      `)) || []
    for (const r of rows) {
      assetRows.set(String(r.id), { id: String(r.id), name: r.name ? String(r.name) : null, file_path: r.file_path ? String(r.file_path) : null })
    }
  }

  const assetUrlFixCandidates = []
  for (const assetId of uniqueAssetIds) {
    const a = assetRows.get(assetId)
    if (a && a.file_path && isStorageKeyPath(a.file_path)) assetUrlFixCandidates.push(assetId)
  }

  const nameCountsByAsset = new Map()
  for (const [refId, assetId] of assetIdByRefId.entries()) {
    const expected = expectedNameByRefId.get(refId) || ''
    if (!expected) continue
    const m = nameCountsByAsset.get(assetId) || new Map()
    m.set(expected, (m.get(expected) || 0) + 1)
    nameCountsByAsset.set(assetId, m)
  }

  const conflicts = []
  const renames = []
  for (const [assetId, counts] of nameCountsByAsset.entries()) {
    const a = assetRows.get(assetId)
    const currentName = a ? a.name : null
    const expectedList = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name))
    if (expectedList.length === 0) continue
    if (!looksLikeShaOrHashName(currentName)) continue

    if (expectedList.length > 1) {
      conflicts.push({ asset_id: assetId, current_name: currentName, expected_names: expectedList })
      const common = commonTokens(expectedList.map(x => x.name))
      if (common && common.length >= 8) {
        renames.push({ asset_id: assetId, new_name: common, reason: 'conflict_common_tokens' })
        continue
      }
    }

    const winner = expectedList[0]
    renames.push({
      asset_id: assetId,
      new_name: winner.name,
      reason: expectedList.length === 1 ? 'single_expected_name' : `conflict_winner_by_count(${winner.count})`,
    })
  }

  const report = {
    excel_path: excelPath,
    references_in_excel: referenceIds.length,
    unique_assets_in_excel: uniqueAssetIds.length,
    asset_url_fix_candidates: assetUrlFixCandidates.length,
    reference_url_fix_candidates: refUrlFixCandidates.length,
    rename_candidates: renames.length,
    rename_conflicts: conflicts.length,
    conflicts,
    renames,
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log('Report:', reportPath)

  if (!doApply) {
    console.log('Dry-run complete. Re-run with --apply to execute updates.')
    return
  }

  let updatedAssetsUrl = 0
  for (const c of chunk(assetUrlFixCandidates, 500)) {
    const filter = `(${c.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`
    const rows =
      (await execSql(`
        WITH u AS (
          UPDATE public.assets
          SET file_path = '${prefix.replace(/'/g, "''")}' || file_path,
              updated_at = now()
          WHERE id IN ${filter}
            AND UPPER(type) = 'ISOMETRIC'
            AND file_path IS NOT NULL
            AND file_path LIKE 'assets/%'
          RETURNING 1
        )
        SELECT COUNT(*)::int AS c FROM u
      `)) || []
    updatedAssetsUrl += Number(rows?.[0]?.c || 0)
  }

  let updatedRefsUrl = 0
  for (const c of chunk(referenceIds, 500)) {
    const filter = `(${c.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`
    const rows =
      (await execSql(`
        WITH u AS (
          UPDATE public.product_references
          SET isometric_path = '${prefix.replace(/'/g, "''")}' || isometric_path,
              updated_at = now()
          WHERE id IN ${filter}
            AND isometric_path IS NOT NULL
            AND isometric_path LIKE 'assets/%'
          RETURNING 1
        )
        SELECT COUNT(*)::int AS c FROM u
      `)) || []
    updatedRefsUrl += Number(rows?.[0]?.c || 0)
  }

  let updatedVersUrl = 0
  for (const c of chunk(referenceIds, 500)) {
    const filter = `(${c.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`
    const rows =
      (await execSql(`
        WITH u AS (
          UPDATE public.product_versions v
          SET version_attrs = jsonb_set(
              COALESCE(v.version_attrs, '{}'::jsonb),
              '{isometric_path}',
              to_jsonb('${prefix.replace(/'/g, "''")}' || (v.version_attrs->>'isometric_path'))
          ),
          updated_at = now()
          WHERE v.reference_id IN ${filter}
            AND v.version_attrs ? 'isometric_path'
            AND (v.version_attrs->>'isometric_path') LIKE 'assets/%'
          RETURNING 1
        )
        SELECT COUNT(*)::int AS c FROM u
      `)) || []
    updatedVersUrl += Number(rows?.[0]?.c || 0)
  }

  let updatedNames = 0
  const byId = new Map()
  for (const r of renames) byId.set(r.asset_id, normalizeExpectedName(r.new_name))
  const renameEntries = Array.from(byId.entries())
  for (const c of chunk(renameEntries, 150)) {
    const ids = c.map(([id]) => id)
    const filter = `(${ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`
    const cases = c.map(([id, name]) => `WHEN '${id.replace(/'/g, "''")}' THEN '${String(name).replace(/'/g, "''")}'`).join('\n')
    const rows =
      (await execSql(`
        WITH u AS (
          UPDATE public.assets
          SET name = CASE id
            ${cases}
            ELSE name
          END,
          updated_at = now()
          WHERE id IN ${filter}
            AND UPPER(type) = 'ISOMETRIC'
          RETURNING 1
        )
        SELECT COUNT(*)::int AS c FROM u
      `)) || []
    updatedNames += Number(rows?.[0]?.c || 0)
  }

  // Verify renames (exec_sql may return a generic success object for DML; we validate by querying back).
  let verifiedRenames = 0
  for (const c of chunk(renameEntries, 500)) {
    const ids = c.map(([id]) => id)
    const filter = `(${ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`
    const rows =
      (await execSql(`
        SELECT id, name
        FROM public.assets
        WHERE id IN ${filter}
      `)) || []
    for (const r of rows) {
      const want = byId.get(String(r.id))
      if (want && String(r.name || '') === String(want)) verifiedRenames++
    }
  }

  console.log('Updated assets.file_path to public URL (candidates):', assetUrlFixCandidates.length)
  console.log('Updated product_references.isometric_path to public URL (scope refs):', referenceIds.length)
  console.log('Updated product_versions.version_attrs.isometric_path to public URL (scope refs):', referenceIds.length)
  console.log('Renamed assets.name verified:', `${verifiedRenames}/${renameEntries.length}`)
}

run().catch(err => {
  console.error(err?.message || err)
  process.exit(1)
})
