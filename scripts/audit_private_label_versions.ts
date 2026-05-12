import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { dbQuery } from '../src/lib/supabase'

type VersionCode = 'MDT' | 'FMT' | 'PRO' | 'SCH' | 'CHT' | 'DAC'

const VERSION_CODES: VersionCode[] = ['MDT', 'FMT', 'PRO', 'SCH', 'CHT', 'DAC']

async function main() {
    console.log('=== AUDIT: Private label by version (read-only) ===\n')

    const codesSql = VERSION_CODES.map(c => `'${c}'`).join(',')

    console.log('1) global_version_rules rows')
    const gvr = await dbQuery(
        `SELECT version_code, version_description, status, product_types, automatic_version_rules, created_at, updated_at
         FROM public.global_version_rules
         WHERE version_code IN (${codesSql})
         ORDER BY version_code ASC`
    )
    console.table(gvr)

    console.log('\n2) product_versions emptiness (version_attrs)')
    const pvAgg = await dbQuery(
        `SELECT version_code,
                count(*)::int as total_versions,
                sum(CASE WHEN version_attrs IS NULL OR version_attrs = '{}'::jsonb THEN 1 ELSE 0 END)::int as empty_or_null_attrs
         FROM public.product_versions
         WHERE version_code IN (${codesSql})
         GROUP BY version_code
         ORDER BY version_code ASC`
    )
    console.table(pvAgg)

    console.log('\n3) sample SKUs per version (joins)')
    for (const code of VERSION_CODES) {
        const rows = await dbQuery(
            `SELECT
                s.sku_complete,
                v.version_code,
                v.version_attrs,
                v.final_base_name_es,
                v.final_base_name_en,
                gvr.automatic_version_rules
             FROM public.product_skus s
             JOIN public.product_versions v ON s.version_id = v.id
             LEFT JOIN public.global_version_rules gvr ON v.version_code = gvr.version_code
             WHERE v.version_code = '${code}'
             ORDER BY s.sku_complete ASC
             LIMIT 3`
        )
        console.log(`\n--- ${code} (max 3) ---`)
        console.table(rows)
    }

    console.log('\n4) legacy cabinet_products mapping evidence (only mentioned clients)')
    const legacy = await dbQuery(
        `SELECT
            upper(trim(private_label_client_name)) as private_label_client_name,
            version_code,
            count(*)::int as total
         FROM public.cabinet_products
         WHERE upper(trim(private_label_client_name)) IN ('CHILEMAT','D-ACQUA','FERMETAL','PROMART','SODIMAC CHILE','MEDITERRANEO')
         GROUP BY 1,2
         ORDER BY 1,3 DESC`
    )
    console.table(legacy)

    console.log('\n=== AUDIT DONE ===')
}

main().catch(e => {
    console.error('FATAL:', e?.message || e)
    process.exit(1)
})

