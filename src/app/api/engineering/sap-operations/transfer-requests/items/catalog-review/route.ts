import { NextResponse } from 'next/server'

import { listPendingSapCatalogItems, reviewSapCatalogItem } from '@/lib/sap/componentCatalogSync'
import { apiGuard } from '@/utils/auth/access'

import { isRecord, transferRequestErrorResponse } from '../../_utils'

export const runtime = 'nodejs'

async function requireAdmin() {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response
  if (!guard.access?.isAdmin) return NextResponse.json({ success: false, error: 'Solo administradores pueden revisar el catálogo.' }, { status: 403 })
  return null
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    return NextResponse.json({ success: true, items: await listPendingSapCatalogItems() })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const guard = await apiGuard('module:engineering:transfer-requests')
  if (guard.response) return guard.response
  if (!guard.access?.isAdmin) return NextResponse.json({ success: false, error: 'Solo administradores pueden revisar el catálogo.' }, { status: 403 })
  try {
    const raw: unknown = await request.json().catch(() => null)
    if (!isRecord(raw) || raw.confirmed !== true || typeof raw.itemCode !== 'string' || (raw.status !== 'approved' && raw.status !== 'rejected')) {
      return NextResponse.json({ success: false, error: 'Código, estado y confirmación son obligatorios.' }, { status: 400 })
    }
    const item = await reviewSapCatalogItem(raw.itemCode, raw.status, guard.access.user?.id ?? '')
    return NextResponse.json({ success: true, item })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
