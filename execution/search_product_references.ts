import * as dotenv from 'dotenv'
import path from 'path'

// Load env before importing Supabase client (it reads env at module load).
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { dbQuery } from '../src/lib/supabase'

function usage() {
    console.log(`
Usage:
  npx ts-node -P tsconfig.scripts.json --transpile-only execution/search_product_references.ts --q "<text>" [--measure "48X43"] [--designation "ELEVADO"]
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
    const q = (get('q') || '').trim()
    if (!q) {
        usage()
        process.exit(1)
    }
    const measure = (get('measure') || '').trim().toUpperCase()
    const designation = (get('designation') || '').trim().toUpperCase()

    const qSafe = q.replace(/'/g, "''")
    const where: string[] = []
    where.push(`(
        product_name ILIKE '%${qSafe}%'
        OR designation ILIKE '%${qSafe}%'
        OR line ILIKE '%${qSafe}%'
        OR special_label ILIKE '%${qSafe}%'
        OR family_code ILIKE '%${qSafe}%'
        OR reference_code ILIKE '%${qSafe}%'
    )`)

    if (measure) {
        where.push(`commercial_measure = '${measure.replace(/'/g, "''")}'`)
    }
    if (designation) {
        where.push(`designation = '${designation.replace(/'/g, "''")}'`)
    }

    const rows = await dbQuery(
        `
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
        WHERE ${where.join(' AND ')}
        ORDER BY family_code, reference_code
        LIMIT 50
        `
    )

    console.table(rows || [])
}

main().catch(e => {
    console.error('FATAL:', e?.message || e)
    process.exit(1)
})
