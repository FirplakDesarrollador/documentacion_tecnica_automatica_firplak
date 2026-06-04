import { dbQuery } from '@/lib/supabase'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { unstable_noStore as noStore } from 'next/cache'

export type MissingIsometricRow = {
    id: string
    code: string
    final_name_es: string | null
    family_code: string | null
    reference_code: string | null
    version_code: string | null
    designation: string | null
    product_name: string | null
    commercial_measure: string | null
}

function buildMissingIsometricWhere() {
    // NOTE: We consider the "effective" isometric as:
    // - version override (effective_version_attrs) OR
    // - reference base (product_references.isometric_*)
    //
    // If neither exist, the product is considered missing isometric.
    return `
        (status IS NULL OR status <> 'INACTIVO')
        AND (ref_status IS NULL OR ref_status <> 'INACTIVO')
        AND COALESCE(effective_version_attrs->>'isometric_path','') = ''
        AND COALESCE(effective_version_attrs->>'isometric_asset_id','') = ''
        AND (isometric_path IS NULL OR isometric_path = '')
        AND isometric_asset_id IS NULL
    `
}

export async function getMissingIsometricCount(): Promise<number> {
    noStore()
    const where = buildMissingIsometricWhere()
     
    const rows: any[] = await dbQuery(`
        SELECT COUNT(*)::int AS missing_isometric_count
        FROM public.v_ui_generate_list
        WHERE ${where}
    `) as any[]
    return Number(rows?.[0]?.missing_isometric_count || 0)
}

export async function getMissingIsometricList(limit: number = 500): Promise<MissingIsometricRow[]> {
    noStore()
    const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 500))
    const where = buildMissingIsometricWhere()
    const rows = (await dbQuery(`
        SELECT
            id,
            sku_complete as code,
            final_complete_name_es as final_name_es,
            family_code,
            reference_code,
            version_code,
            designation,
            product_name,
            commercial_measure
        FROM public.v_ui_generate_list
        WHERE ${where}
        ORDER BY sku_complete ASC
        LIMIT ${safeLimit}
    `)) as MissingIsometricRow[]
    return Array.isArray(rows) ? rows : []
}
