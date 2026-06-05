'use server'

import { assertPermission } from '@/utils/auth/access'
import { composeProductsByFilters, type ProductFilters } from '@/lib/engine/product_composer'
import { dbQuery, supabaseServer } from '@/lib/supabase'

export async function getFilteredProducts(
    search: string | null,
    page: number = 1,
    pageSize: number = 500
) {
    await assertPermission('action:print')

    const filters: ProductFilters = {}
    if (search) filters.search = search

    const result = await composeProductsByFilters(filters, pageSize, (page - 1) * pageSize)
    return result
}

export async function resolvePrintAssetsAction(assetIds: string[]) {
    await assertPermission('action:print')

    const map: Record<string, string> = {}
    const systemNames = [
        'Logo Firplak general',
        'Icono RH Fijo',
        'Icono Canto',
        'Icono Canto 1.5mm',
        'Icono CARB2',
        'Icono Cierre Lento',
        'Icono Extensión Total',
    ]

    const { data: sysAssets, error: sysError } = await supabaseServer
        .from('assets')
        .select('name, file_path')
        .in('name', systemNames)

    if (sysError) {
        console.error('Error fetching system assets for print:', sysError)
    }

    if (sysAssets) {
        (sysAssets as { name: string | null; file_path: string | null }[]).forEach((asset) => {
            if (!asset.name) return

            map[asset.name] = asset.file_path || ''
            if (asset.name === 'Logo Firplak general') map.logo_empresa = asset.file_path || ''
            if (asset.name === 'Icono RH Fijo') map.sys_icon_rh = asset.file_path || ''
            if (asset.name === 'Icono Canto') map.sys_icon_canto = asset.file_path || ''
            if (asset.name === 'Icono Canto 1.5mm') map.sys_icon_edge_1_5mm = asset.file_path || ''
            if (asset.name === 'Icono CARB2') map.sys_icon_carb2 = asset.file_path || ''
            if (asset.name === 'Icono Cierre Lento') map.sys_icon_soft_close = asset.file_path || ''
            if (asset.name === 'Icono Extensión Total') map.sys_icon_full_extension = asset.file_path || ''
        })
    }

    if (!assetIds || assetIds.length === 0) return map

    const uniqueIds = Array.from(new Set(assetIds)).filter((id) => id && id.length > 30)
    if (uniqueIds.length === 0) return map

    const { data: customAssets, error: customError } = await supabaseServer
        .from('assets')
        .select('id, file_path')
        .in('id', uniqueIds)

    if (customError) {
        console.error('Error fetching custom assets for print:', customError)
    }

    if (customAssets) {
        (customAssets as { id: string; file_path: string | null }[]).forEach((asset) => {
            map[asset.id] = asset.file_path || ''
        })
    }

    return map
}

export async function resolveZoneHomeEnForPrintAction(zoneEs: string | null | undefined): Promise<string | null> {
    await assertPermission('action:print')

    if (!zoneEs) return null

    const key = zoneEs.trim().toUpperCase()
    try {
        const rows = await dbQuery(
            `SELECT term_en FROM public.glossary 
             WHERE term_es = '${key.replace(/'/g, "''")}' 
               AND active = true 
             LIMIT 1`
        )
        return rows && rows.length > 0 ? (rows[0].term_en as string) : null
    } catch {
        return null
    }
}
