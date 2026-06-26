import { NextResponse, type NextRequest } from 'next/server'
import { dbQuery } from '@/lib/supabase'

type InstructionAssetRow = {
    name: string
    file_path: string
}

function isValidPublicSlug(value: string) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

function buildInlineFileName(name: string) {
    const base = String(name || 'instructivo')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'instructivo'
    return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

function resolvePdfContentType(upstreamContentType: string | null) {
    return upstreamContentType?.toLowerCase().includes('pdf') ? upstreamContentType : 'application/pdf'
}

function resolveFetchUrl(request: NextRequest, filePath: string) {
    if (/^https?:\/\//i.test(filePath)) return filePath
    if (filePath.startsWith('/')) return new URL(filePath, request.url).toString()
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
    if (!baseUrl) return filePath
    const cleanPath = filePath.startsWith('assets/') ? filePath.slice(7) : filePath
    return `${baseUrl}/storage/v1/object/public/assets/${cleanPath}`
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
    const { slug } = await context.params
    const normalizedSlug = String(slug || '').trim().toLowerCase()

    if (!isValidPublicSlug(normalizedSlug)) {
        return new NextResponse('Instructivo no encontrado.', { status: 404 })
    }

    const rows = await dbQuery(`
        SELECT a.name, a.file_path
        FROM public.product_asset_links pal
        JOIN public.assets a ON a.id = pal.asset_id
        WHERE pal.public_slug = $1
          AND pal.status = 'approved'
          AND a.type = 'instruction_pdf'
        ORDER BY pal.version_number DESC, pal.updated_at DESC
        LIMIT 1
    `, [normalizedSlug]) as InstructionAssetRow[]

    const asset = rows?.[0]
    if (!asset?.file_path) {
        return new NextResponse('Instructivo no encontrado.', { status: 404 })
    }

    const sourceUrl = resolveFetchUrl(request, asset.file_path)
    const upstream = await fetch(sourceUrl, { cache: 'no-store' })
    if (!upstream.ok || !upstream.body) {
        return new NextResponse('No se pudo cargar el instructivo.', { status: 502 })
    }

    return new NextResponse(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': resolvePdfContentType(upstream.headers.get('content-type')),
            'Content-Disposition': `inline; filename="${buildInlineFileName(asset.name)}"`,
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex',
        },
    })
}
