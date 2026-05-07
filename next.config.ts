import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/export': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/export/route': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
}

export default nextConfig
