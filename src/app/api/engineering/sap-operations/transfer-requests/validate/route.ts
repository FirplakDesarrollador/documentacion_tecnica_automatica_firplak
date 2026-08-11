import { NextResponse } from 'next/server'

import { validateSapTransferRequest } from '@/lib/sap/transferRequests'
import { apiGuard } from '@/utils/auth/access'

import { transferRequestErrorResponse } from '../_utils'

export const runtime = 'nodejs'
export const maxDuration = 60

function serializeValidation(validation: Awaited<ReturnType<typeof validateSapTransferRequest>>) {
  return {
    valid: validation.valid,
    checkedAt: validation.checkedAt,
    issues: validation.issues.map(issue => ({
      code: issue.code,
      message: issue.message,
      lineIndex: issue.lineIndex ?? null,
      ...(issue.availableQuantity === undefined ? {} : { availableQuantity: issue.availableQuantity }),
      ...(issue.requestedQuantity === undefined ? {} : { requestedQuantity: issue.requestedQuantity }),
    })),
    lines: validation.lines.map(line => ({
      lineIndex: line.lineIndex,
      availability: line.availability,
    })),
  }
}

export async function POST(request: Request) {
  const guard = await apiGuard('module:engineering')
  if (guard.response) return guard.response

  try {
    const raw = await request.json().catch(() => null)
    const validation = await validateSapTransferRequest(raw)
    return NextResponse.json({ success: true, validation: serializeValidation(validation) })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
