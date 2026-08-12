import { type NextRequest } from 'next/server'

import { handleColorAuditUpdateRequest } from '@/app/api/product-design/color-audit/update/route'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest): Promise<Response> {
  return handleColorAuditUpdateRequest(request, 'module:engineering:sap-auditories')
}
