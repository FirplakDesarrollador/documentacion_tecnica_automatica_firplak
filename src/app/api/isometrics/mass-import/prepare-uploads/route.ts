import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { normalizeText } from '@/lib/isometrics/bulkMatch'
import { getIsometricMassImportSettings } from '@/lib/isometrics/massImportSettings'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 60

type PrepareUploadsRequest = {
  job_id?: string
  files: Array<{ sha256: string; ext: string; content_type?: string }>
}

function isValidSha256Hex(v: string) {
  return /^[a-f0-9]{64}$/i.test(v)
}

export async function POST(req: Request) {
  const guard = await apiGuard('admin')
  if (guard.response) return guard.response

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
    const body = (await req.json().catch(() => null)) as PrepareUploadsRequest | null
    if (!body || !Array.isArray(body.files)) {
      return NextResponse.json({ success: false, error: 'Invalid payload.' }, { status: 400 })
    }

    const unique = new Map<string, { sha256: string; ext: string; content_type?: string }>()
    for (const f of body.files) {
      const sha = String(f.sha256 || '').trim().toLowerCase()
      const extRaw = String(f.ext || '').trim().toLowerCase()
      if (!isValidSha256Hex(sha)) continue
      const ext = extRaw && extRaw.startsWith('.') ? extRaw : extRaw ? `.${extRaw}` : '.svg'
      const key = `${sha}|||${ext}`
      if (!unique.has(key)) unique.set(key, { sha256: sha, ext, content_type: f.content_type })
    }

    const list = Array.from(unique.values())
    if (list.length === 0) return NextResponse.json({ success: false, error: 'No valid files provided.' }, { status: 400 })
    if (list.length > safeMaxFilesPerApply) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many files for one request. Limit: ${safeMaxFilesPerApply}. Received: ${list.length}.`,
          error_code: 'ISOMETRIC_MASS_IMPORT_TOO_MANY_FILES',
        },
        { status: 400 }
      )
    }

    const out: Array<{ sha256: string; storage_path: string; token: string; signed_url: string }> = []
    for (const f of list) {
      const storagePath = `assets/isometrics/${f.sha256}${f.ext}`
      const { data, error } = await supabaseServer.storage.from('assets').createSignedUploadUrl(storagePath, {
        upsert: true,
      })
      if (error || !data?.token) {
        throw new Error(`Failed to create signed upload URL for ${normalizeText(storagePath)}: ${(error as { message?: string })?.message || 'unknown'}`)
      }
      out.push({
        sha256: f.sha256,
        storage_path: storagePath,
        token: data.token,
        signed_url: data.signedUrl,
      })
    }

    return NextResponse.json({ success: true, job_id: body.job_id || null, uploads: out })
  } catch (e: unknown) {
    console.error('[isometrics/mass-import/prepare-uploads] error', e)
    return NextResponse.json({ success: false, error: (e as Error).message || 'Prepare uploads failed' }, { status: 500 })
  }
}
