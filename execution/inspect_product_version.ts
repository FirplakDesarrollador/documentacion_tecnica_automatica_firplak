import * as dotenv from 'dotenv'
import path from 'path'

// Load env before importing Supabase client (it reads env at module load).
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { dbQuery } from '../src/lib/supabase'

function usage() {
    console.log(`
Usage:
  npx ts-node -P tsconfig.scripts.json --transpile-only execution/inspect_product_version.ts --reference-id <uuid> --version-code <CODE>
`.trim())
}

function parseArgs(argv: string[]) {
    const values = new Map<string, string>()
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (!a.startsWith('--')) continue
        const k = a.slice(2)
        const next = argv[i + 1]
        if (next && !next.startsWith('--')) {
            values.set(k, next)
            i++
        }
    }
    return { get: (k: string) => values.get(k) }
}

async function main() {
    const { get } = parseArgs(process.argv.slice(2))
    const referenceId = (get('reference-id') || '').trim()
    const versionCode = (get('version-code') || '').trim().toUpperCase()
    if (!referenceId || !versionCode) {
        usage()
        process.exit(1)
    }

    const safeRef = referenceId.replace(/'/g, "''")
    const safeCode = versionCode.replace(/'/g, "''")

    const rows = await dbQuery(`
        SELECT
            id,
            reference_id,
            version_code,
            version_attrs,
            (version_attrs->>'accessory_text') as accessory_text,
            (version_attrs->>'isometric_asset_id') as isometric_asset_id,
            (version_attrs->>'isometric_path') as isometric_path
        FROM public.product_versions
        WHERE reference_id = '${safeRef}'
          AND version_code = '${safeCode}'
        LIMIT 10
    `)

    console.dir({ table: 'public.product_versions', rows }, { depth: 6 })
}

main().catch(e => {
    console.error('FATAL:', e?.message || e)
    process.exit(1)
})

