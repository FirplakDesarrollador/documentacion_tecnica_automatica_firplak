import { NextResponse } from 'next/server'

import { dbQuery } from '@/lib/supabase'
import { apiGuard } from '@/utils/auth/access'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES = new Set(['accepted', 'failed'])
const TRANSPORTS = new Set(['local_agent', 'webusb'])

type ActivityPayload = {
    idempotencyKey: string
    status: 'accepted' | 'failed'
    transport: 'local_agent' | 'webusb'
    copies: number
    templateId: string | null
    productId: string | null
    ofNumber: string | null
    errorMessage: string | null
}

function parsePayload(value: unknown): { payload: ActivityPayload | null; error: string | null } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { payload: null, error: 'Payload invalido' }
    }

    const raw = value as Record<string, unknown>
    const idempotencyKey = typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey.trim() : ''
    const status = typeof raw.status === 'string' ? raw.status.trim() : ''
    const transport = typeof raw.transport === 'string' ? raw.transport.trim() : ''
    const copies = Number(raw.copies)
    const templateId = raw.templateId == null ? null : String(raw.templateId).trim()
    const productId = raw.productId == null ? null : String(raw.productId).trim()
    const ofNumber = raw.ofNumber == null ? null : String(raw.ofNumber).trim()
    const errorMessage = raw.errorMessage == null ? null : String(raw.errorMessage).trim()

    if (!UUID_RE.test(idempotencyKey)) return { payload: null, error: 'idempotencyKey invalido' }
    if (!STATUSES.has(status)) return { payload: null, error: 'status invalido' }
    if (!TRANSPORTS.has(transport)) return { payload: null, error: 'transport invalido' }
    if (!Number.isInteger(copies) || copies < 1 || copies > 999) return { payload: null, error: 'copies invalido' }
    if (templateId && !UUID_RE.test(templateId)) return { payload: null, error: 'templateId invalido' }
    if (productId && productId.length > 200) return { payload: null, error: 'productId invalido' }
    if (ofNumber && ofNumber.length > 20) return { payload: null, error: 'ofNumber invalido' }
    if (errorMessage && errorMessage.length > 1000) return { payload: null, error: 'errorMessage invalido' }

    return {
        payload: {
            idempotencyKey,
            status: status as ActivityPayload['status'],
            transport: transport as ActivityPayload['transport'],
            copies,
            templateId,
            productId,
            ofNumber,
            errorMessage,
        },
        error: null,
    }
}

export async function POST(request: Request) {
    const guard = await apiGuard('production', 'module:print')
    if (guard.response) return guard.response
    if (!guard.access) {
        return NextResponse.json({ error: 'Authorization failed' }, { status: 500 })
    }

    const parsed = parsePayload(await request.json().catch(() => null))
    if (!parsed.payload) {
        return NextResponse.json({ error: parsed.error || 'Payload invalido' }, { status: 400 })
    }

    const event = parsed.payload
    await dbQuery(
        `INSERT INTO public.print_activity_events
            (idempotency_key, status, transport, copies, template_id, product_id, of_number, error_message, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
            event.idempotencyKey,
            event.status,
            event.transport,
            event.copies,
            event.templateId,
            event.productId,
            event.ofNumber,
            event.errorMessage,
            guard.access.user?.id ?? null,
        ],
    )

    return NextResponse.json({ recorded: true })
}
