import { NextRequest } from 'next/server'

import { analyzeReferenceBomImportTransient, type ReferenceImportAnalysisProgress } from '@/lib/bom/referenceImport'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 300

type AnalysisEvent =
  | { type: 'progress'; progress: ReferenceImportAnalysisProgress }
  | { type: 'complete'; message: string; workspace: Awaited<ReturnType<typeof analyzeReferenceBomImportTransient>> }
  | { type: 'error'; message: string }

type RetryRequest = {
  skuCompletes: string[]
  cachedSnapshots: unknown[]
}

function streamEvent(encoder: TextEncoder, event: AnalysisEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

function parseRetryRequest(record: Record<string, unknown>): RetryRequest | null {
  const retry = record.retry
  if (typeof retry !== 'object' || retry === null || Array.isArray(retry)) return null
  const retryRecord = retry as Record<string, unknown>
  const skuCompletes = [...new Set(
    (Array.isArray(retryRecord.skuCompletes) ? retryRecord.skuCompletes : [])
      .flatMap(value => typeof value === 'string' && value.trim() ? [value.trim().toUpperCase()] : [])
  )]
  return {
    skuCompletes: skuCompletes.slice(0, 500),
    cachedSnapshots: Array.isArray(retryRecord.cachedSnapshots) ? retryRecord.cachedSnapshots.slice(0, 500) : [],
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await apiGuard('module:product-design')
  if (guard.response) return guard.response

  let referenceId = ''
  let retry: RetryRequest | null = null
  try {
    const body: unknown = await request.json()
    const record = typeof body === 'object' && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {}
    referenceId = typeof record.referenceId === 'string'
      ? record.referenceId.trim()
      : ''
    retry = parseRetryRequest(record)
  } catch {
    referenceId = ''
    retry = null
  }
  if (!referenceId) return Response.json({ success: false, message: 'Selecciona una referencia válida.' }, { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (event: AnalysisEvent): void => {
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
          const workspace = await analyzeReferenceBomImportTransient({
            referenceId,
            ...(retry ? { retry } : {}),
            onProgress: progress => send({ type: 'progress', progress }),
          })
          const capturedCount = workspace.snapshots.filter(snapshot => snapshot.status === 'captured').length
          const retryMessage = retry
            ? retry.skuCompletes.length > 0
              ? `SAP leyó solo ${retry.skuCompletes.length} LdM nueva(s) o modificada(s) y reutilizó las ya capturadas.`
              : 'SAP actualizó la conciliación sin releer LdM ya capturadas.'
            : `SAP leyó ${capturedCount} de ${workspace.run.sourceSkuCount} LdM.`
          send({
            type: 'complete',
            message: `${retryMessage} La comparación está lista para revisar.`,
            workspace,
          })
        } catch (error) {
          send({ type: 'error', message: error instanceof Error ? error.message : 'No se pudo analizar la referencia desde SAP.' })
        } finally {
          close()
        }
      })()
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
