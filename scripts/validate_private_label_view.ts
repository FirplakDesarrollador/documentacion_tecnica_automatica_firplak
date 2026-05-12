import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { dbQuery } from '../src/lib/supabase'

const PRIVATE_VERSIONS = ['MDT', 'FMT', 'PRO', 'SCH', 'CHT', 'DAC']

async function main() {
    console.log('=== VALIDATION: v_ui_generate_list private label columns ===\n')

    for (const v of PRIVATE_VERSIONS) {
        const rows = await dbQuery(
            `SELECT sku_complete, version_code, private_label_client_name, effective_version_attrs
             FROM public.v_ui_generate_list
             WHERE version_code = '${v}'
             ORDER BY sku_complete ASC
             LIMIT 3`
        )
        console.log(`--- ${v} (max 3) ---`)
        console.table(rows.map((r: any) => ({
            ...r,
            private_label_flag: r.private_label_client_name !== null && String(r.private_label_client_name || '').trim() !== ''
        })))
    }

    const nonPrivate = await dbQuery(
        `SELECT sku_complete, version_code, private_label_client_name, effective_version_attrs
         FROM public.v_ui_generate_list
         WHERE version_code = '000'
         ORDER BY sku_complete ASC
         LIMIT 3`
    )
    console.log('--- 000 (non-private sample, max 3) ---')
    console.table(nonPrivate.map((r: any) => ({
        ...r,
        private_label_flag: r.private_label_client_name !== null && String(r.private_label_client_name || '').trim() !== ''
    })))

    console.log('\n=== VALIDATION DONE ===')
}

main().catch(e => {
    console.error('FATAL:', e?.message || e)
    process.exit(1)
})
