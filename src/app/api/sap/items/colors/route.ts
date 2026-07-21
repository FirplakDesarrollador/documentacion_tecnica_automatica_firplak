import { NextResponse } from 'next/server'
import { apiGuard } from '@/utils/auth/access'
import { dbQuery } from '@/lib/supabase'

export const runtime = 'nodejs'

type ColorRow = {
  code_4dig?: unknown
  name_color_sap?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function GET() {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const rows = await dbQuery(
      `SELECT code_4dig, name_color_sap
       FROM public.colors
       WHERE nullif(btrim(code_4dig), '') IS NOT NULL
       ORDER BY code_4dig ASC`
    )
    const colors = (Array.isArray(rows) ? rows : [])
      .filter(isRecord)
      .map((row: ColorRow) => ({
        code: typeof row.code_4dig === 'string' ? row.code_4dig.trim().toUpperCase() : '',
        name: typeof row.name_color_sap === 'string' ? row.name_color_sap.trim() : '',
      }))
      .filter(color => color.code)

    return NextResponse.json({ success: true, colors })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el catálogo de colores.'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
