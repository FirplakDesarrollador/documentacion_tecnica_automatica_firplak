import { NextResponse, type NextRequest } from 'next/server'
import { dbQuery } from '@/lib/supabase'
import { resolvePublicDocumentBySlug } from '@/lib/productDocuments'
import { buildPublicSlug } from '@/lib/documentLinks'

type PrefixRow = {
    prefix: string
}

function buildInlineFileName(name: string, filePath: string) {
    const extensionMatch = filePath.match(/\.([a-z0-9]+)(?:\?|$)/i)
    const extension = extensionMatch?.[1]?.toLowerCase() || 'pdf'
    const base = String(name || 'documento')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'documento'

    return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`
}

function resolveContentType(upstreamContentType: string | null, filePath: string) {
    if (upstreamContentType && !upstreamContentType.toLowerCase().includes('octet-stream')) {
        return upstreamContentType
    }

    if (/\.pdf(?:\?|$)/i.test(filePath)) return 'application/pdf'
    if (/\.svg(?:\?|$)/i.test(filePath)) return 'image/svg+xml'
    if (/\.png(?:\?|$)/i.test(filePath)) return 'image/png'
    if (/\.jpe?g(?:\?|$)/i.test(filePath)) return 'image/jpeg'
    if (/\.webp(?:\?|$)/i.test(filePath)) return 'image/webp'
    return 'application/octet-stream'
}

function resolveFetchUrl(request: NextRequest, filePath: string) {
    if (/^https?:\/\//i.test(filePath)) return filePath
    if (filePath.startsWith('/')) return new URL(filePath, request.url).toString()
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
    if (!baseUrl) return filePath
    const cleanPath = filePath.startsWith('assets/') ? filePath.slice(7) : filePath
    return `${baseUrl}/storage/v1/object/public/assets/${cleanPath}`
}

async function isActivePublicPrefix(prefix: string) {
    const rows = await dbQuery(`
        SELECT prefix
        FROM public.document_slug_prefixes
        WHERE prefix = '${prefix.replace(/'/g, "''")}'
          AND active = true
        LIMIT 1
    `) as PrefixRow[]

    return Boolean(rows?.[0]?.prefix)
}

export async function GET(request: NextRequest, context: { params: Promise<{ slugPrefix: string; slugBody: string }> }) {
    const { slugPrefix, slugBody } = await context.params
    const publicSlug = buildPublicSlug(slugPrefix, slugBody)

    if (!publicSlug || !(await isActivePublicPrefix(slugPrefix))) {
        return new NextResponse('Documento no encontrado.', { status: 404 })
    }

    const asset = await resolvePublicDocumentBySlug(publicSlug)
    if (!asset?.file_path) {
        return new NextResponse('Documento no encontrado.', { status: 404 })
    }

    const sourceUrl = resolveFetchUrl(request, asset.file_path)
    const upstream = await fetch(sourceUrl, { cache: 'no-store' })
    if (!upstream.ok || !upstream.body) {
        return new NextResponse('No se pudo cargar el documento.', { status: 502 })
    }

    return new NextResponse(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': resolveContentType(upstream.headers.get('content-type'), asset.file_path),
            'Content-Disposition': `inline; filename="${buildInlineFileName(asset.document_label || asset.name, asset.file_path)}"`,
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex',
        },
    })
}
