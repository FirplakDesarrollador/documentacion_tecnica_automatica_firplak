import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/supabase'
import { getIsometricMassImportSettings } from '@/lib/isometrics/massImportSettings'
import { revalidatePath, revalidateTag } from 'next/cache'

export const runtime = 'nodejs'
export const maxDuration = 60

type ApplyChunkRequest = {
  job_id?: string
  overwriteExisting?: boolean
  items: Array<{
    // Stateful mode (with DB job/items)
    item_id?: string
    // Stateless mode (no DB job/items)
    relative_path?: string
    target_granularity?: 'reference' | 'version'
    target_reference_ids?: string[]
    target_version_ids?: string[]
    conflict_group_code?: string | null
    sha256: string
    ext: string
  }>
}

function isValidSha256Hex(v: string) {
  return /^[a-f0-9]{64}$/i.test(String(v || '').trim())
}

async function revalidateValidationSweepEverywhere() {
  revalidateTag('validation-sweep', { expire: 0 })
  const remoteUrl = process.env.REVALIDATE_REMOTE_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!remoteUrl || !secret) return
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    await fetch(remoteUrl, {
      method: 'POST',
      headers: { 'x-revalidate-secret': secret },
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {
    // non-blocking
  }
}

function getPublicAssetUrlForStoragePath(storagePath: string) {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  if (!base) return storagePath
  // bucket name is "assets"
  return `${base}/storage/v1/object/public/assets/${storagePath.replace(/^\//, '')}`
}

function stripExtension(fileName: string) {
  const idx = fileName.lastIndexOf('.')
  if (idx > 0) return fileName.slice(0, idx)
  return fileName
}

function pickDesiredAssetName(relativePath: string, storagePath: string) {
  const raw = String(relativePath || '').trim()
  if (raw) {
    const last = raw.split(/[\\/]/).pop() || raw
    const base = stripExtension(last).trim()
    if (base) return base
  }
  const fallback = storagePath.split('/').pop() || 'isometric'
  return stripExtension(fallback).trim() || 'isometric'
}

async function getOrCreateIsometricAsset(storagePath: string, desiredName: string) {
  const publicUrl = getPublicAssetUrlForStoragePath(storagePath)
  const existing =
    (await dbQuery(`
      SELECT id, name, file_path
      FROM public.assets
      WHERE type = 'isometric'
        AND (file_path = '${publicUrl.replace(/'/g, "''")}' OR file_path = '${storagePath.replace(/'/g, "''")}')
      ORDER BY created_at DESC
      LIMIT 1
    `)) || []
  if (existing?.[0]?.id) {
    const id = String(existing[0].id)
    const currentPath = String(existing[0].file_path || '')
    const currentName = String(existing[0].name || '')

    const wantsPathFix = currentPath === storagePath && publicUrl !== storagePath
    const storageBasename = storagePath.split('/').pop() || ''
    const wantsNameFix = desiredName && currentName && currentName === storageBasename

    if (wantsPathFix || wantsNameFix) {
      const parts: string[] = []
      if (wantsPathFix) parts.push(`file_path = '${publicUrl.replace(/'/g, "''")}'`)
      if (wantsNameFix) parts.push(`name = '${desiredName.replace(/'/g, "''")}'`)
      await dbQuery(`
        UPDATE public.assets
        SET ${parts.join(', ')}, updated_at = now()
        WHERE id = '${id.replace(/'/g, "''")}'
      `)
    }

    return id
  }

  const created =
    (await dbQuery(`
      INSERT INTO public.assets (name, type, file_path)
      VALUES (
        '${desiredName.replace(/'/g, "''") || 'isometric'}',
        'isometric',
        '${publicUrl.replace(/'/g, "''")}'
      )
      RETURNING id
    `)) || []
  return String(created?.[0]?.id || '')
}

export async function POST(req: Request) {
  const { executeEnabled, safeMaxFilesPerApply } = await getIsometricMassImportSettings()
  if (!executeEnabled) {
    return NextResponse.json(
      {
        success: false,
        error: 'Isometric mass-import is disabled by settings (isometric_mass_import_execute_enabled=false).',
        error_code: 'ISOMETRIC_MASS_IMPORT_DISABLED',
      },
      { status: 400 }
    )
  }

  try {
    const body = (await req.json().catch(() => null)) as ApplyChunkRequest | null
    if (!body || !Array.isArray(body.items)) {
      return NextResponse.json({ success: false, error: 'Invalid payload.' }, { status: 400 })
    }

    const jobId = body.job_id ? String(body.job_id) : ''
    const overwrite = body.overwriteExisting !== false

    const items = body.items
      .map(i => ({
        item_id: String(i.item_id || '').trim(),
        relative_path: String(i.relative_path || '').trim(),
        target_granularity: (i.target_granularity === 'version' ? 'version' : 'reference') as 'reference' | 'version',
        target_reference_ids: Array.isArray(i.target_reference_ids) ? i.target_reference_ids.map(String) : [],
        target_version_ids: Array.isArray(i.target_version_ids) ? i.target_version_ids.map(String) : [],
        conflict_group_code: i.conflict_group_code ? String(i.conflict_group_code) : null,
        sha256: String(i.sha256 || '').trim().toLowerCase(),
        ext: String(i.ext || '').trim().toLowerCase(),
      }))
      .filter(i => isValidSha256Hex(i.sha256))

    if (items.length === 0) return NextResponse.json({ success: false, error: 'No valid items provided.' }, { status: 400 })
    if (items.length > safeMaxFilesPerApply) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many items for one request. Limit: ${safeMaxFilesPerApply}. Received: ${items.length}.`,
          error_code: 'ISOMETRIC_MASS_IMPORT_TOO_MANY_ITEMS',
        },
        { status: 400 }
      )
    }

    if (jobId) {
      try {
        await dbQuery(`
          UPDATE public.bulk_isometric_import_jobs
          SET status = 'applying', updated_at = now()
          WHERE id = '${jobId.replace(/'/g, "''")}'
        `)
      } catch {
        // If tables are missing, we still allow stateless apply.
      }
    }

    const results: Array<{ item_id: string; ok: boolean; error?: string; updated_refs?: number; updated_versions?: number }> = []
    let appliedOk = 0
    let appliedErr = 0

    for (const it of items) {
      const storagePath = `assets/isometrics/${it.sha256}${it.ext && it.ext.startsWith('.') ? it.ext : '.svg'}`
      try {
        const publicUrl = getPublicAssetUrlForStoragePath(storagePath)
        const desiredName = pickDesiredAssetName(it.relative_path, storagePath)
        let refIds: string[] = []
        let verIds: string[] = []

        // Stateful mode: lookup item in DB.
        if (jobId && it.item_id) {
          const rows =
            (await dbQuery(`
              SELECT
                id,
                match_status,
                selected,
                conflict_group_code,
                target_reference_ids,
                target_version_ids
              FROM public.bulk_isometric_import_items
              WHERE id = '${it.item_id.replace(/'/g, "''")}'
                AND job_id = '${jobId.replace(/'/g, "''")}'
              LIMIT 1
            `)) || []

          const row = rows?.[0]
          if (!row?.id) throw new Error('Item not found for job.')

          const matchStatus = String(row.match_status || '')
          const conflictGroup = row.conflict_group_code ? String(row.conflict_group_code) : null
          const selected = Boolean(row.selected)

          const eligible =
            matchStatus === 'MATCH_OK_REFERENCE' ||
            matchStatus === 'MATCH_OK_VERSION_OVERRIDE' ||
            matchStatus === 'CONFLICT_REF'
          if (!eligible) throw new Error(`Item is not eligible for apply (status=${matchStatus}).`)
          if (conflictGroup && !selected) throw new Error(`Conflict group ${conflictGroup} not resolved for this item (selected=false).`)

          const rowRefIds = Array.isArray(row.target_reference_ids) ? row.target_reference_ids.map(String) : []
          const rowVerIds = Array.isArray(row.target_version_ids) ? row.target_version_ids.map(String) : []

          // Allow client to apply a subset of the planned targets (e.g. when a filename matches multiple refs but user confirms only one).
          // Safety: we only accept IDs that are contained in the DB-planned targets for that item.
          const requestedRefIds = Array.isArray(it.target_reference_ids) ? it.target_reference_ids.map(String) : []
          const requestedVerIds = Array.isArray(it.target_version_ids) ? it.target_version_ids.map(String) : []

          refIds = requestedRefIds.length > 0 ? requestedRefIds.filter(id => rowRefIds.includes(id)) : rowRefIds
          verIds = requestedVerIds.length > 0 ? requestedVerIds.filter(id => rowVerIds.includes(id)) : rowVerIds

          if (it.target_granularity === 'reference' && refIds.length === 0) {
            throw new Error('No valid target_reference_ids provided (subset empty).')
          }
          if (it.target_granularity === 'version' && verIds.length === 0) {
            throw new Error('No valid target_version_ids provided (subset empty).')
          }
        } else {
          // Stateless mode: targets must be provided by the client.
          refIds = it.target_reference_ids
          verIds = it.target_version_ids
          if (it.target_granularity === 'version' && verIds.length === 0) throw new Error('No target_version_ids provided.')
          if (it.target_granularity === 'reference' && refIds.length === 0) throw new Error('No target_reference_ids provided.')
        }

        const assetId = await getOrCreateIsometricAsset(storagePath, desiredName)
        if (!assetId) throw new Error('Failed to create/reuse asset.')

        if (jobId && it.item_id) {
          await dbQuery(`
            UPDATE public.bulk_isometric_import_items
            SET sha256 = '${it.sha256.replace(/'/g, "''")}',
                storage_path = '${storagePath.replace(/'/g, "''")}',
                updated_at = now()
            WHERE id = '${it.item_id.replace(/'/g, "''")}'
          `)
        }

        let updatedRefs = 0
        let updatedVersions = 0

        if (verIds.length > 0) {
          const filter = `(${verIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`
          if (!overwrite) {
            await dbQuery(`
              UPDATE public.product_versions
              SET version_attrs = jsonb_set(
                    jsonb_set(COALESCE(version_attrs, '{}'::jsonb), '{isometric_asset_id}', '\"${assetId.replace(/"/g, '\\"')}\"'),
                    '{isometric_path}', '\"${publicUrl.replace(/"/g, '\\"')}\"'
                  ),
                  updated_at = now()
              WHERE id IN ${filter}
                AND COALESCE(version_attrs->>'isometric_asset_id','') = ''
                AND COALESCE(version_attrs->>'isometric_path','') = ''
            `)
          } else {
            await dbQuery(`
              UPDATE public.product_versions
              SET version_attrs = jsonb_set(
                    jsonb_set(COALESCE(version_attrs, '{}'::jsonb), '{isometric_asset_id}', '\"${assetId.replace(/"/g, '\\"')}\"'),
                    '{isometric_path}', '\"${publicUrl.replace(/"/g, '\\"')}\"'
                  ),
                  updated_at = now()
              WHERE id IN ${filter}
            `)
          }

          const verify =
            (await dbQuery(`
              SELECT COUNT(*)::int as c
              FROM public.product_versions
              WHERE id IN ${filter}
                AND version_attrs->>'isometric_asset_id' = '${assetId.replace(/'/g, "''")}'
            `)) || []
          updatedVersions = Number(verify?.[0]?.c || 0)
        } else if (refIds.length > 0) {
          const filter = `(${refIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`
          if (!overwrite) {
            await dbQuery(`
              UPDATE public.product_references
              SET isometric_asset_id = '${assetId.replace(/'/g, "''")}',
                  isometric_path = '${publicUrl.replace(/'/g, "''")}',
                  updated_at = now()
              WHERE id IN ${filter}
                AND (isometric_asset_id IS NULL OR isometric_asset_id = '')
                AND (isometric_path IS NULL OR isometric_path = '')
            `)
          } else {
            await dbQuery(`
              UPDATE public.product_references
              SET isometric_asset_id = '${assetId.replace(/'/g, "''")}',
                  isometric_path = '${publicUrl.replace(/'/g, "''")}',
                  updated_at = now()
              WHERE id IN ${filter}
            `)
          }
          const verify =
            (await dbQuery(`
              SELECT COUNT(*)::int as c
              FROM public.product_references
              WHERE id IN ${filter}
                AND isometric_asset_id = '${assetId.replace(/'/g, "''")}'
            `)) || []
          updatedRefs = Number(verify?.[0]?.c || 0)
        } else {
          throw new Error('No targets found on item.')
        }

        if (jobId && it.item_id) {
          await dbQuery(`
            UPDATE public.bulk_isometric_import_items
            SET applied_at = now(),
                error = NULL,
                updated_at = now()
            WHERE id = '${it.item_id.replace(/'/g, "''")}'
          `)
        }

        results.push({
          item_id: it.item_id || it.relative_path || storagePath,
          ok: true,
          updated_refs: updatedRefs,
          updated_versions: updatedVersions,
        })
        appliedOk++
      } catch (err: any) {
        const msg = err?.message || 'Apply failed'
        if (jobId && it.item_id) {
          await dbQuery(`
            UPDATE public.bulk_isometric_import_items
            SET error = '${String(msg).replace(/'/g, "''")}',
                updated_at = now()
            WHERE id = '${it.item_id.replace(/'/g, "''")}'
              AND job_id = '${jobId.replace(/'/g, "''")}'
          `)
        }
        results.push({ item_id: it.item_id || it.relative_path || storagePath, ok: false, error: msg })
        appliedErr++
      }
    }

    if (jobId) {
      try {
        await dbQuery(`
          UPDATE public.bulk_isometric_import_jobs
          SET applied_ok = applied_ok + ${appliedOk},
              applied_err = applied_err + ${appliedErr},
              updated_at = now()
          WHERE id = '${jobId.replace(/'/g, "''")}'
        `)
      } catch {
        // ignore
      }
    }

    revalidatePath('/assets')
    revalidatePath('/products')
    revalidatePath('/exceptions')
    await revalidateValidationSweepEverywhere()

    return NextResponse.json({ success: true, job_id: jobId || null, applied_ok: appliedOk, applied_err: appliedErr, results })
  } catch (e: any) {
    console.error('[isometrics/mass-import/apply-chunk] error', e)
    return NextResponse.json({ success: false, error: e?.message || 'Apply chunk failed' }, { status: 500 })
  }
}
