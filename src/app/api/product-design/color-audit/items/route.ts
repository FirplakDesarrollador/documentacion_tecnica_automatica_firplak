import { NextRequest, NextResponse } from 'next/server'

import { searchSapItems, getSapItemsByCodes } from '@/lib/sap/serviceLayer'
import { normalizeColorAuditItem, parseColorAuditItemCode, type ColorAuditItem } from '@/lib/sap/colorAudit'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 300

const SAP_PAGE_SIZE = 20
const SAP_TIMEOUT_MS = 60_000
const ITEM_SELECT = [
  'ItemCode',
  'ItemName',
  'U_Color',
  'DefaultWarehouse',
  'SalesItem',
  'Valid',
  'Frozen',
  'TreeType',
]

type ItemsRequest = {
  skip?: number
  afterItemCode?: string
  prefix?: string
  catalogOnly?: boolean
}

function readRequestBody(value: unknown): ItemsRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const skip = typeof record.skip === 'number' && Number.isInteger(record.skip) && record.skip >= 0
    ? record.skip
    : 0
  const prefix = typeof record.prefix === 'string' && /^V[A-Z0-9]*$/u.test(record.prefix.trim().toUpperCase())
    ? record.prefix.trim().toUpperCase()
    : 'V'
  const afterItemCode = typeof record.afterItemCode === 'string' && /^V[A-Z0-9-]*$/u.test(record.afterItemCode.trim().toUpperCase())
    ? record.afterItemCode.trim().toUpperCase()
    : undefined
  return { skip, afterItemCode, prefix, catalogOnly: record.catalogOnly === true }
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await apiGuard('module:product-design')
  if (guard.response) return guard.response

  try {
    let body: ItemsRequest = {}
    try {
      body = readRequestBody(await request.json())
    } catch {
      body = {}
    }

    const page = await searchSapItems(
      { code: body.prefix ?? 'V' },
      { skip: body.skip ?? 0, afterItemCode: body.afterItemCode, limit: SAP_PAGE_SIZE, timeoutMs: SAP_TIMEOUT_MS },
    )
    const rawItems = page.items
    const rawCodes = rawItems
      .map(item => typeof item.ItemCode === 'string' ? item.ItemCode.trim().toUpperCase() : '')
      .filter(code => parseColorAuditItemCode(code) !== null)
    if (body.catalogOnly) {
      return NextResponse.json({
        success: true,
        families: [...new Set(rawCodes.map(code => parseColorAuditItemCode(code)?.familyCode).filter((family): family is string => Boolean(family)))],
        rawItemsRead: rawItems.length,
        nextSkip: (body.skip ?? 0) + rawItems.length,
        nextCatalogCursor: page.lastItemCode,
        done: rawItems.length === 0,
      })
    }
    const details = await getSapItemsByCodes(rawCodes, ITEM_SELECT, { timeoutMs: SAP_TIMEOUT_MS })
    const items: ColorAuditItem[] = []
    const detailErrors: string[] = []

    for (const rawItem of rawItems) {
      const rawCode = typeof rawItem.ItemCode === 'string' ? rawItem.ItemCode.trim().toUpperCase() : ''
      if (!parseColorAuditItemCode(rawCode)) continue
      const detail = details.get(rawCode)
      if (!detail) {
        detailErrors.push(rawCode)
        continue
      }
      const normalized = normalizeColorAuditItem(detail)
      if (normalized) items.push(normalized)
    }

    return NextResponse.json({
      success: true,
      items,
      detailErrors,
      rawItemsRead: rawItems.length,
      nextSkip: (body.skip ?? 0) + rawItems.length,
      done: rawItems.length === 0,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No se pudo leer la población de SKU desde SAP.'
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}

