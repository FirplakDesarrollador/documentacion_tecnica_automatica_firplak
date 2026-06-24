import { NextResponse } from 'next/server'
import { SapServiceLayerError } from '@/lib/sap/serviceLayer'

export function sapApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof SapServiceLayerError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        sapCode: error.sapCode,
      },
      { status: error.statusCode }
    )
  }

  const message = error instanceof Error ? error.message : 'SAP operation failed'
  return NextResponse.json({ success: false, error: message }, { status: 500 })
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) return undefined

  const fields = value
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean)

  return fields.length > 0 ? fields : undefined
}
