import { NextRequest, NextResponse } from 'next/server'

import { getSapProductTreesByPrefixes } from '@/lib/sap/serviceLayer'
import { treePrefixForItemCode, type ColorAuditTree } from '@/lib/sap/colorAudit'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 300

const TREE_BATCH_SIZE = 50
const PREFIX_BATCH_SIZE = 8
const SAP_PAGE_SIZE = 200
const SAP_TIMEOUT_MS = 60_000

type TreesRequest = {
  itemCodes: string[]
  offset: number
}

function readRequestBody(value: unknown): TreesRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { itemCodes: [], offset: 0 }
  const record = value as Record<string, unknown>
  const itemCodes = [...new Set(
    (Array.isArray(record.itemCodes) ? record.itemCodes : [])
      .filter((itemCode): itemCode is string => typeof itemCode === 'string' && itemCode.trim().length > 0)
      .map(itemCode => itemCode.trim().toUpperCase()),
  )]
  const offset = typeof record.offset === 'number' && Number.isInteger(record.offset) && record.offset >= 0
    ? record.offset
    : 0
  return { itemCodes, offset }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function normalizeTree(value: Record<string, unknown>): ColorAuditTree | null {
  const treeCode = typeof value.TreeCode === 'string' ? value.TreeCode.trim().toUpperCase() : ''
  if (!treeCode) return null
  return {
    treeCode,
    treeType: typeof value.TreeType === 'string' ? value.TreeType.trim() || null : null,
    productDescription: typeof value.ProductDescription === 'string' ? value.ProductDescription.trim() || null : null,
  }
}

async function readTreesForPrefixes(prefixes: string[]): Promise<ColorAuditTree[]> {
  const trees = new Map<string, ColorAuditTree>()
  for (const prefixBatch of chunks(prefixes, PREFIX_BATCH_SIZE)) {
    let skip = 0
    let previousPageKey = ''
    while (true) {
      const page = await getSapProductTreesByPrefixes(prefixBatch, {
        select: ['TreeCode', 'TreeType', 'ProductDescription'],
        top: SAP_PAGE_SIZE,
        skip,
        timeoutMs: SAP_TIMEOUT_MS,
      })
      if (page.length === 0) break
      const normalized = page.flatMap(tree => normalizeTree(tree) ? [normalizeTree(tree)!] : [])
      const pageKey = `${normalized[0]?.treeCode ?? ''}:${normalized.at(-1)?.treeCode ?? ''}:${normalized.length}`
      if (pageKey === previousPageKey) throw new Error('SAP devolvió una página repetida al leer las LdM.')
      previousPageKey = pageKey
      for (const tree of normalized) trees.set(tree.treeCode, tree)
      skip += page.length
    }
  }
  return [...trees.values()]
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await apiGuard('module:product-design')
  if (guard.response) return guard.response

  try {
    let body: TreesRequest
    try {
      body = readRequestBody(await request.json())
    } catch {
      body = { itemCodes: [], offset: 0 }
    }
    const batchCodes = body.itemCodes.slice(body.offset, body.offset + TREE_BATCH_SIZE)
    if (batchCodes.length === 0) {
      return NextResponse.json({ success: true, trees: [], treeHeadersRead: 0, nextOffset: body.offset, done: true })
    }

    const prefixes = [...new Set(batchCodes.map(treePrefixForItemCode))]
    const allTrees = await readTreesForPrefixes(prefixes)
    const codeSet = new Set(batchCodes)
    const trees = allTrees.filter(tree => codeSet.has(tree.treeCode))

    return NextResponse.json({
      success: true,
      trees,
      treeHeadersRead: allTrees.length,
      nextOffset: body.offset + batchCodes.length,
      done: body.offset + batchCodes.length >= body.itemCodes.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No se pudieron leer las LdM desde SAP.'
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}

