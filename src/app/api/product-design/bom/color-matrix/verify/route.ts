import { NextRequest } from 'next/server'

import {
  verifyReferenceImportColorRulesMatrixDirect,
  type ColorMatrixVerificationProgress,
  type ColorRuleCoverageResult,
  type DirectColorRuleMatrixSelection,
} from '@/lib/bom/referenceImport'
import { isReferenceProductApplicationScope } from '@/lib/bom/referenceImportScopes'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 300

type MatrixVerificationEvent =
  | { type: 'progress'; progress: ColorMatrixVerificationProgress }
  | { type: 'complete'; message: string; success: boolean; results: ColorRuleCoverageResult[] }
  | { type: 'error'; message: string }

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseProductType(value: unknown): string | null {
  const productType = readString(value)?.toUpperCase() ?? null
  return productType && productType.length <= 80 ? productType : null
}

function parseSelections(value: unknown): DirectColorRuleMatrixSelection[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const record = asRecord(candidate)
    const sourceColorCode = readString(record.sourceColorCode)?.toUpperCase()
    const targetColorCode = readString(record.targetColorCode)?.toUpperCase()
    const scope = record.scope
    const baseItemCodes = Array.isArray(record.baseItemCodes)
      ? [...new Set(record.baseItemCodes.flatMap(code => readString(code)?.toUpperCase() ?? []))]
      : []
    const materialKinds = Array.isArray(record.materialKinds)
      ? [...new Set(record.materialKinds.filter(kind => kind === 'board' || kind === 'edge_band' || kind === 'other'))]
      : []
    return sourceColorCode && targetColorCode && isReferenceProductApplicationScope(scope) && baseItemCodes.length > 0
      ? [{ sourceColorCode, targetColorCode, scope, baseItemCodes, materialKinds }]
      : []
  })
}

function streamEvent(encoder: TextEncoder, event: MatrixVerificationEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await apiGuard('module:product-design')
  if (guard.response) return guard.response

  let selections: DirectColorRuleMatrixSelection[] = []
  let productType: string | null = null
  try {
    const body: unknown = await request.json()
    const input = asRecord(body)
    selections = parseSelections(input.selections)
    productType = parseProductType(input.productType)
  } catch {
    selections = []
  }
  if (selections.length === 0) return Response.json({ success: false, message: 'Selecciona al menos una regla completa.' }, { status: 400 })
  if (!productType) return Response.json({ success: false, message: 'La referencia seleccionada no tiene tipo de producto para limitar la verificación.' }, { status: 400 })

  const encoder = new TextEncoder()
  let cancelled = request.signal.aborted
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const markCancelled = (): void => { cancelled = true }
      request.signal.addEventListener('abort', markCancelled, { once: true })
      const send = (event: MatrixVerificationEvent): void => {
        if (closed) return
        controller.enqueue(streamEvent(encoder, event))
      }
      const close = (): void => {
        if (closed) return
        closed = true
        controller.close()
      }

      void (async () => {
        try {
          const results = await verifyReferenceImportColorRulesMatrixDirect({
            selections,
            productType,
            onProgress: progress => send({ type: 'progress', progress }),
            isCancelled: () => cancelled,
          })
          if (cancelled) return
          const pending = results.reduce((total, result) => total + result.mismatches.length + result.sapReadErrors.length, 0)
          send({
            type: 'complete',
            success: pending === 0,
            message: pending === 0 ? 'SAP confirma las reglas seleccionadas.' : `SAP encontró ${pending} caso(s) por revisar.`,
            results,
          })
        } catch (error) {
          if (!cancelled) send({ type: 'error', message: error instanceof Error ? error.message : 'No se pudo verificar la matriz.' })
        } finally {
          request.signal.removeEventListener('abort', markCancelled)
          close()
        }
      })()
    },
    cancel() {
      // The browser stopped consuming this stream: do not schedule another SAP read.
      // An in-flight read is read-only and may still finish at SAP.
      cancelled = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
