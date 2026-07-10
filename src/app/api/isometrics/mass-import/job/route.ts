import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/supabase'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const guard = await apiGuard('module:assets')
  if (guard.response) return guard.response

  try {
    const url = new URL(req.url)
    const id = String(url.searchParams.get('id') || '').trim()
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })

    const jobs =
      (await dbQuery(`
        SELECT *
        FROM public.bulk_isometric_import_jobs
        WHERE id = '${id.replace(/'/g, "''")}'
        LIMIT 1
      `)) || []
    const job = jobs?.[0]
    if (!job) return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 })

    const items =
      (await dbQuery(`
        SELECT *
        FROM public.bulk_isometric_import_items
        WHERE job_id = '${id.replace(/'/g, "''")}'
        ORDER BY created_at ASC
      `)) || []

    return NextResponse.json({ success: true, job, items })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Job fetch failed'
    console.error('[isometrics/mass-import/job] error', e)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
