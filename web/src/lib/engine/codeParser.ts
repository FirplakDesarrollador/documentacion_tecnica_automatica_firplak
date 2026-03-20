import { dbQuery } from '@/lib/supabase'

export interface ParsedCodeResult {
    familia_code: string | null
    ref_code: string | null
    version_code: string | null
    color_code: string | null
    rh_flag: boolean
    product_type: string | null
    use_destination: string | null
    zone_home: string | null
    assembled_flag: boolean
    sku_base: string | null
}

export async function parseProductCode(
    code: string,
    sapDescription?: string | null,
    manualRhFlag?: boolean
): Promise<ParsedCodeResult> {
    const result: ParsedCodeResult = {
        familia_code: null,
        ref_code: null,
        version_code: null,
        color_code: null,
        rh_flag: Boolean(manualRhFlag),
        product_type: null,
        use_destination: null,
        zone_home: null,
        assembled_flag: false,
        sku_base: null,
    }

    if (!code) return result

    const parts = code.split('-')
    if (parts.length >= 4) {
        result.familia_code = parts[0]
        result.ref_code = parts[1]
        result.version_code = parts[2]
        result.color_code = parts[3]
        result.sku_base = parts.slice(0, 3).join('-')

        let lookupFamilia = result.familia_code
        if (lookupFamilia.toUpperCase().startsWith('V')) {
            lookupFamilia = lookupFamilia.substring(1)
        }

        try {
            const rows = await dbQuery(
                `SELECT code, product_type, use_destination, zone_home, assembled_default, rh_default FROM public.familias WHERE code = '${lookupFamilia.replace(/'/g, "''")}' LIMIT 1`
            )
            if (rows && rows.length > 0) {
                const familia = rows[0]
                result.product_type = familia.product_type
                result.use_destination = familia.use_destination
                result.zone_home = familia.zone_home
                result.assembled_flag = familia.assembled_default
                if (familia.rh_default) result.rh_flag = true
            }
        } catch (e) {
            console.error('codeParser: error querying familia', e)
        }

        if (result.version_code?.toUpperCase() === 'MRH') {
            result.rh_flag = true
        }
    } else {
        result.familia_code = code
    }

    if (sapDescription && sapDescription.toUpperCase().includes('RH')) {
        result.rh_flag = true
    }

    return result
}
