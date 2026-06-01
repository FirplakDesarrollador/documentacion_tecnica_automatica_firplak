import { NextResponse } from 'next/server'
import { processNamingJobs } from '@/lib/engine/namingProcessor'

export const runtime = 'nodejs'
export const maxDuration = 60

function isAuthorized(request: Request) {
    const secret = process.env.NAMING_RECOMPUTE_SECRET
    if (!secret) return false

    const bearer = request.headers.get('authorization')
    const headerSecret = request.headers.get('x-naming-recompute-secret')
    return bearer === `Bearer ${secret}` || headerSecret === secret
}

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const result = await processNamingJobs({
        limit: Number(body?.limit || 100),
        maxRuntimeMs: Number(body?.maxRuntimeMs || 25000),
        leaseSeconds: Number(body?.leaseSeconds || 60),
    })

    return NextResponse.json({ success: true, ...result })
}
