import { type NextRequest } from 'next/server'

import { handleColorAuditTreesRequest } from '@/app/api/product-design/color-audit/trees/route'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest): Promise<Response> {
  return handleColorAuditTreesRequest(request, 'module:engineering')
}
