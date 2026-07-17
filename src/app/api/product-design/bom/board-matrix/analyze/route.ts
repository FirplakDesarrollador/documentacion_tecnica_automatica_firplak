import { NextRequest } from 'next/server'

import {
  analyzeReferenceImportBoardMatrix,
  type BoardMatrixVerificationProgress,
} from '@/lib/bom/referenceImport'
import type { BoardMatrixCatalogResult } from '@/lib/bom/referenceImportTypes'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 300

type BoardMatrixEvent =
  | { type: 'progress'; progress: BoardMatrixVerificationProgress }
  | { type: 'complete'; message: string; success: boolean; results: BoardMatrixCatalogResult[] }
  | { type: 'error'; message: string }

function parseColorCodes(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.flatMap(code => typeof code === 'string' && /^[A-Z0-9]{4}$/i.test(code.trim()) ? [code.trim().toUpperCase()] : []))]
    : []
}

function streamEvent(encoder: TextEncoder, event: BoardMatrixEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await apiGuard('module:product-design')
  if (guard.response) return guard.response

  let colorCodes: string[] = []
  try {
    const body: unknown = await request.json()
    colorCodes = parseColorCodes(typeof body === 'object' && body !== null ? (body as { colorCodes?: unknown }).colorCodes : null)
  } catch {
    colorCodes = []
  }
  if (colorCodes.length === 0) return Response.json({ success: false, message: 'Selecciona al menos un color de cuatro caracteres.' }, { status: 400 })

  const encoder = new TextEncoder()
  let cancelled = request.signal.aborted
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const markCancelled = (): void => { cancelled = true }
      request.signal.addEventListener('abort', markCancelled, { once: true })
      const send = (event: BoardMatrixEvent): void => {
        if (!closed) controller.enqueue(streamEvent(encoder, event))
      }
      const close = (): void => {
        if (closed) return
        closed = true
        controller.close()
      }
      void (async () => {
        try {
          const results = await analyzeReferenceImportBoardMatrix({
            colorCodes,
            onProgress: progress => send({ type: 'progress', progress }),
            isCancelled: () => cancelled,
          })
          const pending = results.reduce((total, result) => total + result.sapReadErrors.length + result.rows.filter(row => row.status !== 'matches').length, 0)
          const catalogDifferences = results.reduce((total, result) => total + result.invalidSkus.filter(issue => issue.reason !== 'bom_missing').length, 0)
          const message = pending > 0
            ? `SAP devolvió ${pending} caso(s) de tablero para revisión humana.${catalogDifferences > 0 ? ` Además hay ${catalogDifferences} diferencia(s) de catálogo con Supabase para conciliar.` : ''}`
            : catalogDifferences > 0
              ? `SAP confirma la evidencia de tableros seleccionada. Hay ${catalogDifferences} diferencia(s) con Supabase para conciliar; no se ocultaron de la cobertura SAP.`
              : 'SAP confirma la evidencia de tableros seleccionada.'
          send({
            type: 'complete',
            success: pending === 0,
            message,
            results,
          })
        } catch (error) {
          if (!cancelled) send({ type: 'error', message: error instanceof Error ? error.message : 'No se pudo analizar la matriz de tableros.' })
        } finally {
          request.signal.removeEventListener('abort', markCancelled)
          close()
        }
      })()
    },
    cancel() {
      // The browser stopped consuming this stream: do not schedule another SAP read.
      // In-flight SAP requests are read-only and may still finish at the provider.
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
