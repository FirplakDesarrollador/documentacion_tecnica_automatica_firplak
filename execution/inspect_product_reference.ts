import * as dotenv from 'dotenv'
import path from 'path'

// Load env before importing Supabase client (it reads env at module load).
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { dbQuery } from '../src/lib/supabase'

function usage() {
    console.log('Usage: npx ts-node -P tsconfig.scripts.json --transpile-only execution/inspect_product_reference.ts --id <uuid>')
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
    const id = get('id')
    if (!id) {
        usage()
        process.exit(1)
    }

    const checks = [
        {
            table: 'public.product_references',
            sql: `
                SELECT
                    id,
                    family_code,
                    reference_code,
                    designation,
                    line,
                    special_label,
                    product_name,
                    commercial_measure,
                    (ref_attrs->>'accessory_text') as accessory_text,
                    isometric_asset_id,
                    isometric_path
                FROM public.product_references
                WHERE id = $1
            `,
        },
        {
            table: 'public.product_versions',
            sql: `
                SELECT id, reference_id, version_code, sku_base, version_attrs
                FROM public.product_versions
                WHERE id = $1
            `,
        },
        {
            table: 'public.product_skus',
            sql: `
                SELECT id, version_id, sku_complete, status
                FROM public.product_skus
                WHERE id = $1
            `,
        },
        {
            table: 'public.assets',
            sql: `
                SELECT id, name, type, file_path, created_at
                FROM public.assets
                WHERE id = $1
            `,
        },
    ]

    for (const c of checks) {
        const rows = await dbQuery(c.sql, [id])
        if (rows?.length) {
            console.log({ table: c.table, row: rows[0] })
            return
        }
    }

    console.log(null)
}

main().catch(e => {
    console.error('FATAL:', e?.message || e)
    process.exit(1)
})
