import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function legacyApiRedirect(request: Request): NextResponse {
  const sourceUrl = new URL(request.url)
  const targetUrl = new URL('/api/engineering/sap-operations/sap-code-creation', request.url)
  targetUrl.search = sourceUrl.search
  return NextResponse.redirect(targetUrl, 307)
}

export async function GET(request: Request) {
  return legacyApiRedirect(request)
}

export async function POST(request: Request) {
  return legacyApiRedirect(request)
}
