import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/supabase'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 60

type ResolveConflictsRequest = {
  job_id: string
  selections: Record<string, string> // conflict_group_code -> item_id
}

export async function POST(req: Request) {
  const guard = await apiGuard('admin')
  if (guard.response) return guard.response

  try {
    const body = (await req.json().catch(() => null)) as ResolveConflictsRequest | null
    if (!body?.job_id || !body?.selections || typeof body.selections !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid payload.' }, { status: 400 })
    }

    const jobId = String(body.job_id)
    const selections = body.selections

    // Validate groups exist
    const groups = Object.keys(selections).map(s => String(s).trim()).filter(Boolean)
    if (groups.length === 0) {
      return NextResponse.json({ success: false, error: 'No selections provided.' }, { status: 400 })
    }

    // For each group: reset selected=false, then set selected=true for chosen item
    for (const groupCode of groups) {
      const itemId = String(selections[groupCode] || '').trim()
      if (!itemId) continue

      await dbQuery(`
        UPDATE public.bulk_isometric_import_items
        SET selected = false, updated_at = now()
        WHERE job_id = '${jobId.replace(/'/g, "''")}'
          AND conflict_group_code = '${groupCode.replace(/'/g, "''")}'
      `)

      const rows =
        (await dbQuery(`
          UPDATE public.bulk_isometric_import_items
          SET selected = true, updated_at = now()
          WHERE job_id = '${jobId.replace(/'/g, "''")}'
            AND conflict_group_code = '${groupCode.replace(/'/g, "''")}'
            AND id = '${itemId.replace(/'/g, "''")}'
          RETURNING id
        `)) || []
      if (!rows?.[0]?.id) {
        return NextResponse.json(
          { success: false, error: `Invalid selection for ${groupCode}. Item not found in job.` },
          { status: 400 }
        )
      }
    }

    await dbQuery(`
      UPDATE public.bulk_isometric_import_jobs
      SET status = 'ready_to_apply', updated_at = now()
      WHERE id = '${jobId.replace(/'/g, "''")}'
    `)

    return NextResponse.json({ success: true, job_id: jobId })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Resolve failed'
    console.error('[isometrics/mass-import/resolve-conflicts] error', e)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
