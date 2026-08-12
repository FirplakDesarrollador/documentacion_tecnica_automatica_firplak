import { NextResponse } from 'next/server'

import { prepareSapTransferRequestWithoutRefresh } from '@/lib/sap/transferRequests'
import { apiGuard } from '@/utils/auth/access'

import { transferRequestErrorResponse } from '../_utils'

export const runtime = 'nodejs'
export const maxDuration = 60

function serializeValidation(prepared: Awaited<ReturnType<typeof prepareSapTransferRequestWithoutRefresh>>) {
  return {
    valid: true,
    checkedAt: new Date().toISOString(),
    issues: [],
    lines: prepared.lines.map((_, lineIndex) => ({ lineIndex })),
  }
}

export async function POST(request: Request) {
  const guard = await apiGuard('module:engineering')
  if (guard.response) return guard.response

  try {
    const raw = await request.json().catch(() => null)
    const prepared = await prepareSapTransferRequestWithoutRefresh(raw)
    return NextResponse.json({ success: true, validation: serializeValidation(prepared) })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
