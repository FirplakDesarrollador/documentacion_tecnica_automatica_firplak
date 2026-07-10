import { dbQuery } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { apiGuard } from '@/utils/auth/access'

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ code: string }> }
) {
  const guard = await apiGuard('module:configuration')
  if (guard.response) return guard.response

  const params = await paramsPromise
  const code = params.code

  try {
    const rows = await dbQuery(`
        SELECT 
            family_code as code, 
            family_name as name, 
            product_type, 
            use_destination, 
            zone_home,
            manufacturing_process,
            rh_default,
            assembled_default,
            allowed_lines
        FROM public.families 
        WHERE family_code = '${code.replace(/'/g, "''")}' 
        LIMIT 1
    `)

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Family not found' }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
