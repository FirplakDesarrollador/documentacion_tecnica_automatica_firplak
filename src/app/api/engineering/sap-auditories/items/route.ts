import { type NextRequest } from 'next/server'

import { handleColorAuditItemsRequest } from '@/app/api/product-design/color-audit/items/route'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest): Promise<Response> {
  return handleColorAuditItemsRequest(request, 'module:engineering')
}
