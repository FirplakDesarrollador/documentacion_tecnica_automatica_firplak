import type { NextConfig } from 'next'

const getHostnameFromUrl = (url: string | undefined): string | null => {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

const supabaseHostname = getHostnameFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/families', destination: '/configuration/families', permanent: true },
      { source: '/families/new', destination: '/configuration/families/new', permanent: true },
      { source: '/products/reference-editor', destination: '/configuration/reference-editor', permanent: true },
      { source: '/products/version-editor', destination: '/configuration/version-editor', permanent: true },
      { source: '/products/sku-editor', destination: '/configuration/sku-editor', permanent: true },
      { source: '/products/glossary', destination: '/configuration/glossary', permanent: true },
    ];
  },
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/export': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/export/route': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
  images: {
    remotePatterns: [
      ...(supabaseHostname
        ? [
            {
              protocol: 'https',
              hostname: supabaseHostname,
              pathname: '/**',
            } as const,
          ]
        : []),
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/**',
      },
    ],
  },
}

export default nextConfig
