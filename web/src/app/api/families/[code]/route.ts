import { dbQuery } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ code: string }> }
) {
  const params = await paramsPromise
  const code = params.code

  try {
    const rows = await dbQuery(`
        SELECT * FROM public.familias WHERE code = '${code.replace(/'/g, "''")}' LIMIT 1
    `)

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Family not found' }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
