import { NextResponse } from 'next/server'
import { apiGuard } from '@/utils/auth/access'
import {
  assertSapWritesEnabled,
  createSapItem,
  duplicateSapItem,
  type SapEntityPayload,
} from '@/lib/sap/serviceLayer'
import { asOptionalStringArray, isPlainObject, sapApiErrorResponse } from '../../_utils'

export const runtime = 'nodejs'

type DuplicateRequest = {
  sourceItemCode: string
  targetItemCode: string
  overrides?: SapEntityPayload
  omitFields?: string[]
  dryRun: boolean
}

function readRequiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  return typeof value === 'string' ? value.trim() : ''
}

function parseDuplicateRequest(body: unknown): DuplicateRequest {
  if (!isPlainObject(body)) {
    return {
      sourceItemCode: '',
      targetItemCode: '',
      dryRun: true,
    }
  }

  const overrides = isPlainObject(body.overrides) ? body.overrides : undefined
  return {
    sourceItemCode: readRequiredString(body, 'sourceItemCode'),
    targetItemCode: readRequiredString(body, 'targetItemCode'),
    overrides,
    omitFields: asOptionalStringArray(body.omitFields),
    dryRun: body.dryRun !== false,
  }
}

export async function POST(request: Request) {
  const guard = await apiGuard('module:consulta-sap')
  if (guard.response) return guard.response

  try {
    const body = parseDuplicateRequest(await request.json())
    const duplicate = await duplicateSapItem(body)

    if (body.dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        sourceItemCode: body.sourceItemCode,
        targetItemCode: body.targetItemCode,
        createPayload: duplicate.createPayload,
      })
    }

    await assertSapWritesEnabled()
    const createdItem = await createSapItem(duplicate.createPayload)

    return NextResponse.json({
      success: true,
      dryRun: false,
      sourceItemCode: body.sourceItemCode,
      targetItemCode: body.targetItemCode,
      createdItem,
    })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
