import { NextRequest, NextResponse } from 'next/server'

import { getSapProductTreeHeaderPageByPrefix, getSapProductTreeHeadersByCodes, getSapProductTreeLinePageByPrefix, type SapProductTreeLineCursor } from '@/lib/sap/serviceLayer'
import { normalizeColorAuditTree, type ColorAuditTree } from '@/lib/sap/colorAudit'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 300

const SAP_PAGE_SIZE = 20

type TreeReadMode = 'headers' | 'headers_by_codes' | 'lines'

type TreesRequest = {
  family: string | null
  mode: TreeReadMode
  skip: number
  itemCodes: string[]
  cursor: SapProductTreeLineCursor | null
}

function readRequestBody(value: unknown): TreesRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const family = typeof record.family === 'string' ? record.family.trim().toUpperCase() : ''
  const mode = record.mode === 'headers' || record.mode === 'headers_by_codes' || record.mode === 'lines' ? record.mode : null
  const skip = typeof record.skip === 'number' && Number.isInteger(record.skip) && record.skip >= 0
    ? record.skip
    : null
  const itemCodes = Array.isArray(record.itemCodes)
    ? [...new Set(record.itemCodes.filter((code): code is string => typeof code === 'string').map(code => code.trim().toUpperCase()).filter(code => /^V[A-Z0-9-]*$/u.test(code)))].slice(0, SAP_PAGE_SIZE)
    : []
  const cursorRecord = typeof record.cursor === 'object' && record.cursor !== null && !Array.isArray(record.cursor)
    ? record.cursor as Record<string, unknown>
    : null
  const cursor = cursorRecord
    && typeof cursorRecord.treeCode === 'string'
    && /^V[A-Z0-9-]*$/u.test(cursorRecord.treeCode.trim().toUpperCase())
    && typeof cursorRecord.childNum === 'number'
    && Number.isInteger(cursorRecord.childNum)
    && cursorRecord.childNum >= 0
    ? { treeCode: cursorRecord.treeCode.trim().toUpperCase(), childNum: cursorRecord.childNum }
    : null
  if (!mode || skip === null) return null
  if (mode === 'headers_by_codes') return itemCodes.length > 0 ? { family: null, mode, skip, itemCodes, cursor: null } : null
  if (!/^V[A-Z0-9]*$/u.test(family)) return null
  return { family, mode, skip, itemCodes: [], cursor }
}

function headerTrees(rows: Awaited<ReturnType<typeof getSapProductTreeHeaderPageByPrefix>>['rows']): ColorAuditTree[] {
  return rows.flatMap((row): ColorAuditTree[] => {
    const tree = normalizeColorAuditTree({
      TreeCode: row.treeCode,
      TreeType: row.treeType,
      ProductDescription: row.productDescription,
      Warehouse: row.headerWarehouse,
    })
    return tree ? [{ ...tree, lines: [] }] : []
  })
}

function lineTrees(rows: Awaited<ReturnType<typeof getSapProductTreeLinePageByPrefix>>['rows']): ColorAuditTree[] {
  const treesByCode = new Map<string, ColorAuditTree>()
  for (const row of rows) {
    const normalized = normalizeColorAuditTree({
      TreeCode: row.treeCode,
      TreeType: row.treeType,
      ProductDescription: row.productDescription,
      Warehouse: row.headerWarehouse,
      ProductTreeLines: [{
        ChildNum: row.childNum,
        ItemCode: row.itemCode,
        ItemName: row.itemName,
        Warehouse: row.warehouse,
        IssueMethod: row.issueMethod,
      }],
    })
    if (!normalized) continue
    const existing = treesByCode.get(normalized.treeCode)
    if (existing) {
      existing.lines = [...(existing.lines ?? []), ...(normalized.lines ?? [])]
    } else {
      treesByCode.set(normalized.treeCode, normalized)
    }
  }
  return [...treesByCode.values()]
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await apiGuard('module:product-design')
  if (guard.response) return guard.response

  let body: TreesRequest | null = null
  try {
    body = readRequestBody(await request.json())
  } catch {
    body = null
  }
  if (!body) {
    return NextResponse.json({ success: false, error: 'La familia, el modo y la página de lectura son obligatorios.' }, { status: 400 })
  }

  try {
    if (body.mode === 'headers' || body.mode === 'headers_by_codes') {
      const page = body.mode === 'headers'
        ? await getSapProductTreeHeaderPageByPrefix(body.family ?? '', {
          top: SAP_PAGE_SIZE,
          skip: body.skip,
        })
        : await getSapProductTreeHeadersByCodes(body.itemCodes)
      return NextResponse.json({
        success: true,
        mode: body.mode,
        trees: headerTrees(page.rows),
        rowsRead: page.sourceRowCount,
        nextSkip: body.mode === 'headers' ? body.skip + page.sourceRowCount : body.skip + body.itemCodes.length,
        done: body.mode === 'headers' ? page.sourceRowCount < SAP_PAGE_SIZE : true,
      })
    }

    const page = await getSapProductTreeLinePageByPrefix(body.family ?? '', {
      top: SAP_PAGE_SIZE,
      skip: body.skip,
      cursor: body.cursor,
    })
    const lastRow = page.rows.at(-1)
    return NextResponse.json({
      success: true,
      mode: body.mode,
      trees: lineTrees(page.rows),
      rowsRead: page.sourceRowCount,
      nextSkip: body.skip + page.sourceRowCount,
      nextCursor: lastRow ? { treeCode: lastRow.treeCode, childNum: lastRow.childNum } : body.cursor,
      done: page.sourceRowCount < SAP_PAGE_SIZE,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No se pudieron leer las LdM desde SAP.'
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}
